---
phase: 03-error-handling
plan: 01
subsystem: runtime
tags: [error-handling, onSnapshot, firestore-listeners, swap]

requires: []
provides:
  - Error handling on swapLiveTrack
  - onSnapshot error callbacks on all production listeners
affects: []

key-files:
  modified:
    - src/lib/setlist-live.ts
    - src/hooks/use-monitor-connection.ts
    - src/lib/setlist-firebase.ts
    - src/lib/musician-profile.ts
    - src/lib/users-firebase.ts
    - src/lib/template-firebase.ts
    - src/app/live/[id]/page.tsx
    - src/components/dashboard/TaskCards.tsx

key-decisions:
  - "firestore-monitor-client.ts already had error callback — skipped"
  - "scheduling-firebase.ts all 4 listeners already had error callbacks — skipped"
  - "notification-store.ts already had error callback — skipped"
  - "template-firebase.ts had silent error callback — added logging"

duration: ~10min
completed: 2026-03-31
---

# Phase 3 Plan 01: Swap Hardening + onSnapshot Error Callbacks Summary

**Added try/catch to swapLiveTrack, added error callbacks to 5 onSnapshot listeners, added logging to 2 existing silent error callbacks.**

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: swapLiveTrack has error handling | Pass | try/catch with logger.error + re-throw |
| AC-2: All onSnapshot calls have error callbacks | Pass | 5 added, 2 got logging, 6 already correct |

## Deviations from Plan

Research identified ~12 missing callbacks; actual count was 5 missing + 2 silent + 6 already correct. No code changes needed for the 6 already-correct files.

---
*Phase: 03-error-handling, Plan: 01*
*Completed: 2026-03-31*
