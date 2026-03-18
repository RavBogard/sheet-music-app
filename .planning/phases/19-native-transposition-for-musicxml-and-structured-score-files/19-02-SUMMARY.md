---
phase: 19-native-transposition-for-musicxml-and-structured-score-files
plan: 02
subsystem: ui
tags: [musicxml, osmd, transposition, performance-view, smart-score-viewer]

requires:
  - phase: 19-native-transposition-for-musicxml-and-structured-score-files/19-01
    provides: "TransposeCalculator initialization in SmartScoreViewer, correct file type detection via toQueueItem"
provides:
  - "File-type branching in PDFOverlay: SmartScoreViewer for MusicXML, PDFViewer for PDFs"
  - "Automatic SmartTransposer suppression for MusicXML files"
  - "Complete native transposition pipeline for MusicXML end-to-end"
affects: [performance-view, transposition, musicxml-rendering]

tech-stack:
  added: []
  patterns:
    - "Conditional renderer selection based on queue item file type"
    - "Dynamic import for SmartScoreViewer matching PDFViewer SSR pattern"

key-files:
  created: []
  modified:
    - src/components/performance/PDFOverlay.tsx
    - src/components/performance/__tests__/pdf-overlay.test.tsx

key-decisions:
  - "Used conditional render in PDFOverlay JSX (Option A from RESEARCH.md) for simplest file-type branching"
  - "SmartTransposer suppression is automatic — it lives inside PDFPageWrapper which only mounts for PDFViewer"

patterns-established:
  - "File-type branching pattern: read currentItem.type from store, conditionally render appropriate viewer component"

requirements-completed: [T19-03, T19-04, T19-06, T19-07]

duration: 12min
completed: 2026-03-18
---

# Phase 19 Plan 02: Wire File-Type Branching Summary

**PDFOverlay routes MusicXML files to SmartScoreViewer with native OSMD transposition, while PDFs continue using PDFViewer with SmartTransposer overlay**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-18T22:52:17Z
- **Completed:** 2026-03-18T22:57:34Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- PDFOverlay now branches rendering based on queue item file type
- MusicXML files render via SmartScoreViewer with native OSMD transposition (notes, chords, key signatures)
- PDF files continue rendering via PDFViewer with SmartTransposer chord overlay (no regression)
- SmartTransposer automatically suppressed for MusicXML (never mounted since it lives inside PDFPageWrapper)
- Visual verification approved: transposition, rendering, and UX parity confirmed

## Task Commits

Each task was committed atomically:

1. **Task 1: Add file-type branching to PDFOverlay render path** - `90a398d` (test), `67113cd` (feat)
2. **Task 2: Verify native MusicXML transposition end-to-end** - checkpoint:human-verify (approved)

## Files Created/Modified
- `src/components/performance/PDFOverlay.tsx` - Added conditional rendering: SmartScoreViewer for MusicXML, PDFViewer for PDFs
- `src/components/performance/__tests__/pdf-overlay.test.tsx` - Added tests for file-type branching and SmartTransposer suppression

## Decisions Made
- Used conditional render in PDFOverlay JSX (Option A from RESEARCH.md) — simplest approach since SmartTransposer suppression is automatic
- SmartScoreViewer dynamically imported matching the existing PDFViewer SSR-avoidance pattern

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 19 complete: native MusicXML transposition fully wired end-to-end
- Phase 20 (add song to existing setlist from library view) can proceed when planned

## Self-Check: PASSED

- FOUND: src/components/performance/PDFOverlay.tsx
- FOUND: src/components/performance/__tests__/pdf-overlay.test.tsx
- FOUND: commit 90a398d (test)
- FOUND: commit 67113cd (feat)

---
*Phase: 19-native-transposition-for-musicxml-and-structured-score-files*
*Completed: 2026-03-18*
