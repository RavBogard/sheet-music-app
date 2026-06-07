# Storage Backup — SYNTHESIS + recommended way forward (supervisor)

**Date:** 2026-05-22 · **Inputs:** `LANE-A-FINDINGS.md` (coder-2, forward design) + `LANE-B-FINDINGS.md` (coder-5, forensics + restore). Both Tier-0 READ-ONLY, verified against `origin/master` + read-only Firebase MCP on `crcmusiccharts`.
**Decision basis (Daniel, 2026-05-22):** coverage = files + metadata; lead with Google Drive, compare alternatives; 2 researchers. Both lanes shipped FINDINGS to master and **agree**.

---

## 1. The problem, verified (not theoretical)

1. **Firebase Storage chart bytes have 0% managed backup.** Nothing copies `gs://crcmusiccharts.firebasestorage.app/library/**` anywhere the system controls. This is the loss vector.
2. **The one backup we ship is DEAD, not dormant.** `/api/cron/backup` last recorded a run **2026-02-24** (`config/backup.lastBackupAt`), in no-op `logical` mode (counts only, `BACKUP_BUCKET` unset), and the PGR-01 `backups/{date}` audit collection is **empty** — ~3 months with no backup of anything, and **nothing alerted.** Likely `CRON_SECRET` unset / cron not live in deployed `vercel.json`.
3. **The exposed majority is the path you use now.** Upload-keyed (`upload-{uuid}`) MCP-first charts (you + David author this way) are **Storage-only → unrecoverable if Storage is lost**, and that tier is *growing*. Drive-keyed legacy rows have only an *incidental, unmonitored* Drive copy (≈ "David hasn't deleted it"), not a managed backup.
4. **Restore is half-built and covers the easy half.** `reconcile_library` heals only rows that still exist, by re-pulling from Drive *using the row's own fileId*. It **cannot** recover upload-keyed bytes (no Drive object at `upload-{uuid}`) nor a full wipe (no rows to iterate; the metadata export is dead).
5. **Good news:** the atomic-guard makes *new* uploads safe and drift *detectable*; the 295 historical orphans ("Shireinu scare" cohort) are now hard-deleted. The gap is purely **post-write durability + an independent copy + a real restore path.**

The bitter irony in the data: Lane A found the **20 largest objects are all `source:"salvage"`** rows healed by the prior recovery sweep — the near-loss is literally still in the library.

---

## 2. Recommended way forward — LAYERED (both lanes converge here)

A single mechanism doesn't cover both "oops I deleted a file" and "the whole project is gone." Layer three, cheapest-first:

