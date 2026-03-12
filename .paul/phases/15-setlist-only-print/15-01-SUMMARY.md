---
phase: 15-setlist-only-print
plan: 01
subsystem: ui
tags: [print, pdf, cover-page, toggle]

requires:
  - phase: 9-print-view-sticky-keys
    provides: cover page with chartless item filtering
provides:
  - coverOnly parameter on PrintRequest for cover-page-only PDF generation
  - Full Packet / Setlist Only toggle in PrintModal
  - Updated PrintStats to reflect cover-only mode
affects: []

tech-stack:
  added: []
  patterns: [early-return pipeline shortcut for coverOnly mode]

key-files:
  created: []
  modified:
    - src/lib/print-pipeline.ts
    - src/components/setlist/PrintModal.tsx
    - src/components/setlist/PrintStats.tsx
    - src/lib/print-pipeline.test.ts

key-decisions:
  - "coverOnly included in content hash to prevent cache collisions between full and cover-only PDFs"
  - "Early return after buildCoverPage avoids lazy-loading transposition modules entirely"

patterns-established: []

duration: ~8min
completed: 2026-03-12T10:35:00Z
---

# Phase 15 Plan 01: Setlist-Only Print Option Summary

**Added coverOnly toggle to PrintModal and print pipeline — generates a single-page song list PDF without fetching or merging any chart PDFs.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~8 min |
| Tasks | 3 completed |
| Files modified | 4 |
| New tests | 4 |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Toggle visible in PrintModal | Pass | Segmented button: Full Packet / Setlist Only |
| AC-2: Cover-only generates cover page only | Pass | coverOnly=true skips all track fetch/merge |
| AC-3: Full packet unchanged | Pass | coverOnly=false/undefined preserves existing flow |
| AC-4: Works for all print modes | Pass | coverOnly param passed in all generateForMusician calls |
| AC-5: Stats reflect selection | Pass | Shows "1 page (song list only)" when coverOnly |

## Accomplishments

- Added `coverOnly?: boolean` to `PrintRequest` interface with content hash inclusion
- Early return in `generatePrintPdf` after cover page build when `coverOnly` is true — skips all PDF fetch, chord extraction, transposition, and merge steps
- Segmented toggle UI in PrintModal (Full Packet / Setlist Only) with contextual helper text
- Updated `canGenerate` logic — coverOnly mode doesn't require linked PDFs
- Updated PrintStats to show "1 page (song list only)" in coverOnly mode
- 4 new test cases covering coverOnly paths
- Fixed pre-existing unused `PrintRequest` value import in test file (interface can't be imported as value with `typeof`)

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/lib/print-pipeline.ts` | Modified | Added coverOnly to PrintRequest, content hash, and early-return logic |
| `src/components/setlist/PrintModal.tsx` | Modified | Added coverOnly state, toggle UI, request param, updated canGenerate |
| `src/components/setlist/PrintStats.tsx` | Modified | Added coverOnly prop with conditional output display |
| `src/lib/print-pipeline.test.ts` | Modified | 4 new tests + removed unused value import |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Include coverOnly in content hash | Prevent cached full packets serving as cover-only results | Correct cache isolation |
| Early return before lazy-loading transposition modules | No need to import heavy modules for cover-only | Faster generation |

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Pre-existing `typeof PrintRequest` type error in test | Removed unused value import (interfaces don't have runtime values) |

## Next Phase Readiness

**Ready:**
- Phase 15 complete, ready for Phase 16 (Design Token Cleanup & Accessibility)

**Concerns:**
- Pre-existing use-offline test failure (1/1117) — noted since Phase 14, unrelated to print

**Blockers:** None

---
*Phase: 15-setlist-only-print, Plan: 01*
*Completed: 2026-03-12*
