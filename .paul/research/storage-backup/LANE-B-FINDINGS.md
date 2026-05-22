# Lane B — Loss-surface forensics + restore guarantee (FINDINGS)

**Author:** coder-5 (lane storage-backup-B, Tier 0 READ-ONLY) · **Date:** 2026-05-22
**Base SHA:** `7c41b6bb4` (origin/master tip; PARENT cited `7eb1b2d9e`, R1 since landed `7c41b6bb4`)
**Sibling:** Lane A (coder-2) owns the forward Storage→Drive mirror design. This lane = what goes wrong, how exposed we are now, how we recover, and the requirements A must satisfy.
**All evidence read-only:** code read from the worktree @ origin/master `7c41b6bb4`; live state via Firebase MCP read-only against `crcmusiccharts` Firestore (2026-05-22). NO writes, NO heals, NO sweeps.

---

## 0. TL;DR — the headline

1. **Firebase Storage chart bytes have NO backup of any kind.** Nothing mirrors `gs://crcmusiccharts.firebasestorage.app/library/**`. Managed/guaranteed backup coverage of the serving library = **0%**.
2. **The one backup we ship is dead, not just dormant.** `/api/cron/backup` is (a) in no-op `logical` mode (`BACKUP_BUCKET` unset → counts only, never bytes) AND (b) **has not recorded a run since 2026-02-24** — `config/backup.lastBackupAt = 2026-02-24T18:44Z`, and the PGR-01 `backups/{YYYY-MM-DD}` audit collection is **empty**. So even the Firestore *metadata* has no usable recent restore point, and the failure is silent.
3. **Restore is only half-built and only covers the easy half.** `reconcile_library` heals **rows-that-still-exist whose bytes can be re-pulled from Drive by the row's own fileId**. It cannot recover upload-keyed (`upload-{uuid}`) charts (no Drive object exists at that id), and it cannot recover a **full wipe** (it iterates existing `library_index` rows — if the rows are gone there is nothing to iterate, and the dead Firestore export gives nothing to restore them from).
4. **The motivating loss class is now closed historically but adds zero backup.** The 295 pre-atomic-guard orphans (the "Shireinu scare" cohort — bytes never written) have been hard-deleted (`status==orphaned` now returns 0). That removed dead rows; it did not protect anything that's live.
5. **Two cheap floors exist today and are un-pulled:** enable GCS **Object Versioning + soft-delete** on the chart bucket (one `gcloud` command), and **un-dormant the Firestore export** (`BACKUP_BUCKET` + `CRON_SECRET` + SA roles — the runbook checklist already exists). Both are flagged below; neither is in this lane's scope to execute.

---

## 1. Loss-mode taxonomy

How chart bytes / metadata are lost or become unreachable in *this* system. Each row: trigger → blast radius → current detectability → current recoverability.

