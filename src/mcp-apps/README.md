# MCP Apps — browser bundles served to Claude's iframe

One bundle so far: **chart-dropzone**, the drop-zone UI for batch chart intake.

```
src/mcp-apps/
  chart-dropzone/app.html   entry document (vite root)
  chart-dropzone/app.ts     all app logic
  chart-dropzone/styles.css dense 13px UI, indigo #6366f1, dark-mode variant
  vite.config.ts            singlefile build + src-hash banner
  src-hash.ts               hash helper shared by the build and the test
  dist/chart-dropzone.html  COMMITTED build output
  __tests__/dist-freshness.test.ts
```

## Build

```
npm run build:mcp-apps        # -> src/mcp-apps/dist/chart-dropzone.html
npx vitest run src/mcp-apps   # freshness + no-external-URL checks
```

The dist file is **committed** because the MCP server serves it as the
`ui://chart-dropzone/app.html` resource at runtime, with no build step in the
deploy path. To stop it drifting from its sources the build stamps

```
<!-- src-hash: <sha256 of the concatenated sources> -->
```

on line 1 and `dist-freshness.test.ts` recomputes it. **Edit a source, rerun
the build, commit the dist file** — otherwise the unit test fails.

## Accessibility / rendering notes

- The chrome is built **once**; every later state change (a 2 s poll tick, a
  chunk-progress update) **patches rows in place**, keyed by `rowId`. A full
  rebuild would drop keyboard focus mid-decision. Anything focusable carries a
  stable `data-focus-id`, and the renderer re-focuses that id if a structural
  change ever does move focus. `e2e/chart-dropzone.spec.ts` asserts a chip
  keeps focus across a poll tick.
- The totals line is the live region (`role="status"`, `aria-live="polite"`,
  `aria-atomic="true"`) and says terse things: "2 of 2 uploaded",
  "Batch done: 1 imported, 1 parked, 0 failed". The error banner is a second
  polite live region.
- Resolve buttons live in their own Actions column, never inside the
  ellipsis-clipped detail cell.
- Contrast: the interactive accent is `#4f46e5` in light mode (>= 4.5:1 both as
  13px text on white and as a button background under a white label);
  `#6366f1` survives only as a decorative hover border. In dark mode the
  accent is `#818cf8` and the primary button label goes near-black. Every
  focusable control has a `:focus-visible` outline, and the drop target honours
  `prefers-reduced-motion`.

## Hard constraints

- **Nothing external.** The Apps sandbox serves the resource under a
  deny-by-default CSP, so an external script/style/font/image URL fails
  silently and the user sees a blank frame. `vite-plugin-singlefile` +
  `assetsInlineLimit: Infinity` inline everything; a unit test asserts it.
- **No server modules.** The bundle may import pure shared modules
  (`@/lib/library/chart-file-types`) and TYPE-only from `@/lib/intake/wire-types`.
  Anything that reaches firebase-admin, `server-only` or `next/server` is a
  build-size and secret-leak problem; a unit test asserts those strings are
  absent.
- **Bytes never reach the model.** Files go from the device straight to the
  signed Storage URL. Only a short `updateModelContext` summary (< 1,500 chars)
  goes back to Claude.

## How the drop-zone runs

1. `app.connect()` (real host) or `window.__DROPZONE_TEST_HOST__` (e2e seam).
2. The `open_chart_dropzone` result arrives on `ontoolresult` — read from
   `structuredContent`, falling back to JSON in the first text block.
3. Files are filtered with the shared `isAcceptedChartFile` plus the batch's
   `maxFileBytes`; rejected rows never upload and show why.
4. `request_batch_upload_urls` in groups of `maxFilesPerRequest`, then PUT
   3-at-a-time. A failed PUT retries once, then falls back to
   `append_batch_item_chunk` in 1 MB base64 chunks, then fails the row.
5. `commit_upload_batch`, then `get_upload_batch` every 2 s until `done`
   (10-minute ceiling).
6. Parked rows get inline **Keep both** / **Skip** buttons wired to
   `resolve_upload_item`; each resolution republishes the summary.

## Test seam

When `window.__DROPZONE_TEST_HOST__` is set, the app uses it instead of the
real `App`:

```ts
interface DropzoneHost {
    onToolResult(cb: (result: CallToolResultLike) => void): void
    callServerTool(req: { name: string; arguments?: Record<string, unknown> }):
        Promise<CallToolResultLike>
    updateModelContext(params: { content: Array<{ type: "text"; text: string }> }):
        Promise<unknown>
}
```

`e2e/chart-dropzone.spec.ts` installs one via `addInitScript` and serves the
dist file from a throwaway http server, so the upload PUTs are same-origin and
countable server-side:

```
PLAYWRIGHT_USE_REMOTE=1 npx playwright test e2e/chart-dropzone.spec.ts --project=chromium
```

(`PLAYWRIGHT_USE_REMOTE=1` only suppresses the repo-wide `webServer:` dev
server, which this spec does not need.)
