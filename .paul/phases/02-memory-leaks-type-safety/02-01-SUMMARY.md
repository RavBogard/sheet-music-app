---
phase: 02-memory-leaks-type-safety
plan: 01
subsystem: runtime
tags: [memory-leaks, type-safety, zustand, firestore-listeners, tests]

requires:
  - phase: 01-critical-security
    provides: Transaction pattern for scheduling tests, shared mock with runTransaction
provides:
  - Memory leak fixes in alert-store and congregation-store
  - liveState + assignedUids on Setlist type
  - Typed useSafeFirestoreSync generic
  - 3 production as-any casts eliminated
  - 3 pre-existing test failures fixed
affects: []

tech-stack:
  added: []
  patterns: [zustand-store-cleanup, firestore-listener-lifecycle]

key-files:
  modified:
    - src/lib/alert-store.ts
    - src/lib/congregation-store.ts
    - src/types/models.ts
    - src/hooks/use-setlist-performance.ts
    - src/lib/api-wrapper.ts
    - src/lib/api-auth.ts
    - src/app/api/admin/seed-song-groups/route.ts
    - src/__tests__/mock-firebase-admin.ts
    - src/__tests__/assignment-auth.test.ts
    - src/hooks/__tests__/use-library.test.ts
    - src/app/api/scheduling/__tests__/unassign.test.ts

key-decisions:
  - "alert-store: added destroy() method + module-level unsubscribe tracking"
  - "congregation-store: wrapped unsub to also reset isInitialized"
  - "Setlist type: added liveState and assignedUids (both used in codebase but missing from type)"
  - "as-any overload issue: used conditional calls to match overload signatures instead of casting"

duration: ~15min
completed: 2026-03-31
---

# Phase 2 Plan 01: Memory Leaks, Type Safety & Failing Tests Summary

**Fixed Firestore listener leaks in 2 zustand stores, added liveState/assignedUids to Setlist type, eliminated 3 API as-any casts, fixed 3 pre-existing test failures.**

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: alert-store cleans up listener | Pass | Added destroy() method + unsubscribe tracking |
| AC-2: congregation-store cleanup resets state | Pass | Wrapped unsub to also set isInitialized: false |
| AC-3: Setlist type includes liveState | Pass | Added liveState?: LiveState and assignedUids?: string[] |
| AC-4: useSafeFirestoreSync proper generic | Pass | Changed from <any> to <Setlist> |
| AC-5: Zero production as-any casts | Partial | 3 API casts fixed; 9 more in TSX pages/components discovered (server→client serialization) |
| AC-6: 3 pre-existing test failures fixed | Pass | assignment-auth, use-library, unassign all passing |

## Files Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/lib/alert-store.ts` | Modified | Added unsubscribe tracking + destroy() method |
| `src/lib/congregation-store.ts` | Modified | Reset isInitialized on unsub |
| `src/types/models.ts` | Modified | Added liveState + assignedUids to Setlist interface |
| `src/hooks/use-setlist-performance.ts` | Modified | useSafeFirestoreSync<Setlist> instead of <any> |
| `src/lib/api-wrapper.ts` | Modified | Conditional overload call instead of as-any |
| `src/lib/api-auth.ts` | Modified | Conditional overload call instead of as-any |
| `src/app/api/admin/seed-song-groups/route.ts` | Modified | Typed groups as Record<string, SongGroup> |
| `src/__tests__/mock-firebase-admin.ts` | Modified | Stable mockUpdate/mockSet exports |
| `src/__tests__/assignment-auth.test.ts` | Modified | Use stable mockUpdate, fix assertion |
| `src/hooks/__tests__/use-library.test.ts` | Modified | Updated queryKey to match actual ['library', 'v2', 'all', ...] |
| `src/app/api/scheduling/__tests__/unassign.test.ts` | Modified | Added assignedUids to expected setlist update |

## Deviations from Plan

| Type | Count | Impact |
|------|-------|--------|
| Scope discovery | 1 | 9 additional as-any casts found in TSX files (not in original research) |
| Auto-fixed | 1 | Added assignedUids to Setlist type (discovered while adding liveState) |

**TSX as-any casts:** Original research only searched `.ts` files, missing 9 casts in `.tsx` pages and components. These are server→client serialization boundary casts (passing Firestore data to client components). Different concern from API-level type safety — noted for future work.

## Next Phase Readiness

**Ready:**
- Type system is more complete (liveState, assignedUids on Setlist)
- Test suite at 1090 passing (up from 1071 at start of milestone)
- Shared mock is more robust (stable update/set mocks)

**Concerns:**
- 9 TSX as-any casts remain (server→client serialization boundaries)
- song-charts-library.test.tsx env var failure persists (needs env config fix)

**Blockers:** None

---
*Phase: 02-memory-leaks-type-safety, Plan: 01*
*Completed: 2026-03-31*
