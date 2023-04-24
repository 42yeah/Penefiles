import { API } from "./config.js";

// 
// The Penefiles state machine.
// Can be saved & reloaded.
// All things are kept inside - web page content, login sessions, files,
// Tags, etc.
//
export class Penefiles {
    constructor() {
        this.loggedIn = false;

        // Element finders
        this.fileListEl = document.querySelector(".file-list");
        this.infoPaneEl = document.querySelector(".info-pane");
        this.superPositionInfoWindowEl = document.querySelector(".superposition-info-window");
        this.superPositionFileQueueWindowEl = document.querySelector(".superposition-file-queue-window");
        this.loginTopControlEl = document.querySelector("#login-top-control");
        this.registerTopControlEl = document.querySelector("#register-top-control");
        this.infoTopControlEl = document.querySelector("#info-top-control");
        this.uploadFileEl = document.querySelector("#upload-file");
        this.downloadURLEl = document.querySelector("#download-url");
        this.quickSearchEl = document.querySelector("#quick-search");
        this.progressBarEl = document.querySelector(".progress-bar");
        this.progressBlockEl = document.querySelector(".progress-block");
        this.currentUploadEntryEl = document.querySelector("#current-upload-entry");
        this.currentUploadEntryProgressEl = document.querySelector("#current-upload-entry-progress");
        this.uploadEntryRestEl = document.querySelector(".upload-entry-rest");
        this.sortByDateEl = document.querySelector("#sort-by-date");
        this.sortByNameEl = document.querySelector("#sort-by-name");
        this.onlyShowMineEl = document.querySelector("#only-show-mine");
    
        this.fileListEl.onscroll = (e) => {
            this.fileListScrollTop = this.fileListEl.scrollTop;
        }

        // Variables
        this.session = null;
        this.username = "";
        this.superPositionInfoWindowShown = false;
        this.lastSelectedID = -1;
        this.multiSelect = [];
        this.fileListScrollTop = 0;
        this.upload = null;
        this.uploadQueue = [];
        this.presentedFiles = [];
        this.sortByDate = 0;
        this.sortByName = 0;
        this.onlyShowMine = 0;
        this.pdfTask = null;

        // Data
        this.files = [];
        this.tags = [];
        this.filesTags = [];
        this.users = [];

        // SQL database
        if (!this.loadDatabase()) {
            this.createDb();
        }
        
        this.loadVariables();
        this.updateTopOperations();
    }

    dumpVariables() {
        localStorage.setItem("penefiles", JSON.stringify({
            session: this.session,
            username: this.username,
            superPositionInfoWindowShown: this.superPositionInfoWindowShown,
            fileListScrollTop: this.fileListScrollTop,
            sortByName: this.sortByName,
            sortByDate: this.sortByDate,
            onlyShowMine: this.onlyShowMine
        }));
    }

    dumpDatabase() {
        const u8 = this.db.export();
        
        let ret = "";
        for (let i = 0; i < u8.length; i++) {
            ret += String.fromCharCode(u8[i]);
        }
        localStorage.setItem("db", ret);

        this.loadDatabase();
    }

    loadDatabase() {
        let begin = new Date();

        let str = localStorage.getItem("db");
        if (!str) {
            return false;
        }
        try {
            let u8 = new Uint8Array(str.length);
            for (let i = 0; i < u8.length; i++) {
                u8[i] = str.charCodeAt(i);
            }
            this.db = new SQL.Database(u8);

            let end = new Date();
            this.generateQueries();

            console.log("database load profile: ", (end - begin) / 1000.0, "s");
            return true;
        } catch (e) {
            this.message("错误：无法加载数据库。", "本地的数据库可能已经被污染。请等待从服务器拉取最新的数据库。");
            return false;
        }
    }

    cachedOrDefault(dict, key, defa) {
        if (!(key in dict)) {
            return defa;
        }
        return dict[key];
    }

    loadVariables() {
        let cached = localStorage.getItem("penefiles");
        if (!cached || cached == "") {
            return;
        }
        cached = JSON.parse(cached);
        this.session = this.cachedOrDefault(cached, "session", null);
        this.username = this.cachedOrDefault(cached, "username", null);
        this.sortByName = this.cachedOrDefault(cached, "sortByName", 0);
        this.sortByDate = this.cachedOrDefault(cached, "sortByDate", 0);
        this.onlyShowMine = this.cachedOrDefault(cached, "onlyShowMine", 0);

        // TODO: update file list content.
    }

    // 
    // Initialize database with associated operations.
    //
    createDb() {
        this.db = new SQL.Database();
        
        let dbExec = `CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT UNIQUE, tags TEXT);
            CREATE TABLE files_tags (fileid INTEGER, tag TEXT, UNIQUE(fileid, tag));
            CREATE TABLE files (id INTEGER PRIMARY KEY AUTOINCREMENT, filename TEXT, realfile TEXT UNIQUE, created_at DEFAULT CURRENT_TIMESTAMP, modified_at DEFAULT CURRENT_TIMESTAMP, size INTEGER);`;
        this.db.run(dbExec);
        this.generateQueries();
    }

