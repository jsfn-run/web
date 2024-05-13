import { customElement } from './decorators.js';
import { dispatch, select, watch } from '../store/store.js';
import { html } from './component.js';

const t = html`
  <div class="flex items-center p-2">
    <button class="w-6 h-6" ^click="create" .hidden="notLoggedIn"><span class="material-icons">add</span></button>
    <select class="bg-transparent font-small w-72 p-3" .hidden="noFunctions"></select>
    <button class="w-6 h-6" ^click="editname" .hidden="noFunctionSelected">
      <span class="material-icons">edit</span>
    </button>
    <button class="w-6 h-6" ^click="deleteFn" .hidden="noFunctionSelected">
      <span class="material-icons">delete</span>
    </button>
  </div>
`;

@customElement('js-selector', t)
export class Selector extends HTMLElement {
  options = select((s) => s.functionList);
  noFunctions = select((s) => !s.functionList?.length);
  noFunctionSelected = select((s) => !s.currentFunction?.id);
  selected = select((s) => s.currentFunction?.id || '');
  notLoggedIn = select((s) => !s.profileId);

  connectedCallback() {
    const selector = this.querySelector('select')!;

    selector.onchange = () => {
      const index = selector.selectedIndex;
      const options = this.options.value || [];

      if (index > 0) {
        const v = options[index - 1];
        dispatch('selectFunction', v);
      }
    };

    watch(this.options, () => this.updateOptions());
  }

  updateOptions() {
    const selector = this.querySelector('select')!;
    const mappedOptions = this.options.value!.map((f) => ({ label: f.name, value: f }));

    const options = [
      { label: `${this.getAttribute('placeholder') || 'Select an option'}`, value: { id: '' } },
      ...mappedOptions,
    ];

    selector.innerHTML = '';

    options.map((option) => {
      const o = document.createElement('option');
      o.innerText = option.label;
      o.selected = this.selected.value === option.value.id;
      selector.append(o);
    });
  }
}
