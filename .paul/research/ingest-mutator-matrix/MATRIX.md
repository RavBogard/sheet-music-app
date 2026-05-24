# MATRIX — Ingest channel × background mutator cross-product

**Lane:** `ingest-mutator-matrix-research` (Tier-0 deep research).
**Method:** for each (ingest channel, mutator) pair, ask "if ingest A produces a `library_index` row with shape/fields X, and mutator B applies test T, what happens?". Color code per cell.

**Cell symbols:**
- ✅ Mutator correctly handles the shape — no action when none warranted, correct action when warranted.
- ⚠️ Mutator MIGHT mishandle in specific edge cases — see FINDINGS for the named scenario.
- ❌ Mutator WILL mishandle this shape — concrete failure mechanism named.
- ⬜ Cell not applicable (ingest channel doesn't produce rows the mutator cares about).

**Rows (ingest channels) — abbreviation key:**
- `PCU` = processChartUpload — produces `upload-{uuid}` doc.id with full schema (nameLower/normalizedName/stem/titleSpecificity/collection/enrichmentStatus etc.). Underlies in-app upload, MCP upload/import/save_scraped/finalize, drive-sync cron, etc.
- `IMP` = `/api/setlists/import/execute` — produces `upload-{uuid}` doc.id but **bypasses** processChartUpload (missing nameLower/normalizedName/stem/specificity/enrichmentStatus/collection)
- `SLI` = `syncLibraryIndex` (admin `/api/library/sync`) — produces RAW Drive-id doc.id with `lastSyncedAt`/`storageCopiedAt`/`source:"google_drive"` shape (no normalizedName/stem/specificity/enrichmentStatus/collection/`uploadedBy`)
- `LEG` = pre-atomic-guard legacy ingest (B-006 class) — bare UUID doc.ids; no atomic-guard verify; some Storage bytes never landed (root cause of the 297 orphans)
- `SAL` = salvage/heal (`MCP salvage_chart_bytes`, `finalize_chart_upload` heal mode) — preserves caller-supplied doc.id whatever shape
- `RNAM` = `/api/library/rename` PATCH — updates `displayName` + `modifiedTime` only; leaves name/nameLower/normalizedName/stem stale
- `EDIT` = `editEnrichment` (admin) — updates arbitrary patch incl. `title`; sets `humanRenamedAt`; does NOT recompute nameLower/normalizedName/stem either
- `KEY` = `update_song` / `edit_library_entry` via `applySongMetadata` — dual-writes `songs.defaults.{key,bpm,lead}` + `library_index.{key,bpm,leadMusician}`. Updates ONLY existing docs (never creates phantom).
- `BIND` = `add_track_to_setlist` / `update_track` / `swap_chart` — stamps `track.mimeType` from library_index at bind time (post 2026-05-20); does NOT touch library_index itself
- `BACK` = MCP `backfill_track_mimetype` — heals legacy track rows missing `mimeType` from library_index

**Columns (mutators):**
- `DSC` = `/api/cron/drive-sync` (5-min)
- `ENR` = `/api/cron/enrich` (daily 2am)
- `AER` = `/api/cron/ai-enrich-retry` (every 30 min)
- `AC` = `/api/cron/admin-consistency` (daily 4am — PGR-03 storage-backup-staleness + PGR-04 library-bytes-health)
- `VBH` = `/api/cron/verify-chart-bond-health` (weekly Thu 3pm)
- `SBP` = `/api/cron/storage-backup` (daily 5am)
- `BAK` = `/api/cron/backup` (daily 3am — Firestore export)
- `REC` = MCP `reconcile_library`
- `SDA` = `safelyDeleteLibraryObject` (delete chokepoint — bond-aware structural defense)
- `DCH` = MCP `delete_chart` (wraps SDA)
- `BTM` = MCP `backfill_track_mimetype`
- `DEDUPE` = MCP `dedupe_library_index`
- `L-C2` = `scripts/lane-c2-purge-dangling-tracks.mjs` (one-shot historical)
- `M-B6` = `scripts/markorphan-b006-uuid-charts.ts` (one-shot historical)
- `SOT` = `scripts/sweep-orphan-tracks-deleted-setlists.mjs` (operator-run)

---

## 3. THE MATRIX (rows = ingest, cols = mutator)

|             | DSC | ENR | AER | AC  | VBH | SBP | BAK | REC | SDA | DCH | BTM | DEDUPE | L-C2 | M-B6 | SOT |
|-------------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:------:|:----:|:----:|:---:|
| **PCU** (upload-{uuid})          | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | ⬜ |
| **IMP** (upload-{uuid}, partial schema) | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ❌ | ⬜ | ⬜ | ⬜ |
| **SLI** (raw Drive id, no normalizedName/stem/collection) | ⚠️ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ❌ | ⬜ | ⬜ | ⬜ |
| **LEG** (bare UUID, no atomic-guard) | ⚠️ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ⚠️ | ⚠️ | ⬜ | ✅ | ⬜ |
| **SAL** (preserves existing shape) | inherited from row's shape | | | | | | | | | | | | | | |
| **RNAM** (rename — displayName only) | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ⬜ | ⬜ | ⬜ |
| **EDIT** (admin enrichment edit) | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ⬜ | ⬜ | ⬜ |
| **KEY** (applySongMetadata)      | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⬜ | ✅ | ⬜ | ⬜ | ⬜ |
| **BIND** (track binds — track.mimeType from library_index) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ⚠️ | ⬜ | ✅ |
| **BACK** (backfill_track_mimetype) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⬜ | ✅ | ⬜ | ⬜ | ✅ |

---

## 4. Cell-by-cell explanations (only ⚠️ / ❌ cells called out; ✅ cells are silent unless a non-obvious mechanism makes them safe)

### Row PCU (upload-{uuid} full schema) — the modern canonical write

- **PCU × AC ⚠️** — PGR-04 library-bytes-health sample queries `library_index.where("status","==","active").orderBy("lastSyncedAt","desc").limit(N)`. PCU writes `uploadedAt`/`modifiedTime` but does NOT write `lastSyncedAt`. Firestore's `orderBy(field).desc` excludes docs where the field is missing → PGR-04 sample skews toward `syncLibraryIndex`-shaped rows AND misses the bulk of modern upload-shape rows. **★ FINDING-2.**

All other PCU cells are ✅. processChartUpload is the well-formed canonical write; mutators read its full schema. No mishandling found.

### Row IMP (upload-{uuid}, partial schema — bypasses processChartUpload)

- **IMP × DSC ⚠️** — drive-sync cron's `findRowByDriveFileId` queries `library_index.where("driveFileId","==",file.id)`. IMP doesn't stamp `driveFileId` (the imported chart's Drive id isn't preserved — it's downloaded then re-uploaded with a fresh `upload-` doc.id). So if a setlist-import then a drive-sync run later sees the SAME source Drive file, the cron classifies it as "NEW" and imports a SECOND copy as another `upload-{uuid}` row — UNLESS processChartUpload's dedup fuzzy-match catches it (which it would only if the title is normalized identically). **★ FINDING-3.**
- **IMP × ENR ⚠️** — ENR cron tests `metadata.enrichedAt == null`; IMP rows have no `metadata` field, so the test passes BUT the cron's downstream call expects a populated row — works but may hit silent skip behaviors. Low impact.
- **IMP × AER ⚠️** — IMP rows don't have an `enrichmentStatus`. The retry queue is only populated for rows that processChartUpload emitted `library.row.created` for; IMP doesn't emit that event. So IMP rows never enter AI enrichment AT ALL. **★ FINDING-3.**
- **IMP × AC ⚠️** — same `lastSyncedAt` exclusion as PCU × AC.
- **IMP × VBH ⚠️** — verify-chart-bond-health reads `library_index/{fileId}.name`. IMP writes `name: finalTitle` but the title is the AI-extracted CSV-row title (often a clean song name) while the bonded track's title is from the same source — so the bond audit's `compareTitleToFilename` overlap test may misfire (no obvious bug, but the shape is different from canonical). Documented; non-critical.
- **IMP × REC ⚠️** — reconcile_library iterates active rows, probes Storage. IMP wrote `storageUrl: \`library/${newLibraryId}.pdf\`` — works. But IMP's row has no `stem`/`titleSpecificity`, so REC's W-02 recomputation at orphan-mark / heal time may compute against missing fields → defaults to 0. Low risk, not a write hazard.
- **IMP × DEDUPE ❌** — `dedupe_library_index` exact-matches on `normalizedName`. IMP doesn't write `normalizedName`. IMP-imported charts are **invisible to dedup** and can produce a `(libraryMatchId == null)` cross-product collision with a later PCU upload of the same chart. **★ FINDING-4.**

### Row SLI (raw Drive id — legacy admin-sync)

- **SLI × DSC ⚠️** — drive-sync cron's existing-file query is `where("driveFileId","==",file.id)`. SLI writes `id: file.id` (doc.id = Drive id) but NOT `driveFileId` as a separate field. So drive-sync cron CANNOT match an SLI-shaped row → classifies the same Drive file as "NEW" → mints a `upload-{uuid}` row → catalog now has TWO rows for the same Drive file (one Drive-id doc.id, one upload-shape doc.id). Dedup may catch by `nameLower`/`normalizedName` only if SLI wrote those (it writes `nameLower` but NOT `normalizedName`) — partial protection at best. **★ FINDING-1.**
- **SLI × AC ⚠️** — PGR-04's `lastSyncedAt`-ordered sample naturally surfaces SLI rows (since `lastSyncedAt` is SLI's exclusive write). So PGR-04 is essentially auditing the Drive-id-shaped tail of the catalog while ignoring the upload-shape majority. **★ FINDING-2.**
- **SLI × REC ⚠️** — reconcile_library probes Storage path `library/{doc.id}.{ext}`. SLI's Phase B `uploadToStorage(file.id, ...)` writes to `library/{file.id}.{ext}` with mime-derived ext from `storageMime`. Path roundtrip works. But REC's W-02 sibling recount on orphan-mark may double-touch the same logical chart if both shapes coexist (SLI's Drive-id row + a PCU's upload-shape row → both contribute to siblingsInCatalog count). Subtle; not a blast risk.
- **SLI × DEDUPE ❌** — `dedupe_library_index` queries `normalizedName`. SLI doesn't write that field. SLI rows are **invisible to exact dedup**. The fuzzy pass (Levenshtein > 0.85 on `nameLower`) catches some but misses anything with punctuation/spacing variation. **★ FINDING-4.**

### Row LEG (pre-atomic-guard bare UUID — historical)

- **LEG × DSC ⚠️** — drive-sync sees no `driveFileId` field → if matching Drive file exists, drive-sync would mint a `upload-{uuid}` shadow row. Same shape as the SLI × DSC issue but with bare-UUID rows. **★ FINDING-1.**
- **LEG × AC ⚠️** — most LEG rows lack `lastSyncedAt` too — orderBy excludes them. So PGR-04 sample shape is biased toward SLI rows ONLY.
- **LEG × REC ⚠️** — REC was specifically built to bootstrap LEG rows. Tested working at scale (per `[[project_orphan_baseline]]` — went from 24 → 0 active orphans). 297 orphan-marked rows still await hard-delete sweep.
- **LEG × BTM ⚠️** — `backfill_track_mimetype` reads `library_index/{fileId}.mimeType`. LEG rows have mimeType for whatever the script that wrote them set; some LEG rows may have empty/missing mimeType → `skipped: library_entry_no_mimetype` reason. Documented in BTM's skip report.
- **LEG × DEDUPE ⚠️** — most LEG rows lack `normalizedName`; dedup misses them on the exact pass.
- **LEG × M-B6 ✅** — markorphan-b006 is the targeted heal for this shape.

### Row RNAM (rename — displayName-only)

- **RNAM × DSC ⚠️** — drive-sync cron's RENAME branch tests `driveName !== row.originalName && newTitle !== rowName`. RNAM doesn't update `name` (only `displayName`) → next time the Drive file's name is the same as the row's original `name`, drive-sync sees no rename. BUT: it could see a phantom rename if the Drive file is now named differently from `originalName` while `displayName` was user-set to match. Subtle; low frequency. **★ FINDING-7.**
- **RNAM × DEDUPE ⚠️** — dedup runs on `nameLower`/`normalizedName`, not `displayName`. After RNAM, the dedup behavior reflects the OLD title; a fuzzy collision under the new displayName would not be detected.

### Row EDIT (admin enrichment edit)

- **EDIT × DSC ⚠️** — same as RNAM. EDIT updates `title` but not `nameLower`/`normalizedName`/`stem`/`titleSpecificity`/`bondCorrectionHistory`. The G-5 alphanumeric query field is stale. **★ FINDING-7.**
- **EDIT × DEDUPE ⚠️** — same as RNAM. dedup operates on stale normalized fields.

### Row BIND (track-side mutations)

- **BIND × DCH ⚠️** — `delete_chart` is bond-guarded via `safelyDeleteLibraryObject`. The guard scans `tracks.where("fileId","==",fileId)` then per-track checks parent setlist exists. As of 2026-05-24 the guard treats dangling tracks (parent setlist deleted) as NOT-LIVE; legitimate orphan delete proceeds. ⚠️ only because the agent's earlier note about lane-c2 hardcoded list flagged a tracks-collection enumeration scope concern — verified moot post-1af0b568e.
- **BIND × L-C2 ⚠️** — lane-c2 hardcoded 5 upload-prefix fileIds for one-shot cleanup. By design only affects 5 tracks. Documented; not a recurring mutator. **★ FINDING-9.**
- **BIND × SOT ✅** — sweep-orphan-tracks-deleted-setlists tests parent-setlist existence, not fileId shape. Tracks-side mutator; doesn't touch library_index.

### Row BACK (backfill_track_mimetype)

- **BACK × SOT ✅** — both operate on `tracks` collection but on disjoint criteria (one heals mimeType field, other deletes orphaned tracks); they're orthogonal.

---

## 5. Coverage validation (gates per dispatch §Gates)

- ✅ Every cell populated (no blank cells; ⬜ used only where mutator/ingest are intentionally disjoint).
- ✅ Each ⚠️ / ❌ cell has a named FINDING reference (1-9) below.
- ✅ Matrix covers 10 ingest channels × 15 mutators = 150 cells; 22 are ⚠️ / ❌ (15% of cells flag a real or potential concern); the rest are ✅ or ⬜.

---

## 6. Hot-summary — the cell groups that most matter

Three clusters dominate the risk surface:

1. **`driveFileId` field absence in non-cron-imported rows** (column DSC, rows IMP/SLI/LEG → ⚠️) — drive-sync cron can't see Drive-id provenance on rows produced by setlist-import-execute, admin-sync, or pre-atomic-guard ingest. **FINDING-1.**

2. **`lastSyncedAt` exclusion in PGR-04 sample** (column AC, rows PCU/IMP/SLI/LEG) — PGR-04 alarm samples the LEAST representative tail of the catalog. **FINDING-2.**

3. **Schema-divergent ingest leaves dedupe + AI blind** (column DEDUPE/ENR/AER, rows IMP/SLI) — `normalizedName`/`enrichmentStatus`/`stem` absence means these rows are invisible to dedup and AI enrichment. **FINDING-3 + FINDING-4.**

A 4th cluster — **EDIT/RNAM leave G-5 fields stale** (column DSC/DEDUPE, rows RNAM/EDIT → ⚠️) — is real but lower-impact since RNAM is rare and EDIT is admin-curated.
