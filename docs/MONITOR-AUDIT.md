# Monitor & Sound Engineering System — Full Audit

**Date:** February 19, 2026
**Scope:** All monitor access, assignment, and control flows across web app + bridge
**Files reviewed:** 25+ source files across `src/`, `bridge/src/`, `firestore.rules`

---

## Personas & Their Workflows

| Persona | Example | Role | Sound Eng? | Needs |
|---------|---------|------|-----------|-------|
| System Admin | Daniel | `admin` | maybe | Full control, configure bridge, set roles |
| Sound Engineer (musician) | Drew | `musician` | ✓ | Assign buses, matrix outputs, own monitor mix |
| Sound Engineer (sub/member) | Taylor, Andrew | `member` | ✓ | Assign buses, matrix outputs, NO own mix needed |
| Musician | Joey, David G | `musician` | ✗ | Control own bus faders from iPad |
| Band Leader | David L, Bryn, Karen, Randy | `band_leader` | ✗ | May want monitor access if playing |

---

## 🔴 Critical Bugs Found

### Bug 1: Bridge rejects admins

**Severity: Critical** — The bridge server does not recognize the `admin` role.

The web app grants monitor access to admins via `useMonitorAccess` → `isAdmin`. The Monitor tab appears and the page loads. But when the WebSocket client authenticates with the bridge, the bridge calls:

```
verifyToken(token) → returns { uid, email, soundEngineer }
isAuthorized(uid, soundEngineer) → checks soundEngineer || hasBus
```

It never reads the `role` claim. So Daniel (admin, no soundEngineer flag, no bus assigned) sees the Monitor tab, connects to the bridge, and gets **"Not authorized for monitor access"** → connection rejected.

**Fix:** Bridge `verifyToken` should also extract the `role` claim. Bridge `isAuthorized` should also check `role === 'admin'`.

### Bug 2: Self-assign writes fail silently for non-privileged users

**Severity: Medium** — The `BusSelector` component lets users click a bus to self-assign. This writes to `config/monitor` in Firestore. But Firestore rules only allow admins and sound engineers to write to that doc. A regular musician or band leader would get a permission-denied error.

In practice this is mostly theoretical: musicians without a bus don't see the Monitor tab, and sound engineers CAN write. But edge cases exist:

- A band leader who gets a bus unassigned mid-session would see the BusSelector and clicking would fail silently (error is caught but only logged, no toast).
- An admin without the soundEngineer flag hits Bug 1 before ever reaching this screen (but once Bug 1 is fixed, admins would also need Firestore write access — which they have via rules).

**Fix:** Add error toast in `handleSelectBus`. Also, show a read-only "your bus was unassigned" state instead of BusSelector for non-engineers.

---

## 🟡 Significant UX Issues

### Issue 1: Sound engineers without a bus see confusing "Select your bus" prompt

When Taylor (member + sound engineer) opens Monitor, he has access but `myBusIndex` is null. The page shows:

> **Select your monitor bus**
> Choose which wedge monitor you're using

This is wrong for Taylor — he's a FOH sound engineer, not a stage musician. He doesn't need a wedge monitor. He needs the matrix outputs and bus assignment tools.

Below this prompt, the Sound Engineer section IS shown (correctly), but the "select your bus" message is misleading and takes up the entire top of the page.

**Fix:** When `isSoundEngineer && myBusIndex === null`, skip the BusSelector entirely and go straight to the engineer dashboard (matrix + bus assignments). Optionally show a subtle "Assign yourself a bus if you need a personal monitor mix" link below.

### Issue 2: Sound engineer section is hidden by default

The "🎧 Sound Engineer" section is collapsed on page load (`showEngSection` starts `false`). A first-time user might not realize it's there. Drew opens Monitor, sees his bus faders, and has no idea there's a hidden panel at the bottom where he can assign buses to other musicians and control matrix outputs.

**Fix:** Default `showEngSection` to `true` for sound engineers. Or better: make it a persistent preference stored in Firestore (users/uid/preferences/monitor) so it remembers the user's choice.

### Issue 3: Sound engineer headphones toggle is admin-only

Only Daniel can toggle the 🎧 sound engineer flag on users (in People → UserRow). Band leaders can see the badge but can't toggle it. This means:

- If Drew needs to give temporary sound engineer access to a sub for one weekend, he can't. He has to ask Daniel.
- Band leaders managing rehearsals can't designate who runs sound.

**Fix:** Allow band leaders to toggle sound engineer (update API from `admin` to `band_leader` minimum, update UserRow `isCurrentAdmin` check). The sound engineer flag is a cross-cutting operational concern, not a security-critical admin function.

### Issue 4: BusSelector doesn't show who owns each bus

When someone sees the available buses, they just see "Bus 1 — Available" or "Bus 1 — Currently assigned to you." There's no indication of which musician is on which bus. If Joey sees Bus 1 is taken, he doesn't know if that's David G's bus or a mistake.

**Fix:** Show the assigned user's name: "Bus 1 — David G" (taken), "Bus 2 — Available".

### Issue 5: Duplicate bus assignment UIs

Bus assignments can be managed in two places:
1. Admin panel → Sound System → Bus Assignments card (admin only)
2. Monitor page → 🎧 Sound Engineer → Bus Assignment Panel (sound engineers)

Both write to the same Firestore doc. If both are open simultaneously (unlikely), there's no conflict resolution. More importantly, it's confusing to have two paths to the same thing.

**Fix:** Remove the bus assignment UI from the admin Sound System section. It belongs in the sound engineer's live workflow, not the admin config panel. The admin panel should focus on infrastructure (bridge URL, X32 address, bus numbers). Assignment is an operational task that happens at rehearsal/soundcheck.

### Issue 6: No confirmation on bus reassignment

In BusAssignmentPanel, a sound engineer can reassign Bus 1 from Joey to David G with a single dropdown change. There's no "Are you sure?" and the change is instant (saved to Firestore on change). Joey's monitor mix would immediately stop working.

During a live service, this could be disruptive. The toast notification ("Bus 1 → David G") confirms what happened but doesn't prevent accidents.

**Fix:** For reassignment (changing from one user to another), show a brief confirmation: "Bus 1 is currently assigned to Joey. Reassign to David G?" This doesn't apply to assigning an empty bus or unassigning.

---

## 🟢 Code Quality Findings

### Finding 1: Shared Zustand store with dual WebSocket clients

Both `MonitorPage` and `QuickMonitorPanel` create their own `X32WSClient` instance but share the same `useMonitorStore`. If a user has the performance toolbar open (QuickMonitorPanel) and navigates to `/monitor` (MonitorPage), two WebSocket connections exist simultaneously, both updating the same store.

Worse: when either component unmounts, it calls `reset()`, which wipes the entire store — killing the other component's state.

**Fix:** Create a singleton connection manager (a ref-counted hook or a module-level client) so only one WebSocket connection exists per browser tab. Both components subscribe to the same store without owning the connection lifecycle. Something like:

```typescript
const { connect, disconnect } = useMonitorConnection() // ref-counted
// First mount: opens WS. Second mount: reuses. Last unmount: closes.
```

### Finding 2: QuickMonitorPanel accesses store outside React

```typescript
onMatrixUpdate: (matrixIndex, field, value) => {
    const store = useMonitorStore.getState()
    if (field === "fader") store.updateMatrixFader(matrixIndex, value as number)
    // ...
}
```

While technically valid with Zustand, calling `getState()` inside a callback registered in a `useEffect` is fragile. The MonitorPage handles the same case correctly by destructuring the store actions at the component level.

**Fix:** Match the pattern used in MonitorPage — destructure `updateMatrixFader` and `updateMatrixOn` from the store at the component level and use them directly in the callback.

### Finding 3: BusAssignmentPanel subscribes to all users unconditionally

The panel calls `subscribeToAllUsers()` on mount, even if the Sound Engineer section is collapsed. This subscribes to every user document in Firestore. Since it's inside a collapsible section, this subscription should be lazy.