    generateQueries() {
        this.queries = {
            createFile: this.db.prepare("INSERT INTO files (id, filename, realfile, created_at, modified_at, size) VALUES (:id, :filename, :realfile, :created_at, :modified_at, :size);"),
            listFiles: this.db.prepare("SELECT * FROM files;"),
            subQueries: {},
            updateFile: this.db.prepare("UPDATE files SET filename=:filename WHERE id=:id;"),
            deleteFile: this.db.prepare("DELETE FROM files WHERE id=:id;"),
            cleanupFileTags: this.db.prepare("DELETE FROM files_tags WHERE fileid=:id;"),
            bindTagToFile: this.db.prepare("INSERT INTO files_tags (fileid, tag) VALUES (:fileid, :tag);"),
            unbindTagFromFile: this.db.prepare("DELETE FROM files_tags WHERE fileid=:fileid AND tag=:tag;"),
            listTags: this.db.prepare("SELECT DISTINCT tag FROM files_tags;"),
            listFilesTags: this.db.prepare("SELECT * FROM files_tags;"),
            createUser: this.db.prepare("INSERT INTO users (id, username, tags) VALUES (:id, :username, :tags);"),
            deleteUser: this.db.prepare("DELETE FROM users WHERE username=:username;"),
            updateUser: this.db.prepare("UPDATE users SET tags=:tags WHERE username=:username;"),
            getAllUsers: this.db.prepare("SELECT * FROM users;"),
            fileHasTag: this.db.prepare("SELECT * FROM files_tags WHERE fileid=:id AND tag=:tag"),
            findFileById: this.db.prepare("SELECT * FROM files WHERE id=:id"),
            findUserTagOfFile: this.db.prepare("SELECT * FROM users INNER JOIN files_tags WHERE username=tag AND fileid=:id;"),
            findTagsOfFile: this.db.prepare("SELECT * FROM files_tags WHERE fileid=:id;"),
            findFileWithTags: this.db.prepare("SELECT * FROM files INNER JOIN files_tags WHERE id=fileid AND (tag LIKE :query OR filename LIKE :query);"),
            findFileWithTagsSubQueries: {},
            getFileFromRealfile: this.db.prepare("SELECT * FROM files WHERE realfile=:realfile"),
            deleteAllFiles: this.db.prepare("DELETE FROM files;"),
            deleteAllUsers: this.db.prepare("DELETE FROM users;"),
            deleteAllFilesTags: this.db.prepare("DELETE FROM files_tags;")
        };

        // generate subqueries
        for (let sortByDate = 0; sortByDate < 3; sortByDate++) {
            for (let sortByName = 0; sortByName < 3; sortByName++) {
                for (let onlyShowMine = 0; onlyShowMine < 2; onlyShowMine++) {
                    if (sortByDate == 0 && sortByName == 0) {
                        let s = "SELECT * FROM files;";
                        let ss = "SELECT * FROM files INNER JOIN files_tags WHERE id=fileid AND (tag LIKE :query OR filename LIKE :query)";
                        if (onlyShowMine == 1) {
                            s = "SELECT * FROM files INNER JOIN files_tags WHERE id=fileid AND tag=:user;";
                        }
                        this.queries.subQueries[sortByDate * 100 + sortByName * 10 + onlyShowMine] = this.db.prepare(s);
                        this.queries.findFileWithTagsSubQueries[sortByDate * 100 + sortByName * 10 + onlyShowMine] = this.db.prepare(ss);
                        continue;
                    }

                    let s = "SELECT * FROM files ORDER BY ";
                    let ss = "SELECT * FROM files INNER JOIN files_tags WHERE id=fileid AND (tag LIKE :query OR filename LIKE :query) ORDER BY ";
                    if (onlyShowMine == 1) {
                        s = "SELECT * FROM files INNER JOIN files_tags WHERE id=fileid AND tag=:user ORDER BY ";
                    }
                    
                    if (sortByDate == 1) {
                        s += "modified_at DESC ";
                        ss += "modified_at DESC ";
                    } else if (sortByDate == 2) {
                        s += "modified_at ASC ";
                        ss += "modified_at ASC ";
                    }
                    if (sortByDate != 0 && sortByName != 0) {
                        s += ", ";
                        ss += ", ";
                    }
                    if (sortByName == 1) {
                        s += "filename ASC ";
                        ss += "filename ASC ";
                    } else if (sortByName == 2) {
                        s += "filename DESC ";
                        ss += "filename DESC ";
                    }
                    s += ";";
                    ss += ";";
                    this.queries.subQueries[sortByDate * 100 + sortByName * 10 + onlyShowMine] = this.db.prepare(s);
                    this.queries.findFileWithTagsSubQueries[sortByDate * 100 + sortByName * 10 + onlyShowMine] = this.db.prepare(ss);
                }
            }
        }
    }

    //
    // Update database based on files, filesTags, and users, 
    // The three major databases.
    //
    updateDb() {
        sql(this.queries.deleteAllFiles, {}, true);
        sql(this.queries.deleteAllUsers, {}, true);
        sql(this.queries.deleteAllFilesTags, {}, true);

        for (const f of this.files) {
            const dict = {
                ":id": f.id,
                ":filename": f.filename,
                ":realfile": f.realfile,
                ":created_at": f.created_at,
                ":modified_at": f.modified_at,
                ":size": f.size
            };
            this.queries.createFile.run(dict);
        }
        for (const u of this.users) {
            const dict = {
                ":id": u.id,
                ":username": u.username,
                ":tags": u.tags
            };
            this.queries.createUser.run(dict);
        }
        for (const ft of this.filesTags) {
            const dict = {
                ":fileid": ft.fileid,
                ":tag": ft.tag
            };
            this.queries.bindTagToFile.run(dict);
        }
    }

    setFileListContent(what) {
        this.fileListEl.innerHTML = what;
        this.fileListEl.scrollTop = this.fileListScrollTop;
    }

    setInfoPaneContent(what) {
        this.infoPaneEl.innerHTML = what;
    }

    setSuperpositionInfoWindowContent(what) {
        this.superPositionInfoWindowEl.innerHTML = what;
    }

    updateTopOperations() {
        
        if (this.session == null) {
            this.loginTopControlEl.classList.remove("hidden");
            this.registerTopControlEl.classList.remove("hidden");
            this.infoTopControlEl.classList.add("hidden");
            this.onlyShowMineEl.parentElement.classList.add("hidden");
        } else {
            this.loginTopControlEl.classList.add("hidden");
            this.registerTopControlEl.classList.add("hidden");
            this.infoTopControlEl.classList.remove("hidden");
            this.onlyShowMineEl.parentElement.classList.remove("hidden");
        }
        switch (this.sortByDate) {
            case 0:
                this.sortByDateEl.innerHTML = "无日期排序";
                this.sortByDateEl.parentElement.classList.add("inactive");
                this.sortByDateEl.previousElementSibling.classList.remove("invert");
                break;

            case 1:
                this.sortByDateEl.innerHTML = "日期倒序";
                this.sortByDateEl.parentElement.classList.remove("inactive");
                this.sortByDateEl.previousElementSibling.classList.add("invert");
                break;

            case 2:
                this.sortByDateEl.innerHTML = "日期正序";
                this.sortByDateEl.parentElement.classList.remove("inactive");
                this.sortByDateEl.previousElementSibling.classList.remove("invert");
                break;
        }
        switch (this.sortByName) {
            case 0:
                this.sortByNameEl.innerHTML = "无文件名排序";
                this.sortByNameEl.parentElement.classList.add("inactive");
                this.sortByNameEl.previousElementSibling.classList.remove("invert");
                break;

            case 1:
                this.sortByNameEl.innerHTML = "文件名正序";
                this.sortByNameEl.parentElement.classList.remove("inactive");
                this.sortByNameEl.previousElementSibling.classList.remove("invert");
                break;

            case 2:
                this.sortByNameEl.innerHTML = "文件名倒序";
                this.sortByNameEl.parentElement.classList.remove("inactive");
                this.sortByNameEl.previousElementSibling.classList.add("invert");
                break;
        }

        switch (this.onlyShowMine) {
            case 0:
                this.onlyShowMineEl.innerHTML = "显示所有人的";
                this.onlyShowMineEl.parentElement.classList.add("inactive");
                break;

            case 1:
                this.onlyShowMineEl.innerHTML = "只显示我的";
                this.onlyShowMineEl.parentElement.classList.remove("inactive");
                break;
        }
    }

