# MONITOR SENDS — Lane 3: cross-layer contract + prior-art + live forensics

**Author:** coder-3 · **Date:** 2026-05-23T01:22Z · **Tier:** 0 (READ-ONLY)
**Analyzed against:** `origin/master` @ `e9b900caa` (fresh detached worktree; canonical
cwd was on stale WIP `fix/b1-error-envelope-sweep` per the hard rule).
**Live Firestore:** READ-ONLY reads of `config/monitor`, `monitor-live/state`,
`monitor-live/commands/pending` (project `crcmusiccharts`). NO writes, NO commits.

---

## TL;DR (verdicts)

1. **Q1 — Contract is CLEAN end-to-end. CONFIRMED.** Client, MCP, firestore.rules,
   bridge dispatch, and X32 OSC all agree on `{type, busIndex, channelIndex, value}`.
   The one place a transposition could hide — the bridge's
   `set_send_level → x32.setSendLevel(channelIndex, busIndex, value)` arg order — is
   **correct** in code (but untested, see Q3).
2. **Q2 — `channelIndex` = X32 absolute input channel, 1-based, 1–32. NO layer
   translates it.** The iPad consumer passes the *correct* absolute index
   (`send.channelIndex` straight from live state); display filtering does not corrupt
   it. ⇒ The pre-probe's prime suspect (A) "wrong channelIndex / display position" is
   **REFUTED at the code level.**
3. **Q3 — The per-channel SEND write-path was NEVER verified live. CONFIRMED.** The
   only live-desk oracle (`scripts/monitor-live-probe.mjs`, P0-B2) drives **only**
   `set_bus_master`. No live probe, no UAT, and not even a bridge *unit* assertion ever
   drove a `set_send_level`/`set_send_on` to (or through) the desk. Sends are an
   **unverified write-path** — first real exercise was Daniel's service tonight.
