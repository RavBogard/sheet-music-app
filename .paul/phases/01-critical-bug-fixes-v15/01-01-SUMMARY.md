---
phase: 01-critical-bug-fixes-v15
plan: 01
subsystem: hooks, api, data
tags: [race-condition, resource-leak, sanitization, firebase-admin, annotations]

requires:
  - phase: 05-backend-analysis-bug-scan (v1.4)
    provides: Bug audit identifying 5 critical/high issues
provides:
  - AI slot lifecycle verified safe (no resource leaks)
  - Annotation save-on-unmount guarantee
  - Race-safe musician transposition
  - initAdmin failure returns 500 (not silent undefined)
  - Explicit Firestore data sanitization (no JSON roundtrip)
affects: [02-security-hardening, 03-architecture]

tech-stack:
  added: []
  patterns:
    - "stripUndefined/stripUndefinedDeep for Firestore data sanitization"
    - "useEffect cleanup for store timer lifecycle"

key-files:
  modified:
    - src/hooks/use-smart-transposer.ts
    - src/app/perform/[id]/page.tsx
    - src/hooks/use-musician-transposition.ts
    - src/lib/api-auth.ts
    - src/lib/setlist-firebase.ts
    - src/lib/api-auth.test.ts
    - src/app/api/__tests__/route-auth.test.ts

key-decisions:
  - "AI slot lifecycle already safe — added documentation comments only"
  - "stripUndefinedDeep uses Object.getPrototypeOf check to skip Timestamp and other class instances"
  - "Test mocks updated to return true from initAdmin (necessary for new return-value check)"

patterns-established:
  - "Firestore sanitization: use stripUndefined/stripUndefinedDeep, never JSON.parse/stringify"
  - "Cancelled-flag pattern: check before EVERY state update after async boundaries"

duration: ~15min
started: 2026-03-10
completed: 2026-03-10
---

# Phase 1 Plan 01: Critical Bug Fixes Summary

**Fixed 5 critical/high bugs: AI slot safety verification, annotation save-on-unmount, transposition race condition, initAdmin failure handling, and Firestore data sanitization.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~15min |
| Tasks | 3 completed |
| Files modified | 7 |
| Tests | 640/640 passing |
| TypeScript | 0 errors |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: AI Slot Lifecycle Safety | Pass | All paths verified: acquireAiSlot → try/finally → releaseAiSlot. Safety comments added. |
| AC-2: Annotation Save Timer Cleanup | Pass | useEffect cleanup calls clearSaveTimer() + save() on unmount |
| AC-3: Musician Transposition Race Safety | Pass | cancelled checks added before all state updates (7 total occurrences) |
| AC-4: initAdmin Failure Handling | Pass | api-auth.ts throws 500 NextResponse when initAdmin() returns false |
| AC-5: Firestore Data Sanitization | Pass | stripUndefined/stripUndefinedDeep replaces all JSON.parse/stringify usage |

## Accomplishments

- Guaranteed no annotation data loss when navigating away from performance mode
- Eliminated race condition where rapid song switching could apply stale transposition
- All API routes now fail safely (500) if Firebase Admin credentials are missing
- Firestore writes use explicit sanitization that preserves Timestamp instances

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/hooks/use-smart-transposer.ts` | Modified | Added AI slot lifecycle safety comments |
| `src/app/perform/[id]/page.tsx` | Modified | Added clearSaveTimer + save() useEffect cleanup |
| `src/hooks/use-musician-transposition.ts` | Modified | Added cancelled checks before all state updates |
| `src/lib/api-auth.ts` | Modified | Check initAdmin() return value, throw 500 on failure |
| `src/lib/setlist-firebase.ts` | Modified | Replaced JSON roundtrip with stripUndefined helpers |
| `src/lib/api-auth.test.ts` | Modified | Updated initAdmin mock to return true |
| `src/app/api/__tests__/route-auth.test.ts` | Modified | Updated initAdmin mock to return true |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| AI slots already safe — comments only | All early returns inside try blocks with finally cleanup | No code change needed, just documentation |
| stripUndefinedDeep uses prototype check | `Object.getPrototypeOf(value) === Object.prototype` safely skips Timestamp and other class instances without instanceof | Works in test environments where Timestamp may be mocked |
| Updated test mocks | initAdmin mock needed `.mockReturnValue(true)` to match new check | 2 test files touched (minimal, necessary) |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | Essential — test mocks needed updating |
| Scope additions | 0 | None |
| Deferred | 0 | None |

**Total impact:** Minimal deviation — test mocks updated to match new initAdmin behavior.

### Auto-fixed Issues

**1. Test mock compatibility**
- **Found during:** Task 2 (initAdmin safety)
- **Issue:** Existing test mocks for `initAdmin` returned `undefined` (vi.fn() default), causing 11 test failures after adding the return-value check
- **Fix:** Updated mocks to `.mockReturnValue(true)` in 2 test files
- **Files:** `src/lib/api-auth.test.ts`, `src/app/api/__tests__/route-auth.test.ts`
- **Verification:** 640/640 tests passing

## Issues Encountered

None

## Next Phase Readiness

**Ready:**
- Stable bug-free foundation for Phase 2 (Security Hardening)
- initAdmin safety already covers the withAuth → createApiHandler migration path
- clearSaveTimer deferred issue from v1.4 now resolved

**Concerns:**
- None

**Blockers:**
- None

---
*Phase: 01-critical-bug-fixes-v15, Plan: 01*
*Completed: 2026-03-10*