| # | Loss mode | Trigger / code path | Blast radius | Detectability today | Recoverability today |
|---|---|---|---|---|---|
| L1 | **Storage object deleted (manual / console / IAM)** | Someone deletes `library/{fileId}*` in the GCP console, or a compromised/over-broad service account does. No app code does this in steady state. | Per-file → whole `library/` prefix. Versioning **DISABLED** + soft-delete only **7d** ⇒ a delete is permanent after a week. | Lazy: only when a reader hits it. `get_chart_status`/`verify_setlist_charts` (`library-verify.ts`) report `missing`; `reconcile_library` dryRun buckets it `orphan`. No proactive alarm. | **Upload-keyed: NONE** (no Drive copy). **Drive-keyed: only if the Drive original survives** (reconcile re-pulls). No backup to restore from. |
| L2 | **Compensating-delete (intended) misfires** | Atomic-guard rollback deletes the Storage blob it just wrote when the Firestore write throws (`library-upload.ts:618`, `chart-heal.ts:107/178`, `reconcile-library.ts:453/495`). Deletes by exact path. | Single just-written object. By design it only removes a blob whose index write failed → correct. Risk is a *bug* widening the path. | Upload returns `server_error`; row never created. | N/A (the file was never successfully indexed). Low risk; noted for completeness. |
| L3 | **Drive "replace" overwrites Storage bytes (no version kept)** | `drive-sync` poller REPLACE branch: md5 advanced ⇒ `uploadToStorage(existing.docId, …)` overwrites in place (`poller.ts:412`). `uploadToStorage` does `file.save()` (`firebase-storage.ts:125`) — overwrites, no versioning. | The single chart whose Drive source changed. If David replaces a Drive file with a wrong/corrupt one, the good bytes are **gone** (no prior version). | None proactive; only noticed if the new bytes are visibly wrong in Perform. | **NONE** without Object Versioning. The previous good bytes are unrecoverable. |
| L4 | **`library_index` row ↔ Storage object drift (orphan classes)** | Pre-atomic-guard uploads wrote a row but not bytes (B-006). Two historical batches: 271 `local_upload` bare-UUID + 22 `upload-{uuid}` (storageUrl set, bytes absent). | Per-row "dead link" in Perform/library; band sees a broken chart. | `get_chart_status`→`missing`; `reconcile_library`/`verify_setlist_charts(markOrphaned)` flip `status:orphaned`. Well-instrumented. | **Bytes were never written ⇒ unrecoverable server-side** (prior art: 0/297 had a Drive source). Now moot — these 295 rows are **hard-deleted** (verified `status==orphaned`=0, 2026-05-22). Atomic-guard (2026-05-15) prevents *new* members of this class. |
| L5 | **Reverse orphan (bytes without index)** | A Storage write succeeds but the Firestore write fails AND the compensating-delete also fails (`library-upload.ts:620` logs `rollback-failed`). | Stray bytes consuming storage; not user-visible (no row points at them). | Only via a Storage-vs-index audit (none scheduled). | Harmless to users; just cruft. Low priority. |
| L6 | **Bad dedup / forced overwrite of a real variant** | `processChartUpload` dedup is `force`-bypassable (`library-upload.ts:392/417`); but a fresh upload always mints a NEW `upload-{uuid}`, so it never overwrites an existing object. Real overwrite risk is L3 (same-id replace) only. | None for new uploads (new id). | N/A | N/A — listed to rule out; new-upload path does not destroy existing bytes. |
| L7 | **Drive source disappears (legacy/Drive-keyed rows)** | David deletes/moves/loses-permission on a Drive file that a `source: google_drive`/`drive-sync` row depends on for its *backstop*. Drive-delete → NO propagation by design (`poller.ts` header; Storage canonical), so the row keeps serving from Storage — UNTIL Storage is also lost (then L1/L3 with no Drive to reconcile from). | The Drive-keyed subset loses its only redundancy. | Silent — nothing tracks Drive-side deletes. | Storage copy still serves; but the "backup" (Drive) is now gone. Pure-Drive recovery (reconcile) would fail. |
| L8 | **Full Storage bucket loss** | Bucket deleted / project billing lapse / catastrophic IAM error. | The entire serving library. | Total outage; immediately obvious. | **Catastrophic.** Upload-keyed: gone. Drive-keyed: only what still lives in David's Drive, healed one-by-one via reconcile. No backup bucket. |
| L9 | **Full Firestore loss / corruption (rows gone)** | DB deleted / mass bad write / corruption. | All metadata: `library_index`, `setlists`, `songs`, `tracks`, bonds. | Total outage. | **Catastrophic and end-to-end unrecoverable today.** The Firestore export is dormant+dead (no recent snapshot), and `reconcile_library` needs existing rows to iterate — with no rows there is nothing to heal and nothing to rebuild from. |
| L10 | **v10/upgrade-class corruption (precedent, different subsystem)** | The monitor `monitor-live/state` array→map corruption (now fixed). Not a chart-bytes loss, but the same *class*: a write-path bug silently degrades a doc; consumers read the corrupted shape. | Cited as the reason metadata integrity (not just bytes) must be in the safety net. | — | — |

**Synthesis of the taxonomy:** the atomic-guard (L4 forward-prevention) and orphan instrumentation are genuinely good — *creation* is safe and *drift* is detectable. The gap is entirely **post-write durability**: nothing protects an already-good object from deletion (L1/L8), in-place overwrite (L3), or a metadata wipe (L9), and there is no independent copy to restore from.

---

## 2. Current coverage inventory (read-only, 2026-05-22)

### 2.1 The exposure number

**Managed backup coverage of Storage bytes = 0%.** There is no second copy of any chart that the system controls. The active library splits into two redundancy tiers, neither of which is a real backup:

