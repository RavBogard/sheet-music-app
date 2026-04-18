---
phase: 04-frontend-robustness
plan: 01
subsystem: ui
tags: [react-hooks, async-safety, memory-leaks, ref-counting, dependency-arrays]

requires:
  - phase: 03-backend-hardening
    provides: Stable backend APIs and error patterns for hooks to consume
provides:
  - Corrected dependency arrays on 7 hooks (no stale closures)
  - Unmount-safe async patterns on 4 hooks
  - Annotation store lifecycle cleanup API
  - Monitor connection ref counting with debounced teardown
affects: [04-02-type-normalization-error-boundaries]

tech-stack:
  added: []
  patterns:
    - "Ref-based callback pattern for effect deps (writeRef, performSaveRef, downloadingRef)"
    - "isMountedRef guard for async state updates"
    - "Cancelled flag pattern for sequential async loops"
    - "Ref counting with debounced teardown for shared singletons"

key-files:
  created: []
  modified:
    - src/hooks/use-smart-transposer.ts
    - src/hooks/use-setlist-logic.ts
    - src/hooks/use-setlist-presence.ts
    - src/hooks/use-offline.ts
    - src/hooks/use-setlist-dashboard.ts
    - src/hooks/use-upcoming-prep.ts
    - src/hooks/use-creation-wizard.ts
    - src/lib/annotation-store.ts
    - src/hooks/use-monitor-connection.ts

key-decisions:
  - "Ref-based callbacks preferred over useCallback for effect stability"
  - "Monitor connection keeps 3s debounce on teardown to prevent flicker during navigation"
  - "Annotation store exposes clearSaveTimer() rather than internalizing lifecycle"

patterns-established:
  - "useRef + .current pattern to break effect → callback → effect dependency chains"
  - "isMountedRef pattern for post-await state safety"
  - "Cancelled flag for multi-step async loops (batch Firestore reads)"

duration: ~15min
started: 2026-03-10
completed: 2026-03-10
---

# Phase 4 Plan 01: Hook Dependency Fixes and Async Safety — Summary

**Fixed dependency array bugs, added unmount safety, and implemented ref counting on 9 hook/store files to eliminate stale closures, memory leaks, and React warnings in live performance.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~15 min |
| Started | 2026-03-10 |
| Completed | 2026-03-10 |
| Tasks | 2 completed |
| Files modified | 9 |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Hook Dependency Arrays Are Correct | Pass | 7 hooks fixed — object/array refs replaced with primitives or ref-based callbacks |
| AC-2: Async Operations Are Unmount-Safe | Pass | isMountedRef in smart-transposer and setlist-dashboard; cancelled flag in upcoming-prep |
| AC-3: Annotation Store Timer Is Lifecycle-Bound | Pass | `clearSaveTimer()` exported; timer cleared on `loadAnnotations` transition |
| AC-4: Monitor Connection Has Ref Counting | Pass | refCount with 3s debounced teardown; force flag for auth/unload paths |

## Accomplishments

- Eliminated stale closure bugs in 7 hooks by replacing object/array dependency refs with primitives and ref-based callbacks
- Added unmount safety (isMountedRef, cancelled flags) to 4 hooks with async operations
- Implemented ref-counted monitor connection with debounced teardown, preserving the singleton pattern while preventing resource leaks
- Exposed `clearSaveTimer()` on annotation store for proper lifecycle cleanup

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/hooks/use-smart-transposer.ts` | Modified | isMountedRef guard on async AI scan; extract `isPageScanning` primitive from array |
| `src/hooks/use-setlist-logic.ts` | Modified | performSaveRef pattern to break circular auto-save dep |
| `src/hooks/use-setlist-presence.ts` | Modified | writeRef pattern; removed `write` from effect deps |
| `src/hooks/use-offline.ts` | Modified | downloadingRef to avoid object dep on `downloading` state |
| `src/hooks/use-setlist-dashboard.ts` | Modified | isMountedRef on handleTransfer; removed unsafe double-cast on cloneForNextWeek |
| `src/hooks/use-upcoming-prep.ts` | Modified | cancelled flag for batch Firestore reads; cleanup function |
| `src/hooks/use-creation-wizard.ts` | Modified | Replaced `(context as any).rabbi` with spread pattern |
| `src/lib/annotation-store.ts` | Modified | Added `clearSaveTimer()` export; clear timer on `loadAnnotations` |
| `src/hooks/use-monitor-connection.ts` | Modified | Ref counting with 3s debounced teardown; force flag for auth/unload |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Ref-based callbacks over useCallback | Breaks effect → callback dependency chains without identity churn | Pattern for all hooks with callback deps |
| 3s debounce on monitor teardown | Prevents flicker during song navigation unmount/remount cycles | Preserves existing UX while adding proper cleanup |
| clearSaveTimer as public API | Consumers control lifecycle; store doesn't assume mount/unmount context | Components must call on unmount |
| Removed double-cast on cloneForNextWeek | The setlist object already satisfies the parameter type | Cleaner type safety |

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## Next Phase Readiness

**Ready:**
- All hook dependency and async safety fixes complete
- Foundation set for 04-02 (type normalization and error boundaries)

**Concerns:**
- `clearSaveTimer()` requires consuming components to call it on unmount (not yet wired)

**Blockers:**
- None

---
*Phase: 04-frontend-robustness, Plan: 01*
*Completed: 2026-03-10*