    uploadNextFile() {
        if (this.uploadQueue.length == 0) {
            return;
        }
        const entry = this.uploadQueue[0];
        this.uploadQueue.splice(0, 1);

        return new Promise((resolve, reject) => {

            const ajax = new XMLHttpRequest();
            ajax.upload.addEventListener("progress", (e) => {
                let percentage = Math.round((e.loaded / e.total) * 10000.0) / 100.0;
                this.progressBlockEl.style.width = percentage + "%";
                this.currentUploadEntryProgressEl.style.width = percentage + "%";
            }, false);
            ajax.addEventListener("load", (e) => {
                let json = {};
                this.ajax = null;
                try {
                    json = JSON.parse(e.target.responseText);
                } catch (e) {
                    if (e.target.responseText) {
                        let lines = e.target.responseText.split("\n");
                        reject(lines[3].split("=")[1]);
                        return;
                    } else {
                        reject("由于某些未知的原因，文件上传失败了。");
                        return;
                    }
                }
                if (json.status != 200) {
                    reject(json.message);
                    return;
                }
                this.doRefresh().then(() => {
                    // If it's not hidden, list file
                    if (!this.superPositionFileQueueWindowEl.classList.contains("hidden")) {
                        const f = sql(this.queries.getFileFromRealfile, { ":realfile": json.message }, true);
                        if (f.length == 0) {
                            this.message("错误：文件已经上传，但是无法找到。", "这是一个不应该发生的问题，请联系我。");
                            return;
                        }
                        this.fileInfo(f[0].id);
                    }
                });
                resolve();
            }, false);
            ajax.addEventListener("error", (e) => {
                reject(e.toString());
                this.ajax = null;
            });
            ajax.addEventListener("abort", (e) => {
                reject("你已经终止文件上传。");
                this.ajax = null;
            });
            ajax.open("POST", `${API}/files/upload`);
            ajax.send(entry.data);
            this.upload = ajax;
        });


    }

    uploadAllFiles() {
        if (this.uploadQueue.length == 0) {
            this.superPositionFileQueueWindowEl.classList.add("hidden");
            return;
        }
        const thisFile = this.uploadQueue[0];
        this.currentUploadEntryEl.innerHTML = thisFile.name;
        this.currentUploadEntryProgressEl.innerHTML = thisFile.name;
        this.currentUploadEntryProgressEl.style.width = "0";

        // List queue 
        let queue = "";
        for (let i = 1; i < this.uploadQueue.length; i++) {
            queue += `<div class="upload-entry">${this.uploadQueue[i].name}</div>`;
        }
        this.uploadEntryRestEl.innerHTML = queue;

        this.uploadNextFile().then(() => {
            this.uploadAllFiles();
        }).catch(e => {
            this.message(`错误：文件 ${thisFile.name} 无法上传。`, e.toString());
            this.uploadAllFiles();
        });
    }

    doShare() {
        if (this.lastSelectedID < 0) {
            return;
        }
        const f = sql(this.queries.findFileById, { ":id": this.lastSelectedID }, true);
        if (f.length == 0) {
            this.message("错误：无法分享该文件。", "该文件已经不存在于数据库中。你也许需要刷新。");
            return;
        }
        if ("share" in navigator) {
            navigator.share({
                title: `${f[0].filename} | PENEfiles`,
                text: `${this.username} 正在使用 PENEfiles 和你分享 ${f[0].filename}。`,
                url: `${API}/${f[0].realfile}/${f[0].filename}`
            });
        } else {
            this.fileUrlEl.select();
            this.fileUrlEl.setSelectionRange(0, this.fileUrlEl.value.length + 1);
            navigator.clipboard.writeText(this.fileUrlEl.value);
            this.message("链接已经复制到你的剪贴板。", "由于你的浏览器不支持分享功能，链接已经复制到了你的剪贴板中。");
        }
    }

    doUpload() {
        if (this.uploadFileEl.length == 0) {
            return;
        }
        if (this.session == null) {
            this.message("请先登陆。", `你必须要先 <div onclick="session.login()" class="control-button controls with-icon inline-control-button">
                <img src="assets/key.svg" class="icon-controls">
                <div>登陆</div>
            </div> 才能上传文件。`);
            return;
        }
        if (this.uploadFileEl.files.length == 0) {
            return;
        }

        fetch(`${API}/auth/preflight`, {
            method: "POST",
            body: JSON.stringify({
                session: this.session
            })
        }).then(res => {
            return res.json();
        }).then(json => {
            if (json.status == 200) {
                return true;
            }
            this.session = null;
            this.updateTopOperations();
            this.dumpVariables();
            throw `你的登陆凭证已经超时。请重新 <div onclick="session.login()" class="control-button controls with-icon inline-control-button">
                    <img src="assets/key.svg" class="icon-controls">
                    <div>登陆</div>
                </div> 。`;
        }).then(() => {
            for (const f of this.uploadFileEl.files) {
                let data = new FormData();
                data.append("session", this.session);
                data.append("file", f);

                this.uploadQueue.push({
                    data,
                    name: f.name
                });
            }
            this.superPositionFileQueueWindowEl.classList.remove("hidden");
            this.uploadAllFiles();
        }).catch(e => {
            this.message("错误：文件上传失败。", e.toString());
        });
        
        // (json => {
        //     if (json.status != 200) {
        //         this.message("错误：文件上传失败。", json.message);    
        //     } else {
        //         this.doRefresh().then(() => {
        //             const f = sql(this.queries.getFileFromRealfile, { ":realfile": json.message }, true);
        //             if (f.length == 0) {
        //                 this.message("错误：文件已经上传，但是无法找到。", "这是一个不应该发生的问题，请联系我。");
        //                 return;
        //             }
        //             this.fileInfo(f[0].id);
        //         });
        //     }
        // })

    }

    doDrop(e) {
        this.fileListEl.classList.remove("drag-active");
        let files = e.dataTransfer.files;
        this.uploadFileEl.files = files;
        this.doUpload();
        return false;
    }

    doUpdate() {
        const f = sql(this.queries.findFileById, {
            ":id": this.lastSelectedID
        }, true);
        if (f.length == 0) {
            this.message("错误：无法找到要修改的文件。", "PENEfiles 状态机估计出了某些问题。");
            return;
        }
        const req = {
            session: this.session,
            filename: this.fileNameInputEl.value,
            realfile: f[0].realfile.split("/")[1],
            tags: []
        };
        let tagsInputValue = this.tagsInputEl.value.trim();
        let tags = tagsInputValue.split(" ");
        for (const t of tags) {
            let tr = t.trim();
            if (tr == "") {
                continue;
            }
            req.tags.push(tr);
        }
        
        this.updateOne(req).then(() => {
            setTimeout(() => {
                this.doRefresh();
            }, 100);
        }).catch(e => {
            this.message("错误：无法修改文件。", e.toString());
        });
    }

    doDelete(refresh = true) {
        const f = sql(this.queries.findFileById, {
            ":id": this.lastSelectedID
        }, true);
        if (f.length == 0) {
            this.message("错误：无法找到要删除的文件。", "PENEfiles 状态机估计出了某些问题。");
            return;
        }
        return fetch(`${API}/files/delete`, {
            method: "POST",
            body: JSON.stringify({
                realfile: f[0].realfile.split("/")[1],
                filename: f[0].filename,
                session: this.session
            })
        }).then(res => {
            return res.text();
        }).then(text => {
            let json = {};
            try {
                json = JSON.parse(text);
            } catch (e) {
                let lines = text.split("\n");
                this.message("错误：文件删除失败。", lines[3].split("=")[1]);
                return;
            }
            if (json.status != 200) {
                this.message("错误：文件删除失败。", json.message);
                return;
            }
            this.lastSelectedID = -1;
            if (refresh) {
                this.neutral();
                this.doRefresh();
                this.dumpVariables();
            }
        }).catch(e => {
            this.message("错误：文件删除失败。", e.toString());
        });
    }

    doAbortUpload() {
        if (this.upload != null) {
            this.upload.abort();
        }
    }

    doGlobalAbortUpload() {
        if (this.upload != null) {
            this.uploadQueue = [];
            this.upload.abort();
        }
    }

