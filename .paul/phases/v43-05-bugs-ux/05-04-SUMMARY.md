---
phase: v43-05-bugs-ux
plan: 04
subsystem: ui
tags: [mobile, keyboard, visualviewport, ios, setlist-editor]

requires:
  - phase: v43-01-recursive-research
    provides: FINDINGS.md U02 (AddBar mobile keyboard collision)

provides:
  - AddBar hides on mobile soft-keyboard open via visualViewport
  - Unit test covering show/hide, SSR safety, listener cleanup

affects: future mobile-editor polish, any third sticky-bottom component that needs keyboard-aware hiding

tech-stack:
  added: []
  patterns:
    - "visualViewport hide pattern: subscribe to 'resize', toggle `hidden` class when vv.height < 0.75 × innerHeight (shared idiom with MobileTabBar)"

key-files:
  created:
    - src/components/setlist/v2/__tests__/AddBar.test.tsx
  modified:
    - src/components/setlist/v2/AddBar.tsx

key-decisions:
  - "Inline the effect rather than extract a useKeyboardOpen() hook — only 2 callers; premature abstraction. If a third consumer appears, refactor then."

patterns-established:
  - "Sticky-bottom mobile UI must subscribe to visualViewport resize to avoid keyboard collision"

duration: ~15min
started: 2026-04-14T20:45:00Z
completed: 2026-04-14T21:00:00Z
---

# Phase 5 Plan 04: U02 AddBar Mobile Keyboard Summary

**Sticky "+ Add Item" bar on setlist editor now hides on mobile soft-keyboard open, unblocking inline text edits on iPhone/iPad.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~15 min |
| Tasks | 2 auto + 1 human-verify — all complete |
| Files modified | 2 (1 component, 1 new test) |
| New tests | 6 |
| Total suite | 1212 pass (up from 1206) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: AddBar hides when soft keyboard opens | PASS | Test: `vv.height = 0.5 × innerHeight` → root has `hidden` class |
| AC-2: AddBar restores when keyboard closes | PASS | Test: restoring vv.height removes `hidden` |
| AC-3: Non-mobile environments unaffected | PASS | Test: `visualViewport=undefined` → no crash, never hides |
| AC-4: No regression on existing dropdown | PASS | Test: + Add Item button present, retains `h-11` (U01-compliant) |

## Accomplishments

- AddBar no longer overlaps service-notes / title inputs during mobile editing
- Pattern is identical to MobileTabBar — easy for future readers
- Listener cleanup verified via test (prevents leaks on unmount/remount)
- U01 44px floor preserved (regression guarded by new test)
- Human-verified on prod (iPhone + iPad)

## Task Commits

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Task 1: Port hide pattern | `c5a8e10` | fix(u02) | visualViewport listener + `hidden` class on root |
| Task 2: Unit test | `aa51d61` | test(u02) | 6 tests (visibility, SSR, cleanup, U01 guard) + PLAN doc |

All on `origin/master`, Vercel auto-deployed.

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/components/setlist/v2/AddBar.tsx` | Modified | +useEffect/useState for keyboard; +`data-testid`; cn() conditional `hidden` |
| `src/components/setlist/v2/__tests__/AddBar.test.tsx` | Created | 6 regression tests |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| No `useKeyboardOpen()` hook extraction | Only 2 callers (MobileTabBar, AddBar) — premature abstraction | Two 10-line effects stay local; if a 3rd consumer appears, refactor then |
| 75% threshold identical to MobileTabBar | Consistency; the threshold has been tuned on prod devices already | No need to re-tune; behavior identical across the two sticky bars |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | Adjusted dropdown-content test case |
| Scope additions | 0 | — |
| Deferred | 0 | — |

### Auto-fixed Issues

**1. Radix DropdownMenu content doesn't portal in jsdom click-flow**
- **Found during:** Task 2 (test run)
- **Issue:** Test tried to click the trigger and assert "Song from Library" item visible; Radix requires pointer-event setup jsdom doesn't provide
- **Fix:** Replaced click-and-assert-items with a simpler "trigger exists + has `h-11`" assertion. Dropdown behavior still smoke-tested by the human-verify checkpoint on real devices.
- **Commit:** `aa51d61`

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Pre-existing env-vars test suite still red | Unchanged; documented separately in STATE.md |

## Next Phase Readiness

**Ready:**
- 8/10 v4.3 P0 findings closed (S01, S03, D03, D02, B01, B02, **U01, U02**)
- Remaining P0s: S02 (bridge creds decision), D01 (cascade delete, larger)
- Phase 5 (P0 Bugs+UX) now 4/4 items closed → phase complete → trigger phase transition on next unify or standalone

**Concerns:**
- None on U02.

**Blockers:** None.

---
*Phase: v43-05-bugs-ux, Plan: 04*
*Completed: 2026-04-14*
