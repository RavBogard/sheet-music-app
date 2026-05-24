# FINDINGS — Risk-ranked ingest × mutator gaps

**Lane:** `ingest-mutator-matrix-research` (Tier-0).
**Baseline SHA:** `54378d7e5` (master tip 2026-05-24T04:20Z).
**Routing:** SHIP-NOTICE → `inbox/supervisor.md` + SHIP-NOTICE-CC → `inbox/auditor.md` (per `msg-ingest-mutator-matrix-routing-addendum-001`). Auditor's `FINDINGS-AUDIT.md` companion is the gate to supervisor planning.
**Read this first.** Each finding has: channel pair, failure mechanism (code-quoted), detection method, fix shape, LOC estimate, suggested follow-on lane.

**Total findings:** 9 (1 HIGH, 5 MEDIUM, 3 LOW; 0 CRITICAL CURRENT — see §0 below).

---

## 0. Honest header — what is and isn't here

The audit found NO CURRENT data-loss bug actively running. The class of bug we're hunting — a sweep mutator silently deleting bytes — is **disarmed in master**:

- `/api/cron/sync` route HARD-REMOVED at `a41f9aef8` (2026-05-24T00:23Z) along with its sweep-delete block in `sync-engine.ts`.
- `safelyDeleteLibraryObject` chokepoint shipped at `1af0b568e` (2026-05-24T02:23Z) — every `library/*` Storage delete now passes a bond-aware guard with audit logging.
- PGR-04 library-bytes-health alarm shipped at `bc99aaa0b` (2026-05-24T02:25Z) — catches a future repeat within ~24h.

What this audit found is the **adjacent structural debt**: write-path divergence and dedup-blindness that produce silent DRIFT (orphans, duplicates, AI-skipped rows) without immediate blast. The HIGH finding (FINDING-1) is a silent-duplication risk at the drive-sync × non-cron-ingest intersection that would NOT have been caught by current alarms.

---

## FINDING-1 — drive-sync cron is blind to non-cron-imported rows of the same Drive file (HIGH)

**Channel pair:** `/api/library/sync` (admin-sync route) × `/api/cron/drive-sync` (5-min cron); ALSO `/api/setlists/import/execute` × `/api/cron/drive-sync`.

**Mechanism:** drive-sync cron's existing-file query is:
```ts
// src/lib/drive-sync/poller.ts:259-267
async function findRowByDriveFileId(db, driveFileId) {
    const snap = await db.collection("library_index")
        .where("driveFileId","==",driveFileId).limit(1).get()
    if (snap.empty) return null
    ...
}
```
This requires `library_index.driveFileId` field to be present. But three ingest paths write rows WITHOUT this field:
- `syncLibraryIndex` (admin /api/library/sync) writes `id: file.id` (Drive id as doc.id) but NOT `driveFileId` as a separate field (`src/lib/sync-engine.ts:248-263`).
- `/api/setlists/import/execute` writes `{ name, originalName, mimeType, fileSize, source:"upload", uploadedBy, ... }` directly via `db.collection("library_index").doc(newLibraryId).set(...)` — no `driveFileId` even when the chart was downloaded from a Drive URL.
- Pre-atomic-guard B-006 rows.

When the same Drive file ID is encountered later by drive-sync cron, `findRowByDriveFileId(...)` returns null → drive-sync's `handleNewFile` runs → `processChartUpload(...)` mints a SECOND `upload-{uuid}` row.

**Dedup partial-rescue:** processChartUpload's exact + fuzzy dedup (`nameLower` exact + `normalizedName` ±Levenshtein 0.85) catches the SLI case if titles are identical post-normalization. For setlist-import-execute rows the dedup catches by title similarity. For LEG rows (B-006) without `nameLower`/`normalizedName`, dedup MISSES. So this is partial protection at best.

**Detection method (read-only Firestore queries):**
```
1. count(library_index.where("driveFileId","==",null OR missing).get())
   → rows that drive-sync cannot recognize
2. for each such row, check whether the row's doc.id is itself a Drive-id-shape
   (alnum ≥ 25 chars, no `upload-` prefix) — if so, drive-sync would mint a shadow
3. cross-reference: any library_index pair (A, B) where A.id is a Drive-id shape
   AND B.id is upload-{uuid} AND A.modifiedTime ~= B.uploadedAt AND nameLower matches
   → live silent-duplicate pair
```

