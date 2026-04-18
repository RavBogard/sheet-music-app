---
phase: 05-monitor-buses-investigation
plan: 01
subsystem: monitor, admin
tags: [monitor, bus-assignment, firestore, admin-ui]

requires:
  - phase: none
    provides: standalone fix
provides:
  - Bus count badge in admin Sound System section
  - Current user always visible in bus assignment dropdown
affects: []

tech-stack:
  added: []
  patterns: [ensure-current-user-in-list pattern from MusicianPicker]

key-files:
  created: []
  modified:
    - src/components/admin/SoundSystemSection.tsx
    - src/components/monitor/BusAssignmentPanel.tsx

key-decisions:
  - "Missing 5th bus was Firestore data issue, not code bug"
  - "Added bus count badge for easy diagnosis of bus misconfiguration"
  - "Current user injected into bus assignment list if missing (same pattern as MusicianPicker)"

patterns-established: []

duration: ~15min
started: 2026-03-11T15:15:00Z
completed: 2026-03-11T15:30:00Z
---

# Phase 5 Plan 1: Monitor Buses Investigation Summary

**Fixed missing 5th monitor bus (Firestore data), added bus count badge in admin, and fixed self-assignment in bus assignment dropdown.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~15min |
| Tasks | 3 completed (1 checkpoint + 2 auto) |
| Files modified | 2 |
| Commit | 2a7a2fd |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Correct bus count in Firestore | Pass | User verified and fixed: [1,2,3,4] → [1,2,3,4,5] |
| AC-2: Bus count visible in admin | Pass | Badge shows "N buses" next to Monitor Buses input |

## Additional Fix: Monitor Self-Assignment

User reported they couldn't assign themselves to a monitor bus. Root cause: `BusAssignmentPanel` filtered users by role but didn't ensure the current user was included. Applied same pattern as `MusicianPicker` — inject current user if missing from list.

## Task Commits

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Task 1: Firestore verification | manual | data | User added 5th bus to config/monitor |
| Task 2: Bus count badge | `2a7a2fd` | fix | Badge next to Monitor Buses input |
| Task 3: Self-assignment fix | `2a7a2fd` | fix | Current user always in assignment list |

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/components/admin/SoundSystemSection.tsx` | Modified | Bus count badge next to input |
| `src/components/monitor/BusAssignmentPanel.tsx` | Modified | Inject current user into assignment list |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Data fix, not code fix | Firestore had [1,2,3,4] — code defaults to 5 correctly | No code change needed for bus count |
| Add count badge | Makes misconfiguration immediately visible | Better admin UX |
| Self-assignment fix | Current user was filtered out if role didn't match | All users can assign themselves |

## Deviations from Plan

Added self-assignment fix (Task 3) beyond original plan scope — user reported during session.

## Issues Encountered

None.

## Next Phase Readiness

**Ready:**
- All v1.7 phases complete
- Monitor buses working with 5 buses
- Self-assignment working

**Concerns:**
- None

**Blockers:**
- None

---
*Phase: 05-monitor-buses-investigation, Plan: 01*
*Completed: 2026-03-11*
