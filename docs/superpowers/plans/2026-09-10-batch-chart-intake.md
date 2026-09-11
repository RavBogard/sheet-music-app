# Batch Chart Intake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Daniel and David upload many chart files at once through Claude (Desktop / claude.ai) without a single byte passing through the model, with near-duplicates parked for a human decision.

**Architecture:** Metadata-only MCP tools create an `upload_batches/{batchId}` record and mint signed Storage PUT URLs; an in-chat MCP App (drop-zone iframe) running on the user's device moves the bytes; an Inngest job runs each staged file through the existing `processChartUpload` pipeline, one durable step per file, and records per-item outcomes (imported / parked / failed) on the batch. A Drive-folder importer and a CLI feed the same batch backend.

**Tech Stack:** Next.js 16 App Router on Vercel, `mcp-handler@^1.1` over `@modelcontextprotocol/sdk@^1.29`, `@modelcontextprotocol/ext-apps` (new dep), Inngest `^3.54`, Firebase Admin (Firestore + Storage), Vite + `vite-plugin-singlefile` (new dev deps) for the iframe bundle, vitest (+ emulator config), Playwright.

**Spec:** `docs/superpowers/specs/2026-09-10-batch-chart-intake-design.md` — read it first; every task argues from it.

## Global Constraints

- Work in worktree `C:\Users\dsbog\CentralReform.live\worktrees\batch-intake-20260910` on branch `feat/batch-chart-intake`. `node_modules` is a junction to the canonical checkout; `.env.local` is copied in. Never `cd` to the canonical checkout.
- Files under `src/app/api/**/route.ts` may export ONLY HTTP handlers + route-segment config (`maxDuration`, `runtime`). Put every helper in `src/lib/**`.
- New server modules that touch firebase-admin start with `import "server-only"` (match `library-upload-session.ts`).
- Tool errors use `richError(machine_code, message, extras?, hint?)` from `@/lib/mcp/error-envelopes`; success payloads are plain objects with `ok: true`. Never throw out of a tool handler.
- Tenant: `orgFrom(extra)` from `@/lib/mcp/org-context` at batch-open time is the ONLY source of `orgId`. Never accept orgId from arguments or from the iframe.
- Every tool result must stay small (ids, counts, ≤ 20 rows). No bytes, no full item dumps by default.
- The per-file 25 MB cap and the 0.85 dedupe threshold are unchanged. Parked, never skipped, on 409.
- Tests: unit tests live beside code in `__tests__/*.test.ts` (vitest default config, jsdom). Emulator tests are `*.emulator.test.ts` run via `npm run test:emulator`. Mock `@/lib/rate-limit` and `firebase-admin/storage` in emulator tests exactly like `src/lib/mcp/__tests__/mcp-upload-session.emulator.test.ts` does.
- Before any commit: `npx tsc --noEmit -p tsconfig.json` clean for touched files and the relevant vitest files green. Commit messages: conventional (`feat(intake): …`), one task per commit, end body with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Do not push. The orchestrator pushes after review.

---

## File structure

| Path | Responsibility |
|------|----------------|
| `src/lib/library/chart-file-types.ts` | Single source of truth for accepted chart extensions ↔ mime types, `resolveChartMime(fileName, reportedMime)`, `isAcceptedChartFile`. Imported by server tools AND the iframe bundle (pure, no Node deps). |
| `src/lib/intake/batch-types.ts` | `UploadBatchDoc`, `UploadBatchItem`, status unions, `BATCH_TTL_MS`, `MAX_ITEMS_PER_BATCH = 200`, `MAX_FILES_PER_URL_REQUEST = 50`, `STAGED_PREFIX = "upload-batches"`. |
| `src/lib/intake/batch-store.ts` | Firestore access for batches: `createBatch`, `getBatch`, `addItems`, `updateItem` (transactional, recomputes counts), `setBatchStatus`, `listParkedForOrg`. All admin-SDK. |
| `src/lib/intake/batch-outcome.ts` | Pure: `mapUploadResultToItem(result: ProcessChartUploadResult)` → item patch; `recomputeCounts(items)`. |
| `src/lib/intake/staged-storage.ts` | Storage helpers: `stagedObjectPath(batchId,itemId)`, `signPut(path, mime, expiresAt)`, `statStaged(path)`, `downloadStaged(path)`, `deleteStaged(path)`, `appendChunk`/`assembleChunks`. |
| `src/lib/intake/drive-folder.ts` | `listDriveFolderCharts(drive, folderId, recursive)` and `fetchDriveFileForUpload(drive, driveFileId)` (extracted from `importChartFromDrive`; that function is refactored to call it). |
| `src/lib/intake/import-batch-job.ts` | Inngest function `importBatchJob` + exported `processBatchItem(batchId, itemId)` used by the job AND by `resolve_upload_item force`. |
| `src/lib/mcp/tools/batch-intake.ts` | The seven tool implementations as plain async functions `(uid, org, args) => result`. |
| `src/lib/mcp/tools/register-batch-intake.ts` | `registerBatchIntakeTools(server)` — zod schemas, descriptions, `registerAppTool`/`registerAppResource` wiring, `_meta.ui`. |
| `src/lib/mcp/apps/mcp-apps-domain.ts` | `mcpAppsStableDomain(connectorUrl)`. |
| `src/mcp-apps/chart-dropzone/{app.html,app.ts,styles.css}` + `src/mcp-apps/vite.config.ts` | Iframe source. |
| `src/mcp-apps/dist/chart-dropzone.html` | Checked-in single-file bundle served as the `ui://` resource. |
| `src/inngest/functions.ts`, `src/app/api/inngest/route.ts` | Register `importBatchJob`. |
| `src/app/api/cron/import-batches-resume/route.ts` + `vercel.json` | Re-send events for stuck `committed` batches every 10 min. |
| `scripts/set-storage-cors.mjs` | Idempotent bucket CORS setter (dry-run default). |
| `scripts/upload-batch.mjs` | CLI courier. |
| `firestore.rules` | `upload_batches` deny-all block. |
| `docs/BATCH-INTAKE.md` | Operator doc: how to use from Claude Desktop, CLI, Drive folder; troubleshooting. |
| `.paul/UAT-PENDING.md` | UAT item for the Claude Desktop render check. |

