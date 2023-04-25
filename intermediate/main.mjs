import { EditorView, basicSetup } from "codemirror";
import { markdown } from "@codemirror/lang-markdown";

window.createCodeMirror = el => {
    return new EditorView({
        extensions: [basicSetup, markdown(), EditorView.lineWrapping],
        parent: el
    });
};
