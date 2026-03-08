# Phase 2: Monitor Mixing Implementation - Research

**Researched:** 2026-03-07
**Domain:** X32 Monitor Mixing UI, Firestore Transport, Bridge Hardening
**Confidence:** HIGH

## Summary

Phase 2 builds the complete monitor mixing experience on top of an already-solid foundation. Phase 1 delivered a working bridge with Firestore transport, X32 OSC client, FaderStrip component, QuickMonitorPanel, BusAssignmentPanel, ConnectionIndicator, and the full singleton connection architecture. The existing code handles the hard parts (OSC protocol, Firestore command/state pipeline, throttling, optimistic UI, auth). This phase focuses on reshaping existing components to match the decided UX (configure mode vs live mode, starring, vertical faders in live popup, default channel lists, PDF view access point) and hardening the bridge for zero-intervention reliability.

The codebase is in excellent shape for this work. QuickMonitorPanel already has pinning (starring) infrastructure persisted to Firestore. The monitor page already shows all channels. The PerformanceToolbar already hosts the QuickMonitorPanel in a popover. The main work is: (1) convert FaderStrip to vertical layout for live popup, (2) add starring UX to the monitor page (configure mode), (3) add sound engineer default channel list, (4) simplify QuickMonitorPanel (remove "More Me!" macro), (5) add monitor access from PDF view, (6) harden bridge reconnection and status indicators.

**Primary recommendation:** Restructure existing components rather than building new ones. The pinning/starring persistence, fader interaction, and connection management already work. Focus implementation on UI reshaping and bridge hardening.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Configure mode = full Monitor tab/page (`/monitor`). Shows all X32 channels. Musicians can star/unstar channels here. Used before a service or anytime a musician wants to adjust their setup.
- Live mode = compact popup triggered from within setlists and chart/PDF views. Shows only starred channels. This is the in-performance experience.
- Musicians can navigate to the full Monitor tab mid-service if they need to add a channel they didn't star -- this is allowed, not blocked.
- Navigation-based modes, not an explicit toggle. Where you are determines what you see.
- Sound engineer configures a default set of 5-8 channels that appear for ALL musicians across all buses (same default list for everyone).
- Musicians see these defaults in their live popup automatically.
- Musicians can add more channels beyond the defaults from the full Monitor tab (configure mode).
- Starring is persisted per-musician so their customizations survive across sessions.
- Vertical faders side by side (traditional mixer strip layout) in live popup.
- Each strip shows: channel name, vertical fader, mute button. Nothing else -- no macros, no "More Me!" button.
- Horizontal scroll if faders exceed screen width, but typically 5-8 channels + master fader fits without scrolling.
- Master bus fader is included in the live popup.
- Monitor access from setlist view and chart/PDF view in 1-2 taps. NOT required from every screen.
- The existing QuickMonitorPanel in PerformanceToolbar is the right integration point -- simplify it.
- When X32 is unreachable, show clear indicator. All non-monitor features continue working.
- Monitor UI can show last-known fader positions but should make it obvious controls aren't live.
- Sound engineer assigns musicians to buses (existing BusAssignmentPanel).
- Sound engineer selects default 5-8 visible channels (new -- one global list, not per-bus).
- Configuration lives in Firestore `config/monitor` alongside existing bridge config.