---

### Task 1: Shared file-type module + dedupe error payload extension

**Files:**
- Create: `src/lib/library/chart-file-types.ts`
- Test: `src/lib/library/__tests__/chart-file-types.test.ts`
- Modify: `src/lib/library-upload.ts` (`ProcessChartUploadError` at ~line 151; the two 409 returns at ~lines 470–476 and ~512–518)
- Test: `src/lib/__tests__/library-upload-duplicate-payload.test.ts` (new)

**Interfaces:**
- Produces:
  ```ts
  export const CHART_EXT_TO_MIME: Record<string, string> // ".pdf" → "application/pdf", ".png", ".jpg", ".jpeg" → "image/jpeg", ".heic", ".heif", ".xml" → "application/xml", ".musicxml" → "application/vnd.recordare.musicxml+xml", ".mxl" → "application/vnd.recordare.musicxml", ".mscz" → "application/x-musescore", ".mscx" → "application/x-musescore+xml", ".txt" → "text/plain"
  export function extOf(fileName: string): string            // lowercase incl. dot, "" if none
  export function resolveChartMime(fileName: string, reportedMime?: string | null): string | null
    // returns a mime from CHART_EXT_TO_MIME when reportedMime is empty / "application/octet-stream" / unknown; returns reportedMime when it is an accepted value; null when neither resolves
  export function isAcceptedChartFile(fileName: string, reportedMime?: string | null): boolean
  export const ACCEPTED_CHART_EXTENSIONS: string[]           // Object.keys(CHART_EXT_TO_MIME)
  ```
  and on `ProcessChartUploadError`: optional `matchedFileId?: string; matchedTitle?: string; score?: number` populated on both 409 branches (`score` = 1 for exact, `similarity` for fuzzy).

