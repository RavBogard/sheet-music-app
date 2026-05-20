# Storage-Canonical Migration — Research & Plan

**Author:** coder-1 (storage-canonical-research lane)
**Date:** 2026-05-20
**Base SHA:** `988be5ebd` (origin/master)
**Status:** RESEARCH/PLAN ONLY — no `src/` edits, no data migration, no byte copies were performed.
**Assignment:** `inbox/coder-1.md` msg-storage-canonical-research-001 + ADDENDUM.

All prod evidence below was gathered read-only against `https://www.centralreform.live/api/mcp`
(pool ROOT bearer) + the Firebase MCP (`crcmusiccharts` Firestore) on 2026-05-20.

---

## TL;DR (read this first)

1. **The Shireinu/supplemental 404 is DATA LOSS, not a recoverable mapping bug.** The broken
   charts are `source: local_upload` (and pre-atomic-guard `source: upload`) rows whose Storage
   bytes were never written. They were **never Drive-backed** — there is no `driveFileId`, so
   there is nothing for a Drive→Storage migration to copy. **A migration cannot recover them.**

2. **The supervisor's premise is contradicted by the data.** The ADDENDUM hypothesized
   "supplemental is the Drive-synced collection; Drive access was lost." The evidence shows the
   opposite: the Drive-synced rows are the **healthy** ones (Drive access is alive — reconcile
   listed live Drive folders), and the broken supplemental rows came from **local uploads**, not
   Drive sync. (Surfacing per [[feedback_cowork_prompt_verify_before_write]].)

3. **The "Drive → Storage migration" is, for the healthy population, already essentially DONE.**
   `reconcile_library({dryRun:true})` reports `driveMirror.count: 0` — zero healthy rows still
   depend on the Drive fallback. Active charts already resolve from Storage (verified: a
   `storageUrl:null` Drive row still serves `ok` from `firebase-storage`).

