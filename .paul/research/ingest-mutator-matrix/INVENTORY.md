# INVENTORY — Ingest channels × background mutators

**Lane:** `ingest-mutator-matrix-research` (Tier-0 deep research).
**Branch:** `feat/ingest-mutator-matrix-research`.
**Cut from:** `54378d7e5` (master tip 2026-05-24T04:20Z).
**Method:** every cited file read top-to-bottom on the worktree at the cut SHA; literal `set()` / `update()` / `delete()` / `if (...)` lines quoted with file path + line number; memory entries cross-referenced but never trusted blindly (per `[[feedback_cowork_prompt_verify_before_write]]`).
**Scope:** anything that creates or mutates a `library_index` row, writes a `library/*` Storage object, or creates a `tracks` row. Setlists, songs, and `library_signals/latest` only when an ingest/mutator surface touches them.

---

## 0. The 3-shape `doc.id` taxonomy (the load-bearing fact)

The bug class we're hunting is shape-blind sweep mutators. A `library_index/{doc.id}` row can carry ONE of three shapes:

| shape | example | minted by | density today |
|------|---------|----------|---------------|
| `upload-{uuid}` | `upload-10da060e-...` | `processChartUpload` (`src/lib/library-upload.ts:267`) — every modern ingest path (in-app upload, MCP upload, drive-sync cron, MCP `import_chart_from_drive`, MCP `save_scraped_chart`, salvage), so this is the dominant shape since 2026-04-ish | majority |
| Drive-id long-alnum | `1AZum...` | legacy `syncLibraryIndex` (`src/lib/sync-engine.ts:248`) when called from admin route `/api/library/sync` — `id: file.id` (raw Drive id, no prefix) | non-trivial historical tail |
| bare UUID | `0a1f...-...-...-...-...` (no `upload-` prefix) | pre-atomic-guard B-006 class — older ingest that ran before processChartUpload landed; some manual heal-from-local paths in `scripts/heal-orphans-from-local.ts` | small but non-zero |

Memory entry `[[project_orphan_baseline]]` (2026-05-20) says: active-row orphans = 0 after reconcile, **but 297 library_index rows already marked `orphaned` + 9 duplicates** await hard-delete. Those orphan-marked rows span all three shapes; the sweep mutator that should hard-delete them does NOT exist yet.

> **VERIFY NOTE:** baseline-shape proportions are not re-probed in this lane (out of scope; no destructive ops). A quick read-only `firestore_query_collection` sample would put concrete numbers on each shape's density today — recommended follow-on, see TANGENTS.

---

## 1. INGEST CHANNELS — anything that produces or mutates a `library_index` / `library/*` / `tracks` row

For each channel: trigger, auth, what gets written, what's omitted, doc.id shape, and any side effects on `songs/`, `library_signals/latest`, or `setlists.fileIds[]` denorm.

### 1.1 `processChartUpload` — the canonical write helper

**File:** `src/lib/library-upload.ts:172-736`.
**Used by:** `/api/library/upload`, MCP `upload_chart`, MCP `import_chart_from_drive`, MCP `save_scraped_chart`, MCP `finalize_chart_upload`, MCP `reconcile_library` (mirror path), MCP `salvage_chart_bytes` (separate path — see §1.16), `drive-sync` cron (`runDriveSyncProd → processor → processChartUpload`).

**doc.id shape:** `const fileId = \`upload-${crypto.randomUUID()}\`` (`library-upload.ts:267`). **EVERY** call mints a new `upload-{uuid}` — never reuses a Drive-id, never reuses a bare UUID.

**Storage path:** `actualStoragePath(fileId, contentType)` = `library/{fileId}` + `.pdf` / `.xml` / `.mp3` / `""` for text/image (`library-upload.ts:161-170, 477`). Originals (MuseScore/HEIC source) go to `originals/{fileId}.{mscz|mscx|heic|heif}` via `uploadToStorage("originals/...", ...)` (`library-upload.ts:291-296, 322-328`).

**library_index fields written** (one `batch.set(... { merge: false applied via .set })` at `library-upload.ts:588`):
```ts
const indexEntry: Record<string, unknown> = {
    name: title,                                   // normalized via normalizeChartTitle
    nameLower,                                     // .toLowerCase()
    normalizedName,                                // .replace(/[^a-z0-9]/g, "")
    stem,                                          // W-02 trust-calibration
    titleSpecificity: titleSpecificity(title, siblingsInCatalog),
    bondCorrectionHistory: { correctedTo: 0, correctedAwayFrom: 0 },
    enrichmentStatus: "pending",                   // NEW-3 (A3); default-deny posture
    originalName: fileName,
    mimeType: contentType,                         // ALWAYS WRITTEN
    fileSize: buffer.byteLength,                   // ALWAYS WRITTEN
    source: input.source ?? "upload",              // 'upload' | 'drive-sync'
    uploadedBy: input.uploaderUid,
    uploadedByEmail: input.uploaderEmail || "unknown",
    uploadedAt: new Date().toISOString(),
    modifiedTime: new Date().toISOString(),
    collection,                                    // 'core' | 'supplemental' | 'uploads'
    storageUrl,                                    // realStoragePath (C9I3-004 — equals where bytes really live)
    status: "active",
}
// Conditional:
if (input.key) indexEntry.key = input.key
if (input.bpm) indexEntry.bpm = input.bpm
if (input.tags?.length) indexEntry.tags = input.tags
if (originalStorageUrl) indexEntry.originalStorageUrl = originalStorageUrl
if (sourceFormat) indexEntry.sourceFormat = sourceFormat
if (input.driveMetadata) {
    indexEntry.driveFileId = ...        // Drive provenance
    indexEntry.driveModifiedTime = ...
    indexEntry.driveMd5 = ...
    indexEntry.driveParents = ...
}
```

