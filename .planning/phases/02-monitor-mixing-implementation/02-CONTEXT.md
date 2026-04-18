# Phase 2: Monitor Mixing Implementation - Context

**Gathered:** 2026-03-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the full monitor mixing experience: configure mode for setup, live mode for performance, sound engineer pre-configuration, and bulletproof bridge reliability. Musicians can adjust their personal monitor mix from their tablets during rehearsal and services. Requirements: MIX-01 through MIX-11.

</domain>

<decisions>
## Implementation Decisions

### Configure mode vs Live mode
- **Configure mode** = the full Monitor tab/page (`/monitor`). Shows all X32 channels. Musicians can star/unstar channels here. Used before a service or anytime a musician wants to adjust their setup.
- **Live mode** = compact popup triggered from within setlists and chart/PDF views. Shows only starred channels. This is the in-performance experience.
- Musicians can navigate to the full Monitor tab mid-service if they need to add a channel they didn't star — this is allowed, not blocked.
- These are navigation-based modes, not an explicit toggle. Where you are determines what you see.

### Channel visibility and starring
- Sound engineer configures a default set of 5-8 channels that appear for ALL musicians across all buses (same default list for everyone — e.g., vocals, keys, guitar, bass, drums L, drums R).
- Musicians see these defaults in their live popup automatically.
- Musicians can add more channels beyond the defaults from the full Monitor tab (configure mode).
- Starring is persisted per-musician so their customizations survive across sessions.

### Live popup layout
- Vertical faders side by side (traditional mixer strip layout).
- Each strip shows: channel name, vertical fader, mute button. Nothing else — no macros, no "More Me!" button.
- Horizontal scroll if faders exceed screen width, but typically 5-8 channels + master fader fits without scrolling.
- Master bus fader is included in the live popup.

### Monitor access points
- 1-2 taps from within setlist view and chart/PDF view. These are the two places it matters.
- NOT required to be 1-2 taps from every screen in the app (home, library, admin, etc.).
- The existing QuickMonitorPanel in PerformanceToolbar is the right integration point — simplify it to match the decisions above (remove "More Me!" macro, keep faders + mute only).

### Connection status and degradation
- When X32 is unreachable, show a clear indicator that it's not reachable right now.
- All non-monitor features continue working normally — setlist, PDFs, library, everything.
- Monitor UI can show last-known fader positions but should make it obvious that controls aren't live.
- Keep the indicator visible but not distracting — musicians shouldn't panic mid-service.

### Sound engineer workflow
- Sound engineer assigns musicians to buses (existing BusAssignmentPanel).
- Sound engineer selects the default 5-8 visible channels (new — one global list, not per-bus).
- This configuration lives in Firestore `config/monitor` alongside existing bridge config.

### Claude's Discretion
- Exact UI layout and styling of the configure mode page
- How the "star" interaction works in configure mode (checkbox, star icon, toggle, etc.)
- Connection status indicator design (dot, banner, icon — as long as it's clear but not distracting)
- How last-known fader values are displayed when disconnected
- Bridge hardening implementation details (reconnection timing, heartbeat intervals, etc.)
- Whether the live popup is a popover, slide-up sheet, or drawer

</decisions>

<specifics>
## Specific Ideas

- Configure mode is the Monitor tab; live mode is what pops up when you tap the monitor button from within a setlist or chart — navigation determines the mode, not a toggle.
- Fader layout should look like a real mixer — vertical strips side by side. Musicians already have this mental model from physical consoles and Mixing Station.
- The default channel list from the sound engineer should cover the common case so most musicians never need to customize.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/monitor/FaderStrip.tsx`: Core fader UI with pointer-based dragging, throttled writes, optimistic updates. Keep and use as-is.
- `src/components/monitor/QuickMonitorPanel.tsx`: Existing compact mixer in PerformanceToolbar. Needs simplification — remove "More Me!" macro, keep faders + mute only. Becomes the live mode popup.
- `src/components/monitor/ConnectionIndicator.tsx`: Connection status display. Adapt for the degradation UX.
- `src/components/monitor/BusAssignmentPanel.tsx`: Bus-to-musician assignment. Keep, extend with default channel list configuration.
- `src/components/monitor/MatrixPanel.tsx`: Matrix output controls for sound engineers. Keep as-is.
- `src/app/(main)/monitor/page.tsx`: Main monitor page. Becomes the configure mode — needs starring UX added.
- `src/lib/firestore-monitor-client.ts`: Firestore transport with command throttling (50ms per parameter). Production-ready.
- `src/lib/monitor-store.ts`: Zustand store for mixer state. Extend with starred channels and default channel config.
- `src/hooks/use-monitor-connection.ts`: Singleton connection manager (reference-counted). Keep.
- `src/hooks/use-monitor-access.ts`: Role-based access control. Keep.
- `src/components/admin/MonitorSetupWizard.tsx`: 3-step setup wizard. Keep for initial bridge configuration.
- `src/components/admin/SoundSystemSection.tsx`: Admin config UI. Extend with default channel list picker.

### Established Patterns
- Firestore-only transport: iPad writes commands to `monitor-live/commands/pending`, bridge reads and deletes. Bridge writes state to `monitor-live/state`, iPads read via onSnapshot. Zero iPad configuration.
- FaderStrip throttles writes at 100ms intervals (max 10 updates/sec). Optimistic UI for immediate feedback.
- QuickMonitorPanel uses pinning (persisted to user preferences) — this becomes the starring mechanism.
- Access control: admin OR soundEngineer flag OR has bus assigned = access granted.

### Integration Points
- `config/monitor` Firestore doc: Add `defaultChannels: number[]` field for the engineer's default visible channel list.
- `UserProfile` or user preferences: Store per-musician starred channels (may already be partially implemented via QuickMonitorPanel pinning).
- `PerformanceToolbar.tsx`: Already integrates QuickMonitorPanel as a popover — this is the live mode access point from setlists.
- PDF viewer: Needs a monitor access button added (1-2 taps to open live popup from within a chart).
- Bridge (`bridge/src/`): Hardening for auto-reconnect, heartbeat, and resilience — existing code has foundations (60s heartbeat loop, sleep/wake detection, IP change detection).

</code_context>

<deferred>
## Deferred Ideas

- **Mix presets** (save/recall personal mixes) — v2 feature (MIX-V2-01)
- **"More Me!" macro** — removed from live popup for simplicity. Could revisit in v2 if musicians request it.
- **Per-bus default channel lists** — keeping it simple with one global default list. If buses need different defaults later, that's a future enhancement.
- **Live follow mode** (leader advances all views) — v2 feature (PERF-V2-01)

</deferred>

---

*Phase: 02-monitor-mixing-implementation*
*Context gathered: 2026-03-07*
