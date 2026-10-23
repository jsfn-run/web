# jsfn.run function explorer

A one-page, read-only reference for the public function source catalog. Search functions, scroll through every action's input/output declarations, query options and credential keys, and copy endpoint URLs, cURL requests or browser ES module examples. Each action has independent, keyboard-accessible `terminal-curl` and `browser` tabs. Browser snippets use `https://<name>.jsfn.run/index.mjs`; the explorer never imports or executes these modules itself.

## Development

```sh
npm ci
npm run dev
npm run build
npm run lint
pnpm exec playwright test
LIVE_API=1 pnpm exec playwright test tests/live.spec.ts
```

The production output is `dist/`. The existing main-branch image build workflow is unchanged. No backend, authentication, or secret configuration is needed for this read-only UI. Existing legacy editor modules remain in `src/component`, `src/store`, and `src/vendor`, but are not imported or bundled.

## API contract and catalog maintenance

- The 40 names in `src/catalog.ts` match the sibling `functions/functions/*/index.mjs` source inventory as of 2026-10-23. Core has no public aggregate discovery endpoint. Update this catalog when functions are added or removed. A source entry is **not** a claim of deployment or availability.
- Selecting a function requests `OPTIONS https://<name>.jsfn.run/api` with credentials omitted. Documentation is cached in memory; Refresh fetches it again. Failures, timeouts, invalid metadata and empty actions have explicit states.
- Core returns action names, descriptions, input/output types, options (human-readable hints), credential names and default flags. It does **not** expose JSON Schema, required flags, examples, or option defaults. The UI never invents these. `raw` remains explicitly unspecified.
- A small set of implementation notes and example bodies is source-derived and labeled separately from live metadata. These may need updating when implementations change.
- Invocation templates use `POST /<action>` with the body directly, not an envelope. Credentials use base64-encoded UTF-8 JSON in an Authorization Bearer header. The explorer neither collects secrets nor executes functions; some functions modify data/devices or incur costs.
- Preserve links with `?fn=base64&action=decode`. Actions appear together; the action query scrolls to the matching section. Browser back/forward is supported. Search also matches the editorial category labels; `/` focuses search.
- Metadata is escaped before rendering. Only known catalog names can trigger fetches. No generated API module or returned HTML is executed.

## Verification

Playwright covers desktop and mobile layouts, search, action selection, history, clipboard, loading, stale requests, retry, empty metadata, unknown deep links, and HTML escaping with intercepted metadata. The opt-in live test checks base64/hash documentation without invoking actions. Lint and TypeScript checks target the new implementation; legacy editor code is intentionally excluded.