4. **Q4 — Forensics reveal a NEW dimension the pre-probe missed (suspect "D").**
   Daniel's bus-5 send bank in `monitor-live/state` is **almost entirely
   `unconfirmed`** (fabricated `0`/`false` fallbacks, B11). The bridge's parallel
   send-query sync floods the X32; **bus *faders* confirmed for all 5 buses, but
   per-channel *sends* for buses 2–5 mostly timed out.** That mirrors Daniel's symptom
   exactly (bus master works, sends don't) and means he was shown a **zeroed/muted mix
   that did not reflect the desk**, with no working readback to confirm his writes.

**"Bus mute" mystery resolved (pre-probe open Q#1):** there is **no bus-mute command
and no bus-mute UI control at all.** Daniel's "mute/unmute my bus" can only be the
**master fader dragged/double-tapped to 0 and back** → `set_bus_master`. So **both**
working operations (bus volume + "mute") use the single `set_bus_master` type; **only**
the broken operation (per-channel sends) uses `set_send_level`/`set_send_on`.

---

## Q1 — Command contract, reconciled across all layers

Doc written to `monitor-live/commands/pending`, byte-identical from both writers:
`{ type, busIndex?, channelIndex?, matrixIndex?, value, uid, createdAt }`.

| Layer | `set_send_level` | `set_send_on` (mute) | file:line @ e9b900caa |
|---|---|---|---|
| **iPad client** | `setSendLevel(busIndex, channelIndex, value)` → `{type:"set_send_level",busIndex,channelIndex,value}` (throttled 50ms) | `setSendOn(busIndex, channelIndex, on)` → `value:on` (immediate) | `src/lib/firestore-monitor-client.ts:225‑242` |
| **MCP tool** | `setSendLevel({busIndex,channelIndex,level})` → `value:level` | `setSendMute({busIndex,channelIndex,muted})` → `value:!muted` | `src/lib/mcp/tools/monitor.ts:649‑722` |
| **MCP enqueue** | `enqueueCommand` adds `{uid, createdAt:Date.now()}` | same | `src/lib/mcp/server-monitor.ts:281‑310` |
| **Zod bounds** | `busIndex` int 1–5, `channelIndex` int 1–32, `level` 0–1 | `muted` boolean | `src/lib/mcp/tools/index.ts:1949‑2002` |
| **firestore.rules** | type allow-list + `uid==auth.uid` + `keys().hasOnly([type,uid,createdAt,busIndex,channelIndex,matrixIndex,value])` + per-field `is int`/`is number` | same; FOH matrix gated admin/SE | `firestore.rules:407‑436` |
| **Bridge dispatch** | `case "set_send_level": x32.setSendLevel(cmd.channelIndex!, cmd.busIndex!, cmd.value)` | `case "set_send_on": x32.setSendOn(cmd.channelIndex!, cmd.busIndex!, cmd.value)` | `bridge/src/firestore-transport.ts:383‑399` |
| **Bridge OSC** | `setSendLevel(ch,bus,v)` → `/ch/<ch₂>/mix/<bus₂>/level` float clamp[0,1] | `setSendOn(ch,bus,on)` → `/ch/<ch₂>/mix/<bus₂>/on` int 0/1 | `bridge/src/x32-client.ts:578‑588` |

**Polarity check (client `set_send_on` ↔ MCP `set_send_mute`):** consistent. Wire
`value:true` = **unmuted** (send ON). MCP flips at its layer: `muted:true → value:false`
→ bridge `set_send_on` → OSC `…/on 0`. ✅

**Arg-order check (the only transposition risk):** bridge passes
`(cmd.channelIndex, cmd.busIndex)` into `x32.setSendLevel(ch, bus, value)`. Order is
**correct** — `channelIndex→ch`, `busIndex→bus`. ✅ (Untested — see Q3.)

**Two corrections to the supervisor pre-probe:**
- Pre-probe #3 said a malformed/short send command is *silently dropped (no else)*. At
  `origin/master` it is now **rejected with an ack** (`confirmKeyFor` returns null →
  `ackWriter.write(id,"rejected",…)` + `batch.delete`) — not silent
  (`firestore-transport.ts:421‑446`). Behaviorally still "never reaches the desk," but
  it is acked, not dropped. (Ack surface itself ships in a later release; until then
  acks no-op — `tools/index.ts:2071` note.)
- The bridge `set_send_level`/`set_send_on` field guards live in **`confirmKeyFor`**
  (returns null on any missing field), not as inline `if` guards in the switch.

---

## Q2 — `channelIndex` semantics: DEFINITIVE

**`channelIndex` = the X32 absolute input-channel number, 1-based, range 1–32.**
Established in three places, translated in **none**:

1. **Bridge READ (source of the value the UI shows):** `syncFullState` builds
   `sends: [{channelIndex: ch}]` with `ch = i+1`, i∈0..31 → **1..32**
   (`x32-client.ts:633‑638`). This populates `monitor-live/state.buses[].sends[].channelIndex`.
2. **Bridge WRITE (no remap):** `setSendLevel(ch,bus)` pads `ch` straight into
   `/ch/<ch padded-2>/mix/…` (`x32-client.ts:578‑582`). Whatever `channelIndex` arrives
   becomes the literal X32 channel address. The **only** transform anywhere is
   zero-padding to 2 digits.
3. **MCP schema/describe:** `channelIndex: z.int().min(1).max(32)` "Channel index 1-32
   (X32 input bank; from get_mix sends list)" (`tools/index.ts:1960‑1967`).

**Does the iPad consumer honor this?** YES.
- `MonitorClient`: `allSends = myBus.sends` (live state) →
  `onSendLevel(send.channelIndex, val)` → `handleSendLevel` →
  `client.setSendLevel(myBusIndex, channelIndex, value)`
  (`MonitorClient.tsx:221,236‑237,104‑108`).
- `MonitorTabs`: `visibleSends = allSends.filter(s => visibleIndices.includes(s.channelIndex))`
  — a **display subset**; each rendered fader still emits its real
  `send.channelIndex` (`MonitorTabs.tsx:86,166,234`). The filter never reindexes.
- `QuickMonitorPanel` (perform-toolbar): identical pattern
  (`QuickMonitorPanel.tsx:71‑80,94,211‑212`).

⇒ **The consumer passes the correct absolute X32 channel.** Pre-probe suspect (A) —
"display position / 0-based / visible-channels index ≠ absolute" — does **not** hold at
the code level. (Lane 2 owns the exhaustive consumer trace; this is the cross-layer
contract truth: there is no index to get wrong because no layer reindexes, and the
consumer reads the index back out of the same state field the bridge wrote.)

---

## Q3 — Was the SEND write-path ever verified live? NO.

- **P0-B2 live oracle `scripts/monitor-live-probe.mjs`:** header comment says the MCP
  path drives **`set_bus_fader`** (line 25). The iPad-path write tier writes
  `{type:"set_bus_master", …}` and asserts on **`fader`** values only (F4 enqueue/drain,
  F5 state-reflect, F6 restore — lines 473, 499, 510). **No `set_send_level`/`set_send_on`
  is ever enqueued or asserted.** The probe literally restores the bus master fader and
  stops.
- **Bridge unit test `firestore-transport-commands.test.ts`:** feeds only
  `set_bus_master` (+ one `set_matrix_on`, + `set_bogus`). It mocks `x32.setSendLevel`
  (line 93) but **never feeds a `set_send_level` nor asserts
  `setSendLevel.toHaveBeenCalledWith(channelIndex, busIndex, value)`.** So the
  send-dispatch arg-order mapping is **not even unit-covered**.
- **Contract-shape tests that DO touch sends are mock/emulator only** (no real desk):
  `mcp-monitor-schema.test.ts`, `mcp-monitor.emulator.test.ts`,
  `firestore-rules-monitor.emulator.test.ts`, `x32-query-after-command.test.ts`,
  and the `x32-mock-server`. These prove the *shape*, not that a send lands on hardware.

⇒ **Sends are an unverified write-path.** The entire monitor overhaul (Phases 0–3)
exercised and hardened the `set_bus_master` path live; the per-channel send path's first
real-world exercise was Daniel's service tonight. This is *why* it only surfaced now.

(Note: the planning docs the lane prompt referenced — `PROGRAM-SPEC.md`,
`DEFECT-REGISTER.md`, `PHASE-*-PLAN.md` — are **not in the repo** at `e9b900caa`. Present:
`.paul/research/monitor-overhaul/{AUDIT-bridge,AUDIT-consumers}.md`,
`monitor-audit-lane1-bridge-FINDINGS.md`, `monitor-audit-lane2-app-mcp-FINDINGS.md`,
`docs/MONITOR-AUDIT.md`. None record a live send-write verification.)

---

## Q4 — Live forensic data (READ-ONLY, captured 2026-05-23T01:22Z)

### `config/monitor`
- **Bus 5 = "rabbi wedge", owned by Daniel Bogard** (two uids:
  `93Xn3DbS0bSNb8zmfzLyfOMX1A13`, `qIcEDdpHa5gr3cQVcGduPWyTxvQ2`). Buses 1–4 unassigned
  in the table. `monitorBuses: [1,2,3,4,5]`. `defaultChannels: [10,12,16,19,20,26]`
  (= Bass, Mando, Rav Gtr 5, Daniel, Leslie, Bima 1).
- `x32Address 192.168.1.78`; bridge `version 10.0.2`, `status:"online"`,
  `x32Connected:true`, `lastSeen 2026-05-23T00:27:33Z` (≈55 min stale now → PC/board off,
  matches PARENT).
- ⇒ **Authz/ownership all pass for Daniel on bus 5.** Not an access problem.

### `monitor-live/state` — the smoking gun
- `updatedAt 2026-05-23T00:28:03Z` → **~3280 s old (stale; threshold 90s).** Frozen
  end-of-service snapshot (desk off). `stateSeq 1232`, `bridgeVersion 10.0.2`.
- **Bus FADERS (the working path) — ALL 5 confirmed**, none in `unconfirmed`:
  bus1 .735, bus2 .743, bus3 .745, bus4 .746, **bus5 .835**.
- **Bus 5 ("rabbi wedge") SENDS — every one of 32 reads `on:false`**, all `level:0`
  except ch6 (David Gtr 1) `level:0.34375, on:false`.
- **Crucially, the bus-5 send values are FABRICATED, not real:** the `unconfirmed[]`
  array (B11 — keys the X32 did not answer during the last sync) contains
  **`send_level:N:5` + `send_on:N:5` for essentially every channel N=1..32**
  (the lone exception: `send_level:6:5` *was* answered = the real 0.34375; its
  `send_on:6:5` was not). So the bridge **could not read** bus-5 send state from the
  X32 and published `0`/`false` fallbacks.
- **Same pattern, progressively worse by bus:** bus1 sends mostly confirmed
  (only ch29–32 unconfirmed); bus2 unconfirmed from ch5/6 onward; **buses 3, 4, 5
  almost entirely unconfirmed.** Whole-bus blocks, not random — classic X32 OSC
  **query-flood drop**: `syncFullState` fires ~320 send queries (32 ch × 5 buses ×
  {level,on}) **concurrently** (`x32-client.ts:624‑648`), the X32 drops most for the
  later buses, each `query()` times out at 2s → `unconfirmed`.
- The one successful bus-5 read (`/ch/06/mix/05/level`=0.34) **proves the send address
  family is valid** and the desk answers it *sometimes* → this is a **drop** problem,
  not a wrong-address problem.

### `monitor-live/commands/pending`
- **Empty** (`{}`). All of today's commands were drained/deleted by the bridge (or swept
  by the 30s cleanup ~54 min ago). No leftover/rejected docs survive the window — so no
  direct forensic record of Daniel's individual send commands remains. (Absence ≠
  evidence of failure; the evidence window simply closed.)

