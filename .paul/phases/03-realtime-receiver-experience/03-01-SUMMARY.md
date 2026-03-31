---
phase: 03-realtime-receiver-experience
plan: 01
subsystem: ui, performance
tags: [offline-indicator, real-time, chart-reload, deployment]

requires:
  - phase: 02-01
    provides: SwapToast, liveState exposure
provides:
  - Offline connectivity indicator
  - Verified end-to-end real-time swap flow
  - v3.0 deployed to Vercel

key-files:
  modified:
    - src/app/perform/setlist/[id]/page.tsx

key-decisions:
  - "navigator.onLine for offline detection (simpler than Firestore fromCache)"
  - "Chart reload handled by React prop propagation (no explicit key remount needed)"

duration: ~5min
completed: 2026-03-30
---

# Phase 3 Plan 01: Real-Time Receiver Experience + Deploy

**Offline indicator + verified chart reload + pushed to Vercel.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~5 min |
| Completed | 2026-03-30 |
| Tasks | 2 completed |
| Files modified | 1 |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Real-time updates propagate | Pass | Already works via useSafeFirestoreSync → tracks update → UI re-renders |
| AC-2: Chart reloads on swap | Pass | PDFOverlay receives new track.fileId via props → PDFViewer loads new URL |
| AC-3: Offline indicator | Pass | navigator.onLine + event listeners → amber banner |
| AC-4: Build + deploy | Pass | tsc + build clean, pushed to origin/main |

## Deviations from Plan

None.

## Next Phase Readiness

**v3.0 Milestone Complete:**
- All 3 phases shipped
- Full live swap flow: director initiates → musicians receive → charts update
- Deployed to CentralReform.live via Vercel

---
*Phase: 03-realtime-receiver-experience, Plan: 01*
*Completed: 2026-03-30*
