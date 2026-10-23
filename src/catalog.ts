export {};
type Action = {
  name: string;
  description: string;
  input: string;
  output: string;
  options: Record<string, string>;
  credentials: string[];
  default: boolean;
};
type Documentation = { description?: string; actions: Action[] };

// Source inventory: jsfn-run/functions/functions (2026-10-23).
// There is no aggregate discovery endpoint in core. Presence is not a health check.
const catalog: Record<string, string> = {
  'acorn-parse': 'JavaScript parsing',
  'aws-dynamodb': 'Database operations',
  base64: 'Encoding & decoding',
  belasting: 'Tax utilities',
  cnpj: 'Identifier utilities',
  codemirror: 'Code editor',
  cpf: 'Identifier utilities',
  csv: 'Data conversion',
  dot2svg: 'Graph rendering',
  'es-minify': 'JavaScript minification',
  esp: 'Device utilities',
  'format-json': 'JSON formatting',
  gdpr: 'Privacy utilities',
  'github-download': 'Repository downloads',
  hash: 'Hash generation',
  highlight: 'Syntax highlighting',
  'image-meta': 'Image metadata',
  'img-resize': 'Image processing',
  'json-array2map': 'Data transformation',
  'json-schema': 'JSON validation',
  'lit-ce': 'Web components',
  markdown: 'Markdown rendering',
  'markdown-cli': 'Terminal markdown',
  md5: 'Hash generation',
  'npm-graph': 'Dependency graphs',
  openai: 'AI utilities',
  'parse-html': 'HTML parsing',
  qrcode: 'QR code generation',
  random: 'Random bytes',
  'random-name': 'Name generation',
  sass: 'Stylesheet compilation',
  sourcemap: 'Source maps',
  tar: 'Archive utilities',
  'ts-parse': 'TypeScript parsing',
  tti: 'Image generation',
  tts: 'Text to speech',
  'tuya-connector': 'Device integration',
  vtt: 'Speech transcription',
  'vue-ce': 'Web components',
  yaml: 'Data conversion',
};
const sourceNotes: Record<string, { input: string; output: string; body: string }> = {
  'base64/encode': {
    input: 'Bytes to encode. Text is accepted as UTF-8 bytes.',
    output: 'Base64-encoded text.',
    body: 'hello',
  },
  'base64/decode': { input: 'Base64-encoded text.', output: 'Decoded binary bytes.', body: 'aGVsbG8=' },
  'hash/createHash': {
    input: 'The raw bytes to hash.',
    output: 'A hexadecimal digest. The default algorithm is sha256.',
    body: 'hello',
  },
  'yaml/encode': { input: 'A JSON value to convert.', output: 'YAML text.', body: '{"hello":"world"}' },
  'yaml/decode': { input: 'YAML text to parse.', output: 'The parsed JSON value.', body: 'hello: world' },
};
const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const detail = el('detail');
const search = el<HTMLInputElement>('search');
const cache = new Map<string, Documentation>();
let selected = '';
let request: AbortController | undefined;
let notificationTimer: ReturnType<typeof setTimeout>;
const escape = (value: unknown) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
const shellQuote = (value: string) => `'${value.replace(/'/g, "'\\''")}'`;

function renderList() {
  const query = search.value.trim().toLowerCase();
  const entries = Object.entries(catalog).filter(([name, summary]) =>
    `${name} ${summary}`.toLowerCase().includes(query),
  );
  el('count').textContent = String(Object.keys(catalog).length);
  el('list-status').textContent = entries.length
    ? `${entries.length} functions${query ? ' matching your search' : ' in the source catalog'}`
    : 'No matches. Try a different search.';
  el('function-list').innerHTML = entries
    .map(
      ([name, summary]) =>
        `<a class="function-link" href="?fn=${name}" data-function="${name}" aria-current="${name === selected}"><span class="function-icon" aria-hidden="true">ƒ</span><span><span class="function-name">${name}</span><span class="function-caption">${summary}</span></span>${name === selected ? '<span class="function-arrow" aria-hidden="true">↗</span>' : ''}</a>`,
    )
    .join('');
}

