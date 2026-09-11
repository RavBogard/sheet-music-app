# Chart Inbox

How anyone on the music team adds chart files to the library, from any device,
through their own Claude — without Claude ever carrying the file.

---

## For users

**Where the files go:** the shared Google Drive folder **CRC Chart Inbox**.
Ask Claude "where do I put charts?" and it gives you the link (or find it under
Shared drives → CentralReform.live Backup → CRC Chart Inbox).

**What you do:**

1. Put the chart file(s) in that folder. Any way you like: the Drive app on
   your phone (share sheet → Drive), drag-and-drop in a browser, Drive for
   Desktop. PDF, MusicXML, images, and text charts all work; anything else is
   skipped.
2. Tell Claude: *"I dropped two charts in the inbox, bring them in."*
3. Claude imports them on the spot and tells you what landed. If you say
   nothing, they come in on their own within 5 minutes.

Then keep talking to Claude: *"bond the new Mi Chamocha to row 14 of Saturday's
setlist"* works the moment the import finishes.

**Who can:** anyone Daniel has shared the folder with (music directors and
admins). Ask Claude to import, and it will if your account may upload charts.

**Rename or replace a file in the folder** and the library row follows: same
name with new bytes = new version; new name with the same bytes = rename.
Deleting a file from the folder does NOT delete the library row.

**Duplicates:** a file that looks like a chart already in the library is held
back rather than imported twice; Claude tells you and you decide.

---

## What Claude does

| You say | Claude calls |
| --- | --- |
| "where do I put chart files?" / "did my chart come in?" | `get_chart_inbox` → folder link, watcher health, recent imports |
| "I dropped them, import now" | `sync_chart_inbox` → imports up to 8 files per call, reports counts; calls again if `capReached` |
| "import this Drive folder <link>" | `import_drive_folder` (any folder you own, one-off) |

The tool descriptions teach this flow, so a fresh conversation in any Claude
client (claude.ai, Claude Desktop, mobile) already knows it.

---

## Behind the scenes

- **Folder:** `1ZNdvVKeFa7jjP_iLYBv5vXaB7DyA3tTB`, created 2026-09-11 on the
  Workspace shared drive *CentralReform.live Backup* (drive `0AGFG2GQLuWKKUk9PVA`),
  a sibling of the `charts/` backup mirror, never inside it. The service
  account `music-app-reader@crcmusicbooks.iam.gserviceaccount.com` is a
  fileOrganizer on the drive, so it reads the inbox without any per-user
  sharing. Files uploaded to a shared drive are owned by the organisation, not
  the uploader.
- **Env:** `CHART_INBOX_DRIVE_FOLDER_ID` (Vercel production). Falls back to the
  legacy `DAVID_DRIVE_DROP_FOLDER_ID`, which was `""` in production — the reason
  the watcher had been dormant since it shipped.
- **Watcher:** `/api/cron/drive-sync` every 5 min (`vercel.json`), implemented
  in `src/lib/drive-sync/poller.ts`. Cursor = `driveWatchState/{folderId}.lastPollAt`;
  first tick sets the cursor to *now* and imports nothing historical. Direct
  subfolders are watched too; each maps to a collection (`collectionMap`,
  default `supplemental`). Files stamped `appProperties.crcBackup=1` (the
  Storage→Drive mirror's) are skipped, so the two crons cannot loop.
- **On demand:** `sync_chart_inbox` runs the same `runDriveSync` with a cap of
  8 files (MCP wall ≈ 60 s) and returns `capReached`. Gated by upload
  permission (`isUploadAllowed`) and the `upload` rate-limit tier; admins and
  band leaders bypass the limit.
- **Import pipeline:** `processChartUpload` — the same path as every other
  upload: atomic guard, 0.85 strict dedupe, text extraction, `library_index`
  + `songs` rows, `library_signals` broadcast. Provenance lands on the row as
  `driveFileId`, `driveMd5`, `driveModifiedTime`, `driveParents`;
  `uploadedBy` is `cron:drive-sync`.
- **Tenancy:** the inbox belongs to the primary org (`crc`). Another tenant's
  bearer gets `chart_inbox_not_configured` instead of someone else's folder.
  A per-org folder map is the obvious next step when Brothers Lazaroff needs one.

### Adding a music director

Share the folder with their Google account as **Editor** (Drive UI, or
`permissions.create` with `supportsAllDrives: true`). Their app account must
also be allowed to upload (admin / band_leader / musician role, or `canUpload`).

### Cleaning up a test file

`delete_chart` removes the library row only. To remove the Drive file the
service account must **trash** it (`files.update {trashed:true}`,
`supportsAllDrives:true`) — a fileOrganizer on a shared drive cannot
hard-delete, and Drive answers that attempt with a misleading 404.
Verified end to end 2026-09-11: drop → `sync_chart_inbox` → row in 5 s →
`delete_chart` → trash.

### Health check

`get_chart_inbox` shows `lastTickAt`, `lastError`, `consecutiveFailures`. If
`watching` is false the cron has never ticked against this folder: check the
env var is set on the deployment that is live, then wait one interval.

---

## Why this shape

A remote server can never reach a user's disk, and a chat attachment cannot be
handed to an MCP tool as bytes. The in-chat drop-zone iframe (2026-09-10) tried
to bridge that with a browser panel and failed on both counts users care about:
it needed the user's hands, and it did not render in their client. A Drive
folder is the one place every user already has on every device, and the server
already had a watcher for it — it had simply never been pointed at a folder.

Charts Claude *authors* (rather than files someone has) are a separate lane:
`save_scraped_chart` stores a text chord chart today; a server-rendered
house-style PDF from structured chart data is the follow-up that would let any
Claude client draw a chart straight into the library.
