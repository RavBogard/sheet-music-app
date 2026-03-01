---
phase: 01-data-foundation
plan: 02
subsystem: ui
tags: [react, pdf-lib, print, editor, tracksheet, cover-page, content-hash]

# Dependency graph
requires:
  - phase: 01-data-foundation/01
    provides: "tune?: string field on SetlistTrack, QueueItem, and PrintTrack interfaces"
provides:
  - "Tune text input in TrackSheet editor (after Key, before Lead, song-only)"
  - "Tune column on print cover page between Song and Lead"
  - "Expanded content hash including all cover page fields (fixes STAB-01 stale PDF cache)"
  - "Cover page body text 12pt+, headers 14pt+ for music stand readability"
affects: [03-print-pipeline-redesign]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TrackSheet field pattern: useState + useEffect sync + commitChanges + onBlur render"
    - "Cover page column layout: fixed x-positions with maxLen truncation per column"

key-files:
  created: []
  modified:
    - src/components/setlist/v2/TrackSheet.tsx
    - src/lib/print-pipeline.ts

key-decisions:
  - "Tune input placed in its own grid row (Key + Tune row, then Lead row) for cleaner layout"
  - "Column widths redistributed: colTune at 210 (or 195 with transpositions) fits 12-char tune names"
  - "Notes text kept at 10pt (italic) to differentiate from 12pt body text while remaining readable"

patterns-established:
  - "Cover page font hierarchy: 28pt title, 14pt column headers, 13pt metadata, 12pt body, 10pt notes/footer"

requirements-completed: [DATA-03, STAB-01]

# Metrics
duration: 3min
completed: 2026-03-01
---

# Phase 1 Plan 2: Tune Editor + Cover Page Summary

**Tune text input in TrackSheet editor with cover page Tune column, expanded content hash for PDF cache invalidation, and bumped font sizes for music stand readability**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-01T20:44:44Z
- **Completed:** 2026-03-01T20:47:39Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Tune text input renders in TrackSheet editor after Key, before Lead, only for song-type tracks
- Tune persists to Firestore via commitChanges (included in update payload with useCallback dependency)
- Cover page now has Tune column between Song and Lead with proper truncation
- computeContentHash expanded to include eventName, per-track title, key, notes, leadMusician, tune -- fixing STAB-01 stale PDF cache bug
- All cover page body text bumped from 10pt to 12pt, column headers from 10pt to 14pt

## Task Commits

Each task was committed atomically:

1. **Task 1: Add tune input field to TrackSheet editor** - `cbb83af` (feat)
2. **Task 2: Add Tune column to cover page, fix content hash, bump fonts** - `0abd33f` (feat)

## Files Created/Modified
- `src/components/setlist/v2/TrackSheet.tsx` - Added tune state, sync, commitChanges inclusion, and Tune input field in song-specific section
- `src/lib/print-pipeline.ts` - Expanded content hash with all cover page fields, added Tune column, bumped font sizes to 12pt body / 14pt headers

## Decisions Made
- Placed Tune input in a Key+Tune grid row, with Lead getting its own row below, rather than cramming Key+Tune+Lead into one row
- Column widths redistributed to fit 7 columns on 612pt page: colNum(50), colTitle(75), colTune(210), colLead(295), colKey(380), colNotes(425)
- Notes column text kept at 10pt italic to maintain visual hierarchy (italic differentiates from body text)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Tune field is now fully functional end-to-end: editable in TrackSheet, persisted to Firestore, displayed on printed cover page
- Content hash now covers all cover page fields -- changing any field regenerates the PDF
- Phase 1 data foundation is complete; Phases 2 (live view) and 3 (print redesign) can proceed

## Self-Check: PASSED

All 2 modified files verified present. Both task commits (cbb83af, 0abd33f) verified in git log.

---
*Phase: 01-data-foundation*
*Completed: 2026-03-01*
