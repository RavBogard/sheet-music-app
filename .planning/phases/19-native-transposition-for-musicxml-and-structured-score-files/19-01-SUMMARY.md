---
phase: 19-native-transposition-for-musicxml-and-structured-score-files
plan: 01
subsystem: music-viewer, performance
tags: [bugfix, transposition, musicxml, osmd]
dependency_graph:
  requires: [opensheetmusicdisplay, queue-utils]
  provides: [working-transpose-calculator, correct-file-type-detection]
  affects: [SmartScoreViewer, PDFOverlay]
tech_stack:
  added: []
  patterns: [TDD, reuse-existing-utils]
key_files:
  created:
    - src/components/music/__tests__/smart-score-viewer.test.tsx
  modified:
    - src/components/music/SmartScoreViewer.tsx
    - src/components/performance/PDFOverlay.tsx
    - src/components/performance/__tests__/pdf-overlay.test.tsx
decisions:
  - TransposeCalculator imported directly from opensheetmusicdisplay (confirmed exported)
  - Reused existing toQueueItem from queue-utils instead of inline detection logic
metrics:
  duration: 199s
  completed: "2026-03-18T22:52:17Z"
---

# Phase 19 Plan 01: Foundation Bug Fixes Summary

TransposeCalculator initialization in SmartScoreViewer and correct file-type detection in PDFOverlay via toQueueItem reuse.

## What Was Done

### Task 1: Fix SmartScoreViewer TransposeCalculator initialization
- Added `TransposeCalculator` import from `opensheetmusicdisplay`
- Assigned `osmdRef.current.TransposeCalculator = new TransposeCalculator()` immediately after OSMD construction
- This ensures `Sheet.Transpose` actually affects note rendering (was silently ignored before)
- 3 tests: TC assigned after init, TC set before load(), transposition triggers updateGraphic+render

### Task 2: Fix PDFOverlay queue building file type detection
- Replaced hardcoded `type: "pdf"` queue item construction with `toQueueItem()` from `@/lib/queue-utils`
- The existing `toQueueItem` function already handles file-type detection: db- prefix, .musicxml, .xml, .mxl -> musicxml
- 5 new tests covering pdf default, db- prefix, .musicxml, .xml, .mxl extensions

## Commits

| Hash | Message |
|------|---------|
| e96e5f7 | test(19-01): add failing tests for TransposeCalculator initialization |
| 61cfd23 | feat(19-01): initialize TransposeCalculator in SmartScoreViewer |
| 55016c7 | test(19-01): add failing tests for PDFOverlay file type detection |
| ffd55e3 | feat(19-01): use toQueueItem for correct file type detection in PDFOverlay |

## Deviations from Plan

None - plan executed exactly as written.

## Verification

All 11 tests pass across both test suites:
- `src/components/music/__tests__/smart-score-viewer.test.tsx`: 3 passed
- `src/components/performance/__tests__/pdf-overlay.test.tsx`: 8 passed (3 existing + 5 new)

## Self-Check: PASSED
