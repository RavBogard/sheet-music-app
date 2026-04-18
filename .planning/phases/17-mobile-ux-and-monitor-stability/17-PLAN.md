# Plan 17: Mobile UX & Monitor Stability

**Phase:** 17 - Mobile UX & Monitor Stability
**Status:** Ready to execute

## Goal
Fix mobile layout issues in the Setlist Editor, redesign the Monitor Mix faders for mobile, and resolve the Monitor Mix auto-reloading bug.

## Requirements
- ✓ The Setlist Editor (`SongRow.tsx`) must fit comfortably within a 375px mobile viewport without horizontal scrolling or elements being squished.
- ✓ The Monitor Mix page and popup must stop reloading automatically.
- ✓ The `VerticalFaderStrip` channel labels must be moved below the mute button for better legibility on mobile.
- ✓ The `MonitorMixer` component must support smooth horizontal scrolling for high channel counts on mobile.

## Proposed Changes

### 1. `src/components/setlist/v2/SongRow.tsx` (Mobile Editor Layout)
- **Task**: Audit and fix mobile padding/margins.
- **Action**: Check the main `div` wrapper. Reduce padding on `xs` and `sm` screens (e.g., use `p-2 sm:p-4`).
- **Action**: Check the grid/flex layout of the row contents (title, key, tempo). If it's a tight flex row, ensure it wraps gracefully or uses `truncate` so it doesn't push the action buttons off-screen.

### 2. `src/components/monitor/VerticalFaderStrip.tsx` (Fader UX)
- **Task**: Relocate channel name.
- **Action**: Currently, the name might be at the top or sideways. Move the `div` containing `channel.name` to render underneath the `Mute` button at the bottom of the strip.
- **Action**: Ensure the strip has a fixed, narrow width (e.g., `w-16` or `w-20`) so many can fit side-by-side.

### 3. `src/components/monitor/MonitorMixer.tsx` (Horizontal Scroll)
- **Task**: Improve horizontal scrolling.
- **Action**: Wrap the list of `VerticalFaderStrip` components in a `div` with `flex gap-2 overflow-x-auto overflow-y-hidden snap-x pb-4 scrollbar-hide`.
- **Action**: Add `snap-center` or `snap-start` to the fader strips if appropriate.

### 4. `src/hooks/use-monitor-connection.ts` (Reload Bug)
- **Task**: Find and remove `window.location.reload()`.
- **Action**: The hook or `MonitorClient` might have a `setTimeout` or `WebSocket` error handler that calls `window.location.reload()` aggressively when the bridge disconnects.
- **Action**: Remove any `reload()` calls. The app should gracefully degrade to an "Offline" state (which we have tests for) and attempt to reconnect silently in the background via the Bridge Client.

## Verification Criteria
- [ ] No horizontal scrolling on the setlist editor at 375px.
- [ ] Fader channel names are below the mute button.
- [ ] Faders scroll smoothly horizontally on mobile.
- [ ] Disconnecting the bridge does NOT cause a page reload.