---
phase: 03-test-infrastructure-flaky-fix
plan: 01
subsystem: testing
tags: [vitest, factories, mocks, flaky-test, beforeAll]

requires:
  - phase: 02-hostname-validation
    provides: passing test suite baseline (657 tests)
provides:
  - shared test factories for SetlistTrack, UserProfile, Setlist, SchedulingAssignment
  - reusable Firebase Admin mock module
  - reusable API route test helpers (makeReq, rateLimitMock, loggerMock)
  - flaky route-auth publish test fixed
affects: [04-data-layer-tests, 05-api-route-tests, 06-hook-tests, 07-component-tests, 08-ai-module-tests]

tech-stack:
  added: []
  patterns: [beforeAll dynamic import for route handlers, shared mock objects with vi.mock at file scope]

key-files:
  created:
    - src/__tests__/factories.ts
    - src/__tests__/mock-firebase-admin.ts
    - src/__tests__/api-test-helpers.ts
  modified:
    - src/app/api/__tests__/route-auth.test.ts

key-decisions:
  - "Mock objects exported from helper modules, vi.mock() calls stay in consuming test files (vitest hoisting requirement)"
  - "beforeAll dynamic import pattern to eliminate cold-start flakiness"

patterns-established:
  - "Factory pattern: createX(overrides?: Partial<X>) with spread merge, incrementing IDs"
  - "Route test pattern: let handler + beforeAll import, shared mock objects"

duration: ~5min
started: 2026-03-11T16:09:00Z
completed: 2026-03-11T16:10:00Z
---

# Phase 3 Plan 01: Test Infrastructure & Flaky Fix Summary

**Shared test factories, Firebase Admin mocks, and API helpers established; flaky publish test fixed (367ms → 4ms via beforeAll import pattern)**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~5min |
| Started | 2026-03-11T16:09:00Z |
| Completed | 2026-03-11T16:10:00Z |
| Tasks | 3 completed |
| Files modified | 4 (3 created, 1 modified) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Route-auth publish test no longer flaky | Pass | 367ms → 4ms via beforeAll import |
| AC-2: Mock factories produce valid typed objects | Pass | 4 factories, tsc --noEmit clean |
| AC-3: Firebase Admin mock is reusable | Pass | firebaseAdminMock, mockFirestore, mockAuth exported |
| AC-4: API test helpers simplify route testing | Pass | makeReq, rateLimitMock, loggerMock exported |
| AC-5: Existing tests still pass | Pass | 657/657 tests pass |
| AC-6: Route-auth test uses shared helpers | Pass | All local helpers replaced with shared imports |

## Accomplishments

- Created 4 typed factory functions (createTrack, createUserProfile, createSetlist, createAssignment) with Partial<T> override pattern
- Extracted Firebase Admin mocks and API test helpers into reusable modules for Phases 4-8
- Fixed flaky publish test: cold dynamic import (367ms) replaced with beforeAll pattern (4ms)
- Refactored route-auth.test.ts to use shared helpers — same 9 tests, same assertions, cleaner setup

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/__tests__/factories.ts` | Created | Mock factory functions for 4 model types |
| `src/__tests__/mock-firebase-admin.ts` | Created | Shared Firebase Admin mock objects + mockAuth helper |
| `src/__tests__/api-test-helpers.ts` | Created | makeReq, rateLimitMock, loggerMock for API route tests |
| `src/app/api/__tests__/route-auth.test.ts` | Modified | Refactored to use shared helpers + beforeAll imports |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Mock objects exported, vi.mock stays in test file | Vitest hoists vi.mock to top of file — can't encapsulate in helper | Each test file needs ~3 lines of vi.mock boilerplate |
| beforeAll import instead of per-test import | Eliminates cold-start penalty on first dynamic import | All describe blocks with route handlers use this pattern |
| resetFactoryCounter exported but optional | Counter ensures unique IDs across multiple calls | Tests can reset if ID determinism matters |

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## Next Phase Readiness

**Ready:**
- Factories available for all test phases (4-8) to construct typed test data
- Firebase Admin mock pattern established for API route tests (Phase 5)
- API test helpers ready for route handler testing (Phase 5)
- All 657 tests passing as baseline

**Concerns:**
- None

**Blockers:**
- None

---
*Phase: 03-test-infrastructure-flaky-fix, Plan: 01*
*Completed: 2026-03-11*