4. **So the actual remaining work is three separate, smaller things**, NOT a byte-copy migration:
   - **(A) Cutover** — drop / demote the Drive fallback in `file-fetcher.ts` so runtime never
     depends on Drive (it already doesn't, in steady state). One file, two functions.
   - **(B) Data-loss remediation** — ~295 orphaned charts need **re-supply of bytes** (an https
     `sourceUrl` or re-upload) via the **already-shipped `salvage_chart_bytes` tool**. This is a
     content-recovery effort gated on Daniel/David having the original files — not an engineering
     migration.
   - **(C) Cleanup** — hard-delete the 295 orphaned + 8 duplicate + triage the 99 non_chart rows
     ([[project_orphan_baseline]]).

5. **Recommendation:** Do **not** dispatch a "migration wave." Dispatch a small **(A) cutover
   lane** + a **(B) recovery operator-runbook** (Daniel-driven, tool already exists) + a **(C)
   cleanup lane**. The expensive part (Drive→Storage byte copy) has no work left to do.

---

## Part 1 — Deliverable 0: Diagnosis + Feasibility

### 1.1 The concrete repro, root-caused

Failing chart (supervisor-supplied): `/perform/72a7aa6a-7b08-4c78-862c-197bbffb9515`.

`library_index/72a7aa6a-7b08-4c78-862c-197bbffb9515` (read via Firebase MCP):

```json
{
  "id": "72a7aa6a-7b08-4c78-862c-197bbffb9515",
  "name": "Adon Olam (Folk).pdf",
  "collection": "supplemental",
  "mimeType": "application/pdf",
  "source": "local_upload",
  "status": "orphaned",
  "orphanedAt": "2026-05-17T01:40:37.553Z",
  "orphanedReason": "B-006: pre-atomic-guard sync left no Storage bytes",
  "createTime": "2026-03-15T00:42:51Z"
  // NO driveFileId. NO storageUrl. NO driveMd5.
}
```

`get_chart_status` → `{"status":"missing","reason":"Not in Storage; Drive 404: File not found: 72a7aa6a-..."}`

**Why it 404s** (traced through `src/lib/file-fetcher.ts` + `src/lib/firebase-storage.ts`):

- The row's doc id is a **bare UUID** — neither a Drive file id nor an `upload-{uuid}` Storage key.
- `/perform/[fileId]/page.tsx` sets `track.fileId = <library_index doc id>`; the byte server
  (`src/app/api/drive/file/[fileId]/route.ts:57`) calls `fetchFileById(fileId)`.
- `fetchFileById` → `downloadFromStorage` → `getCandidatePaths` probes
  `library/72a7aa6a…`, `library/72a7aa6a….pdf`, `library/upload-72a7aa6a…`,
  `library/upload-72a7aa6a….pdf`, and `_`→`-` variants. **All miss** (bytes were never written).
- Storage miss → Drive fallback. The id does **not** start with `upload-`, so `fetchFileById`
  hands the bare UUID to `DriveClient.getFileWithMime(...)`, which 404s (a UUID is not a Drive id).
- Both stores miss → `fetchFileById` returns `null` → route returns `404 file_not_found`.
  (The `[object Object]` Daniel saw is the UI stringifying the rich `error` envelope — cosmetic.)

This is **correct behavior for a byte-less row**. The bug is upstream: the row should never have
existed without bytes (pre-atomic-guard, see 1.3), and once detected it should have been
hard-deleted or recovered, not left clickable.

### 1.2 The three byte-store conventions in `library_index` (the real architecture)

`dump_collection_size(library_index)` → **569 docs** (≈300 KB of *metadata only*; bytes live in
Storage). Three coexisting row shapes, established by direct Firestore reads:

| Shape | `id` form | `source` | Bytes location | Health |
|---|---|---|---|---|
| **(A) Drive-keyed** | Drive file id (`17TDzffO…`) | `drive-sync` / `google_drive` | Storage `library/{driveId}.pdf` **and/or** Drive (via `driveFileId`) | **Healthy.** Drive is a recoverable backstop. |
| **(B) upload-keyed** | `upload-{uuid}` | `upload` | Storage `library/upload-{uuid}.pdf` | **Healthy** when atomic-guard era (post 2026-05-15). |
| **(C) bare-UUID** | bare UUID (`72a7aa6a…`) | `local_upload` | **nowhere** | **Orphaned. Data loss.** No `driveFileId`, no bytes. |

Examples confirmed:
- (A) `17TDzffOQT4ohO2p7yQCudUTYbj1tRg28` "Tu Bishvat.pdf", `storageUrl:null`, `storageCopiedAt:null`
  → `get_chart_status` = **`ok` / `firebase-storage`**. (The resolver path-probes by id; the
  `storageUrl` field being null is cosmetic — the bytes ARE in Storage.)
- (B) `upload-001c4dd1-…` "Avinu Malkeinu - Full Score", `storageUrl: library/upload-001c4dd1-….pdf`,
  uploaded by davidlazaroff 2026-05-16 → healthy.
- (C) `72a7aa6a-…` above → orphaned, data loss.

### 1.3 The orphaned population (the data-loss set)

`list_library('supplemental')` coverage block (the tool's `HygieneCoverage`):

```
total 569 | eligible 470 | scanned 0 (for the supplemental filter)
filteredOut.byStatus:     orphaned 295, duplicate 8
filteredOut.byCollection: (none) 100, core 59, uploads 8     ← NO "supplemental" bucket
filteredOut.byOther:      non_chart 99
```

Key reads of this:
- **There are 0 *active* supplemental rows.** Every supplemental chart is in the orphaned set.
- **295 rows are `status: orphaned`.** Sampled 9 (incl. the repro); **all** identical shape:
  `collection: supplemental`, `source: local_upload`, bare-UUID id, **no `driveFileId`**,
  `orphanedReason: "B-006: pre-atomic-guard sync left no Storage bytes"`, all orphaned in one
  batch at `2026-05-17T01:40:37`.
- A **second orphaned batch** exists: `status: orphaned` + `source: upload` rows
  (`upload-{uuid}`, uploaded Mar–Apr 2026 by brynsentnor@ + davidlazaroff@), orphaned at
  `2026-05-19T17:51:21`. These **carry a `storageUrl` field** but the bytes are gone —
  `get_chart_status` on three of them returned `missing` ("Not in Storage; upload- prefix has no
  Drive fallback"). Pre-atomic-guard uploads whose Storage write silently failed.

**Root cause (unifying both batches):** uploads that predate the **atomic-guard**
([[feedback_upload_atomicity]], shipped 2026-05-15) wrote the `library_index` row but the Storage
byte write failed (or never ran), leaving a row pointing at non-existent bytes. Two reconcile/
sweep passes (2026-05-17, 2026-05-19) detected the missing bytes and flipped `status: orphaned`.
The atomic-guard fixed *new* uploads; it could not retroactively recover bytes that were never
persisted.

### 1.4 Feasibility gate — are the source bytes RETRIEVABLE?

The ADDENDUM's one mandatory question. Evidence:

- **Drive is NOT the source for the broken rows.** `orphaned + source=drive-sync` → **0 rows**;
  `orphaned + source=google_drive` → **0 rows**. Every orphaned row is `local_upload` or `upload`
  — neither has a `driveFileId`, so neither has a Drive byte source.
- **The bytes are not elsewhere in Storage.** The resolver probes all `library/*` candidate
  paths (bare / `upload-` / `_`→`-` / ext variants) and misses. There is no collection-specific
  prefix the resolver skips — `local_upload` rows were never written to a path at all.
- **No healthy duplicate to recover from.** `search_library("Adon Olam")` → 0 active matches;
  `search_library("Tfilat Haderech")` → 0. The orphaned songs do not exist as healthy rows.
- **Drive access itself is ALIVE** (rules out the ADDENDUM's "lost Drive access" theory):
  `reconcile_library({dryRun:true})` listed live Drive folders in `skippedNonChart`
  (HHD, Sheet Music, Choral Arrangements, Piyutim-Pizmonim, …) with real Drive ids, and reported
  **234 alreadyHealthy / 0 orphan / 0 driveMirror / 0 transient** across the 263 Drive-tracked
  rows it scans. The Drive pipeline is functioning.

**VERDICT: the ~295 orphaned charts are DATA LOSS.** Their bytes are not in Storage, not in Drive,
and have no in-system duplicate. A Drive→Storage migration **has nothing to copy** for them. The
only recovery is **re-supplying the original bytes** (an https `sourceUrl` or a re-upload) — which
depends entirely on whether Daniel/David still hold the original PDFs (the supplemental songbook
charts from March 2026, and bryn/David's Mar–Apr uploads).

**A recovery tool already exists:** `salvage_chart_bytes(fileId, sourceUrl?, dryRun, force)` —
admin-only, atomic-guard, re-uploads bytes onto the **existing** fileId so every setlist/song
bond is preserved. For these rows (no `driveFileId`) it **requires an explicit `sourceUrl`**, else
it refuses with `no_source_available`. This is the right primitive for (B); no new tool is needed.

---

## Part 2 — Deliverable 1: The migration plan

### 2.1 Inventory (ground truth, 2026-05-20)

| Population | Count | State | Action |
|---|---:|---|---|
| `library_index` total | **569** | — | — |
| Active, Storage-healthy (Drive- + upload-keyed) | **~234** | serves from Storage today | none (already canonical) |
| Non-chart artifacts (Drive folders, `.DS_Store`, Google-docs) | **~99** (29 in reconcile's Drive-scan) | catalog cruft | triage → delete |
| Duplicate (deduped) | **8** | kept copy serves | hard-delete the dupes |
| **Orphaned — data loss** | **295** | no bytes anywhere | recover (salvage) where possible, else hard-delete |
| ↳ batch 1: `local_upload` supplemental, bare-UUID | (majority) | B-006, 2026-05-17 | salvage w/ `sourceUrl`, else delete |
| ↳ batch 2: pre-atomic-guard `upload-{uuid}` | (remainder) | 2026-05-19 | salvage w/ `sourceUrl`, else delete |

(Exact batch-1/batch-2 split to be enumerated at execution time via the orphan list — both are
data loss, so the split only affects *who* sources the originals.)

### 2.2 Reframing: what "Storage-canonical" actually requires now

The cycle-3 ADDENDUM-1 direction (decisions.md 2026-05-17T23:10Z) is **already largely realized**:
Storage is canonical, Drive is an intake conduit, the runtime serving path is Storage-first, and
`reconcile_library` reports zero rows still needing a Drive→Storage mirror. The remaining gap to
"fully Storage-canonical, no Drive runtime dependency" is small and decomposes into three lanes.

### 2.3 Lane A — Runtime cutover (drop / demote the Drive fallback)

**Goal:** the runtime serving path never calls Drive. (It already doesn't in steady state;
this makes it structural and removes the dead-UUID→Drive-404 latency on every broken-row click.)

**Single chokepoint:** `src/lib/file-fetcher.ts` — `fetchFileById` (byte fetch) + `getChartHealth`
(metadata probe). Every consumer routes through these two functions:
- `src/app/api/drive/file/[fileId]/route.ts` (browser byte server)
- `src/lib/print-pipeline.ts` (×3 — gig packet/print)
- `src/lib/mcp/tools/library-download.ts` (×2 — `download_chart`, `generate_gig_packet`)
- `src/lib/enrichment-engine.ts`, `src/lib/key-detection.ts`
- `getChartHealth` consumers: `library.ts`, `library-verify.ts`, `setlist-publish.ts`, `setlist-write.ts`, `reconcile-library.ts`

**Cutover decision — RECOMMENDED: keep Drive as a *cold backup for Drive-keyed rows only*,
remove it for everything else.** Rationale:
- For **(A) Drive-keyed** rows, Drive is a legitimate recoverable source and the `import_chart_from_drive`
  + drive-sync intake flow stays. Keeping a Drive fallback for *Drive ids that are actually Drive ids*
  is cheap insurance and is the path `salvage`/`reconcile` already use for recovery.
- For **bare-UUID and `upload-` ids**, the Drive fallback is **pure dead weight** — it can only
  ever 404 (already true for `upload-`; should be made true for bare-UUID). Gate the Drive branch
  on "id looks like a Drive id" so a missing bare-UUID returns 404 immediately instead of paying a
  Drive round-trip first.
- **Pre-cutover safety check (telemetry already exists):** the byte route stamps
  `X-Served-From: firebase-storage | google-drive-fallback`. Confirm via logs/probe that **no live
  request returns `google-drive-fallback`** before tightening. (Expectation: 0, since `driveMirror=0`.)

**Anti-recommendation:** do **not** hard-drop Drive entirely in one commit. The `import_chart_from_drive`
weekly path and the reconcile/salvage Drive-recovery paths legitimately read Drive. "Storage-canonical"
means *serving* never depends on Drive, not that the code can't read Drive for *intake/recovery*.

Risk tier: **1** (behavior-affecting but well-fenced; deployed-surface REPRO = a healthy chart
still serves `X-Served-From: firebase-storage`, a bare-UUID orphan returns 404 fast).

### 2.4 Lane B — Data-loss remediation (operator runbook, not an engineering migration)

**This is content recovery, gated on source availability — schedule it as a Daniel/David-driven
operator runbook using the existing tool, not a coder lane.**

1. **Enumerate** the 295 orphaned rows with name + source + batch (one admin query / a tiny
   read-only `list_orphaned_charts` helper if a tool surface is wanted; the data is already
   reachable via Firebase MCP `firestore_query_collection status==orphaned`).
2. **Triage each against an original source:**
   - If David's Drive drop-folder still contains the song (by name match) → re-import via
     `import_chart_from_drive` (mints a fresh `upload-`/Drive row) **then re-bond** any setlist
     track, OR `salvage_chart_bytes(fileId, sourceUrl=<drive download url>)` to heal in place and
     preserve bonds. Prefer **salvage** when the orphaned fileId is still referenced by a setlist.
   - If Daniel/David has the original file → host it at a temporary https URL and run
     `salvage_chart_bytes(fileId, sourceUrl, force:true)`.
   - If no original exists anywhere → **accept the loss**; hard-delete the row (Lane C) and, if a
     setlist still bonds it, unbond (the shipped `update_track songId:null` path).
3. **No code required** — `salvage_chart_bytes` is shipped and admin-gated. The only optional
   engineering nicety is a read-only `list_orphaned_charts` MCP convenience tool (the Firebase MCP
   already covers it for this exercise).

**Feasibility caveat (the gate from D0):** the ceiling on automated recovery is **how many
originals still exist**. The migration cannot manufacture bytes. Expect a non-recoverable subset
(supplemental songbook charts last seen March 2026) that becomes a re-source-from-scratch task.

### 2.5 Lane C — Cleanup (orphan + duplicate hard-delete; non_chart triage)

Per [[project_orphan_baseline]] (295 orphaned + 8 duplicate await hard-delete):
- After Lane B has salvaged everything salvageable, **hard-delete the remaining orphaned rows**
  (and their `songs/{id}` mirror) so they stop appearing as clickable dead links and stop
  inflating coverage counts. Gate on "is any setlist still bonded?" — unbond first.
- **Hard-delete the 8 `duplicate` rows** (the kept copy serves; dupes are pure noise).
- **Triage the ~99 `non_chart` rows** (Drive folders, `.DS_Store`, Google-native docs that got
  indexed): delete the artifacts; for Google-native docs, the drive-sync already queues them as
  `google_doc_skipped` — they should not be `library_index` rows at all.
- Tooling: `delete_chart` (shipped) + a bounded batch helper, or extend `reconcile_library` with a
  `--purgeOrphans` force-mode (careful: irreversible; dryRun-default + explicit force).

Risk tier: **2** (destructive, data-integrity) — full rigor, dryRun-first, per-batch verify.

### 2.6 Verification & rollback

- **Lane A:** REPRO at deployed surface — (1) a known healthy chart serves 200 with
  `X-Served-From: firebase-storage`; (2) a bare-UUID orphan returns 404 (fast, no Drive hop);
  (3) `generate_gig_packet` + `download_chart` still serve healthy charts. Rollback = revert the
  one-file `file-fetcher.ts` change (the Drive branch is restored).
- **Lane B:** each `salvage_chart_bytes` run is atomic (Storage write → read-verify → Firestore
  merge → compensating-delete on failure). Per-row, idempotent, reversible by re-salvage. Verify
  `get_chart_status` flips `missing → ok` and the bonded setlist renders.
- **Lane C:** dryRun-first; capture the orphan/duplicate id list before deletion; deletions are
  irreversible, so gate behind explicit Daniel ratification of the dryRun manifest. No rollback
  for a hard-delete — that's why Lane B (recovery) runs first.
- **No live workflow depends on Drive *serving*.** `import_chart_from_drive` (intake) and
  drive-sync (intake) legitimately *read* Drive and are unaffected — keep them.

### 2.7 Suggested execution dispatch

| Lane | Scope | Risk tier | Dependency | Owner |
|---|---|---|---|---|
| **A — cutover** | gate Drive fallback to real-Drive-ids in `file-fetcher.ts`; pre-check `X-Served-From` telemetry = 0 drive-fallback | 1 | none | 1 coder lane |
| **B — recovery runbook** | enumerate 295 orphans; salvage what has a source; accept-loss the rest | 2 (writes prod bytes) | (optional) read-only `list_orphaned_charts` helper | Daniel/David operator-driven; uses shipped `salvage_chart_bytes` |
| **C — cleanup** | hard-delete remaining orphans + 8 dupes; triage 99 non_chart | 2 | **after B** | 1 coder lane + Daniel ratifies dryRun manifest |

**Sequencing:** A and B can run in parallel (A is serving-path, B is data). **C must follow B**
(don't delete a row you might still salvage). There is **no Drive→Storage byte-copy lane** because
`reconcile_library` shows that work is already complete.

---

## Appendix — evidence index (all read-only, 2026-05-20)

- `dump_collection_size(library_index)` → 569 docs.
- `list_library('supplemental')` coverage → 0 active supplemental; 295 orphaned, 8 duplicate, 99 non_chart, 100 (none), 59 core, 8 uploads.
- `reconcile_library({dryRun:true})` → scanned 263, alreadyHealthy 234, driveMirror 0, orphan 0, transient 0, needsRebond 0, skippedNonChart 29 (live Drive folders listed).
- Firebase MCP `firestore_get_document library_index/72a7aa6a-…` → bare-UUID, local_upload, no driveFileId, orphaned (B-006).
- Firebase MCP `firestore_query_collection status==orphaned` (sample 8) → uniform local_upload/supplemental/B-006 shape.
- `status==orphaned & source==drive-sync` → 0; `& source==google_drive` → 0; `& source==upload` → rows present (batch 2, storageUrl set but bytes missing).
- `get_chart_status` on 72a7aa6a + 3 upload- orphans → all `missing`.
- `get_chart_status` on 17TDzffO… (Tu Bishvat, storageUrl null) → `ok` / firebase-storage.
- `search_library("Adon Olam")` / `("Tfilat Haderech")` → 0 active matches.
- Code: `file-fetcher.ts`, `firebase-storage.ts`, `drive-sync/poller.ts`, `salvage-chart-bytes.ts`, `reconcile-library.ts`, `api/drive/file/[fileId]/route.ts`.
