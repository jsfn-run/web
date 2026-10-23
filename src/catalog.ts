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

function renderDocumentation(docs: Documentation) {
  if (!docs.actions.length) {
    state('No actions documented', 'This endpoint returned an empty action list.');
    return;
  }
  const name = selected;
  detail.innerHTML = `<div class="breadcrumb"><span>Functions</span><span>/</span><span>${escape(name)}</span></div>
    <div class="detail-heading"><span class="heading-symbol" aria-hidden="true">ƒ</span><h2>${escape(name)}</h2><span class="badge">Live documentation</span></div>
    <p class="description">${escape(docs.description || catalog[name])}</p>
    <nav class="action-index" aria-label="Jump to API"><span>On this page</span>${docs.actions.map((a, i) => `<a href="?fn=${name}&amp;action=${encodeURIComponent(a.name)}#api-${i}" data-jump="${i}"><span aria-hidden="true">ƒ</span> ${escape(a.name)} <span aria-hidden="true">↓</span></a>`).join('')}</nav>
    ${docs.actions.map((action, index) => renderAction(name, action, index)).join('')}
    <div class="detail-footer"><p>Metadata via OPTIONS /api · <button class="button" id="refresh">Refresh</button></p><a class="doc-link" href="https://github.com/jsfn-run/functions/tree/main/functions/${name}" target="_blank" rel="noreferrer">Read implementation ↗</a></div>`;
  detail.querySelectorAll<HTMLAnchorElement>('[data-jump]').forEach((link) => {
    link.addEventListener('click', (event) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
        return;
      }
      event.preventDefault();
      history.pushState(null, '', link.href);
      el(`api-${link.dataset.jump}`).focus({ preventScroll: true });
      el(`api-${link.dataset.jump}`).scrollIntoView({ block: 'start' });
    });
  });
  docs.actions.forEach((action, index) => {
    const section = el(`api-${index}`);
    const snippets = requestSnippets(name, action);
    let format: 'terminal-curl' | 'browser' = 'terminal-curl';
    const tabs = Array.from(section.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    const activate = (tab: HTMLButtonElement) => {
      format = tab.dataset.format as typeof format;
      tabs.forEach((item) => {
        item.setAttribute('aria-selected', String(item === tab));
        item.tabIndex = item === tab ? 0 : -1;
        el(item.getAttribute('aria-controls')!).hidden = item !== tab;
      });
    };
    tabs.forEach((tab, position) => {
      tab.addEventListener('click', () => activate(tab));
      tab.addEventListener('keydown', (event) => {
        const next =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? tabs.length - 1
              : event.key === 'ArrowRight'
                ? (position + 1) % tabs.length
                : event.key === 'ArrowLeft'
                  ? (position + tabs.length - 1) % tabs.length
                  : -1;
        if (next < 0) {
          return;
        }
        event.preventDefault();
        activate(tabs[next]);
        tabs[next].focus();
      });
    });
    section.querySelector('[data-copy-url]')!.addEventListener('click', () => void copy(snippets.endpoint));
    section.querySelector('[data-copy-code]')!.addEventListener('click', () => void copy(snippets[format]));
  });
  el('refresh').addEventListener('click', () => void selectFunction(name, true));
  const actionName = new URL(location.href).searchParams.get('action');
  const target = docs.actions.findIndex((action) => action.name === actionName);
  if (target >= 0) {
    el(`api-${target}`).scrollIntoView({ block: 'start' });
  }
}

function requestSnippets(name: string, action: Action) {
  const endpoint = `https://${name}.jsfn.run/${encodeURIComponent(action.name)}`;
  const note = sourceNotes[`${name}/${action.name}`];
  const body = note?.body ?? (action.input === 'json' ? '{}' : '<your input>');
  const snippet = `curl --request POST ${shellQuote(endpoint)}${action.credentials.length ? ' \\\n  --header "Authorization: Bearer $JSFN_CREDENTIALS"' : ''}${action.input === 'json' ? " \\\n  --header 'Content-Type: application/json'" : ''}${action.input === 'undefined' ? '' : ` \\\n  --data-binary ${shellQuote(body)}`}`;
  const input = action.input === 'undefined' ? 'undefined' : action.input === 'json' ? body : JSON.stringify(body);
  const credentials = Object.fromEntries(action.credentials.map((key) => [key, '<your credential>']));
  const raw = !['json', 'text', 'buffer', 'dom'].includes(action.output);
  const result = raw ? 'response' : 'result';
  const browser = `import * as api from "https://${name}.jsfn.run/index.mjs";\n\nconst input = ${input};\nconst options = {}; // Query options${action.credentials.length ? `\nconst credentials = ${JSON.stringify(credentials, null, 2)};` : ''}\n\nconst ${result} = await api[${JSON.stringify(action.name)}](input, options${action.credentials.length ? ', credentials' : ''});${raw ? '\nif (!response.ok) {\n  throw new Error(`Request failed: ${response.status}`);\n}' : ''}\n${raw ? (name === 'base64' ? `const result = await response.${action.name === 'decode' ? 'arrayBuffer' : 'text'}();\nconsole.log(result);` : '// Raw output returns a Response. Choose text(), json(), or arrayBuffer().\nconsole.log(response);') : 'console.log(result);'}`;
  return { endpoint, 'terminal-curl': snippet, browser };
}

