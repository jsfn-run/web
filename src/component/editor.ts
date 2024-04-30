import CodeMirror from '../vendor/codemirror.js';
import { customElement } from './decorators.js';
import { dispatch, select, watch } from '../store/store.js';

@customElement('js-editor')
export class Editor extends HTMLElement {
  private editor: any = null;
  private handler: any = null;
  private fileContents = select((s) => s.currentFile?.contents || '');

  get value() {
    return this.editor?.getValue();
  }

  set value(v) {
    if (this.value !== v) {
      this.editor?.setValue(v);
    }
  }

  connectedCallback() {
    const editor: any = new CodeMirror(this, { lineNumbers: true });
    this.editor = editor;

    editor.getWrapperElement().style.fontSize = '12px';
    editor.on('change', () => {
      dispatch('updateCurrentFileContent', this.value);
      dispatch('autosave');
    });

    watch(this.fileContents, (v) => {
      this.value = v;
      editor.refresh();
    });

    this.editor.refresh();
    this.handler = window.addEventListener('resize', () => this.editor.refresh());
  }

  disconnectedCallback() {
    this.handler();
    this.handler = null;
  }
}
