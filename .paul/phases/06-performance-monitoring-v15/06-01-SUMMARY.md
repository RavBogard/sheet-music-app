---
phase: 06-performance-monitoring-v15
plan: 01
subsystem: monitoring, testing
tags: [bundle-analyzer, sentry, web-vitals, vitest, component-tests]

requires:
  - phase: 05-ux-accessibility-v15
    provides: Clean UI components ready for monitoring
provides:
  - Bundle analyzer tooling (npm run analyze)
  - Sentry source maps + Web Vitals integration
  - Component tests for PerformanceToolbar and SetlistEditorV2
affects: []

tech-stack:
  added: ["@next/bundle-analyzer", "cross-env"]
  patterns: [conditional-sentry-wrapping, browserTracingIntegration]

key-files:
  created:
    - src/components/performance/__tests__/performance-toolbar.test.tsx
    - src/components/setlist/v2/__tests__/setlist-editor-v2.test.tsx
  modified:
    - next.config.ts
    - sentry.client.config.ts
    - package.json

key-decisions:
  - "Used cross-env for Windows-compatible ANALYZE env var"
  - "Conditional withSentryConfig: only wraps when DSN is set (zero overhead otherwise)"
  - "sourcemaps.disable: false (Sentry v10 API, replaces deprecated hideSourceMaps)"

patterns-established:
  - "Conditional config wrapping: check env var before applying build plugin"

duration: ~15min
completed: 2026-03-10
---

# Phase 6 Plan 01: Performance & Monitoring Summary

**Bundle analyzer, Sentry source maps + Web Vitals, and 12 component tests for PerformanceToolbar and SetlistEditorV2.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~15min |
| Completed | 2026-03-10 |
| Tasks | 3 completed |
| Files modified | 5 |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Bundle Analyzer | Pass | `npm run analyze` script configured with cross-env + @next/bundle-analyzer |
| AC-2: Sentry Source Maps + Web Vitals | Pass | withSentryConfig conditional wrap, browserTracingIntegration added, CSP updated for sentry.io |
| AC-3: Component Test Coverage | Pass | 7 PerformanceToolbar tests + 5 SetlistEditorV2 tests, all passing |

## Accomplishments

- Bundle analyzer configured with cross-env for Windows compatibility (`npm run analyze`)
- Sentry integration completed: conditional withSentryConfig (only active when DSN set), browserTracingIntegration for LCP/FID/CLS/TTFB, CSP connect-src updated for `*.ingest.sentry.io` and `*.sentry.io`
- 12 new component tests: PerformanceToolbar (renders mobile/desktop/sidebar layouts, zoom, annotate, exit) and SetlistEditorV2 (renders name, tracks, empty state, add button, edit permissions)

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `next.config.ts` | Modified | Added withBundleAnalyzer wrapper, withSentryConfig conditional wrap, CSP sentry.io entries |
| `sentry.client.config.ts` | Modified | Added browserTracingIntegration for Web Vitals |
| `package.json` | Modified | Added `analyze` script, `@next/bundle-analyzer` and `cross-env` devDeps |
| `src/components/performance/__tests__/performance-toolbar.test.tsx` | Created | 7 tests: layout rendering, zoom, annotate, exit |
| `src/components/setlist/v2/__tests__/setlist-editor-v2.test.tsx` | Created | 5 tests: name, tracks, empty state, add button, permissions |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Used cross-env for analyze script | Windows compatibility (project develops on Windows) | Works on all platforms |
| Conditional withSentryConfig based on DSN env var | Zero build overhead when Sentry not configured | No impact on dev builds |
| Used sourcemaps config (not deprecated hideSourceMaps) | Sentry v10 API change | Future-proof config |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | Minimal — API naming change |

**Total impact:** Trivial — Sentry v10 renamed `hideSourceMaps` to `sourcemaps` object.

### Auto-fixed Issues

**1. Sentry v10 API change**
- **Found during:** Task 2
- **Issue:** Plan specified `hideSourceMaps: true` but Sentry v10 uses `sourcemaps: { disable: false }` instead
- **Fix:** Used current API: `sourcemaps: { disable: false }`
- **Verification:** `npx tsc --noEmit` passes

## Issues Encountered

None.

## Verification Results

- `npx tsc --noEmit`: clean (0 errors)
- `npx vitest run`: 647/648 pass (1 pre-existing failure in route-auth.test.ts — documented known issue)
- All 12 new tests pass

## Next Phase Readiness

**Ready:**
- v1.5 Phase 6 is the LAST phase — milestone complete
- All 6 phases executed: bugs, security, architecture, quality, UI/UX, monitoring

**Concerns:**
- None

**Blockers:**
- None

---
*Phase: 06-performance-monitoring-v15, Plan: 01*
*Completed: 2026-03-10*