---

## Synthesis: how the forensics explain Daniel's symptom

**Proven facts:**
- Bus *faders* confirmed for all buses; Daniel's bus-5 *sends* are unconfirmed/fabricated.
  This is a perfect match for "bus master works, per-channel sends don't" — and it's a
  **READ-path** failure (`syncFullState` flood) sitting *underneath* the reported
  write-path symptom.
- State was stale/frozen, so **no send write Daniel made could be confirmed by readback**;
  the FaderStrip confirmation machine (C-2/C-3) eases the knob **back to the authoritative
  (zeroed) value** when no fresh snapshot arrives (`FaderStrip.tsx:56‑70`). So even a
  send that *did* land would have **looked like it snapped back to 0 → "nothing happened."**
- Daniel was shown a **zeroed/muted picture** of his own mix (fabricated all-off), so his
  starting point and feedback were both wrong.

**Most likely root cause (for Lane 1 to confirm on the live desk):** the X32 OSC
**query-flood in `syncFullState`** makes per-channel send state for non-first buses
unreliable to **read**, and very plausibly unreliable to **write/confirm** during a
multi-channel gesture (level SET + on SET per drag = high message volume vs. the single
low-volume bus-master SET that works). Whether the send *writes* themselves reached the
desk audibly is **not determinable from frozen state** — it needs the desk-on test.

