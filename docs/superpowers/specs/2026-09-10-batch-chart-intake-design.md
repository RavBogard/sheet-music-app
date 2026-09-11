# Batch Chart Intake — design

Date: 2026-09-10. Owner: Daniel (ratified in chat 2026-09-10; spec-review gate waived).
Status: APPROVED, building.

## 1. Problem

Every MCP tool that gets chart bytes into the library (`upload_chart`, the three
chunked-session tools, `request_chart_upload_url` + `finalize_chart_upload`,
`import_chart_from_drive`, `save_scraped_chart`, `salvage_chart_bytes`) is one
file per call and, except the Drive import, moves bytes THROUGH Claude's tool
arguments. That channel has ceilings we do not control:

- ~25K tokens per tool call → ~50 KB of base64 per call. Real charts are 200 KB–5 MB.
- `maxDuration = 60` on `/api/mcp` → any multi-file loop dies mid-way with no partial record.
- Claude Desktop cannot read local file bytes; an attached PDF is text/images to the model.

Daniel's files are almost always on his local PC (sometimes Drive, sometimes
mixed). He and David must be able to upload MANY files through Claude (Desktop /
claude.ai), never through the website. So: **Claude orchestrates by reference
and never carries bytes.** Bytes need a courier that runs on the user's device.

## 2. Decisions (ratified)

| # | Decision | Value |
|---|----------|-------|
| 1 | Courier | Backend first + MCP Apps drop-zone (in-chat iframe). Local companion MCP server only if the drop-zone fails UAT in Claude Desktop. |
| 2 | Near-duplicates (≥ 0.85 fuzzy or exact) | **Park** for a human decision, never skip or overwrite silently. Surface at end of batch AND via a standing list Claude can pull any time. |
| 3 | Enrichment | Batch imports queue Gemini enrichment exactly as single uploads do (unchanged `processChartUpload` behavior). |
| 4 | Drive-sourced files | `import_drive_folder` feeds the same batch backend (second source, not a second pipeline). |
| 5 | Existing byte paths | Untouched. The chunked-through-Claude path stays as documented emergency fallback for one small file. |

## 3. Research facts the design rests on