**Fix:** Only mount `BusAssignmentPanel` when `showEngSection` is true (already the case in MonitorPage's JSX — the component only renders when the section is expanded). Confirmed this is actually fine as-is since React won't render children of a falsy conditional. No fix needed.

### Finding 4: Fader dB conversion is approximate

The `floatToDb` function uses a rough logarithmic approximation:
```typescript
const db = 40 * Math.log10(value) - 10 * Math.log10(0.75)
```

The X32's actual fader law is a piecewise curve (not a simple log). The displayed dB values will be off by 2–5 dB in the low range. This is cosmetic — the fader position is still correct, just the label is approximate.

**Fix (low priority):** Use the documented X32 fader-to-dB lookup table for accurate display. Or just label it "Level" instead of showing dB values.

### Finding 5: Bridge version hardcoded in multiple places

The version string "2.0.0" appears in:
- `bridge/package.json`
- `bridge/src/launcher.ts` (const VERSION)
- `bridge/src/index.ts` (fallback default)
- `bridge/src/config.ts` (heartbeat fallback)

**Fix:** Read version from `package.json` at build time or inject via the build script. The launcher already sets `process.env.BRIDGE_VERSION`, so the fallbacks in index.ts and config.ts just need to stay in sync. Not urgent, but a maintenance papercut.

### Finding 6: Bridge type definitions duplicated

`MatrixInfo`, `MixerSnapshot`, `ServerMessage`, etc. are defined separately in:
- `src/types/monitor.ts` (web app)
- `bridge/src/types.ts` (bridge server)

They must be kept in sync manually. Any protocol change requires editing both files.

**Fix (later):** Extract shared types into a `packages/shared-types/` workspace package that both the web app and bridge import. For now, the duplication is manageable since changes are infrequent.

---

## Suggested Improvements (Non-Bug)

### 1. Band leaders as potential monitor users

Band leaders who play instruments (Karen plays guitar, Randy might sing) would need monitor access. Currently they'd need a bus assigned OR the sound engineer flag. Sound engineer is wrong for them — they don't need matrix controls.

The current system works if a sound engineer assigns them a bus. But this means a band leader can't get on the Monitor tab until rehearsal/soundcheck when an engineer assigns them. They might want to preview the interface beforehand.

**Option:** Add a lightweight "monitor access" flag (separate from soundEngineer) that band leaders can self-assign, or let band leaders self-assign to an unassigned bus in the Monitor page (add band_leader to Firestore rules for config/monitor write). This would require careful thought about what non-engineers should be able to modify.

### 2. Engineer dashboard mode

For a sound engineer working FOH (not on stage), the current Monitor page is musician-centric: it leads with "My Monitor / Bus N" and hides the engineering tools in a collapsible. A dedicated engineer view could show:

- All buses at a glance (who's on which, connection status)
- Matrix outputs prominently
- Quick bus reassignment
- Bridge/X32 health status

This could be a `/monitor/engineer` route or a toggle on the existing page.

### 3. Visual feedback for who's connected

The bridge tracks connected clients (`getConnectedCount()`). The HTTP health endpoint exposes this. But the web UI doesn't show it. A sound engineer would benefit from seeing: "Joey ✓ connected, David G ✗ not connected" next to each bus assignment.

This would require the bridge to broadcast a client list (with UIDs) or the web app to poll the health endpoint.

### 4. Monitor presets

Recurrent band configurations (Friday night lineup vs. Saturday morning) could be saved as presets: bus assignment snapshots that an engineer can load with one tap. Currently bus assignments must be redone manually each time the lineup changes.

---

## Summary of Required Fixes

| # | Issue | Severity | Effort |
|---|-------|----------|--------|
| 1 | Bridge rejects admins (missing role claim check) | 🔴 Critical | Small — 5 lines in bridge config.ts |
| 2 | Self-assign silent failure for non-engineers | 🟡 Medium | Small — add toast + conditional UI |
| 3 | Sound engineers without bus see wrong "select bus" UI | 🟡 Medium | Small — conditional render in monitor page |
| 4 | Sound engineer section hidden by default | 🟡 Low | Tiny — default state to true |
| 5 | Sound engineer toggle should be band_leader accessible | 🟡 Medium | Small — API + UI permission change |
| 6 | BusSelector doesn't show assigned names | 🟢 Polish | Small — display name in BusSelector |
| 7 | Duplicate bus assignment UI (admin + monitor) | 🟢 Polish | Small — remove from admin panel |
| 8 | No confirmation on bus reassignment | 🟢 Polish | Small — conditional confirm dialog |
| 9 | Shared store / dual WebSocket issue | 🟡 Medium | Medium — singleton connection manager |

**Recommended priority:** Fix #1 (critical, blocks admin usage), then #3 and #4 (confusing first-time engineer experience), then #5 (operational friction), then the rest as polish.
