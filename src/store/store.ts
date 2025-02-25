import { Store } from "https://store.homebots.io/index.mjs";
import { createStore } from "@li3/store";
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
} from "https://bin.homebots.io/index.mjs";
import {
  getProfile,
  getProperty,
  setProperty,
  signIn,
  signOut,
  isAuthenticated,
  events as authEvents,
} from "https://auth.jsfn.run/index.mjs";

let saveTimer;

function getResourceStore() {
  return Store.get(get((s) => s.storeId));
}

export type FileEntry = {
  contents: string;
  meta?: Record<string, string>;
};

export type FunctionEntry = {
  id: string;
  binId: string;
  name: string;
};

const initialFunctionContent = `
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

const initialState = {
  fileList: [] as FileEntry[],
  functionList: [] as FunctionEntry[],
  currentFunction: {} as FunctionEntry | null,
  currentFile: null as FileEntry | null,
  newFile: null as FileEntry | null,
  binId: "",
  storeId: "",
  profileId: "",
};

async function fetchFile(binId, fileId) {
  const meta = await readMetadata(binId, fileId);
  const file = { meta, contents: "" };
  const contents = await readFile(binId, fileId);
  file.contents = await contents.text();

  return file;
}

const { store, get, select } = createStore(initialState, {
  async create() {
    const name = prompt("New function name");

    if (!name) return;

    const id = crypto.randomUUID();
    const { binId } = await createBin();
    const fn = { id, binId, name };

    await getResourceStore().getResource("fn").set(id, fn);

    await store.selectFunction(fn);
    const index = await store.addFile("index.mjs");
    const manifest = await store.addFile("package.json");

    index!.contents = initialFunctionContent;

    manifest!.contents = JSON.stringify({ name, dependencies: {} }, null);

    await store.saveFile(index);
    await store.saveFile(manifest);

    const files = get((s) => s.fileList);
    await store.selectFile(files[0] || null);
  },

  async editname(state) {
    const fn = get((s) => s.currentFunction);

    if (!fn) return;

    const name = prompt("Name", fn.name) || "";

    if (!name) return;

    const newValue = { ...fn, name };
    await getResourceStore().getResource("fn").set(fn.id, newValue);
    state.currentFunction = newValue;
    await store.updateFunctionList();
  },

  async saveFile(file) {
    if (file.meta?.id) {
      await writeFile(
        get((s) => s.binId),
        file.meta.id,
        file.contents
      );
    }
  },

  async addFile(state, name: string) {
    const binId = get((s) => s.binId);
    if (!binId) {
      return;
    }

    if (!name) {
      name = prompt("Name for the new file", "") || "";
    }

    if (!name) {
      return;
    }

    const { fileId } = await createFile(binId);
    await writeMetadata(binId, fileId, { name });
    await store.updateFileList();

    state.newFile = { meta: { id: fileId, name }, contents: "" };
  },

  async updateFileList(state) {
    const list: FileEntry[] = [];
    const binId = get((s) => s.binId);

    if (!binId) return;

    const fileIds = await listFiles(binId);

    for (const fileId of fileIds) {
      const file = await fetchFile(binId, fileId);
      list.push(file);
    }

    state.fileList = list;
  },

  async updateProfileId(state) {
    try {
      const p = await getProfile();
      state.profileId = p.id;
    } catch {
      state.profileId = "";
    }
  },

  async save() {
    const currentFile = get((s) => s.currentFile);
    await store.saveFile(currentFile);
  },

  async deleteFn() {
    const fn = get((s) => s.currentFunction);

    if (
      fn &&
      confirm(`Are you sure you want to remove "${fn.name}"? NO WAY BACK!`)
    ) {
      await getResourceStore().getResource("fn").remove(fn.id);
      await removeBin(fn.binId);
      await store.unselectFunction();
    }
  },

  updateCurrentFileContent(state, value) {
    const currentFile = get((s) => s.currentFile);
    state.currentFile = {
      meta: currentFile?.meta,
      contents: value,
    };
  },

  async updateFunctionList(state) {
    const list: FunctionEntry[] = await getResourceStore()
      .getResource("fn")
      .list();

    state.functionList = list.sort((a, b) => (a.name > b.name ? 1 : -1));
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

  selectFile(state, file) {
    state.currentFile = file;
  },

  unselectFunction(state) {
    state.binId = "";
    state.currentFile = null;
    state.currentFunction = null;
    state.fileList = [];
  },

  async selectFunction(state, fn: FunctionEntry) {
    state.binId = fn.binId;
    state.currentFile = null;
    state.currentFunction = fn;

    await store.updateFileList();
    const indexFile = get((s) => s.fileList).find(
      (f) => f.meta?.name === "index.mjs"
    );
    await store.selectFile(indexFile);
  },

  async reload() {
    await store.updateFileList();
    await store.updateFunctionList();
  },

  async deploy() {
    const binId = get((s) => s.binId);
    const fn = get((s) => s.currentFunction);

    if (!(binId && fn)) {
      return;
    }

    const name = fn.name;
    const source = getZipUrl(binId);
    const body = JSON.stringify({ source, name });
    const headers = {
      "content-type": "application/json",
    };

    await fetch("https://cloud.jsfn.run", { method: "POST", body, headers });
  },
  async startup(state) {
    authEvents.addEventListener("signout", () => store.resetAll());
    authEvents.addEventListener("signin", async () => store.reloadAll());
    authEvents.addEventListener("state", async (profile) => {
      const id = profile?.id || "";
      state.profileId = id;

      if (id) {
        store.reloadAll();
      } else {
        store.resetAll();
      }
    });

    try {
      await isAuthenticated();
      store.reloadAll();
    } catch {}
  },
  async resetAll(state) {
    Object.assign(state, {
      currentFile: null,
      currentFunction: null,
      fileList: [],
      functionList: [],
      profileId: "",
      storeId: "",
    });
  },
  async reloadAll() {
    await store.updateProfileId();
    await store.setupStore();
    await store.reload();
  },
  async selectActionFromUrl() {
    const name = new URL(location.href).searchParams.get("fn");

    if (!name) {
      return;
    }

    const fn = get((s) => s.functionList).find((f) => f.name === name);
    if (fn) {
      await store.selectFunction(fn);
    }
  },
  async setupStore(state) {
    let storeId = await getProperty("jsfn:storeId");

    if (!storeId) {
      storeId = await Store.create();
      await setProperty("jsfn:storeId", storeId);
    }

    state.storeId = storeId;
  },

  autosave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => store.save(), 1000);
  },
});

export { get, select, store };
