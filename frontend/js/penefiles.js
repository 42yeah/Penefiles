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
        this.lastSelectedEntry = null;
        this.API = "http://127.0.0.1:4243";

        // Variables
        this.session = null;
        this.username = "";
        this.fileListElContent = "";
        this.infoPaneElContent = "";
        this.superPositionWindowContent = "";
        this.superPositionWindowShown = false;

        // Data
        this.files = [];
        this.tags = [];
        this.filesTags = [];
        this.filesTagsDict = {};
        this.users = [];

        // SQL database
        this.db = new SQL.Database();
        let dbExec = `CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT UNIQUE, tags TEXT);
            CREATE TABLE files_tags (fileid INTEGER, tag TEXT, UNIQUE(fileid, tag));
            CREATE TABLE files (id INTEGER PRIMARY KEY AUTOINCREMENT, filename TEXT, realfile TEXT UNIQUE, created_at DEFAULT CURRENT_TIMESTAMP, modified_at DEFAULT CURRENT_TIMESTAMP);`;
        this.db.run(dbExec);
        this.queries = {
            createFile: this.db.prepare("INSERT INTO files (id, filename, realfile, created_at, modified_at) VALUES (:id, :filename, :realfile, :created_at, :modified_at);"),
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
            getAllUsers: this.db.prepare("SELECT * FROM users;")
        };
        
        this.loadVariables();
        this.updateTopOperations();
    }

    dumpVariables() {
        localStorage.setItem("penefiles", JSON.stringify({
            session: this.session,
            username: this.username,
            fileListElContent: this.fileListElContent,
            infoPaneElContent: this.infoPaneElContent,
            superPositionWindowContent: this.superPositionWindowContent,
            superPositionWindowShown: this.superPositionWindowShown,
            files: this.files,
            tags: this.tags,
            filesTags: this.filesTags,
            filesTagsDict: this.filesTagsDict,
            users: this.users
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
        this.filesTagsDict = cached["filesTagsDict"];
        this.users = cached["users"];

        // Create database.
        this.updateDb();

        // TODO: update file list content.
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
                ":modified_at": f.modified_at
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
        this.fileListElContent = what;
        this.fileListEl.innerHTML = what;
        this.dumpVariables();
    }

    setInfoPaneContent(what) {
        this.infoPaneElContent = what;
        this.infoPaneEl.innerHTML = what;
        this.dumpVariables();
    }

    setSuperpositionWindowContent(what) {
        this.superPositionWindowContent = what;
        this.superPositionWindowEl.innerHTML = what;
        this.dumpVariables();
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
                console.log(json);
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
                if (allFour == 4)
                {
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
                if (allFour == 4)
                {
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
                if (allFour == 4)
                {
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
                this.filesTagsDict = {};
                for (let i = 0; i < this.filesTags.length; i++) {
                    let d = this.filesTagsDict[this.filesTags[i].fileid];
                    if (!d) {
                        this.filesTagsDict[this.filesTags[i].fileid] = [ this.filesTags[i].tag ];
                    } else {
                        d.push(this.filesTags[i].tag);
                    }
                }
                allFour++;
                if (allFour == 4)
                {
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
        getFileList();
        this.fetchAll().then(() => {
            this.setFileListContent(getFileList());
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

    fileInfo(id) {
        for (let i = 0; i < this.files.length; i++) {
            if (this.files[i].id == id) {
                this.setInfoPaneContent(getFileInfo(this.files[i]));
                break;
            }
        }
        if (this.lastSelectedEntry) {
            this.lastSelectedEntry.classList.remove("selected");
        }
        this.lastSelectedEntry = document.querySelector("#file-entry-" + id);
        this.lastSelectedEntry.classList.add("selected");
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
        </div>
    </div>
    
</div>
`;

function getUserInfo() {
    return `
    <h2 class="file-name-title">用户：${session.username}</h2>
    <div class="info-pane-operations-container">
        <div class="file-operations">
            <div class="control-button with-icon controls">
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

function getFileList() {
    let ret = ``;
    for (let i = 0; i < session.files.length; i++) {
    
        const f = session.files[i];
        let userTag = null;
        let otherTags = "";
        for (let i = 0; i < session.filesTagsDict[f.id].length; i++) {
            const tag = session.filesTagsDict[f.id][i];
            console.log(tag);
            if (userTag == null) {
                for (let j = 0; j < session.users.length; j++) {
                    if (session.users[j].username == tag) {
                        userTag = tag;
                        break;
                    }
                }
            }
            if (tag != userTag) {
                otherTags += `<div class="tag">${tag}</div>`;
            }
            
        }
        ret += `
        <div id="file-entry-${f.id}" onclick="session.fileInfo(${f.id})" class="file-entry controls">
            <div class="file-info">
                <div class="file-name">
                    ${f.filename}
                </div>
                <div class="tags">
                    <div class="invisible tag">
                        20M
                    </div>
                    <div class="invisible tag">
                        ${f.created_at.split(" ")[0]}
                    </div>
                    <div class="user tag">
                        ${userTag}
                    </div>
                    <!-- <div class="file-type tag">文档</div> -->
                    ${otherTags}
                </div>
            </div>
        </div>
        `;
    }
    return ret;
}

function getFileInfo(f) {
    console.log(f);
    let tags = "";
    for (let i = 0; i < session.filesTagsDict[f.id].length; i++) {
        tags += session.filesTagsDict[f.id][i] + " ";
    }
    return `
    <h2 class="file-name-title">${f.filename}</h2>
    <div class="info-pane-operations-container">
        <div class="file-operations">
            <div class="control-button with-icon controls">
                <img class="icon-controls" src="assets/bin.svg">
                <div>删除文件</div>
            </div>
            <a href="${session.API}/${f.realfile}/${f.filename}" class="control-button with-icon controls">
                <img class="icon-controls" src="assets/disk.svg">
                <div>下载文件</div>
            </a>
            <div class="control-button with-icon controls">
                <img class="icon-controls" src="assets/brick_go.svg">
                <div>保存修改</div>
            </div>
        </div>
    </div>
    <div class="info-pane-operations">
        <div class="info-pane-pairs">
            <div class="info-pane-label">标签</div>
            <div class="info-pane-input">
                <input class="controls info-pane-tags-input" value="${tags}">
            </div>
        </div>
        <div class="info-pane-pairs">
            <div class="info-pane-label">私有</div>
            <div class="info-pane-checkbox">
                <input class="controls" type="checkbox">
            </div>
        </div>
    </div>
    <div class="info-pane-table-container">
        <div class="info-pane-table">
            <div class="info-pane-label">大小</div>
            <div>22M (23068672b)</div>
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
