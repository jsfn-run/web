import { customElement } from "./decorators.js";
import { dispatch, select, watch } from "../store/store.js";
import '@sodium/code-editor';

@customElement("js-editor")
export class Editor extends HTMLElement {
  private fileContents = select((s) => s.currentFile?.contents || "");

  connectedCallback() {
    const editor = document.createElement("code-editor") as any;
    this.append(editor);

    editor.addEventListener("change", (event) => {
      dispatch("updateCurrentFileContent", event.detail);
      dispatch("autosave");
    });

    watch(this.fileContents, (v) => {
      if (editor.value !== v) {
        editor.value = v;
      }
    });
  }
}