- MCP Apps (SEP-1865, `@modelcontextprotocol/ext-apps`) is supported by Claude web + Claude Desktop (+ iOS). A tool with `_meta.ui.resourceUri = "ui://..."` renders the `ui://` resource in a sandboxed iframe; the iframe gets the tool result via `app.ontoolresult`, can call server tools via `app.callServerTool`, and can push text to the model via `app.updateModelContext`.
- The iframe CAN make device-side network requests: Anthropic's own troubleshooting doc says requests "your app makes directly from the user's device — loading bundles, images, or calling your own API" carry `Origin: {hash}.claudemcpcontent.com`, and servers must allow that origin via CORS. `connect-src` is built from `_meta.ui.csp.connectDomains` (open issue #40 shows some declared domains honored, `frameDomains` not; we don't need frames).
- `_meta.ui.domain = "{sha256(connectorUrl)[0:32]}.claudemcpcontent.com"` opts into a stable origin. Without it the origin can vary; CORS on OUR endpoints should therefore allow any `https://*.claudemcpcontent.com` (regex), and the GCS bucket CORS should allow `*` origin for `PUT` (signed URL is the credential).
- Tool results > ~150K chars get diverted to the code-exec sandbox and break app hydration → keep every tool result small (ids + counts, never bytes or long lists).
- Repo: `mcp-handler@^1.1.0` wrapping `@modelcontextprotocol/sdk@^1.29.0` → `registerAppTool`/`registerAppResource` from `@modelcontextprotocol/ext-apps/server` work against the `McpServer` mcp-handler hands us (Vercel's `mcp-apps-nextjs-starter` uses this exact stack).
- Inngest (`^3.54.0`) is wired at `src/inngest/{client,functions}.ts` + `/api/inngest`; 4 MB step payload limit; progress-to-Firestore pattern exists (`print_jobs`).
- `processChartUpload(input)` (src/lib/library-upload.ts) is the single canonical ingest: validation, MuseScore/HEIC conversion, exact+fuzzy dedupe (409 `duplicate_exact` / `duplicate_similar`, bypass with `force`), Storage write + read-verify, `library_index` + `songs` batch, compensating delete, `library_signals`, `library.row.created` event (which feeds enrichment). It accepts `source`, `driveMetadata`, `force`.
- Signed-URL staging pattern exists in `src/lib/mcp/tools/library-upload-session.ts`: `bucket.file(path).getSignedUrl({action:"write", version:"v4", expires, contentType})`, staging prefix `upload-sessions/`, `upload_sessions/{id}` Firestore doc, 25 MB cap, `stampOrg(db, fileId, org)` after success, `orgFrom(extra)` for tenant.
- Drive: `src/lib/drive-sync/poller.ts` exposes `runDriveSync(opts)` with a `DriveSyncDeps` seam, `DEFAULT_PER_TICK_FILE_CAP = 25`, `ChartImportQueueStatus`, subfolder→collection map. `DriveClient` has `listFilesByQuery`, `getFile`, `fetchAsPdf`.

## 4. Architecture

```
Claude (model)  ── metadata-only tool calls ──►  /api/mcp (Vercel, 60 s)
     │                                                │ creates batch, mints signed URLs,
     │ renders ui:// resource                         │ verifies staged blobs, sends Inngest event
     ▼                                                ▼
Drop-zone iframe (user's device)  ── PUT bytes ──►  Firebase Storage  upload-batches/{batchId}/{itemId}
     │  callServerTool: request_batch_upload_urls, commit_upload_batch, get_upload_batch
     ▼
Inngest  library/import-batch  ── per-item step ──►  processChartUpload()  ──►  library_index / songs / signals
                                                       │ 409 duplicate → item PARKED (candidate recorded)
                                                       ▼
                                             upload_batches/{batchId}.items[*] status
```

### 4.1 Data model (Firestore)

`upload_batches/{batchId}` — one document per batch, items embedded (a batch is
≤ 200 items; embedding keeps `get_upload_batch` one read and keeps rules simple).

```ts
interface UploadBatchDoc {
  ownerUid: string
  orgId: OrgId                      // from orgFrom(extra) at open time — NEVER from the iframe
  source: "dropzone" | "drive-folder" | "cli"
  status: "open" | "committed" | "processing" | "done" | "expired"
  defaults: { collection?: LibraryCollection; tags?: string[] }
  counts: { total: number; pending: number; imported: number; parked: number; failed: number; skipped: number }
  items: Record<string, UploadBatchItem>   // itemId → item
  createdAt: Timestamp; expiresAt: Timestamp; committedAt?: Timestamp; finishedAt?: Timestamp
  inngestRunId?: string
}

interface UploadBatchItem {
  itemId: string                    // "it-<8 hex>"
  fileName: string; mimeType: string; sizeBytes: number
  title: string                     // default: fileName stem, normalized (Drive: file name)
  stagedPath?: string               // upload-batches/{batchId}/{itemId}
  driveFileId?: string              // drive-folder source only
  status: "awaiting-bytes" | "staged" | "pending" | "imported" | "parked" | "failed" | "skipped"
  resultFileId?: string             // on imported / resolved-force
  parked?: { reason: "duplicate_exact" | "duplicate_similar"; matchedFileId: string; matchedTitle: string; score?: number }
  error?: { code: string; message: string }
  decision?: { action: "force" | "skip" | "bind"; boundFileId?: string; decidedBy: string; decidedAt: string }
  updatedAt: string                 // ISO
}
```

Item mutations from the processor use `FieldValue` dotted-path updates
(`items.<id>.status`) inside a transaction that also recomputes `counts`, so
concurrent per-item steps never clobber one another.

Firestore rules: `upload_batches` is admin-SDK-only (no client reads). Add an
explicit `allow read, write: if false;` block for clarity.

Storage: staged objects live under `upload-batches/{batchId}/{itemId}`;
`processChartUpload` copies bytes to their permanent `library/{fileId}` home, so
staged objects are deleted (best-effort) after each item finishes. A nightly
sweep is NOT added now; `expiresAt` (24 h) is recorded so a later sweep can use it.

### 4.2 MCP tools (all metadata-only, all registered in a new `registerBatchIntakeTools(server)`)

| Tool | Auth | Purpose |
|------|------|---------|
| `open_chart_dropzone` | upload-allowed roles (same gate as `request_chart_upload_url`) | Creates an `open` batch (`source: dropzone`), returns `{batchId, expiresAt, defaults}` and carries `_meta.ui.resourceUri = "ui://chart-dropzone/app.html"`. Optional args: `collection`, `tags`. |
| `request_batch_upload_urls` | owner of batch | Args `{batchId, files: [{fileName, mimeType, sizeBytes}] }` (≤ 50 per call, each ≤ 25 MB, mime must pass `processChartUpload` whitelist incl. octet-stream→ext recovery). Creates items in `awaiting-bytes`, returns `[{itemId, uploadUrl, requiredHeaders, expiresAt}]`. Signed v4 PUT, 15 min. Rate-limit: ONE `upload` token per call (not per file), trusted-leader bypass. |
| `commit_upload_batch` | owner | Args `{batchId}`. For each `awaiting-bytes` item, HEAD the staged object; size match → `staged`; missing → `failed(bytes_missing)`. Then status `committed`, send Inngest `library/import-batch` `{batchId}`, return counts. Idempotent: second call on a committed batch returns current counts. |
| `get_upload_batch` | owner or admin | Args `{batchId, includeItems?: "all" | "attention" (default) }`. Returns counts + items needing attention (parked/failed) + up to 20 imported rows `{itemId,title,resultFileId}`. Small by design. |
| `resolve_upload_item` | owner or admin | Args `{batchId, itemId, action: "force" | "skip" | "bind", boundFileId?}`. `force` → re-run `processChartUpload` with `force:true` from staged bytes (synchronously; single file fits in 60 s) → `imported`. `skip` → `skipped`, delete staged bytes. `bind` → `skipped` with `decision.boundFileId` (Claude then bonds that existing chart to the setlist). |
| `list_parked_uploads` | upload-allowed | Standing list across batches for the caller's org: `{batchId, itemId, title, parked, createdAt}`, newest first, ≤ 50. (Decision 2 "both".) |
| `import_drive_folder` | upload-allowed | Args `{folderId, collection?, recursive?: boolean (default false), dryRun?: boolean}`. Lists chart-typed files via `DriveClient.listFilesByQuery`, creates a batch (`source: drive-folder`, items with `driveFileId`, status `pending`), commits it (same Inngest event). `dryRun` returns the would-be item list and no writes (F-05 rule). Cap 200 files per call. |

Tool descriptions must tell the agent: "Claude never handles bytes. Open the
dropzone, let the user drop files, then read the results with
`get_upload_batch` and talk through parked items. Never call
`request_batch_upload_urls`/`commit_upload_batch` yourself from a Desktop
conversation — the dropzone calls them." (The model MAY call them from a CLI /
Claude Code context; that's the `cli` source.)

### 4.3 Processor (Inngest)

`importBatchJob = inngest.createFunction({ id: "library-import-batch", concurrency: { limit: 3, key: "event.data.batchId" } }, { event: "library/import-batch" }, ...)`

1. `step.run("load")` → read batch, set `processing`.
2. For each item in `staged`/`pending` (deterministic order), `step.run(\`item-${itemId}\`)`:
   - dropzone/cli: download staged bytes → `processChartUpload({ buffer, originalFileName, mimeType, title, collection, tags, uploaderUid: ownerUid, source: "upload" })`.
   - drive-folder: `DriveClient.getFile`/`fetchAsPdf` (reuse the mime/conversion logic already in `importChartFromDrive`; extract a shared `fetchDriveFileForUpload(driveFileId)` helper rather than duplicating) then `processChartUpload({... source: "drive-sync", driveMetadata })`.
   - Result mapping: `ok` → `imported` + `stampOrg(db, fileId, orgId)`; 409 `duplicate_exact|duplicate_similar` → `parked` with candidate (`matchedFileId`, `matchedTitle`, `score` from the error payload — extend `ProcessChartUploadError` payload if it doesn't already carry them); any other error → `failed`.
   - Delete staged object best-effort on `imported`/`failed`; keep it on `parked` (needed for `force`).
   - Each step returns only `{itemId, status}` (4 MB Inngest limit).
3. `step.run("finish")` → status `done`, `finishedAt`, final counts.

Steps are individually retried by Inngest (default retries) — `processChartUpload` is idempotent enough for that because a retried step on an already-imported item hits `duplicate_exact`; the step must therefore first re-read the item and no-op if it is already terminal.

Register in `/api/inngest` `functions: [generatePdfJob, importBatchJob]`.

### 4.4 Drop-zone app (`ui://chart-dropzone/app.html`)

- Source: `src/mcp-apps/chart-dropzone/` (`app.html`, `app.ts`, `styles.css`), built by Vite + `vite-plugin-singlefile` into `src/mcp-apps/dist/chart-dropzone.html`, which is **checked in** (so Vercel needs no extra build step) and served by `registerAppResource` via `fs.readFileSync` at cold start.
- `npm run build:mcp-apps` builds it; a vitest test asserts the dist file is fresh relative to sources' content hash (fails CI if someone edits source without rebuilding).
- Behavior: `app.connect()`; `ontoolresult` → read `batchId`, `defaults`, `expiresAt`. Big drop target + "Choose files" `<input type=file multiple>`. On drop: client-side filter by extension/mime (pdf, png, jpg, jpeg, heic, heif, xml, musicxml, mxl, mscz, mscx, txt), size ≤ 25 MB; rejected files are listed inline with the reason. Then `callServerTool("request_batch_upload_urls")` in groups of 50 → PUT each file with fetch (`Content-Type` header from `requiredHeaders`), 3 in parallel, per-file progress; on PUT failure retry once, then mark the row failed locally. When all PUTs settle → `callServerTool("commit_upload_batch")` → poll `get_upload_batch` every 2 s until `done` (or 10 min) → render per-file rows (imported / parked with candidate title / failed reason) → `app.updateModelContext({ content: [{type:"text", text: <one-paragraph summary with batchId and parked list>}] })` so the model can narrate and offer `resolve_upload_item`.
- Parked rows get inline buttons "Keep both (force)", "Skip", which call `resolve_upload_item` directly; the summary updates.
- No external assets; all CSS/JS inlined. `_meta.ui.csp = { connectDomains: ["https://storage.googleapis.com", "https://<our-host>"] }` and `_meta.ui.domain` set from env `MCP_PUBLIC_URL` hash (helper `mcpAppsStableDomain(url)`); omit `domain` if env missing.
- Theme: respects host `prefers-color-scheme`; uses the app's Geist/indigo tokens (project ui-ux gate applies: dense, no cover art, clear states).

### 4.5 CORS

- GCS bucket: add CORS `{ origin: ["*"], method: ["PUT","GET","HEAD"], responseHeader: ["Content-Type","Content-Length","x-goog-*"], maxAgeSeconds: 3600 }` via admin SDK script `scripts/set-storage-cors.mjs` (idempotent: merges, prints before/after, `--dry-run` default, `--apply` to write). Signed URL remains the only credential.
- Our origin: nothing new needed — the iframe talks to our server only via `callServerTool` (proxied through Anthropic), not directly. Keep `connectDomains` including our host anyway for the polling fallback described below.
- Fallback if the GCS PUT is blocked by CSP at runtime (detected as a `TypeError` on fetch within 2 s): the app falls back to `callServerTool("append_batch_item_chunk", { batchId, itemId, chunkIndex, dataBase64 })` in 1 MB chunks. That call is host→server (not through the model) so the 25K-token cap does not apply, only the 4.5 MB Vercel body cap. Server appends chunk objects like the existing chunked session and concatenates at commit. This is the safety net that guarantees "make it work" even if issue #40 bites.

### 4.6 CLI courier (bonus, cheap)

`scripts/upload-batch.mjs <file|dir>... [--collection X] [--bearer …]`: opens a batch (`source: cli` via `open_chart_dropzone`'s sibling arg `source:"cli"` — no UI meta), requests URLs, PUTs from disk, commits, polls, prints a table. Reads `SUPERVISOR_PROD_BEARER` / `MCP_BEARER` from `.env.local` or `--bearer`. Runs from Claude Code on Windows. Documented in `docs/BATCH-INTAKE.md`.

### 4.7 Error handling summary

| Failure | Where | Outcome |
|---------|-------|---------|
| File > 25 MB or bad type | iframe pre-check, then server schema | Never uploaded; listed with reason |
| Signed URL PUT fails | iframe | one retry → chunk fallback → else local `failed` row (never reaches server) |
| Blob missing at commit | server | item `failed(bytes_missing)` |
| Dedupe 409 | processor | `parked` with candidate; bytes retained |
| Conversion / Storage / Firestore error | processor | `failed` with code; Inngest retries transient errors first |
| Inngest unavailable | commit | `commit_upload_batch` returns `ok:false code:queue_unavailable`; batch stays `committed`; a cron `/api/cron/import-batches-resume` (every 10 min) re-sends events for `committed` batches older than 5 min |
| Batch expires (24 h) | cron sweep later | documented deferred |

### 4.8 Testing

- Unit (vitest): batch state machine / counts recompute; result→item mapping incl. 409 parsing; mime/ext filter shared between iframe and server (`src/lib/library/chart-file-types.ts`, imported by both); `mcpAppsStableDomain`; tool arg validation; dist-freshness check.
- Emulator (vitest.emulator.config): open → request URLs → (write staged bytes with admin SDK directly, standing in for the PUT) → commit → run `importBatchJob` handler in-process with a fake `step` (`step.run = (n, f) => f()`) → assert `imported`, `parked` (seed a same-title row first), `failed`; `resolve_upload_item force/skip/bind`; `list_parked_uploads`; owner-mismatch 403; tenant stamping = batch orgId not caller-supplied.
- Playwright (Windows, `npm run test:e2e` project): load `dist/chart-dropzone.html` standalone with a mocked `window.parent` postMessage host that answers `callServerTool` from a fixture, drop two files, assert PUT calls and final table.
- Build gate: `SKIP_ENV_VALIDATION=1 npx next build --webpack` (route.ts exports rule).
- UAT (`.paul/UAT-PENDING.md`, non-blocking): in Claude Desktop, "open the chart dropzone", drop 5 mixed files including one duplicate; confirm iframe renders, files upload, parked item shows, Claude narrates. If the iframe never renders → companion path (decision 1 fallback) is the next spec.

### 4.9 Out of scope

Local companion MCP server (fallback only), website changes, publish/notify, photo import, changing the 0.85 threshold, retiring old upload tools.
