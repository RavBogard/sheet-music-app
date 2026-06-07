# MONITOR per-channel SEND bug — SYNTHESIS (supervisor)

**Inputs:** Lane 1 bridge (coder-1) · Lane 2 consumer (coder-2) · Lane 3 contract+forensics (coder-3),
all READ-ONLY @ `origin/master` `e9b900caa`. Board + studio PC OFF during research.
**Report:** Daniel, bus 5 ("rabbi wedge"), tonight's Kabbalat Shabbat: bus master fader + "mute"
work; per-channel sends within the bus do nothing.

---

## Verdict: NOT the obvious code bug. Two complementary, desk-testable causes — one of them a REAL bridge defect.

All three lanes independently agree:
- **Bridge dispatch/OSC/auth = symmetric master-vs-send and CORRECT** (Lane 1). `/ch/NN/mix/05/level`
  is the right address; arg order `setSendLevel(channelIndex, busIndex, value)` is right; the send passes
  the *identical* ownership auth gate as the master.
- **Consumer wiring + channelIndex = CORRECT** (Lane 2 + Lane 3). The drag dispatches a well-formed
  `set_send_level`; `channelIndex` is the X32 absolute channel 1–32 with **no remap at any layer**. The
  pre-probe's prime suspect (wrong channelIndex) is **REFUTED**.
- **The command contract is CLEAN end-to-end** (client/MCP/firestore.rules/bridge/OSC all agree).
- **"Bus mute" is not a primitive** — there is no bus-mute command or UI; "mute" = master fader → 0 via
  the FaderStrip double-tap = the **same `set_bus_master` path that works**. So *every* working operation
  uses `set_bus_master`; *only* the broken one uses `set_send_level`. 

### Why it only surfaced tonight
**The per-channel SEND write-path was NEVER verified live.** The entire Monitor Overhaul (Phases 0–3) and
the P0-B2 live oracle drive **only `set_bus_master`** — no live probe, UAT, or even a bridge *unit*
assertion ever drove a `set_send_level` to/through the desk. Tonight was its first real-world exercise.

### The two causes (both need the board ON to settle; not mutually exclusive)

**CAUSE 1 — Bridge READ-side OSC query-flood (NEW, a real code defect; Lane 3 forensics).**
`syncFullState` fires **~320 concurrent OSC queries** (32 ch × 5 buses × {level,on}). The X32 drops most
for the later buses: live `monitor-live/state` shows bus *faders* confirmed for all 5 buses, but bus-5 (and
2–4) per-channel *sends* almost entirely in `unconfirmed[]` → the bridge **published fabricated
`on:false`/`level:0` fallbacks**. Consequences:
- Daniel was shown a **zeroed/muted picture of his own mix that did not reflect the desk.**
- With no working send read-back, **his send writes could not be confirmed** → the FaderStrip confirmation
  machine eased each knob **back to the fabricated 0** → "nothing happened," even if the write landed.
- The ONE bus-5 send the X32 *did* answer (ch6 = 0.34) proves the address family is valid → this is a
  **drop**, not a wrong-address, problem.

**CAUSE 2 — Desk-side routing/on-state (Lane 1 hypothesis).** Bus 5 may be configured as a **SUBGROUP**
rather than an aux/send bus, and/or the channel→bus-5 **sends are physically OFF**. In either case
`/ch/NN/mix/05/level` is set but **inaudible**, while `/bus/05/mix/fader` always moves the wedge output.
⚠️ **Important correction (Lane 3 vs Lane 1):** Lane 1's "sends are OFF" reads the `on:false` values at
face value — but those are the **fabricated** unconfirmed fallbacks from Cause 1, **not** proof the sends
were really off. The real on/off state can only be read on a healthy desk with throttled queries.

---

## Fix plan

### A. Bridge `syncFullState` query-throttle (REAL code fix — warranted regardless of the desk question)
Serialize/chunk the per-bus send queries (don't fire ~320 at once): batch with a small concurrency cap +
retry the timed-out reads (and/or raise the 2s `query()` timeout). Goal: bus-2..5 send state reads
reliably → no fabricated `on:false`, and write-readback can confirm. Owner: **coder-1 (bridge,
single-owner)**, Tier 2, ships in a **Daniel-gated bridge release**. ★ Can be **built + unit-tested now**
(board off); the live confirmation + release happen when the desk is back on.

### B. Desk-on verification protocol (settles Cause 2 + proves the write path) — run when board + PC are up
Extend `scripts/monitor-live-probe.mjs` (currently `set_bus_master` only) with a `set_send_on` +
`set_send_level` tier on bus 5, then, in order:
1. Restart bridge, read `monitor-live/state` — do bus-2..5 sends still land in `unconfirmed[]` on a healthy
   desk? (confirms Cause 1 / validates fix A).
2. Drive ONE send end-to-end on bus 5 (`set_send_on ch19 true` → `set_send_level ch19 0.5`): confirm the
   bridge drains it, `/ch/19/mix/05/{on,level}` actually changes on the desk (listen to the rabbi wedge),
   and `state.buses[5].sends[19]` reflects it. Restore byte-identical.
3. Decide read-vs-write-vs-both from the Q5 discriminator (fader CONFIRMS-but-silent ⇒ desk routing /
   send-off / subgroup; fader REVERTS ⇒ true write-drop).
4. At the X32 itself: is bus 5 an aux/send or a **subgroup**, and were the channel→bus-5 sends genuinely
   OFF? (Cause 2). If a desk reconfig is needed, that's an operational fix, not code.

**Net:** build A now; run B when the board's on. A is independently correct (it fabricates the displayed
mix + breaks confirmation); B tells us whether there's ALSO a desk-config piece. Do not let the fabricated
`on:false` state be cited as proof of either cause.

## Worktrees
The three research worktrees (`sheet-music-app-monitor-sends-{1,lane2,3}`, detached/read-only, findings on
disk) are teardown-eligible — sweep under standing authority once Daniel's seen this.
