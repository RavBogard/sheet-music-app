---
phase: 01-regression-fixes
plan: 01
subsystem: frontend
tags: [pdfjs, react-pdf, service-worker, cache-busting, ios-safari, firestore-monitor]

requires:
  - phase: v1.3 Phase 4
    provides: useMonitorConnection ref-counting pattern
provides:
  - Cache-busted PDF worker URL eliminates version mismatch after deploys
  - Stable monitor connection on iPad through auth token refresh and tab suspension
affects: []

tech-stack:
  added: []
  patterns:
    - "pdfjs.version-based worker URL for cache busting"
    - "Ref-based uid tracking to prevent effect churn during transient auth nulls"
    - "visibilitychange listener as iOS Safari fallback for beforeunload"

key-files:
  created: []
  modified:
    - scripts/copy-pdf-worker.js
    - src/components/music/PDFViewer.tsx
    - src/lib/pdf-health-scanner.ts
    - src/hooks/use-monitor-connection.ts
    - package.json
    - .gitignore

key-decisions:
  - "Use pdfjs.version in worker URL instead of build-time JSON file"
  - "Ref-based uid tracking instead of restructuring the auth flow"
  - "5s teardown debounce for iPad suspension timing (up from 3s)"

patterns-established:
  - "Versioned static asset URLs for cache busting"
  - "visibilitychange as reconnection trigger for iOS Safari"

duration: ~8min
started: 2026-03-10T13:24:00Z
completed: 2026-03-10T13:32:00Z
---

# Phase 1 Plan 01: Regression Fixes Summary

**Cache-busted PDF worker URL eliminates version mismatch errors; stabilized iPad monitor connection with ref-based uid tracking, visibilitychange listener, and 5s teardown debounce.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~8 min |
| Tasks | 3 completed (2 auto + 1 checkpoint) |
| Files modified | 6 |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: PDF worker version always matches client library | Pass | copy-pdf-worker.js creates versioned file; pdfjs.version used in URL |
| AC-2: Stale PDF worker cannot survive a deploy | Pass | URL includes version — `/pdf.worker.min.5.4.296.mjs` — busts cache on version change |
| AC-3: Monitor connection survives iPad auth token refresh | Pass | prevUidRef prevents effect churn; transient nulls handled by auth listener |
| AC-4: Monitor connection survives iPad tab suspension | Pass | visibilitychange reconnects after iOS suspension; 5s debounce accommodates iPad timing |

## Accomplishments

- PDF worker now copied with versioned filename (`pdf.worker.min.{version}.mjs`) — eliminates stale worker from SW/CDN cache after deploys
- PDFViewer and pdf-health-scanner use `pdfjs.version` to dynamically construct worker URL — guaranteed client/worker version match
- Monitor connection useEffect uses ref-based uid tracking to avoid teardown/reconnect cycles during Firebase token refresh
- Added visibilitychange listener to reconnect monitor after iOS Safari tab suspension (beforeunload doesn't fire)
- Increased teardown debounce from 3s to 5s for iPad suspension timing
- Dev script now runs copy-pdf-worker.js so dev and production stay in sync

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `scripts/copy-pdf-worker.js` | Modified | Creates versioned worker file alongside unversioned |
| `src/components/music/PDFViewer.tsx` | Modified | Worker URL uses `pdfjs.version` for cache busting |
| `src/lib/pdf-health-scanner.ts` | Modified | Same versioned worker URL pattern |
| `src/hooks/use-monitor-connection.ts` | Modified | Ref-based uid, visibilitychange, 5s debounce |
| `package.json` | Modified | Dev script includes copy-pdf-worker |
| `.gitignore` | Modified | Ignore versioned worker files |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Use `pdfjs.version` at runtime instead of build-time JSON | Simpler — version is already available from react-pdf's pdfjs export, no extra file needed | One less build artifact to manage |
| Ref-based uid tracking over restructuring auth flow | Minimal change, targeted fix — auth listener already handles transient nulls with 3s debounce | Effect only fires on genuine uid changes |
| 5s teardown debounce (up from 3s) | iPad tab suspension/restoration is slower than desktop nav transitions | Prevents premature teardown on iPad |

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## Next Phase Readiness

**Ready:**
- Both regressions addressed — deploy to verify in production
- Phase 1 is the only phase in v1.3.1, so milestone is ready for completion

**Concerns:**
- None

**Blockers:**
- None

---
*Phase: 01-regression-fixes, Plan: 01*
*Completed: 2026-03-10*
