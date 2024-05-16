import { API, FRONTEND, FIRST_TIME } from "./config.js";

// 
// The Penefiles state machine.
// Can be saved & reloaded.
// All things are kept inside - web page content, login sessions, files,
// Tags, etc.
//
export class Penefiles {
    constructor(headless = false) {
        this.loggedIn = false;

        // Element finders
        this.fileListEl = document.querySelector(".file-list");
        this.infoPaneEl = document.querySelector(".info-pane");
        this.filesPaneEl = document.querySelector(".files-pane");
        this.topBarEl = document.querySelector(".top-bar");
        this.bottomBarEl = document.querySelector(".bottom-bar");
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
        this.completionWindowEl = document.querySelector(".completion-window");
        this.acTagsListEl = document.querySelector(".ac-tags-list");
        this.infoPaneContainerEl = document.querySelector(".info-pane-container");
        this.infoPaneHandleEl = document.querySelector(".info-pane-handle");
        this.acTagsList = [];
        this.headless = headless;

        // First time variables
        this.frontendPathEl = null;
        this.domainNameEl = null;
        this.nginxCM = null;
        this.frontendCM = null;
        this.setupResultEl = null;
    
        if (!headless) {
            this.fileListEl.onscroll = (e) => {
                this.fileListScrollTop = this.fileListEl.scrollTop;
            }

            // Register resize
            this.infoPaneHandleEl.addEventListener("mousedown", e => {
                this.infoPaneResizing = true;
                this.heightOffset = e.clientY - this.topBarEl.clientHeight - this.infoPaneContainerEl.clientHeight;
                this.infoPaneResize(e.clientY);
                e.preventDefault();
            });
            window.addEventListener("mousemove", e => {
                if (this.infoPaneResizing) {
                    this.infoPaneResize(e.clientY);
                    e.preventDefault();
                }
            });
            window.addEventListener("mouseup", e => {
                if (this.infoPaneResizing) {
                    this.infoPaneResizing = false;
                    this.infoPaneResize(e.clientY);
                    e.preventDefault();
                }
            });
            this.infoPaneHandleEl.addEventListener("touchstart", e => {
                this.infoPaneResizing = true;
                this.infoPaneResize(e.touches[0].clientY);
                this.heightOffset = e.touches[0].clientY - this.topBarEl.clientHeight - this.infoPaneContainerEl.clientHeight;
                e.preventDefault();
            });
            window.addEventListener("touchmove", e => {
                if (this.infoPaneResizing) {
                    this.infoPaneResize(e.touches[0].clientY);
                    e.preventDefault();
                }
            });
            window.addEventListener("touchend", e => {
                if (this.infoPaneResizing) {
                    this.infoPaneResizing = false;
                    this.infoPaneResize(e.touches[0].clientY);
                    e.preventDefault();
                }
            });
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
        this.infoPaneResizing = false;
        this.infoPaneHeight = 100;
        this.heightOffset = 0;
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

    infoPaneResize(y) {
        // Calculate relative position to the window (in vh)

        // let vh = y / window.innerHeight;
        // if (vh > 0.8) {
        //     vh = 0.8;
        // }
        // if (vh < 0.1) {
        //     vh = 0.1;
        // }

        let height = (y - this.heightOffset) - this.topBarEl.clientHeight;
        let bottomPart = this.completionWindowEl.clientHeight + this.bottomBarEl.clientHeight;
        if (height + this.topBarEl.clientHeight + bottomPart > window.innerHeight) {
            height = window.innerHeight - this.topBarEl.clientHeight - bottomPart - 1;
        } else if (height < 100) {
            height = 100;
        }

        // Rule #1: height must not disintegrate.
        // Rule #2: height must not cover tag list and quick access.

        this.infoPaneContainerEl.style.minHeight = `${height}px`;
        this.infoPaneContainerEl.style.maxHeight = `${height}px`;
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
            this.message("Error: cannot load database", "The local database might've been corrupted. Please wait for us to pull a new one from the server.");
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
            CREATE TABLE files (id INTEGER PRIMARY KEY AUTOINCREMENT, filename TEXT, realfile TEXT UNIQUE, created_at DEFAULT CURRENT_TIMESTAMP, modified_at DEFAULT CURRENT_TIMESTAMP, size INTEGER, confidentiality INTEGER);`;
        this.db.run(dbExec);
        this.generateQueries();
    }

    generateQueries() {
        this.queries = {
            createFile: this.db.prepare("INSERT INTO files (id, filename, realfile, created_at, modified_at, size, confidentiality) VALUES (:id, :filename, :realfile, :created_at, :modified_at, :size, :confidentiality);"),
            listFiles: this.db.prepare("SELECT * FROM files;"),
            subQueries: {},
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
            getFileFromRealfile: this.db.prepare("SELECT * FROM files WHERE realfile=:realfile;"),
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
                ":size": f.size,
                ":confidentiality": f.confidentiality
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

    setCompletionListContent(tags) {
        let html = "";
        if (tags.length == 0) {
            this.doHideCompletion();
            return;
        }
        this.doShowCompletion();

        tags = tags.sort((a, b) => {
            return b.occurance - a.occurance;
        });
        for (const t of tags) {
            let user = "";
            if (t.user) {
                user = "user";
            } 

            html += `<div onclick="session.doAddSearch('${t.tag}')" class="clickable-tag ${user}">
                <div class="clickable-tag-tag">${t.tag}</div>
                <div class="clickable-tag-occurance">${t.occurance}</div>
            </div>`;
        }
        this.acTagsListEl.innerHTML = html;
    }

    setSuperpositionInfoWindowContent(what) {
        this.superPositionInfoWindowEl.innerHTML = what;
    }

    updateTopOperations() {
        if (this.headless) {
            return;
        }

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
                this.sortByDateEl.innerHTML = "No date sort";
                this.sortByDateEl.parentElement.classList.add("inactive");
                this.sortByDateEl.previousElementSibling.classList.remove("invert");
                break;

            case 1:
                this.sortByDateEl.innerHTML = "D. date";
                this.sortByDateEl.parentElement.classList.remove("inactive");
                this.sortByDateEl.previousElementSibling.classList.add("invert");
                break;

            case 2:
                this.sortByDateEl.innerHTML = "A. date";
                this.sortByDateEl.parentElement.classList.remove("inactive");
                this.sortByDateEl.previousElementSibling.classList.remove("invert");
                break;
        }
        switch (this.sortByName) {
            case 0:
                this.sortByNameEl.innerHTML = "No name sort";
                this.sortByNameEl.parentElement.classList.add("inactive");
                this.sortByNameEl.previousElementSibling.classList.remove("invert");
                break;

            case 1:
                this.sortByNameEl.innerHTML = "A. name";
                this.sortByNameEl.parentElement.classList.remove("inactive");
                this.sortByNameEl.previousElementSibling.classList.remove("invert");
                break;

            case 2:
                this.sortByNameEl.innerHTML = "D. name";
                this.sortByNameEl.parentElement.classList.remove("inactive");
                this.sortByNameEl.previousElementSibling.classList.add("invert");
                break;
        }

        switch (this.onlyShowMine) {
            case 0:
                this.onlyShowMineEl.innerHTML = "Everyone";
                this.onlyShowMineEl.parentElement.classList.add("inactive");
                break;

            case 1:
                this.onlyShowMineEl.innerHTML = "Only mine";
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
                        reject("Upload failed due to some mysterious reason.");
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
                            this.message("Error: the file has been uploaded but cannot be located.", "This is not supposed to happen. Please file an issue.");
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
                reject("You have terminated the upload.");
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
            this.message(`Error: upload failed: ${thisFile.name}`, e.toString());
            this.uploadAllFiles();
        });
    }

    doShare() {
        if (this.lastSelectedID < 0) {
            return;
        }
        const f = sql(this.queries.findFileById, { ":id": this.lastSelectedID }, true);
        if (f.length == 0) {
            this.message("Error: cannot share file", "The file is no longer in the database. You may need to refresh.");
            return;
        }
        let url = `${API}/${f[0].realfile}/${f[0].filename}`;
        const isMarkdown = f[0].filename.endsWith(".md");
        if (isMarkdown) {
            url = `${FRONTEND}/notes.html?id=${f[0].id}`;
        }
        if ("share" in navigator) {
            navigator.share({
                title: `${f[0].filename} | PENEfiles`,
                text: `${this.username} is using PENEfiles to share ${f[0].filename} with you.`,
                url: url
            });
        } else {
            this.fileUrlEl.select();
            this.fileUrlEl.value = url;
            this.fileUrlEl.setSelectionRange(0, this.fileUrlEl.value.length + 1);
            navigator.clipboard.writeText(this.fileUrlEl.value);
            this.message("Link copied to clipboard", "As your browser does not support sharing functionality, the link is instead directly copied to your clipboard.");
        }
    }

    doCreateNote() {
        if (this.session == null) {
            this.message("Login first", `You need to <div onclick="session.login()" class="control-button controls with-icon inline-control-button">
                <img src="assets/key.svg" class="icon-controls">
                <div>Login</div>
            </div> to create notes.`);
            return;
        }
        const now = new Date();
        let filename = `Note ${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}.md`;
        let tags = `${this.username} Note`;
        this.setInfoPaneContent(getCreateNotes(filename, tags));
        this.publicEl = document.querySelector("#public");
        this.unlistedEl = document.querySelector("#unlisted");
        this.confidentialEl = document.querySelector("#confidential");
        this.notesAreaContainerEl = document.querySelector(".notes-area-container");
        this.notesCM = createCodeMirror(this.notesAreaContainerEl);
        this.tagsInputEl = document.querySelector("#tags-input");
        this.fileNameInputEl = document.querySelector("#file-name-input");
        this.lastSelectedID = -1;
        this.doQuickSearch();
    }

    doEditNote() {
        if (this.session == null) {
            this.message("Login first", `You need to <div onclick="session.login()" class="control-button controls with-icon inline-control-button">
                <img src="assets/key.svg" class="icon-controls">
                <div>Login</div>
            </div> to edit notes.`);
            return;
        }

        let markdownSrc = document.querySelector("#markdown-src");
        if (!markdownSrc || markdownSrc.innerHTML == "") {
            this.message("Note is still loading", "The note is still being loaded. Please edit only after it's fully shown.");
            return;
        }

        const f = sql(this.queries.findFileById, {
            ":id": this.lastSelectedID
        }, true);
        if (f.length == 0) {
            this.message("Error: cannot locate note", "Something may be off with the PENEfiles states. Refresh?");
            return;
        }
        const tags = sql(this.queries.findTagsOfFile, { ":id": f[0].id }, false);
        let tagsStr = "";
        for (const t of tags) {
            tagsStr += t.tag + " ";
        }

        this.setInfoPaneContent(getModifyNotes(f[0].filename, tagsStr, f[0].confidentiality));
        this.notesAreaContainerEl = document.querySelector(".notes-area-container");
        this.notesCM = createCodeMirror(this.notesAreaContainerEl);
        this.publicEl = document.querySelector("#public");
        this.unlistedEl = document.querySelector("#unlisted");
        this.confidentialEl = document.querySelector("#confidential");
        this.tagsInputEl = document.querySelector("#tags-input");
        this.fileNameInputEl = document.querySelector("#file-name-input");
        
        let src = markdownSrc.innerText;
        let transaction = this.notesCM.state.update({
            changes: {
                from: 0,
                to: this.notesCM.state.doc.length,
                insert: src
            }
        });
        this.notesCM.update([transaction]);
    }

    doDiscardNote() {
        this.notesCM = null;
        let id = this.lastSelectedID;
        this.lastSelectedID = -1;
        this.fileInfo(id);
    }

    doSubmitNote() {
        let filename = this.fileNameInputEl.value;
        let tags = this.tagsInputEl.value.trim().split(" ");
        let content = this.notesCM.state.doc.toString();
        let session = this.session;
        let level = this.publicEl.checked ? 0 : this.unlistedEl.checked ? 1 : 2;
        this.notesCM = null;
        let req = {
            filename,
            tags,
            session,
            content,
            confidentiality: level
        };

        fetch(`${API}/notes/create`, {
            method: "POST",
            body: JSON.stringify(req)
        }).then(res => {
            return res.text();
        }).then(text => {
            let json = {};
            try {
                json = JSON.parse(text);
            } catch (e) {
                console.log(e);
                let lines = text.split("\n");
                this.message("Error: cannot create note", lines[3].split("=")[1]);
                return;
            }
            if (json.status != 200) {
                this.message("Error: cannot create note", json.message);
                return;
            }
            this.doRefresh().then(() => {
                const f = sql(this.queries.getFileFromRealfile, { ":realfile": json.message }, true);
                if (f.length == 0) {
                    this.message("Error: the file has been uploaded but cannot be located.", "This is not supposed to happen. Please file an issue.");
                    return;
                }
                this.fileInfo(f[0].id);
            });
        }).catch(e => {
            this.message("Error: cannot create note", e.toString());
        });
    }

    doSaveNote() {
        const f = sql(this.queries.findFileById, {
            ":id": this.lastSelectedID
        }, true);
        if (f.length == 0) {
            this.message("Error: cannot locate note", "Something may be off with the PENEfiles states. Refresh?");
            return;
        }
        let filename = this.fileNameInputEl.value;
        let tags = this.tagsInputEl.value.trim().split(" ");
        let content = this.notesCM.state.doc.toString();
        this.notesCM = null;
        let session = this.session;
        let realfile = f[0].realfile.split("/")[1];
        let level = this.publicEl.checked ? 0 : this.unlistedEl.checked ? 1 : 2;
        let req = {
            filename,
            tags,
            session,
            content,
            realfile,
            confidentiality: level
        };
        fetch(`${API}/notes/update`, {
            method: "POST",
            body: JSON.stringify(req)
        }).then(res => {
            return res.text();
        }).then(text => {
            let json = {};
            try {
                json = JSON.parse(text);
            } catch (e) {
                console.log(e);
                let lines = text.split("\n");
                this.message("Error: note update failed", lines[3].split("=")[1]);
                return;
            }
            if (json.status != 200) {
                this.message("Error: note update failed", json.message);
                return;
            }
            this.doRefresh().then(() => {
                // Do this to prevent accidental file download
                this.lastSelectedID = -1;
                this.fileInfo(f[0].id);
            });
        }).catch(e => {
            this.message("Error: note update failed", e.toString());
        });
    }

    doUpload() {
        if (this.uploadFileEl.length == 0) {
            return;
        }
        if (this.session == null) {
            this.message("Login first", `You need to <div onclick="session.login()" class="control-button controls with-icon inline-control-button">
                <img src="assets/key.svg" class="icon-controls">
                <div>Login</div>
            </div> to upload files.`);
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
            throw `Your login credentials have expired. Please <div onclick="session.login()" class="control-button controls with-icon inline-control-button">
                    <img src="assets/key.svg" class="icon-controls">
                    <div>Login</div>
                </div> again.`;
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
            this.message("Error: cannot upload file(s)", e.toString());
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
            this.message("Error: cannot locate file", "Something may be off with the PENEfiles states. Refresh?");
            return;
        }
        let level = this.publicEl.checked ? 0 : this.unlistedEl.checked ? 1 : 2;
        const req = {
            session: this.session,
            filename: this.fileNameInputEl.value,
            realfile: f[0].realfile.split("/")[1],
            tags: [],
            confidentiality: level
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
            this.message("Error: cannot update file", e.toString());
        });
    }

    doDelete(refresh = true) {
        const f = sql(this.queries.findFileById, {
            ":id": this.lastSelectedID
        }, true);
        if (f.length == 0) {
            this.message("Error: cannot locate file", "Something may be off with the PENEfiles states. Refresh?");
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
                this.message("Error: file deletion failed", lines[3].split("=")[1]);
                return;
            }
            if (json.status != 200) {
                this.message("Error: file deletion failed", json.message);
                return;
            }
            this.lastSelectedID = -1;
            if (refresh) {
                this.neutral();
                this.doRefresh();
                this.dumpVariables();
            }
        }).catch(e => {
            this.message("Error: file deletion failed", e.toString());
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
                    this.message("Login successful", "You have successfully logged in.");
                    this.session = json.message;
                    this.onlyShowMine = 1;
                    this.personalInfo();
                    this.doRefresh();
                    this.updateTopOperations();
                }
            } catch (e) {
                const lines = text.split("\n");
                this.message("Error: cannot login", lines[3].split("=")[1]);
            }
            this.updateTopOperations();
            this.dumpVariables();
        }).catch(e => {
            this.message("Error: cannot login", e.toString());
        });
    }

    doLogout() {
        this.message("Logout successful", "You have successfully logged out.");
        this.session = null;
        this.onlyShowMine = false;
        this.updateTopOperations();
        this.dumpVariables();
        this.login();
        this.doRefresh();
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
                    this.message("Registration successful", `Return to  
                    <div onclick="session.login()" class="control-button controls with-icon inline-control-button">
                        <img src="assets/key.svg" class="icon-controls">
                        <div>Login</div>
                    </div> page to start using PENEfiles.`
                    );
                }
            } catch (e) {
                const lines = text.split("\n");
                this.message("Error: registration failed", lines[3].split("=")[1]);
            }
        }).catch(e => {
            this.message("Error: registration failed", e.toString());
        });
    }

    doQuickSearch() {
        if (this.headless) {
            return;
        }

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
            this.setCompletionListContent(this.acTagsList);
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
        this.setCompletionListContent(this.acTagsList);

        let end = new Date();
        console.log("quick search profile: ", (end - begin) / 1000.0, "s");
    }

    doShowCompletion() {
        this.completionWindowEl.classList.remove("hidden");
    }

    doHideCompletion() {
        this.completionWindowEl.classList.add("hidden");
    }

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
            this.message("Error: file update failed", e.toString());
        });
    }

    // TODO: private data.
    fetchAll() {

        return new Promise((resolve, reject) => {
            let allFour = 0;
            let headers = {};
            if (this.session) {
                headers["Authorization"] = `Bearer ${this.session}`;
            }

            fetch(`${API}/files`, {
                method: "GET",
                headers: headers
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
                this.message("Error: cannot pull file list", e.toString());
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
                this.message("Error: cannot pull tag list", e.toString());
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
                this.message("Error: cannot pull tag list", e.toString());
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
                this.message("Error: cannot pull files-tags list", e.toString());
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

        let confidentiality = 0;
        if (this.unlistedEl.checked) {
            confidentiality = 1;
        } else if (this.confidentialEl.checked) {
            confidentiality = 2;
        }

        for (let i = 0; i < toUpdate; i++) {
            const req = {
                session: this.session,
                filename: this.multiSelect[i].filename,
                realfile: this.multiSelect[i].realfile.split("/")[1],
                tags: reqTags,
                confidentiality: confidentiality
            };

            this.updateOne(req).catch(e => {
                this.message("Error: cannot update " + this.multiSelect[i].filename, e.toString());
            }).finally(() => {
                updated++;
                if (updated == toUpdate) {
                    this.doRefresh();
                }
            });
        }
    }

    doAddSearch(what) {
        if (this.quickSearchEl.value.trim() == "") {
            this.quickSearchEl.value = what;
            this.doQuickSearch();
            return;
        }
        what = "+" + what;
        if (!this.quickSearchEl.value.endsWith(" ")) {
            what = " " + what;
        }
        this.quickSearchEl.value += what;
        this.doQuickSearch();
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
        if (this.headless) {
            return;
        }

        this.superPositionInfoWindowShown = true;
        this.setSuperpositionInfoWindowContent(`
        <h2>${title}</h2>
        ${explanation}
        <div class="padding-top-5px"></div>
        <div onclick="session.closeMessage()" class="control-button controls with-icon control-button-row">
            <img src="assets/accept.svg" class="icon-controls">
            <div>OK</div>
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

    generateCode() {
        fetch(`${API}/codes/make`, {
            method: "POST",
            body: JSON.stringify({
                session: this.session
            })
        }).then(res => {
            return res.json();
        }).then(json => {
            document.querySelector("#generated-code").value = json.code;
        }).catch(e => {
            this.message("Code generation failed", `Can't generate invitation code: ${e.toString()}`)
        });
    }

    wizard() {
        // Wizard is run if it's the first time to guide users through some
        // initial mandatory setups.
        this.setInfoPaneContent(wizardPage);
        this.dumpVariables();

        this.nginxCM = createCodeMirror(document.querySelector("#nginx-conf"));
        this.frontendCM = createCodeMirror(document.querySelector("#frontend-conf"));
        this.frontendPathEl = document.querySelector("#frontend-path");
        this.domainNameEl = document.querySelector("#domain");
        this.setupResultEl = document.querySelector(".setup-results");
    }

    refreshConfs() {
        const fpath = this.frontendPathEl.value;
        const domain = this.domainNameEl.value;

        if (fpath != "" && domain != "") {
            this.setupResultEl.classList.remove("hidden");
        } else {
            this.setupResultEl.classList.add("hidden");
            return;
        }

        const nginxTemp = `server {
    listen 80;
    listen [::]:80;
    server_name ${domain};
    client_max_body_size 1024M;

    location / {
        root ${fpath};
        index index.html index.htm;
    }

    location /api {
        rewrite /api(.*) /$1 break;
        proxy_pass 127.0.0.1:4243;
        proxy_http_version 1.1;
        proxy_set_header Host $http_host;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 15;
        proxy_connect_timeout 15;
        proxy_send_timeout 15;
    }
}
`;

        const confTemp = `export const API = "http://${domain}/api";
export const FRONTEND = "http://${domain}";
export const FIRST_TIME = false;
`;
        let transaction = this.nginxCM.state.update({
            changes: {
                from: 0,
                to: this.nginxCM.state.doc.length,
                insert: nginxTemp
            }
        });
        this.nginxCM.update([transaction]);

        transaction = this.frontendCM.state.update({
            changes: {
                from: 0,
                to: this.frontendCM.state.doc.length,
                insert: confTemp
            }
        });
        this.frontendCM.update([transaction]);
    }

    fileInfo(id, event) {
        const f = sql(this.queries.findFileById, { ":id": id }, true);

        if (this.notesCM) {
            const ranges = session.notesCM.state.selection.ranges[0];
            const tags = sql(this.queries.findTagsOfFile, { ":id": id }, false);
            let inserted = `[[${f[0].realfile}]]`;
            if (tags.find(pred => {
                return pred.tag == "Note";
            })) {
                inserted = `((${f[0].id}))`;
            } else if (tags.find(pred => {
                return pred.tag == "Image";
            })) {
                inserted = `![[${f[0].realfile}]]`;
            }

            let transaction = this.notesCM.state.update({
                changes: {
                    from: ranges.from,
                    to: ranges.to,
                    insert: inserted
                }
            });
            this.notesCM.update([transaction]);
            return;
        }

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
                this.publicEl = document.querySelector("#public");
                this.unlistedEl = document.querySelector("#unlisted");
                this.confidentialEl = document.querySelector("#confidential");
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
                this.tagsInputEl = document.querySelector("#tags-input");
                this.publicEl = document.querySelector("#public");
                this.unlistedEl = document.querySelector("#unlisted");
                this.confidentialEl = document.querySelector("#confidential");
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
            this.message("Error: cannot locate " + id, "This file doesn't exist in the database. It's possible the database is outdated or something fishy is happening. Try refreshing, and if it doesn't work, please file an issue.");
            this.lastSelectedID = -1;
            this.dumpVariables();
            return;
        }
        
        this.setInfoPaneContent(getFileInfo(f[0]));
        this.fileNameInputEl = document.querySelector("#file-name-input");
        this.tagsInputEl = document.querySelector("#tags-input");
        this.fileUrlEl = document.querySelector("#file-url");
        this.publicEl = document.querySelector("#public");
        this.unlistedEl = document.querySelector("#unlisted");
        this.confidentialEl = document.querySelector("#confidential");

        if (window.innerWidth > 645 && this.tagsInputEl) {
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

        if (thisSelectedEntry) {
            thisSelectedEntry.classList.add("selected");
        }
        
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

    showNginxGuide() {
        document.querySelector("#non-nginx-warning").classList.add("hidden");
        document.querySelector("#nginx-collapser").classList.remove("hidden");
    }

    showNonNginxGuide() {
        document.querySelector("#non-nginx-warning").classList.remove("hidden");
        document.querySelector("#nginx-collapser").classList.add("hidden");
    }
}

const loginPage = `
<div class="container-center">
    <div class="info-pane-operations">
        <h2>Login</h2>
        <div class="info-pane-pairs">
            <div class="info-pane-label">Username</div>
            <div class="info-pane-input">
                <input onkeydown="return checkSlash(event.key)" id="username" class="controls info-pane-tags-input" value="">
            </div>
        </div>
        <div class="info-pane-pairs">
            <div class="info-pane-label">Password</div>
            <div class="info-pane-input">
                <input onkeydown="return checkSlash(event.key)" id="password" type="password" class="controls info-pane-tags-input" value="">
            </div>
        </div>
        <div onclick="session.doLogin()" class="control-button controls with-icon control-button-row">
            <img src="assets/key.svg" class="icon-controls">
            <div>Login</div>
        </div>
    </div>
</div>
`;

const registerPage = `
<div class="container-center">
    <div class="info-pane-operations">
        <h2>Register</h2>
        <div class="info-pane-pairs">
            <div class="info-pane-label">Username</div>
            <div class="info-pane-input">
                <input id="username" class="controls info-pane-tags-input" value="">
            </div>
        </div>
        <div class="info-pane-pairs">
            <div class="info-pane-label">Password</div>
            <div class="info-pane-input">
                <input id="password" type="password" class="controls info-pane-tags-input" value="">
            </div>
        </div>
        <div class="info-pane-pairs">
            <div class="info-pane-label">Confirm password</div>
            <div class="info-pane-input">
                <input id="password-again" type="password" class="controls info-pane-tags-input" value="">
            </div>
        </div>
        <div class="info-pane-pairs">
            <div class="info-pane-label">Invitation code</div>
            <div class="info-pane-input">
                <input id="invitation" class="controls info-pane-tags-input" value="">
            </div>
        </div>
        <div onclick="session.doRegister()" class="control-button controls with-icon control-button-row">
            <img src="assets/asterisk_yellow.svg" class="icon-controls">
            <div>Register</div>
        </div>
    </div>
</div>
`;

const testsPage = `
<div class="container-center">
    <div class="info-pane-operations">
        <h2>Debug panel</h2>
        <div class="info-pane-pairs">
            <div class="info-pane-label">Debug input</div>
            <div class="info-pane-input">
                <input id="test-input" class="controls info-pane-tags-input" value="">
            </div>
        </div>
        <div class="info-pane-pairs">
            <div class="info-pane-label">File select</div>
            <div class="info-pane-input">
                <input id="test-file" type="file" class="controls info-pane-tags-input" value="">
            </div>
        </div>
        <div class="test-operations">
            <div onclick="session.testGet()" class="control-button controls with-icon control-button-tight">
                <img src="assets/bug_go.svg" class="icon-controls">
                <div>GET</div>
            </div>
            <div onclick="session.testRegister()" class="control-button controls with-icon control-button-tight">
                <img src="assets/bug_go.svg" class="icon-controls">
                <div>Test registration</div>
            </div>
            <div onclick="session.testLogin()" class="control-button controls with-icon control-button-tight">
                <img src="assets/bug_go.svg" class="icon-controls">
                <div>Test login</div>
            </div>
            <div onclick="session.testBadLogin()" class="control-button controls with-icon control-button-tight">
                <img src="assets/bug_go.svg" class="icon-controls">
                <div>Test malformed login</div>
            </div>
            <div onclick="session.testMakeCode()" class="control-button controls with-icon control-button-tight">
                <img src="assets/bug_go.svg" class="icon-controls">
                <div>Test invitation code</div>
            </div>
            <div onclick="session.testUpload()" class="control-button controls with-icon control-button-tight">
                <img src="assets/bug_go.svg" class="icon-controls">
                <div>Test file upload</div>
            </div>
            <div onclick="session.testClearCached()" class="control-button controls with-icon control-button-tight">
                <img src="assets/bug_go.svg" class="icon-controls">
                <div>Clear cache</div>
            </div>
            <div onclick="session.testPreflight()" class="control-button controls with-icon control-button-tight">
                <img src="assets/bug_go.svg" class="icon-controls">
                <div>Test preflight</div>
            </div>
            <div onclick="session.testListAllDb()" class="control-button controls with-icon control-button-tight">
                <img src="assets/bug_go.svg" class="icon-controls">
                <div>List all databases</div>
            </div>
            <div onclick="session.testAQE()" class="control-button controls with-icon control-button-tight">
                <img src="assets/bug_go.svg" class="icon-controls">
                <div>Arbitrary query</div>
            </div>
            <div onclick="session.dumpDatabase()" class="control-button controls with-icon control-button-tight">
                <img src="assets/bug_go.svg" class="icon-controls">
                <div>Test DB dump</div>
            </div>
            <div onclick="session.loadDatabase()" class="control-button controls with-icon control-button-tight">
                <img src="assets/bug_go.svg" class="icon-controls">
                <div>Test DB load</div>
            </div>
            <div onclick="session.testStopServiceWorkers()" class="control-button controls with-icon control-button-tight">
                <img src="assets/bug_go.svg" class="icon-controls">
                <div>Stop all ServiceWorkers</div>
            </div>
        </div>
    </div>
</div>
`;

const neutralPage = `
<div class="container-center">
    <h1 class="gray">Welcome to PENEfiles.</h1>
</div>`;

const wizardPage = `
<div class="info-pane-table-container big-screen-h-center flex-1">
    <div class="markdown-preview">
        <h2 class="file-name-title">Welcome to PENEfiles!</h2>
        <p>
            Hello, and welcome to PENEfiles. You have successfully got the thing up & running, (well, at least the frontend part). Some additional configs are required for a your personal fully functional tag-based file management system, though. Answer the following questions so that we can get it set up together.
        </p>

        <div class="info-pane-pairs">
            <div class="info-pane-label">What are you using?</div>
            <div class="info-pane-checkbox">
                <label for="nginx" class="radio-option controls" onclick="session.showNginxGuide()">
                    <input class="controls" type="radio" id="nginx" name="nginx">
                    <span>NGINX</span>
                </label>
            </div>
            <label for="not-nginx" class="radio-option controls" onclick="session.showNonNginxGuide()">
                <input class="controls" type="radio" id="not-nginx" name="nginx">
                <span>Not NGINX</span>
            </label>
        </div>

        <div class="info-pane-operations hidden" id="non-nginx-warning">
            <p>
                Since I didn't work with other web servers before, I can't really help you; however, the core concepts are the same, so here's what you need to do:
            </p>
            <ul>
                <li>Setup a virtual host and point / to where the frontend is.</li>
                <li>Setup a reverse proxy at /api to localhost:4243.</li>
                <li>Update <code>frontend/js/config.js</code> and set the <code>API</code> url accordingly.</li>
            </ul>
        </div>

        <div id="nginx-collapser" class="hidden">
            <div class="info-pane-pairs">
                <div class="info-pane-label">Where is the frontend?</div>
                <div class="info-pane-input">
                    <input id="frontend-path" class="controls info-pane-tags-input" value="" name="frontend-path" onkeyup="session.refreshConfs()">
                </div>
            </div>
            <p class="input-hint">Please specify the <strong>parent directory</strong> of PENEfile's index.html.</p>
            <div class="info-pane-pairs">
                <div class="info-pane-label">Server domain name?</div>
                <div class="info-pane-input">
                    <input id="domain" class="controls info-pane-tags-input" value="" name="domain" onkeyup="session.refreshConfs()">
                </div>
            </div>
            <p class="input-hint">Doesn't have to be a proper domain name - it can be an IP as well, e.g. 10.0.0.1.</p>
            <div class="setup-results hidden">
                <p>
                    Here's your NGINX config. Add it to your config files in <code>/etc/nginx/conf.d</code> or whatever.
                </p>
                <div class="guide-code notes-area-container input-hint" id="nginx-conf">
                </div>
                <p>
                    Here's the frontend config file. Replace the innards of <code>frontend/js/config.js</code> with the following.
                </p>
                <div class="guide-code notes-area-container input-hint" id="frontend-conf">
                </div>
                <p>After you put those into place, go and visit the new frontend path.</p>
            </div>
        </div>
    </div>
</div>
`;

function getUserInfo() {
    return `
    <h2 class="file-name-title">User: ${session.username}</h2>
    <div class="info-pane-operations-container">
        <div class="file-operations">
            <div onclick="session.doLogout()" class="control-button with-icon controls">
                <img class="icon-controls" src="assets/disconnect.svg">
                <div>Logout</div>
            </div>
        </div>
    </div>
    <div class="info-pane-operations-container">
        <div class="info-pane-operations">
            <div class="info-pane-pairs">
                <div class="info-pane-label">Original password</div>
                <div class="info-pane-input">
                    <input type="password" class="controls info-pane-tags-input" value="">
                </div>
            </div>
            <div class="info-pane-pairs">
                <div class="info-pane-label">New password</div>
                <div class="info-pane-input">
                    <input type="password" class="controls info-pane-tags-input" value="">
                </div>
            </div>
            <div class="padding-top-5px">
                <div class="control-button with-icon controls inline-control-button">
                    <img class="icon-controls" src="assets/brick_go.svg">
                    <div>Save</div>
                </div>
            </div>
        </div>
    </div>
    <div class="info-pane-operations-container">
        <div class="info-pane-operations">
            <p class="padding-top-5px gray">You can invite your friends to your instance by giving them an invitation code. The code will expire after ONE (1) use.</p>
            <div class="info-pane-pairs">
                <div class="info-pane-label">Generate invitation code</div>
                <div class="info-pane-input">
                    <input id="generated-code" placeholder="Generated code" class="controls info-pane-tags-input" value="">
                </div>
            </div>
            <div class="padding-top-5px">
                <div class="control-button with-icon controls inline-control-button" onclick="session.generateCode()">
                    <img class="icon-controls" src="assets/asterisk_yellow.svg">
                    <div>Generate</div>
                </div>
            </div>

        </div>
    </div>
    `;
}

export function sql(query, binds, once) {
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
    let allTags = [];
    
    for (const f of files) {
        let userTag = sql(session.queries.findUserTagOfFile, { ":id": f.id }, false);
        let tags = sql(session.queries.findTagsOfFile, { ":id": f.id }, false);

        let tagHTML = "";
        for (const tag of tags) {
            let isUserTag = false;
            for (const u of userTag) {
                if (tag.tag == u.tag) {
                    tagHTML += `<div class="user tag">${tag.tag}</div>`;

                    const foundTag = allTags.find(pred => {
                        return pred.tag == tag.tag;
                    });
                    if (!foundTag) {
                        allTags.push({
                            tag: tag.tag,
                            user: true,
                            occurance: 1
                        });
                    } else {
                        foundTag.occurance++;
                    }
                    
                    isUserTag = true;
                    break;
                }
            }
            if (isUserTag) {
                continue;
            }
            tagHTML += `<div class="tag">${tag.tag}</div>`;
            
            const foundTag = allTags.find(pred => {
                return pred.tag == tag.tag;
            });
            if (!foundTag) {
                allTags.push({
                    tag: tag.tag,
                    user: false,
                    occurance: 1
                });
            } else {
                foundTag.occurance++;
            }
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

        let confidentiality = ``;
        if (f.confidentiality == 1) {
            confidentiality = `
                <img src="assets/package.svg" class="file-name-lock">
            `;
        } else if (f.confidentiality == 2) {
            confidentiality = `
                <img src="assets/lock.svg" class="file-name-lock">
            `;
        }

        ret += `
        <div id="file-entry-${f.id}" onclick="session.fileInfo(${f.id}, event)" class="file-entry controls ${selected}">
            <div class="file-info">
                <div class="file-name">
                    ${confidentiality} 
                    <span class="file-name-text">${f.filename}</span>
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

    session.acTagsList = allTags;
    return ret;
}

export function getFileInfo(f) {
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
    const isTiff = f.filename.endsWith(".tif") || f.filename.endsWith(".tiff");
    const isMarkdown = f.filename.endsWith(".md");
    
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
                Your browser may not support playing videos.
            </video>
        </div>`;
    }
    if (hasAudio.length > 0) {
        preview += `
        <div class="big-image-preview">
            <audio controls>
                <source src="${API}/${f.realfile}/${f.filename}">
                Your browser may not support playing videos.
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
            session.message("Error: cannot preview .doc", e.toString());
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
                console.log("A", canvas.width);
            } else {
                canvas.width = session.infoPaneEl.clientWidth * 2;
                console.log(canvas.width);
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
                    session.message("Error: cannot render .pdf", e.toString());
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
                        <div>Prev. page</div>
                    </div>
                    <div id="next-page" class="control-button with-icon controls">
                        <img class="icon-controls" src="assets/book_next.svg">
                        <div>Next page</div>
                    </div>
                </div>
            </div>
            
            <canvas class="preview-canvas"></canvas>
        `;
    }
    if (isTiff) {
        fetch(`${API}/${f.realfile}/${f.filename}`).then(res => {
            return res.arrayBuffer();
        }).then(ab => {
            let src = UTIF.bufferToURI(ab);
            document.querySelector(".big-image-preview").innerHTML = `
                <img src="${src}">
            `;
        }).catch(e => {
            session.message(`Error: cannot preview ${f.filename}`, e.toString());
        });
    }
    if (isMarkdown) {
        fetch(`${API}/${f.realfile}/${f.filename}`).then(res => {
            return res.text();
        }).then(text => {
            let preview = document.querySelector(".markdown-preview");
            // Escape every backslash (that is NOT \n)
            let escaped = text.replaceAll("\\", "\\\\");
            let parsed = marked.parse(escaped);
            let crossrefsRegex = /\(\((\d+)\)\)/g;
            let matches = [...parsed.matchAll(crossrefsRegex)];

            for (const m of matches) {
                const f = sql(session.queries.findFileById, { ":id": +m[1] }, true);
                let filename = "???";
                if (f.length == 0) {
                    session.message("Error: cannot find crossref in note", `${m[1]} no longer exists. Was it deleted?`);
                } else {
                    filename = f[0].filename;
                }
                parsed = parsed.replace(m[0], `
                    <a href="javascript:session.fileInfo(${m[1]})" class="controls note-crossref">
                        <img src="assets/page_white_edit.svg" class="icon-controls">
                        <span class="crossref-label">${filename}</span>
                    </a>
                `);
            }
            
            let attachmentRegex = /\!?\[\[(.+)\]\]/g;
            matches = [...parsed.matchAll(attachmentRegex)];
            for (const m of matches) {
                const f = sql(session.queries.getFileFromRealfile, { ":realfile": m[1] }, true);
                let filename = "???";
                let href = "#";
                if (f.length == 0) {
                    session.message("Error: cannot find file referenced in note", `${m[1]} no longer exists. Was it deleted?`);
                } else {
                    filename = f[0].filename;
                    href = `${API}/${m[1]}/${filename}`;
                }
                let isImage = m[0].startsWith("!");
                if (!isImage) {
                    parsed = parsed.replace(m[0], `
                        <a href="${href}" class="controls note-crossref">
                            <img src="assets/attach.svg" class="icon-controls">
                            <span class="crossref-label">${filename}</span>
                        </a>
                    `);
                } else {
                    parsed = parsed.replace(m[0], `
                        <a href="${href}"><img src="${href}" alt="${filename}"></a>
                    `);
                }
                
            }

            preview.innerHTML = parsed;
            document.querySelector("#markdown-src").innerHTML = text;
            MathJax.typeset([preview]);
        }).catch(e => {
            session.message(`Error: cannot preview ${f.filename}`, e.toString());
        });
        preview += `
            <div class="info-pane-table-container big-screen-h-center flex-1">
                <div class="markdown-preview"></div>
            </div>
        `;

        return `
            <div class="info-pane-operations-container sticky">
                <div class="file-operations">
                    <div onclick="session.doEditNote()" class="control-button with-icon controls">
                        <img class="icon-controls" src="assets/page_white_edit.svg">
                        <div>Edit note</div>
                    </div>
                    <a href="${API}/${f.realfile}/${f.filename}" class="control-button with-icon controls">
                        <img class="icon-controls" src="assets/disk.svg">
                        <div>Download</div>
                    </a>
                    <div onclick="session.doDelete()" class="control-button with-icon controls">
                        <img class="icon-controls" src="assets/bin.svg">
                        <div>Delete</div>
                    </div>
                    <div onclick="session.doShare()" class="control-button with-icon controls">
                        <img class="icon-controls" src="assets/link.svg">
                        <div>Share</div>
                    </div>
                </div>
            </div>
            <h5 class="file-name-title gray">${f.filename}</h5>
            <div class="hidden" id="markdown-src"></div>
            <input id="file-url" value="${encodeURI(API + "/" + f.realfile + "/" + f.filename)}" class="readonly hidden">
            ${preview}
        `;
    }

    return `
    <h2 class="file-name-title">${f.filename}</h2>
    <div class="info-pane-operations-container">
        <div class="file-operations">
            <div onclick="session.doDelete()" class="control-button with-icon controls">
                <img class="icon-controls" src="assets/bin.svg">
                <div>Delete</div>
            </div>
            <a href="${API}/${f.realfile}/${f.filename}" class="control-button with-icon controls">
                <img class="icon-controls" src="assets/disk.svg">
                <div>Download</div>
            </a>
            <input id="file-url" value="${encodeURI(API + "/" + f.realfile + "/" + f.filename)}" class="readonly hidden">
            <div onclick="session.doUpdate()" class="control-button with-icon controls">
                <img class="icon-controls" src="assets/brick_go.svg">
                <div>Save</div>
            </div>
            <div onclick="session.doShare()" class="control-button with-icon controls">
                <img class="icon-controls" src="assets/link.svg">
                <div>Share</div>
            </div>
        </div>
    </div>
    <div class="info-pane-operations">
        <div class="info-pane-pairs">
            <div class="info-pane-label">File name</div>
            <div class="info-pane-input">
                <input onkeydown="return checkSlash(event.key)" onchange="session.doUpdate()" id="file-name-input" class="controls info-pane-tags-input" value="${f.filename}">
            </div>
        </div>
        <div class="info-pane-pairs">
            <div class="info-pane-label">Tag(s)</div>
            <div class="info-pane-input">
                <input onkeydown="return checkSlash(event.key)" onchange="session.doUpdate()" id="tags-input" class="controls info-pane-tags-input" value="${tagsStr}">
            </div>
        </div>
        <div class="info-pane-pairs">
            <div class="info-pane-label">Confidentiality</div>
            <div class="info-pane-checkbox">
                <label for="public" class="radio-option controls">
                    <input ${f.confidentiality == 0 ? `checked="checked"` : ""} onchange="session.doUpdate()" class="controls" type="radio" id="public" name="confidentiality">
                    <span>Public</span>
                </div>
                <label for="unlisted" class="radio-option controls">
                    <input ${f.confidentiality == 1 ? `checked="checked"` : ""} onchange="session.doUpdate()" class="controls" type="radio" id="unlisted" name="confidentiality">
                    <span>Unlisted</span>
                </label>
                <label for="confidential" class="radio-option controls">
                    <input ${f.confidentiality == 2 ? `checked="checked"` : ""} onchange="session.doUpdate()" class="controls" type="radio" id="confidential" name="confidentiality">
                    <span>Private</span>
                </div>
            </div>
        </div>
    </div>
    ${preview}
    <div class="info-pane-table-container">
        <div class="info-pane-table">
            <div class="info-pane-label">File size</div>
            <div>${getSize(f.size)} (${f.size}b)</div>
            <div class="info-pane-label">Date created</div>
            <div>${f.created_at}</div>
            <div class="info-pane-label">Last modified</div>
            <div>${f.modified_at}</div>
            <div class="info-pane-label">Uploaded</div>
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
    <h2 class="file-name-title">${selections.length} selected</h2>
    <div class="info-pane-operations-container">
        <div class="file-operations">
            <div onclick="session.doMultiDelete()" class="control-button with-icon controls">
                <img class="icon-controls" src="assets/bin.svg">
                <div>Delete</div>
            </div>
            <a onclick="session.doMultiDownload()" class="control-button with-icon controls">
                <img class="icon-controls" src="assets/disk.svg">
                <div>Download</div>
            </a>
            <div onclick="session.doMultiUpdate()" class="control-button with-icon controls">
                <img class="icon-controls" src="assets/brick_go.svg">
                <div>Save</div>
            </div>
        </div>
    </div>
    <div class="info-pane-operations">
        <div class="info-pane-pairs">
            <div class="info-pane-label">Tag(s)</div>
            <div class="info-pane-input">
                <input onkeydown="return checkSlash(event.key)" id="tags-input" class="controls info-pane-tags-input" value="${baseTag}">
            </div>
        </div>
        <div class="info-pane-pairs">
            <div class="info-pane-label">Confidentiality</div>
            <div class="info-pane-checkbox">
                <label for="public" class="radio-option controls">
                    <input class="controls" type="radio" id="public" name="confidentiality">
                    <span>Public</span>
                </div>
                <label for="unlisted" class="radio-option controls">
                    <input class="controls" type="radio" id="unlisted" name="confidentiality">
                    <span>Unlisted</span>
                </label>
                <label for="confidential" class="radio-option controls">
                    <input class="controls" type="radio" id="confidential" name="confidentiality">
                    <span>Private</span>
                </div>
            </div>
        </div>
    </div>
    `;
}

function getCreateNotes(filename, tags) {
    return `<div class="info-pane-operations">
        <div class="info-pane-pairs">
            <div class="info-pane-label">File name</div>
            <div class="info-pane-input">
                <input id="file-name-input" onkeydown="return checkSlash(event.key)" id="file-name-input" class="controls info-pane-tags-input" value="${filename}">
            </div>
        </div>
        <div class="info-pane-pairs">
            <div class="info-pane-label">Tag(s)</div>
            <div class="info-pane-input">
                <input id="tags-input" onkeydown="return checkSlash(event.key)" id="tags-input" class="controls info-pane-tags-input" value="${tags}">
            </div>
        </div>
        <div class="info-pane-pairs">
            <div class="info-pane-label">Confidentiality</div>
            <div class="info-pane-checkbox">
                <label for="public" class="radio-option controls">
                    <input checked="checked" class="controls" type="radio" id="public" name="confidentiality">
                    <span>Public</span>
                </div>
                <label for="unlisted" class="radio-option controls">
                    <input class="controls" type="radio" id="unlisted" name="confidentiality">
                    <span>Unlisted</span>
                </label>
                <label for="confidential" class="radio-option controls">
                    <input class="controls" type="radio" id="confidential" name="confidentiality">
                    <span>Private</span>
                </div>
            </div>
        </div>
    </div>
    <div class="info-pane-operations-container sticky">
        <div class="file-operations">
            <div onclick="session.doSubmitNote()" class="control-button with-icon controls">
                <img class="icon-controls" src="assets/page_white_edit.svg">
                <div>Create note</div>
            </div>
        </div>
    </div>
    <div class="notes-area-container">
        
    </div>`;
}

function getModifyNotes(filename, tags, confidentiality) {
    return `<div class="info-pane-operations">
        <div class="info-pane-pairs">
            <div class="info-pane-label">File name</div>
            <div class="info-pane-input">
                <input id="file-name-input" onkeydown="return checkSlash(event.key)" id="file-name-input" class="controls info-pane-tags-input" value="${filename}">
            </div>
        </div>
        <div class="info-pane-pairs">
            <div class="info-pane-label">Tag(s)</div>
            <div class="info-pane-input">
                <input id="tags-input" onkeydown="return checkSlash(event.key)" id="tags-input" class="controls info-pane-tags-input" value="${tags}">
            </div>
        </div>
        <div class="info-pane-pairs">
            <div class="info-pane-label">Confidentiality</div>
            <div class="info-pane-checkbox">
                <label for="public" class="radio-option controls">
                    <input ${confidentiality == 0 ? `checked="checked"` : ""} class="controls" type="radio" id="public" name="confidentiality">
                    <span>Public</span>
                </div>
                <label for="unlisted" class="radio-option controls">
                    <input ${confidentiality == 1 ? `checked="checked"` : ""} class="controls" type="radio" id="unlisted" name="confidentiality">
                    <span>Unlisted</span>
                </label>
                <label for="confidential" class="radio-option controls">
                    <input ${confidentiality == 2 ? `checked="checked"` : ""} class="controls" type="radio" id="confidential" name="confidentiality">
                    <span>Private</span>
                </div>
            </div>
        </div>
    </div>
    <div class="info-pane-operations-container sticky">
        <div class="file-operations">
            <div onclick="session.doSaveNote()" class="control-button with-icon controls">
                <img class="icon-controls" src="assets/page_white_edit.svg">
                <div>Save</div>
            </div>
            <div onclick="session.doDiscardNote()" class="control-button with-icon controls">
                <img class="icon-controls" src="assets/cancel.svg">
                <div>Abort</div>
            </div>
            <div onclick="session.doDelete()" class="control-button with-icon controls">
                <img class="icon-controls" src="assets/bin.svg">
                <div>Delete</div>
            </div>
        </div>
    </div>
    <div class="notes-area-container">
        
    </div>`;
}


window.checkSlash = (k) => {
    if (k == "/") {
        return false;
    }
    return true;
}

// Hotkeys 
window.onkeyup = (e) => {
    if (e.srcElement.classList.contains("cm-content")) {
        return false;
    }
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