**New suspect "D"** (add to the pre-probe's A/B/C): **X32 OSC flood / dropped
reads-and-writes for non-first buses**, evidenced directly by the `unconfirmed` blocks.
This is independent of, and more strongly supported than, suspect (A).

---

## Desk-on verification protocol (for the Daniel-gated fix lane / Lane 1)

When the board + PC are back on, drive these **in order** and record results:
1. **Confirm the read flood.** Restart the bridge; immediately read `monitor-live/state`.
   If buses 2–5 sends populate `unconfirmed` again on a healthy desk, the parallel
   `syncFullState` query burst is the read defect → fix = **serialize/chunk + retry**
   the per-bus send queries (and/or raise the 2s `query()` timeout, lower concurrency).
2. **Drive ONE send write end-to-end on bus 5** (extend `monitor-live-probe.mjs` with a
   `set_send_level` + `set_send_on` tier mirroring the existing `set_bus_master` tier):
   enqueue `{type:"set_send_on", busIndex:5, channelIndex:19, value:true}` then
   `{type:"set_send_level", busIndex:5, channelIndex:19, value:0.5}`; confirm (a) the
   bridge drains them, (b) `/ch/19/mix/05/{on,level}` actually changes on the desk
   (listen to the rabbi wedge / watch the X32), (c) `monitor-live/state.buses[5].sends[19]`
   reflects it. Restore byte-identical after.
3. **Decide read vs write vs both.** If the write lands audibly but state doesn't reflect
   → pure read/confirm defect (cosmetic-but-confusing). If the write does NOT land
   audibly → real write defect (verify arg-order live + X32 drop under burst).
4. **Check bus-5 channel→bus routing & send on/off at the X32 itself** (Lane 1): were the
   channel→bus-5 sends genuinely OFF at the console (so level changes were inaudible until
   the auto-unmute `set_send_on(true)` lands), and is the "rabbi wedge" physically fed by
   mixbus 5?

---

## ⚠️ Reconciliation with Lane 1 (coder-1, already COMPLETE)

Lane 1's verdict (per `agents.md`): *"bridge EXONERATED, no code defect. Root cause =
desk-side send routing/on-state: `/ch/NN/mix/05/level` is set faithfully but inaudible
because bus-5 sends are OFF and/or bus 5 = SUBGROUP (not aux/send)."*

**Where I agree:** the bridge code path is symmetric master-vs-send and the OSC addresses
are correct (my Q1) — no bridge *dispatch* defect. The desk-side routing hypothesis (bus 5
sends off / bus 5 a subgroup) is plausible and is the right thing to test on the desk.

**Where my forensics REFINE / partially CHALLENGE Lane 1:**
- Lane 1's "**bus-5 sends are OFF**" appears to read `monitor-live/state.buses[5].sends[].on
  = false` at face value. **Those `on:false` values are FABRICATED** — every bus-5 send key
  is in `state.unconfirmed[]` (the X32 didn't answer the bridge's read), so B11 published the
  `false` fallback. **The state does NOT establish that the sends were genuinely off at the
  desk** — it establishes the bridge *couldn't read them.* Only a desk-on read (throttled
  queries) can confirm the real on/off state.
- ⇒ There is a **real bridge-side READ defect** independent of the desk routing question:
  `syncFullState` floods the X32 (~320 concurrent send queries) and loses bus-2..5 send
  reads. "Bridge exonerated" holds for *dispatch/write*, but the **read/sync path is not
  clean** — it fabricates Daniel's displayed mix and breaks write-readback confirmation.

**Net:** Lane 1's desk-routing cause and my read-flood finding are **complementary, both
desk-testable, and not mutually exclusive.** The synthesis should carry BOTH: (1) desk test
whether bus 5 is a subgroup / sends are physically off (Lane 1), AND (2) the bridge
`syncFullState` query-throttle fix (this lane) — plus a live single-send write test to settle
whether the *write* path also drops (my desk-on protocol step 2). Do not let the fabricated
`on:false` state values be cited as proof of either cause.

## Cross-references
- Supervisor pre-probe (PARENT.md): CONFIRMED on Q1/Q2/Q3 and on the bus-mute mechanism;
  EXTENDED with forensic suspect (D); CORRECTED on the "silent drop" nuance.
- Lane 1 (desk protocol / hardware) owns steps 1–4 above on the live desk.
- Lane 2 (consumer trace) owns the exhaustive UI trace; this lane's cross-layer verdict:
  the consumer passes the correct absolute `channelIndex` and the contract is clean — so
  Lane 2 should focus on confirming the auto-unmute-on-drag path and the stale-state
  revert UX, not an index-mapping bug.
