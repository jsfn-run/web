import { Store } from 'https://store.homebots.io/index.mjs';
import {
  listFiles,
  writeMetadata,
  readMetadata,
  readFile,
  writeFile,
  createFile,
  createBin,
  removeBin,
  getZipUrl,
} from 'https://bin.homebots.io/index.mjs';
import {
  getProfile,
  getProperty,
  setProperty,
  signIn,
  signOut,
  isAuthenticated,
  events as authEvents,
} from 'https://auth.jsfn.run/index.mjs';

import { useState } from '../vendor/state.js';

export type FileEntry = {
  contents: string;
  meta?: Record<string, string>;
};

export type FunctionEntry = {
  id: string;
  binId: string;
  name: string;
};

const initialState = {
  fileList: [] as FileEntry[],
  functionList: [] as FunctionEntry[],
  currentFunction: {} as FunctionEntry | null,
  currentFile: null as FileEntry | null,
  binId: '',
  storeId: '',
  profileId: '',
};

async function fetchFile(binId, fileId) {
  const meta = await readMetadata(binId, fileId);
  const file = { meta, contents: "" };
  const contents = await readFile(binId, fileId);
  file.contents = await contents.text();

  return file;
}

const actions = {
  async create() {
    const name = prompt('New function name');

    if (!name) return;

    const id = crypto.randomUUID();
    const { binId } = await createBin();
    const fn = { id, binId, name };

    await getResourceStore().getResource("fn").set(id, fn);

    await dispatch("selectFunction", fn);
    const index = await dispatch("addFile", "index.mjs");
    const manifest = await dispatch("addFile", "package.json");

    index!.contents = `
export default {
  actions: {
    fn: {
      default: true,
      async handler(input, output) {
        // TODO
      }
    }
  }
}`;

    manifest!.contents = JSON.stringify({ name, dependencies: {} }, null);

    await dispatch("saveFile", index);
    await dispatch("saveFile", manifest);

    const files = get("fileList");
    await dispatch("selectFile", files[0] || null);
  },

  async editname() {
    const fn = get('currentFunction');

    if (!fn) return;

    const name = prompt('Name', fn.name) || '';

    if (!name) return;

    const newValue = { ...fn, name };
    await getResourceStore().getResource('fn').set(fn.id, newValue);
    set('currentFunction', newValue);
    await dispatch('updateFunctionList');
  },

  async saveFile(file) {
    if (file.meta?.id) {
      await writeFile(get('binId'), file.meta.id, file.contents);
    }
  },

  async addFile(name: string) {
    const binId = get('binId');
    if (!binId) {
      return;
    }

    if (!name) {
      name = prompt('Name for the new file', '') || '';
    }

    if (!name) {
      return;
    }

    const { fileId } = await createFile(binId);
    await writeMetadata(binId, fileId, { name });
    await dispatch('updateFileList');

    return { meta: { id: fileId, name }, contents: '' };
  },

  async updateFileList() {
    const list: FileEntry[] = [];
    const binId = get('binId');

    if (!binId) return;

    const fileIds = await listFiles(binId);

    for (const fileId of fileIds) {
      const file = await fetchFile(binId, fileId);
      list.push(file);
    }

    set('fileList', list);
    commit();
  },

  async updateProfileId() {
    try {
      const p = await getProfile();
      set('profileId', p.id);
    } catch {
      set('profileId', '');
    }
    commit();
  },

  async save() {
    const currentFile = get('currentFile');
    await dispatch('saveFile', currentFile);
  },

  async deleteFn() {
    const fn = get('currentFunction');

    if (fn && confirm(`Are you sure you want to remove "${fn.name}"? NO WAY BACK!`)) {
      await getResourceStore().getResource('fn').remove(fn.id);
      await removeBin(fn.binId);
      await dispatch('unselectFunction');
    }
  },

  updateCurrentFileContent(value) {
    const currentFile = get('currentFile');
    set('currentFile', {
      meta: currentFile?.meta,
      contents: value,
    });
    commit();
  },

  async updateFunctionList() {
    const list: FunctionEntry[] = await getResourceStore().getResource('fn').list();
    set('functionList', list.sort((a, b) => (a.name > b.name ? 1 : -1)));
    commit();
  },

  async signin() {
    try {
      const isAuth = await isAuthenticated();
      if (!isAuth) {
        signIn(true);
      }
    } catch {}
  },

  async signout() {
    await signOut();
  },

  selectFile(file) {
    set('currentFile', file);
    commit();
  },

  unselectFunction() {
    set('binId', '');
    set('currentFile', null);
    set('currentFunction', null);
    set('fileList', []);
  },

  async selectFunction(fn: FunctionEntry) {
    set('binId', fn.binId);
    set('currentFile', null);
    set('currentFunction', fn);

    await dispatch('updateFileList');
    const indexFile = get('fileList').find((f) => f.meta?.name === 'index.mjs');
    await dispatch('selectFile', indexFile);
  },

  async reload() {
    await dispatch('updateFileList');
    await dispatch('updateFunctionList');
  },

  async deploy() {
    const binId = get('binId');
    const fn = get('currentFunction');

    if (!(binId && fn)) {
      return;
    }

    const name = fn.name;
    const source = getZipUrl(binId);
    const body = JSON.stringify({ source, name });
    const headers = {
      'content-type': 'application/json',
    };

    await fetch('https://cloud.jsfn.run', { method: 'POST', body, headers });
  },
  async startup() {
    authEvents.addEventListener('signout', () => dispatch('resetAll'));
    authEvents.addEventListener('signin', async () => dispatch('reloadAll'));

    try {
      await isAuthenticated();
      dispatch('reloadAll');
    } catch {}
  },
  async resetAll() {
    set('currentFile', null);
    set('currentFunction', null);
    set('fileList', []);
    set('functionList', []);
    set('profileId', '');
    set('storeId', '');
    commit();
  },
  async reloadAll() {
    await dispatch('updateProfileId');
    await dispatch('setupStore');
    await dispatch('reload');
  },
  async selectActionFromUrl() {
    const name = new URL(location.href).searchParams.get('fn');

    if (!name) {
      return;
    }

    const fn = get('functionList').find((f) => f.name === name);
    if (fn) {
      await dispatch('selectFunction', fn);
    }
  },
  async setupStore() {
    let storeId = await getProperty('jsfn:storeId');

    if (!storeId) {
      storeId = await Store.create();
      await setProperty('jsfn:storeId', storeId);
    }

    set('storeId', storeId);
    commit();
  },

  autosave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => dispatch('save'), 1000);
  },
};

let saveTimer;

const { set, get, react, watch, select, dispatch, commit } = useState(initialState, actions);

function getResourceStore() {
  return Store.get(get('storeId'));
}

export { get, react, watch, select, dispatch };
