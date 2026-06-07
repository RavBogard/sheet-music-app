# Lane: storage-phase2-drive-mirror (STAGED — fire POST-LAUNCH, Daniel-gated)

**Status:** PRE-SCAFFOLDED, NOT yet fired. This is the real "sync to Google Drive" build from `STORAGE-BACKUP-SYNTHESIS.md` (Phase 2). Do NOT fire during the launch weekend; fire when Daniel gives the post-launch go + confirms the Phase-0 env (esp. `CRC_BACKUP_DRIVE_FOLDER_ID`).

**Tier 2** (new cron + Drive writes; outward-ish — writes to a Drive folder). Read `STORAGE-BACKUP-SYNTHESIS.md` + `storage-backup/LANE-A-FINDINGS.md` + `LANE-B-FINDINGS.md` end-to-end first.

## Prereqs (Phase-0, Daniel/console — must be done before this lane is useful)
- `CRC_BACKUP_DRIVE_FOLDER_ID` created (ideally a Workspace **Shared Drive**) + set in Vercel env + added to `src/env.mjs`.
  - **Drive-write identity = service account `music-app-reader@crcmusicbooks.iam.gserviceaccount.com`** (DriveClient uses `GOOGLE_SERVICE_ACCOUNT_EMAIL`/`GOOGLE_PRIVATE_KEY`, scope `drive`, `supportsAllDrives:true`).
  - ✅/❌ **VERIFIED LIVE 2026-05-23 (supervisor, real SA upload test):** Daniel's first folder `18TFm0ba9AzJ5kdyQQyNqbtRw-RdqBk_-` ("CRC Music Backup", owner `daniel@centralreform.org`) — **share works** (SA sees it, `canAddChildren:true`) but **SA write 403s `storageQuotaExceeded`** ("Service Accounts do not have storage quota") because it's a personal **My Drive** folder (no `driveId`) → SA can't own the bytes. **My-Drive folder is a DEAD END for the pure-SA path. Do NOT use it.**
  - ✅ **RESOLVED + VERIFIED 2026-05-23 — use the Shared Drive `0AGFG2GQLuWKKUk9PVA`.** Daniel created a Workspace Shared Drive (centralreform.org) and added `music-app-reader@crcmusicbooks.iam.gserviceaccount.com` as **Content Manager**. Supervisor confirmed with a real SA upload: GET 200 (`driveId:0AGFG2GQLuWKKUk9PVA`, `canAddChildren:true`), **test file CREATE → 200** (no quota error), drive verified clean after. **`CRC_BACKUP_DRIVE_FOLDER_ID=0AGFG2GQLuWKKUk9PVA`** — NOT yet set in Vercel (set it + add to `src/env.mjs` when this lane ships). **Prereq COMPLETE — the Drive target is ready; lane is build-ready (still post-service-gated for the actual master ship).**
  - ⚠️ **SA delete-permission note:** as Content Manager the SA **cannot permanently delete** (`files.delete` → 404) but **can trash** (`PATCH {trashed:true}` → 200). The mirror only creates/updates (no delete in the happy path), but any prune/cleanup logic must TRASH, not hard-delete — or Daniel grants the SA "Manager" on the Shared Drive.
- Drive SA (`GOOGLE_SERVICE_ACCOUNT_EMAIL`+`GOOGLE_PRIVATE_KEY` / `GOOGLE_CREDENTIALS_JSON`) confirmed working (drive-sync/reconcile already use it).
- (Pairs with) the Firestore export un-dormanted (CW-2) for the metadata half.

## Build (per synthesis §2 + Lane A §2/§8, honoring Lane B's 10 acceptance criteria §7)
1. **DriveClient additive methods** (`src/lib/google-drive.ts`): `uploadBinaryFile({name,mimeType,buffer,parents,appProperties})` (stream body `Readable.from(buffer)` — the current `createFile` is string-only, corrupts binary PDFs) + `updateFileMedia(fileId,buffer,mimeType)` (Drive `files.update` → free revision history). Base64→hex md5 helper.
2. **New `/api/cron/storage-backup`** (Bearer `CRON_SECRET`, mirror the existing backup-cron shape; add to `vercel.json`). Nightly: enumerate `library_index` `status=='active'`, list `CRC_BACKUP_DRIVE_FOLDER_ID` once, per row md5-compare (Storage `md5Hash` base64 → hex vs Drive `md5Checksum`): absent→create, match→skip, differ→`updateFileMedia` (keep the prior revision). Idempotent + self-healing. Collection subfolders + `<stem>__<fileId>.<ext>` naming.
3. **Loop-avoidance (critical):** the backup folder MUST NOT be `GOOGLE_DRIVE_ROOT_FOLDER_ID` or `DAVID_DRIVE_DROP_FOLDER_ID` or a subfolder of the latter. Stamp backup files `appProperties:{crcBackup:"1"}` + (cheap guard) teach the drive-sync importer to skip `appProperties.crcBackup`.
4. **Pointer-on-row (the restore fix):** write `library_index.{backupDriveId}` at mirror time so restore keys on a recorded pointer, not on `fileId==Drive id`.
5. **Metadata snapshot:** write `metadata/library-snapshot-<YYYY-MM-DD>.json` ( `library_index`+`setlists`+`songs`+`tracks`) into the Drive folder (self-contained, human-visible).
6. **Observability:** `config/storageBackup` pointer + dated `storageBackups/{date}` `{scanned,mirrored,skipped,failed,bytesMirrored,lastError}` + Sentry on failure + a **staleness alarm** (extend admin-consistency/PGR-03: alert if no successful run in 36h — the fix for the silent 3-month death).
7. **Restore path (Phase 3, can be same lane or a follow-up):** a `restore_library` MCP tool (or a `reconcile_library` "follow `backupDriveId`" mode) that, after a metadata import, rehydrates bytes via `healChartBytes` (reuse the atomic read-verify + compensating-delete + signals + re-enrich primitive; NEVER mint new fileIds — bonds live in `setlists.fileIds[]`/`tracks.fileId`). Run one restore drill (delete a test object → restore → byte-identical verify).

## Gates
Emulator tests for the cron mirror logic (absent/match/differ branches, loop-avoidance, md5 base64↔hex, pointer write) + the restore path; `next build` exit 0; check:types; eslint. SHIP-NOTICE → inbox/auditor.md (Tier 2). Cut a FRESH worktree off origin/master at fire time.

## When fired
Lane numbering = lowest-available at fire time (stateless). This file is the prompt; the supervisor sets the coder inbox assignment when Daniel greenlights post-launch.
