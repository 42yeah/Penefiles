import { Penefiles } from "./penefiles.js"


window.SQL = await initSqlJs({
    locateFile: file => `js/sqljs-wasm/sql-wasm.wasm`
});

window.session = new Penefiles();
window.session.doRefresh().then(() => {
    if (window.session.lastSelectedID > 0) {
        window.session.fileInfo(window.session.lastSelectedID);
    }
});
