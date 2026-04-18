# Phase 17: Mobile UX & Monitor Stability - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase addresses two major categories of UX friction reported on live devices:
1. **Setlist Editor Mobile View:** The `SetlistEditorV2` layout is too wide on mobile phones, causing elements to be pushed "too far over and hard to see." This requires a responsive UI pass.
2. **Monitor Mix Stability & Layout:** The Monitor Mix popup (and the full `/monitor` page) is reloading too frequently, interrupting the user. Additionally, the channel names in the mobile view are hard to read and need to be repositioned (e.g., underneath the mute bar) with better horizontal scrolling for high channel counts.

All UI changes must comply with the `.claude/skills/ui-ux-pro-max/SKILL.md` guidelines.

</domain>

<decisions>
## Implementation Decisions

### 1. Mobile Setlist Editor View
- **Decision:** Audit `SetlistEditorV2.tsx`, `SongRow.tsx`, and `SetlistTopBar.tsx` for hardcoded widths, excessive padding, or flex layouts that don't wrap correctly on small screens (e.g., `< sm:` breakpoints).
- **Decision:** Ensure the drag handle, title, key, and action buttons fit within a `375px` viewport without horizontal scrolling (a key `ui-ux-pro-max` rule).

### 2. Monitor Mix Reload Bug
- **Decision:** Investigate why `/monitor` and the popup are reloading. This is likely caused by the WebSocket bridge aggressively throwing exceptions or the React components lacking a stable `useMemo`/`useCallback` dependency array, triggering full component remounts.
- **Decision:** Audit `useMonitorConnection.ts` and the `VerticalFaderStrip` component for unstable references.

### 3. Monitor Mobile Layout (Channel Names)
- **Decision:** In `VerticalFaderStrip.tsx` (or similar), reposition the channel label to sit *below* the mute button to save horizontal space.
- **Decision:** Ensure the parent container of the faders has `flex overflow-x-auto overflow-y-hidden snap-x` to provide a smooth, native horizontal scrolling experience on mobile when there are many channels.

</decisions>

<code_context>
## Existing Code Insights

### Targets for Modification
- `src/components/setlist/v2/SongRow.tsx` (Mobile layout for rows)
- `src/components/monitor/VerticalFaderStrip.tsx` (Channel name placement)
- `src/components/monitor/MonitorMixer.tsx` (Horizontal scroll container)
- `src/hooks/use-monitor-connection.ts` (Reloading bug investigation)

</code_context>

---

*Phase: 17-mobile-ux-and-monitor-stability*
*Context gathered: 2026-03-13*