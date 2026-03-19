---
phase: 20-add-song-to-existing-setlist-from-library-view
plan: 02
subsystem: ui
tags: [react, hooks, context-menu, bottom-sheet, library, setlist-editor]

# Dependency graph
requires:
  - phase: 20-add-song-to-existing-setlist-from-library-view
    provides: "useAddToSetlist hook and AddToSetlistSheet component"
provides:
  - "Complete Add to Setlist flow wired into all entry points: context menu, batch selection, library search, setlist editor search"
affects: [20-add-song-to-existing-setlist-from-library-view]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Multi-entry-point callback wiring: single hook consumed by 4 different UI surfaces"
    - "Conditional rendering based on canAddToSetlist for role-gated UI"

key-files:
  created: []
  modified:
    - src/components/library/SongChartsLibrary.tsx
    - src/components/library/LibraryFileRow.tsx
    - src/components/library/SelectionActionBar.tsx
    - src/components/library/ContentSearchResults.tsx
    - src/components/setlist/v2/SearchOverlay.tsx
    - src/components/setlist/v2/SetlistEditorV2.tsx
    - src/components/setlist/v2/__tests__/setlist-editor-v2.test.tsx

key-decisions:
  - "Added useAddToSetlist mock to SetlistEditorV2 tests to prevent hook subscription failures in test environment"

patterns-established:
  - "Role-gated action buttons: pass canAddToSetlist + onAddToSetlist as optional prop pair, render only when both present"

requirements-completed: [P20-01, P20-02, P20-08]

# Metrics
duration: 10min
completed: 2026-03-19
---

# Phase 20 Plan 02: Add-to-Setlist Entry Point Wiring Summary

**Wired useAddToSetlist hook and AddToSetlistSheet into all 4 entry points: LibraryFileRow context menu, SelectionActionBar batch button, ContentSearchResults, and SearchOverlay with role-gating for admins/band leaders**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-19T00:35:32Z
- **Completed:** 2026-03-19T00:45:07Z
- **Tasks:** 3/3 complete (2 auto + 1 checkpoint:human-verify approved)
- **Files modified:** 7

## Accomplishments
- LibraryFileRow context menu shows "Add to Setlist..." as the FIRST item for admins/band leaders on chart files (hidden for folders, audio, musicians)
- SelectionActionBar batch "Add to Setlist" button now opens the bottom sheet picker instead of showing a placeholder toast
- ContentSearchResults shows "Add to Setlist..." button per result row for authorized users
- SearchOverlay in SetlistEditorV2 shows "Add to Setlist..." button per result row, wired to a separate AddToSetlistSheet instance
- SongChartsLibrary orchestrates the hook, renders AddToSetlistSheet, and passes callbacks to all children

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire hook into SongChartsLibrary and modify LibraryFileRow + SelectionActionBar** - `b70a41a` (feat)
2. **Task 2: Add "Add to Setlist" action to ContentSearchResults and SearchOverlay** - `aa29157` (feat)
3. **Task 3: Verify complete Add to Setlist flow end-to-end** - checkpoint:human-verify approved

## Files Created/Modified
- `src/components/library/SongChartsLibrary.tsx` - Orchestrates useAddToSetlist hook, renders AddToSetlistSheet, passes callbacks to LibraryFileRow/SelectionActionBar/ContentSearchResults
- `src/components/library/LibraryFileRow.tsx` - Added canAddToSetlist/onAddToSetlist props, "Add to Setlist..." as first context menu item with ListPlus icon
- `src/components/library/SelectionActionBar.tsx` - Added onAddToSetlist prop, conditional batch button that opens sheet
- `src/components/library/ContentSearchResults.tsx` - Added canAddToSetlist/onAddToSetlist props, "Add to Setlist..." button per search result row
- `src/components/setlist/v2/SearchOverlay.tsx` - Added canAddToSetlist/onAddToSetlist props, "Add to Setlist..." button per result row
- `src/components/setlist/v2/SetlistEditorV2.tsx` - Imported and wired useAddToSetlist hook, renders AddToSetlistSheet, passes props to SearchOverlay
- `src/components/setlist/v2/__tests__/setlist-editor-v2.test.tsx` - Added mocks for useAddToSetlist and AddToSetlistSheet

## Decisions Made
- Added useAddToSetlist and AddToSetlistSheet mocks to SetlistEditorV2 test file since the hook calls createSetlistService internally and subscribes to Firestore, which fails without proper mocking

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added test mocks for useAddToSetlist in SetlistEditorV2 tests**
- **Found during:** Task 2 (SearchOverlay + SetlistEditorV2 wiring)
- **Issue:** SetlistEditorV2 tests failed because useAddToSetlist hook was called without mocked dependencies (createSetlistService, subscribeToPersonalSetlists, etc.)
- **Fix:** Added vi.mock for @/hooks/use-add-to-setlist and @/components/library/AddToSetlistSheet in the test file
- **Files modified:** src/components/setlist/v2/__tests__/setlist-editor-v2.test.tsx
- **Verification:** All 17 SetlistEditorV2 tests pass
- **Committed in:** aa29157 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential fix for test stability. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviation above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All entry points wired and functional
- Task 3 human verification checkpoint approved by user
- Phase 20 is fully complete (both plans done)
- No blockers

## Self-Check: PASSED
- Commit b70a41a: FOUND
- Commit aa29157: FOUND
- All 7 modified files exist on disk

---
*Phase: 20-add-song-to-existing-setlist-from-library-view*
*Completed: 2026-03-19*
