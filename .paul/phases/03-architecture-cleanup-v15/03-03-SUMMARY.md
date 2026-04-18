---
phase: 03-architecture-cleanup-v15
plan: 03
subsystem: ui
tags: [refactor, components, hooks, library, transposer]

requires: []
provides:
  - ChordEditBar as standalone component
  - SelectionActionBar sub-component for library
  - useLibraryActions hook for digitize/archive/rename
affects: []

tech-stack:
  added: []
  patterns: [action handler extraction to custom hooks, sub-component extraction for action bars]

key-files:
  created:
    - src/components/music/ChordEditBar.tsx
    - src/components/library/SelectionActionBar.tsx
    - src/components/library/useLibraryActions.ts
  modified:
    - src/components/music/TransposerMenu.tsx
    - src/components/library/SongChartsLibrary.tsx
    - src/components/performance/PerformanceToolbar.tsx
    - src/components/performance/__tests__/pdf-overlay.test.tsx

key-decisions:
  - "Skip useMusicStore split — 279 LOC is reasonable for its responsibility"
  - "Skip SetlistDrawerLegacy removal — NOT dead code, actively imported by PerformanceToolbar"
  - "PerformanceBottomBar already removed in prior work — no action needed"

patterns-established:
  - "Inline action handlers (API calls with toast feedback) → extract to useXxxActions hook"
  - "Multi-component files → split when components are independently importable"

duration: ~8min
started: 2026-03-10T22:00:00Z
completed: 2026-03-10T22:08:00Z
---

# Phase 3 Plan 03: Split SongChartsLibrary + TransposerMenu — Summary

**Extracted ChordEditBar, SelectionActionBar, and useLibraryActions from two large components, reducing both below 350 LOC.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~8min |
| Tasks | 2 completed |
| Files modified | 7 (3 created, 4 modified) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: ChordEditBar extracted to own file | Pass | New file, all imports updated including test mock |
| AC-2: SelectionActionBar extracted | Pass | Props-based component, parent renders with callbacks |
| AC-3: Library action handlers extracted to hook | Pass | useLibraryActions provides digitize/archive/rename |
| AC-4: TypeScript clean | Pass | npx tsc --noEmit passes |

## Accomplishments

- Extracted ChordEditBar (81 LOC) from TransposerMenu — TransposerMenu 411→336 LOC
- Extracted SelectionActionBar (78 LOC) from SongChartsLibrary — clean props interface
- Extracted useLibraryActions hook (98 LOC) — digitize, archive, rename handlers
- SongChartsLibrary 473→346 LOC, total reduction of 127 lines
- Cleaned up unused imports (useAuth, saveVerification from TransposerMenu; logger from SongChartsLibrary)

## Deviations from Plan

None.

## Phase 3 Overall Results

| Component | Before | After | Reduction |
|-----------|--------|-------|-----------|
| SetlistEditorV2 | 708 | 667 | -41 (Plan 01) |
| MusicianPicker | 824 | 612 | -212 (Plan 02) |
| TransposerMenu | 411 | 336 | -75 (Plan 03) |
| SongChartsLibrary | 473 | 346 | -127 (Plan 03) |

**Skipped (with rationale):**
- useMusicStore (279 LOC) — reasonable size, splitting adds indirection
- SetlistDrawerLegacy (360 LOC) — NOT dead code, actively used
- PerformanceBottomBar — already removed

## Next Phase Readiness

**Ready:**
- All large components now under 670 LOC
- Phase 3 complete — architecture cleanup goals met
- Codebase ready for Phase 4 (Quality & Deps)

**Blockers:** None

---
*Phase: 03-architecture-cleanup-v15, Plan: 03*
*Completed: 2026-03-10*
