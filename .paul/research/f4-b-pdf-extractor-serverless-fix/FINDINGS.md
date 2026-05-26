# f4-b-pdf-extractor-serverless-fix — Phase 0 FINDINGS

**Lane:** f4-b-pdf-extractor-serverless-fix (Tier 1, P1 LAUNCH-RELEVANT)
**Author:** coder-4
**Date:** 2026-05-26
**Base SHA:** 3355bf194

## TL;DR

The DOMMatrix prod failure is **not** caused by Vercel-specific DOM-global
absence (local Node 24.11.1 has no `DOMMatrix` either yet the engine
works). It is caused by the loader at `src/lib/pdf-chord-extractor.ts`
configuring pdfjs-dist to use its **fake-worker** path
(`GlobalWorkerOptions.workerSrc = ""`). pdfjs-dist v5.4's fake worker
eval's a code path that requires `DOMMatrix` to exist as a global; the
real `getDocument({disableWorker:true})` path does not.

**Decision: Option C — pdfjs-dist option fix.** Drop the fake-worker
crutch. Centralize the documented Node-safe options
(`disableWorker / useWorkerFetch:false / isEvalSupported:false /
useSystemFonts:false / disableFontFace:true`) in the shared loader.
Apply at all three `getDocument()` call-sites. No new dep, no API
surface change, no behavior change for the docx / txt paths or for
mocked-engine tests.

## Engine + version

- Loader: `src/lib/pdf-chord-extractor.ts:46-55` — `getPdfjs()`
  dynamic-imports `pdfjs-dist/legacy/build/pdf.mjs` and sets
  `GlobalWorkerOptions.workerSrc = ""`.
- `package.json`: `"pdfjs-dist": "5.4.296"`.
- Three serverless call-sites in the original file:
  1. `src/lib/setlist-import/extract-document.ts:55-76` — `extractPdfText` (used by `/api/setlists/import/extract-document` AND, since coder-2's F4-B ship, by `src/lib/library/searchable-text.ts` via `extractDocumentText` for PCU's `searchableText` and the new `backfill_searchable_text` admin tool).
  2. `src/lib/pdf-chord-extractor.ts:156-208` — `extractChordsFromPdf`.
  3. `src/lib/pdf-chord-extractor.ts:213-262` — `extractChordsFromPage`.

## Blast radius (every server route that hits the bug today)

`getPdfjs()` consumers all server-only:

