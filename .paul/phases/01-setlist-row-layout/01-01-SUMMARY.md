---
phase: 01-setlist-row-layout
plan: 01
subsystem: ui
tags: [tailwind, setlist, performance-view, dark-mode]

requires: []
provides:
  - Setlist row layout with key badge next to title
  - Inline notes in amber color
  - Alternating row backgrounds for readability
affects: []

tech-stack:
  added: []
  patterns:
    - "bg-white/[opacity] for dark-mode alternating rows (not bg-muted which has baked-in alpha)"

key-files:
  created: []
  modified:
    - src/components/performance/SetlistRow.tsx
    - src/components/performance/SetlistDrawer.tsx

key-decisions:
  - "Use bg-white opacity instead of bg-muted for dark backgrounds (--muted has baked-in alpha)"
  - "Both odd and even rows get a tint (0.03/0.07) instead of alternating with pure black"

patterns-established:
  - "Dark-mode alternating rows: bg-white/[0.03] and bg-white/[0.07]"

duration: ~30min
started: 2026-03-12
completed: 2026-03-12
---

# Phase 1 Plan 01: Setlist Row Layout & Readability Summary

**Key badge moved next to song title, notes shown inline in amber, alternating row backgrounds with dual-tint for dark mode readability.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~30min |
| Started | 2026-03-12 |
| Completed | 2026-03-12 |
| Tasks | 3 completed (2 auto + 1 human-verify) |
| Files modified | 4 (2 components + 2 test files) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Key badge next to title | Pass | Removed flex-1 push, key renders immediately after title |
| AC-2: Notes inline in amber | Pass | text-amber-400/70, truncated with max-w |
| AC-3: Alternating row backgrounds | Pass | bg-white/[0.07] even, bg-white/[0.03] odd — both visible on dark bg |
| AC-4: SetlistDrawer consistency | Pass | Same layout pattern with compact sizing |

## Accomplishments

- Restructured SetlistRow flex layout: title → key → notes → spacer → BPM
- Alternating row backgrounds using bg-white opacity (not bg-muted which has baked-in alpha in OKLCH)
- Both row types have visible tint — no pure black rows for readability
- SetlistDrawer matches main view layout

## Task Commits

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Task 1+2: Layout + Drawer | `4ff6815` | feat | Key next to title, inline notes, alternating rows |
| Checkpoint fix 1 | `32739d7` | fix | Increase alternating row opacity (bg-muted/5 → bg-muted/15) |
| Checkpoint fix 2 | `ed96f64` | fix | Switch to bg-white opacity (bg-muted has baked-in alpha) |
| Test updates | `7624f71` | fix | Update tests for inline notes (no longer toggle-to-reveal) |
| Checkpoint fix 3 | `a1ccfa9` | fix | Add base tint to odd rows (both rows visible, not black-on-black) |

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/components/performance/SetlistRow.tsx` | Modified | Flex layout restructure, inline notes, alternating bg |
| `src/components/performance/SetlistDrawer.tsx` | Modified | Matching layout and alternating bg |
| `src/components/performance/__tests__/setlist-row.test.tsx` | Modified | Updated for inline notes (removed toggle test) |
| `src/components/performance/__tests__/setlist-view.test.tsx` | Modified | Updated for inline notes on songs |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| bg-white/[opacity] over bg-muted | --muted OKLCH var has baked-in alpha, Tailwind opacity modifier compounds invisibly | Pattern for all future dark-mode alternating rows |
| Dual-tint (0.03 + 0.07) over single-tint | Pure black odd rows had poor text readability vs tinted even rows | Both row types readable |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 3 | Essential — original bg-muted approach invisible on dark bg |
| Scope additions | 0 | None |
| Deferred | 0 | None |

**Total impact:** Essential fixes to get alternating rows visible. Root cause: OKLCH color variable with baked-in alpha.

### Auto-fixed Issues

**1. bg-muted opacity invisible on dark background**
- **Found during:** Checkpoint human-verify
- **Issue:** bg-muted/5 and bg-muted/15 invisible because --muted already has 0.5 alpha
- **Fix:** Switched to bg-white/[0.07] for predictable opacity
- **Commits:** `32739d7`, `ed96f64`

**2. Pure black odd rows poor readability**
- **Found during:** Checkpoint human-verify (second round)
- **Issue:** Only even rows had tint, odd rows were pure black — text harder to read
- **Fix:** Added bg-white/[0.03] to odd rows
- **Commit:** `a1ccfa9`

**3. Stale toggle-notes tests**
- **Found during:** CI test run
- **Issue:** Tests expected old toggle-to-reveal behavior, notes are now always inline
- **Fix:** Updated tests to expect inline notes
- **Commit:** `7624f71`

## Skill Audit

All required skills invoked ✓
- /ui-ux-pro-max: Invoked during alternating row fix

## Next Phase Readiness

**Ready:**
- Setlist perform view layout complete and user-approved
- Pattern established for dark-mode alternating rows

**Concerns:**
- None

**Blockers:**
- None

---
*Phase: 01-setlist-row-layout, Plan: 01*
*Completed: 2026-03-12*