    doLogin() {
        const username = this.usernameEl.value;
        const password = this.passwordEl.value;
        this.username = username;

        let resp = null;
        fetch(`${API}/users/login`, {
            method: "POST",
            body: JSON.stringify({
                username: username,
                password: password
            })
        }).then(res => {
            resp = res;
            return res.text();
        }).then(text => {
            try {
                const json = JSON.parse(text);
                if (json.status == 200) {
                    this.message("登陆成功", "你已经成功登陆。");
                    this.session = json.message;
                    this.onlyShowMine = 1;
                    this.personalInfo();
                    this.doQuickSearch();
                    this.updateTopOperations();
                }
            } catch (e) {
                const lines = text.split("\n");
                this.message("错误：无法登陆", lines[3].split("=")[1]);
            }
            this.updateTopOperations();
            this.dumpVariables();
        }).catch(e => {
            this.message("错误：无法登陆", e.toString());
        });
    }

    doLogout() {
        this.message("登出成功", "你已成功退出登录。");
        this.session = null;
        this.onlyShowMine = false;
        this.updateTopOperations();
        this.dumpVariables();
        this.login();
        this.doQuickSearch();
    }

    doRegister() {
        const username = this.usernameEl.value;
        const password = this.passwordEl.value;

        let resp = null;
        fetch(`${API}/users/register`, {
            method: "POST",
            body: JSON.stringify({
                username: username,
                password: password,
                passwordAgain: this.passwordAgainEl.value,
                code: this.invitationEl.value
            })
        }).then(res => {
            resp = res;
            return res.text();
        }).then(text => {
            try {
                const json = JSON.parse(text);
                if (json.status == 200) {
                    this.message("注册成功", `请跳转至 
                    <div onclick="session.login()" class="control-button controls with-icon inline-control-button">
                        <img src="assets/key.svg" class="icon-controls">
                        <div>登陆</div>
                    </div> 页面登陆。`
                    );
                }
            } catch (e) {
                const lines = text.split("\n");
                this.message("错误：无法注册", lines[3].split("=")[1]);
            }
        }).catch(e => {
            this.message("错误：无法注册", e.toString());
        });
    }

    doQuickSearch() {
        // if (this.multiSelect.length > 0) {
        //     for (const f of this.multiSelect) {
        //         document.querySelector("#file-entry-" + f.id).classList.remove("selected");
        //     }
        //     this.multiSelect = [];
        //     this.lastSelectedID = -1;
        //     this.neutral();
        // }

        let begin = new Date();

        let query = this.quickSearchEl.value;
        if (query == "") {
            const files = sql(this.queries.subQueries[this.sortByDate * 100 + this.sortByName * 10 + this.onlyShowMine], {
                ":user": this.username
            }, false);
            this.presentedFiles = files;
            this.setFileListContent(getFileList(files));
            return;
        }
        query = query.replace("/", "");
        query = query.trim();
        let subQueries = query.split(" ");
        let aggregate = {};
        let weight = 1;
        if (this.onlyShowMine) {
            subQueries.push(`+${this.username}`);
        }

        for (let sub of subQueries) {
            let symbol = "";
            if (sub.startsWith("+") || sub.startsWith("-")) {
                symbol = sub[0];
                sub = sub.substr(1);
                if (sub.trim().length == 0) {
                    continue;
                }
            }
            const things = sql(this.queries.findFileWithTagsSubQueries[this.sortByDate * 100 + this.sortByName * 10 + this.onlyShowMine], {
                ":query": `%${sub}%`
            }, false);
            let loopDict = {};
            
            if (symbol == "") {
                for (const t of things) {
                    if (aggregate[t.id]) {
                        if (t.id in loopDict) {
                            continue;
                        }
                        aggregate[t.id].count += weight;
                        weight -= 0.001;
                        loopDict[t.id] = true;
                        continue;
                    }
                    aggregate[t.id] = t;
                    aggregate[t.id].count = weight;
                    loopDict[t.id] = true;
                    weight -= 0.001;
                }
            } else if (symbol == "+") {
                for (const k in aggregate) {
                    if (!things.find(t => {
                        return t.id == k;
                    })) {
                        delete aggregate[k];
                    }
                }
            } else if (symbol == "-") {
                for (const k in aggregate) {
                    if (things.find(t => {
                        return t.id == k;
                    })) {
                        delete aggregate[k];
                    }
                }
            }
            
            weight *= 0.5;
        }

        let arr = [];
        for (const t in aggregate) {
            arr.push(aggregate[t]);
        }
        arr = arr.sort((a, b) => {
            return b.count - a.count;
        });
        this.presentedFiles = arr;
        this.setFileListContent(getFileList(arr));

        let end = new Date();
        console.log("quick search profile: ", (end - begin) / 1000.0, "s");
    }

    // TODO TODO
    updateOne(req) {
        return fetch(`${API}/files/update`, {
            method: "POST",
            body: JSON.stringify(req)
        }).then(res => {
            return res.text();
        }).then(text => {
            let json = {};
            try {
                json = JSON.parse(text);
            } catch (e) {
                let lines = text.split("\n");
                throw lines[3].split("=")[1];
            }

            if (json.status != 200) {
                throw json.message;
            }

            return true;
        }).catch(e => {
            this.message("错误：文件修改失败。", e.toString());
        });
    }

    // TODO: private data.
    fetchAll() {

        return new Promise((resolve, reject) => {
            let allFour = 0;

            fetch(`${API}/files`, {
                method: "GET"
            }).then(res => {
                return res.json();
            }).then(json => {
                this.files = json["items"];
                allFour++;
                if (allFour == 4) {
                    this.dumpVariables();
                    resolve();
                }
            }).catch(e => {
                this.message("错误：无法拉取文件列表。", e.toString());
                reject(e);
            });
            fetch(`${API}/tags`, {
                method: "GET"
            }).then(res => {
                return res.json();
            }).then(json => {
                this.tags = json["items"];
                allFour++;
                if (allFour == 4) {
                    this.dumpVariables();
                    resolve();
                }
            }).catch(e => {
                this.message("错误：无法拉取标签列表。", e.toString());
                reject(e);
            });
            fetch(`${API}/users`, {
                method: "GET"
            }).then(res => {
                return res.json();
            }).then(json => {
                this.users = json["items"];
                allFour++;
                if (allFour == 4) {
                    this.dumpVariables();
                    resolve();
                }
            }).catch(e => {
                this.message("错误：无法拉取标签列表。", e.toString());
                reject(e);
            });
            fetch(`${API}/files-tags`, {
                method: "GET"
            }).then(res => {
                return res.json();
            }).then(json => {
                this.filesTags = json["items"];
                allFour++;
                if (allFour == 4) {
                    this.dumpVariables();
                    resolve();
                }
            }).catch(e => {
                this.message("错误：无法拉取文件标签列表。", e.toString());
                reject(e);
            });
        });
        
    }

    doRefresh() {
        return this.fetchAll().then(() => {
            this.updateDb();
            this.dumpDatabase();
            // this.setFileListContent(getFileList(sql(session.queries.listFiles, {}, false)));
            this.doQuickSearch();
        });
    }

