---
phase: 01-critical-security
plan: 01
subsystem: api
tags: [security, firestore-transactions, timing-attacks, session-auth]

requires: []
provides:
  - Authenticated session DELETE endpoint
  - Constant-time cron auth on all 4 routes
  - Transactional scheduling mutations (assign/unassign/respond)
affects: []

tech-stack:
  added: []
  patterns: [firestore-transactions-for-scheduling, timing-safe-cron-auth]

key-files:
  modified:
    - src/app/api/auth/session/route.ts
    - src/app/api/cron/scheduling-reminder/route.ts
    - src/app/api/cron/enrich/route.ts
    - src/app/api/cron/sync/route.ts
    - src/app/api/scheduling/assign/route.ts
    - src/app/api/scheduling/unassign/route.ts
    - src/app/api/scheduling/respond/route.ts
    - src/app/api/scheduling/__tests__/assign.test.ts
    - src/app/api/scheduling/__tests__/unassign.test.ts
    - src/app/api/scheduling/__tests__/respond.test.ts
    - src/__tests__/mock-firebase-admin.ts

key-decisions:
  - "Session DELETE clears cookie even on expired session (useless cookie, no security risk)"
  - "safeCompare inlined per-file to match existing cron/backup pattern"
  - "Notifications kept outside transactions (fire-and-forget, no atomicity needed)"

patterns-established:
  - "All cron routes: timingSafeEqual via safeCompare helper"
  - "Scheduling mutations: db.runTransaction for read-then-write operations"
  - "Transaction errors thrown as typed strings (NOT_FOUND, FORBIDDEN, ALREADY_*)"

duration: ~20min
completed: 2026-03-31
---

# Phase 1 Plan 01: Auth & Race Condition Fixes Summary

**Session DELETE gated behind verifySessionCookie, timing-safe auth on 3 cron routes, Firestore transactions on all 3 scheduling mutation routes.**

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Session DELETE requires authentication | Pass | Returns 401 when no cookie present; clears expired cookies (harmless) |
| AC-2: All cron routes use constant-time comparison | Pass | All 4 cron routes now use timingSafeEqual; zero === comparisons remain |
| AC-3: Scheduling assign uses transaction | Pass | Duplicate check + create wrapped in runTransaction |
| AC-4: Scheduling unassign uses transaction | Pass | Fetch + cancel wrapped in runTransaction |
| AC-5: Scheduling respond uses transaction | Pass | Status guard + update wrapped in runTransaction |

## Files Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/app/api/auth/session/route.ts` | Modified | Added verifySessionCookie guard to DELETE |
| `src/app/api/cron/scheduling-reminder/route.ts` | Modified | Added timingSafeEqual via safeCompare |
| `src/app/api/cron/enrich/route.ts` | Modified | Added timingSafeEqual via safeCompare |
| `src/app/api/cron/sync/route.ts` | Modified | Added timingSafeEqual via safeCompare |
| `src/app/api/scheduling/assign/route.ts` | Modified | Wrapped duplicate check + create in transaction |
| `src/app/api/scheduling/unassign/route.ts` | Modified | Wrapped fetch + cancel in transaction |
| `src/app/api/scheduling/respond/route.ts` | Modified | Wrapped status guard + update in transaction |
| `src/app/api/scheduling/__tests__/assign.test.ts` | Modified | Added runTransaction mock, updated assertions for transaction.set |
| `src/app/api/scheduling/__tests__/unassign.test.ts` | Modified | Added runTransaction mock, updated assertions for 2-arg update |
| `src/app/api/scheduling/__tests__/respond.test.ts` | Modified | Added runTransaction mock, updated assertions for 2-arg update |
| `src/__tests__/mock-firebase-admin.ts` | Modified | Added runTransaction to shared mock |

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Test mocks didn't support runTransaction | Updated all 3 test files + shared mock with transaction support |
| transaction.update takes 2 args (ref, data) vs ref.update(data) with 1 arg | Updated test assertions to expect.anything() for ref arg |

## Next Phase Readiness

**Ready:**
- All scheduling routes now use transactions — safe pattern for future scheduling work
- Cron auth pattern is consistent across all 4 routes

**Concerns:** None

**Blockers:** None

---
*Phase: 01-critical-security, Plan: 01*
*Completed: 2026-03-31*
