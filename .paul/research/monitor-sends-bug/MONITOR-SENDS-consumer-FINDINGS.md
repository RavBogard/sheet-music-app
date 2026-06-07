# MONITOR-SENDS — Lane 2 (consumer wiring + channelIndex mapping) FINDINGS

**Author:** coder-2 · **Lane:** 2 (Suspect A — iPad consumer plane, the prime-suspect lane)
**Tier:** 0, READ-ONLY (zero commits, zero writes) · **Date:** 2026-05-23
**Analyzed against:** `origin/master` @ `e9b900caa` (detached worktree `sheet-music-app-monitor-sends-lane2/`)

---

## TL;DR — the prime suspect is CLEARED

**Suspect A (consumer wiring / channelIndex mapping) is DISPROVEN as the root
cause.** I traced the per-channel send path end-to-end and against the bridge
contract. The consumer plane is correct and the `channelIndex` round-trip is
*provably consistent* (X32 absolute channel 1–32 the whole way). The send
command Daniel's drag produces is well-formed, correctly-indexed, and authorized
**identically to the bus-master command that works**.

⇒ **Redirect the prime suspicion to Lane 1 (desk-side X32 send semantics) and
Lane 3 (was the per-channel SEND *write* path ever verified live).** The
consumer's only contribution is to the *symptom* (the fader confirmation machine
will eased-revert or silently hold when the desk never reflects the send) — not
to the cause.

---

## Per-question verdicts

### Q1 — Does dragging a channel send fader actually dispatch a write? **YES. Wired correctly. NOT a no-op.**

The chain is intact on **both** consumer surfaces:

- **/monitor full page** (`MonitorTabs.tsx`):
  - Channel fader `onChange={(val) => onSendLevel(send.channelIndex, val)}`
    — `MonitorTabs.tsx:166` (My Mix tab) and `:234` (All Channels tab).
  - `onSendLevel` = `handleSendLevel` (`MonitorClient.tsx:236`) →
    `MonitorClient.tsx:104-108`:
    ```ts
    const handleSendLevel = useCallback((channelIndex, value) => {
        if (!hasAssignedBus(myBusIndex)) return
        updateSendLevel(myBusIndex, channelIndex, value)   // optimistic store
        client?.setSendLevel(myBusIndex, channelIndex, value) // → Firestore command
    }, [myBusIndex, updateSendLevel, client])
    ```
  - `client.setSendLevel` (`firestore-monitor-client.ts:225-232`) writes
    `{type:"set_send_level", busIndex, channelIndex, value, uid, createdAt}` to
    `monitor-live/commands/pending` (`:295-309`).
- **Perform-toolbar popup** (`QuickMonitorPanel.tsx:71-81` + `:200-214`) wires
  the identical handler via `VerticalFaderStrip` → `handleSendLevel` →
  `getMonitorClient().setSendLevel(...)`.

`FaderStrip` (`FaderStrip.tsx:80-138`) and `VerticalFaderStrip`
(`VerticalFaderStrip.tsx:74-134`) both genuinely call `onChange` on drag (via
`throttledOnChange`). The **same component** drives the master fader, and the
master works — so the interaction layer is sound.

### Q2 — channelIndex SEMANTICS. **The consumer introduces NO mismatch — it faithfully round-trips the bridge's value, which is the X32 absolute channel 1–32.**

This was the designated "hot bug." It is not in the consumer.