    doMultiDelete() {
        let deleted = 0;
        const toDelete = this.multiSelect.length;
        for (let i = 0; i < this.multiSelect.length; i++) {
            this.lastSelectedID = this.multiSelect[i].id;

            this.doDelete(false).then(() => {
                deleted++;
                if (deleted == toDelete) {
                    this.doRefresh();
                    this.dumpVariables();
                }
            }).catch(e => {
                deleted++;
                if (deleted == toDelete) {
                    this.doRefresh();
                    this.dumpVariables();
                }
            });

            sql(this.queries.deleteFile, { ":id": this.multiSelect[i].id }, true);
        }
        this.neutral();
        this.doQuickSearch();
    }

    doMultiDownload() {
        for (let i = 0; i < this.multiSelect.length; i++) {
            const f = this.multiSelect[i];
            this.downloadURLEl.setAttribute("href", `${API}/${f.realfile}/${f.filename}`);
            this.downloadURLEl.click();
        }
    }

    doMultiUpdate() {
        let updated = 0;
        const toUpdate = this.multiSelect.length;

        const reqTags = [];
        let tagsInputValue = this.tagsInputEl.value.trim();
        let tags = tagsInputValue.split(" ");
        for (const t of tags) {
            let tr = t.trim();
            if (tr == "") {
                continue;
            }
            reqTags.push(tr);
        }

        for (let i = 0; i < toUpdate; i++) {
            const req = {
                session: this.session,
                filename: this.multiSelect[i].filename,
                realfile: this.multiSelect[i].realfile.split("/")[1],
                tags: reqTags
            };

            this.updateOne(req).catch(e => {
                this.message("错误：无法修改 " + this.multiSelect[i].filename + "。", e.toString());
            }).finally(() => {
                updated++;
                if (updated == toUpdate) {
                    this.doRefresh();
                }
            });
        }
    }

    testGet() {
        fetch(`${API}/`, {
            method: "GET",
        }).then(res => {
            return res.json();
        }).then(json => {
            console.log(json);
        });
    }

    testRegister() {
        fetch(`${API}/users/register`, {
            method: "POST",
            body: JSON.stringify({
                username: "dummy_account",
                password: "justadummy",
                passwordAgain: "justadummy",
                code: this.testInputEl.value
            })
        }).then(res => {
            return res.json();
        }).then(json => {
            console.log(json);
        });
    }

    testMakeCode() {
        fetch(`${API}/codes/make`, {
            method: "GET"
        }).then(res => {
            return res.json();
        }).then(json => {
            console.log(json);
            this.testInputEl.value = json.code;
        });
    }

    testLogin() {
        fetch(`${API}/users/login`, {
            method: "POST",
            body: JSON.stringify({
                username: "dummy_account",
                password: "justadummy"
            })
        }).then(res => {
            return res.json();
        }).then(json => {
            console.log(json);
            this.testInputEl.value = json.message;
        });
    }

    testBadLogin() {
        fetch(`${API}/users/login`, {
            method: "POST",
            body: JSON.stringify({
                username: "dummy_account",
                password: "bad"
            })
        }).then(res => {
            return res.json();
        }).then(json => {
            console.log(json);
        });
    }

    testUpload() {
        let data = new FormData();
        data.append("session", this.testInputEl.value);
        data.append("file", this.testFileEl.files[0]);
        fetch(`${API}/files/upload`, {
            method: "POST",
            body: data
        }).then(res => {
            return res.json();
        }).then(json => {
            console.log(json);
        });
    }

    testClearCached() {
        localStorage.setItem("penefiles", "");
        localStorage.setItem("db", "");
    }

    testPreflight() {
        let fakeSession = this.testInputEl.value;
        fetch(`${API}/auth/preflight`, {
            method: "POST",
            body: JSON.stringify({
                session: fakeSession
            })
        }).then(res => {
            return res.json();
        }).then(json => {
            console.log(json);
        });
    }

    testListAllDb() {
        this.queries.getAllUsers.bind();
        while (this.queries.getAllUsers.step()) {
            console.log(this.queries.getAllUsers.getAsObject());
        }
        this.queries.listFiles.bind({
            ":what": "modified_at"
        });
        while (this.queries.listFiles.step()) {
            console.log(this.queries.listFiles.getAsObject());
        }
        this.queries.listFilesTags.bind();
        while (this.queries.listFilesTags.step()) {
            console.log(this.queries.listFilesTags.getAsObject());
        }
    }

    // Arbitrary Query Execution.
    testAQE() {
        const stmt = this.db.prepare(this.testInputEl.value);
        while (stmt.step()) {
            console.log(stmt.getAsObject());
        }
        stmt.free();
    }

    async testStopServiceWorkers() {
        let workers = await navigator.serviceWorker.getRegistrations();
        for (const w of workers) {
            console.log("Unregistering", w);
            w.unregister();
        }
    }

    // UIs
    login() {
        this.setInfoPaneContent(loginPage);
        this.usernameEl = document.querySelector("#username");
        this.passwordEl = document.querySelector("#password");
        this.dumpVariables();
    }

    register() {
        this.setInfoPaneContent(registerPage);
        this.usernameEl = document.querySelector("#username");
        this.passwordEl = document.querySelector("#password");
        this.passwordAgainEl = document.querySelector("#password-again");
        this.invitationEl = document.querySelector("#invitation");
        this.dumpVariables();
    }

    tests() {
        this.setInfoPaneContent(testsPage);
        this.testInputEl = document.querySelector("#test-input");
        this.testFileEl = document.querySelector("#test-file");
        this.dumpVariables();
    }

    message(title, explanation) {
        this.superPositionInfoWindowShown = true;
        this.setSuperpositionInfoWindowContent(`
        <h2>${title}</h2>
        ${explanation}
        <div class="padding-top-5px"></div>
        <div onclick="session.closeMessage()" class="control-button controls with-icon control-button-row">
            <img src="assets/accept.svg" class="icon-controls">
            <div>好</div>
        </div>
        `);
        this.superPositionInfoWindowEl.classList.remove("hidden");
        this.dumpVariables();
    }

    personalInfo() {
        this.setInfoPaneContent(getUserInfo());
        this.dumpVariables();
    }

    closeMessage() {
        this.superPositionInfoWindowEl.classList.add("hidden");
        this.superPositionInfoWindowShown = false;
        this.dumpVariables();
    }

    neutral() {
        this.setInfoPaneContent(neutralPage);
        this.dumpVariables();
    }

