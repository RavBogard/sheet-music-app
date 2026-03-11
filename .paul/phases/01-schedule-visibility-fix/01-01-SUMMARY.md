---
phase: 01-schedule-visibility-fix
plan: 01
subsystem: ui
tags: [firestore, schedule, subscriptions]

requires: []
provides:
  - Schedule page shows all upcoming setlists regardless of assignment status
  - subscribeToUpcomingSetlists subscription function
affects: []

tech-stack:
  added: []
  patterns: [dual-subscription merge for schedule data]

key-files:
  created: []
  modified:
    - src/lib/scheduling-firebase.ts
    - src/app/(main)/schedule/page.tsx

key-decisions:
  - "Merge setlists-first then layer assignments on top (setlists are source of truth for services)"

patterns-established:
  - "Schedule page subscribes to both setlists and assignments, merging by setlist ID"

duration: ~5min
completed: 2026-03-11
---

# Phase 1 Plan 1: Schedule Visibility Fix Summary

**Schedule page now subscribes to upcoming setlists directly, showing all future services with or without musician assignments.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~5min |
| Completed | 2026-03-11 |
| Tasks | 2 completed |
| Files modified | 2 |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Setlists appear regardless of assignments | Pass | Page subscribes to setlists collection directly |
| AC-2: Assigned services display musicians correctly | Pass | Assignment data layered on top of setlist data |
| AC-3: Past services not shown | Pass | Query filters eventDate >= today |

## Accomplishments

- Added `subscribeToUpcomingSetlists` — real-time subscription to all public setlists with future eventDates
- Updated schedule page to merge both data sources (setlists-first, assignments layered)
- Services without assignments show "No musicians assigned yet" indicator

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/lib/scheduling-firebase.ts` | Modified | Added `subscribeToUpcomingSetlists` function |
| `src/app/(main)/schedule/page.tsx` | Modified | Dual subscription, merged servicesBySetlist memo, empty-assignment indicator |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Setlists-first merge strategy | Setlists are the source of truth for services; assignments are supplementary | All future services visible even before musicians assigned |

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## Next Phase Readiness

**Ready:**
- Phase 1 complete, schedule bug fixed
- Phase 2 (Gig Packet Modal Layout Fix) ready to plan

**Concerns:**
- None

**Blockers:**
- None

---
*Phase: 01-schedule-visibility-fix, Plan: 01*
*Completed: 2026-03-11*
