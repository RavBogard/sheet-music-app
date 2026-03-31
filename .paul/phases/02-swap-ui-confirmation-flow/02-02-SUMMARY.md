---
phase: 02-swap-ui-confirmation-flow
plan: 02
subsystem: ui, performance
tags: [swap-toast, notification, live-swap, accessibility]

requires:
  - phase: 02-01
    provides: liveState exposure in useSetlistPerformance
provides:
  - SwapToast receiver notification for musicians
affects: [phase-3-receiver]

key-files:
  created:
    - src/components/performance/SwapToast.tsx
  modified:
    - src/app/perform/setlist/[id]/page.tsx

key-decisions:
  - "SwapToast deduplicates via swapId ref (prevents re-showing on re-renders)"
  - "role=status + aria-live=polite for screen reader accessibility"

duration: ~8min
completed: 2026-03-30
---

# Phase 2 Plan 02: SwapToast Receiver Notification

**Auto-dismissing 4s amber toast notifies musicians when a song is swapped by the director.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~8 min |
| Completed | 2026-03-30 |
| Tasks | 2 completed (1 auto + 1 checkpoint) |
| Files created | 1 |
| Files modified | 1 |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Toast appears for non-initiating musicians | Pass | Checks swappedBy !== user.uid |
| AC-2: Toast NOT shown for swap initiator | Pass | Early return when UIDs match |
| AC-3: Deduplication via swapId | Pass | lastSwapId ref prevents re-showing |
| AC-4: Build passes | Pass | tsc + next build clean |

## Deviations from Plan

- Minor: `useRef<ReturnType<typeof setTimeout>>()` needed initial `null` value for strict mode. Fixed immediately.

## Next Phase Readiness

**Ready:**
- Phase 2 complete — full swap UI + receiver notification
- Phase 3 (Real-Time Receiver Experience) can refine edge cases

**Blockers:** None

---
*Phase: 02-swap-ui-confirmation-flow, Plan: 02*
*Completed: 2026-03-30*
