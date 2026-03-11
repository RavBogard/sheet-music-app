---
phase: 05-api-route-tests
plan: 02
subsystem: testing
tags: [vitest, api-routes, scheduling, assign, remind, notifications]

requires:
  - phase: 03-test-infrastructure
    provides: shared test helpers, mock factories, api-test-helpers
  - phase: 05-api-route-tests/01
    provides: chainable query mock pattern, route test conventions

provides:
  - assign route test coverage (status logic, duplicates, notifications, setlist sync)
  - remind route test coverage (reminders, error resilience, multi-assignment)

affects: [05-03]

tech-stack:
  added: []
  patterns: [multi-mock proxy pattern for complex routes with many dependencies]

key-files:
  created:
    - src/app/api/scheduling/__tests__/assign.test.ts
    - src/app/api/scheduling/__tests__/remind.test.ts
  modified: []

key-decisions:
  - "Remind 'no setlistId' 48-hour filter path is unreachable through API wrapper — tested reachable paths only"
  - "Mock functions use explicit parameter signatures to satisfy strict TS (vi.fn((_opts?: unknown) => ...))"

patterns-established:
  - "Multi-dependency mock: wrap vi.fn with typed params, proxy via (...args) => mockFn(args[0]) to avoid spread type errors"
  - "Per-test Firestore state via module-level let variables reset in beforeEach"

duration: ~15min
started: 2026-03-11
completed: 2026-03-11
---

# Phase 5 Plan 02: Assign + Remind Route Tests Summary

**16 tests covering assign (batch assignment with notifications) and remind (pending assignment reminders) scheduling API routes**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~15min |
| Started | 2026-03-11 |
| Completed | 2026-03-11 |
| Tasks | 2 completed |
| Files created | 2 |
| Lines added | 567 |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: assign creates with correct status | Pass | core→confirmed, regular→pending |
| AC-2: assign handles duplicates | Pass | Skips existing, returns assigned: 0 |
| AC-3: assign sends multi-channel notifications | Pass | Email, SMS, in-app, FCM push all tested |
| AC-4: assign syncs setlist musicians array | Pass | New musicians added to setlist doc |
| AC-5: remind sends reminders for pending | Pass | Email + SMS + in-app notification verified |
| AC-6: remind filters by 48-hour window | N/A | Path unreachable via API wrapper (documented) |
| AC-7: All existing tests still pass | Pass | 776 total tests, 0 failures, 0 TS errors |

## Accomplishments

- 16 new tests across 2 route test files (567 lines)
- Assign route fully tested: status logic, duplicate detection, 4 notification channels, setlist sync
- Remind route tested for all reachable paths: single/multiple reminders, error resilience, empty results
- Total test count: 760 → 776, zero regressions

## Task Commits

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Task 1+2: assign + remind tests | `0cecade` | test | assign (9 tests) and remind (7 tests) route tests |

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/app/api/scheduling/__tests__/assign.test.ts` | Created | Tests batch assignment, status logic, notifications, setlist sync (313 lines) |
| `src/app/api/scheduling/__tests__/remind.test.ts` | Created | Tests reminder sending, error resilience, counts (254 lines) |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Skip AC-6 (48-hour filter) | Zod `.optional()` + API wrapper makes no-setlistId path unreachable | Minor gap documented in Known Issues |
| Typed mock fn signatures | `vi.fn((_opts?: unknown) => ...)` avoids TS spread errors | Pattern for future test files |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Scope reduction | 1 | AC-6 untestable via API (documented) |
| Auto-fixed | 2 | TS errors from mock typing |

**Total impact:** One acceptance criterion unreachable through the API as designed — not a test gap but a minor route design issue.

### Scope Reduction

**1. AC-6: Remind 48-hour filtering without setlistId**
- **Issue:** The `remindSchema` uses `z.object({ setlistId: z.string().min(1) }).optional()` — the `.optional()` only allows `undefined`, but the API wrapper always parses `req.json()` which never produces `undefined`. So sending no body → JSON parse error (400), sending `{}` → Zod validation error (400).
- **Impact:** The 48-hour filtering code path in the remind route is dead code through the API
- **Resolution:** Documented as Known Issue. Tested all reachable paths instead.

### Auto-fixed Issues

**1. TS2493: Mock tuple type indexing**
- **Found during:** Task 1 (assign tests)
- **Issue:** `mockAdd.mock.calls[0][0]` errors because `vi.fn(async () => ...)` types calls as `[][]`
- **Fix:** Cast via `(mockAdd.mock.calls as unknown[][])[0]?.[0]`
- **Verification:** `npx tsc --noEmit` passes

**2. TS2556: Spread argument type mismatch**
- **Found during:** Both tasks
- **Issue:** `mockSendEmail(...args)` where args is `unknown[]` can't spread into `vi.fn(async () => ...)`
- **Fix:** Use `vi.fn((_opts?: unknown) => ...)` with explicit params, call via `mockFn(args[0])`
- **Verification:** `npx tsc --noEmit` passes

## Issues Encountered

None beyond the TS fixes above.

## Next Phase Readiness

**Ready:**
- All 7 scheduling route test files complete (respond, unassign, suggest, history, calendar-feed, assign, remind)
- Mock patterns well-established for 05-03

**Concerns:**
- None

**Blockers:**
- None

---
*Phase: 05-api-route-tests, Plan: 02*
*Completed: 2026-03-11*
