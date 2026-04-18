---
phase: 04-setlist-editor
plan: 01
subsystem: ui
tags: [react, dnd-kit, fuse.js, accordion, inline-editing, notifications, firestore]

# Dependency graph
requires:
  - phase: 01-monitor-research-code-audit
    provides: setlist-store.ts marked for removal, code audit findings
provides:
  - Inline accordion editing for song and flow item rows
  - Search-first overlay for adding/replacing songs via Fuse.js
  - Auto-publish on save (no PublishDialog in routine flow)
  - Track change notifications with 5-minute throttle
  - Legacy setlist-store.ts removed
affects: [04-setlist-editor, 05-scheduling]

# Tech tracking
tech-stack:
  added: []
  patterns: [accordion-expand with expandedTrackId state, search overlay with Fuse.js]

key-files:
  created:
    - src/components/setlist/v2/InlineFields.tsx
    - src/components/setlist/v2/SearchOverlay.tsx
    - src/components/setlist/__tests__/inline-editing.test.tsx
    - src/components/setlist/__tests__/flow-item-editing.test.tsx
  modified:
    - src/components/setlist/v2/SongRow.tsx
    - src/components/setlist/v2/FlowRow.tsx
    - src/components/setlist/v2/SetlistEditorV2.tsx
    - src/hooks/use-setlist-logic.ts
    - src/components/library/LibraryFileRow.tsx
    - src/components/library/SongChartsLibrary.tsx

key-decisions:
  - "scrollIntoView uses optional chaining for jsdom test compatibility"
  - "Library batch-add removed along with setlist-store; editor search overlay is the primary add path"
  - "Notifications throttled to 5 minutes per setlist to avoid spam during bulk editing"

patterns-established:
  - "Accordion expand: single expandedTrackId state, collapse on drag-start, toggle on tap"
  - "Search overlay: full-screen Fuse.js search with replace mode via replacingTrackId prop"

requirements-completed: [EDIT-03, EDIT-04, EDIT-05, EDIT-06, EDIT-07, EDIT-08]

# Metrics
duration: 7min
completed: 2026-03-08
---

# Phase 4 Plan 01: Inline Editor Summary

**Inline accordion editing with search-first song adding, auto-publish on save, and track change notifications**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-08T03:55:30Z
- **Completed:** 2026-03-08T04:02:18Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Tap-to-expand inline editing for songs (key, tempo, lead, notes) and flow items (title, description, performer, minutes)
- Search-first overlay with Fuse.js replacing AddSongsModal as primary song-adding path
- Replace flow: expand song -> Replace button -> search overlay -> select new song
- Auto-publish: PublishDialog removed from routine editor, setlists always visible to musicians
- Track add/remove triggers throttled notifications to assigned musicians
- Legacy setlist-store.ts deleted with all imports cleaned up

## Task Commits

Each task was committed atomically:

1. **Task 1: Inline accordion editing for SongRow, FlowRow, and SearchOverlay** - `248080c` (feat)
2. **Task 2: Auto-publish, legacy cleanup, and change notifications** - `753a04d` (feat)

## Files Created/Modified
- `src/components/setlist/v2/InlineFields.tsx` - SongInlineFields and FlowInlineFields shared components
- `src/components/setlist/v2/SearchOverlay.tsx` - Full-screen Fuse.js search for adding/replacing songs
- `src/components/setlist/v2/SongRow.tsx` - Added isExpanded prop and accordion expand with inline fields
- `src/components/setlist/v2/FlowRow.tsx` - Added isExpanded prop and accordion expand for non-song items
- `src/components/setlist/v2/SetlistEditorV2.tsx` - Wired expandedTrackId state, search overlay, removed setlist-store and PublishDialog
- `src/hooks/use-setlist-logic.ts` - Added track count change detection and notification throttling
- `src/components/library/LibraryFileRow.tsx` - Removed setlist-store import and "Add to Setlist" context menu
- `src/components/library/SongChartsLibrary.tsx` - Removed setlist-store import, updated batch-add flow
- `src/components/setlist/__tests__/inline-editing.test.tsx` - 9 tests for SongRow accordion editing
- `src/components/setlist/__tests__/flow-item-editing.test.tsx` - 10 tests for FlowRow accordion editing
- `src/lib/setlist-store.ts` - DELETED (legacy staging buffer)

## Decisions Made
- Used optional chaining on scrollIntoView for jsdom compatibility in tests
- Removed library "Add to Setlist" context menu entirely (editor search overlay replaces it)
- Notification detection uses track count comparison (not deep diff) for simplicity
- Kept AddSongsModal import as fallback but primary flow uses SearchOverlay

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] scrollIntoView not a function in jsdom**
- **Found during:** Task 1 (test execution)
- **Issue:** jsdom doesn't implement scrollIntoView, causing test failure
- **Fix:** Changed `scrollIntoView({...})` to `scrollIntoView?.({...})` with optional chaining
- **Files modified:** src/components/setlist/v2/InlineFields.tsx
- **Verification:** All 19 tests pass
- **Committed in:** 248080c (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor test compatibility fix. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Inline editing foundation ready for Phase 4 Plans 02 (templates) and 03 (duplicate workflow)
- SearchOverlay ready to be reused for template auto-fill song matching
- Notification infrastructure ready for scheduling notifications in Phase 5

---
*Phase: 04-setlist-editor*
*Completed: 2026-03-08*