**Fix shape:** at SLI and setlist-import-execute write sites, ALSO write `driveFileId: file.id` as a separate field. Optionally backfill existing rows: a one-shot script that walks library_index and stamps `driveFileId = doc.id` on rows whose doc.id matches the Drive-id pattern AND `driveFileId` is missing.

**LOC estimate:** ~12 lines (3 in sync-engine.ts batch.set spread; 3 in setlists/import/execute indexEntry; one-shot backfill script ~80 LOC; dryRun + apply gates). Tests: ~30 LOC for an emulator test that simulates SLI-writes-then-drive-sync-runs.

**Suggested follow-on lane:** `drive-id-write-symmetry-fix` (Tier 1). Recommended dispatcher single-owner (writes to library_index from two paths + one backfill script). Adds an integration test asserting drive-sync's `findRowByDriveFileId` matches SLI-shape rows.

---

## FINDING-2 — PGR-04 library-bytes-health samples the wrong tail of the catalog (MEDIUM)

**Channel pair:** all 3 doc.id shapes × `/api/cron/admin-consistency` (PGR-04 sub-check, daily 4am).

**Mechanism:** PGR-04 samples `library_index.where("status","==","active").orderBy("lastSyncedAt","desc").limit(DEFAULT_LIBRARY_BYTES_SAMPLE_SIZE)` (per agent §6 of cron audit; `src/lib/library/bytes-health.ts` writes the helper). Firestore's `orderBy(field)` semantics: docs where the field is MISSING are excluded entirely. `lastSyncedAt` is written ONLY by `syncLibraryIndex` (admin /api/library/sync — Drive-id-shape rows). `processChartUpload`-written rows (the modern `upload-{uuid}` majority) do NOT write `lastSyncedAt`. So PGR-04's sample is biased toward the Drive-id-shape historical tail and underweights the upload-shape modern majority.

**Concrete impact:** if a future Storage outage selectively affects upload-shape bytes (e.g. a bucket-prefix issue), PGR-04 may not surface it within its threshold because the sample skips those rows. The PGR-04 alarm was the response to 2026-05-23T14:04Z — but the underlying sample selection might MISS the next incident on the upload-shape majority.

**Detection method:**
```
1. count(library_index.where("status","==","active").get()) — denominator
2. count(library_index.where("status","==","active").where("lastSyncedAt","!=",null).get()) — sampled tail size
3. ratio < 0.5 → PGR-04 is operating on a non-representative slice
```
Quick local probe: `node scripts/...` reading a representative slice.

**Fix shape (one of two):**
- **A (preferred, +2 LOC):** drop the `.orderBy("lastSyncedAt","desc")` clause from PGR-04 sample; use a random-id sample or a `.limit()` from the start of the active set. The PGR-03 staleness alarm already covers the "no syncs at all in N hours" failure mode; PGR-04 should sample broadly.
- **B (~10 LOC):** make every ingest path write a unified `lastAuthoritativeWriteAt` (or `lastIndexedAt`) field. processChartUpload would write it on upload; syncLibraryIndex would write it on sync. Reorder by THAT field.

**LOC estimate:** A = 2 lines; B = ~10 lines spread across 3 ingest sites + a backfill. Tests: extend `src/lib/library/__tests__/bytes-health.test.ts` to assert representative sampling.

**Suggested follow-on lane:** `pgr-04-sample-fix` (Tier 1, +5 LOC + 1 test). Recommended Option A.

---

## FINDING-3 — `/api/setlists/import/execute` bypasses processChartUpload, producing degenerate library_index rows (MEDIUM)

**Channel pair:** `/api/setlists/import/execute` × multiple downstream consumers (drive-sync cron, AI enrichment, dedup, search).

