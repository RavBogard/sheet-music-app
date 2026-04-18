---
phase: 04-key-signature-position
plan: 01
subsystem: ui
tags: [performance-view, setlist, key-signature, layout]

requires:
  - phase: none
    provides: standalone UI change
provides:
  - Key badge renders right of song title in performance view
affects: []

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - src/components/performance/SetlistRow.tsx
    - src/components/performance/__tests__/setlist-row.test.tsx

key-decisions:
  - "Reversed v1.6 P3 key-left decision per user request — key now right of title"
  - "Removed fixed-width spacer — no alignment padding needed when key is inline"
  - "Smaller badge styling for inline display (text-sm vs text-base)"

patterns-established: []

duration: ~10min
started: 2026-03-11T15:00:00Z
completed: 2026-03-11T15:10:00Z
---

# Phase 4 Plan 1: Key Signature Position Summary

**Moved key signature badge from left of song title to right, inline with title text in performance SetlistRow.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~10min |
| Tasks | 2 completed |
| Files modified | 2 |
| Commit | 3fc36f4 |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Key badge renders right of title | Pass | Badge inline after title span, before BPM |
| AC-2: Songs without keys — no extra spacing | Pass | Spacer removed, title spans naturally |
| AC-3: BPM still displays correctly | Pass | Title → Key → BPM order preserved |
| AC-4: Transposed keys still work | Pass | All 12 tests pass including transposition |

## Accomplishments

- Restructured SetlistRow songContent layout — key badge moved from standalone left column to inline after title
- Removed fixed-width spacer and left-margin offsets (ml-[3.75rem])
- Smaller badge styling for inline context

## Task Commits

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Task 1: Move key badge | `3fc36f4` | fix | Restructured layout, removed spacer |
| Task 2: Update tests | `3fc36f4` | fix | Updated test names for new position |

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/components/performance/SetlistRow.tsx` | Modified | Key badge moved right of title, spacer removed |
| `src/components/performance/__tests__/setlist-row.test.tsx` | Modified | Test names updated for new position |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Reverse key-left layout | User requested key right of title | Updates v1.6 P3 decision |
| Remove spacer entirely | No left column to align without key-left layout | Simpler DOM |

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## Next Phase Readiness

**Ready:**
- Key signature position updated as requested
- All tests passing

**Concerns:**
- None

**Blockers:**
- None

---
*Phase: 04-key-signature-position, Plan: 01*
*Completed: 2026-03-11*