- [ ] **Step 1: Write failing tests** for `resolveChartMime` (octet-stream + `.mxl` → musicxml; `.PDF` uppercase → pdf; `application/pdf` with `.bin` name → pdf; `.docx` → null; empty name + `image/jpeg` → `image/jpeg`) and `isAcceptedChartFile`.
- [ ] **Step 2: Run** `npx vitest run src/lib/library/__tests__/chart-file-types.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement** the module (pure TS, no imports from server code).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Write failing test** `library-upload-duplicate-payload.test.ts`: mock `@/lib/firebase-admin` Firestore so `library_index.where("nameLower","==",…)` returns one active doc `{ id: "existing-1", data: () => ({ name: "Hashkivenu", status: "active" }) }`; call `processChartUpload({ buffer: Buffer.from("x"), originalFileName: "Hashkivenu.txt", mimeType: "text/plain", title: "Hashkivenu", uploaderUid: "u1" })`; expect `{ ok: false, code: "duplicate_exact", matchedFileId: "existing-1", matchedTitle: "Hashkivenu", score: 1 }`. Look at how other tests mock Firestore for `processChartUpload` (grep `vi.mock("@/lib/firebase-admin"` under `src/lib/__tests__`) and copy that shape.
- [ ] **Step 6: Run** → FAIL (fields undefined).
- [ ] **Step 7: Extend** the interface and both 409 returns (`matchedFileId: activeExactMatch.id`, `matchedTitle: existingName`, `score: 1`; fuzzy: `doc.id`, `existingName`, `similarity`).
- [ ] **Step 8: Run** both test files + `npx tsc --noEmit` → PASS.
- [ ] **Step 9: Commit** `feat(intake): shared chart file-type table; dedupe 409 carries matched row`.

---

### Task 2: Batch types, store, outcome mapper, staged-storage helpers

**Files:**
- Create: `src/lib/intake/batch-types.ts`, `src/lib/intake/batch-outcome.ts`, `src/lib/intake/batch-store.ts`, `src/lib/intake/staged-storage.ts`
- Test: `src/lib/intake/__tests__/batch-outcome.test.ts` (unit), `src/lib/intake/__tests__/batch-store.emulator.test.ts` (emulator)

**Interfaces:**
- Consumes: `ProcessChartUploadResult` (Task 1 fields), `OrgId` from `@/lib/org/types`, `LibraryCollection` from `@/lib/library-upload`.
- Produces (`batch-types.ts`):
  ```ts
  export type BatchSource = "dropzone" | "drive-folder" | "cli"
  export type BatchStatus = "open" | "committed" | "processing" | "done" | "expired"
  export type ItemStatus = "awaiting-bytes" | "staged" | "pending" | "imported" | "parked" | "failed" | "skipped"
  export interface ParkedInfo { reason: "duplicate_exact" | "duplicate_similar"; matchedFileId: string; matchedTitle: string; score?: number }
  export interface ItemDecision { action: "force" | "skip" | "bind"; boundFileId?: string; decidedBy: string; decidedAt: string }
  export interface UploadBatchItem { itemId: string; fileName: string; mimeType: string; sizeBytes: number; title: string; stagedPath?: string; driveFileId?: string; status: ItemStatus; resultFileId?: string; parked?: ParkedInfo; error?: { code: string; message: string }; decision?: ItemDecision; updatedAt: string }
  export interface BatchCounts { total: number; pending: number; imported: number; parked: number; failed: number; skipped: number }
  export interface UploadBatchDoc { ownerUid: string; orgId: OrgId; source: BatchSource; status: BatchStatus; defaults: { collection?: LibraryCollection; tags?: string[] }; counts: BatchCounts; items: Record<string, UploadBatchItem>; createdAt: FirebaseFirestore.Timestamp | Date; expiresAt: FirebaseFirestore.Timestamp | Date; committedAt?: …; finishedAt?: …; inngestEventId?: string }
  export const BATCH_TTL_MS = 24 * 60 * 60 * 1000
  export const SIGNED_PUT_TTL_MS = 15 * 60 * 1000
  export const MAX_ITEMS_PER_BATCH = 200
  export const MAX_FILES_PER_URL_REQUEST = 50
  export const MAX_ITEM_BYTES = 25 * 1024 * 1024
  export const STAGED_PREFIX = "upload-batches"
  export const BATCH_COLLECTION = "upload_batches"
  export function newBatchId(): string   // "ub-" + 12 hex
  export function newItemId(): string    // "it-" + 8 hex
  export function titleFromFileName(fileName: string): string // strip ext, replace _ and - runs with space, collapse whitespace, trim
  ```
  (`batch-outcome.ts`):
  ```ts
  export function mapUploadResultToItem(r: ProcessChartUploadResult): Partial<UploadBatchItem>
    // ok → { status:"imported", resultFileId: r.fileId }  (check ProcessChartUploadOk's field name for the id — it is `fileId`)
    // 409 duplicate_* → { status:"parked", parked:{ reason: r.code, matchedFileId: r.matchedFileId ?? "", matchedTitle: r.matchedTitle ?? "", score: r.score } }
    // else → { status:"failed", error:{ code: r.code, message: r.error } }
  export function recomputeCounts(items: Record<string, UploadBatchItem>): BatchCounts
    // pending = awaiting-bytes + staged + pending
  export const TERMINAL_ITEM_STATUSES: ReadonlySet<ItemStatus> // imported, parked, failed, skipped
  ```
  (`batch-store.ts`, all take `db: FirebaseFirestore.Firestore` first):
  ```ts
  export async function createBatch(db, args: { ownerUid: string; orgId: OrgId; source: BatchSource; defaults: UploadBatchDoc["defaults"] }): Promise<{ batchId: string; expiresAt: Date }>
  export async function getBatch(db, batchId): Promise<(UploadBatchDoc & { batchId: string }) | null>
  export async function addItems(db, batchId, items: UploadBatchItem[]): Promise<void>  // transaction; rejects if total would exceed MAX_ITEMS_PER_BATCH (throw Error("batch_full")) or batch.status !== "open" (throw Error("batch_not_open"))
  export async function updateItem(db, batchId, itemId, patch: Partial<UploadBatchItem>): Promise<UploadBatchDoc> // transaction: merge patch (+updatedAt now ISO), recomputeCounts, write both
  export async function setBatchStatus(db, batchId, status: BatchStatus, extra?: Partial<Pick<UploadBatchDoc,"committedAt"|"finishedAt"|"inngestEventId">>): Promise<void>
  export async function listParkedForOrg(db, orgId: OrgId, limit = 50): Promise<Array<{ batchId: string; itemId: string; title: string; fileName: string; parked: ParkedInfo; createdAt: string }>>
    // query upload_batches where orgId == org and counts.parked > 0 orderBy createdAt desc limit 20, flatten parked items, slice(limit)
  ```
  (`staged-storage.ts`):
  ```ts
  export function stagedObjectPath(batchId: string, itemId: string): string // `${STAGED_PREFIX}/${batchId}/${itemId}`
  export function chunkObjectPath(batchId: string, itemId: string, index: number): string // `${STAGED_PREFIX}/${batchId}/${itemId}.chunk-${String(index).padStart(6,"0")}`
  export function getIntakeBucket()  // same env resolution as library-upload-session.ts getBucket()
  export async function signPut(path: string, contentType: string, expiresAtMs: number): Promise<string>
  export async function statStaged(path: string): Promise<{ exists: boolean; sizeBytes: number }>
  export async function downloadStaged(path: string): Promise<Buffer>
  export async function deleteStaged(path: string): Promise<void>  // swallow 404
  export async function saveChunk(batchId, itemId, index, bytes: Buffer): Promise<void>
  export async function assembleChunks(batchId, itemId, expectedTotal: number): Promise<{ ok: true; sizeBytes: number } | { ok: false; missingIndex: number }>
    // list `${STAGED_PREFIX}/${batchId}/${itemId}.chunk-` prefix, require contiguous 0..n-1 and n === expectedTotal, concat in order, save to stagedObjectPath, delete chunks best-effort
  ```

- [ ] **Step 1: Unit tests** for `mapUploadResultToItem` (3 branches), `recomputeCounts`, `titleFromFileName("Mi_Chamocha-Friedman (2).pdf") === "Mi Chamocha Friedman (2)"`, `newBatchId()` prefix/length.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** types + outcome. **Step 4: Run** → PASS.
- [ ] **Step 5: Emulator test** `batch-store.emulator.test.ts`: init admin app against emulator (copy the `beforeAll` from `mcp-upload-session.emulator.test.ts`), then: create → get has status open + zero counts; addItems 2 → counts.total 2, pending 2; updateItem to imported → counts imported 1 pending 1; addItems on a `committed` batch throws `batch_not_open`; adding 201 items throws `batch_full`; `listParkedForOrg` returns only batches of the org with parked > 0.
- [ ] **Step 6: Run** `npm run test:emulator -- src/lib/intake/__tests__/batch-store.emulator.test.ts` (or run the full emulator suite if filtering is awkward) → FAIL, then **Step 7: Implement** store + staged-storage. **Step 8: Run** → PASS; `npx tsc --noEmit` clean.
- [ ] **Step 9: Commit** `feat(intake): batch types, Firestore store, outcome mapper, staged storage helpers`.

---

### Task 3: Drive folder helpers + refactor `importChartFromDrive` to share the fetch logic

**Files:**
- Create: `src/lib/intake/drive-folder.ts`
- Modify: `src/lib/mcp/tools/library-upload.ts` (`importChartFromDrive`, ~lines 488–685) — extract the metadata → conversion decision → bytes fetch into the new helper; behavior unchanged.
- Test: `src/lib/intake/__tests__/drive-folder.test.ts` (unit, fake `DriveClient` object)
- Run existing: `npx vitest run src/lib/mcp/__tests__ -t "import_chart_from_drive"` (and any test file mentioning importChartFromDrive) must stay green.

**Interfaces:**
- Consumes: `DriveClient` from `@/lib/google-drive` (`getFileMetadata`, `listFilesByQuery({ q, fields, pageToken? })` — read its exact params at line ~296, `getFile`, `fetchAsPdf(fileId, sourceMime)`), `driveSourceIsConvertible` (line ~119), `resolveChartMime` (Task 1).
- Produces:
  ```ts
  export interface DriveChartCandidate { driveFileId: string; name: string; mimeType: string; sizeBytes: number; md5Checksum?: string; modifiedTime?: string; parents?: string[] }
  export type DriveLike = Pick<DriveClient, "getFileMetadata" | "listFilesByQuery" | "getFile" | "fetchAsPdf">
  export async function listDriveFolderCharts(drive: DriveLike, folderId: string, opts: { recursive: boolean; max: number }): Promise<{ candidates: DriveChartCandidate[]; skipped: Array<{ name: string; reason: "folder" | "unsupported_type" | "too_large" }> }>
    // q: `'${folderId}' in parents and trashed = false`; accept if driveSourceIsConvertible(mime) (Google Docs / Office → PDF) or resolveChartMime(name, mime) !== null; recursive: descend into mimeType application/vnd.google-apps.folder up to depth 3
  export async function fetchDriveFileForUpload(drive: DriveLike, driveFileId: string): Promise<{ ok: true; buffer: Buffer; mimeType: string; originalFileName: string; driveName: string; driveMime: string } | { ok: false; code: "drive_not_found" | "drive_forbidden" | "unsupported_type" | "empty_file" | "drive_error"; message: string }>
  ```
  `importChartFromDrive` keeps its exact public result shapes; internally it calls `fetchDriveFileForUpload` and maps its `ok:false` codes to the same `richError` envelopes it produces today (keep `mapDriveError` for the metadata-stage errors it already handles).

- [ ] **Step 1: Unit tests** with a fake drive: folder listing filters a `.docx` (convertible → accepted as pdf), a `.mxl` reported as octet-stream (accepted), a `.zip` (skipped unsupported_type), a subfolder (skipped when recursive=false, descended when true); `fetchDriveFileForUpload` returns pdf bytes via `fetchAsPdf` for a Google Doc and raw bytes via `getFile` for a pdf; empty bytes → `empty_file`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**. **Step 4: Run** → PASS.
- [ ] **Step 5: Refactor** `importChartFromDrive` to use `fetchDriveFileForUpload`; run the existing drive-import tests → PASS; `npx tsc --noEmit` clean.
- [ ] **Step 6: Commit** `refactor(intake): extract Drive fetch helper; add folder listing`.

---

### Task 4: Inngest processor + `processBatchItem`

**Files:**
- Create: `src/lib/intake/import-batch-job.ts`
- Modify: `src/inngest/functions.ts` (re-export `importBatchJob`), `src/app/api/inngest/route.ts` (`functions: [generatePdfJob, importBatchJob]`)
- Test: `src/lib/intake/__tests__/import-batch-job.emulator.test.ts`

**Interfaces:**
- Consumes: Task 2 store/storage, Task 3 `fetchDriveFileForUpload`, `processChartUpload`, `stampOrg`, `inngest` client from `@/inngest/client`.
- Produces:
  ```ts
  export const IMPORT_BATCH_EVENT = "library/import-batch"
  export async function processBatchItem(db, batchId: string, itemId: string, opts?: { force?: boolean }): Promise<UploadBatchItem>
    // 1. read batch+item; if item.status is terminal and !opts.force → return item unchanged (idempotent retry guard)
    // 2. bytes: item.driveFileId ? fetchDriveFileForUpload(new DriveClient(), driveFileId) : downloadStaged(item.stagedPath)
    //    (drive fetch ok:false → updateItem failed with that code)
    // 3. result = processChartUpload({ buffer, originalFileName: item.fileName, mimeType, title: item.title, collection: batch.defaults.collection, tags: batch.defaults.tags, uploaderUid: batch.ownerUid, force: !!opts?.force, source: item.driveFileId ? "drive-sync" : "upload", driveMetadata: item.driveFileId ? { driveFileId, md5Checksum, modifiedTime } : undefined })
    // 4. patch = mapUploadResultToItem(result); if imported → await stampOrg(db, fileId, batch.orgId)
    // 5. staged cleanup: imported|failed → deleteStaged(stagedPath) best-effort; parked → keep
    // 6. return updateItem(db, batchId, itemId, patch).items[itemId]
  export async function runImportBatch(db, batchId: string, step: { run<T>(name: string, fn: () => Promise<T>): Promise<T> }): Promise<BatchCounts>
    // load → setBatchStatus processing → for each item with status staged|pending (sorted by itemId) step.run(`item-${itemId}`, () => processBatchItem(...).then(i => ({ itemId: i.itemId, status: i.status }))) → step.run("finish", …) setBatchStatus done + finishedAt → return counts
  export const importBatchJob = inngest.createFunction(
    { id: "library-import-batch", concurrency: { limit: 3 }, retries: 2 },
    { event: IMPORT_BATCH_EVENT },
    async ({ event, step }) => runImportBatch(getFirestore(), event.data.batchId as string, step))
  ```
  Also `src/lib/intake/enqueue.ts`: `export async function enqueueImportBatch(batchId: string): Promise<{ ok: true; eventId: string } | { ok: false; message: string }>` wrapping `inngest.send({ name: IMPORT_BATCH_EVENT, data: { batchId } })` in try/catch.

- [ ] **Step 1: Emulator test** (mock `firebase-admin/storage` with the path-keyed in-memory store pattern; mock `@/lib/library-upload` `processChartUpload` to return `ok` for title "Alpha", `duplicate_similar` with matched fields for "Beta", `convert_failed` for "Gamma"; mock `@/lib/mcp/org-context` `stampOrg`): create batch with 3 staged items whose staged paths are pre-saved in the store; `runImportBatch(db, id, { run: (_n, f) => f() })` → counts `{imported:1, parked:1, failed:1, pending:0}`; item Beta has `parked.matchedFileId`; staged object of Alpha deleted, Beta retained; calling `runImportBatch` again does not call `processChartUpload` (idempotent guard); `processBatchItem(..., {force:true})` on Beta calls processChartUpload with `force:true` and flips it to imported.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** job + enqueue + route registration. **Step 4: Run** → PASS; `npx tsc --noEmit` clean.
- [ ] **Step 5: Commit** `feat(intake): Inngest import-batch job with per-item durable steps`.

---

### Task 5: MCP tools + registration + MCP Apps resource wiring

**Files:**
- Create: `src/lib/mcp/tools/batch-intake.ts`, `src/lib/mcp/tools/register-batch-intake.ts`, `src/lib/mcp/apps/mcp-apps-domain.ts`, `src/lib/mcp/apps/dropzone-resource.ts`
- Modify: `src/lib/mcp/tools/index.ts` (export `registerBatchIntakeTools` from the new file — do NOT add 500 lines to index.ts), `src/app/api/mcp/route.ts` (call `registerBatchIntakeTools(server)`), `package.json` (add dep `@modelcontextprotocol/ext-apps` — pin the latest 1.x; run `npm install` in the CANONICAL checkout's node_modules via the junction is NOT allowed; instead run `npm install --no-save` is also wrong. Correct procedure: run `npm install @modelcontextprotocol/ext-apps@<ver>` inside the worktree; because node_modules is a junction the install lands in the shared tree, and package.json/package-lock.json change in the worktree. That is acceptable and expected.)
- Test: `src/lib/mcp/__tests__/batch-intake-tools.emulator.test.ts`, `src/lib/mcp/apps/__tests__/mcp-apps-domain.test.ts`, extend `src/lib/mcp/__tests__/mcp-tool-inventory*.test.ts` if such a snapshot test exists (grep for "tools/list" or a tool-name list test and add the seven names).

**Interfaces:**
- Consumes: Tasks 1–4; `loadUploader`, `isUploadAllowed`, `isTrustedLeader` from `@/lib/mcp/tools/uploader-roles`; `checkUserRateLimit` from `@/lib/rate-limit`; `orgFrom` from `@/lib/mcp/org-context`; `registerAppTool`, `registerAppResource`, `RESOURCE_MIME_TYPE` from `@modelcontextprotocol/ext-apps/server`.
- Produces (`batch-intake.ts`; every function `(uid: string, org: OrgId, args) => Promise<Result | RichErrorEnvelope>`):
  ```ts
  openChartDropzone(uid, org, { collection?, tags?, source?: "dropzone" | "cli" })
    → { ok:true, batchId, expiresAt, defaults, maxFileBytes: MAX_ITEM_BYTES, acceptedExtensions: ACCEPTED_CHART_EXTENSIONS, maxFilesPerRequest: MAX_FILES_PER_URL_REQUEST }
    // gates: loadUploader → isUploadAllowed else richError("forbidden_role", …); curated-collection gate same as request_chart_upload_url; checkUserRateLimit(uid,"upload",{bypass:isTrustedLeader(roles)})
  requestBatchUploadUrls(uid, org, { batchId, files: Array<{ fileName, mimeType?, sizeBytes }> })
    → { ok:true, items: Array<{ itemId, fileName, uploadUrl, method:"PUT", requiredHeaders:{ "Content-Type": mime }, expiresAt }>, rejected: Array<{ fileName, reason: "unsupported_type" | "too_large" }> }
    // owner check (batch.ownerUid === uid else richError("forbidden", …, {errorCode:403})); batch.status must be open; ≤ 50 files; mime = resolveChartMime(fileName, mimeType); title = titleFromFileName(fileName); items created awaiting-bytes with stagedPath; ONE rate-limit token per call
  commitUploadBatch(uid, org, { batchId })
    → { ok:true, batchId, status, counts, queued: boolean }
    // owner or admin; if status already committed/processing/done → return current counts, queued:false; else for each awaiting-bytes item statStaged: exists && sizeBytes === item.sizeBytes → staged; exists && size mismatch → failed(size_mismatch); missing → failed(bytes_missing). setBatchStatus committed; enqueueImportBatch → ok ? queued:true : richError("queue_unavailable", …, { batchId, counts }, "Batch is saved; a cron retries the queue every 10 minutes, or call commit_upload_batch again.")
  appendBatchItemChunk(uid, org, { batchId, itemId, chunkIndex, totalChunks, dataBase64 })
    → { ok:true, itemId, chunkIndex, receivedChunks } and on the last contiguous chunk assembles: → { ok:true, itemId, assembled:true, sizeBytes }
    // owner; item awaiting-bytes; strict base64 decode (copy decodeBase64Strict from library-upload-session.ts into staged-storage.ts as an export); chunk ≤ 3 MB; cumulative ≤ 25 MB; NO rate-limit token
  getUploadBatch(uid, org, { batchId, includeItems?: "attention" | "all" })
    → { ok:true, batchId, status, source, counts, createdAt, finishedAt?, attention: Array<{ itemId, fileName, title, status, parked?, error? }>, imported: Array<{ itemId, title, resultFileId }> (≤ 20 unless "all"), items?: UploadBatchItem[] (only when "all") }
    // owner or admin (roles.admin)
  resolveUploadItem(uid, org, { batchId, itemId, action, boundFileId? })
    → { ok:true, itemId, status, resultFileId?, decision }
    // owner or admin; item must be parked (or failed for "skip"); force → processBatchItem(db,batchId,itemId,{force:true}); skip → updateItem skipped + deleteStaged; bind → requires boundFileId that exists in library_index else richError("not_found"); record decision {decidedBy: uid, decidedAt}
  listParkedUploads(uid, org, { limit? }) → { ok:true, parked: […], count }
  importDriveFolder(uid, org, { folderId, collection?, recursive?, dryRun? })
    → dryRun: { ok:true, dryRun:true, wouldImport: candidates.map(name,mime,size), skipped }
    → real: { ok:true, batchId, counts, queued, skipped }
    // gates as openChartDropzone; listDriveFolderCharts(new DriveClient(), folderId, { recursive: !!recursive, max: MAX_ITEMS_PER_BATCH }); createBatch(source:"drive-folder"); addItems status "pending" with driveFileId; setBatchStatus committed; enqueue
  ```
  (`mcp-apps-domain.ts`): `export function mcpAppsStableDomain(connectorUrl: string): string` = sha256 hex slice(0,32) + ".claudemcpcontent.com".
  (`dropzone-resource.ts`): `export const DROPZONE_RESOURCE_URI = "ui://chart-dropzone/app.html"`, `export function loadDropzoneHtml(): string` (reads `src/mcp-apps/dist/chart-dropzone.html` via `fs.readFileSync` resolved from `process.cwd()` with the same two-candidate fallback pattern `route.ts` uses for AGENT-GUIDE.md; returns a minimal `<html><body>Dropzone bundle missing</body></html>` if absent and logs a warn), `export function dropzoneUiMeta(): { ui: { resourceUri: string; csp: { connectDomains: string[] }; domain?: string } }` where connectDomains = `["https://storage.googleapis.com", <origin of MCP_PUBLIC_URL if set>]` and `domain = mcpAppsStableDomain(process.env.MCP_PUBLIC_URL)` only when `MCP_PUBLIC_URL` is set.
  (`register-batch-intake.ts`): `export function registerBatchIntakeTools(server: McpServer): void` registers `open_chart_dropzone` via `registerAppTool(server, "open_chart_dropzone", { title, description, inputSchema: { collection: collectionSchema.optional(), tags: z.array(z.string()).optional() }, _meta: dropzoneUiMeta() }, handler)`, the six others via `server.registerTool`, and `registerAppResource(server, DROPZONE_RESOURCE_URI, DROPZONE_RESOURCE_URI, { mimeType: RESOURCE_MIME_TYPE }, async () => ({ contents: [{ uri, mimeType: RESOURCE_MIME_TYPE, text: loadDropzoneHtml() }] }))`. Handlers read `uid` and `org` exactly like existing tools in `index.ts` (`extra.authInfo?.extra?.uid`, `orgFrom(extra)`) and wrap results in `{ content: [{ type:"text", text: JSON.stringify(result) }], structuredContent: result, isError: isErrorEnvelope(result) }` — copy the exact wrapping used by `request_chart_upload_url` in `index.ts` (~line 3002). Tool descriptions must include the agent guidance from spec §4.2 verbatim in spirit: Claude never handles bytes; open the dropzone; read results with get_upload_batch; talk through parked items; resolve with resolve_upload_item; use import_drive_folder for Drive folders; the CLI is `scripts/upload-batch.mjs`.

- [ ] **Step 1:** `npm install @modelcontextprotocol/ext-apps@latest` in the worktree; confirm `node -e "require('@modelcontextprotocol/ext-apps/server')"` prints nothing (loads).
- [ ] **Step 2: Unit test** `mcpAppsStableDomain("https://example.com/mcp")` equals the value from `node -e 'console.log(require("crypto").createHash("sha256").update("https://example.com/mcp").digest("hex").slice(0,32)+".claudemcpcontent.com")'`.
- [ ] **Step 3: Emulator test** for the tools (mock rate-limit, storage with in-memory store + `mockGetSignedUrl` returning `["https://signed.example/put"]`, `@/lib/intake/enqueue` → `{ok:true,eventId:"evt"}`, `@/lib/library-upload` processChartUpload as in Task 4): seed `users/u-leader` with `roles: { band_leader: true }` (look at how `loadUploader` reads roles and seed accordingly) and `users/u-member` with none. Cases: member → open denied `forbidden_role`; leader open → batchId; request URLs with `["A.pdf","B.mxl"(octet-stream),"C.docx"]` → 2 items + 1 rejected unsupported_type; other uid requesting on that batch → 403; commit with only A's bytes saved → A staged, B failed bytes_missing, status committed, queued true; get_upload_batch attention lists B; second commit returns queued:false; `resolve_upload_item skip` on a parked item (seed via updateItem) → skipped; `bind` with unknown boundFileId → not_found; `list_parked_uploads` scoped by org; `import_drive_folder dryRun` with a mocked `@/lib/google-drive` DriveClient listing 2 files → wouldImport length 2 and no batch doc created; real → batch with 2 pending items + queued.
- [ ] **Step 4: Run** → FAIL. **Step 5: Implement** all files + wire `route.ts`. **Step 6: Run** tests → PASS; `npx tsc --noEmit` clean; `SKIP_ENV_VALIDATION=1 npx next build --webpack` succeeds (route.ts export rule). If a tool-inventory snapshot test exists, update it.
- [ ] **Step 7: Commit** `feat(intake): batch intake MCP tools + dropzone app resource`.

---

### Task 6: Drop-zone MCP App (iframe bundle)

**Files:**
- Create: `src/mcp-apps/chart-dropzone/app.html`, `src/mcp-apps/chart-dropzone/app.ts`, `src/mcp-apps/chart-dropzone/styles.css`, `src/mcp-apps/vite.config.ts`, `src/mcp-apps/dist/chart-dropzone.html` (build output, committed), `src/mcp-apps/README.md`
- Modify: `package.json` scripts: `"build:mcp-apps": "vite build --config src/mcp-apps/vite.config.ts"`; dev deps `vite`, `vite-plugin-singlefile` (check whether `vite` is already present transitively via vitest — it is a dependency of vitest but add it explicitly as a devDependency anyway).
- Test: `src/mcp-apps/__tests__/dist-freshness.test.ts` (unit: sha256 of concatenated source files must equal the hash embedded as `<!-- src-hash: … -->` at the top of the dist file; the build writes that comment via a tiny Vite plugin in `vite.config.ts`), `e2e/chart-dropzone.spec.ts` (Playwright chromium project).

**Interfaces:**
- Consumes: tool result shape of `open_chart_dropzone` and the request/commit/get/resolve result shapes from Task 5 (copy the TS types into `src/mcp-apps/chart-dropzone/types.ts` by importing from `@/lib/mcp/tools/batch-intake` types ONLY if they are type-only imports — the bundle must not pull server code; safest is a small `src/lib/intake/wire-types.ts` with the result interfaces, imported by both server and app). `App` from `@modelcontextprotocol/ext-apps` (`app.connect()`, `app.ontoolresult`, `app.callServerTool({ name, arguments })`, `app.updateModelContext({ content: [{ type: "text", text }] })`, `app.sendSizeChanged?` if available — check the installed version's API docs under `node_modules/@modelcontextprotocol/ext-apps/`). Shared file filter from `@/lib/library/chart-file-types` (pure).
- Behavior (from spec §4.4), precisely:
  1. On load: `app.connect()`; render "Waiting for Claude…" until `ontoolresult` delivers `structuredContent` (fall back to parsing the first text content as JSON) with `batchId`, `expiresAt`, `acceptedExtensions`, `maxFileBytes`, `maxFilesPerRequest`.
  2. UI: header "Chart drop-zone" + batch id (small mono), a large dashed drop target ("Drop chart files here, or choose files"), hidden `<input type=file multiple accept=…>` wired to a button, a dense table (file, size, status, detail), a footer with totals and a single primary button "Upload N files" (disabled until files are queued; hidden after commit).
  3. Adding files: filter with `isAcceptedChartFile` and `size <= maxFileBytes`; rejected rows show reason and are never sent. Duplicated names within the queue are allowed (server dedupes by title).
  4. Upload: chunk the queue into groups of `maxFilesPerRequest`, `callServerTool("request_batch_upload_urls")`; for each returned item PUT via `fetch(uploadUrl, { method:"PUT", headers: requiredHeaders, body: file })`, 3 concurrent, per-row progress text (uploading → staged). On `fetch` throwing a `TypeError` (CSP/CORS block) or non-2xx: retry once; if still failing, fall back to `append_batch_item_chunk` in 1 MB base64 chunks (`FileReader.readAsDataURL` slice → strip prefix) with `totalChunks`. If that fails too, row → "failed (could not upload)".
  5. When every row is staged or failed: `callServerTool("commit_upload_batch")`; then poll `get_upload_batch` every 2 s until `status === "done"` or 10 min elapsed; update rows from `attention` + `imported`.
  6. Parked rows show two inline buttons: "Keep both" → `resolve_upload_item {action:"force"}`; "Skip" → `{action:"skip"}`. Update row on response.
  7. After done (and after each resolve): `app.updateModelContext` with text: `Upload batch <batchId> finished: <imported> imported, <parked> parked (need a decision), <failed> failed. Parked: <title> ↔ existing "<matchedTitle>" (<matchedFileId>); … Failed: <fileName>: <code>. Use get_upload_batch / resolve_upload_item for details.` Keep under 1,500 chars (truncate lists with "+N more").
  8. Styling: system font stack with Geist if available, 13px dense rows, indigo accent `#6366f1`, amber for parked, red for failed, green for imported; `prefers-color-scheme: dark` variant; everything inline (no external URLs anywhere in the HTML).
  9. Size: report height changes to the host if the installed `App` exposes a size-changed method; otherwise ensure the root has explicit min-height 320px.

- [ ] **Step 1:** Create `vite.config.ts` (root `src/mcp-apps/chart-dropzone`, `viteSingleFile()`, output `../dist/chart-dropzone.html`, plus the src-hash banner plugin), sources, and the freshness test. `npm run build:mcp-apps` → dist exists; `npx vitest run src/mcp-apps` → PASS.
- [ ] **Step 2: Playwright e2e** `e2e/chart-dropzone.spec.ts` (chromium project only, `test.use({ baseURL: undefined })`): serve the dist file via `page.setContent(html)` or `page.goto("file://…")`; before load, `page.addInitScript` installs a fake host: intercept `window.parent.postMessage` by overriding `window.parent` is not possible, so instead the app must support a test seam: if `window.__DROPZONE_TEST_HOST__` is defined, the app uses it instead of the `App` class (`{ onToolResult(cb), callServerTool(req) }`). The fake host answers `request_batch_upload_urls` with URLs pointing at `page.route`-intercepted `https://storage.googleapis.com/test/**` (respond 200), `commit_upload_batch` → queued, `get_upload_batch` → first `processing`, then `done` with one imported and one parked. Use `page.setInputFiles` with two small fixture PDFs from `e2e/fixtures/` (create two tiny valid PDFs, ~1 KB). Assert: two rows, PUTs observed (2), commit called once, final rows read "imported" and "parked", the parked row has "Keep both" and "Skip", and `updateModelContext` was called with text containing "1 imported, 1 parked".
- [ ] **Step 3: Run** `npx playwright test e2e/chart-dropzone.spec.ts --project=chromium` → PASS. Also `npx vitest run src/mcp-apps` → PASS.
- [ ] **Step 4: Commit** `feat(intake): chart drop-zone MCP App bundle + e2e`.

---

### Task 7: Resume cron, Firestore rules, CORS script, CLI courier, docs, UAT entry

**Files:**
- Create: `src/lib/intake/resume-stuck-batches.ts` (`resumeStuckBatches(db, { olderThanMs = 5*60*1000, limit = 20 }) → { resent: string[] }` — query `upload_batches` where status == "committed" and committedAt < now-olderThan; `enqueueImportBatch` each), `src/app/api/cron/import-batches-resume/route.ts` (copy the CRON_SECRET bearer check from an existing cron route, e.g. `src/app/api/cron/ai-enrich-retry/route.ts`; `GET` only; `maxDuration = 60`), `scripts/set-storage-cors.mjs`, `scripts/upload-batch.mjs`, `docs/BATCH-INTAKE.md`
- Modify: `vercel.json` crons (add `{ "path": "/api/cron/import-batches-resume", "schedule": "*/10 * * * *" }`), `firestore.rules` (add `match /upload_batches/{id} { allow read, write: if false; }` beside similar admin-only collections), `.paul/UAT-PENDING.md` (append the UAT item from spec §4.8)
- Test: `src/lib/intake/__tests__/resume-stuck-batches.emulator.test.ts`; `src/lib/__tests__/firestore-rules*.test.ts` if a rules test harness exists (grep `@firebase/rules-unit-testing`) — add a denial assertion for `upload_batches`; `scripts/__tests__/upload-batch-cli.test.ts` (unit: import the CLI's pure `planFiles(paths)` helper — the CLI must export `planFiles` and `main` and only run `main` when `import.meta.url === process.argv[1]` file URL, matching the pattern of `scripts/supervisor-prod-bearer.mjs`).

**Interfaces:**
- CLI (`scripts/upload-batch.mjs`): `node scripts/upload-batch.mjs <path>... [--collection core|supplemental|uploads|nava] [--bearer TOKEN] [--endpoint https://centralreform.live/api/mcp] [--dry-run]`. Resolves bearer from `--bearer`, else `MCP_BEARER`, else `SUPERVISOR_PROD_BEARER` in `.env.local`. Talks JSON-RPC 2.0 to the MCP endpoint (`initialize` → `tools/call`) with `Accept: application/json, text/event-stream`; parse SSE-framed responses like `scripts/supervisor-prod-bearer.mjs` does (read it). Flow: `open_chart_dropzone {source:"cli", collection}` → `request_batch_upload_urls` in groups of 50 → PUT each file (`fetch`, `Content-Type` from `requiredHeaders`), 3 concurrent → `commit_upload_batch` → poll `get_upload_batch` every 3 s until done → print a table (file, status, detail) and exit 0 if failed === 0 else 1. `--dry-run` prints the plan (accepted/rejected files with resolved mime) and exits.
- CORS script: uses firebase-admin with `FIREBASE_CLIENT_EMAIL`/`FIREBASE_PRIVATE_KEY` from `.env.local` (see how other `scripts/*.mjs` init admin), `bucket.getMetadata()` → print current `cors`; desired entry `{ origin: ["*"], method: ["PUT","GET","HEAD"], responseHeader: ["Content-Type","Content-Length","x-goog-resumable","x-goog-content-length-range"], maxAgeSeconds: 3600 }`; with `--apply` calls `bucket.setCorsConfiguration([...existingNonDuplicate, desired])`; default is dry-run.
- Docs (`docs/BATCH-INTAKE.md`): what to say to Claude ("open the chart drop-zone", "import the Drive folder <link>"), what happens, how parked items work, CLI usage, env vars (`MCP_PUBLIC_URL`, `INNGEST_*` already present), troubleshooting (iframe not rendering → Claude Desktop developer tools; PUT blocked → chunk fallback is automatic; batch stuck committed → cron resumes in ≤10 min), and the deliberately unchanged legacy tools.

- [ ] **Step 1:** Emulator test for `resumeStuckBatches`: seed one `committed` batch 10 min old, one 1 min old, one `done` → only the first is re-sent (mock enqueue). Run → FAIL → implement → PASS.
- [ ] **Step 2:** Cron route + `vercel.json`; `SKIP_ENV_VALIDATION=1 npx next build --webpack` still passes.
- [ ] **Step 3:** `firestore.rules` block (+ rules test if harness exists).
- [ ] **Step 4:** `scripts/set-storage-cors.mjs` — run `node scripts/set-storage-cors.mjs` (dry-run) and paste the current CORS JSON into the commit message body. Do NOT `--apply`; the orchestrator applies.
- [ ] **Step 5:** CLI + its unit test; `node scripts/upload-batch.mjs --dry-run e2e/fixtures` prints the plan without network.
- [ ] **Step 6:** Docs + UAT entry.
- [ ] **Step 7:** Commit `feat(intake): resume cron, rules, CORS script, CLI courier, docs`.

---

### Task 8: Integration verification (orchestrator + auditor, after deploy)

Not a subagent coding task. Orchestrator: merge to master, push, wait for Vercel deploy, run `node scripts/set-storage-cors.mjs --apply`, then `node scripts/upload-batch.mjs e2e/fixtures/*.pdf --collection uploads` against prod with the supervisor bearer → expect imported rows, then `list_parked_uploads`/`get_upload_batch` via MCP → clean up the fixture rows with `delete_chart`. Set `MCP_PUBLIC_URL` in Vercel env to the exact connector URL Daniel uses (ask him or read from Claude Desktop connector settings) so `ui.domain` is stable. Append the Claude Desktop render check to UAT. Dispatch `dan-auditor` on the merged range.

---

## Self-review

- Spec §4.1 data model → Task 2. §4.2 tools (7 + chunk fallback) → Task 5. §4.3 processor → Task 4. §4.4 app → Task 6. §4.5 CORS + chunk fallback → Task 5 (server) + Task 6 (client) + Task 7 (script). §4.6 CLI → Task 7. §4.7 queue-unavailable + resume cron → Task 5 + Task 7. §4.8 tests → each task; build gate → Tasks 5, 7; UAT → Task 7/8. Drive folder → Tasks 3, 5.
- Names cross-checked: `processBatchItem`, `runImportBatch`, `enqueueImportBatch`, `mapUploadResultToItem`, `recomputeCounts`, `updateItem`, `statStaged`, `stagedObjectPath`, `resolveChartMime`, `titleFromFileName`, `dropzoneUiMeta`, `DROPZONE_RESOURCE_URI` used consistently above.
- Known open point for executors: exact `App` API surface of the installed `@modelcontextprotocol/ext-apps` version (check `node_modules/.../dist/*.d.ts`); tool-result delivery field (`structuredContent` vs text) is handled by accepting both.
