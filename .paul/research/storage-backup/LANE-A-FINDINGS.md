# Lane A — Storage→Drive backup architecture + options (FINDINGS)

**Author:** coder-2 · **Tier:** 0, READ-ONLY research · **Date:** 2026-05-22
**Base:** verified against `origin/master` `7c41b6bb4` (worktree `sheet-music-app-storage-backup-A`)
**Project:** `crcmusiccharts` (Firebase MCP read-only probes, daniel@centralreform.org, billing enabled)
**Sibling:** Lane B (coder-5) owns loss-forensics + the restore runbook. This lane owns the FORWARD path (what to back up, where, how). Restore-boundary hand-offs to B are called out inline (§7).

> **TL;DR.** Two gaps, both verified live: (1) **Firebase Storage chart bytes have zero backup** — the loss vector; (2) the existing Firestore backup cron is **not just dormant, it's effectively dead** — `config/backup` last updated **2026-02-24** in `logical` mode (counts only, no bytes), and the dated audit collection is **empty**. Recommendation: a **layered** design — turn on **GCS Object Versioning** as the zero-code always-on floor *today*, repair the Firestore export, and build a **nightly Storage→Drive byte-mirror cron** into a *dedicated* Drive folder (the human-browsable, off-Firebase copy Daniel asked for) using the existing write-capable `DriveClient`. The total protected byte set is small (well under ~1 GB), so capacity/quota is a non-issue; the work is mostly plumbing + one binary-upload method the `DriveClient` is currently missing.

---

## 1. What must be backed up, and how big is it?

### 1a. The protected set (two planes)

**Plane 1 — Firebase Storage bytes (the actual loss vector).** Bucket resolves (`src/lib/firebase-storage.ts:24-28`, `getBucket()`) to
`FIREBASE_STORAGE_BUCKET || NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || ${NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebasestorage.app`.
Three prefixes hold real bytes:

| Prefix | What | Source in code | Backup priority |
|---|---|---|---|
| `library/{fileId}{ext}` | The canonical chart bytes (`.pdf` / `.xml` / `.mp3`, or no ext for text/image) | `getStoragePath()` `firebase-storage.ts:34-46`; written by `uploadToStorage()` :116-138 | **P0 — this is the loss vector** |
| `library/originals/{fileId}.{mscz\|mscx\|heic\|heif}` | Pre-conversion originals for MuseScore→MusicXML and HEIC→JPEG uploads | `library-upload.ts:290-295, 322-327` | P1 (only the subset that needed conversion; the served bytes are already covered by `library/`) |
| `recordings/{recordingId}.{ext}` | Audio recordings (separate feature) | `getRecordingStoragePath()` `firebase-storage.ts:53-60`; `uploadRecordingToStorage()` :201-220 | P1 (audio is large per-file but the collection is small; include for completeness) |

**Plane 2 — Firestore metadata that resolves the bytes.** Without this, restored bytes are an unlabeled blob pile.

| Collection | Role | Notes |
|---|---|---|
| `library_index/{fileId}` | The catalog: `name`, `nameLower`, `mimeType`, `fileSize`, `collection`, `storageUrl`, `status`, `stem`, curation (`key`/`bpm`/`tags`), `enrichmentStatus`/`aiSuggestion`, Drive provenance (`driveFileId`/`driveMd5`/…) | `fileId` is the join key to Storage. **`fileSize` is persisted on every modern row** (`library-upload.ts:556`) — summable for sizing. |
| `songs/{fileId}` | Mirror doc (title/status) used by search | written alongside library_index `library-upload.ts:588-597` |
| `setlists/*` (+ tracks) | Which charts are bonded into which service | the *value* the catalog serves; small JSON |
| supporting | `users`, `songUsage`, `config`, `recordings`, `chartImportQueue` | small |

### 1b. Size estimate (read-only probes + methodology)