**Mechanism:** `src/app/api/setlists/import/execute/route.ts` (per agent route §16) writes library_index directly:
```ts
const newLibraryId = `upload-${crypto.randomUUID()}`
const indexEntry = {
    name: finalTitle,
    originalName: `${finalTitle}.pdf`,
    mimeType: 'application/pdf',
    fileSize: buffer.length,
    source: 'upload',
    uploadedBy: ctx.auth.uid,
    uploadedByEmail: ctx.auth.email || 'unknown',
    uploadedAt: new Date().toISOString(),
    modifiedTime: new Date().toISOString(),
    storageUrl: `library/${newLibraryId}.pdf`,
    status: 'active',
}
await db.collection('library_index').doc(newLibraryId).set(indexEntry)
await uploadToStorage(newLibraryId, buffer, 'application/pdf')
```

Fields OMITTED (vs processChartUpload's canonical schema, `src/lib/library-upload.ts:540-583`): `nameLower`, `normalizedName`, `stem`, `titleSpecificity`, `bondCorrectionHistory`, `enrichmentStatus`, `collection`.

**Consequences:**
- AI enrichment subscriber NEVER fires (no `emitLibraryRowCreated` call).
- dedup (both exact `nameLower` and fuzzy `normalizedName` prefix range) cannot see these rows → duplicates possible.
- search ranking ignores `titleSpecificity` defaults to 0 → these rows sink below well-formed siblings.
- `collection` defaults to "uploads" downstream but the picker/list_library can't filter them by core/supplemental/uploads.
- No atomic-guard read-verify on Storage write — if `uploadToStorage` silently drops bytes, the row stays `status:"active"` with no bytes (the exact 2026-05-23 failure mode for the wrong reason).

**Detection method:**
```
1. library_index.where("source","==","upload").where("nameLower","==",null).get() → count
   (any rows with source=upload but no nameLower → suspect setlist-import origin)
2. cross-reference uploadedBy != cron uid AND uploadedAt within last 30d
3. for each, check storageUrl exists at the Storage path; check for sibling tracks
```

**Fix shape:** rewrite the setlist-import-execute path to call `processChartUpload(...)` per chart instead of writing library_index directly. The chart Drive URL → buffer fetch is inline; pass the buffer + mimeType to processChartUpload with `source: "upload"` (or a new `source: "setlist-import"` if telemetry distinction matters). This gets atomic-guard, dedup, AI subscription, and canonical schema for free.

**LOC estimate:** ~30 LOC delta in setlist-import-execute (replace direct write block with processChartUpload call; handle the duplicate_exact/similar error code shape; preserve the setlist-creation flow when an import row dedups against an existing chart). Tests: ~40 LOC adding scenarios for "import dedupes against existing library row" and "import calls processChartUpload atomic-guard".

**Suggested follow-on lane:** `setlist-import-execute-via-pcu` (Tier 1).

---

## FINDING-4 — dedup is blind to library_index rows missing `normalizedName` (MEDIUM)

**Channel pair:** SLI (admin sync) + IMP (setlist-import-execute) + LEG (B-006 legacy) × MCP `dedupe_library_index` + processChartUpload's own dedup.

**Mechanism:** dedup logic in `processChartUpload` (`library-upload.ts:392-456`):
```ts
const normalizedName = nameLower.replace(/[^a-z0-9]/g, "")
...
const similarSnap = await db.collection("library_index")
    .where("normalizedName", ">=", prefix)
    .where("normalizedName", "<", prefixEnd)
    ...
```
SLI/IMP/LEG rows have NO `normalizedName` field → range query MISSES them. The exact match earlier uses `nameLower` (which SLI writes but IMP/LEG don't), so SLI gets exact-dedup-protection only.

`MCP dedupe_library_index` (agent §2 library.ts) groups by `nameLower`/`normalizedName` — same blind spot.

**Detection method:**
```
1. count(library_index.where("normalizedName","==",null OR missing).where("status","==","active").get())
2. for each such row, find PCU rows with overlapping titles → silent duplicates
```

**Fix shape:** one-shot backfill script — for every active library_index row, compute `normalizedName = name.toLowerCase().replace(/[^a-z0-9]/g,"")` and merge-write it. Then re-run dedupe to catch the previously-invisible collisions.

**LOC estimate:** ~60 LOC script (mirrors `rebuild-setlist-fileids-denorm.mjs` shape — dryRun + apply + redry). The fix to PREVENT future ingest from skipping the field is FINDING-3 (route setlist-import-execute through processChartUpload).

**Suggested follow-on lane:** `library-index-normalizedname-backfill` (Tier-0 ops, dryRun-first per `[[feedback_single_owner_destructive_runs]]`).

---

## FINDING-5 — `processChartUpload` does NOT write `songs.defaults.{key,bpm,lead}`, but `applySongMetadata` is the only writer; new charts have no defaults until a follow-up edit (MEDIUM)

**Channel pair:** `processChartUpload` × `applySongMetadata` × bond-resolution.

**Mechanism:** `processChartUpload` writes `library_index.{key,bpm}` (when supplied) and `songs/{fileId}.{title,normalizedTitle,status,updatedAt}` — but NOT `songs/{fileId}.defaults.{key,bpm,lead}`. The `applySongMetadata` helper at `src/lib/mcp/tools/song-metadata.ts:73-152` (the dual-write helper) is the ONLY path that writes `songs.defaults.*`. Tooltip in its docstring (lines 28-33):
> "`processChartUpload` only writes key/bpm to `library_index` (not songs.defaults), so neither tool here can rely on the upload pipeline to keep the two coherent. `applySongMetadata` writes BOTH in one batch..."

But: `applySongMetadata` is only called by `update_song`, `edit_library_entry`, `save_scraped_chart` (post-upload step), and `edit_enrichment`. Plain `upload_chart` / drive-sync cron / setlist-import-execute do NOT call `applySongMetadata` → newly-uploaded charts have `library_index.key/bpm` populated (when supplied) but `songs.defaults.key/bpm/lead = undefined`. The bond-resolution path (`resolveTrackBondDefaults → getSongById`) reads `songs.defaults.*` first → gets undefined → falls back to `library_index.*` (sometimes).

This is the bug `[[feedback_dryrun_is_observability]]`-adjacent class — silent drift in the dual-read surfaces. Memory says it's already been called out (`[[project_catalog_dual_read_surfaces]]` — quoted: "edits must hit BOTH (use applySongMetadata)") but the UPLOAD path itself doesn't.

**Detection method:**
```
1. count(library_index.where("key","!=",null).get()) — rows with library-side key
2. cross-reference: for each fileId, check whether songs/{fileId}.defaults.key is set
3. divergence count → these rows resolve key from one surface but not the other
```

**Fix shape:** at the end of `processChartUpload`, when input.key/bpm/leadMusician is supplied (after the batch.commit), call `applySongMetadata(db, fileId, { key, bpm, leadMusician })` to mirror to songs.defaults. Note: processChartUpload is called from drive-sync cron with synthetic uid `"cron:drive-sync"` — the call needs to be reachable from server context, which `applySongMetadata` already is. There's no auth concern (no rate limit on this internal call).

**LOC estimate:** ~8 LOC in processChartUpload (post-batch call); ~15 LOC test.

**Suggested follow-on lane:** `processChartUpload-dual-write` (Tier 1, +10 LOC + 1 test).

---

## FINDING-6 — `backfill_track_mimetype` ignores `audioFileId` track-side field; audio bonds via that path stay un-healed (MEDIUM)

**Channel pair:** legacy audio-bond tracks × MCP `backfill_track_mimetype`.

**Mechanism:** `src/lib/mcp/tools/backfill-track-mimetype.ts:151-169`:
```ts
for (const d of snap.docs) {
    const data = d.data()
    const fileId = typeof data.fileId === "string" ? data.fileId.trim() : ""
    if (!fileId) continue // unbonded row — no chart to route; skip
    bondedTracks++
    const mime = typeof data.mimeType === "string" ? data.mimeType.trim() : ""
    if (mime) { alreadyHealthy++; continue }
    candidates.push({ trackId, setlistId, title, fileId })
}
```
Reads `data.fileId` only. Doesn't check `data.audioFileId`. Per the recent audio-viewer-f7 ship (`912ea2c3d` 2026-05-24T03:25Z), audio tracks may carry `audioFileId` instead of (or alongside) `fileId`. Backfill scope is misaligned with the audio-bond shape.

**Subtle:** the audio-viewer-f7 dispatch reads `libMimeType?.startsWith("audio/")` from `library_index/{fileId}`. If audio tracks carry `audioFileId` with empty `fileId`, backfill skips them (unbonded). If they carry both, backfill heals from `library_index/{fileId}.mimeType` which is the chart bond's mime, not the audio mime.

**Detection method:**
```
1. count(tracks.where("audioFileId","!=",null).get()) — audio-bonded tracks
2. for each, check mimeType field — if missing AND audioFileId is set → not heal-eligible by current backfill
```

**Fix shape:** extend backfill_track_mimetype to consider `audioFileId` too. When `audioFileId` is present and `mimeType` is missing, read `library_index/{audioFileId}.mimeType` and stamp.

**LOC estimate:** ~10 LOC in backfill-track-mimetype.ts; ~10 LOC test.

**Suggested follow-on lane:** `backfill-track-mimetype-audiofileid` (Tier 1, +20 LOC including test).

---

## FINDING-7 — rename + admin enrichment edit leave the G-5 query fields stale (MEDIUM)

**Channel pair:** `/api/library/rename` PATCH + `/api/admin/library-review/edit` × dedup + search-ranking + drive-sync RENAME branch.

**Mechanism:**
- `/api/library/rename` updates `{displayName, modifiedTime}` only. Does NOT touch `name`, `nameLower`, `normalizedName`, `stem`, `titleSpecificity`.
- `editEnrichment` (admin) writes the operator-supplied edits patch directly via `await docRef.update(edits)`. If `edits.title` changes, sets `humanRenamedAt` but does NOT recompute `nameLower`/`normalizedName`/`stem`/`titleSpecificity`. Documented in agent §22.

**Consequence:** post-rename or post-edit, the row's dedup-visible name is the OLD `nameLower`/`normalizedName`. dedup won't catch a fuzzy collision against the new title. Search-side specificity is stale. drive-sync's RENAME detection in `handleExistingFile` tests `driveName !== row.originalName && newTitle !== rowName` — `rowName` is the unchanged old `name`, so a Drive rename to match the user's `displayName` would be perceived as a fresh rename (loop).

**Detection method:**
```
1. library_index.where("displayName","!=",null).get() → renamed rows
2. for each, compare nameLower !== displayName.toLowerCase() → stale
```

**Fix shape:** at both edit sites, recompute the W-02 trust-calibration fields (`name`, `nameLower`, `normalizedName`, `stem`, `titleSpecificity`) when title-affecting fields change. Mirror processChartUpload's recompute path (extract into a small `recomputeIndexNameFields(title)` helper for reuse).

**LOC estimate:** ~20 LOC helper + ~10 LOC each at rename and editEnrichment + ~30 LOC tests.

**Suggested follow-on lane:** `rename-edit-recompute-w02-fields` (Tier 1, ~60 LOC).

---

## FINDING-8 — `markorphan-b006-uuid-charts.ts` is bare-UUID-shape-specific BY DESIGN; the dual `upload-{uuid}`-shape orphan-mark path does NOT exist (LOW)

**Channel pair:** LEG ingest × historical orphan-marking sweeps.

**Mechanism:** `scripts/markorphan-b006-uuid-charts.ts` filters `/^[0-9a-f]{8}-[0-9a-f]{4}-...$/` regex on doc.id (per parallel-agent report); marks `status:"orphaned"` on bare-UUID rows whose Storage bytes are confirmed absent. The script CANNOT see `upload-{uuid}`-shape orphans because they don't match the regex.

This is BY DESIGN (B-006 was scoped to bare-UUID rows from a specific historical class). But there's no equivalent script for `upload-{uuid}` orphans, even though `reconcile_library` handles them as part of the active set.

**Consequence:** if a future `upload-{uuid}` row goes orphan via a new failure mode (e.g. storage outage with no atomic-guard), no targeted script exists; `reconcile_library` is the only path, and it operates on the full active set (slow + might not be triggered).

**Detection method:** `library_index.where("status","==","orphaned").get()` — count by shape (regex match on doc.id). Verifies the 297 historical orphan-marked rows' shape composition.

**Fix shape:** none required — `reconcile_library` covers this case. Document as a class to be aware of.

**LOC estimate:** 0 (documentation only).

**Suggested follow-on lane:** none. Note in TANGENTS.md as architectural-debt awareness.

---

## FINDING-9 — `lane-c2-purge-dangling-tracks.mjs` hardcodes 5 upload-prefix fileIds; not a recurring mutator (LOW)

**Channel pair:** historical one-shot × tracks collection.

**Mechanism:** `scripts/lane-c2-purge-dangling-tracks.mjs` lines 17-37 (per agent §1):
```js
const FIDS = ["upload-037d9094-...", ...5 hardcoded values...]
const snap = await db.collection("tracks").where("fileId", "in", FIDS).get()
for (...) batch.delete(db.collection("tracks").doc(r.trackId))
```
By construction operates on 5 known dangling tracks only. The "shape-blindness" framing in the parallel-agent report overstates risk — this is a TARGETED one-shot, not a recurring sweep. It can't misfire on other rows because `where("fileId","in",FIDS)` excludes everything else.

**Consequence:** none active. Documented as a historical pattern to be aware of (and to AVOID — future remediation should use general bond-aware logic, not hardcoded lists).

**Fix shape:** the script is one-shot already; if a future analogous sweep is needed, write it as a general "find tracks whose fileId is not in any active library_index row" — that would be shape-agnostic.

**LOC estimate:** 0 (script not actively dispatched).

**Suggested follow-on lane:** none.

---

## Summary table (for supervisor + auditor scan)

| # | Severity | Class | Channel pair | Active risk? | LOC fix |
|---|---------|-------|--------------|--------------|---------|
| 1 | **HIGH** | silent duplication | drive-sync × non-cron ingest | YES (continuous) | ~12 + backfill ~80 |
| 2 | MEDIUM | observability blind spot | PGR-04 sample × upload-{uuid} majority | YES (alarm coverage gap) | 2-10 |
| 3 | MEDIUM | schema divergence | setlist-import-execute × all downstream | YES (silent drift) | ~30 |
| 4 | MEDIUM | dedup blindness | dedup × SLI/IMP/LEG rows | YES (silent duplicates) | ~60 (backfill) + FINDING-3 prevents future |
| 5 | MEDIUM | dual-write asymmetry | processChartUpload × applySongMetadata | YES (silent key/bpm drift) | ~8 |
| 6 | MEDIUM | scope misalignment | backfill_track_mimetype × audioFileId | YES (audio binds un-healed) | ~10 |
| 7 | MEDIUM | mutation incompleteness | rename + editEnrichment × W-02 fields | YES (stale dedup) | ~60 |
| 8 | LOW | by-design shape filter | markorphan-b006 × non-bare-UUID orphans | NO (reconcile_library covers) | 0 |
| 9 | LOW | one-shot pattern | lane-c2 × hardcoded list | NO (not recurring) | 0 |

**Recommended dispatch order (per dependency + Friday-relevance):**
1. **FINDING-1** (HIGH, structural defense against future silent duplication) — single owner, integration test required.
2. **FINDING-2** (alarm coverage) — quick win, makes PGR-04 representative.
3. **FINDING-3 + FINDING-5** (write-path canonicalization) — can be combined into one Tier-1 lane that routes setlist-import-execute through processChartUpload AND adds the post-batch applySongMetadata call. Common owner.
4. **FINDING-4** (one-shot backfill) — dryRun-first per `[[feedback_single_owner_destructive_runs]]`, Daniel-supervised.
5. **FINDING-7** (rename/edit recompute) — Tier 1; benefit + risk both bounded.
6. **FINDING-6** (audio backfill scope) — small, can ride along with another track-side lane.

FINDINGS 8 + 9 are documentation-only.
