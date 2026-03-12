---
phase: 02-nextjs-sentry-deprecations
plan: 01
subsystem: infra
tags: [nextjs, sentry, turbopack, deprecation]

requires:
  - phase: 01-setlist-row-layout
    provides: clean baseline for v2.6
provides:
  - zero deprecation warnings on next build
  - sentry client-side error instrumentation
  - global React error boundary with Sentry reporting
affects: []

tech-stack:
  added: []
  patterns: [conditional sentry init via env var]

key-files:
  created:
    - src/proxy.ts (renamed from middleware.ts)
    - src/instrumentation-client.ts
    - src/app/global-error.tsx
  modified:
    - src/app/api/ai/transposer/scan/route.ts

key-decisions:
  - "Next.js 16 proxy requires export function proxy() not just file rename"

patterns-established:
  - "Conditional Sentry init: only when NEXT_PUBLIC_SENTRY_DSN is set"

duration: ~10min
completed: 2026-03-12T19:30:00Z
---

# Phase 2 Plan 01: Next.js & Sentry Deprecation Cleanup Summary

**Eliminated all Next.js 16 build deprecation warnings and added Sentry client-side error instrumentation.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~10min |
| Completed | 2026-03-12 |
| Tasks | 2 completed |
| Files modified | 4 |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: middleware renamed to proxy | Pass | File renamed + function export renamed to `proxy()` |
| AC-2: Stale config export removed | Pass | Pages Router `config` block deleted, `maxDuration` preserved |
| AC-3: Sentry client instrumentation | Pass | `instrumentation-client.ts` created with conditional init |
| AC-4: Global error boundary | Pass | `global-error.tsx` with Sentry.captureException + reset button |

## Accomplishments

- Renamed `middleware.ts` → `proxy.ts` with function export rename for Next.js 16 Turbopack compatibility
- Removed stale Pages Router `config` export from AI transposer scan route
- Created `instrumentation-client.ts` with conditional Sentry init (only when DSN set)
- Created `global-error.tsx` with Sentry error reporting and user-facing recovery UI

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/proxy.ts` | Renamed from middleware.ts | Next.js 16 proxy convention (function also renamed) |
| `src/app/api/ai/transposer/scan/route.ts` | Modified | Removed stale Pages Router config export |
| `src/instrumentation-client.ts` | Created | Sentry client-side error capture |
| `src/app/global-error.tsx` | Created | React render error boundary with Sentry |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Rename function to `proxy()` | Next.js 16 requires named `proxy` export, not just file rename | Essential for build to succeed |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | Essential — build failed without it |

### Auto-fixed Issues

**1. Function export name must be `proxy()` not `middleware()`**
- **Found during:** Task 1 (build verification)
- **Issue:** Next.js 16 requires the exported function to match the convention name
- **Fix:** Renamed `export function middleware()` → `export function proxy()`
- **Verification:** Clean build after rename

## Verification Results

- `npx tsc --noEmit` — zero type errors
- `npx next build` — zero deprecation warnings, clean build
- `npx vitest run` — 84 test files, 1117 tests all passing

## Next Phase Readiness

**Ready:**
- Clean build baseline for Phase 3 (Technical Debt Cleanup)
- All deprecation warnings eliminated

**Concerns:**
- None

**Blockers:**
- None

---
*Phase: 02-nextjs-sentry-deprecations, Plan: 01*
*Completed: 2026-03-12*
