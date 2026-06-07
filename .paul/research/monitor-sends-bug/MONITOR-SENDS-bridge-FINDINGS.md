# MONITOR-SENDS — Lane 1 (bridge + X32 protocol) FINDINGS

**Author:** coder-1 (bridge expert) · **Tier-0 READ-ONLY** · board + studio PC OFF (no live OSC).
**Baseline:** all `file:line` evidence verified against `origin/master` @ `e9b900caa` (fresh detached
worktree `sheet-music-app-monitor-sends-1/`; canonical cwd is a stale WIP branch and was NOT used for code).
**Scope:** `bridge/src/**` + the X32 OSC send path + author the desk-on verification protocol.
**Deliverable pair:** §A per-question verdicts + root-cause; §B the desk-on verification protocol.

---

## TL;DR — bridge verdict: **EXONERATED for the common case; the send dies at/after the X32, not in the bridge.**

The bridge code path for a per-channel send is **symmetric with the bus-master path at every stage** —
address build, authorization, OSC emit, and read-back routing all mirror the master path that Daniel says
works. There is **no bridge-side asymmetry** that would let `set_bus_master` succeed while `set_send_level`
silently dies. Therefore the break is **downstream of the bridge's `socket.send()`** — at the X32 / desk
routing — OR (less likely, per the round-trip evidence below) **upstream in the consumer's `channelIndex`**
(Lane 2's domain).

**Prime hypothesis (desk-side, needs the board on to confirm):** the channel→bus-5 **sends are OFF** and/or
**bus 5 is configured as a SUBGROUP rather than an aux/send bus** — in both cases `/ch/NN/mix/05/level` sets a
parameter that produces **no audible change**, while `/bus/05/mix/fader` (master, and the mute) always moves
the bus output. That single fact explains the entire symptom split.

### The clean diagnostic split (this is the key clue)
Everything Daniel reports as **WORKING** exercises exactly ONE bridge command → ONE OSC address:

| Daniel's action | Bridge command | X32 OSC | Result |
|---|---|---|---|
| Change bus volume | `set_bus_master` | `/bus/05/mix/fader` | ✅ works |
| Mute / unmute bus | `set_bus_master` (→0, →restore) — see Q2 | `/bus/05/mix/fader` | ✅ works |
| Adjust a channel in the bus | `set_send_level` | `/ch/NN/mix/05/level` | ❌ nothing |

So the *only* variable that distinguishes "works" from "nothing" is **`/bus/05/mix/fader` vs
`/ch/NN/mix/05/level`** — a bus-output write vs a per-channel send write. The bridge handles both correctly;
the X32 treats them very differently depending on how bus 5 is configured and whether each send is on.

---

## §A — Per-question verdicts

### Q1 — OSC correctness → **PASS (addresses + scaling correct), with a desk-config caveat**

**Address build (`bridge/src/x32-client.ts`):**
- `setSendLevel(ch, bus, value)` `:578-582` → `/ch/${ch2}/mix/${bus2}/level`, float `Math.max(0,min(1,value))`.
- `setSendOn(ch, bus, on)` `:584-588` → `/ch/${ch2}/mix/${bus2}/on`, int `0|1`.
- `setBusFader(bus, value)` `:572-576` → `/bus/${bus2}/mix/fader`, float clamped.
- `<x2>` = `String(n).padStart(2,"0")` → channel `01-32`, bus `01-16`. **No index remapping** — whatever
  `channelIndex` arrives becomes the literal X32 channel number.

Verified against the X32 OSC spec: `/ch/NN/mix/MM/level` is the correct channel→mix-bus send-level node
(channel `01-32`, bus `01-16`), `/ch/NN/mix/MM/on` the send on/off, `/bus/MM/mix/fader` the bus master.
**The bridge builds the right addresses.** ✅

**Float scaling — ruled out as the differentiator by parity:** the send level and the bus master use the
**identical** encoding (`Math.max(0,min(1,v))` linear 0–1 through the X32's fader law; `0.75 ≈ 0 dB`). Since
the bus master at the same encoding IS audible, a "valid-but-wrong-curve / too-tiny value reads as nothing"
explanation is **impossible** — it would have killed the master too. ✅ scaling exonerated.

**Caveat (desk-config — the actual leading cause, verify with board on):** a per-channel send only changes
what is heard when **(a) that send is ON** (`/ch/NN/mix/05/on = 1`) **and (b) bus 5 is in aux/send mode**.
The X32 exposes **Pre / Post / Subgroup** per send. If bus 5 is a **subgroup**, the per-channel *send level*
is not the governing control (the channel feeds the subgroup via assignment + channel fader), so
`/ch/NN/mix/05/level` is set but inaudible — exactly the symptom. This is **desk state, not bridge code.**

### Q2 — the bus-mute mystery → **RESOLVED: "bus mute" is `set_bus_master`→0 (the working master path)**

There is **no** `set_bus_mute` / `set_bus_on` anywhere in the stack — confirmed three ways:
- Consumer client `src/lib/firestore-monitor-client.ts` has only `setBusMaster/setSendLevel/setSendOn/
  setMatrixFader/setMatrixOn` (`:217-259`) — **no `setBusMute`.**
- Bridge dispatch switch `bridge/src/firestore-transport.ts:383-399` handles only `set_bus_master /
  set_send_level / set_send_on / set_matrix_fader / set_matrix_on` — **no `set_bus_mute` case** (an unknown
  type is caught earlier by `confirmKeyFor` → "rejected", `:372-380` / `:421-446`).
- MCP `MonitorCommandType` `src/lib/mcp/server-monitor.ts:274-279` — same five types, no bus-mute.

**The actual mechanism:** the bus "mute/unmute" is the **FaderStrip double-tap gesture** on the **Master**
strip. `src/components/monitor/FaderStrip.tsx:108-117`: a double-tap (within 300 ms) computes
`resetVal = displayValue > 0.1 ? 0.0 : 0.75` and fires `onChange(resetVal)`. For the Master strip
(`MonitorTabs.tsx:139-146` / `:190-197`) `onChange` = `onBusMaster` → `client.setBusMaster(myBusIndex, value)`
(`MonitorClient.tsx:98-102`). So **mute = `set_bus_master`→0, unmute = `set_bus_master`→0.75** — i.e. the
**same `/bus/05/mix/fader` OSC** that the volume slider uses. ⇒ Daniel's "mute works" is more evidence that
the **bus-master OSC path is fully healthy**, and isolates the failure to the **send** OSC path alone.

### Q3 — authorization parity → **PASS: sends pass the IDENTICAL auth gate as the master**

`isCommandAuthorized` `bridge/src/firestore-transport.ts:509-530`:
```
const userBus = this.config.getUserBus(cmd.uid)
const isEngineer = await this.getIsEngineer(cmd.uid)
if (matrix cmd) return isEngineer
if (cmd.busIndex !== undefined) return isEngineer || userBus === cmd.busIndex
return false
```
Both `set_bus_master` and `set_send_level` carry `busIndex = 5`. The gate is **`userBus === cmd.busIndex`
(or engineer)** for *both* — there is no per-type branch. A `band_leader` who owns bus 5 (Daniel) passes the
gate for the send for the **same reason** the master passes. `config.getUserBus` is array-aware (BR-04,
`config.ts:113-122`) so co-owned/array assignments resolve. **Auth is provably not where the send dies** —
if it were, the master (identical gate, identical busIndex) would fail too. ✅ exonerated.

### Q4 — silent drops → **enumerated; none fire for a normal single send nudge**

Every bridge path that can accept-then-drop a send command, and whether it plausibly fires:

1. **Missing field → `confirmKeyFor` null** `:427-430` — `set_send_level` needs `busIndex` **and**
   `channelIndex` **and** `value` all defined; else "rejected" ack + `batch.delete`, never sent to desk.
   The consumer always sends all three (`firestore-monitor-client.ts:225-232`) → **does not fire normally**
   (but the desk protocol should read the ack to be certain).
2. **Stale discard** `:340` — drop if `now − serverCreateMs > 10 s` (server clock, B4). Throttled writes land
   in ms → **won't fire** for live use.
3. **Superseded by newer same-target** `:359` — during a fast drag only the **latest** `set_send_level` for
   that target applies (older "rejected"). Correct latest-wins; the **final drop value IS applied**, and a
   slow single nudge is never superseded → **not the bug** (and the master fader has the same behavior).
4. **Idempotency skip** `:320` — re-delivered `commandId` only → not a cause.
5. **Unauthorized** `:330` — ruled out by Q3.
6. **Standby bridge drops the batch** `:259-262` (B10 lease) — only if a *second* bridge holds the lease.
   Single-PC studio → not a factor; the protocol should still confirm exactly one active bridge.

**Conclusion:** for a normal single send-level move the bridge does **not** drop it — it reaches
`this.x32.setSendLevel(...)` `:387-388` and emits the OSC. The drop paths above are edge cases to *exclude*
via the ack surface during desk verification, not the explanation.

### Q5 — state reflection / "snap-back" vs true write-drop → **a discriminator for the desk protocol**

After a send SET the bridge schedules a C2 read-back GET `/ch/NN/mix/05/level` (`x32-client.ts:581,505-515`);
the reply routes through `routeParameterChange` send-level branch `:405-418`, which updates the cache **only
if** `this.buses.find(b => b.index === 5)` **and** `bus.sends.find(s => s.channelIndex === N)` both exist,
then emits `send_level` → `setupX32Listeners` `:585-588` → `scheduleStateWrite` → `monitor-live/state`.

- This read-back path has the **same `this.buses[5]` dependency** as the master's `bus_fader` branch
  `:393-402`. Since the master reflects/works and `get_mix(5)` works for Daniel, **bus 5 is in
  `config.monitorBuses` and was sync'd with its 32 sends** (`syncFullState` `:624-648`) → the send read-back
  *can* resolve. So there is **no bridge asymmetry in reflection** either.
- ⇒ The send read-back returns **whatever the X32 reports for `/ch/NN/mix/05/level`**. The `level` parameter
  exists and is settable **regardless** of the send's on-state or subgroup mode. So two desk outcomes are
  possible, and they look different in the app — **this is the protocol's key oracle:**
  - **App fader CONFIRMS (green ✓, holds new %) but no audible change** ⇒ the level param *was* set and read
    back, but it isn't audible → **desk routing: send OFF and/or bus-5 = subgroup.** (Most likely.)
  - **App fader REVERTS (amber ↩ Undo2, snaps to old value)** ⇒ the X32 did not accept/return the new level →
    true write-drop / addressing / sync issue. (FaderStrip C-3 timeout `FaderStrip.tsx:62-70`.)

So "nothing happened" is **ambiguous from Daniel's seat** — the protocol must record *which* of these two the
fader does, because they point at opposite root causes.

---

## Root-cause hypotheses (ranked, with how to confirm)

1. **(DESK) Bus 5 is a SUBGROUP, or the channel→bus-5 sends are OFF** — `/ch/NN/mix/05/level` is set but
   inaudible while `/bus/05/mix/fader` always works. **Best fit for the exact symptom split.** Confirm: with
   the board on, read `/ch/NN/mix/05/on` for the channels Daniel adjusts + the bus-5 send-mode (Pre/Post/Sub);
   then drive one `set_send_level` and listen. *Fix would be desk/config, possibly + always sending
   `set_send_on(true)` alongside a level move.*
2. **(DESK/PROTOCOL) The send write path was NEVER live-verified** — the "control works, proven live" claim
   in `DEFECT-REGISTER.md §1` rests on `monitor-f1-probe`/P0-B2, which drives **`set_bus_master` only**
   (`scripts/monitor-live-probe.mjs:472-478` enqueues `type:"set_bus_master"`; never a send). The audits
   treat all five SETs as equivalent fire-and-forget OSC — true at the bridge, **false at the desk.** So the
   send path is **unproven**, not proven-good. The §B protocol closes this gap.
3. **(CONSUMER — Lane 2) Wrong `channelIndex`** — *weakened by round-trip evidence:* the UI sends
   `onSendLevel(send.channelIndex, …)` (`MonitorTabs.tsx:166,234`) where `send.channelIndex` is the bridge's
   own 1-based absolute channel from `syncFullState` (`x32-client.ts:633-642`, `channelIndex: ch`, `ch=i+1`).
   bridge→state→UI→bridge is faithful 1–32, so a mis-index is *unlikely* — **but** `coerce-state` /
   `monitor-store` could remap; **Lane 2 owns the definitive verdict.**
4. **(CONSUMER) Auto-unmute never fires** — FaderStrip auto-sends `set_send_on(true)` only when it believes
   the send is OFF (`FaderStrip.tsx:103-105`, `if (onUnmuteCheck && !on)`). If the app shows the send as ON
   while the desk has it OFF (or bus is subgroup), no unmute is attempted and the level write is inaudible.
   Pairs with #1. Lane 2 to assess the `send.on` source of truth.

**Bridge code defects found: NONE.** No swapped args (`set_send_level` → `setSendLevel(channelIndex,
busIndex, value)` `:388` matches signature `setSendLevel(ch, bus, value)`), no wrong address, no auth gap, no
asymmetric drop, no asymmetric reflection. The bridge faithfully relays the send; the bridge is not the bug.

---

## §B — Desk-on verification protocol (run in ~5 min once the board + studio PC are up)

**Goal:** prove or refute, on the live desk, whether a per-channel send reaches and is *audible* on bus 5,
and capture the Q5 discriminator (confirm-vs-revert). **Extend `scripts/monitor-live-probe.mjs`** — sketch
below is **plan only, do NOT commit this wave.** Reuse the existing harness: service-time guard, monitor-bus
gate, snapshot→write→read-back→**byte-identical restore**, both write paths.

**Pre-flight (cheap, do first):**
1. **Confirm bus 5 is a real monitor bus + sync'd.** Read `config/monitor.monitorBuses` — assert it
   **includes 5** (default is `[1,2,3,4]`, `config.ts:16`; if 5 is missing, send read-back can't reflect).
   *(Cross-check with Lane 3, who owns the live-Firestore read — see coordination note.)*
2. **Snapshot the target send + bus mode.** With the desk on, GET and record:
   `/ch/NN/mix/05/level`, `/ch/NN/mix/05/on`, `/bus/05/mix/fader`, and the bus-5 send mode (Pre/Post/Sub).
   Pick `NN` = a channel actually in Daniel's mix (a visible/starred send). Record current values for restore.
3. **Service-time guard ON** (CRC Fri eve / Shabbat morning) + monitor-buses-only — already in the harness
   (`monitor-live-probe.mjs:185-206,304-312`).

**The send test (the new part):**
4. **iPad-path send write.** `addDoc(monitor-live/commands/pending, {type:"set_send_level", busIndex:5,
   channelIndex:NN, value:TEST, uid:<bus-5 owner>, createdAt:Date.now()})` — exactly as
   `firestore-monitor-client.setSendLevel` does. (In-process `createdAt` lands inside the 10 s window, B4.)
5. **Drain check.** Assert the command is consumed (doc deleted = applied) or annotated (`error` field =
   rejected) within the drain budget — same `awaitCommandResult` logic as today (`:555-567`).
6. **Audible + desk check (human in booth, 1 person):** does the channel's level in Daniel's wedge actually
   change? AND read back `/ch/NN/mix/05/level` from the X32 — did the desk's own value move?
7. **State-reflect check.** Poll `monitor-live/state` → `buses[5].sends[NN].level` reflects `TEST` within the
   reflect budget (mirror `readBusFaderFromState` for a send: `buses.find(index===5).sends.find(channelIndex
   ===NN).level`). **Record confirm-vs-revert** (Q5 discriminator).
8. **MCP-path parity.** Repeat the level move via the MCP `set_send_level` tool (server-mediated) to confirm
   the MCP write path also reaches the desk (or is refused by preflight) — mirrors the existing
   `set_bus_fader` MCP step (`:363-382`).
9. **On-state probe.** If step 6 shows no audible change but step 7 confirms the level value: send
   `set_send_on(busIndex:5, channelIndex:NN, value:true)`, repeat the level move — if it becomes audible, the
   root cause is **send-was-OFF**; if still inaudible, the root cause is **bus-5 = subgroup / not aux** (desk
   reconfig needed).
10. **Restore byte-identical** — re-enqueue the snapshot `level` (and `on`) from step 2; verify the desk +
    `monitor-live/state` returned to the snapshot. **REFUSE the whole write tier if a restore value is
    unknown** (existing F3 guard, `:451-463`).

**Decision table for the run:**
| step 6 audible | step 7 reflects | ⇒ root cause |
|---|---|---|
| no | yes (confirm) | bus-5 subgroup OR send OFF → **desk/config** (try step 9) |
| no | no (revert) | true write-drop / addressing → re-open bridge+consumer (rare; would contradict §A) |
| yes | yes | send path **healthy** → the original report was send-OFF transient or a since-fixed UI state |

**Why extend `monitor-live-probe.mjs` and not a new script:** it already has the credential tiers, the
service-window + restore-or-refuse safety, the iPad-path `addDoc` and the MCP wire — adding a
`PROBE_CHANNEL=NN` + a `set_send_level` branch is a small, contained addition that keeps one operational
oracle. (The current probe only ever exercises `set_bus_master` — closing exactly the gap in hypothesis #2.)

---

## Coordination notes
- **Lane 2 (consumer):** §A Q1/Q5 + hypotheses #3/#4 hand you the precise pointers — confirm
  `coerce-state`/`monitor-store` preserve `send.channelIndex` as 1-based absolute (round-trip looks faithful
  from the bridge side), and assess the `send.on` source of truth that gates auto-unmute (`FaderStrip.tsx:103`).
- **Lane 3 (live-Firestore READ-ONLY):** please capture, READ-ONLY, `config/monitor.monitorBuses` (does it
  include **5**?) and `config/monitor.busAssignments[5]` (Daniel is the owner) and the latest
  `monitor-live/state.buses[5].sends[*].on` — these confirm whether send read-back can reflect and whether
  the app currently believes the sends are on. I deliberately did **not** read live Firestore (your lane).
- **Supervisor:** synthesis input — bridge is **exonerated** (no code defect); the SYNTHESIS root-cause is
  **desk-side send routing/on-state**, and the fix-lane is **the §B desk-on protocol run** (board on), not a
  bridge change. If the protocol's decision table lands on the rare "revert/write-drop" row, only then
  re-open bridge+consumer.

## Sources (X32 OSC spec)
- [Mixing Station — X32/M32 docs](https://mixingstation.app/ms-docs/mixers/behringer/x32/)
- [Sweetwater — X32: how to route an input to a bus](https://www.sweetwater.com/sweetcare/articles/behringer-x232-how-to-route-an-input-to-a-bus/)
- [Unofficial X32/M32 OSC remote protocol (PDF)](https://tostibroeders.nl/wp-content/uploads/2020/02/X32-OSC.pdf)
- [pmaillot/X32-Behringer (OSC reference)](https://github.com/pmaillot/X32-Behringer/blob/master/README.md)

Confirmed: `/ch/NN/mix/MM/level` (float) + `/ch/NN/mix/MM/on` are the channel→mix-bus send nodes (ch `01-32`,
bus `01-16`); `/bus/MM/mix/fader` the bus master; Pre/Post/**Subgroup** is a per-send option that determines
whether the per-channel send level is the governing control.
