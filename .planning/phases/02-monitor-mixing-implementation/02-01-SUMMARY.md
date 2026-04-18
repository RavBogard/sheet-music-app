---
phase: 02-monitor-mixing-implementation
plan: 01
subsystem: ui
tags: [zustand, firestore, monitor, starring, channels, configure-mode]

# Dependency graph
requires:
  - phase: 01-monitor-research-code-audit
    provides: "Validated Firestore transport architecture, MonitorConfig types, monitor store, QuickMonitorPanel pinning pattern"
provides:
  - "MonitorConfig.defaultChannels field in both web and bridge types"
  - "getVisibleChannels pure function for computing live mode channel visibility"
  - "starredChannels/defaultChannels state in monitor store with setters"
  - "Configure mode UI with star toggle for all channels on Monitor page"
  - "DefaultChannelPicker component for sound engineer global default selection"
  - "15 unit tests covering visible-channels, channel-starring, default-channels logic"
affects:
  - phase-02-plan-02-live-mode-popup
  - phase-02-plan-03-bridge-hardening

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "getVisibleChannels: pure function union of defaults + starred, filtered to bus sends"
    - "Starring uses existing pinnedChannels Firestore field, star terminology in UI only"
    - "DefaultChannelPicker saves to config/monitor.defaultChannels via updateDoc"
    - "Monitor page shows all bus sends in configure mode (not just active ones)"

key-files:
  created:
    - src/components/monitor/DefaultChannelPicker.tsx
    - src/components/monitor/__tests__/visible-channels.test.ts
    - src/components/monitor/__tests__/channel-starring.test.ts
    - src/components/monitor/__tests__/default-channels.test.ts
  modified:
    - src/types/monitor.ts
    - bridge/src/types.ts
    - src/lib/monitor-store.ts
    - src/app/(main)/monitor/page.tsx
    - src/components/admin/SoundSystemSection.tsx

key-decisions:
  - "Keep pinnedChannels Firestore field name, use star terminology in UI only -- avoids data migration"
  - "Show ALL bus sends in configure mode (not just active ones) so musicians can star any channel"
  - "DefaultChannelPicker integrated in both monitor page engineer section and admin SoundSystemSection"

patterns-established:
  - "Channel visibility: getVisibleChannels(defaults, starred, busSends) -> filtered union"
  - "Star toggle: immediate Firestore persist via setDoc merge on pinnedChannels"
  - "Default badge: small violet badge on engineer-selected default channels"

requirements-completed: [MIX-01, MIX-02, MIX-03, MIX-05, MIX-06]

# Metrics
duration: 5min
completed: 2026-03-08
---

# Phase 02 Plan 01: Configure Mode Data Layer and UI Summary

**Channel starring UX on Monitor page with getVisibleChannels pure function, DefaultChannelPicker for sound engineer defaults, and 15 unit tests for visibility logic**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-08T02:08:04Z
- **Completed:** 2026-03-08T02:13:30Z
- **Tasks:** 2/2
- **Files modified:** 9 (4 created, 5 modified)

## Accomplishments

- Extended MonitorConfig type with `defaultChannels?: number[]` in both web and bridge type files
- Created `getVisibleChannels` pure function that computes union of default + starred channels, filtered to bus sends, with deduplication
- Added `starredChannels`, `defaultChannels`, and their setters to the Zustand monitor store
- Monitor page (configure mode) now shows ALL channels with star/unstar toggle and default channel badges
- Created DefaultChannelPicker component for sound engineers to set global default visible channels
- 15 new unit tests covering all edge cases for visible-channels, channel-starring, and default-channels logic

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend types, store, and visible-channels logic with tests** - `e8125d1` (feat, TDD)
2. **Task 2: Configure mode UI and DefaultChannelPicker** - `1deca54` (feat)

## Files Created/Modified

- `src/types/monitor.ts` -- Added `defaultChannels?: number[]` to MonitorConfig interface
- `bridge/src/types.ts` -- Mirrored `defaultChannels?: number[]` addition
- `src/lib/monitor-store.ts` -- Added `getVisibleChannels` pure function, `starredChannels`/`defaultChannels` state, `setStarredChannels`/`setDefaultChannels` actions
- `src/app/(main)/monitor/page.tsx` -- Configure mode with star toggle on all channels, default badge, Firestore persistence, DefaultChannelPicker in engineer section
- `src/components/monitor/DefaultChannelPicker.tsx` -- New component: checklist UI for engineer to select global default visible channels, persists to config/monitor.defaultChannels
- `src/components/admin/SoundSystemSection.tsx` -- Integrated DefaultChannelPicker into admin panel
- `src/components/monitor/__tests__/visible-channels.test.ts` -- 6 tests for getVisibleChannels edge cases
- `src/components/monitor/__tests__/channel-starring.test.ts` -- 4 tests for store starring state
- `src/components/monitor/__tests__/default-channels.test.ts` -- 5 tests for store default channels state

## Decisions Made

1. **Keep pinnedChannels Firestore field name.** Use "star" terminology only in the UI. This avoids a data migration for a cosmetic change, per RESEARCH.md recommendation.
2. **Show ALL bus sends in configure mode.** Previously only active channels (non-zero level) were shown. Configure mode needs all channels visible so musicians can star any channel they might need.
3. **DefaultChannelPicker in two locations.** Placed in both the Monitor page engineer section and the admin SoundSystemSection for accessibility from either context.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. The 5 pre-existing failures in `bridge/src/__tests__/reconnect.test.ts` are unrelated to this plan's changes (bridge message handler registration issue).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 02 (live mode popup) can consume `getVisibleChannels`, `starredChannels`, and `defaultChannels` from the monitor store
- The starring persistence and Firestore patterns are established and tested
- DefaultChannelPicker handles the engineer workflow that Plan 02's live popup will read from

## Self-Check: PASSED

All 9 files verified as present. Both task commits (e8125d1, 1deca54) confirmed in git log.

---
*Phase: 02-monitor-mixing-implementation*
*Completed: 2026-03-08*