### Claude's Discretion
- Exact UI layout and styling of the configure mode page
- How the "star" interaction works in configure mode (checkbox, star icon, toggle, etc.)
- Connection status indicator design (dot, banner, icon -- as long as it's clear but not distracting)
- How last-known fader values are displayed when disconnected
- Bridge hardening implementation details (reconnection timing, heartbeat intervals, etc.)
- Whether the live popup is a popover, slide-up sheet, or drawer

### Deferred Ideas (OUT OF SCOPE)
- Mix presets (save/recall personal mixes) -- v2 feature (MIX-V2-01)
- "More Me!" macro -- removed from live popup for simplicity. Could revisit in v2 if musicians request it.
- Per-bus default channel lists -- keeping it simple with one global default list.
- Live follow mode (leader advances all views) -- v2 feature (PERF-V2-01)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MIX-01 | Musician can see assigned monitor channels and adjust fader levels | Existing FaderStrip + MonitorPage show channels; need vertical FaderStrip variant for live popup |
| MIX-02 | Musician can mute/unmute individual channels | Existing FaderStrip has `on` prop and `onUnmuteCheck`; QuickMonitorPanel handles `handleSendOn` |
| MIX-03 | Configure mode: musician can star/select which channels to see during live performance | QuickMonitorPanel already has pinning to `users/{uid}/preferences/monitor.pinnedChannels`; MonitorPage needs starring UX added |
| MIX-04 | Live mode: only starred channels visible -- clean, fast, no clutter | QuickMonitorPanel already filters by pinned channels; needs simplification (remove "More Me!") |
| MIX-05 | Sound engineer can pre-configure which channels each musician sees | New `defaultChannels: number[]` field on `config/monitor`; BusAssignmentPanel or SoundSystemSection extended |
| MIX-06 | Sound engineer can assign monitor bus mappings | Already implemented in BusAssignmentPanel with confirmation flow |
| MIX-07 | Monitor controls 1-2 taps away from setlist and PDF view | PerformanceToolbar already has popover; PDF view needs a monitor access button |
| MIX-08 | Bridge/proxy stupid simple to install | Electron app with auto-start, setup code flow, auto-discovery all exist |
| MIX-09 | Bridge auto-starts, auto-reconnects, requires zero troubleshooting | X32Client has reconnect loop (60 attempts, 10s interval); needs refinement for robustness |
| MIX-10 | Clear connection status indicator | ConnectionIndicator exists; QuickMonitorPanel has bridge status display; needs unification |
| MIX-11 | App functions normally when X32/bridge is offline -- graceful degradation | Architecture already isolates monitor from app; needs explicit disconnected UI state |
</phase_requirements>

## Standard Stack

### Core (Already in Project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.2.3 | UI framework | Already in use |
| Next.js | 16.1.4 | App framework | Already in use |
| Zustand | 5.0.10 | State management (monitor-store) | Already in use for monitor state |
| Firebase/Firestore | 12.9.0 | Transport layer, config persistence, user prefs | Already the transport architecture |
| Radix Popover | 1.1.15 | Live popup container | Already used in PerformanceToolbar |
| lucide-react | 0.563.0 | Icons (Star, Wifi, Speaker, etc.) | Already in use |
| Tailwind CSS | v4 | Styling | Already in use |
| Electron | (bridge) | Bridge desktop app with auto-start | Already built |
| firebase-admin | 13.6.0 | Bridge server Firestore access | Already in use |

### No New Dependencies Needed
This phase requires zero new npm packages. All functionality is built with existing libraries.

## Architecture Patterns

### Current Architecture (Already Built)
```
iPad/Tablet (Next.js PWA)
  |
  |-- FirestoreMonitorClient (src/lib/firestore-monitor-client.ts)
  |     |-- Reads: monitor-live/state (onSnapshot)
  |     |-- Writes: monitor-live/commands/pending (addDoc)
  |
  |-- monitor-store (Zustand) -- shared state for all monitor components
  |     |-- channels[], buses[], matrices[], config, myBusIndex
  |
  |-- useMonitorConnection (singleton, ref-counted)
  |     |-- First consumer opens connection, last closes it
  |
Firestore (Cloud)
  |
Bridge (Electron on Production PC)
  |-- ConfigManager -- reads config/monitor, watches for changes
  |-- FirestoreTransport -- listens for commands, writes state
  |-- X32Client -- OSC/UDP to mixer
  |     |-- /xremote every 8s for subscription
  |     |-- Health check: 20s silence = disconnected
  |     |-- Reconnect: 60 attempts, 10s interval (~10 min)
  |
X32 Mixer (OSC over UDP, port 10023)
```

### Recommended Project Structure Changes
```
src/components/monitor/
  FaderStrip.tsx           # EXISTING: horizontal fader (keep for monitor page)
  VerticalFaderStrip.tsx   # NEW: vertical fader for live popup
  QuickMonitorPanel.tsx    # MODIFY: remove "More Me!", use starred+defaults, vertical faders
  ConnectionIndicator.tsx  # MODIFY: add disconnected state with last-known values
  BusAssignmentPanel.tsx   # EXISTING: keep as-is (MIX-06 already done)
  MatrixPanel.tsx          # EXISTING: keep as-is
  DefaultChannelPicker.tsx # NEW: sound engineer picks default visible channels

src/app/(main)/monitor/
  page.tsx                 # MODIFY: add starring UX for all channels (configure mode)

src/types/monitor.ts       # MODIFY: add defaultChannels to MonitorConfig
bridge/src/types.ts        # MODIFY: mirror defaultChannels addition

src/lib/monitor-store.ts   # MODIFY: add starredChannels, defaultChannels to state

src/components/performance/
  PerformanceToolbar.tsx   # MODIFY: simplify QuickMonitorPanel integration

src/components/music/
  PDFViewer.tsx            # MODIFY: add monitor access button (or PerformerView wraps it)
```

### Pattern 1: Starring/Pinning (Already Established)
**What:** Per-musician channel preferences persisted to Firestore
**When to use:** Any time a musician wants to customize their live popup view
**Existing implementation:**
```typescript
// Already in QuickMonitorPanel.tsx -- persistence to Firestore
// Path: users/{uid}/preferences/monitor
// Field: pinnedChannels: number[]
getDoc(doc(db, "users", user.uid, "preferences", "monitor"))
setDoc(doc(db, "users", user.uid, "preferences", "monitor"), { pinnedChannels: next }, { merge: true })
```
**Key insight:** This is exactly the starring mechanism. Rename `pinnedChannels` to `starredChannels` for clarity, or keep the field name and just update the UI terminology.

### Pattern 2: Default Channels (New)
**What:** Sound engineer sets a global default channel list visible to all musicians
**When to use:** One-time setup, occasionally adjusted
**Implementation:**
```typescript
// Add to config/monitor Firestore document
interface MonitorConfig {
  // ... existing fields
  defaultChannels?: number[]  // e.g., [1, 2, 5, 6, 15, 16] -- global defaults
}

// Visible channels in live popup = union of:
//   1. config.defaultChannels (engineer's defaults)
//   2. user's starredChannels (personal additions)
// Filtered to only channels that have sends on the user's bus
```

### Pattern 3: Vertical Fader Strip (New Component)
**What:** Traditional mixer-style vertical fader for the live popup
**When to use:** Live mode popup only (configure mode keeps the existing horizontal layout)
**Design notes:**
- The existing FaderStrip is horizontal (width-based, good for full-page lists)
- Live popup needs vertical strips side by side (traditional mixer mental model)
- Reuse the same pointer-based dragging logic, throttling, and optimistic update patterns
- Height-based instead of width-based (clientY instead of clientX)

### Pattern 4: Graceful Degradation (Modify Existing)
**What:** When bridge/X32 is offline, show last-known state as stale
**When to use:** Any time connection status is not "connected"
**Implementation:**
```typescript
// monitor-store already has status field
// When status changes to disconnected/error:
//   1. Keep channels/buses/fader values in store (last known)
//   2. UI renders faders as disabled/dimmed with "Last known" label
//   3. Non-monitor features unaffected (already true -- monitor is isolated)
```

### Anti-Patterns to Avoid
- **Building a new transport layer:** The Firestore transport works. Don't add WebSocket fallback unless P95 latency exceeds 300ms in production (decision from Phase 1).
- **Overcomplicating starring:** The pinning mechanism already exists. Don't build a complex preferences system -- just extend what's there.
- **Making FaderStrip do both layouts:** Create a separate VerticalFaderStrip rather than parameterizing the existing one. The interaction geometry is fundamentally different (clientY vs clientX).
- **Blocking non-monitor features on connection:** The architecture already isolates monitor state. Keep it that way.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Popover/Sheet UI | Custom modal/overlay | Radix Popover (already in use) | Accessibility, dismiss behavior, portal handling |
| Pointer-based fader interaction | New drag system | Existing FaderStrip pattern (pointer capture + throttle) | Already handles edge cases (double-tap reset, pending state, optimistic UI) |
| Firestore persistence | Custom sync layer | Existing `setDoc` with merge pattern | Already battle-tested in QuickMonitorPanel |
| Connection management | New connection hook | Existing `useMonitorConnection` singleton | Already ref-counted, shared between components |
| Auth/access control | New permissions check | Existing `useMonitorAccess` hook | Already checks admin, soundEngineer, bus assignment |

## Common Pitfalls

### Pitfall 1: Vertical Fader Touch Area Too Small
**What goes wrong:** Musicians with big fingers can't grab thin vertical faders on a tablet
**Why it happens:** Vertical faders tempt developers to make them narrow
**How to avoid:** Minimum 44px touch target width per fader strip. With 8 channels + master = 9 strips, at 48px each = 432px, which fits an iPad portrait (768px) with margins. Test on actual tablet hardware.
**Warning signs:** Faders narrower than 40px; musicians accidentally hitting adjacent faders

### Pitfall 2: Stale Starred Channels After Channel Renaming
**What goes wrong:** Musician stars channel 5 when it's "Guitar". Sound engineer renames channel 5. Stars reference channel index, not name, so it still works -- but the name in the star list may be stale until the next state sync.
**Why it happens:** Starring stores channel indices, not names. Names come from the live mixer state.
**How to avoid:** Always resolve channel names from the live mixer state (channels array), never cache them in the starred list. This is already how it works.

### Pitfall 3: Firestore Command Ordering Under Load
**What goes wrong:** When multiple musicians drag faders simultaneously, commands arrive out of order
**Why it happens:** Firestore doesn't guarantee write ordering across clients
**How to avoid:** Already solved -- bridge uses `createdAt` timestamps and `latestCommandTimestamps` map to discard stale commands. The 50ms throttle on the client side also limits burst volume.

### Pitfall 4: Bridge Heartbeat Staleness False Positive
**What goes wrong:** Bridge is online but heartbeat write to Firestore fails (network hiccup), causing iPad UI to show "Bridge offline"
**Why it happens:** 2-minute staleness threshold in `isBridgeOnline()` is tight; Firestore writes can fail transiently
**How to avoid:** Differentiate between "bridge heartbeat stale" (warning) and "Firestore state not updating" (actual offline). The bridge writes state updates much more frequently than heartbeats (every 100ms vs 60s). Check `monitor-live/state.updatedAt` as a secondary liveness signal.

### Pitfall 5: QuickMonitorPanel Re-renders on Every State Update
**What goes wrong:** The live popup stutters because the entire bus state updates 10x/sec from the bridge
**Why it happens:** Zustand store updates trigger re-renders in all subscribers
**How to avoid:** Use Zustand selectors to subscribe only to the specific bus/channels needed. The existing code already does `const myBus = buses.find(b => b.index === myBusIndex)` but this creates a new object every render. Consider memoizing or using `useShallow` for the relevant slice.

### Pitfall 6: PDF Viewer Monitor Button Breaks Immersion
**What goes wrong:** Adding a monitor button to the PDF view clutters the immersive reading experience
**Why it happens:** The PDF viewer is meant to be full-screen and distraction-free
**How to avoid:** The monitor access should come through the PerformanceToolbar, which already sits at the bottom of the PerformerView (wraps PDFViewer). The toolbar is already there. The requirement is 1-2 taps from "within" the PDF view -- since the toolbar is visible during PDF viewing, this is already satisfied. Just verify the toolbar's Audio button works from PDFViewer context.

## Code Examples

### Visible Channels Computation (Live Mode)
```typescript
// Merge default channels + starred channels, filter to active sends
function getVisibleChannels(
  defaultChannels: number[],    // from config/monitor
  starredChannels: number[],    // from user preferences
  busSends: BusSend[],          // sends for the user's bus
): number[] {
  const visible = new Set([...defaultChannels, ...starredChannels])
  // Only include channels that actually have sends on this bus
  return busSends
    .filter(s => visible.has(s.channelIndex))
    .map(s => s.channelIndex)
}
```

### VerticalFaderStrip Core Interaction
```typescript
// Height-based version of existing FaderStrip pointer logic
const updateFromPointer = useCallback((clientY: number) => {
  if (!sliderRef.current) return
  const rect = sliderRef.current.getBoundingClientRect()
  // Invert: top = 1.0, bottom = 0.0 (natural fader direction)
  const ratio = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height))
  setDisplayValue(ratio)
  throttledOnChange(ratio)
}, [throttledOnChange])
```

### Default Channel Picker (Sound Engineer)
```typescript
// Extension to SoundSystemSection or BusAssignmentPanel
// Reads channels from monitor-live/state, lets engineer check/uncheck
// Saves to config/monitor.defaultChannels
async function saveDefaultChannels(channels: number[]) {
  await updateDoc(doc(db, "config", "monitor"), {
    defaultChannels: channels,
  })
}
```

### Disconnected State UI Pattern
```typescript
// In QuickMonitorPanel / live popup
const isDisconnected = status === "disconnected" || status === "error"
const bridgeOffline = !isBridgeOnline(config?.bridge)

// Render faders in disabled state with last-known values
<div className={isDisconnected || bridgeOffline ? "opacity-50 pointer-events-none" : ""}>
  {/* Faders render with their last-known values from store */}
  <div className="text-xs text-yellow-500 text-center">
    Mixer offline -- showing last known levels
  </div>
</div>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| WebSocket transport (WSS) | Firestore transport | Phase 1 | Zero iPad config, no TLS certificates needed |
| Manual bridge IP entry | Auto-discovery via UDP broadcast | Phase 1 | Bridge finds X32 automatically |
| Manual bridge install | Electron installer with setup code | Phase 1 | One-click install with credential download |
| Horizontal fader strips | Keep horizontal for configure mode, add vertical for live popup | Phase 2 | Matches musician mental model from physical consoles |

**Deprecated/outdated:**
- WebSocket-based transport: Removed in favor of Firestore. Some vestigial references remain in code comments and config fields (`bridgeUrl` still says "wss://").
- "More Me!" macro: Removed per user decision. Code exists in QuickMonitorPanel but should be deleted.

## Open Questions

1. **Vertical vs Horizontal Faders in Live Popup**
   - What we know: User explicitly decided "vertical faders side by side" for the live popup
   - What's unclear: Whether the existing horizontal FaderStrip should also be updated on the full monitor page, or only the live popup gets vertical faders
   - Recommendation: Only create vertical faders for the live popup. Keep the existing horizontal layout on the monitor page (configure mode) since it works well for a scrolling list of all 32 channels

2. **Renaming pinnedChannels to starredChannels**
   - What we know: The field is currently `pinnedChannels` in Firestore
   - What's unclear: Whether to migrate existing data or keep the field name and just change UI labels
   - Recommendation: Keep the field name `pinnedChannels` internally, use "star" terminology in UI only. Avoids data migration for a cosmetic change.

3. **PDF View Monitor Access Path**
   - What we know: PerformanceToolbar with the Audio popover is already visible during PDF viewing (PerformerView wraps PDFViewer with toolbar)
   - What's unclear: Whether this satisfies "1-2 taps from PDF view" or if a separate button is needed
   - Recommendation: Verify that PerformanceToolbar's Audio button is visible and reachable from within the PDF viewer. If it is, MIX-07 for PDF is already satisfied. If the toolbar collapses or hides during PDF viewing, add a floating monitor FAB.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (via vitest.config.ts) |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MIX-01 | Fader level adjustment updates store and sends command | unit | `npx vitest run src/components/monitor/__tests__/fader-interaction.test.ts -x` | Wave 0 |
| MIX-02 | Mute/unmute toggles send on/off command | unit | `npx vitest run src/components/monitor/__tests__/mute-toggle.test.ts -x` | Wave 0 |
| MIX-03 | Starring a channel persists to Firestore prefs | unit | `npx vitest run src/components/monitor/__tests__/channel-starring.test.ts -x` | Wave 0 |
| MIX-04 | Live mode shows only starred + default channels | unit | `npx vitest run src/components/monitor/__tests__/visible-channels.test.ts -x` | Wave 0 |
| MIX-05 | Default channel config saved and loaded from Firestore | unit | `npx vitest run src/components/monitor/__tests__/default-channels.test.ts -x` | Wave 0 |
| MIX-06 | Bus assignment panel assigns users to buses | unit | Already partially covered by existing code | Existing |
| MIX-07 | Monitor accessible from setlist and PDF views | manual-only | Manual: open setlist, verify Audio button visible, tap to open popup | N/A |
| MIX-08 | Bridge install is simple | manual-only | Manual: test on clean PC | N/A |
| MIX-09 | Bridge auto-reconnects after network interruption | integration | `npx vitest run bridge/src/__tests__/reconnect.test.ts -x` | Wave 0 |
| MIX-10 | Connection status indicator shows correct state | unit | `npx vitest run src/components/monitor/__tests__/connection-status.test.ts -x` | Wave 0 |
| MIX-11 | App works when mixer offline | unit | `npx vitest run src/components/monitor/__tests__/graceful-degradation.test.ts -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/components/monitor/__tests__/visible-channels.test.ts` -- covers MIX-04, MIX-05 (channel visibility logic)
- [ ] `src/components/monitor/__tests__/channel-starring.test.ts` -- covers MIX-03 (starring persistence)
- [ ] `src/components/monitor/__tests__/connection-status.test.ts` -- covers MIX-10 (indicator states)
- [ ] `src/components/monitor/__tests__/graceful-degradation.test.ts` -- covers MIX-11 (offline behavior)
- [ ] Vitest environment may need `jsdom` for component tests (currently set to `node`)

## Sources

### Primary (HIGH confidence)
- Existing codebase: Full read of all monitor-related files (15+ files across src/ and bridge/)
- `src/types/monitor.ts` -- canonical type definitions
- `bridge/src/types.ts` -- mirrored types
- `src/lib/firestore-monitor-client.ts` -- client transport implementation
- `bridge/src/firestore-transport.ts` -- server transport implementation
- `bridge/src/x32-client.ts` -- OSC protocol implementation
- `src/components/monitor/QuickMonitorPanel.tsx` -- existing live panel with pinning
- `src/components/monitor/FaderStrip.tsx` -- existing fader component
- `src/app/(main)/monitor/page.tsx` -- existing monitor page
- `src/components/performance/PerformanceToolbar.tsx` -- integration point for live mode
- Phase 1 decisions from STATE.md -- architecture decisions locked

### Secondary (MEDIUM confidence)
- X32 OSC protocol behaviors documented in x32-client.ts comments (verified via Phase 1 PoC)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- everything is already in the project, no new dependencies
- Architecture: HIGH -- extending existing, well-understood patterns
- Pitfalls: HIGH -- identified from reading the actual implementation code
- UI patterns: MEDIUM -- vertical fader is new component, touch ergonomics need real-device testing

**Research date:** 2026-03-07
**Valid until:** 2026-04-07 (stable -- no external dependencies to drift)
