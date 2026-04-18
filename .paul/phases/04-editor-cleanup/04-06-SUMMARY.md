---
phase: 04-editor-cleanup
plan: 06
subsystem: ui
tags: [setlist-editor, swap-picker, accessibility]

requires: []
provides:
  - Move-Up + Move-Down buttons inside expanded inline panel for songs and flow rows
  - SwapPicker max-h bumped to 85vh on tablet+
affects: Future drag-and-drop replacements; future swap-picker layout work

key-files:
  modified:
    - src/components/setlist/v2/InlineFields.tsx
    - src/components/setlist/v2/SongRow.tsx
    - src/components/setlist/v2/FlowRow.tsx
    - src/components/setlist/v2/SetlistEditorV2.tsx
    - src/components/performance/SwapPicker.tsx

key-decisions:
  - "Move buttons live inside the expanded inline panel — keeps collapsed row clean while giving desktop users a non-drag option"
  - "Editor pre-computes prev/next neighbour ids per row; row components stay agnostic of the full tracks array"
  - "Tablet height bump uses md:max-h-[85vh] — phone height unchanged"

duration: ~15min
started: 2026-04-14T09:30:00Z
completed: 2026-04-14T09:38:00Z
---

# Phase 04 Plan 06: Track-Row Move Buttons + SwapPicker Tablet Height Summary

**Move-Up + Move-Down icon buttons added inside the expanded inline panel for both song and flow rows; SwapPicker bottom-sheet bumped from 70vh to 85vh on tablet+.**

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Move-Up/Down inside expanded panel | Pass | Both row types render the buttons next to Delete; first row disables Move-Up; last disables Move-Down; both call existing moveTrack hook. |
| AC-2: SwapPicker md:max-h-[85vh] | Pass | Phone unchanged at 70vh; tablet+ now 85vh. |

## Files Modified

| File | Change |
|------|--------|
| `src/components/setlist/v2/InlineFields.tsx` | Added onMoveUp/onMoveDown/canMove* props + ChevronUp/ChevronDown buttons in both Song + Flow inline fields |
| `src/components/setlist/v2/SongRow.tsx` | Forwards new props to SongInlineFields |
| `src/components/setlist/v2/FlowRow.tsx` | Forwards new props to FlowInlineFields |
| `src/components/setlist/v2/SetlistEditorV2.tsx` | Pre-computes neighbour ids in renderTrack; passes onMove*/canMove* per row |
| `src/components/performance/SwapPicker.tsx` | max-h-[70vh] → max-h-[70vh] md:max-h-[85vh] |

## Deviations

**Total impact:** None — plan executed as written.

Skipped the human-verify checkpoint per the user's "do it all" instruction; checkpoint will be folded into the milestone-end audit.

## Next Phase Readiness

**Ready:** 04-07 (triple-modal chain consolidation — last big remaining Phase 4 item) or audit pass.

**Deferred:**
- Multi-row keyboard reorder (Cmd+Up/Down)
- Move-up/down for header rows (DividerRow)

---
*Phase: 04-editor-cleanup, Plan: 06 · Completed: 2026-04-14*