| Tier | Row shape (`source` / id) | Has a 2nd copy? | If Storage is lost | Verified samples (2026-05-22) |
|---|---|---|---|---|
| **Storage-only** | `source: upload`/`salvage`, `upload-{uuid}` id | **No** — bytes exist only in `library/upload-…`. No `driveFileId`. | **Unrecoverable.** | `upload-001c4dd1…` "Avinu Malkeinu" (David), `upload-0dd9f521…` "Barchu" (David), `upload-10da060e…` "Modah Ani G#m" (Daniel, 2026-05-20) — all `status:active`, no Drive field |
| **Drive-keyed** | `source: google_drive`/`drive-sync`, Drive-id doc | **Incidental only** — a Drive original *may* still exist in David's folders (uncontrolled; L7). | Recoverable *only* if that Drive file survives. | `1jiX9o2P…` "Kedusha Em" + `1pu2Jsv…` "Mizmor leDavid" (`google_drive`); `17TDzffO…` "Tu Bishvat" + `1jgs72z…` "Lechu Goldman" (`drive-sync`, carry `driveFileId`+`shortcutTargetId`) |

**This is the key point for Daniel:** the **upload-keyed tier is the MCP-first authoring path David and Daniel use now** ([[user_mcp_is_primary_author_workflow]]) — it is **growing** and has **zero** redundancy. The Drive-keyed tier is the *legacy* path and its "backup" is just "David hasn't deleted the Drive file," which the system neither guarantees nor monitors.

### 2.2 Population magnitude

Exact live counts were **not** brute-force enumerated (read-light on launch eve; counting 200+ docs would bloat with no decision value beyond the split above). From prior art + verified deltas:

- **Prior art (2026-05-20, `storage-canonical-migration-PLAN.md`):** 569 `library_index` total → ~234 active Storage-healthy, 295 orphaned, 8 duplicate, ~99 non_chart; `reconcile_library` `driveMirror:0` (every active row already serves from Storage).
- **Verified current deltas (2026-05-22, Firebase MCP):**
  - `status==orphaned` → **0** (was 295) — the data-loss cohort has been **hard-deleted**.
  - `status==duplicate` → **≥2 remain** (`dodi li (sher).png`, `Bar'chu Walkdown.mxl`).
  - Active rows present in both tiers (samples above).
- **Net:** the index is now ≈ active library + a little dupe/non-chart cruft. The exact active **Storage-only vs Drive-keyed** count is the one number worth pinning before implementation — get it cheaply server-side via `reconcile_library({dryRun:true})` (see cheap win CW-4); do NOT run a force pass.

### 2.3 Bucket / GCS protections (flag — re-verify, not Firestore-readable)