**library_index fields OMITTED in this path:** `leadMusician` (only `applySongMetadata` writes that field; see §1.17), `driveFileId`/`driveModifiedTime`/`driveMd5`/`driveParents` (only when `driveMetadata` is supplied — direct uploads do NOT have these), `backupDriveId` (only `runStorageBackupProd` writes that), `lastSyncedAt` (a `syncLibraryIndex`-only field; see §1.6), `storageCopiedAt`/`storageFailed`/`storageError` (also `syncLibraryIndex`-only), `chartHealth.status` (does not exist as a stored field — only computed live by `getChartHealth`).

**songs fields written (same batch):**
```ts
batch.set(db.collection("songs").doc(fileId), {
    title,
    normalizedTitle: title.toLowerCase(),
    status: "active",
    updatedAt: Date.now(),
}, { merge: true })
```
No `defaults.{key,bpm,lead}` here — those come from `applySongMetadata` post-step (see §1.17).

**Atomic-guard contract** (`library-upload.ts:458-664`):
1. Storage write (`uploadToStorage(fileId, buffer, contentType)`)
2. Read-verify (`getStorageObjectSize(realStoragePath)`) — refuse Firestore write if missing or size mismatch
3. Sibling-recount + Firestore batch commit (library_index + songs + sibling-titleSpecificity updates)
4. On Firestore failure → compensating delete via `safelyDeleteLibraryObject(fileId, {force: true, reason: "upload-compensation:firestore-batch-failed", exactPath: realStoragePath})` + originals rollback if present (C9I3-005)
5. `library_signals/latest` set (best-effort, never fails the upload)
6. `emitLibraryRowCreated(event)` for AI-enrichment subscriber

**Cycle-blindness check:** `processChartUpload` is the OWNER of the `upload-` shape. It does NOT care about Drive-id or bare-UUID rows; it only ever writes its own `upload-{uuid}`. SAFE.

---

### 1.2 `POST /api/library/upload` — in-app UploadDialog

**File:** `src/app/api/library/upload/route.ts`.
**Auth:** `createApiHandler({ role: "uploader" })`. Rate-limit: upload tier (100/min).
**doc.id shape:** `upload-{uuid}` (delegates to `processChartUpload`).
**Writes:** see §1.1 (processChartUpload).
**Side effects:** `revalidatePath` for library pages.

---

### 1.3 `PATCH /api/library/rename`

**File:** `src/app/api/library/rename/route.ts`.
**Auth:** `createApiHandler({ role: "band_leader" })`. Rate-limit: api tier.
**doc.id shape:** any (consumer of the row — accepts whatever id the caller supplies).
**library_index update:**
```ts
await docRef.update({
    displayName: displayName.trim(),
    modifiedTime: new Date().toISOString(),
})
```
**songs update (Promise.allSettled — non-blocking):**
```ts
await songsRef.update({ title, normalizedTitle, updatedAt: Date.now() })
```
**NOT touched:** `name`, `nameLower`, `normalizedName`, `stem`, `titleSpecificity`. (G-5 alphanumeric query-field stays stale unless processChartUpload reruns.) **★ FINDING-7.**

---

### 1.4 `PATCH /api/library/archive`

**File:** `src/app/api/library/archive/route.ts`.
**Auth:** `band_leader`.
**doc.id shape:** any.
**library_index update:**
```ts
await docRef.update({
    status: isArchiving ? "archived" : "active",
    archivedBy: isArchiving ? uid : FieldValue.delete(),
    archivedAt: isArchiving ? new Date().toISOString() : FieldValue.delete(),
})
```
**songs update:** mirrors `status`.

---

### 1.5 `POST /api/library/detect-key` + `*/chord-cache` PATCH

Both `band_leader+`. `detect-key` writes `{ nativeKey, nativeKeySource }` via merge. `chord-cache` PATCH writes `{ nativeKey, chordsVerified, ... }` to library_index doc; POST writes to subcollection `library_index/{fileId}/chordData/page_{n}`. No Storage writes.

---

### 1.6 `POST /api/library/sync` — admin-triggered Drive→library_index full sync (DIFFERENT from `/api/cron/drive-sync`)

**File:** `src/app/api/library/sync/route.ts` (still exists at HEAD; admin-only; rate-limit `sync` tier 3/min). Delegates to `syncLibraryIndex()` at `src/lib/sync-engine.ts:69-401`.

**★ THIS IS A SHAPE-DIVERGENT INGEST CHANNEL.**

doc.id assignment at `sync-engine.ts:248`:
```ts
const docRef = db.collection("library_index").doc(file.id)  // file.id == raw Drive id
batch.set(docRef, {
    id: file.id,
    name: cleanName,
    nameLower: cleanName.toLowerCase(),
    mimeType: file.mimeType,
    modifiedTime: file.modifiedTime || null,
    webViewLink: file.webViewLink || null,
    parents: file.parents || [],
    fileSize,
    ...(file.shortcutDetails?.targetId ? { shortcutTargetId: ... } : {}),
    lastSyncedAt: now,
    source: "google_drive",
}, { merge: true })
```

