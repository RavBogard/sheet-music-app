---
phase: 04-editor-cleanup
plan: 03
subsystem: ui
tags: [onboarding, alert-dialog, dashboard, setlist-dialogs]

requires:
  - phase: 04-editor-cleanup
    provides: canEditSetlist + hook fixes from 04-01, apiFetch timeout from 04-02

provides:
  - OnboardingCard — single role-aware dashboard component
  - TransferSetlistDialog on AlertDialog primitives (no hand-rolled overlay)
  - SetlistHistoryPanel restore via AlertDialog (no window.confirm)
affects: Any future dashboard-onboarding change; any future "confirm destructive action" dialog

tech-stack:
  added: []
  patterns:
    - Mutually-exclusive variant selection via a pickVariant() function prevents render-time stacking
    - AlertDialogAction with e.preventDefault() keeps the dialog open through async confirm handlers

key-files:
  created:
    - src/components/dashboard/OnboardingCard.tsx
    - src/components/dashboard/__tests__/OnboardingCard.test.tsx
  modified:
    - src/app/(main)/DashboardClient.tsx
    - src/components/setlist/SetlistDialogs.tsx
    - src/components/setlist/SetlistHistoryPanel.tsx

key-decisions:
  - "pickVariant(role, isMember, profile) returns at most one variant — 'pending' wins when both predicates overlap"
  - "TransferSetlistDialog's Transfer action uses e.preventDefault() so the dialog stays open during async transfer"
  - "Restore confirmation uses AlertDialog (not window.confirm) — surfaces action label + timestamp in description"

patterns-established:
  - "Destructive-action confirms always go through AlertDialog primitives"
  - "Role-aware dashboard cards select their variant in a pure function, not in JSX conditionals"

duration: ~25min
started: 2026-04-14T09:00:00Z
completed: 2026-04-14T09:15:00Z
---

# Phase 04 Plan 03: OnboardingCard + Dialog Migrations Summary

**Dashboard onboarding deduped into a single role-aware `OnboardingCard` (stacking bug fixed via `pickVariant`); `TransferSetlistDialog` moved to AlertDialog primitives; `SetlistHistoryPanel` restore swaps `window.confirm` for an AlertDialog.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~25min |
| Tasks | 3 auto + 1 human-verify checkpoint |
| Files modified | 4 |
| Tests added | 6 |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Exactly one onboarding card renders | Pass | `pickVariant()` returns at most one variant. Stacking-guard test asserts only one heading renders when both predicates overlap. DashboardClient collapsed ~145 lines into one invocation. |
| AC-2: TransferSetlistDialog uses AlertDialog | Pass | Hand-rolled `fixed inset-0 bg-black/80` overlay gone; backdrop/focus/z-index inherited from primitive. Transfer action preventsDefault so dialog stays open during async confirm. |
| AC-3: SetlistHistoryPanel restore uses AlertDialog | Pass | `window.confirm()` removed; description surfaces action label + timestamp. Cancel/Restore via primitive. |

## Accomplishments

- Dashboard onboarding is now a single import, zero stacking-bug surface, with a test pinning the invariant.
- Two destructive-confirmation flows aligned with the app's AlertDialog pattern. Keyboard/focus-trap accessibility inherited for free.
- Full suite 1153/1153; TypeScript clean.

## Task Commits

Single atomic commit.

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/components/dashboard/OnboardingCard.tsx` | Created | Single role-aware card; pickVariant guards stacking |
| `src/components/dashboard/__tests__/OnboardingCard.test.tsx` | Created | 6 tests pinning variant selection + stacking guard |
| `src/app/(main)/DashboardClient.tsx` | Modified | Two card blocks collapsed into one <OnboardingCard/>; obsolete state + reset-effect removed |
| `src/components/setlist/SetlistDialogs.tsx` | Modified | TransferSetlistDialog on AlertDialog primitives |
| `src/components/setlist/SetlistHistoryPanel.tsx` | Modified | Restore confirmation via AlertDialog (no window.confirm) |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| `pickVariant` as a pure function | Moves the mutual-exclusion invariant out of JSX where it can be tested directly | Stacking bug can't regress without a failing test |
| `e.preventDefault()` on Transfer action | Default AlertDialog action auto-closes; we need to stay open during async transfer | Matches other in-flight dialog patterns |
| First draft with render-prop sub-component discarded, rewritten inline | Abstraction added more complexity than the duplication it removed | Simpler, per global rules 7 & 8 |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | Scrapped and rewrote an over-abstracted first draft |
| Scope additions | 0 | — |
| Deferred | 0 | — |

**Total impact:** Plan executed as written.

### Auto-fixed Issues

**1. [Refactor] Initial OnboardingCard used a render-prop `QuickInstrumentSetup` sub-component**
- **Found during:** Task 1 author review (no tests run against it)
- **Issue:** Shared-child-with-callbacks indirection made the two variants harder to follow than the original two inline blocks.
- **Fix:** Rewrote with `pickerBlock` as a shared JSX variable and two simple variant branches. Same behaviour, cleaner read.
- **Files:** `src/components/dashboard/OnboardingCard.tsx`
- **Verification:** 6/6 tests green; tsc clean.

### Deferred Items

None. Remaining Phase 4 backlog (triple-modal chain, INSTRUMENTS unification, toast hygiene, track-row buttons, z-index tokens) is explicitly staged for subsequent plans.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Pre-existing `song-charts-library.test.tsx` env-vars failure | Unchanged — still out of scope. |

## Next Phase Readiness

**Ready:**
- 04-04 candidates available: (a) triple-modal chain consolidation, (b) toast hygiene + error-toast sweep, (c) INSTRUMENTS registry unification, (d) track-row delete/move buttons + tablet SwapPicker height.
- AlertDialog pattern established — subsequent destructive-confirm flows have a clear template.

**Concerns:**
- None introduced by this plan.

**Blockers:**
- None.

**Skill audit:** /ui-ux-pro-max required and invoked ✓

---
*Phase: 04-editor-cleanup, Plan: 03*
*Completed: 2026-04-14*
