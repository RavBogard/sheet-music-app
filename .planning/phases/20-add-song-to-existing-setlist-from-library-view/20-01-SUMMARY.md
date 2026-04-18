---
phase: 20-add-song-to-existing-setlist-from-library-view
plan: 01
subsystem: ui
tags: [react, hooks, shadcn, bottom-sheet, sonner, firestore, zustand]

# Dependency graph
requires: []
provides:
  - "useAddToSetlist hook with permission gating, setlist merge, add-to-setlist mutation, toast with undo"
  - "AddToSetlistSheet bottom sheet component with search, loading, empty states"
affects: [20-add-song-to-existing-setlist-from-library-view]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared state hook for multi-entry-point feature (useAddToSetlist)"
    - "Undo by ID removal (not snapshot restore) for concurrent-edit safety"
    - "Separate subscription state for personal/public to avoid overwrite"

key-files:
  created:
    - src/hooks/use-add-to-setlist.ts
    - src/components/library/AddToSetlistSheet.tsx
    - src/hooks/__tests__/use-add-to-setlist.test.ts
    - src/components/library/__tests__/add-to-setlist-sheet.test.tsx
  modified: []

key-decisions:
  - "Used case-insensitive substring match for search instead of fuse.js (simpler, sufficient for small setlist lists)"
  - "Undo re-reads current tracks via subscribeToSetlist and filters by added IDs (concurrent-edit safe)"
  - "Separate personalLoaded/publicLoaded state flags for accurate loading indicator"

patterns-established:
  - "useAddToSetlist pattern: shared hook consumed by multiple UI entry points"
  - "AddToSetlistSheet: props-driven component, decoupled from hook for testability"

requirements-completed: [P20-01, P20-02, P20-03, P20-04, P20-05, P20-06, P20-07]

# Metrics
duration: 7min
completed: 2026-03-19
---

# Phase 20 Plan 01: Add-to-Setlist Core Summary

**useAddToSetlist hook with permission gating, setlist merge/dedup/sort, Firestore mutation with toast+undo, and Spotify-like AddToSetlistSheet bottom sheet component**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-19T00:25:53Z
- **Completed:** 2026-03-19T00:32:53Z
- **Tasks:** 2
- **Files created:** 4

## Accomplishments
- useAddToSetlist hook with full state management: permission gating, sheet open/close, setlist fetching via dual subscriptions, track creation matching addSongsFromLibrary format, duplicate detection, batch toast, undo by ID removal
- AddToSetlistSheet bottom sheet component with search bar, setlist list with name/date/count, loading skeletons, empty/no-results states, dark-first styling
- 26 tests covering all hook and component behaviors

## Task Commits

Each task was committed atomically (TDD: RED then GREEN):

1. **Task 1 RED: Hook tests** - `fcf864f` (test)
2. **Task 1 GREEN: Hook implementation** - `be89b4e` (feat)
3. **Task 2 RED: Component tests** - `cf65dd4` (test)
4. **Task 2 GREEN: Component implementation** - `33c1759` (feat)

## Files Created/Modified
- `src/hooks/use-add-to-setlist.ts` - Shared state hook for add-to-setlist flow (permission gating, setlist fetch, mutation, toast/undo)
- `src/components/library/AddToSetlistSheet.tsx` - Bottom sheet setlist picker component (search, list, loading/empty states)
- `src/hooks/__tests__/use-add-to-setlist.test.ts` - 15 unit tests for hook logic
- `src/components/library/__tests__/add-to-setlist-sheet.test.tsx` - 11 unit tests for component rendering

## Decisions Made
- Used case-insensitive substring match for setlist search instead of fuse.js -- the setlist list is small enough that fuzzy search adds complexity without benefit
- Undo re-reads current tracks via subscribeToSetlist then filters out added track IDs, rather than snapshot restore -- this handles concurrent edits safely (per RESEARCH.md pitfall 1)
- Separate personalLoaded/publicLoaded boolean flags rather than a single counter -- explicit and clear for the dual-subscription loading state
- Deferred unsub call via queueMicrotask when subscribeToSetlist fires synchronously -- prevents "used before initialization" in the undo closure

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed synchronous subscription callback in undo**
- **Found during:** Task 1 (hook implementation)
- **Issue:** subscribeToSetlist fires callback synchronously in test mocks, causing "Cannot access 'unsub' before initialization"
- **Fix:** Used let + queueMicrotask pattern to defer unsub when callback fires before assignment
- **Files modified:** src/hooks/use-add-to-setlist.ts
- **Verification:** All 15 hook tests pass including undo test
- **Committed in:** be89b4e (Task 1 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential fix for undo functionality. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviation above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Hook and component are self-contained and ready for Plan 02 integration
- Plan 02 will wire useAddToSetlist into LibraryFileRow context menu, SelectionActionBar, and ContentSearchResults
- No blockers

---
*Phase: 20-add-song-to-existing-setlist-from-library-view*
*Completed: 2026-03-19*
