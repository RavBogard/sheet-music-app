# Summary: 01-01 Library Management

## What Was Done

### Task 1: Rename songs in library
- Added `displayName` field to `DriveFile` interface
- Created `/api/library/rename` PATCH endpoint (auth-gated to band_leader+)
- Updated `LibraryFileRow` to prefer `displayName` over cleaned filename
- Added "Rename" context menu item (admin-only) using `window.prompt`
- Updated `SongChartsLibrary` to wire rename handler with toast feedback
- List API now returns `displayName` when set in Firestore

### Task 2: Unlink chart from setlist track
- Added "Unlink Chart" button in `SongInlineFields` between Replace and Delete
- Button only shows when `track.fileId` is set
- Clears `fileId` and `fileName` while preserving title, key, BPM, notes, lead

### Task 3: Archived songs viewer with restore
- Updated `/api/library/list` to support `?status=archived` query param
- Added archived file metadata (archivedAt, archivedBy) to response when status=archived
- Added expandable "Archived Songs" section to `LibraryDataSection` on manage page
- Shows archived song count, names, and archive date
- Each song has a "Restore" button that calls archive API with `archive: false`
- Restored songs removed from list immediately

## Files Modified
- `src/types/models.ts` — added `displayName` to DriveFile
- `src/app/api/library/rename/route.ts` — **new** rename endpoint
- `src/app/api/library/list/route.ts` — added status filter + displayName in response
- `src/components/library/LibraryFileRow.tsx` — rename context menu + displayName display
- `src/components/library/SongChartsLibrary.tsx` — rename handler wiring
- `src/components/setlist/v2/InlineFields.tsx` — unlink chart button
- `src/components/admin/LibraryDataSection.tsx` — archived songs viewer + restore

## Verification
- [x] npx tsc --noEmit passes
- [x] Rename context menu item added for admin users
- [x] Unlink Chart button clears fileId without deleting track
- [x] Archived songs section renders on manage page
- [x] Restore button calls archive API with archive=false

## Decisions
- Used `window.prompt` for rename (minimal, no new dialog component)
- `displayName` stored in Firestore separately from `name` (Drive filename preserved)
- Archived section lazy-loads on expand (no upfront API call)