function parseDocumentation(value: unknown): Documentation {
  if (!value || typeof value !== 'object' || !('actions' in value) || !Array.isArray(value.actions)) {
    throw new Error('The endpoint did not return a supported documentation document.');
  }
  const text = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);
  return {
    description: 'description' in value ? text(value.description) : '',
    actions: value.actions.map((a: unknown) => {
      if (!a || typeof a !== 'object' || !('name' in a) || typeof a.name !== 'string') {
        throw new Error('An action is missing its name.');
      }
      const item = a as Record<string, unknown>;
      return {
        name: a.name,
        description: text(item.description),
        input: text(item.input, 'raw'),
        output: text(item.output, 'raw'),
        default: item.default === true,
        credentials: Array.isArray(item.credentials)
          ? item.credentials.filter((c): c is string => typeof c === 'string')
          : [],
        options:
          item.options && typeof item.options === 'object' && !Array.isArray(item.options)
            ? Object.fromEntries(Object.entries(item.options).map(([k, v]) => [k, text(v, 'No description provided.')]))
            : {},
      };
    }),
  };
}

function state(title: string, message: string, retry = false) {
  detail.innerHTML = `<div class="empty-state" role="status"><span class="empty-symbol" aria-hidden="true">ƒ</span><h2>${escape(title)}</h2><p>${escape(message)}</p>${retry ? '<button class="button" id="retry">Retry documentation</button>' : ''}</div>`;
  el('retry')?.addEventListener('click', () => void selectFunction(selected, true));
}

async function selectFunction(name: string, refresh = false) {
  request?.abort();
  selected = name;
  renderList();
  if (!Object.prototype.hasOwnProperty.call(catalog, name)) {
    state(
      'Function not in this catalog',
      'Choose a function from the list. This source catalog may not include privately deployed functions.',
    );
    return;
  }
  if (cache.has(name) && !refresh) {
    renderDocumentation(cache.get(name)!);
    return;
  }
  state(`Opening ${name}…`, 'Fetching the documentation exposed by this function.');
  const controller = new AbortController();
  request = controller;
  const timeout = setTimeout(() => controller.abort(new Error('Documentation request timed out.')), 12000);
  try {
    const response = await fetch(`https://${name}.jsfn.run/api`, {
      method: 'OPTIONS',
      credentials: 'omit',
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`The documentation endpoint returned HTTP ${response.status}.`);
    }
    const docs = parseDocumentation(await response.json());
    if (request !== controller) {
      return;
    }
    cache.set(name, docs);
    renderDocumentation(docs);
  } catch (error) {
    if (request !== controller || selected !== name) {
      return;
    }
    state(
      'Documentation unavailable',
      `${name} is listed in source, but its live documentation could not be loaded. Check connectivity, CORS, or deployment status. ${error instanceof Error ? error.message : ''}`,
      true,
    );
  } finally {
    clearTimeout(timeout);
  }
}

function row(name: string, type: string, description: string) {
  return `<div class="schema-row"><div><div class="schema-name">${escape(name)}</div><p class="schema-type">${escape(type)}</p></div><div class="schema-description">${escape(description)}</div></div>`;
}
function typeDescription(type: string, output: boolean) {
  if (type === 'raw') {
    return `No structured ${output ? 'output' : 'input'} type is declared. Check the implementation before integrating.`;
  }
  if (type === 'undefined') {
    return `No ${output ? 'output' : 'input'} is declared.`;
  }
  return `${output ? 'Returns' : 'Accepts'} ${type === 'buffer' ? 'binary bytes' : type === 'json' ? 'a JSON value' : type === 'text' ? 'text' : type}. Field-level schemas are not exposed by this API.`;
}