    fileInfo(id, event) {
        const f = sql(this.queries.findFileById, { ":id": id }, true);

        let hasMultiSelect = this.multiSelect.length > 0;
        if (event && event.shiftKey && this.lastSelectedID > 0) {
            if (hasMultiSelect) {
                for (const f of this.multiSelect) {
                    const fileEl = document.querySelector("#file-entry-" + f.id);
                    if (fileEl) {
                        fileEl.classList.remove("selected");
                    }
                }
                this.multiSelect = [];
            }

            let begin = -1, end = -1;
            hasMultiSelect = true;
            
            for (let i = 0; i < this.presentedFiles.length && (begin == -1 || end == -1); i++) {
                if (this.presentedFiles[i].id == this.lastSelectedID) {
                    begin = i;
                }
                if (this.presentedFiles[i].id == id) {
                    end = i;
                }
            }
            if (begin != end) {
                if (end < begin) {
                    let swp = end;
                    end = begin;
                    begin = swp;
                }
                for (let i = begin; i <= end; i++) {
                    this.multiSelect.push(this.presentedFiles[i]);
                    document.querySelector("#file-entry-" + this.presentedFiles[i].id).classList.add("selected");
                }

                this.setInfoPaneContent(getMultiselect(this.multiSelect));
                this.tagsInputEl = document.querySelector("#tags-input");
                if (window.innerWidth > 645) {
                    this.tagsInputEl.focus();
                    this.tagsInputEl.selectionStart = this.tagsInputEl.value.length;
                    this.tagsInputEl.selectionEnd = this.tagsInputEl.value.length;
                }
                
                return;    
            } 
        } else if (event && (event.ctrlKey || event.metaKey) && this.lastSelectedID > 0) {
            if (!hasMultiSelect) {
                let first = -1, second = -1;

                if (this.lastSelectedID == id) {
                    this.lastSelectedID = -1;
                    this.multiSelect = [];
                    this.doQuickSearch();
                    this.neutral();
                    return;
                }

                for (let i = 0; i < this.presentedFiles.length && (first == -1 || second == -1); i++) {
                    if (this.presentedFiles[i].id == this.lastSelectedID) {
                        first = i;
                        document.querySelector("#file-entry-" + this.presentedFiles[i].id).classList.add("selected");
                    }
                    if (this.presentedFiles[i].id == id) {
                        second = i;
                        document.querySelector("#file-entry-" + this.presentedFiles[i].id).classList.add("selected");
                    }
                }
                this.multiSelect.push(this.presentedFiles[first]);
                this.multiSelect.push(this.presentedFiles[second]);
            } else {
                let removal = false;
                //
                // Is it already inside multiSelect?
                //
                for (let i = 0; i < this.multiSelect.length; i++) {
                    if (this.multiSelect[i].id == id) {
                        this.multiSelect.splice(i, 1);
                        removal = true;
                        document.querySelector("#file-entry-" + id).classList.remove("selected");
                        break;
                    }
                }
                if (!removal) {
                    for (let i = 0; i < this.presentedFiles.length; i++) {
                        if (this.presentedFiles[i].id == id) {
                            this.multiSelect.push(this.presentedFiles[i]);
                            document.querySelector("#file-entry-" + id).classList.add("selected");
                            break;
                        }
                    }
                }
            }
            if (this.multiSelect.length == 0) {
                this.neutral();
            } else {
                this.setInfoPaneContent(getMultiselect(this.multiSelect));
            }

            return;

        }

        if (hasMultiSelect) {
            for (const f of this.multiSelect) {
                const fileEl = document.querySelector("#file-entry-" + f.id);
                if (fileEl) {
                    fileEl.classList.remove("selected");
                }
            }
            this.multiSelect = [];
            this.lastSelectedID = -1;
        }

        if (f.length == 0) {
            this.message("错误：无法找到文件 " + id, "这个文件不存在于数据库中。可能是因为代码有漏洞或者数据库已经老了。尝试刷新，或者通知 42yeah.");
            this.lastSelectedID = -1;
            this.dumpVariables();
            return;
        }
        
        this.setInfoPaneContent(getFileInfo(f[0]));
        this.fileNameInputEl = document.querySelector("#file-name-input");
        this.tagsInputEl = document.querySelector("#tags-input");
        this.fileUrlEl = document.querySelector("#file-url");

        if (window.innerWidth > 645) {
            this.tagsInputEl.focus();
            this.tagsInputEl.selectionStart = this.tagsInputEl.value.length;
            this.tagsInputEl.selectionEnd = this.tagsInputEl.value.length;
        }

        if (this.lastSelectedID && this.lastSelectedID > 0) {
            const lastSelectedEl = document.querySelector("#file-entry-" + this.lastSelectedID);
            if (lastSelectedEl) {
                lastSelectedEl.classList.remove("selected");
            }
            if (this.lastSelectedID == f[0].id) {
                this.downloadURLEl.setAttribute("href", `${API}/${f[0].realfile}/${f[0].filename}`);
                this.downloadURLEl.click();
            }
        }
        let thisSelectedEntry = document.querySelector("#file-entry-" + id);
        
        this.lastSelectedID = id;
        thisSelectedEntry.classList.add("selected");
        this.dumpVariables();
    }
    
    hideUploads() {
        this.superPositionFileQueueWindowEl.classList.add("hidden");
    }

    toggleSortByDate() {
        this.sortByDate = (this.sortByDate + 1) % 3;
        this.updateTopOperations();
        this.doQuickSearch();
        this.dumpVariables();
    }

    toggleSortByName() {
        this.sortByName = (this.sortByName + 1) % 3;
        this.updateTopOperations();
        this.doQuickSearch();
        this.dumpVariables();
    }

    toggleOnlyShowMine() {
        this.onlyShowMine = (this.onlyShowMine + 1) % 2;
        this.updateTopOperations();
        this.doQuickSearch();
        this.dumpVariables();
    }
}

const loginPage = `
<div class="container-center">
    <div class="info-pane-operations">
        <h2>登陆</h2>
        <div class="info-pane-pairs">
            <div class="info-pane-label">用户名</div>
            <div class="info-pane-input">
                <input onkeydown="return checkSlash(event.key)" id="username" class="controls info-pane-tags-input" value="">
            </div>
        </div>
        <div class="info-pane-pairs">
            <div class="info-pane-label">密码</div>
            <div class="info-pane-input">
                <input onkeydown="return checkSlash(event.key)" id="password" type="password" class="controls info-pane-tags-input" value="">
            </div>
        </div>
        <div onclick="session.doLogin()" class="control-button controls with-icon control-button-row">
            <img src="assets/key.svg" class="icon-controls">
            <div>登陆</div>
        </div>
    </div>
</div>
`;

const registerPage = `
<div class="container-center">
    <div class="info-pane-operations">
        <h2>注册</h2>
        <div class="info-pane-pairs">
            <div class="info-pane-label">用户名</div>
            <div class="info-pane-input">
                <input id="username" class="controls info-pane-tags-input" value="">
            </div>
        </div>
        <div class="info-pane-pairs">
            <div class="info-pane-label">密码</div>
            <div class="info-pane-input">
                <input id="password" type="password" class="controls info-pane-tags-input" value="">
            </div>
        </div>
        <div class="info-pane-pairs">
            <div class="info-pane-label">确认密码</div>
            <div class="info-pane-input">
                <input id="password-again" type="password" class="controls info-pane-tags-input" value="">
            </div>
        </div>
        <div class="info-pane-pairs">
            <div class="info-pane-label">邀请码</div>
            <div class="info-pane-input">
                <input id="invitation" class="controls info-pane-tags-input" value="">
            </div>
        </div>
        <div onclick="session.doRegister()" class="control-button controls with-icon control-button-row">
            <img src="assets/asterisk_yellow.svg" class="icon-controls">
            <div>注册</div>
        </div>
    </div>
</div>
`;