`fileSize`-DESC probe over `library_index` (top 20): the largest objects are **multi-song "Shireinu"-style songbook scans at ~1.1–2.05 MB** (max `2,049,708 B`). The top-20 sum to ~26 MB. ★ Notably **every one of the top-20 is `source:"salvage"`** carrying `orphanedReason:"B-006: pre-atomic-guard sync left no Storage bytes"` + `salvagedAt:2026-05-20` — i.e. these are the exact files the prior storage-recovery sweep nearly lost and healed. The motivating incident is in this very data.

Population baseline (memory `project_orphan_baseline` + reconcile coverage prior art): **~568 `library_index` rows total**, of which **~297 are `orphaned` + ~9 `duplicate`** (no Storage bytes by definition) → the **protected set is the ~260 `active` rows**. Typical single-song chord charts are far smaller than the songbook scans (tens-to-low-hundreds of KB).

**Estimate:** ~260 active chart objects, blended average conservatively ~0.4–0.7 MB → **~100–200 MB** for `library/`, plus a modest `originals/` + `recordings/` tail. **Total protected bytes are comfortably under ~1 GB.** Firestore metadata export is a few MB of JSON. **Capacity is not a constraint for any Drive tier.**

> Precise number at implementation time (read-only, admin SDK): sum `library_index` where `status=='active'` `fileSize`, and/or `bucket.getFiles({prefix:'library/'})` summing `metadata.size`. I deliberately did **not** run a 260-doc full fetch through MCP (token-wasteful) — the estimate above is sufficient to make the architecture decision; the exact byte count changes nothing in the design.

### 1c. fileId ↔ Storage ↔ Drive mapping (load-bearing for restore)

- `library_index.fileId` is the abstraction. Two shapes: **`upload-{uuid}`** (Storage-origin; minted in `library-upload.ts:266`) and a **raw Drive id** (legacy/Drive-origin rows).
- Storage object path = `library/{fileId}{ext}` where ext ∈ {`.pdf`,`.xml`,`.mp3`,""} (`getStoragePath`). `library_index.storageUrl` records that exact path (`library-upload.ts:484-485`).
- **Restore today (`reconcile_library`, `reconcile-library.ts:528`) calls `drive.getFile(c.fileId)`** — it heals Drive→Storage **only for rows whose `fileId` IS a Drive id.** A `upload-{uuid}` row has no Drive object at that id, so reconcile cannot restore it from any Drive backup as-written. **This is the central restore-mapping gap** the new backup must close (§7) — flagged to Lane B.

---

## 2. Storage→Drive mirror design (the lead option)

### 2a. Folder target + loop avoidance (critical)

There are **two folders the app already *watches and imports from***:
- `GOOGLE_DRIVE_ROOT_FOLDER_ID` — legacy hourly `/api/cron/sync` (`syncLibraryIndex`, Drive→Storage).
- `DAVID_DRIVE_DROP_FOLDER_ID` — `/api/cron/drive-sync` every 5 min (`runDriveSyncProd`, watches the drop folder **+ its direct subfolders**).

**Rule: the backup folder MUST be a third, dedicated folder that is NOT either watched root and NOT a subfolder of `DAVID_DRIVE_DROP_FOLDER_ID`.** Otherwise the byte-mirror's writes get re-imported as "new charts" → a sync loop + dedup churn. New env var: **`CRC_BACKUP_DRIVE_FOLDER_ID`** (dedicated; ideally inside a Shared Drive — see §4).

Defense-in-depth (optional, recommended): stamp each backup file with Drive **`appProperties: { crcBackup: "1" }`** and (one-line) teach the importer poller to skip `appProperties.crcBackup` files. Even a future folder misconfiguration then can't loop. (The importer doesn't check this today; it's a cheap guard, not a dependency.)

### 2b. Folder structure + naming

Mirror **collection → subfolder**, file named by **stem + fileId** for human-browsability *and* deterministic lookup:

```
CRC-Backup/                         (CRC_BACKUP_DRIVE_FOLDER_ID, ideally a Shared Drive)
  charts/
    core/        <stem>__<fileId>.pdf
    supplemental/<stem>__<fileId>.pdf
    uploads/     <stem>__<fileId>.xml
  originals/     <fileId>.mscz
  recordings/    <recordingId>.mp3
  metadata/      library-snapshot-<YYYY-MM-DD>.json   (see §3)
```

- Embedding `fileId` in the name makes the file findable on restore by name search (`DriveClient.listFiles({query})` already does `name contains`) and survives renames of the human-friendly stem.
- A flat `charts/` is also acceptable; the collection subfolders just make Daniel's manual browse pleasant. (Per memory: no cover-art/visual chrome needed — folders + filenames are the index.)

### 2c. Incremental / idempotent (skip already-mirrored)

Drive `files.list` returns **`md5Checksum` + `size`** (`google-drive.ts:listFilesByQuery`, fields already include both). Firebase Storage object metadata returns **`md5Hash` (base64)**. Both are MD5 of content; **convert base64→hex to compare** (the one cross-format gotcha — note it explicitly in impl).

Per active row:
1. Compute the expected backup filename from `fileId`.
2. Look it up in `CRC_BACKUP_DRIVE_FOLDER_ID` (one folder listing per run, cached in-memory).
3. **Not present →** CREATE (new chart).
4. **Present, md5 matches →** SKIP (already mirrored; the steady-state case → near-zero work).
5. **Present, md5 differs →** REPLACE (chart was re-uploaded). See §2d.

This makes the whole job **idempotent** — re-runs are no-ops, and a half-failed run self-heals next tick.

### 2d. The two concrete code prerequisites (the only real build friction)

1. **`DriveClient.createFile` is NOT binary-safe.** It takes `content: string` and passes it as `media.body` (`google-drive.ts:435-461`) — fine for JSON/text, **corrupts binary PDFs**. Need a new method, e.g. `uploadBinaryFile({ name, mimeType, buffer, parents, appProperties })` that passes `Readable.from(buffer)` as `media.body` with the real `mimeType`. Small, additive, no behavior change to existing callers.
2. **No `files.update` wrapper exists.** For the REPLACE case (§2c.5), either add `DriveClient.updateFileMedia(fileId, buffer, mimeType)` (Drive `files.update` — bonus: Drive keeps **revision history** automatically on update, a free versioning layer in the human-visible copy) **or** trash-and-recreate. Recommend `files.update` for the free revisions.

Everything else the `DriveClient` already has: retry/backoff + 30s timeout (`withRetry`), `supportsAllDrives`/`includeItemsFromAllDrives` (Shared-Drive ready), paginated `listFilesByQuery`. Reads from Storage use the existing `downloadFromStoragePath()` / `downloadFromStorage()` (`firebase-storage.ts:169,260`).

### 2e. Change-detection trigger

- **Primary (recommended): a nightly diff cron** — new `/api/cron/storage-backup` (Bearer `CRON_SECRET`, mirrors the existing cron shape; add to `vercel.json`). It enumerates `status=='active'` `library_index`, lists the backup folder, mirrors the md5-delta. Robust + self-healing: it catches anything any other path missed. Steady-state delta is a handful of files/week → trivially inside `maxDuration=300`. (If a future bulk import creates a large delta, chunk via a Firestore cursor across ticks.)
- **Optional augment, later:** the upload/reconcile paths already bump `library_signals/latest` (`library-upload.ts:660`, `reconcile-library.ts:779`). A near-real-time backup could react to that, but the in-process event bus + serverless make it fragile as the *only* mechanism. Keep the nightly cron as the durable floor; optionally fire an immediate backup pass from the upload path to tighten the window. **Do not** depend on the in-process `emitLibraryRowCreated` bus for backup — it doesn't survive the serverless request boundary.
- **Guarantee with nightly:** every active chart is in Drive **within ≤24 h of upload**; tightenable to hourly by changing the cron schedule (the md5-skip makes hourly cheap).

---

## 3. Metadata backup

