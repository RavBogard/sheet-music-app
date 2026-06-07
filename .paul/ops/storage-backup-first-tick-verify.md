# storage-backup — first-tick verification (2026-05-28 ~05:00Z)

**Context.** Storage-phase2 shipped silently in `5c0674ab9a` (2026-05-27, smuggled under
the `archive_nonchart_artifacts` commit subject — see `.coord/shared/decisions.md` 2026-05-27T~22:50Z
+ `[[feedback_supervisor_verify_commit_diff_not_subject]]`). The cron has been dormant-but-armed since
that commit; Vercel env `CRC_BACKUP_DRIVE_FOLDER_ID=0AGFG2GQLuWKKUk9PVA` was set 2026-05-23. The
**first real mirror tick fires tomorrow 2026-05-28 at 05:00 UTC (Wed 2026-05-28 00:00 CDT).**

This is the verification checklist for the first tick. Walk it after the tick fires (~05:05Z onward).

## What "healthy first tick" looks like

The cron should: enumerate `library_index` where `status=='active'`, list the Shared Drive
`0AGFG2GQLuWKKUk9PVA`, md5-compare every row, create-on-absent (no real rows mirrored before this
tick → expect ALL active rows to be `mirrored`, none `skipped`, none `differ-updated`, zero failed).
Per `src/lib/storage-backup/mirror.ts` + `src/lib/storage-backup/health.ts` on master.

## Checks (run in order)

### 1. Sentry quiet
- Sentry project: same one in prod (`NEXT_PUBLIC_SENTRY_DSN`).
- Expected: **no new errors** tagged `storage-backup` / `cron/storage-backup` between 04:58Z and 05:15Z.
- If errors: capture stack + tag + breadcrumbs → BLOCKER, don't troubleshoot tomorrow's tick alone.

### 2. `config/storageBackup` pointer advanced
- Firestore doc `config/storageBackup` should have `lastSuccessAt` ≈ 05:00Z (after the tick).
- Compare to its value before 05:00Z (read it now and stash for diff).
- If pointer DIDN'T advance but Sentry is quiet: cron route didn't fire OR fired but no-op'd
  (check the dormant-heartbeat path; env var presence; `vercel logs` for the storage-backup
  cron handler).

### 3. `storageBackups/{2026-05-28}` row written
- Firestore doc `storageBackups/2026-05-28` exists, contains:
  - `scanned: <N>` = count of active `library_index` rows (cross-check via
    `list_library` MCP tool, NOT a Firestore raw count — the count must match what the
    mirror actually walks).
  - `mirrored: <M>` where M ≈ N (first run; everything is "absent").
  - `skipped: 0`, `differ-updated: 0`, `failed: 0`.
  - `bytesMirrored: <reasonable total>` (back-of-envelope: ~625 active rows × ~500KB avg
    PDF/MusicXML ≈ 300MB; flag if grossly off).
  - `lastError: null`.
  - `lastTickStartedAt` breadcrumb present (per the breadcrumb hardening on master).

### 4. Real files in the Shared Drive `0AGFG2GQLuWKKUk9PVA`
- List the Drive folder via `firebase_read_resources` or the prod SA list call:
  ```
  curl -H "Authorization: Bearer <oauth>" \
    "https://www.googleapis.com/drive/v3/files?q='0AGFG2GQLuWKKUk9PVA'+in+parents&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,name,mimeType,md5Checksum,size,appProperties)&pageSize=10"
  ```
  (or any equivalent SA-authed call).
- Expected: `<M>` files (matches `storageBackups/{date}.mirrored`), every file has:
  - `appProperties.crcBackup: "1"` (loop-avoidance stamp — the drive-sync importer must
    skip these per master).
  - `name` follows `<stem>__<fileId>.<ext>` convention.
  - `mimeType` matches the source Storage object's mime (PDFs as `application/pdf` etc).
- **Spot-check md5 round-trip**: pick 1 file, fetch its Drive `md5Checksum` (hex) and compare
  to the Firebase Storage source's `md5Hash` (base64) — they should match after base64→hex conversion.

### 5. `library_index` rows now carry `backupDriveId`
- Pick 3 random active rows (use `list_library` MCP to grab some fileIds) and confirm
  each row's `backupDriveId` field is now populated (the pointer-on-row from
  `STORAGE-BACKUP-SYNTHESIS.md Layer 2 §pointer-on-row`).
- This is the restore-path key; if `backupDriveId` is missing, restore is broken.

### 6. Loop-avoidance verified
- Trigger the drive-sync poller (or wait for its next tick) and confirm: NONE of the new
  Drive backup files show up in `drive-sync` import attempts. The `appProperties.crcBackup`
  + dedicated folder should both be guards. If the importer picks them up, that's a
  catastrophic loop — STOP and revert (set Vercel env `CRC_BACKUP_DRIVE_FOLDER_ID=`
  to disable the cron).

## If anything fails

- **Sentry errors:** BLOCKER → supervisor inbox, do NOT let the 2026-05-29 tick fire
  (Vercel env temporary-unset is the killswitch: `vercel env rm CRC_BACKUP_DRIVE_FOLDER_ID production`).
- **Pointer didn't advance:** check `vercel logs --since 6h | grep storage-backup` for
  the route invocation; if no log entry, the cron schedule didn't fire (vercel.json drift
  or deploy issue); if logged but failed, see Sentry.
- **Files don't match scan count:** partial run — health.ts will mark it `startedButNotFinished`;
  next 36h-staleness alarm catches it. Note in inbox; don't immediately re-trigger.
- **Loop suspected (drive-sync importing backup files):** kill the cron immediately;
  revert the loop-avoidance guard hypothesis; re-evaluate `appProperties.crcBackup`
  filter in drive-sync importer.

## When clean

Update `shared/decisions.md` 2026-05-28 with: "first storage-backup tick fired clean — N
rows mirrored, M bytes, backupDriveId populated on samples, loop-avoidance verified."

Then this checklist is done; subsequent ticks are routine (the 36h staleness alarm in
health.ts handles silent-death; manual checks only if something else surfaces).