const testsPage = `
<div class="container-center">
    <div class="info-pane-operations">
        <h2>调试面板</h2>
        <div class="info-pane-pairs">
            <div class="info-pane-label">调试输入</div>
            <div class="info-pane-input">
                <input id="test-input" class="controls info-pane-tags-input" value="">
            </div>
        </div>
        <div class="info-pane-pairs">
            <div class="info-pane-label">选取文件</div>
            <div class="info-pane-input">
                <input id="test-file" type="file" class="controls info-pane-tags-input" value="">
            </div>
        </div>
        <div class="test-operations">
            <div onclick="session.testGet()" class="control-button controls with-icon control-button-tight">
                <img src="assets/bug_go.svg" class="icon-controls">
                <div>GET 请求</div>
            </div>
            <div onclick="session.testRegister()" class="control-button controls with-icon control-button-tight">
                <img src="assets/bug_go.svg" class="icon-controls">
                <div>测试注册</div>
            </div>
            <div onclick="session.testLogin()" class="control-button controls with-icon control-button-tight">
                <img src="assets/bug_go.svg" class="icon-controls">
                <div>测试登陆</div>
            </div>
            <div onclick="session.testBadLogin()" class="control-button controls with-icon control-button-tight">
                <img src="assets/bug_go.svg" class="icon-controls">
                <div>测试错误的登陆</div>
            </div>
            <div onclick="session.testMakeCode()" class="control-button controls with-icon control-button-tight">
                <img src="assets/bug_go.svg" class="icon-controls">
                <div>测试邀请码生成</div>
            </div>
            <div onclick="session.testUpload()" class="control-button controls with-icon control-button-tight">
                <img src="assets/bug_go.svg" class="icon-controls">
                <div>测试文件上传</div>
            </div>
            <div onclick="session.testClearCached()" class="control-button controls with-icon control-button-tight">
                <img src="assets/bug_go.svg" class="icon-controls">
                <div>清除缓存</div>
            </div>
            <div onclick="session.testPreflight()" class="control-button controls with-icon control-button-tight">
                <img src="assets/bug_go.svg" class="icon-controls">
                <div>测试文件上传前登陆检测</div>
            </div>
            <div onclick="session.testListAllDb()" class="control-button controls with-icon control-button-tight">
                <img src="assets/bug_go.svg" class="icon-controls">
                <div>列出数据库</div>
            </div>
            <div onclick="session.testAQE()" class="control-button controls with-icon control-button-tight">
                <img src="assets/bug_go.svg" class="icon-controls">
                <div>任意查询</div>
            </div>
            <div onclick="session.dumpDatabase()" class="control-button controls with-icon control-button-tight">
                <img src="assets/bug_go.svg" class="icon-controls">
                <div>测试保存数据库</div>
            </div>
            <div onclick="session.loadDatabase()" class="control-button controls with-icon control-button-tight">
                <img src="assets/bug_go.svg" class="icon-controls">
                <div>测试加载数据库</div>
            </div>
            <div onclick="session.testStopServiceWorkers()" class="control-button controls with-icon control-button-tight">
                <img src="assets/bug_go.svg" class="icon-controls">
                <div>停止所有 ServiceWorker</div>
            </div>
        </div>
    </div>
    
</div>
`;

const neutralPage = `
<div class="container-center">
    <h1 class="gray">欢迎使用 PENEfiles。</h1>
</div>`;

function getUserInfo() {
    return `
    <h2 class="file-name-title">用户：${session.username}</h2>
    <div class="info-pane-operations-container">
        <div class="file-operations">
            <div onclick="session.doLogout()" class="control-button with-icon controls">
                <img class="icon-controls" src="assets/disconnect.svg">
                <div>退出登陆</div>
            </div>
        </div>
    </div>
    <div class="info-pane-operations-container">
        <div class="info-pane-operations">
            <div class="info-pane-pairs">
                <div class="info-pane-label">原本密码</div>
                <div class="info-pane-input">
                    <input type="password" class="controls info-pane-tags-input" value="">
                </div>
            </div>
            <div class="info-pane-pairs">
                <div class="info-pane-label">新密码</div>
                <div class="info-pane-input">
                    <input type="password" class="controls info-pane-tags-input" value="">
                </div>
            </div>
            <div class="padding-top-5px">
                <div class="control-button with-icon controls inline-control-button">
                    <img class="icon-controls" src="assets/brick_go.svg">
                    <div>保存修改</div>
                </div>
            </div>
        </div>
    </div>
    `;
}

function sql(query, binds, once) {
    query.bind(binds);
    let ret = [];
    while (query.step()) {
        ret.push(query.getAsObject());
        if (once) {
            break;
        }
    }
    return ret;
}

function getFileList(files) {
    let ret = ``;
    
    for (const f of files) {
        let userTag = sql(session.queries.findUserTagOfFile, { ":id": f.id }, false);
        let tags = sql(session.queries.findTagsOfFile, { ":id": f.id }, false);

        let tagHTML = "";
        for (const tag of tags) {
            let isUserTag = false;
            for (const u of userTag) {
                if (tag.tag == u.tag) {
                    tagHTML += `<div class="user tag">${tag.tag}</div>`;
                    isUserTag = true;
                    break;
                }
            }
            if (isUserTag) {
                continue;
            }
            tagHTML += `<div class="tag">${tag.tag}</div>`;
        }

        let selected = "";
        if (session.multiSelect.length > 0) {
            for (const ff of session.multiSelect) {
                if (f.id == ff.id) {
                    selected = "selected";
                    break;
                }
            }
        } else if (session.lastSelectedID == f.id) {
            selected = "selected";
        }

        ret += `
        <div id="file-entry-${f.id}" onclick="session.fileInfo(${f.id}, event)" class="file-entry controls ${selected}">
            <div class="file-info">
                <div class="file-name">
                    ${f.filename}
                </div>
                <div class="tags">
                    <div class="invisible tag">
                        ${getSize(f.size)}
                    </div>
                    <div class="invisible tag">
                        ${f.created_at.split(" ")[0]}
                    </div>
                    ${tagHTML}
                </div>
            </div>
        </div>`
    }
    return ret;
}