**Verified state — the existing Firestore backup is effectively dead:**
- `config/backup`: `lastBackupAt = 2026-02-24T18:44Z`, `lastBackupType = "logical"`, counts only (`setlists:16, songUsage:15, tasks:3, users:16`). **One run, three months ago, in the no-op fallback** (`logicalBackup()` `backup/route.ts:178-213`, taken because `BACKUP_BUCKET` is unset).
- `backups` dated-audit collection (PGR-01, `recordBackupAudit` :222-251): **empty.** No run since the audit feature shipped has recorded anything → the daily cron is **not producing output**. Likely cause: `CRON_SECRET` unset/misconfigured (→ 401, `backup/route.ts:37`) or the cron not firing. **Verify in Vercel.** Either way, **nobody is alerted** that the backup is dead — the exact silent-failure class the design must fix.

**Recommendation — do BOTH, layered:**
1. **Repair + activate `/api/cron/backup` for a real Firestore GCS export.** Set `BACKUP_BUCKET`, grant the Firebase SA `roles/datastore.importExportAdmin` + `roles/storage.admin` on the bucket (the route's own setup notes, :22-28). This yields a complete, point-in-time, **`gcloud firestore import`-restorable** backup of *all* collections in native format. Smallest possible code change (env + IAM); the code is already written.
2. **Write a self-contained JSON snapshot of the key collections INTO the Drive backup folder** (`metadata/library-snapshot-<date>.json`: `library_index` + `setlists` + `songs`). This is the human-visible companion Daniel asked for — the Drive folder then holds *both* the chart bytes *and* the map that labels them, browsable in one place, and it's what a Drive-only restore reads to rebuild `library_index` and re-key the byte mirror. Use the new `DriveClient.createFile` (string/JSON — its existing string body is fine here).

GCS export = the rigorous restorable floor; Drive JSON = the human-visible, off-Firebase, self-describing copy. They serve different restore stories (full-DB import vs Daniel-driven chart recovery); keep both.

---

## 4. Auth / service-account model

**Two credential sets already in prod — reuse, don't invent:**
- **Drive SA** (writes Drive): `GOOGLE_CREDENTIALS_JSON` (full JSON) **or** `GOOGLE_SERVICE_ACCOUNT_EMAIL`+`GOOGLE_PRIVATE_KEY`, scope `https://www.googleapis.com/auth/drive` (full read/write, `google-drive.ts:84-131`). Already used by drive-sync + `reconcile_library`; if reconcile works in prod, these are set.
- **Firebase SA** (reads Storage, exports Firestore): `FIREBASE_CLIENT_EMAIL`+`FIREBASE_PRIVATE_KEY` (`prodRequired` in `env.mjs:18-19`; backup export uses them `backup/route.ts:122-124`; `firebase-admin` Storage uses them).

The backup job = **read Storage (Firebase SA) → write Drive (Drive SA)**. Both creds already exist; no new identity needed.

**Drive ownership/sharing (the one real decision):** files a service account `files.create`s are **owned by the SA** and count against the SA's Drive quota — and **plain service accounts have limited/no personal Drive storage** outside a Workspace. The clean pattern: put `CRC_BACKUP_DRIVE_FOLDER_ID` inside a **Google Workspace Shared Drive** where the SA is a member — Shared-Drive storage is pooled under the Workspace (not the SA), and `DriveClient` already sets `supportsAllDrives`/`includeItemsFromAllDrives` everywhere, so it works unchanged. Then share the Shared Drive (or folder) with `daniel@centralreform.org` as Viewer/Editor for browse/restore. *Fallback if no Workspace:* Daniel creates+owns a normal folder and grants the SA Editor — but SA-created files still consume SA quota; given <~1 GB total, the consumer SA quota is survivable for v1, with a Shared Drive as the proper long-term home. **→ Daniel decision: is a Workspace / Shared Drive available?**

**Quota/rate:** Drive API limits (~12k queries/min/user) dwarf our ~260-object workload. `files.create` rate is fine; `withRetry` already backs off on 429/5xx with a 30 s per-attempt timeout.

**Env to SET / VERIFY in Vercel (don't assume current state):**
| Env | For | Status to verify |
|---|---|---|
| `CRON_SECRET` | all crons incl. backup | **Suspect** — the dead backup points here; verify set + cron registered |
| `BACKUP_BUCKET` | Firestore GCS export | **Unset** (export falls back to logical) → set + IAM |
| `GOOGLE_CREDENTIALS_JSON` *or* `GOOGLE_SERVICE_ACCOUNT_EMAIL`+`GOOGLE_PRIVATE_KEY` | Drive writes | verify set (reconcile/drive-sync need them) |
| `CRC_BACKUP_DRIVE_FOLDER_ID` | **NEW** — dedicated backup folder | create folder + set; add to `env.mjs` |
| `FIREBASE_STORAGE_BUCKET` (server) | Storage reads | read via `process.env` but **not declared in `env.mjs`** — add for validation |

**Schema hygiene (drive-by finding):** `GOOGLE_CREDENTIALS_JSON`, `GOOGLE_PROJECT_ID`, and server-side `FIREBASE_STORAGE_BUCKET` are read via raw `process.env` and are **absent from `env.mjs`** — add them to the schema so misconfig surfaces at boot, not at first backup run.

---

## 5. Alternatives (deliberate comparison, not default)

| Option | Protects against | Pros | Cons |
|---|---|---|---|
| **Drive mirror (lead)** | accidental delete/overwrite **+ whole-project / billing loss** | human-browsable, **Daniel restores himself**, **off-Firebase blast radius**, self-contained w/ JSON | needs the byte-mirror cron + 2 `DriveClient` methods |
| **GCS Object Versioning** | accidental overwrite/delete | **zero code, automatic, instant**; keeps prior versions | same-vendor blast radius; invisible to Daniel; not a project-loss escape |
| **GCS soft-delete** (default ~7 d) | accidental delete only | likely already ON; zero code | time-limited; same-vendor |
| **Bucket retention/lifecycle lock** | deletes | strong | heavy-handed, can block legit cleanup |
| **Dual GCS bucket** (Storage Transfer Service, cross-region/project) | bucket-level loss | automatic, robust off-bucket copy | still Google/GCS blast radius; invisible to Daniel; cost + setup |

**Primary recommendation: a LAYERED approach.**
1. **Floor (today, zero code):** turn on **GCS Object Versioning** + confirm **soft-delete** on the Storage bucket. This instantly covers the easiest-to-hit class (accidental delete/overwrite) while the mirror is built.
2. **Lead (the brief):** the **Drive byte-mirror** as the human-visible, off-Firebase, Daniel-restorable copy + the JSON metadata snapshot — the thing that survives a whole-project loss and that Daniel can browse/restore himself.

Drive leads for exactly the reasons Daniel stated; GCS versioning is the cheap insurance underneath that needs nothing but a console toggle.

---

## 6. Failure modes + observability

- **Audit doc per run:** reuse the `backups/{YYYY-MM-DD}` + `config/backup` pattern. New cron writes `config/storageBackup` (pointer) + dated `storageBackups/{YYYY-MM-DD}` `{ scanned, mirrored, skipped, failed, bytesMirrored, lastError }`. `captureException` to Sentry on failure (already wired in the backup route, :46/:169).
- **Staleness alert (the fix for what we found live):** extend PGR-03 / `admin-consistency` to fire if `config/storageBackup.lastBackupAt` (and `config/backup.lastBackupAt`) is older than **36 h**, emailing via the existing Resend / `BRIDGE_ALERT_EMAIL` path. Had this existed, the **three-months-dead** Firestore backup would have been caught in February.
- **Per-file integrity:** the md5 compare (§2c) is itself the verification — a mirrored file whose Drive `md5Checksum`≠Storage `md5Hash` is re-mirrored automatically.
- **Guarantee statement:** *"Every `active` chart is mirrored to Drive within ≤24 h of upload; each run leaves a dated audit doc; a staleness alert fires if no successful run in 36 h; GCS versioning protects against accidental overwrite/delete continuously."*

---

## 7. Restore boundary (hand-off to Lane B)

Lane B owns the restore runbook + any restore tool. Two design facts this lane surfaces for B:
1. **`reconcile_library` restores Drive→Storage only for Drive-id-keyed rows** (`drive.getFile(fileId)`); it cannot restore `upload-{uuid}` rows from the new backup folder as-written.
2. **Recommended bridge:** at mirror time, write the backup file's Drive id back onto the row (e.g. `library_index.{backupDriveId}`). Then a restore tool (or an extended `reconcile_library`) resolves bytes via `backupDriveId` regardless of `fileId` shape. Failing that, restore can resolve by the deterministic `<stem>__<fileId>` filename via `DriveClient.listFiles({query})`. **B decides the restore tool; A recommends storing `backupDriveId` so both reconcile and a new tool can use it.**

---

## 8. Phased, Daniel-gated implementation plan

> All post-launch. Nothing here ships against prod data this weekend.

- **Phase 0 — console/env, no code (immediate, safe):**
  (a) **Diagnose the dead backup** — verify `CRON_SECRET` set in Vercel + `/api/cron/backup` cron registered (why has `config/backup` not updated since Feb?).
  (b) **Turn on GCS Object Versioning + confirm soft-delete** on the Storage bucket (the zero-code floor — protects *today*).
  (c) **Decide the Drive target** — Shared Drive (preferred) vs a folder Daniel owns; create it; set `CRC_BACKUP_DRIVE_FOLDER_ID`.
  (d) **Set `BACKUP_BUCKET` + grant IAM** so the existing Firestore export goes real.

- **Phase 1 — metadata safety net (smallest code):** confirm `/api/cron/backup` now produces real `:exportDocuments` runs; add the **staleness alert** (PGR-03). Fast win; covers metadata.

- **Phase 2 — the Drive byte mirror (the core build):** add `DriveClient.uploadBinaryFile` (stream body) + `updateFileMedia` + a base64→hex md5 helper; new `/api/cron/storage-backup` nightly diff-and-mirror into `CRC_BACKUP_DRIVE_FOLDER_ID` (collection subfolders, `<stem>__<fileId>` naming, md5 skip, idempotent); audit doc + staleness alert; loop-avoidance (dedicated folder + optional `appProperties.crcBackup` importer skip). Write `backupDriveId` back on each row (§7).

- **Phase 3 — self-contained + restore drill:** write `metadata/library-snapshot-<date>.json` into the Drive folder; Lane B builds/validates the restore tool against the `backupDriveId` mapping; run one full restore drill (delete a test Storage object → restore from Drive → verify byte-identical).

- **Optional:** tighten cadence to hourly; fire an immediate backup pass from the upload path.

---

## 9. Open questions (Daniel only)

1. **Workspace / Shared Drive available?** Determines the Drive ownership model (§4) — Shared Drive is the clean answer; consumer-SA-quota fallback works for v1 given <~1 GB.
2. **Why is the existing backup dead?** Is `CRON_SECRET` set and the `/api/cron/backup` cron actually firing on Vercel? (Phase-0(a).)
3. **Cadence:** is nightly (≤24 h RPO) acceptable, or do you want hourly? (md5-skip makes hourly cheap.)
4. **Drive layout:** collection subfolders (browsable) vs flat `charts/` (simpler)? Recommend subfolders.
5. **Scope of byte mirror:** `library/` only, or also `library/originals/` + `recordings/`? Recommend all three; originals/recordings are a small tail.
6. **GCS versioning floor:** OK to enable Object Versioning today as the always-on insurance under the Drive mirror? (Zero code, recommended yes.)

---

*Verification: every cited `file:line`, env var, tool, and the dead-backup state were checked against `origin/master 7c41b6bb4` (worktree read) and read-only Firebase MCP probes against `crcmusiccharts`. No src changes, no prod writes, no cron deployed.*