**doc.id shape:** RAW Drive id (`1AZum...`). Not `upload-{uuid}`. Not `driveFileId` stored as a separate field — the doc.id IS the Drive id.

**Fields written:** `id` (= Drive id, duplicated), `name`, `nameLower`, `mimeType`, `modifiedTime`, `webViewLink`, `parents`, `fileSize`, `shortcutTargetId?`, `lastSyncedAt`, `source: "google_drive"`. **OMITS:** `normalizedName` (the G-5 alphanumeric dedup field — these legacy rows are dedup-invisible), `stem` / `titleSpecificity` / `bondCorrectionHistory` (W-02 fields), `enrichmentStatus`, `originalName`, `uploadedBy`/`uploadedByEmail`/`uploadedAt`, `collection` (so the picker can't filter them by core/supplemental/uploads), `storageUrl` (relies on `storageCopiedAt`/`storageFailed` flags for byte presence).

**Side effects:** Phase B copies bytes to Storage via `uploadToStorage(file.id, buffer, storageMime)` → path `library/{file.id}.{ext}`. Writes `{ storageCopiedAt, storageFailed: null, storageError: null }` back on success; `{ storageFailed: true, storageError: msg }` on failure.

**Songs mirror (added v60-11-01 at `sync-engine.ts:268`):**
```ts
songsBatch.set(songsRef, buildSongsMirrorPayload(file.id, rawName, existingDocs.has(file.id)), { merge: true })
// payload: { id, title, normalizedTitle, fileId, createdAt? } — NO status field, NO defaults.
```

**Concurrency guard:** rejects if another sync is `status: "running"` within last 10 min (`sync-engine.ts:92-101`).
**0-files-found guard:** throws if Drive returns empty (prevents accidental wipe; `sync-engine.ts:129-131`).
**Sweep-delete:** **NONE.** The legacy "if doc.id ∉ Drive set → delete" block was removed in commit `a41f9aef8` (`cron-sync-hard-remove`, 2026-05-24T00:23Z). This route now only *adds* and *updates*. SAFE post-disarm.

**Channel-blindness analysis:** This route, by minting Drive-id-shaped doc.ids, is the SOURCE of the cron-sync × upload-shape mismatch class. The cron-sync (`/api/cron/sync`) USED to sweep-delete the inverse (anything that wasn't a Drive id). The route itself is the producer of the legacy shape; downstream mutators that filter by shape (lane-c2, markorphan-b006, etc.) inherit the blast radius from this divergent ingest.

---

### 1.7 `POST /api/setlists/import/execute`

**File:** `src/app/api/setlists/import/execute/route.ts`. Auth: `band_leader`.
**doc.id shape:** `upload-{uuid}` (mints fresh per imported chart). Quoted from agent report:
```ts
const newLibraryId = `upload-${crypto.randomUUID()}`
const indexEntry = {
    name: finalTitle, originalName: `${finalTitle}.pdf`,
    mimeType: 'application/pdf', fileSize: buffer.length,
    source: 'upload', uploadedBy: ctx.auth.uid, uploadedByEmail: ...,
    uploadedAt, modifiedTime,
    storageUrl: `library/${newLibraryId}.pdf`,
    status: 'active',
}
await db.collection('library_index').doc(newLibraryId).set(indexEntry)
await uploadToStorage(newLibraryId, buffer, 'application/pdf')
```

**★ NOTE:** This route bypasses `processChartUpload` and writes library_index directly — it OMITS `nameLower`, `normalizedName`, `stem`, `titleSpecificity`, `bondCorrectionHistory`, `enrichmentStatus`, `collection`, plus the atomic-guard read-verify. **★ FINDING-3.**

**tracks creation:** via `createSetlistServerSide(...)` with full payload incl. `fileId`, `fileName`, `type`, `title`, `key`, `leadMusician`. Does NOT stamp `mimeType` on the track — that asymmetry is the `[[project_track_mimetype_gotcha]]` class.

---

### 1.8 `POST /api/setlists/import/commit-document`

Like execute, but pre-resolved shape. Calls `commitDocumentSetlist → createSetlistServerSide`. Does NOT create new library_index rows on this path (resolved tracks reference existing library matches). Auth: `band_leader`.

---

### 1.9 `POST /api/admin/library-review/*` — accept / reject / edit / dismiss / retry / queue

All admin-only. Read agent report §§19-24. Notable: `editEnrichment` (`edit/route.ts`) writes arbitrary payload via `await docRef.update(edits)` — set of allowed fields includes `title, collection, key, bpm, leadMusician, tags`. Allows operator override of `collection`. `humanRenamedAt` set if title changes — but `nameLower`/`normalizedName`/`stem`/`titleSpecificity` are NOT recomputed by the edit path. **★ FINDING-7 (same class as rename).**

---

### 1.10 MCP `upload_chart` (`src/lib/mcp/tools/library-upload.ts`)

Wraps `processChartUpload` (§1.1) for the MCP bearer-token surface. doc.id shape `upload-{uuid}`. `isUploadAllowed` gate; curated requires `isTrustedLeader`.

---

### 1.11 MCP `import_chart_from_drive`

Same wrap: fetches Drive bytes by Drive id, then runs `processChartUpload` with `driveMetadata`. doc.id shape `upload-{uuid}` — **NOT** the Drive id. The Drive id is preserved in `library_index.driveFileId` (`library-upload.ts:573`). `dryRun` mode reports dedup + AI plan without writing.

---

### 1.12 MCP `save_scraped_chart`

Writes scraped text content as `text/plain` blob via `processChartUpload` → `library/{fileId}.txt` (no extension actually — `actualStoragePath` returns `""` for text — see G-5 storageUrl alignment). Then calls `applySongMetadata` (§1.17) so scraped key/bpm/lead is mirrored. doc.id shape `upload-{uuid}`.

---

### 1.13 MCP `request_chart_upload_url` + `finalize_chart_upload` (chunked upload)

`request_chart_upload_url`: creates `upload_sessions/{sessionId}` doc + returns v4 signed PUT URL → staged Storage path `upload-sessions/{sessionId}/raw`. No `library_index` write yet.
`finalize_chart_upload`: fetches staged bytes → `processChartUpload(...)` writes `library/{newFileId}` + library_index + songs → deletes staged file. doc.id shape `upload-{uuid}`. Heal mode (admin-only, `targetFileId`) bypasses processChartUpload and calls `healChartBytes(targetFileId, ...)` instead — REUSES the existing doc.id (no new mint).

---

### 1.14 MCP `delete_chart`

**Bond-guarded** (per `safelyDeleteLibraryObject` chokepoint, `src/lib/library/safely-delete-library-object.ts` — recent ship `1af0b568e`). `delete_chart` refuses if any LIVE track (track exists AND parent setlist exists) binds the fileId — orphan tracks don't block. Curated deletion requires admin; uncurated allows uploader-self-deletion. On allowed delete: `safelyDeleteLibraryObject(fileId, ...)` removes `library/{fileId}.*` and `originals/{fileId}.*` plus the library_index + songs docs via batch delete.

---

### 1.15 MCP `reconcile_library` (`src/lib/mcp/tools/reconcile-library.ts`)

Bootstrap mutator. Admin-only. dryRun default; force required for writes. Per-row decision tree (`reconcile-library.ts` — quoted via agent §10):
- Storage 200 → already healthy
- Storage 404 + Drive 200 → mirror via atomic-guard (downloads bytes, writes `library/{fileId}.{ext}`, merges `{mimeType, fileSize, source: "drive-sync", status: "active", reconciledAt, driveFileId}` to library_index)
- Storage 404 + Drive 404 → `batch.update({status: "orphaned"})` + `batch.set(songs/{fid}, {status:"orphaned"}, {merge:true})`
- Drive 5xx/timeout → transient (leave untouched)
- Drive shortcut → auto-resolve in place; unresolvable → needsRebond bucket

**Shape-handling:** operates on existing library_index doc.ids whatever shape they are; doesn't filter by shape. The Storage path it probes is always `library/{doc.id}.{ext}` — works for all three shapes since `uploadToStorage` keys on doc.id directly. SAFE.

---

### 1.16 MCP `salvage_chart_bytes`

Admin-only; resurrects orphaned rows WITHOUT minting a new fileId. Source resolution: `sourceUrl` (https only, mime-validated) OR `driveFileId` from the row → fetch bytes → atomic-guard write at the EXISTING `library/{fileId}.{ext}` path → merge `{mimeType, fileSize, source: "salvage", status: "active", salvagedAt}` + recomputes `normalizedName/stem/titleSpecificity` + resets `enrichmentStatus: "pending"`. PRESERVES `key/bpm/tags/leadMusician/composer/arranger/bondCorrectionHistory` via merge. dryRun default. **Critical:** does NOT mint a new doc.id, so bonds (`tracks.fileId == doc.id`) keep working.

---

### 1.17 MCP `update_song` + `applySongMetadata` (`src/lib/mcp/tools/song-metadata.ts`)

**Dual-write helper** for the catalog-metadata cross-surface (`song-metadata.ts:73-152`). Reads BOTH `songs/{id}` and `library_index/{id}`; writes ONLY the docs that already exist (never creates a phantom row). Writes:
```ts
// songs/{id} (dotted-field paths preserve sibling defaults):
{ updatedAt, "defaults.key"?, "defaults.bpm"?, "defaults.lead"? }
// library_index/{id}:
{ key?, bpm?, leadMusician? }
```
Field-name asymmetry: `songs.defaults.lead` vs `library_index.leadMusician` — both written together. NOTE: `processChartUpload` writes neither field — `applySongMetadata` is the ONLY writer of `songs.defaults.{key,bpm,lead}` and `library_index.leadMusician`. **★ FINDING-5.**

**Broadcast:** writes `library_signals/latest` after a successful non-dryRun apply.

---

### 1.18 MCP `edit_library_entry` (alias of `edit_enrichment`)

Updates `library_index/{id}` with operator-supplied fields; calls `applySongMetadata` for the key/bpm/lead subset. Same dual-write protocol. Admin-only.

---

### 1.19 MCP `add_track_to_setlist` / `update_track` / `swap_chart` (bind paths)

These are tracks-side mutators. Important for ingest-mutator audit because per memory `[[project_track_mimetype_gotcha]]` (verified against current code):
- MCP bind paths since 2026-05-20 read `library_index/{fileId}.mimeType` and stamp it onto the track row at bind time.
- In-app SetlistGrid `handleBindChart` does the same.
- LEGACY rows bound before this fix carry NO `mimeType` on the track → `queue-utils.toQueueItem` defaults to PDF viewer → wrong dispatch.

`backfill_track_mimetype` (MCP, §1.20 below) is the heal.

---

### 1.20 MCP `backfill_track_mimetype` (`src/lib/mcp/tools/backfill-track-mimetype.ts`)

Trusted-leader gated via `assertEditor`. dryRun default; force required for writes. Scans EVERY `tracks` doc; filters in-memory for `fileId present && mimeType missing`; reads `library_index/{fileId}.mimeType` via `db.getAll(...)`; batch-updates tracks with the catalog-derived mimeType. Reports rows where library_index doc doesn't exist (`library_entry_not_found`) or has no mimeType (`library_entry_no_mimetype`) — `lastSyncedAt`-only legacy rows from `syncLibraryIndex` have `mimeType` populated (from `file.mimeType`), so SAFE there; but pre-W-02 rows might fail this. Also: ignores `audioFileId` track-side path (only `fileId`). **★ FINDING-6.**

---

### 1.21 MCP `setlist-write` + `propose_changes` + `clone_setlist` + `templates`

Tracks creation/mutation. Per master-tip 8ddcca1c5 (`stale-setlist-fileids-rebuild` — coder-2 2026-05-24): canonical denorm shape in `propose-changes.ts:513-518`, `clone-setlist.ts:283-289`, `templates.ts:807-813` is:
```ts
new Set<string>(tracks.map(t => t.fileId).filter(id => typeof id === "string" && id.length > 0))
// → setlists.fileIds[]
```
NO type filter, NO `audioFileId` inclusion. Writes to `setlists/{id}.fileIds[]` as a denormalized cache. This denorm was just rebuilt clean for all 43 setlists 2026-05-24.

---

### 1.22 Other read-only API routes

`/api/library/list`, `/api/library/usage`, `/api/library/search-content`, `/api/library/file/[id]`, `/api/drive/file/[fileId]`, `/api/drive/metadata`, `/api/drive/health`, `/api/setlists/import/parse`, `/api/setlists/import/resolve`, `/api/admin/library-review/queue` — all READ-ONLY against library_index. Do not mutate; not in the matrix below.

---

## 2. BACKGROUND MUTATORS — anything that reads + decides + writes/deletes on a schedule or operator command

### 2.1 `/api/cron/drive-sync` (every 5 min, most frequent)

**File:** `src/app/api/cron/drive-sync/route.ts` → `runDriveSyncProd(db, parentFolderId)` at `src/lib/drive-sync/poller.ts:785-799` → `runDriveSync({deps:{drive, db, processor: processChartUpload, now}, parentFolderId})`.

**Auth:** CRON_SECRET bearer. Synthetic uid `cron:drive-sync`.

**Inputs:** `driveWatchState/{parentFolderId}` for the lastPollAt cursor; `David's drop folder + its direct subfolders` for the file query (mime != folder, modifiedTime > lastPollAt). First-tick guard: lastPollAt initialized to `now()` so historical backlog does NOT mass-import (`poller.ts:127, 612-624`).

**Per-file decision (`poller.ts:677-759`):**
```ts
// loop-avoidance:
if (file.appProperties?.crcBackup) { result.skipped++; continue }

const existing = await findRowByDriveFileId(deps.db, file.id)
// keys on library_index.driveFileId (NOT doc.id) — works for upload-{uuid} rows
// whose driveMetadata was stamped on import.

if (!existing) {
    // NEW: fetch bytes → processChartUpload(input) with source:"drive-sync"
    //      doc.id minted as `upload-${uuid}`; driveFileId stored as a field
} else {
    // existing → handleExistingFile:
    //   if (md5Advanced) REPLACE — rewrites Storage bytes + library_index.{fileSize, modifiedTime, driveMd5?, driveModifiedTime?, name?, ...}
    //   if (parentsChanged && collectionChanged) MOVE — collection update
    //   if (nameChanged && !md5Advanced) RENAME — name/nameLower/normalizedName/originalName update
    //   else SKIP
}
```

**No delete path.** Comment at `poller.ts:28`: `delete in Drive → NO propagation (Storage canonical)`. Loop-avoidance via `appProperties.crcBackup`. SAFE.

**Channel-blindness:** the importer only ever produces `upload-{uuid}` rows (via processChartUpload); the `handleExistingFile` REPLACE path keys on `existing.docId` (which CAN be any shape since the row could have been written by syncLibraryIndex with a Drive-id doc.id — but the existence query is on `driveFileId == file.id` so it only matches rows that have already stamped the Drive id; Drive-id-shaped rows from syncLibraryIndex have `id == file.id` BUT `driveFileId` is NOT set as a separate field by syncLibraryIndex). **★ FINDING-1: a Drive-id-shaped library_index row (from /api/library/sync) and a `upload-{uuid}` row (from drive-sync cron or in-app upload) representing the SAME Drive file would coexist with no dedup; nothing detects this duplicate at write time.**

---

### 2.2 `/api/cron/enrich` (daily 2am)

**File:** `src/app/api/cron/enrich/route.ts`.
**Auth:** CRON_SECRET.
**Inputs:** `library_index.where("metadata.enrichedAt", "==", null).limit(20)`.
**Per-row decision (agent quote):**
```ts
if (data.mimeType?.includes("folder") || data.mimeType?.startsWith("audio/")) { skip }
if (failCount >= 3) { skip }
```
**Writes:** on success `{ failCount:0, lastFailure:null }`; on failure `{ failCount: failCount+1, lastFailure, lastError }` merge-write.
**Shape-blindness:** none. Tests only mimeType + failCount. Doesn't care about doc.id shape. SAFE.

**★ NOTE:** this is the LEGACY enrich cron (operates on `metadata.enrichedAt` field). The CURRENT modern enrichment subscriber is `enrichLibraryRow` in `src/lib/library/ai-enrichment.ts`, fired by the in-process `library.row.created` event from processChartUpload. The two paths may both be live — verify TANGENT below.

---

### 2.3 `/api/cron/ai-enrich-retry` (every 30 min)

**File:** `src/app/api/cron/ai-enrich-retry/route.ts` → `processAiEnrichmentRetryQueue(deps)` at `src/lib/library/ai-enrichment.ts:429-471`.

**Inputs:** `aiEnrichmentRetryQueue.where("nextRetryAt", "<=", now.toISOString()).limit(25)`.

**Per-row decision (`ai-enrichment.ts:447-468`):**
```ts
if (!data.event) {
    // Pre-rehydration row (or hand-seeded). Skip — we can't replay
    // without the original event payload.
    skipped++; continue
}
try {
    await enrichLibraryRow(data.event, deps)
    retried++
} catch (err) {
    failed++
    logger.error(...)
}
```

**Writes:** delegated via `enrichLibraryRow(event, deps)` → `applyEnrichment` (updates library_index enrichment fields) → `clearRetry(db, event.rowId)` on success or `queueRetry(...)` on failure (bumps `attempts`, sets next `nextRetryAt` via exponential backoff).

**Shape-blindness:** none. Operates on the queue row's `event.fileId`/`event.rowId` directly. SAFE.

**Caveat:** the agent's earlier report noted "exponential backoff 5m/30m/2h/6h with 4-attempt ceiling" but the read here shows no explicit ceiling in `processAiEnrichmentRetryQueue` itself — the ceiling is upstream in `queueRetry`. Worth a follow-on inspect; not load-bearing for this lane.

---

### 2.4 `/api/cron/aggregate-corrections` (every 6h)

Idempotent aggregator over `aiCorrectionSignals/*` → singleton `aiCorrectionStats/latest`. No library_index/Storage/tracks mutations. SAFE.

---

### 2.5 `/api/cron/scheduling-reminder` (daily 10am)

Reminders over `scheduling_assignments`. Not chart-domain. SAFE for this audit.

---

### 2.6 `/api/cron/admin-consistency` (daily 4am)

Includes:
- **PGR-03 storage-backup staleness alarm** — reads `config/storageBackup`; if `health.stale || health.recentError` → Sentry warning.
- **PGR-04 library-bytes-health alarm** (recent ship `bc99aaa0b`) — reads `library_index.where("status","==","active").orderBy("lastSyncedAt","desc").limit(DEFAULT_LIBRARY_BYTES_SAMPLE_SIZE)`; for each sampled row probes the Storage object; if missing-fraction exceeds threshold → Sentry warning/error.
- **admin claim drift** — config/admins.uids vs Firebase Auth custom claims.

**Read-only against library_index** (just samples + alarms; no writes). PGR-04 is the alarm specifically designed to catch the next 2026-05-23 incident.

**Shape-blindness:** the `lastSyncedAt`-ordered query naturally surfaces `syncLibraryIndex`-written rows first (since they're the only ones with `lastSyncedAt`). `processChartUpload` writes `uploadedAt`/`modifiedTime` but NOT `lastSyncedAt`, so upload-{uuid} rows may have lastSyncedAt as `undefined`/missing and Firestore's orderBy(...desc) excludes them entirely from the sample. **★ FINDING-2.**

---

### 2.7 `/api/cron/verify-chart-bond-health` (weekly Thu 3pm)

Reads `setlists.where("publishedAt","!=",null)`; for each upcoming/recent setlist runs `verifySetlistCharts(...)`. Computes bonded/ok ratios; if aggregate < 0.8 OR per-setlist (≥3 bonded) < 0.7 → alert in `chart_bond_alerts` + Sentry message. Also repairs denormalized `trackCount` via `recomputeTrackCount`. Read-only against library_index. SAFE.

---

### 2.8 `/api/cron/backup` (daily 3am) + `/api/cron/storage-backup` (daily 5am)

**`backup`** — Firestore Admin export. No library_index writes.

**`storage-backup`** — `runStorageBackupProd(db, backupFolderId, opts)` at `src/lib/storage-backup/mirror.ts:456-477` → `runStorageBackup(deps)` at `mirror.ts:125-329`.

**Decision conditional (`mirror.ts:225-326`):**
```ts
const snap = await deps.db.collection("library_index").where("status","==","active").get()
for (const doc of snap.docs) {
    const fileId = doc.id           // ★ unfiltered by shape — operates on ALL active rows
    const mimeType = (typeof row.mimeType === "string" && row.mimeType) ? row.mimeType : "application/pdf"
    const collection = (typeof row.collection === "string" && row.collection) ? row.collection : "uploads"
    const storage = await deps.getStorageMd5(fileId, mimeType)
    if (!storage || !storage.md5Base64) { skipped++; continue }     // active row with NO Storage bytes — not the backup's job to heal

    const storageHex = md5Base64ToHex(storage.md5Base64)
    const existing = listing.get(fileId)  // listing keyed via fileIdFromBackupName

    if (existing && existing.md5Checksum === storageHex) {
        skipped++
        // Heal pointer if absent:
        if (row.backupDriveId !== existing.id) {
            await db.collection("library_index").doc(fileId).set({ backupDriveId: existing.id }, { merge: true })
        }
        continue
    }
    if (mirrorOps >= cap) { deferred++; continue }
    const bytes = await deps.downloadStoragePath(storage.path)
    if (!bytes) { failed++; continue }

    if (existing) {
        // UPDATE: drive.updateFileMedia(existing.id, bytes.buffer, mimeType)
    } else {
        // CREATE: drive.uploadBinaryFile({name: backupFileName(stem, fileId, mimeType), ..., appProperties: { crcBackup: "1" }})
    }
    await db.collection("library_index").doc(fileId).set({ backupDriveId: ... }, { merge: true })
}
```

**Critical:** writes `library_index.backupDriveId` on every active row that gets mirrored. doc.id shape-agnostic (uses `doc.id` directly). loop-avoidance via `appProperties.crcBackup` stamp + dedicated backup folder. NO DELETE PATH against library_index or Storage. SAFE in the modern shape.

**Subtle shape concern:** the BACKUP filename is `<stem>__<fileId>.<ext>`; `fileIdFromBackupName(name)` matches the last `__`. `upload-{uuid}` has single hyphens, Drive-ids have no `__`, bare UUIDs have no `__` — so all three shapes round-trip correctly. SAFE.

---

### 2.9 Ops scripts — destructive mutators

**`scripts/sweep-orphan-tracks-deleted-setlists.mjs`** — sweeps top-level `tracks` docs whose parent setlist doc no longer exists. Decision (`sweep-orphan-tracks-deleted-setlists.mjs:39-43`):
```js
for (const sid of bySetlist.keys()) {
    const sl = await db.collection("setlists").doc(sid).get()
    if (!sl.exists) dead.push(sid)
}
const dangling = dead.flatMap((sid) => bySetlist.get(sid).map((t) => ({ ...t, setlistId: sid })))
```
Then `batch.delete(db.collection("tracks").doc(t.trackId))` for each dangling track. DOES NOT touch library_index or Storage. Shape-agnostic. SAFE.

**`scripts/lane-c2-purge-dangling-tracks.mjs`** (per parallel-agent §1 above):
```js
const FIDS = [ "upload-037d9094-...", "upload-0792351b-...", ...5 hardcoded upload-uuids... ]
const snap = await db.collection("tracks").where("fileId", "in", FIDS).get()
// → batch.delete each
```
**★ FINDING-9 (P3, historical):** The `where("fileId","in",FIDS)` filter is by definition tied to the hardcoded list — it's a *targeted* sweep, not a general one. The agent's "blind to other shapes" framing overstates risk: this isn't a recurring mutator, it's a one-shot remediation. Documented; not a CRITICAL gap.

**`scripts/markorphan-b006-uuid-charts.ts`** — shape-specific BARE-UUID sweep. Filter `/^[0-9a-f]{8}-[0-9a-f]{4}-...$/`. Mass-marks `status: "orphaned"` on bare-UUID rows whose Storage bytes are confirmed absent. By construction it CANNOT mark `upload-{uuid}` or Drive-id orphans — that's intentional (B-006 was a specific incident scoped to bare-UUID rows). Documented; **★ FINDING-8** flagged as a class to be aware of but not active risk.

**`scripts/restore-gcs-versions.mjs`** — recent (4537463cc) successful restore. Works from an EXPLICIT JSON manifest of fileId+path; cannot misfire on other shapes by design (manifest-bounded).

**`scripts/rebuild-setlist-fileids-denorm.mjs`** — recent (8ddcca1c5) rebuild of setlists.fileIds[]. Pure setlists-side; doesn't touch library_index/Storage.

**Other backfills (`backfill-heal-metadata`, `backfill-title-specificity`, `backfill-tracks-v60`, `backfill-w04-version-fields`, `backfill-shortcuts-songs`, `bootstrap-songs`):** all shape-neutral or filter by mime/missing-field rather than doc.id shape. SAFE.

**`scripts/heal-orphans-from-local.ts` / `heal-run-from-plan.ts`:** plan-driven (operator supplies the per-row decision). Shape-neutral when the plan covers the right rows; risk shifts to the plan-author, not the script.

**`scripts/ingest-library.ts`:** legacy bulk-ingest script — out of scope for current cadence (predates processChartUpload).

---

### 2.10 MCP-tool mutators that look like "background mutators" but are operator-triggered

| MCP tool | Class | Shape-aware? | Risk |
|---------|-------|--------------|------|
| `reconcile_library` | bootstrap heal | YES (works on existing doc.id regardless of shape; Storage path = `library/{doc.id}.{ext}`) | LOW |
| `salvage_chart_bytes` | per-fileId heal | yes (reuses caller-supplied fileId) | LOW |
| `dedupe_library_index` | dedup mark-as-duplicate | YES (writes `status:"duplicate"` on losers; uses normalizedName grouping, not doc.id shape) | LOW |
| `backfill_track_mimetype` | track heal | NO (only reads `library_index.mimeType`; ignores doc.id shape; works for all 3) | LOW |
| `delete_chart` | targeted delete | YES (bond-guarded via `safelyDeleteLibraryObject`) | LOW post-1af0b568e |
| `verify_setlist_charts` (`markOrphaned:true`) | per-setlist orphan marking | YES (status:"orphaned" on missing rows; doc.id shape-agnostic) | LOW |

---

## 3. doc.id shape × mutator quick-reference

Used by MATRIX.md. Each ingest writes a doc.id of these shapes; each mutator's behavior on each shape:

| Ingest channel | doc.id shape produced |
|----------------|-----------------------|
| `processChartUpload` (all wrappers — §1.1, §1.2, §1.10–§1.13, drive-sync cron) | `upload-{uuid}` |
| `/api/library/sync` → `syncLibraryIndex` (§1.6, admin-only) | RAW Drive id |
| `/api/setlists/import/execute` (§1.7) | `upload-{uuid}` (mints directly, bypasses helper) |
| Salvage / heal (§1.16, §1.13 heal mode) | preserves caller-supplied (whatever existed) |
| Pre-atomic-guard legacy ingest (no longer runs) | bare UUID |

| Mutator | Touched fields / paths | Aware of all 3 shapes? |
|---------|------------------------|------------------------|
| `/api/cron/drive-sync` | library_index (REPLACE/RENAME/MOVE updates), Storage (REPLACE writes), library_signals | upload-{uuid} only (queries `driveFileId` field which only upload-shape rows have) |
| `/api/cron/enrich` | library_index `{failCount, lastFailure, lastError, metadata.enrichedAt?}` | yes |
| `/api/cron/ai-enrich-retry` | library_index enrichment fields via `applyEnrichment` | yes |
| `/api/cron/admin-consistency` (PGR-04) | NONE (read + Sentry alarm) | ★ **subtle blindness on `lastSyncedAt`-sorted sample (see FINDING-2)** |
| `/api/cron/verify-chart-bond-health` | `chart_bond_alerts`, `setlists.trackCount` repair | yes |
| `/api/cron/storage-backup` | library_index `{backupDriveId}` only | yes |
| `/api/library/sync` (admin) | library_index (raw Drive id-keyed merge-set) | produces the Drive-id shape; doesn't touch upload-{uuid} rows |
| `safelyDeleteLibraryObject` (delete chokepoint) | Storage `library/{fileId}.*` + audit logs | yes (operates on caller-supplied fileId) |
| `lane-c2-purge-dangling-tracks` | tracks (NOT library_index) — hardcoded list | upload-shape only by design (one-shot) |
| `markorphan-b006-uuid-charts` | library_index `{status:"orphaned"}` on bare-UUID rows only | bare UUID only by design (one-shot) |
| `reconcile_library` | library_index + Storage (atomic-guard mirror or orphan-mark) | yes |

---

## 4. Files actually read (audit trail)

For honesty in §FINDINGS confidence ratings.

**Read top-to-bottom:**
- `src/lib/library-upload.ts:1-737` (processChartUpload)
- `src/lib/drive-sync/poller.ts:1-799` (runDriveSync, runDriveSyncProd)
- `src/lib/storage-backup/mirror.ts:1-477` (runStorageBackup, runStorageBackupProd)
- `src/lib/sync-engine.ts:1-401` (syncLibraryIndex)
- `src/lib/mcp/tools/song-metadata.ts:1-267` (applySongMetadata + updateSong)
- `src/lib/library/ai-enrichment.ts:400-700` (processAiEnrichmentRetryQueue + Gemini call; earlier part scanned via grep)
- `src/lib/mcp/tools/backfill-track-mimetype.ts:1-200` (first 200 lines; tail ~100 lines NOT read but covered by signature + agent earlier scan)
- `scripts/sweep-orphan-tracks-deleted-setlists.mjs:1-75`
- `vercel.json` (cron schedule confirmed)

**Read via Explore agent (high-fidelity scan):**
- 25 API routes under `/api/library/*`, `/api/drive/*`, `/api/setlists/import/*`, `/api/admin/library-review/*`, `/api/mcp`
- All 9 cron routes (route-level; helpers extracted directly above)
- 10 MCP tool files (library-upload, library-upload-session, library-download, library-review, library-verify, chart-bond-audit, salvage-chart-bytes, reconcile-library, library.ts, index.ts)
- 13 ops scripts (lane-c2-purge, markorphan-b006, backfill-*, bootstrap-songs)

**NOT exhaustively read (gap acknowledged):**
- Tail of `library.ts` (lines 990-1700 — beyond `dedupeLibraryIndex` definition; less critical for ingest audit)
- `restore-gcs-versions.mjs`, `probe-b006-uuid-charts.mjs`, `probe-f02-shape.mjs`, `heal-eventdate-types.mjs`, `repack-track-order.ts` — known classes (manifest-driven restore; probes are read-only)
- `setlist-write.ts`, `propose-changes.ts`, `clone-setlist.ts`, `templates.ts` MCP tools — the denorm shape (`fileIds[]` build) verified against master-tip 8ddcca1c5 stale-denorm-rebuild ship + memory `[[project_track_mimetype_gotcha]]`; structural behavior known via that ship

These gaps are accepted at this depth; FINDINGS confidence is calibrated accordingly.
