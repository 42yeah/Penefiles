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
        containerEl.innerHTML = `You need to provide a note ID.`;
        return;
    }
    const f = sql(session.queries.findFileById, { ":id": +id }, true);
    if (f.length == 0) {
        containerEl.innerHTML = `Cannot locate note.`;
        return;
    }
    const tags = sql(session.queries.findTagsOfFile, { ":id": +id }, false);
    if (!tags.find(pred => {
        return pred.tag == "Note"
    })) {
        containerEl.innerHTML = `That's not a note.`;
        return;
    }

    containerEl.innerHTML = getFileInfo(f[0]);
});
