# Phase 19: Monitor Stabilization & Legibility - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase addresses two stubborn UX issues with the Monitor Mixer:
1. **Flashing / Reloading Loop:** The monitor view flashes to "no monitor assigned" when the network blips, and sometimes the entire page physically reloads.
2. **Channel Name Legibility:** The channel labels below the faders are too dark/small to read comfortably on a mobile phone during a live set.

</domain>

<decisions>
## Implementation Decisions

### 1. Stopping the "No Monitor Assigned" Flash (State Stablization)
- **Root Cause:** When the `useMonitorStore` receives a Firestore snapshot, if the snapshot is momentarily empty (or hasn't received the first full payload from the bridge), `buses` evaluates to `[]`. This causes `myBus` to become `undefined`, which triggers the "No monitor assigned" fallback UI in `QuickMonitorPanel` and `MonitorTabs`, instantly unmounting all the faders.
- **Decision:** Implement a "stale-while-revalidate" or optimistic UI pattern. If we already know the `myBusIndex` and have previously rendered `buses`, we should *not* clear the state just because a single bad snapshot arrived. We should freeze the last known good state until a valid payload arrives.

### 2. Stopping the Page Reload
- **Root Cause:** The global `ErrorBoundary` in `src/components/error-boundary.tsx` contains an automatic recovery script. If Firestore throws `INTERNAL ASSERTION FAILED` (which happens frequently when WebSockets drop on iOS), the Error Boundary catches it, clears the IndexedDB, and physically calls `window.location.reload()`. 
- **Decision:** Remove the `window.location.reload()` from the `ErrorBoundary`. While clearing the corrupted IndexedDB is good, forcing a hard page reload during a live performance is incredibly disruptive. The app should gracefully log the error and allow the user's current React state to persist. 

### 3. Improving Channel Legibility
- **Root Cause:** The channel name `div` at the bottom of `VerticalFaderStrip` uses `text-xs text-zinc-200`. In a dark gig environment, this isn't prominent enough against the dark background.
- **Decision:** Increase the contrast and size. Use `text-sm font-bold text-white`, and optionally add a subtle background pill `bg-zinc-800/50 px-2 py-1 rounded` so it looks like a distinct label tape.

</decisions>

---

*Phase: 19-monitor-stabilization-and-legibility*
*Context gathered: 2026-03-13*