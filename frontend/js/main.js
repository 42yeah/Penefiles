import { Penefiles } from "./penefiles.js"

window.SQL = await initSqlJs({
    locateFile: file => `js/sqljs-wasm/sql-wasm.wasm`
});

window.session = new Penefiles();
window.session.doQuickSearch();
window.session.doRefresh().then(() => {

});

//
// Register service worker
//
if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/serviceWorker.js").then(registration => {
        console.log("ServiceWorker registered with scope: ", registration.scope);
        registration.addEventListener("updatefound", () => {
            window.session.message("PENEfiles 更新了。", "请刷新页面，享用最新版本的 PENEfiles。");
        });
    }).catch(err => {
        window.session.message("错误：无法注册 ServiceWorker。", "这将导致 PENEfiles 离线不可用。");
    });
}