The consumer **never synthesizes** a channelIndex. It reads `send.channelIndex`
from `myBus.sends` (the bridge's `monitor-live/state` write) and echoes that
exact integer back in the command:

- `MonitorClient.tsx:221` `allSends = myBus.sends` → `MonitorTabs.tsx:166`
  passes `send.channelIndex` straight into `onSendLevel`.
- `coerce-state.ts:50-61` passes `bus.sends` through **untouched** (only
  array-coercion; no index remap).
- Optimistic store update matches by the same key — `monitor-store.ts:205`
  `s.channelIndex === channelIndex`.

**Cross-plane proof the value is X32-absolute 1–32 and consistent both ways**
(verified in `bridge/` on origin/master — Lane 1's domain, cited for the round-trip):

- Bridge **builds** state sends as `{ channelIndex: ch }` where `ch = i + 1`,
  `i ∈ 0..31` → **1–32** (`x32-client.ts:633-638`, `syncFullState`).
- Bridge **dispatch** `set_send_level` → `x32.setSendLevel(cmd.channelIndex!, cmd.busIndex!, value)`
  (`firestore-transport.ts:387-389`) — arg order (ch, bus) is correct.
- Bridge **OSC** `setSendLevel(ch, bus, v)` → `/ch/${ch.padStart2}/mix/${bus.padStart2}/level`
  (`x32-client.ts:578-582`). channelIndex 1–32 → `/ch/01`…`/ch/32`. **No remap.**
- Bridge **read-back** parses `/ch/(\d+)/mix/(\d+)/level` and matches
  `bus.sends.find(s => s.channelIndex === chIdx)` (`x32-client.ts:404-418`) —
  same 1–32 space.

So the integer is `1..32` from desk → state → consumer → command → OSC, with no
transformation anywhere. **There is no position-vs-absolute or off-by-one bug in
the consumer.**

> Corroborating behavioral evidence: Daniel could **see and drag** the channel
> faders (they rendered), which means `getVisibleChannels(defaultChannels,
> starredChannels, sends)` (`monitor-store.ts:61-69`) matched his starred/default
> indices against `send.channelIndex`. If the consumer's index space were
> off, the faders would have been *filtered out and invisible*, not inert.

### Q3 — Compare to the WORKING path. **Master and send are wired identically; the only delta is the X32 OSC target — which is bridge/desk-side.**

| | Bus master (WORKS) | Channel send (DEAD) |
|---|---|---|
| Handler | `handleBusMaster` `MonitorClient.tsx:98-102` | `handleSendLevel` `MonitorClient.tsx:104-108` |
| Gate | `hasAssignedBus(myBusIndex)` | `hasAssignedBus(myBusIndex)` — **same** |
| Optimistic | `updateBusFader(myBusIndex, v)` | `updateSendLevel(myBusIndex, ch, v)` |
| Command | `setBusMaster(myBusIndex, v)` → `set_bus_master` | `setSendLevel(myBusIndex, ch, v)` → `set_send_level` |
| Value scale | 0..1 float | 0..1 float — **same** |
| Bridge auth | `userBus === busIndex` ✓ | `userBus === busIndex` ✓ — **same** (`firestore-transport.ts:525-527`) |
| Bridge OSC | `/bus/05/mix/fader` | `/ch/NN/mix/05/level` ← **only real difference** |

Both commands carry `busIndex=5`, both pass `confirmKeyFor` shape-validation
(`firestore-transport.ts:423-430` — all required fields present, so the send is
**not** dropped as "malformed"), both pass the identical bus-ownership auth gate.
The *sole* divergence that survives the trace is the X32 OSC address itself
(`/bus/MM/mix/fader` vs `/ch/NN/mix/MM/level`) and its desk-side semantics.

**Re: "bus mute that works"** (PARENT asked us to confirm): there is **no**
`setBusMute`/`set_bus_mute` anywhere — not in the client, not in the bridge
dispatch. The /monitor master `FaderStrip` is hardcoded `on={true}` with no mute
control (`MonitorTabs.tsx:139-146`), and the QuickMonitorPanel master mute is
`onMuteToggle={noop}` (`QuickMonitorPanel.tsx:186`). So Daniel's working "bus
mute" is **not** a per-bus mute primitive — it is almost certainly him pulling
the **bus master fader to 0** (the `set_bus_master` path that works), i.e. the
same working primitive, not a separate one. This reinforces that *only* the
bus-master OSC path has ever been exercised successfully.

### Q4 — Role/visibility gating. **No gating blocks sends for a band_leader bus owner.**

- `useMonitorAccess` (`use-monitor-access.ts:76`) grants access on
  `isAdmin || isSoundEngineer || hasBusAssigned`. Daniel owns bus 5 →
  `hasBusAssigned` → access. ✓
- The channel `FaderStrip` has **no** `disabled`/read-only prop and is rendered
  identically regardless of engineer status (`MonitorTabs.tsx:161-168`). The
  engineer-only gating affects only the **Configure** and **Matrix** tabs
  (`MonitorTabs.tsx:121-130`, `:258-280`) — never the channel send faders in
  "My Mix" / "Channels".
- `handleSendLevel` gates on the **same** `hasAssignedBus(myBusIndex)` predicate
  as the working `handleBusMaster`. Since master fires, the gate passes. ✓

So the channel controls are fully interactive for Daniel; they are not "rendered
but inert."

### Q5 — Optimistic snap-back / UX-vs-write. **This is the consumer's contribution to the *symptom*, and it matters for the fix's acceptance test.**

The fader confirmation machine (`fader-confirmation.ts`) drives both fader
components. On finger-up it enters `pending` holding the optimistic value, then:

- A **genuinely new authoritative snapshot** (store `snapshotCount`/`snapshotSeq`
  advances via `setSnapshot`, `monitor-store.ts:133-187`) whose value is **within
  tolerance** of the optimistic value ⇒ **confirmed** (green check).
- A new snapshot whose value **disagrees**, OR the 2 s timeout
  (`FADER_CONFIRM_TIMEOUT_MS`) with no confirming reflection ⇒ **reverted**
  (amber undo cue, eased back) — `fader-confirmation.ts:144-183`.

Consequence given a downstream failure (desk never applies the send, OR
`monitor-live/state` is frozen — see memory `project_bridge_state_freshness_diagnostic`):

1. If a later snapshot arrives carrying the **old** send level → the send fader
   **eased-reverts** while the master (which the desk *does* reflect) **confirms**.
   This reproduces *exactly* "master works, sends do nothing."
2. If `monitor-live/state` is frozen (no fresh snapshot) → the knob silently
   holds the optimistic value but the **audio never changes** → also "did nothing."

**Implication for the fix lane:** fixing the audio alone is insufficient — the
desk-side send must round-trip back into `monitor-live/state` (the read-back at
`x32-client.ts:404-418` must actually fire for sends) so the fader **confirms**.
Otherwise the control will still *feel* broken even once audio works.

---

## Consumer-side root-cause hypothesis

**The bug is not in the consumer plane.** The consumer correctly dispatches a
well-formed, correctly-indexed, authorized `set_send_level` command for bus 5.
The failure is downstream of the command write:

- **Most likely (Lane 1 / desk):** the X32 OSC send path `/ch/NN/mix/MM/level`
  is structurally correct but **inaudible at the desk** — candidate causes:
  channel→bus send is **OFF** or in the wrong **PRE/POST tap mode**, the bus is
  fed by a different routing than `/ch/NN/mix/MM`, or an X32 mixbus-numbering
  quirk where `/bus/05` (master, works) and the `mix/05` send tap don't address
  the same physical wedge. **Requires the board on to confirm.**
- **Also (Lane 3):** per the PARENT pre-probe, P0-B2 only ever drove
  `set_bus_fader`. The per-channel **send write** to the X32 may **never have
  been exercised end-to-end**. Confirm before assuming hardware-only.

## Proposed fix shape (described, NOT coded) — consumer contributions only

The consumer needs **no functional change** to send the right command. The
consumer-side work is limited to **honesty + diagnosis**, to be coordinated with
the real (Lane 1) fix:

1. **(diagnostic, when the board is on)** Extend `scripts/monitor-live-probe.mjs`
   (currently drives `set_bus_fader`) to also drive a `set_send_level` for a
   known channel on Daniel's bus 5 and read back `monitor-live/state.buses[5]
   .sends[ch].level` — proving (or disproving) the OSC + read-back round-trip
   at the desk. This is the desk-on verification oracle for the fix.
2. **(only if Lane 1 finds the send is applied but never reflected into state)**
   the consumer fader will perpetually `revert`. No code change should mask that
   — the amber revert cue is *correct* behavior; the fix belongs in the bridge
   read-back, not the consumer. Flagged here so no one "fixes" the symptom by
   weakening the confirmation machine.

**No `src/**` lines need to change to make per-channel sends work.** If the
post-desk-on investigation surfaces a genuine consumer defect, the touch points
would be `MonitorClient.tsx:104-108` / `firestore-monitor-client.ts:225-232` —
but the current evidence says they are correct.

---

## Files examined (origin/master @ e9b900caa)

Consumer plane (full read): `MonitorClient.tsx`, `MonitorTabs.tsx`,
`FaderStrip.tsx`, `VerticalFaderStrip.tsx`, `QuickMonitorPanel.tsx`,
`firestore-monitor-client.ts`, `monitor-store.ts`, `monitor/bus-index.ts`,
`monitor/coerce-state.ts`, `monitor/fader-confirmation.ts`,
`hooks/use-monitor-connection.ts`, `hooks/use-monitor-access.ts`,
`types/monitor.ts`, `__tests__/visible-channels.test.ts`.
Bridge contract (read-only, cross-plane round-trip verification — Lane 1 owns the
fix): `bridge/src/firestore-transport.ts`, `bridge/src/x32-client.ts`.
