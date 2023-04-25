import { Penefiles, getFileInfo, sql } from "./penefiles.js";

window.SQL = await initSqlJs({
    locateFile: file => `js/sqljs-wasm/sql-wasm.wasm`
});



window.session = new Penefiles(true);
window.session.doRefresh().then(() => {
    const viewportEl = document.querySelector(".viewport");
    const containerEl = document.querySelector(".container");
    const url = new URL(window.location.href);
    const id = url.searchParams.get("id");
    if (!id) {
        containerEl.innerHTML = `你需要提供笔记 ID。`;
        return;
    }
    const f = sql(session.queries.findFileById, { ":id": +id }, true);
    if (f.length == 0) {
        containerEl.innerHTML = `找不到该笔记。`;
        return;
    }
    const tags = sql(session.queries.findTagsOfFile, { ":id": +id }, false);
    if (!tags.find(pred => {
        return pred.tag == "Note"
    })) {
        containerEl.innerHTML = `这个文件不是笔记。`;
        return;
    }

    containerEl.innerHTML = getFileInfo(f[0]);
});
