# Plan 19: Monitor Stabilization & Legibility

**Phase:** 19 - Monitor Stabilization & Legibility
**Status:** Ready to execute

## Goal
Stop the entire page from reloading during intermittent network drops, prevent the monitor faders from unmounting/flashing during empty snapshots, and improve the legibility of the channel names on mobile devices.

## Requirements
- ✓ Remove `window.location.reload()` from `src/components/error-boundary.tsx` for Firestore assertion errors.
- ✓ Update `setSnapshot` in `src/lib/monitor-store.ts` to ignore empty snapshots if we already have valid bus data (stale-while-revalidate).
- ✓ Improve the text styling for the channel labels in `VerticalFaderStrip.tsx`.

## Proposed Changes

### 1. `src/components/error-boundary.tsx` (Stop the Reload)
- **Task**: Remove disruptive reload.
- **Action**: In `componentDidCatch`, when detecting `INTERNAL ASSERTION FAILED`, keep the `clearFirestoreIndexedDB()` call but remove the `.then(() => window.location.reload())` fallback. The app should stay visually stable.

### 2. `src/lib/monitor-store.ts` (Stop the Flash)
- **Task**: Prevent "no monitor assigned" unmounting.
- **Action**: In the `setSnapshot` function, add a check: if `snapshot.buses.length === 0` AND `state.buses.length > 0`, skip updating `buses`, `channels`, and `matrices` to prevent wiping out the UI during a transient empty read.

### 3. `src/components/monitor/VerticalFaderStrip.tsx` (Improve Legibility)
- **Task**: Make channel names pop.
- **Action**: Change the channel name container from `text-xs font-bold text-zinc-200` to `text-sm font-bold text-white bg-zinc-800/80 px-1.5 py-0.5 rounded shadow-sm`.
- **Action**: Make the container a little wider if needed, or rely on `min-w-0` to let it flex correctly.

## Verification Criteria
- [ ] No `window.location.reload()` exists in `error-boundary.tsx`.
- [ ] Monitor channel names are bright white, slightly larger, and sit on a dark pill background.
- [ ] `useMonitorStore` gracefully rejects empty snapshots to protect the UI.