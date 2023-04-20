import { Penefiles } from "./penefiles.js"


window.SQL = await initSqlJs({
    locateFile: file => `js/sqljs-wasm/sql-wasm.wasm`
});

window.session = new Penefiles();
window.session.doQuickSearch();
window.session.doRefresh().then(() => {

});
