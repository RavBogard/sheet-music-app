---
phase: 05-backend-hardening-library
plan: 02
subsystem: ui, api
tags: [zustand, fuse.js, firestore, upload, permissions]

# Dependency graph
requires:
  - phase: 04-setlist-editor
    provides: Library store integration (AddSongsModal, MatchFileModal use useLibraryStore)
provides:
  - Flat list library UI with Fuse.js search (no folder navigation)
  - Per-user canUpload flag on UserProfile for upload permission
  - Admin API to toggle canUpload per user and migrate existing users
affects: [05-backend-hardening-library, admin-ui]

# Tech tracking
tech-stack:
  added: []
  patterns: [per-user boolean flags for permissions instead of role-based checks]

key-files:
  created:
    - src/app/api/admin/set-upload-permission/route.ts
  modified:
    - src/lib/library-store.ts
    - src/components/library/SongChartsLibrary.tsx
    - src/app/api/library/upload/route.ts
    - src/types/models.ts
    - src/components/setlist/modals/MatchFileModal.tsx
    - src/components/setlist/modals/AddSongsModal.tsx
    - src/components/setlist/ChatPanel.tsx

key-decisions:
  - "canUpload is a boolean field on UserProfile, not a role -- granular per-user permission"
  - "Folders filtered out at hydration time in library store, not at render time"

patterns-established:
  - "Per-user permission flags: boolean fields on Firestore user doc checked at API and UI level"
  - "Flat list pattern: store filters folders at hydration, UI never sees folder items"

requirements-completed: [LIB-01, LIB-04]

# Metrics
duration: 5min
completed: 2026-03-08
---

# Phase 5 Plan 2: Library Flat List & Upload Permissions Summary

**Flat list library with Fuse.js search replacing folder navigation, plus per-user canUpload flag replacing role-based upload permission**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-08T04:46:18Z
- **Completed:** 2026-03-08T04:51:24Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Simplified library to flat alphabetical list with Fuse.js search -- removed all folder navigation, breadcrumbs, and folder-first sorting
- Switched upload permission from role-based (band_leader) to per-user canUpload boolean flag
- Created admin endpoint for toggling upload permission and batch-migrating existing admins/band_leaders
- Updated all consumers of library store (AddSongsModal, MatchFileModal, ChatPanel) to use simplified API

## Task Commits

Each task was committed atomically:

1. **Task 1: Simplify library store and UI to flat list with search** - `d51b1c4` (feat)
2. **Task 2: Switch upload permission to canUpload flag with migration** - `a69ee76` (feat)

## Files Created/Modified
- `src/lib/library-store.ts` - Simplified Zustand store: removed folder state, sortFoldersFirst, reset; single-arg setFilter
- `src/components/library/SongChartsLibrary.tsx` - Flat list UI: removed breadcrumbs, folder navigation, updated empty states
- `src/app/api/library/upload/route.ts` - Upload route: checks canUpload flag instead of band_leader role
- `src/app/api/admin/set-upload-permission/route.ts` - New admin API: toggle canUpload per user, batch migration
- `src/types/models.ts` - Added canUpload optional boolean to UserProfile interface
- `src/components/setlist/modals/MatchFileModal.tsx` - Removed folder navigation, updated setFilter call
- `src/components/setlist/modals/AddSongsModal.tsx` - Removed folder navigation, updated setFilter call
- `src/components/setlist/ChatPanel.tsx` - Updated setFilter call to single-argument

## Decisions Made
- canUpload is a per-user boolean on the Firestore user doc, not tied to role hierarchy. This allows granting upload to any user regardless of role.
- Folders are filtered out at hydration time in the store (not at render time), keeping the store's allFiles array clean of folder entries.
- Removed breadcrumb and folder navigation from MatchFileModal and AddSongsModal since the library is now flat.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated setFilter callers in MatchFileModal, AddSongsModal, ChatPanel**
- **Found during:** Task 1 (library store simplification)
- **Issue:** Three other files called setFilter with the old 2-argument signature (folderId, query), which would cause TypeScript errors after the store change
- **Fix:** Updated all callers to use single-argument setFilter(query). Also removed folder navigation UI from both modals since it's no longer meaningful.
- **Files modified:** src/components/setlist/modals/MatchFileModal.tsx, src/components/setlist/modals/AddSongsModal.tsx, src/components/setlist/ChatPanel.tsx
- **Verification:** npx tsc --noEmit passes (only pre-existing errors remain)
- **Committed in:** d51b1c4 (Task 1 commit)

**2. [Rule 3 - Blocking] Added canUpload field to UserProfile type**
- **Found during:** Task 1 (upload button visibility check)
- **Issue:** profile?.canUpload would be a TypeScript error without the field on the UserProfile interface
- **Fix:** Added `canUpload?: boolean` to UserProfile in src/types/models.ts
- **Files modified:** src/types/models.ts
- **Verification:** npx tsc --noEmit passes
- **Committed in:** d51b1c4 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both auto-fixes necessary for TypeScript compilation. No scope creep.

## Issues Encountered
None

## User Setup Required
After deploying, run the migration to grant upload permission to existing admins and band leaders:
```bash
curl -X POST https://centralreform.live/api/admin/set-upload-permission \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"migrate": true}'
```

## Next Phase Readiness
- Library UI is flat and searchable, ready for any further refinements
- Upload permission model is in place, ready for PeopleSection toggle integration (plan 05-03)
- canUpload migration endpoint ready to run after deployment

---
*Phase: 05-backend-hardening-library*
*Completed: 2026-03-08*