function renderAction(name: string, action: Action, index: number) {
  const note = sourceNotes[`${name}/${action.name}`];
  const snippets = requestSnippets(name, action);
  return `<section class="api-section" id="api-${index}" tabindex="-1" aria-labelledby="api-heading-${index}">
    <div class="api-heading"><span class="heading-symbol" aria-hidden="true">ƒ</span><h3 id="api-heading-${index}">${escape(action.name)}</h3>${action.default ? '<span class="badge">Default</span>' : ''}</div>
    ${action.description ? `<p class="description">${escape(action.description)}</p>` : ''}
    <div class="endpoint"><span class="method">POST</span><code>${escape(snippets.endpoint)}</code><button class="copy-button" data-copy-url aria-label="Copy endpoint URL">Copy URL</button></div>
    <div class="section-heading"><h4>Input</h4><span>Request body</span></div>
    <div class="schema">${row('body', action.input, typeDescription(action.input, false))}${note ? row('Implementation note', 'Source-derived', note.input) : ''}</div>
    <div class="section-heading"><h4>Options</h4><span>Query parameters</span></div>
    ${
      Object.keys(action.options).length
        ? `<div class="schema">${Object.entries(action.options)
            .map(([key, hint]) => row(key, 'Query option', hint))
            .join('')}</div><p class="quiet">Required flags and defaults are not provided by this endpoint.</p>`
        : '<p class="quiet">No query options are documented for this action.</p>'
    }
    <div class="section-heading"><h4>Output</h4><span>Response body</span></div>
    <div class="schema">${row('result', action.output, typeDescription(action.output, true))}${note ? row('Implementation note', 'Source-derived', note.output) : ''}</div>
    ${action.credentials.length ? `<div class="section-heading"><h4>Credentials</h4><span>Authorization header</span></div><div class="schema">${action.credentials.map((c) => row(c, 'Credential key', 'Declared by this action. Supply through the Authorization header, not the URL.')).join('')}</div><p class="quiet">JSFN_CREDENTIALS is base64-encoded UTF-8 JSON containing these keys. Base64 is not encryption. Use HTTPS and keep secrets out of shared snippets.</p>` : ''}
    <div class="section-heading"><h4>Make a request</h4><span>${note ? 'Source-derived example' : 'Request template'}</span></div>
    <div class="code-panel"><div class="code-bar"><div class="code-tabs" role="tablist" aria-label="${escape(action.name)} request format">${['terminal-curl', 'browser'].map((format, i) => `<button role="tab" id="tab-${index}-${i}" data-format="${format}" aria-selected="${i === 0}" aria-controls="panel-${index}-${i}" tabindex="${i === 0 ? 0 : -1}">${format}</button>`).join('')}</div><button class="copy-button" data-copy-code>Copy request</button></div>
    <div role="tabpanel" id="panel-${index}-0" aria-labelledby="tab-${index}-0" tabindex="0"><pre><code>${escape(snippets['terminal-curl'])}</code></pre></div>
    <div role="tabpanel" id="panel-${index}-1" aria-labelledby="tab-${index}-1" tabindex="0" hidden><pre><code>${escape(snippets.browser)}</code></pre><p class="browser-note">Use in a browser ES module (script type="module"). ${action.output === 'dom' ? 'This client inserts returned HTML, scripts and styles into the page. Only use trusted functions.' : 'The client parses declared output types; raw output returns a Response.'}${action.credentials.length ? ' Never hard-code private credentials in a public page.' : ''}</p></div></div>
    <p class="quiet">${note ? 'Example input, not a verified response.' : 'Replace placeholder input and add documented query options as needed.'} Requests are not executed by this explorer.</p>
    </section>`;
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
