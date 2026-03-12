---
phase: 18-backend-hardening
plan: 01
subsystem: api
tags: [firestore-transactions, rate-limiting, error-handling, env-validation, security-rules]

requires:
  - phase: 14-bug-fixes
    provides: rate-limit infrastructure (src/lib/rate-limit.ts)
provides:
  - Atomic admin operations (WriteBatch, runTransaction)
  - ApiErrorResponse type and apiError() helper
  - Rate limiting on all admin routes
  - CRON_SECRET and SUPER_ADMIN_UID env validation
  - Configurable super-admin via Firestore config/admins document
affects: [19-final-audit, future error response migration]

tech-stack:
  added: []
  patterns: [ApiErrorResponse standard shape, apiError() helper, Firestore transaction for multi-step admin ops]

key-files:
  modified:
    - src/lib/api-wrapper.ts
    - src/app/api/admin/delete-user/route.ts
    - src/app/api/admin/set-role/route.ts
    - src/app/api/admin/set-upload-permission/route.ts
    - src/app/api/admin/set-sound-engineer/route.ts
    - src/app/api/admin/migrations/route.ts
    - src/app/api/cron/sync/route.ts
    - src/app/api/cron/enrich/route.ts
    - src/app/api/cron/scheduling-reminder/route.ts
    - src/app/api/cron/backup/route.ts
    - src/env.mjs
    - firestore.rules

key-decisions:
  - "WriteBatch for delete-user (delete + audit atomic), Auth delete best-effort after"
  - "runTransaction for set-role (user update + audit + demotion guard atomic), Auth claims after"
  - "apiError() helper returns consistent {error, code?, details?} shape"
  - "firestore.rules config/admins doc replaces hardcoded UID via get()"
  - "CRON_SECRET/SUPER_ADMIN_UID as optional env vars (dev environments may lack them)"

patterns-established:
  - "ApiErrorResponse: {error: string, code?: string, details?: unknown} for all error responses"
  - "apiError() helper for inline error returns in route handlers"
  - "Admin routes: Firestore ops in transaction/batch, external service calls (Auth) after commit"

duration: ~10min
completed: 2026-03-12
---

# Phase 18 Plan 01: Backend Hardening Summary

**Atomic admin operations, rate-limited admin routes, standardized error responses, validated env vars, and configurable super-admin UID via Firestore config document.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~10min |
| Completed | 2026-03-12 |
| Tasks | 3 completed |
| Files modified | 12 |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Admin operations are atomic | Pass | delete-user uses WriteBatch; Auth delete is best-effort after |
| AC-2: set-role operations are transactional | Pass | runTransaction wraps user doc + audit + demotion guard |
| AC-3: All admin routes rate-limited | Pass | All 5 admin routes call checkRateLimit('api') |
| AC-4: Consistent error response shape | Pass | ApiErrorResponse type + apiError() helper; createApiHandler uses it |
| AC-5: CRON_SECRET validated at build time | Pass | Added to env.mjs; 4 cron routes use env.CRON_SECRET |
| AC-6: Super-admin UID configurable | Pass | firestore.rules reads config/admins doc; no hardcoded UID |

## Accomplishments

- Admin delete-user and set-role operations are now atomic on the Firestore side, preventing inconsistent state on partial failure
- All 5 admin routes protected by rate limiting (60 req/min via 'api' tier)
- Exported `ApiErrorResponse` type and `apiError()` helper for consistent error returns across the codebase
- createApiHandler catch blocks use consistent `{error, code}` shape (no more route info leaked to client)
- CRON_SECRET and SUPER_ADMIN_UID validated in env.mjs; cron routes use typed env import
- Hardcoded super-admin UID removed from firestore.rules; replaced with `get(/config/admins).data.uids` lookup

## Files Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/lib/api-wrapper.ts` | Modified | Added ApiErrorResponse type, apiError() helper, updated error responses |
| `src/app/api/admin/delete-user/route.ts` | Modified | WriteBatch for atomic Firestore ops, rate limiting, apiError |
| `src/app/api/admin/set-role/route.ts` | Modified | runTransaction for atomic ops, rate limiting |
| `src/app/api/admin/set-upload-permission/route.ts` | Modified | Rate limiting, apiError for validation |
| `src/app/api/admin/set-sound-engineer/route.ts` | Modified | Rate limiting |
| `src/app/api/admin/migrations/route.ts` | Modified | Rate limiting |
| `src/app/api/cron/sync/route.ts` | Modified | env.CRON_SECRET import |
| `src/app/api/cron/enrich/route.ts` | Modified | env.CRON_SECRET import |
| `src/app/api/cron/scheduling-reminder/route.ts` | Modified | env.CRON_SECRET import |
| `src/app/api/cron/backup/route.ts` | Modified | env.CRON_SECRET import |
| `src/env.mjs` | Modified | Added CRON_SECRET and SUPER_ADMIN_UID |
| `firestore.rules` | Modified | config/admins doc lookup, removed hardcoded UID, added config/admins rule |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| WriteBatch (not transaction) for delete-user | Delete + audit don't need read-before-write; batch is simpler and sufficient | Simpler code, same atomicity guarantee |
| Auth operations after Firestore commit | Firebase Auth is external service, can't participate in Firestore transactions | Auth failure logged but Firestore state is consistent |
| apiError() returns NextResponse directly | Keeps inline usage clean: `return apiError(...)` | Other routes can adopt incrementally |
| Removed route info from 500 error details | Avoid leaking internal paths to clients | More secure error responses |
| config/admins via get() in rules | Only alternative to hardcoded UID; cached by rules evaluator per request | One extra read per rule evaluation, acceptable for low-traffic app |
| CRON_SECRET as optional | Dev environments may not have it; runtime check still guards cron routes | No build failures in dev |

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## Next Phase Readiness

**Ready:**
- apiError() helper available for any route to adopt
- All admin and cron routes hardened
- config/admins Firestore document pattern established

**Concerns:**
- Must seed `config/admins` doc in Firestore with `{ uids: ["93Xn3DbS0bSNb8zmfzLyfOMX1Ai3"] }` before deploying updated firestore.rules, otherwise isAdmin() will fail for the bootstrap admin
- Non-admin routes still use varied error shapes; can be migrated incrementally in Phase 19

**Blockers:** None

---
*Phase: 18-backend-hardening, Plan: 01*
*Completed: 2026-03-12*