function getFileInfo(f) {
    let tagsStr = "";
    let tags = sql(session.queries.findTagsOfFile, { ":id": f.id }, false);
    for (const t of tags) {
        tagsStr += t.tag + " ";
    }

    const hasImage = sql(session.queries.fileHasTag, {
        ":id": f.id,
        ":tag": "Image"
    }, true);
    const hasVideo = sql(session.queries.fileHasTag, {
        ":id": f.id,
        ":tag": "Video"
    }, true);
    const hasAudio = sql(session.queries.fileHasTag, {
        ":id": f.id,
        ":tag": "Audio"
    }, true);
    const isDocx = f.filename.endsWith(".docx");
    const isPdf = f.filename.endsWith(".pdf");
    
    let preview = "";
    if (hasImage.length > 0) {
        preview += `
        <div class="big-image-preview">
            <img src="${API}/${f.realfile}/${f.filename}">
        </div>`;
    }
    if (hasVideo.length > 0) {
        preview += `
        <div class="big-image-preview">
            <video controls>
                <source src="${API}/${f.realfile}/${f.filename}">
                你的浏览器也许不支持视频播放。
            </video>
        </div>`;
    }
    if (hasAudio.length > 0) {
        preview += `
        <div class="big-image-preview">
            <audio controls>
                <source src="${API}/${f.realfile}/${f.filename}">
                你的浏览器也许不支持视频播放。
            </audio>
        </div>`;
    }
    if (isDocx) {
        fetch(`${API}/${f.realfile}/${f.filename}`).then(res => {
            return res.blob();
        }).then(blob => {
            console.log(document.querySelector(".preview-container"));
            docx.renderAsync(blob, document.querySelector(".preview-container"), null, {
                
            });
        }).catch(e => {
            session.message("错误：无法预览 .doc 文件。", e.toString());
        });
        preview += `
            <div class="preview-container"></div>
        `;
    }
    if (isPdf) {
        if (session.pdfTask) {
            session.pdfTask.destroy();
        }

        let pdfTask = pdfjsLib.getDocument(`${API}/${f.realfile}/${f.filename}`);
        session.pdfTask = pdfTask;
        pdfTask.promise.then(pdf => {
            const canvas = document.querySelector(".preview-canvas");
            const ctx = canvas.getContext("2d");
            if (canvas.getBoundingClientRect().width > 720) {
                canvas.width = 720 * 2;
            } else {
                canvas.width = canvas.getBoundingClientRect().width * 2;
            }
            
            let width = canvas.width;
            let currentPage = 1;
            let prevPageEl = document.querySelector("#prev-page");
            let nextPageEl = document.querySelector("#next-page");

            function displayPage() {
                pdf.getPage(currentPage).then(page => {
                    let viewport = page.getViewport({ scale: 1.0 });
                    let aspect = width / viewport.width;
                    let height = viewport.height * aspect;
                    canvas.height = height;
                    let scaledViewport = page.getViewport({ scale: aspect });
                    let renderCtx = {
                        canvasContext: ctx,
                        viewport: scaledViewport
                    };
                    let renderTask = page.render(renderCtx);
                }).catch(e => {
                    session.message("无法渲染 .pdf 文件。", e.toString());
                });
            }
            displayPage();

            prevPageEl.addEventListener("click", () => {
                currentPage--;
                if (currentPage < 1) {
                    currentPage = 1;
                }
                displayPage();
            });
            nextPageEl.addEventListener("click", () => {
                currentPage++;
                if (currentPage >= pdf.numPages) {
                    currentPage = pdf.numPages;
                }
                displayPage();
            });
            
        });
        preview += `
            <div class="info-pane-operations-container sticky">
                <div class="file-operations">
                    <div id="prev-page" class="control-button with-icon controls">
                        <img class="icon-controls" src="assets/book_previous.svg">
                        <div>上一页</div>
                    </div>
                    <div id="next-page" class="control-button with-icon controls">
                        <img class="icon-controls" src="assets/book_next.svg">
                        <div>下一页</div>
                    </div>
                </div>
            </div>
            
            <canvas class="preview-canvas"></canvas>
        `;
    }

    return `
    <h2 class="file-name-title">${f.filename}</h2>
    <div class="info-pane-operations-container">
        <div class="file-operations">
            <div onclick="session.doDelete()" class="control-button with-icon controls">
                <img class="icon-controls" src="assets/bin.svg">
                <div>删除文件</div>
            </div>
            <a href="${API}/${f.realfile}/${f.filename}" class="control-button with-icon controls">
                <img class="icon-controls" src="assets/disk.svg">
                <div>下载文件</div>
            </a>
            <input id="file-url" value="${encodeURI(API + "/" + f.realfile + "/" + f.filename)}" class="readonly hidden">
            <div onclick="session.doUpdate()" class="control-button with-icon controls">
                <img class="icon-controls" src="assets/brick_go.svg">
                <div>保存修改</div>
            </div>
            <div onclick="session.doShare()" class="control-button with-icon controls">
                <img class="icon-controls" src="assets/link.svg">
                <div>分享文件</div>
            </div>
        </div>
    </div>
    <div class="info-pane-operations">
        <div class="info-pane-pairs">
            <div class="info-pane-label">文件名</div>
            <div class="info-pane-input">
                <input onkeydown="return checkSlash(event.key)" onchange="session.doUpdate()" id="file-name-input" class="controls info-pane-tags-input" value="${f.filename}">
            </div>
        </div>
        <div class="info-pane-pairs">
            <div class="info-pane-label">标签</div>
            <div class="info-pane-input">
                <input onkeydown="return checkSlash(event.key)" onchange="session.doUpdate()" id="tags-input" class="controls info-pane-tags-input" value="${tagsStr}">
            </div>
        </div>
        <div class="info-pane-pairs">
            <div class="info-pane-label">私有</div>
            <div class="info-pane-checkbox">
                <input class="controls" type="checkbox">
            </div>
        </div>
    </div>
    ${preview}
    <div class="info-pane-table-container">
        <div class="info-pane-table">
            <div class="info-pane-label">大小</div>
            <div>${getSize(f.size)} (${f.size}b)</div>
            <div class="info-pane-label">创建日期</div>
            <div>${f.created_at}</div>
            <div class="info-pane-label">最后修改于</div>
            <div>${f.modified_at}</div>
            <div class="info-pane-label">上传于</div>
            <div>${f.created_at}</div>
        </div>
    </div>
    `;
}

function getSize(b) {
    let s = b;
    let unit = ["b", "K", "M", "G", "T"];
    let unitPtr = 0;
    while (s > 1024) {
        s /= 1024;
        unitPtr++;
        if (unitPtr == unit.length - 1) {
            break;
        }
    }
    return (Math.round(s * 100.0) / 100.0) + unit[unitPtr];
}

function getMultiselect(selections) {
    let baseTag = "";
    if (session.username) {
        baseTag = session.username;
    }
    return `
    <h2 class="file-name-title">已选取 ${selections.length} 个文件</h2>
    <div class="info-pane-operations-container">
        <div class="file-operations">
            <div onclick="session.doMultiDelete()" class="control-button with-icon controls">
                <img class="icon-controls" src="assets/bin.svg">
                <div>删除文件</div>
            </div>
            <a onclick="session.doMultiDownload()" class="control-button with-icon controls">
                <img class="icon-controls" src="assets/disk.svg">
                <div>下载文件</div>
            </a>
            <div onclick="session.doMultiUpdate()" class="control-button with-icon controls">
                <img class="icon-controls" src="assets/brick_go.svg">
                <div>保存修改</div>
            </div>
        </div>
    </div>
    <div class="info-pane-operations">
        <div class="info-pane-pairs">
            <div class="info-pane-label">标签</div>
            <div class="info-pane-input">
                <input onkeydown="return checkSlash(event.key)" id="tags-input" class="controls info-pane-tags-input" value="${baseTag}">
            </div>
        </div>
        <div class="info-pane-pairs">
            <div class="info-pane-label">私有</div>
            <div class="info-pane-checkbox">
                <input class="controls" type="checkbox">
            </div>
        </div>
    </div>
    `;
}

window.checkSlash = (k) => {
    if (k == "/") {
        return false;
    }
    return true;
}

// Hotkeys 
window.onkeyup = (e) => {
    if (e.key == "/") {
        session.quickSearchEl.focus();
        e.preventDefault();
        return true;
    }
    return false;
};

window.dragOverHandler = (e) => {
    session.fileListEl.classList.add("drag-active");
    return false;
};

window.dragEndHandler = (e) => {
    session.fileListEl.classList.remove("drag-active");
    return true;
};