| Caller | Route surface | Symptom today |
|---|---|---|
| `extractDocumentText` (PDF branch) | `/api/setlists/import/extract-document` (band_leader; doc-driven setlist creation) | Silent 422 `extraction_failed` on every PDF — `try/catch` in `extract-document.ts:97` swallows the throw. Low usage path (Daniel + David don't doc-import via this route — they use Claude Desktop + MCP); no prior bug report. |
| `extractDocumentText` (PDF branch) via `extractSearchableText` | F4-B PCU integration in `src/lib/library-upload.ts` + `backfill_searchable_text` MCP tool | F4-B's PCU branch graceful-degrades (omits `searchableText`); the backfill tool counts these as `errors: N / N` per the supervisor's 07:30Z dry-run (`heal: 0, errors: 10/10, all "DOMMatrix is not defined"`). |
| `extractChordsFromPdf` | `/api/setlist/print/*` (4 print routes — personal, public, default, prepare) | Chord-overlay print silently 500s OR falls back to non-transposed (see `print-pipeline.ts:787` — the `extractChordsFromPdf!` call is wrapped in handler-level try/catch). |
| `extractChordsFromPage` | `/api/library/detect-key` | Key detection silently fails per chart. |

**Bonus follow-up confirmed** (per dispatch §"Bonus follow-up"): setlist-import + print + key-detection were all silently broken in prod. After this lane lands, file `f4-b-server-pdfjs-fix-restores-N-prod-services` deferred-issue note for Daniel triage. NOT in this lane's scope.

## Root cause — exact mechanism

pdfjs-dist v5 deprecates Node usage without a worker BUT documents the
escape hatches in their README's "Including via a CDN" + Node.js
section: `disableWorker:true / useWorkerFetch:false /
isEvalSupported:false / useSystemFonts:false` is the official Node-safe
config. The current loader instead does:

```ts
_pdfjsModule.GlobalWorkerOptions.workerSrc = ""
```

That triggers pdfjs's **"fake worker"** code path
(`src/display/worker_options.js` → `fakeWorkerCapability`), which evals
pdfjs's worker bundle in the main thread. The eval'd code constructs
`new DOMMatrix()` for page transform setup. On Vercel serverless Node
22.x (pre-22.13, no global `DOMMatrix`) this throws
`DOMMatrix is not defined`.

The current `extractPdfText` (extract-document.ts:55) passes NO Node-safe options to `getDocument()`; the chord-extractor passes `useSystemFonts: true` (wrong — should be `false` in Node since the system-font path tries to enumerate native fonts).

## Local repro proving the fix

```js
// LOCAL — Node 24.11.1 (typeof DOMMatrix === 'undefined')
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
const doc = await pdfjs.getDocument({
  data,
  disableWorker: true,
  useWorkerFetch: false,
  isEvalSupported: false,
  useSystemFonts: false,
  disableFontFace: true,
  verbosity: 0,
}).promise;
const page = await doc.getPage(1);
const tc = await page.getTextContent();
// → tc.items = [{ str: 'Hineh ma tov lyrics', transform: [12,0,0,12,72,720], width: 101.352, height: 12 }]
const vp = page.getViewport({ scale: 1.0 });
// → { width: 612, height: 792 }
```

Returns the full data shape that `pdf-chord-extractor.ts`'s text-merge
+ chord-detection algorithm expects unchanged. No downstream API drift.

## Alternatives considered + rejected

**Option A — Engine swap to `unpdf`.** Installed locally and tested.
`extractText` works perfectly for text-only paths. BUT
`getDocumentProxy().getPage(n).getTextContent()` throws DataCloneError
in the worker postMessage path — unpdf's proxy mode still requires a
real worker. Would break the chord-extractor's positional-items API.
Adding a fresh ~700KB transitive dep PLUS we'd still need pdfjs-dist
for the chord-extractor. Net negative. **Rejected.**

**Option B — Hand-rolled DOMMatrix / Path2D / ImageData polyfill.**
Would work but iterative — Path2D, ImageData, OffscreenCanvas may
silent-fail in turn. Increases the engine's coupling to brittle global
polyfills. **Rejected** in favor of using the documented escape hatches
that bypass the path needing the polyfills entirely.

**Option C (chosen) — pdfjs-dist Node-safe options.** Documented API
options. No new dep. No API surface change. Locally proven against
pdfjs-dist@5.4.296 + Node 24 (no DOMMatrix global). Single-file
implementation, minimum LOC, minimum churn against coder-2's PCU
integration ship.

## Implementation plan (Phase 1)

Centralize the Node-safe options as a constant exported from `src/lib/pdf-chord-extractor.ts` alongside `getPdfjs()`:

```ts
/** Documented Node-safe getDocument options — required because pdfjs-dist v5
 * uses DOMMatrix in its fake-worker eval path; these flags disable that path. */
export const PDFJS_NODE_SAFE_OPTIONS = {
  disableWorker: true as const,
  useWorkerFetch: false as const,
  isEvalSupported: false as const,
  useSystemFonts: false as const,
  disableFontFace: true as const,
  verbosity: 0 as const,
} as const
```

Apply at three call sites:
1. `extractPdfText` (extract-document.ts:55): merge `PDFJS_NODE_SAFE_OPTIONS` into the `getDocument({data, ...})` call.
2. `extractChordsFromPdf` (pdf-chord-extractor.ts:156): replace existing `useSystemFonts:true, verbosity:0` with the spread.
3. `extractChordsFromPage` (pdf-chord-extractor.ts:213): replace existing `useSystemFonts:true, verbosity:0` with the spread.

Drop the `workerSrc = ""` line in `getPdfjs()` — irrelevant once `disableWorker:true` is passed, and keeping it would leave a misleading no-op for future readers.

Estimated diff: ~25 lines src, ~50-80 lines test (real-engine smoke test using a fixture PDF baked in-test via pdf-lib).

## Phase 2 testing

The existing `src/lib/setlist-import/__tests__/extract-document.test.ts` MOCKS `pdfjs-dist/legacy/build/pdf.mjs` entirely (vitest jsdom can't run real pdfjs per the file comment). Add a separate test file `pdf-extract-real-engine.test.ts` that:

- DOES NOT mock `pdfjs-dist`
- Builds a minimal valid PDF in-test using `pdf-lib` (already in `package.json` deps)
- Calls `extractDocumentText` against it
- Asserts `ok: true` + the known text body

This is the regression guard against future fake-worker regression and the unit signal that the Node-safe path stays open.

Real-engine test for chord extraction is more involved (would need a fixture chart with chord text); deferred to a future lane. Phase-4 prod re-dry of `backfill_searchable_text({dryRun:true, limit:10})` against the original 10 failing fileIds is the real verification gate for the chord-extractor path too — IF text extraction works, chord extraction's `getTextContent()` + `getViewport()` calls do too (same engine path).

## Phase 4 gate (supervisor + Daniel run)

Post-Vercel-deploy of the fix, supervisor re-runs `backfill_searchable_text({dryRun:true, limit:10})` against the same 10 sample fileIds:
`000cc80a-9c65-4b55-929e-c9ca1f6737c3` (Yih'Yeh Shalom) /
`012dd661-f451-444c-88fb-11d589028908` (T'Filat Haderech) /
`07478587-664a-4153-8a82-c35364f4ec12` (Hodu — Silver) /
+ 7 more.

Expected: `heal: 10, errors: 0`. Then Daniel ratifies the ~625-row APPLY.

## Out of scope

- ⛔ NO touching coder-2's PCU integration (`src/lib/library-upload.ts`) — only the engine it calls.
- ⛔ NO touching `chart-text-search.ts` / `index.ts` / `backfill-searchable-text.ts` — coder-2 surface, byte-stable.
- ⛔ NO touching `src/lib/firebase.ts` (coder-1 live).
- ⛔ NO `bridge/` / `monitor/` / `firestore.rules` / `vercel.json` / `env.mjs`.
- ⛔ NO MusicXML extractor work.
- ⛔ NO `[[project_smart_transposer_is_key_transcriber]]` (this fix only touches server-side pdf-chord-extractor + extract-document; SmartTransposer client-side stays untouched).
- ⛔ NO re-running prod backfill APPLY (single-owner-gated; supervisor + Daniel).

## Hard-boundary verification

- pdf-chord-extractor.ts marked `// Server-side PDF chord extraction` and reuses pdfjs only via dynamic import — no client bundle impact. Confirmed by `grep getPdfjs|extractChordsFromPdf|extractChordsFromPage` returning only server-side callers (print routes, key-detection API route, setlist-import extract-document route, F4-B PCU/backfill).
- Per-worktree git identity SET (`coder-4 <coder-4@coord.local>`); will re-verify post-`git add` per `[[feedback_per_worktree_git_identity]]`.