- **Bucket:** `gs://crcmusiccharts.firebasestorage.app` (single bucket; legacy `.appspot.com` doesn't exist; created 2026-02-15). Confirmed live via `Kedusha Em.storageUrl`.
- **Object Versioning: DISABLED** (prior art `storage-recovery-B-report.md`, 2026-05-20). ⇒ no prior-version restore for L1/L3.
- **Soft-delete: 7-day** retention (prior art); 37 unrelated soft-deleted objects observed then. A 7-day window is a weak floor and unrelated to chart loss.
- These are GCS bucket-metadata facts not readable through the Firestore MCP — **re-verify in the GCP console** before relying on them.

---

## 3. Audit of the existing backup (`/api/cron/backup`)

**Verdict: it is protecting nothing today, and the failure is silent.**

Code (`src/app/api/cron/backup/route.ts`):
- `GET` (Vercel cron, `CRON_SECRET` bearer) / `POST` (admin token) → `runBackup()`.
- `runBackup` (line 94): if `BACKUP_BUCKET` is **set** → real Firestore managed export via `:exportDocuments` → `gs://$BACKUP_BUCKET/backups/<ts>`; if **unset** (line 109) → `logicalBackup()` = **counts only, no bytes** (line 178).
- It **only ever exports Firestore**. It **never** touches Storage bytes, and **never** targets Drive. Even fully provisioned, it would not back up a single chart PDF.
- Every run is supposed to write `config/backup` (`recordBackup`, line 253) + a dated `backups/{YYYY-MM-DD}` audit doc (`recordBackupAudit`, line 222) so staleness is observable (PGR-01).

Live state (Firebase MCP, 2026-05-22):
- `config/backup` → `lastBackupType: "logical"`, `lastBackupAt: 2026-02-24T18:44Z`, `lastBackupCounts: {setlists:16, users:16, …}`. `updateTime: 2026-02-24`.
- `backups` collection → **empty** (no dated audit docs at all).

What this proves:
1. **`BACKUP_BUCKET` is unset** in prod (type is `logical`).
2. **The cron has not executed `runBackup` since 2026-02-24** — `config/backup` would update on *every* run (logical or gcs) and the `backups/{date}` trail would have ~daily entries; both are frozen/empty. The `setlists:16`/`users:16` counts are a stale February snapshot (today there are ~42 setlists). Likely cause: `CRON_SECRET` unset (route 401s before `runBackup`) and/or the cron entry isn't live in the deployed `vercel.json`. **Needs a 5-minute Daniel check** (CW-3).
3. **The observability that PGR-01 added is itself dark** — there's no reader on `backups/{date}`, and the trail is empty anyway, so nobody would notice the backup is dead. The interim signal (Sentry `captureException` on failure) only fires if `runBackup` runs and throws — it never runs.

**Bottom line: RPO for metadata is effectively ∞ (last usable snapshot is a 3-month-old counts-only no-op), and RPO for bytes is ∞ (never).**

---

## 4. Restore-path assessment (does the loop close?)

Lane A will mirror Storage→Drive. The question: how much of recovery does the EXISTING tooling then cover, and what's the gap?

**What `reconcile_library` (`src/lib/mcp/tools/reconcile-library.ts`) actually does:**
- `loadAdminCandidates` reads **`db.collection("library_index").get()`** (line 249) — it operates **only on rows that already exist**, and **skips** `orphaned`/`duplicate` (line 260, for idempotency).
- For each existing row it `getChartHealth` (line 330): Storage 200 → healthy; Storage 404 + Drive 200 → `mirror`; Storage 404 + Drive 404 → `orphan`; etc.
- `mirrorRow` (line 511) heals by calling **`drive.getFile(c.fileId)`** — i.e. it re-pulls bytes from Drive **using the row's own fileId as the Drive file id**, then writes Storage at the same id (bonds preserved) via the shared atomic-guard tail (`commitResolvedBytes`, line 421).

**Coverage matrix for a "Storage byte loss" event:**

| Scenario | Covered by reconcile today? |
|---|---|
| Row exists, bytes lost, **Drive-keyed** row, Drive original survives | ✅ Yes — `mirror` bucket re-pulls Drive→Storage at the same fileId. |
| Row exists, bytes lost, **upload-keyed** (`upload-{uuid}`) row | ❌ **No.** There is no Drive object at `upload-{uuid}` ⇒ `getChartHealth` returns `missing` ⇒ reconcile marks it `orphaned`. It cannot pull from any Drive mirror because it keys on the row's fileId, not on a recorded backup location. |
| Row exists, bytes lost, Drive-keyed but Drive original also deleted (L7) | ❌ No — Drive 404 ⇒ orphaned. |
| **Full Storage wipe** (L8) | ⚠️ Partial — only Drive-keyed rows with surviving Drive originals heal; all upload-keyed lost. |
| **Full Firestore wipe** (L9, rows gone) | ❌ **No.** Nothing to iterate; no metadata snapshot to rebuild rows from (export dead). End-to-end dead. |

**The gap, precisely:** the existing recovery loop assumes (a) the metadata row still exists and (b) the bytes are re-fetchable from Drive *by the row's fileId*. Neither holds for the Storage-canonical (upload-keyed) majority, and neither holds for a full wipe. **Recovery is keyed on `fileId == Drive id`, but the forward design will store the backup somewhere else** — so restore must be keyed on a **recorded backup pointer**, not on the fileId coincidentally being a Drive id.

The good news: the atomic, bond-preserving **heal primitive already exists** — `healChartBytes(db, uid, fileId, buffer, mimeType, salvagedFrom)` (`src/lib/chart-heal.ts:82`) writes bytes onto an existing fileId with read-verify + compensating-delete + signals + re-enrichment. A restore tool should reuse it. What's missing is the layer above it: (1) a backup that includes upload-keyed bytes, (2) a pointer from row→backup, (3) a metadata snapshot, and (4) a "rebuild rows then rehydrate bytes" full-wipe path.

---

## 5. Recovery runbook + RPO/RTO

### 5.1 Today (honest current state)

| Asset | Backup | RPO | RTO | Restore procedure |
|---|---|---|---|---|
| **Storage chart bytes** | none | ∞ | ∞ (upload-keyed) | No procedure exists. Drive-keyed-with-surviving-Drive only: `reconcile_library({force:true})`. |
| **Firestore metadata** | dormant+dead | ∞ (last record 2026-02-24, counts-only) | ∞ | No usable export to `gcloud firestore import` from. |

The existing `backup-restore-runbook.md` (PGR-01) describes the *intended* GCS-export + Object-Versioning design, but every console step (create bucket, set `BACKUP_BUCKET`, grant SA, enable versioning) is **undone**, and the cron isn't even recording — so the runbook is aspirational, not operative.

### 5.2 Target runbook (what Lane A's design must make true)

> Full-wipe recovery, step by step (the design to build toward — none of this is executable today):

1. **Restore metadata first.** `gcloud firestore import gs://<BACKUP_BUCKET>/backups/<ts>` (needs the export un-dormanted + actually running) → recreates `library_index` / `setlists` / `songs` / `tracks` and all bonds. **RPO = the export cadence (target ≤24h).**
2. **Rehydrate bytes from the Drive (or GCS-versioned) mirror.** For each `library_index` row, read its **recorded backup pointer** (e.g. `backupDriveId`) and pull the bytes → `healChartBytes(fileId, buffer, mimeType, "restore")` (bond-preserving, atomic, read-verify). A new `restore_library` tool (or a `reconcile_library` mode that follows the backup pointer instead of `getFile(fileId)`) drives the loop.
3. **Verify.** `verify_setlist_charts(setlistId)` on the real upcoming setlists → `okCount == bondedCount`, `missingCount == 0`. Spot-open in Perform on an iPad.
4. **Safety during restore:** the heal path already read-verifies by size and compensating-deletes on failure, so a partial/corrupt pull never half-writes a row. Dedup is N/A (heal-in-place keeps the existing id; no new dup rows).

- **Target RPO:** ≤24h for both bytes + metadata (weekly-cadence app; or near-real-time on bytes by hooking the existing `library.row.created` event, `library-upload.ts:703`, to mirror on upload).
- **Target RTO:** metadata import (minutes, shul-scale) + byte rehydrate loop (bounded by chart count × Drive fetch; tens of minutes for a few hundred charts). Mostly automatable → low-hours, mostly unattended.

---

## 6. Cheap wins available now (FLAG ONLY — do not execute)

Each is low-risk and could land independently of the big forward design. **None executed in this lane** (Tier-0). Recommended as Daniel-gated fast-follows, **after** the launch.

| ID | Win | Why / impact | Risk |
|---|---|---|---|
| **CW-1** | **Enable GCS Object Versioning + soft-delete** on `gs://crcmusiccharts.firebasestorage.app` (`gcloud storage buckets update … --versioning`). | Immediate floor against L1/L3/L8 overwrite+delete — the single highest bang-for-buck. Turns "overwrite = permanent loss" into "restore a generation." Runbook step 5 already written, never done. | Low (additive; add a lifecycle rule to cap noncurrent-version cost). |
| **CW-2** | **Un-dormant the Firestore export:** set `BACKUP_BUCKET` + `CRON_SECRET` (if unset), grant the SA `datastore.importExportAdmin` + `storage.admin`, redeploy. | Metadata RPO ∞ → 24h. Checklist exists in `backup-restore-runbook.md`. (Still bytes-blind — that's the forward design's job.) | Low (config only). |
| **CW-3** | **Diagnose why the cron stopped recording on 2026-02-24** (CRON_SECRET unset → 401? cron entry missing from deployed `vercel.json`? route failing?) and wire a staleness alert/reader on `backups/{date}` (PGR-03). | The backup is *silently* dead; without this, any future backup can die the same way unnoticed. | Low (investigation + read-only alert). |
| **CW-4** | **Run `reconcile_library({dryRun:true})`** to pin the exact current active **Storage-only vs Drive-keyed** count (the precise exposure number). | Read-only, server-side, cheap; gives Daniel the real headline figure without a heavy enumerate. | None (dryRun is observability; never force). |
| **CW-5** | **Hard-delete the remaining `duplicate` rows** (≥2). | Minor hygiene; not a loss-surface. | Low (destructive → dryRun-first; lowest priority). |

---

## 7. Requirements Lane A's forward design MUST meet (to make recovery real)

These are the acceptance criteria the Storage→Drive mirror has to satisfy so that the loss modes above actually become recoverable. Lane A should treat this as its checklist:

1. **Back up bytes for ALL active charts, regardless of `source`** — especially the **upload-keyed** (`upload-{uuid}`) majority that has zero redundancy today. A mirror that only copies Drive-keyed rows backs up the charts that are *already* the least exposed and ignores the most exposed.
2. **Record the backup location back onto the row** (e.g. `backupDriveId` / a `backups/manifest` doc) so restore is **keyed on a pointer**, not on the fileId coincidentally being a Drive id. This is the structural fix for the §4 gap.
3. **Back up METADATA as a restorable snapshot** — `library_index` + `setlists` + `songs` + `tracks` (bonds). Bytes alone don't survive L9. (Pairs with CW-2 / the Firestore export, or a dedicated metadata snapshot.)
4. **Provide a FULL-WIPE restore path** — a `restore_library` tool or `reconcile_library` "follow the backup pointer" mode that can run after a metadata import to rehydrate every row's bytes. `reconcile_library` as-is cannot (it heals existing rows via `getFile(fileId)` only).
5. **Reuse the atomic-guard / `healChartBytes` contract on restore** — read-verify by size + compensating-delete + `library_signals` broadcast + re-enrichment, so a restore can never half-write or corrupt. (Primitive already exists at `chart-heal.ts:82`.)
6. **Preserve fileId stability (heal-in-place, never mint new ids)** — bonds live in `setlists.fileIds[]` / `tracks.fileId`; a restore that re-keys breaks every setlist (the same lesson the orphan recovery learned: 51 bonds across 10 setlists).
7. **Survive in-place overwrite (L3)** — pair the mirror with versioning/immutability so a Drive "replace" (md5 advance, `poller.ts:412`) or any overwrite can be rolled back to the prior good copy. Mirror-on-replace must keep the superseded version, not clobber it.
8. **Be independent of the primary's failure domain** — a "backup" in the same GCS project, deletable by the same service account, doesn't survive L8/a credential compromise. Drive-under-Daniel's-account (browseable, restorable by hand — Daniel's stated appeal) gives that independence; GCS Object Versioning does not (same project). Weigh this in the lead-with-Drive-vs-GCS comparison.
9. **Observability + freshness alarm** — the current cron died silently for 3 months. The design MUST surface staleness (a fresh `backups/{date}`-style heartbeat + an actual reader/alert) so a dead backup is loud, not silent. A backup nobody can tell is broken is worse than none.
10. **Hit RPO ≤24h / near-real-time on bytes** — hook the existing `library.row.created` event (`library-upload.ts:703`, already fires on every ingest path incl. heal) to mirror on upload, so the backup is current within minutes and not just at a daily boundary.

