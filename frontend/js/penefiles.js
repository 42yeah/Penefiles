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
        this.fileListElContent = "";
        this.infoPaneElContent = "";
        this.API = "http://127.0.0.1:4243";
    }

    updateFileList() {
        this.fileListElContent = what;
        this.fileListEl.innerHTML = what;
    }

    setInfoPaneContent(what) {
        this.infoPaneElContent = what;
        this.infoPaneEl.innerHTML = what;
    }

    doLogin() {

    }

    doRegister() {
        const username = this.usernameEl.value;
        const password = this.passwordEl.value;
        // TODO: invitation & more.

        fetch(`${this.API}/users/register`, {
            method: "POST",
            body: JSON.stringify({
                username: username,
                password: password
            })
        }).then(res => {
            return res.json();
        }).then(json => {
            console.log(json);
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
        });
    }

    // UIs
    login() {
        this.setInfoPaneContent(loginPage);
        this.usernameEl = document.querySelector("#username");
        this.passwordEl = document.querySelector("#password");
    }

    register() {
        this.setInfoPaneContent(registerPage);
        this.usernameEl = document.querySelector("#username");
        this.passwordEl = document.querySelector("#password");
        this.passwordAgainEl = document.querySelector("#password-again");
        this.invitationEl = document.querySelector("#invitation");
    }

    tests() {
        this.setInfoPaneContent(testsPage);
        this.testInputEl = document.querySelector("#test-input");
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
            <div onclick="session.testMakeCode()" class="control-button controls with-icon control-button-tight">
                <img src="assets/bug_go.svg" class="icon-controls">
                <div>测试邀请码生成</div>
            </div>
        </div>
    </div>
    
</div>
`;