function renderDocumentation(docs: Documentation, actionName = new URL(location.href).searchParams.get('action')) {
  if (!docs.actions.length) {
    state('No actions documented', 'This endpoint returned an empty action list.');
    return;
  }
  const action =
    docs.actions.find((a) => a.name === actionName) ?? docs.actions.find((a) => a.default) ?? docs.actions[0];
  const name = selected;
  const endpoint = `https://${name}.jsfn.run/${encodeURIComponent(action.name)}`;
  const note = sourceNotes[`${name}/${action.name}`];
  const body = note?.body ?? (action.input === 'json' ? '{}' : '<your input>');
  const snippet = `curl --request POST ${shellQuote(endpoint)}${action.credentials.length ? ' \\\n  --header "Authorization: Bearer $JSFN_CREDENTIALS"' : ''}${action.input === 'json' ? " \\\n  --header 'Content-Type: application/json'" : ''}${action.input === 'undefined' ? '' : ` \\\n  --data-binary ${shellQuote(body)}`}`;
  detail.innerHTML = `<div class="breadcrumb"><span>Functions</span><span>/</span><span>${escape(name)}</span></div>
    <div class="detail-heading"><h2>${escape(name)}</h2><span class="badge">Live documentation</span></div>
    <p class="description">${escape(docs.description || catalog[name])}</p>
    <div class="action-tabs" role="group" aria-label="Actions">${docs.actions.map((a) => `<button data-action="${escape(a.name)}" aria-pressed="${a.name === action.name}">${escape(a.name)}${a.default ? ' · default' : ''}</button>`).join('')}</div>
    ${action.description ? `<p class="description">${escape(action.description)}</p>` : ''}
    <div class="endpoint"><span class="method">POST</span><code>${escape(endpoint)}</code><button class="copy-button" id="copy-url" aria-label="Copy endpoint URL">Copy URL</button></div>
    <div class="section-heading"><h3>Input</h3><span>Request body</span></div>
    <div class="schema">${row('body', action.input, typeDescription(action.input, false))}${note ? row('Implementation note', 'Source-derived', note.input) : ''}</div>
    <div class="section-heading"><h3>Options</h3><span>Query parameters</span></div>
    ${
      Object.keys(action.options).length
        ? `<div class="schema">${Object.entries(action.options)
            .map(([key, hint]) => row(key, 'Query option', hint))
            .join('')}</div><p class="quiet">Required flags and defaults are not provided by this endpoint.</p>`
        : '<p class="quiet">No query options are documented for this action.</p>'
    }
    <div class="section-heading"><h3>Output</h3><span>Response body</span></div>
    <div class="schema">${row('result', action.output, typeDescription(action.output, true))}${note ? row('Implementation note', 'Source-derived', note.output) : ''}</div>
    ${action.credentials.length ? `<div class="section-heading"><h3>Credentials</h3><span>Authorization header</span></div><div class="schema">${action.credentials.map((c) => row(c, 'Credential key', 'Declared by this action. Supply through the Authorization header, not the URL.')).join('')}</div><p class="quiet">JSFN_CREDENTIALS is base64-encoded UTF-8 JSON containing these keys. Base64 is not encryption. Use HTTPS and keep secrets out of shared snippets.</p>` : ''}
    <div class="section-heading"><h3>Make a request</h3><span>${note ? 'Source-derived example' : 'Request template'}</span></div>
    <div class="code-panel"><div class="code-bar"><span>Terminal · cURL</span><button class="copy-button" id="copy-code">Copy request</button></div><pre><code>${escape(snippet)}</code></pre></div>
    <p class="quiet">${note ? 'Example input, not a verified response.' : 'Replace placeholder input and add documented query options as needed.'} Requests are not executed by this explorer.</p>
    <div class="detail-footer"><p>Metadata via OPTIONS /api · <button class="button" id="refresh">Refresh</button></p><a class="doc-link" href="https://github.com/jsfn-run/functions/tree/main/functions/${name}" target="_blank" rel="noreferrer">Read implementation ↗</a></div>`;
  detail.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((button) =>
    button.addEventListener('click', () => {
      const url = new URL(location.href);
      url.searchParams.set('action', button.dataset.action!);
      history.pushState(null, '', url);
      renderDocumentation(docs, button.dataset.action);
      Array.from(detail.querySelectorAll<HTMLButtonElement>('[data-action]'))
        .find((b) => b.dataset.action === button.dataset.action)
        ?.focus();
    }),
  );
  el('copy-url').addEventListener('click', () => void copy(endpoint));
  el('copy-code').addEventListener('click', () => void copy(snippet));
  el('refresh').addEventListener('click', () => void selectFunction(name, true));
}

async function copy(text: string) {
  clearTimeout(notificationTimer);
  try {
    await navigator.clipboard.writeText(text);
    el('notification').textContent = 'Copied to clipboard';
  } catch {
    el('notification').textContent = 'Clipboard unavailable. Select and copy the text manually.';
  }
  notificationTimer = setTimeout(() => {
    el('notification').textContent = '';
  }, 4000);
}
search.addEventListener('input', renderList);
el('function-list').addEventListener('click', (event) => {
  const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('[data-function]');
  if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
    return;
  }
  event.preventDefault();
  history.pushState(null, '', link.href);
  void selectFunction(link.dataset.function!);
});
window.addEventListener(
  'popstate',
  () => void selectFunction(new URL(location.href).searchParams.get('fn') || 'base64'),
);
document.addEventListener('keydown', (event) => {
  if (
    event.key === '/' &&
    !(event.target instanceof HTMLInputElement) &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey
  ) {
    event.preventDefault();
    search.focus();
  }
});
void selectFunction(new URL(location.href).searchParams.get('fn') || 'base64');
