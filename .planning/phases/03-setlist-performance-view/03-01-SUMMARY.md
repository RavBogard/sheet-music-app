---
phase: 03-setlist-performance-view
plan: 01
subsystem: ui
tags: [react, tailwind, firestore, transposition, wake-lock, performance-view]

# Dependency graph
requires:
  - phase: 01-monitor-research-code-audit
    provides: "Music math utilities (getTransposedKeyName), musician profile, Firestore sync hooks"
provides:
  - "SetlistRow dense row component with transposed keys, position highlighting, note toggle"
  - "SetlistView flat scrollable list component"
  - "useSetlistPerformance orchestration hook (Firestore, wake lock, leader controls)"
  - "Redesigned /perform/setlist/[id] page with activeSongIndex hook point for PDF overlay"
affects: [03-02-pdf-overlay, 03-03-public-access]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dense row layout: title + key badge + tempo + lead inline, no tapping required"
    - "Header tracks as inline dividers (horizontal rule with label), not collapsible sections"
    - "Notes hidden until tapped for clean rows"
    - "Leader tap-to-set position via updateLiveTrack Firestore write"

key-files:
  created:
    - src/components/performance/SetlistRow.tsx
    - src/components/performance/SetlistView.tsx
    - src/hooks/use-setlist-performance.ts
    - src/components/performance/__tests__/setlist-view.test.tsx
  modified:
    - src/app/perform/setlist/[id]/page.tsx

key-decisions:
  - "Transposed key shows just the note name (e.g. Bb) not the semitone offset -- offset is noise during performance"
  - "Header tracks render as inline dividers (hr with label), not sticky section headers"
  - "Leader advances position by tapping any row (tap-to-set pattern)"
  - "activeSongIndex state added as hook point for Plan 02 PDF overlay"

patterns-established:
  - "useSetlistPerformance hook: single orchestration point for setlist state, position, transposition, wake lock"
  - "SetlistView + SetlistRow: composable performance UI with per-row transposition"

requirements-completed: [SET-01, SET-02, SET-03, SET-06, SET-07]

# Metrics
duration: 4min
completed: 2026-03-08
---

# Phase 3 Plan 1: Setlist Performance View Summary

**Dense scannable setlist with auto-transposed keys, leader-driven position highlighting, wake lock, and note toggle -- replacing section-based layout with flat scrollable list**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-08T03:01:12Z
- **Completed:** 2026-03-08T03:04:58Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Dense row layout showing title, transposed key, tempo, and lead musician without tapping
- Non-song liturgical items (prayers, readings, transitions) render with quieter styling inline
- Current position row highlighted with violet background visible from arm's length
- Wake lock acquired on page mount to keep screen awake during performance
- Notes hidden by default, revealed on tap to keep rows clean
- Page redesigned from section-based collapsible groups to single flat scrollable list

## Task Commits

Each task was committed atomically:

1. **Task 1: Create SetlistRow and useSetlistPerformance** - `02aadaa` (feat)
2. **Task 2 RED: Failing tests for SetlistView** - `2fcc7ee` (test)
3. **Task 2 GREEN: SetlistView + page redesign** - `4ddad43` (feat)

## Files Created/Modified
- `src/components/performance/SetlistRow.tsx` - Dense row component with transposed key, position highlight, note toggle
- `src/components/performance/SetlistView.tsx` - Flat scrollable list rendering SetlistRow components
- `src/hooks/use-setlist-performance.ts` - Orchestration hook: Firestore sync, wake lock, leader controls, transposition
- `src/app/perform/setlist/[id]/page.tsx` - Redesigned performance page using hook + view composition
- `src/components/performance/__tests__/setlist-view.test.tsx` - 5 tests covering rendering, highlighting, transposition, notes

## Decisions Made
- Transposed key displays just the note name (e.g., "Bb") without semitone offset -- cleaner for at-a-glance scanning during performance
- Header-type tracks render as inline dividers with horizontal rules, preserving semantic grouping without collapsible sections
- Leader position advance uses tap-to-set on any row (calls updateLiveTrack via Firestore)
- Removed: section grouping logic, "Play from start" button, print modal (moved to editor), queue-based navigation
- Added activeSongIndex state as the hook point for Plan 02's PDF overlay

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- SetlistView and page ready for Plan 02 PDF overlay integration (activeSongIndex state in place)
- SetlistRow accepts isPublicView prop ready for Plan 03 public access
- All 564 tests passing (5 new + 559 existing)

---
*Phase: 03-setlist-performance-view*
*Completed: 2026-03-08*