**Layer 1 — GCS floor (zero code, turn on TODAY).** Enable **Object Versioning + confirm soft-delete** on the chart bucket. Instantly turns "overwrite/delete = permanent" into "restore a generation." Same-vendor blast radius (doesn't survive a project/billing loss) — that's what Layer 2 is for. *This is the single highest bang-for-buck action and needs only a console toggle.*

**Layer 2 — Drive byte-mirror (the lead; the thing you asked for).** A nightly `/api/cron/storage-backup` mirrors every **active** chart's bytes Storage→Drive into a **dedicated** folder (`CRC_BACKUP_DRIVE_FOLDER_ID`, ideally a Workspace Shared Drive), collection subfolders, `<stem>__<fileId>` naming, md5-skip incremental (idempotent), using the existing write-capable `DriveClient`. Human-browsable, **you can restore by hand**, and it lives **off the Firebase blast radius**. Loop-avoidance: dedicated folder (NOT either watched import folder) + optional `appProperties.crcBackup` importer skip. Guarantee: every active chart in Drive **≤24h of upload** (tightenable to hourly cheaply; or near-real-time by hooking the existing `library.row.created` event).

**Layer 3 — metadata, two ways.** (a) Repair + activate the existing **Firestore GCS export** (`gcloud firestore import`-restorable, all collections) — env + IAM only, code already written; (b) write a self-contained **JSON snapshot** (`library_index`+`setlists`+`songs`+`tracks`) into the Drive folder so the human-visible copy holds *both* the bytes and the map that labels them.

**Critical structural fix (Lane B's #1 requirement, Lane A agrees):** at mirror time, **record the backup location back onto each row** (e.g. `library_index.backupDriveId`). Restore must key on a **recorded pointer**, not on the fileId coincidentally being a Drive id — that's the exact reason `reconcile_library` can't recover the upload-keyed majority today.

**Build friction is small:** the protected set is **< ~1 GB** (~260 active rows; largest ~2MB) so capacity/quota is a non-issue; the only real code is **2 additive `DriveClient` methods** (binary upload + `files.update`) + the cron + a `restore_library` path that reuses the existing atomic `healChartBytes` primitive.

---

## 3. Phased plan (all post-launch, Daniel-gated)

- **Phase 0 — console/env, NO code (safe immediate):** (a) diagnose why the backup died 2026-02-24 (CRON_SECRET? cron registered?); (b) **enable GCS Object Versioning + soft-delete** (the floor, protects today); (c) decide + create the Drive backup folder (Shared Drive preferred), set `CRC_BACKUP_DRIVE_FOLDER_ID`; (d) set `BACKUP_BUCKET` + grant SA IAM so the Firestore export goes real.
- **Phase 1 — metadata safety net (smallest code):** confirm real `:exportDocuments` runs + add the **staleness alarm** (PGR-03 — a dead backup must be LOUD; this is what failed in February).
- **Phase 2 — Drive byte-mirror (core build):** `DriveClient.uploadBinaryFile` + `updateFileMedia` + base64→hex md5 helper; nightly `/api/cron/storage-backup` (md5-skip, idempotent, loop-safe); write `backupDriveId` per row; audit doc + staleness alarm.
- **Phase 3 — self-contained + restore drill:** JSON metadata snapshot into Drive; a `restore_library` tool (or `reconcile_library` "follow the backup pointer" mode) reusing `healChartBytes`; **run one real restore drill** (delete a test object → restore from Drive → byte-identical verify).

Lane B's 10 acceptance criteria (LANE-B-FINDINGS §7) are the build's checklist — chiefly: back up ALL sources incl. upload-keyed; pointer-on-row; metadata snapshot; full-wipe path; reuse atomic-guard; fileId stability (never re-key — bonds live in `setlists.fileIds[]`/`tracks.fileId`); survive in-place overwrite via versioning; independent failure domain; freshness alarm; RPO ≤24h.

---

## 4. ★ Free / near-free wins to switch on NOW (your "flag the wins" — awaiting go)

These are Phase-0, low/zero-risk, and independent of the build. None executed (research was READ-ONLY):

| ID | Action | Effort | Payoff |
|---|---|---|---|
| **CW-1** | Enable **GCS Object Versioning + soft-delete** on the chart bucket | 1 `gcloud` command | Highest bang/buck — overwrite/delete becomes recoverable *today* |
| **CW-3** | Diagnose why `/api/cron/backup` died 2026-02-24 (CRON_SECRET / cron registration) | 5-min Vercel check | We currently have **no backups at all**, silently |
| **CW-2** | Set `BACKUP_BUCKET` + SA IAM → real Firestore export | console/env | Metadata RPO ∞ → 24h |
| **CW-4** | `reconcile_library({dryRun:true})` to pin exact Storage-only vs Drive-keyed count | read-only run | The precise exposure number |
| **CW-5** | Hard-delete the ≥2 remaining `duplicate` rows | dryRun-first | Minor hygiene (lowest priority) |

---

## 5. Open questions only you can answer

1. **Workspace / Shared Drive available?** → the Drive ownership model (Shared Drive is clean; consumer-SA-quota fallback works for v1 at <1GB).
2. **OK to enable GCS versioning today** (CW-1) as the always-on floor?
3. **Cadence:** nightly (≤24h RPO) or hourly?
4. **Drive layout:** collection subfolders (browsable) vs flat? (recommend subfolders.)
5. **Scope:** `library/` only, or also `library/originals/` + `recordings/`? (recommend all three; small tail.)
6. **Who owns + executes the implementation lane**, and when (post-launch window)?

---

*Both FINDINGS on master @ `42aee0a0b`. Worktrees `storage-backup-A` + `storage-backup-B` teardown-eligible. Implementation deferred post-launch + Daniel-gated.*
