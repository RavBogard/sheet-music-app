---
phase: 04-data-layer-tests
plan: 02
subsystem: testing
tags: [vitest, firebase, firestore, onSnapshot, client-side]

requires:
  - phase: 03-test-infrastructure
    provides: shared test helpers, mock factories, Firebase mocking patterns
provides:
  - Client-side users-firebase test coverage (24 tests)
  - Client-side scheduling-firebase test coverage (20 tests)
affects: [05-api-route-tests, 06-hook-tests]

tech-stack:
  added: []
  patterns: [client-side Firebase SDK mocking with vi.mock, onSnapshot callback capture pattern]

key-files:
  created:
    - src/lib/__tests__/users-firebase.test.ts
    - src/lib/__tests__/scheduling-firebase.test.ts
  modified: []

key-decisions:
  - "Used any[] for vi.mock wrapper args to avoid TS2556 spread errors in test files"

patterns-established:
  - "Client-side onSnapshot mock: capture onNext/onError via vi.fn((...args: any[]) => {...}), invoke in tests"
  - "Empty db guard testing: Object.defineProperty to temporarily swap db export"

duration: ~10min
started: 2026-03-11
completed: 2026-03-11
---

# Phase 4 Plan 02: Client-Side Firebase Data Layer Tests Summary

**44 new tests for users-firebase (profile CRUD, subscriptions, role API) and scheduling-firebase (4 subscriptions, 3 API wrappers, calendar token generation)**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~10min |
| Tasks | 2 completed |
| Files created | 2 |
| Tests added | 44 (24 + 20) |
| Total suite | 734 passing |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: ensureUserProfile creates/returns profiles | Pass | 8 tests: create, update, fallback, photoURL, displayName |
| AC-2: Subscription onSnapshot setup | Pass | 6 tests: dedup, null, noop, doc ref |
| AC-3: updateUserRole API calls | Pass | 3 tests: auth header, no-auth throw, error message |
| AC-4: Scheduling subscriptions query filters | Pass | 11 tests across 4 subscription functions |
| AC-5: API wrappers delegate to apiFetch | Pass | 3 tests: assign, respond, unassign |
| AC-6: generateCalendarFeedToken | Pass | 3 tests: hex length, updateDoc call, return value |
| AC-7: All existing tests still pass | Pass | 734/734, 0 TS errors |

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/lib/__tests__/users-firebase.test.ts` | Created | Tests for ensureUserProfile, subscriptions, updateUserRole, display name, welcome modal |
| `src/lib/__tests__/scheduling-firebase.test.ts` | Created | Tests for 4 subscriptions, 3 API wrappers, calendar token generation |

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| TS2556 spread error with `unknown[]` in vi.mock wrappers | Changed to `any[]` in mock factory args — test files only |

## Next Phase Readiness

**Ready:**
- Phase 4 complete — all data layer functions tested (server + client)
- 734 tests passing as baseline for Phase 5
- Mock patterns established for API route testing

**Concerns:**
- None

**Blockers:**
- None

---
*Phase: 04-data-layer-tests, Plan: 02*
*Completed: 2026-03-11*
