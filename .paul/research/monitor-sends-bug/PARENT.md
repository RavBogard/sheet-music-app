# PARENT — monitor per-channel SEND bug (live service report 2026-05-22)

**Status:** READ-ONLY research wave. Board + studio PC are POWERED OFF — no live
desk available. Diagnose + write a fix-plan + a desk-on verification protocol.
**NO src/bridge code changes this wave.** The fix is a separate Daniel-gated lane
that runs when the board is back on.

---

## The bug (Daniel, from tonight's Kabbalat Shabbat service, controlling his own
## monitor wedge mix = **bus 5**)

- ✅ Mute / unmute his **bus** — works.
- ✅ Change the **volume (master fader)** of his bus — works.
- ❌ Adjust the **individual channels within that bus** (the per-channel SENDS —
  how much of each instrument/vocal he hears in his wedge) — **does nothing.**
  "Changing things on the app seemed to do nothing."

So: **bus-master path works; per-channel send path is dead** (from the iPad app,
for a `band_leader` who owns bus 5). monitors = **WEDGES** not IEM.

---

## Supervisor pre-probe (already done — BUILD ON THIS, do not re-derive)

I traced the send path across all three planes. **The command contract is
clean and consistent end-to-end** — which is the key clue:

1. **iPad consumer write** (`src/lib/firestore-monitor-client.ts:223-240`):
   - `setSendLevel(busIndex, channelIndex, value)` → writes
     `{type:"set_send_level", busIndex, channelIndex, value, uid, createdAt}`
     to `monitor-live/commands/pending` (throttled 50ms).
   - `setSendOn(busIndex, channelIndex, on)` → `{type:"set_send_on", …, value:on}`.
   - **There is NO `setBusMute`/`setBusOn` method in this client at all.** So
     Daniel's working "bus mute" must route through a *different* mechanism than
     the channel sends (candidate: a mute button that calls `setBusMaster(0)` and
     restores, i.e. the bus-MASTER path — the one that works). ← confirm which.
2. **MCP command shape** (`src/lib/mcp/server-monitor.ts:124-136`): `MonitorCommand`
   = `{type, busIndex?, channelIndex?, matrixIndex?, value}` — same shape.
3. **Bridge dispatch** (`bridge/src/firestore-transport.ts:274-307`): handles
   `set_bus_master` / `set_send_level` / `set_send_on` / `set_matrix_fader` /
   `set_matrix_on`. **There is NO `set_bus_mute`/`set_bus_on` case** (default →
   `console.warn("Unknown command type")`, no-op). Each case has a silent field
   guard: e.g. `set_send_level` only fires if
   `busIndex !== undefined && channelIndex !== undefined && value !== undefined`
   — **no `else`, so a malformed/short send command is silently dropped.**
4. **Bridge OSC** (`bridge/src/x32-client.ts`):
   - `setBusFader(bus,v)` → `/bus/<bus2>/mix/fader` (works for Daniel).
   - `setSendLevel(ch,bus,v)` → `/ch/<ch2>/mix/<bus2>/level`.
   - `setSendOn(ch,bus,on)` → `/ch/<ch2>/mix/<bus2>/on`.
   - (`<x2>` = zero-padded to 2 digits; **the bridge does NOT remap the index —
     whatever `channelIndex` the app sends becomes the literal X32 channel
     number.**)
5. **FaderStrip** (`src/components/monitor/FaderStrip.tsx`) is a *generic* fader —
   identical for master and channel; it just calls `onChange(value)`. Since the
   master fader (same component) works, **the bug is NOT in FaderStrip's
   interaction/render** — it is in the PARENT that wires each channel fader's
   `onChange` → `client.setSendLevel(busIndex, channelIndex, value)` and chooses
   the `channelIndex`.

### ⇒ Prime suspects (in priority order)
- **(A) Parent wiring / channel-index mapping** (consumer plane, Lane 2): the
  channel FaderStrips in `MonitorClient`/`MonitorTabs` either don't call
  `setSendLevel`, or pass a **wrong `channelIndex`** (display position / 0-based /
  "visible-channels" index ≠ the X32 absolute channel 1–32). A wrong channelIndex
  → OSC hits a non-listened/unrouted channel → "nothing happens." `visible-channels`
  + `defaultChannels` mapping is the hot spot.
- **(B) Desk-side hardware state** (Lane 1 protocol): the channel→bus sends may be
  OFF at the X32, or the bus tap/mode makes level changes inaudible. Only the desk
  can confirm — hence the verification protocol.
- **(C) Was the send write-path EVER verified live?** (Lane 3): Phase-0/1 only ever
  drove `set_bus_fader` (P0-B2) and tested `get_mix`. The per-channel SEND *write*
  to the X32 may never have been exercised end-to-end. Confirm.

---

## Prior art — READ before you dig (do not re-derive)
- `.paul/research/monitor-overhaul/PROGRAM-SPEC.md` (R1/R2/R3 + the §1 live-desk
  diagnosis), `AUDIT-bridge` content via `git log`, `DEFECT-REGISTER.md`,
  `PHASE-{0,1,2,3}-PLAN.md`.
- `scripts/monitor-live-probe.mjs` (the P0-B2 oracle — the basis for the desk-on
  verification protocol; it currently drives `set_bus_fader`, NOT a send).
- Memory: monitors are **WEDGES**; "Vocal Lead" not "Lead"; bridge state lives at
  `monitor-live/state` (its `updatedAt` can freeze while the heartbeat advances).

## Hard rules (binding on every lane)
- **READ-ONLY. Zero src/, zero bridge/, zero data writes, zero commits.** Deliver a
  FINDINGS doc only (and Lane-3 may read live Firestore READ-ONLY).
- Board is OFF → no live OSC. Do NOT attempt desk writes. Where live confirmation
  is needed, write it into the **desk-on verification protocol** for later.
- Build on the supervisor pre-probe above; verify it against current `origin/master`
  (don't trust this doc blindly — confirm line numbers/shapes still hold).
- Canonical cwd is a stale WIP branch — analyze via a fresh worktree off
  `origin/master` or `git show origin/master:<path>`, never the canonical tree.
- Deliverables land in `.paul/research/monitor-sends-bug/`. SHIP-NOTICE (Tier-0
  docs) → `inbox/supervisor.md` (research-lane SHIP-NOTICEs go to supervisor, not
  auditor). Supervisor synthesizes all 3 → `MONITOR-SENDS-SYNTHESIS.md` → brings
  Daniel the root cause + fix-plan + desk-on protocol.
