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
        this.superPositionWindowEl = document.querySelector(".superposition-window");
        this.loginTopControlEl = document.querySelector("#login-top-control");
        this.registerTopControlEl = document.querySelector("#register-top-control");
        this.infoTopControlEl = document.querySelector("#info-top-control");
        this.uploadFileEl = document.querySelector("#upload-file");
        this.downloadURLEl = document.querySelector("#download-url");
        this.quickSearchEl = document.querySelector("#quick-search");
        this.API = "http://10.0.0.9:4243"

        this.fileListEl.onscroll = (e) => {
            this.fileListScrollTop = this.fileListEl.scrollTop;
        }

        // Variables
        this.session = null;
        this.username = "";
        this.superPositionWindowShown = false;
        this.lastSelectedID = -1;
        this.fileListScrollTop = 0;

        // Data
        this.files = [];
        this.tags = [];
        this.filesTags = [];
        this.users = [];

        // SQL database
        this.createDb();

        this.loadVariables();
        this.updateTopOperations();
    }

    dumpVariables() {
        localStorage.setItem("penefiles", JSON.stringify({
            session: this.session,
            username: this.username,
            superPositionWindowShown: this.superPositionWindowShown,
            files: this.files,
            tags: this.tags,
            filesTags: this.filesTags,
            users: this.users,
            lastSelectedID: this.lastSelectedID,
            fileListScrollTop: this.fileListScrollTop
        }));
    }

    loadVariables() {
        let cached = localStorage.getItem("penefiles");
        if (!cached || cached == "") {
            return;
        }
        cached = JSON.parse(cached);
        this.session = cached["session"];
        this.username = cached["username"];
        this.files = cached["files"];
        this.tags = cached["tags"];
        this.filesTags = cached["filesTags"];
        this.users = cached["users"];
        this.lastSelectedID = cached["lastSelectedID"];

        // Create database.
        this.updateDb();

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
        this.queries = {
            createFile: this.db.prepare("INSERT INTO files (id, filename, realfile, created_at, modified_at, size) VALUES (:id, :filename, :realfile, :created_at, :modified_at, :size);"),
            listFiles: this.db.prepare("SELECT * FROM files;"),
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
            getFileFromRealfile: this.db.prepare("SELECT * FROM files WHERE realfile=:realfile")
        };
    }

    //
    // Update database based on files, filesTags, and users, 
    // The three major databases.
    //
    updateDb() {
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

    setSuperpositionWindowContent(what) {
        this.superPositionWindowEl.innerHTML = what;
    }

    updateTopOperations() {
        if (this.session == null) {
            this.loginTopControlEl.classList.remove("hidden");
            this.registerTopControlEl.classList.remove("hidden");
            this.infoTopControlEl.classList.add("hidden");
        } else {
            this.loginTopControlEl.classList.add("hidden");
            this.registerTopControlEl.classList.add("hidden");
            this.infoTopControlEl.classList.remove("hidden");
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

        fetch(`${this.API}/auth/preflight`, {
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
            let data = new FormData();
            data.append("session", this.session);
            data.append("file", this.uploadFileEl.files[0]);
            return fetch(`${this.API}/files/upload`, {
                method: "POST",
                body: data
            });
        }).then(res => {
            return res.json();
        }).then(json => {
            if (json.status != 200) {
                this.message("错误：文件上传失败。", json.message);    
            } else {
                this.doRefresh().then(() => {
                    const f = sql(this.queries.getFileFromRealfile, { ":realfile": json.message }, true);
                    if (f.length == 0) {
                        this.message("错误：文件已经上传，但是无法找到。", "这是一个不应该发生的问题，请联系我。");
                        return;
                    }
                    this.fileInfo(f[0].id);
                });
            }
        }).catch(e => {
            this.message("错误：文件上传失败。", e.toString());
        });

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
        
        fetch(`${this.API}/files/update`, {
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
                this.message("错误：文件修改失败。", lines[3].split("=")[1]);
                return;
            }

            if (json.status != 200) {
                this.message("错误：文件修改失败。", json.message);
                return;
            }

            this.doRefresh().then(() => {
                setTimeout(() => {
                    if (this.lastSelectedID == f[0].id) {
                        this.fileInfo(f[0].id);
                    }
                }, 100);
            });
        }).catch(e => {
            this.message("错误：文件修改失败。", e.toString());
        });
    }

    doDelete() {
        const f = sql(this.queries.findFileById, {
            ":id": this.lastSelectedID
        }, true);
        if (f.length == 0) {
            this.message("错误：无法找到要删除的文件。", "PENEfiles 状态机估计出了某些问题。");
            return;
        }
        fetch(`${this.API}/files/delete`, {
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
            this.dumpVariables();
            this.neutral();
            this.doRefresh();
        }).catch(e => {
            this.message("错误：文件删除失败。", e.toString());
        });
    }

    doLogin() {
        const username = this.usernameEl.value;
        const password = this.passwordEl.value;
        this.username = username;

        let resp = null;
        fetch(`${this.API}/users/login`, {
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
                    this.personalInfo();
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
        this.updateTopOperations();
        this.dumpVariables();
        this.login();
    }

    doRegister() {
        const username = this.usernameEl.value;
        const password = this.passwordEl.value;

        let resp = null;
        fetch(`${this.API}/users/register`, {
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
        let query = this.quickSearchEl.value;
        if (query == "") {
            this.setFileListContent(getFileList(sql(this.queries.listFiles, {}, false)));
            return;
        }
        query = query.replace("/", "");
        query = query.trim();
        let subQueries = query.split(" ");
        let aggregate = {};
        let weight = 1;

        for (const sub of subQueries) {
            const things = sql(this.queries.findFileWithTags, { ":query": `%${sub}%` }, false);
            for (const t of things) {
                if (aggregate[t.id]) {
                    aggregate[t.id].count += weight;
                    continue;
                }
                aggregate[t.id] = t;
                aggregate[t.id].count = weight;
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
        this.setFileListContent(getFileList(arr));
    }

    // TODO: private data.
    fetchAll() {

        return new Promise((resolve, reject) => {
            let allFour = 0;

            fetch(`${this.API}/files`, {
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
            fetch(`${this.API}/tags`, {
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
            fetch(`${this.API}/users`, {
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
            fetch(`${this.API}/files-tags`, {
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
            this.createDb();
            this.updateDb();
            this.setFileListContent(getFileList(sql(session.queries.listFiles, {}, false)));
            this.doQuickSearch();
        });
    }

    testGet() {
        fetch(`${this.API}/`, {
            method: "GET",
        }).then(res => {
            return res.json();
        }).then(json => {
            console.log(json);
        });
    }

    testRegister() {
        fetch(`${this.API}/users/register`, {
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
        fetch(`${this.API}/codes/make`, {
            method: "GET"
        }).then(res => {
            return res.json();
        }).then(json => {
            console.log(json);
            this.testInputEl.value = json.code;
        });
    }

    testLogin() {
        fetch(`${this.API}/users/login`, {
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
        fetch(`${this.API}/users/login`, {
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
        fetch(`${this.API}/files/upload`, {
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
    }

    testPreflight() {
        let fakeSession = this.testInputEl.value;
        fetch(`${this.API}/auth/preflight`, {
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
        this.queries.listFiles.bind();
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
        this.superPositionWindowShown = true;
        this.setSuperpositionWindowContent(`
        <h2>${title}</h2>
        ${explanation}
        <div class="padding-top-5px"></div>
        <div onclick="session.closeMessage()" class="control-button controls with-icon control-button-row">
            <img src="assets/accept.svg" class="icon-controls">
            <div>好</div>
        </div>
        `);
        this.superPositionWindowEl.classList.remove("hidden");
        this.dumpVariables();
    }

    personalInfo() {
        this.setInfoPaneContent(getUserInfo());
        this.dumpVariables();
    }

    closeMessage() {
        this.superPositionWindowEl.classList.add("hidden");
        this.superPositionWindowShown = false;
        this.dumpVariables();
    }

    neutral() {
        this.setInfoPaneContent(neutralPage);
        this.dumpVariables();
    }

    fileInfo(id) {
        const f = sql(this.queries.findFileById, { ":id": id }, true);
        if (f.length == 0) {
            this.message("错误：无法找到文件 " + id, "这个文件不存在于数据库中。可能是因为代码有漏洞或者数据库已经老了。尝试刷新，或者通知 42yeah.");
            this.lastSelectedID = -1;
            this.dumpVariables();
            return;
        }
        
        this.setInfoPaneContent(getFileInfo(f[0]));
        this.fileNameInputEl = document.querySelector("#file-name-input");
        this.tagsInputEl = document.querySelector("#tags-input");

        this.tagsInputEl.focus();
        this.tagsInputEl.selectionStart = this.tagsInputEl.value.length;
        this.tagsInputEl.selectionEnd = this.tagsInputEl.value.length;

        if (this.lastSelectedID && this.lastSelectedID > 0) {
            const lastSelectedEl = document.querySelector("#file-entry-" + this.lastSelectedID);
            if (lastSelectedEl) {
                lastSelectedEl.classList.remove("selected");
            }
        }
        this.lastSelectedID = id;
        let thisSelectedEntry = document.querySelector("#file-entry-" + id);
        if (this.lastSelectedID == f.id) {
            this.downloadURLEl.setAttribute("href", `${this.API}/${f[0].realfile}/${f[0].filename}`);
            this.downloadURLEl.click();
        }
        thisSelectedEntry.classList.add("selected");
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
                <input id="username" class="controls info-pane-tags-input" value="">
            </div>
        </div>
        <div class="info-pane-pairs">
            <div class="info-pane-label">密码</div>
            <div class="info-pane-input">
                <input id="password" type="password" class="controls info-pane-tags-input" value="">
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
        if (session.lastSelectedID == f.id) {
            selected = "selected";
        }

        ret += `
        <div id="file-entry-${f.id}" onclick="session.fileInfo(${f.id})" class="file-entry controls ${selected}">
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
    
    let preview = "";
    if (hasImage.length > 0) {
        preview += `
        <div class="big-image-preview">
            <img src="${session.API}/${f.realfile}/${f.filename}">
        </div>`;
    }
    if (hasVideo.length > 0) {
        preview += `
        <div class="big-image-preview">
            <video controls>
                <source src="${session.API}/${f.realfile}/${f.filename}">
                你的浏览器也许不支持视频播放。
            </video>
        </div>`;
    }
    if (hasAudio.length > 0) {
        preview += `
        <div class="big-image-preview">
            <audio controls>
                <source src="${session.API}/${f.realfile}/${f.filename}">
                你的浏览器也许不支持视频播放。
            </audio>
        </div>`;
    }

    return `
    <h2 class="file-name-title">${f.filename}</h2>
    <div class="info-pane-operations-container">
        <div class="file-operations">
            <div onclick="session.doDelete()" class="control-button with-icon controls">
                <img class="icon-controls" src="assets/bin.svg">
                <div>删除文件</div>
            </div>
            <a href="${session.API}/${f.realfile}/${f.filename}" class="control-button with-icon controls">
                <img class="icon-controls" src="assets/disk.svg">
                <div>下载文件</div>
            </a>
            <div onclick="session.doUpdate()" class="control-button with-icon controls">
                <img class="icon-controls" src="assets/brick_go.svg">
                <div>保存修改</div>
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
        return true;
    }
    return false;
};