---

## Appendix — evidence index (all read-only, 2026-05-22 @ origin/master `7c41b6bb4`)

**Code (worktree reads):** `src/lib/library-upload.ts` (atomic-guard §4, lines 457–726), `src/lib/chart-heal.ts` (`healChartBytes` :82), `src/lib/firebase-storage.ts` (`uploadToStorage` :116 / `deleteStorageObjectAtPath` :249 / bucket resolve :26), `src/lib/mcp/tools/reconcile-library.ts` (`loadAdminCandidates` :216 / `mirrorRow` :511 / `commitResolvedBytes` :421), `src/lib/mcp/tools/library-verify.ts` (`get_chart_status` / `verify_setlist_charts`), `src/lib/drive-sync/poller.ts` (REPLACE overwrite :412, Drive-delete-no-propagation header), `src/lib/google-drive.ts` (`DriveClient`, scope `…/auth/drive`; `createFile` :435 takes a string body — **note for Lane A: not binary-PDF-ready as-is**), `src/app/api/cron/backup/route.ts` (`runBackup` :94 / `logicalBackup` :178 / `recordBackupAudit` :222).
**Live Firestore (Firebase MCP read-only):** `config/backup` → `lastBackupType:logical`, `lastBackupAt:2026-02-24T18:44Z`. `backups` collection → empty. `library_index status==orphaned` → 0. `library_index status==duplicate` → ≥2. `library_index status==active source==upload` → upload-keyed, no driveFileId (Avinu Malkeinu / Barchu / Modah Ani). `…source==drive-sync` → Tu Bishvat / Lechu Goldman (driveFileId + shortcutTargetId). `…source==google_drive` → Kedusha Em / Mizmor leDavid (`storageUrl: gs://crcmusiccharts.firebasestorage.app/library/{driveId}.pdf`).
**Prior art reused (not re-derived):** `backup-restore-runbook.md` (PGR-01), `storage-recovery-B-report.md` (B1/B2, 2026-05-20), `storage-canonical-migration-PLAN.md` (569-row inventory, driveMirror:0), `orphan-recovery-manifest.{md,json}` cohort. Memory: [[project_orphan_baseline]], [[feedback_upload_atomicity]], [[user_mcp_is_primary_author_workflow]].
