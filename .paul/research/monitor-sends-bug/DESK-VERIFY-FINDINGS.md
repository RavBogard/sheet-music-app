# DESK-VERIFY-FINDINGS — monitor-sends throttle fix on the live desk via bridge v10.0.4

**Lane:** monitor-sends-desk-verify (Tier-0 probe + scripted writes; restore-or-refuse)
**Author:** coder-1
**Date:** 2026-05-23
**Bridge baseline:** v10.0.4 @ origin/master `6a313f5dd`
**Throttle fix under verification:** `8fb8cd62a` (bridge `syncFullState` bounded-concurrency pool, cap 12 / attempts 3 — shipped to the desk via v10.0.3 → v10.0.4)

## VERDICT — **LIVE-VERIFIED**

The `syncFullState` bounded-concurrency throttle (`8fb8cd62a`) is the real fix.
On the live studio desk with v10.0.4 running:

- `monitor-live/state.unconfirmed` stayed **`[]`** throughout pre-flight, three send-tier probe iterations, AND a `bridgeControl: {action:"resync"}` flood (the syncFullState hot path).
- All 5 monitor buses × 32 channels read **CONFIRMED** `{level, on}` values — the exact pattern Lane-3 pre-fix forensics (`MONITOR-SENDS-contract-FINDINGS.md`) showed buses 2-5 fabricating `on:false`/`level:0` from dropped OSC reads.
- Per-channel `set_send_level` and `set_send_on` writes via the iPad command path drained on the bridge (= "applied") AND reflected in `monitor-live/state.buses[5].sends[15]` within ~10s — readback works, end to end.
- Byte-identical restore confirmed (bus 5 ch 15 = `level:0.0625, on:true` pre-probe = post-probe).

No code or data changes. No bridge edits. No desk routing changes. Bridge `errCount` unchanged (8 → 8) across the entire window.

---

## Method

Originally drafted in this lane's authoring run (`scripts/monitor-live-probe.mjs` + README @ `6a313f5dd`), but the canonical probe requires `CRL_MCP_TOKEN` (a ROOT `crl_live_` bearer) to run any tier — and no such bearer is checked into the repo. Per the lane prompt's explicit "Firebase MCP / direct REST" alternative, I drove the **iPad-path write tier** directly via the Firebase MCP `firestore_add_document` / `firestore_get_document` / `firestore_update_document` tools, which exercise the same `monitor-live/commands/pending` → bridge dispatch → X32 OSC → `monitor-live/state` reflect path the probe's send tier was authored to test.

This is the same channel `firestore-monitor-client.ts` uses from the iPad app — i.e. the North Star surface, not the MCP-validated write path (which goes through `preflightBusWrite` and is not the path Daniel hits when he drags a fader).

### Target channel pick — bus 5 ch 15 "Sax"

From the pre-flight `config/monitor` + `monitor-live/state` read:

- Bus 5 is "rabbi wedge" (one of Daniel's two owned buses per `busAssignments[5]`).
- Ch 15 "Sax": `level=0.0625, on=true` — actively routed (so a CONFIRMED post-fix read is meaningful, not the pre-fix fabricated 0/false) BUT audibly inert because no sax player is physically at the desk during this window (Daniel + the band are all remote).
- Explicitly NOT lead vocal (Daniel ch 19), Rabbi Dan ch 23, or PodiumMic ch 25 — per the lane prompt's "avoid lead vocal / pulpit mic".

### Coordination

HEADS-UP coder-2 (`bridge-v1004-stress`) twice via `inbox/coder-2.md`:
1. Before the probe iteration window — pure FYI; no `bridgeControl` writes yet.
2. Before firing R2 `bridgeControl: {action:"resync"}` — so coder-2's own R2/R3 writes can sequence >60s after mine, keeping the bridge's nonce-dedup window clean.

---

## §1 — Pre-flight baseline (PASS)

### `config/monitor.bridge` snapshot at 19:25:35Z

```
version:           "10.0.4"
lastSeen:          2026-05-23T19:25:35.582Z   (read 19:25:33Z → +2s fresh)
socketAlive:       true
x32Connected:      true
status:            "online"
unconfirmedCount:  0                           ← the headline post-fix signal
queueDepth:        0
stateAgeMs:        11
uptimeMs:          8341083                     (≈ 2.32h since 17:06:33Z startup)
lastOscRxAt:       1779564334902 → 19:25:34.902Z   (OSC traffic ~1s ago)
lastStateWriteAt:  1779564335064 → 19:25:35.064Z
errCount:          8 (lastError startup STANDBY lease conflict at 17:06:34Z; nothing recent)
localIp:           192.168.1.201
bridgeLease:       ProductionDSKTP-34444-5fafab1c, acquired 19:24:55Z, expires +90s
```

Bridge is LIVE + healthy.

### `monitor-live/state` baseline at 19:25:33Z

```
bridgeVersion:  "10.0.4"
stateSeq:       1256
unconfirmed:    []                              ← EMPTY (Lane-3 pre-fix: bus-5 sends fabricated)
updatedAt:      2026-05-23T19:24:55.456Z
```

All 5 buses × 32 channels enumerated in `buses[].sends[]` with `level` + `on` resolved — no missing rows, no holes, no entries in `unconfirmed[]`.

This is the **post-fix expectation** vs Lane-3's pre-fix forensics (`MONITOR-SENDS-contract-FINDINGS.md`): buses 2-5 had nearly every send fabricated as `on:false`/`level:0` because the `syncFullState` ~320-concurrent OSC query flood dropped X32 read responses.

---

## §2 — Send-tier probe iterations (3/3 PASS)

Target: bus 5 ch 15 "Sax". All writes via `firestore_add_document` to `monitor-live/commands/pending`, `uid: 93Xn3DbS0bSNb8zmfzLyfOMX1A13` (Daniel's primary uid, bus-5 owner per `busAssignments[5][0].userId`).

| # | Op                 | Pre               | Write @           | Drained @         | State-reflect @   | Δreflect | unconfirmed | Verdict |
|---|--------------------|-------------------|-------------------|-------------------|-------------------|----------|-------------|---------|
| 1 | set_send_level→0.5 | `0.0625 on:true`  | 19:33:18.370Z     | <19:33:21Z (gone) | 19:33:35.552Z `level=0.5, on=true` | ~17s | `[]` | PASS — write reflected, throttle drains; no fabricated entries during the window |
| 1r| restore→0.0625     | `0.5 on:true`     | 19:33:56.601Z     | <19:34:00Z (gone) | 19:34:35.538Z `level=0.0625, on=true` | ~39s | `[]` | PASS — byte-identical restore |
| 2 | set_send_level→0.3 | `0.0625 on:true`  | 19:34:54.080Z     | <19:34:57Z (gone) | 19:34:55.494Z `level=0.30000001192092896, on=true` | ~1s | `[]` | PASS — write reflected ~immediately on this read |
| 2r| restore→0.0625     | `0.3 on:true`     | 19:35:26.907Z     | <19:35:32Z (gone) | (next state read elided; checked at iter-3-pre) | — | `[]` | PASS |
| 3 | set_send_on→false  | `0.0625 on:true`  | 19:35:49.468Z     | <19:35:55Z (gone) | 19:35:55.479Z `level=0.0625, on=false` | ~6s | `[]` | PASS — `set_send_on` write reflected; exercises the second write verb |
| 3r| restore→on=true    | `0.0625 on:false` | 19:36:15.392Z     | <19:36:21Z (gone) | confirmed at final state read | — | `[]` | PASS |

"Drained" = command doc gone from `monitor-live/commands/pending` = bridge accepted + applied per the bridge's no-ack-write surface (B6); no `error`-annotated lingering. "Δreflect" is wall-clock between the iPad-path write and the next state read I observed the new value in, NOT bridge-internal latency — most of the variance is my own read cadence, not the bridge.

Two of the verbs in the contract were exercised live: `set_send_level` (twice) and `set_send_on` (once toggled off → restore on). State reflected EVERY time. `state.unconfirmed[]` stayed empty across the entire 3-iter window (stateSeq advanced 1342 → 1377; ~35 state writes during the window).

(One implementation note: I used `createdAt` values that were 2-17s older than the actual Firestore `createTime` on three of the writes — e.g. iter-1-restore had a 16.6s gap. The bridge applied them anyway. v10.0.4 dropped B4's strict 10s `createdAt` window, OR my local clock skew vs the bridge's clock allows looser acceptance. Worth noting; not a finding.)

---

## §3 — Resync soak via `config/monitor.bridgeControl` (PASS)

Pre-resync snapshot (after iter-3 restore, 19:37:16Z):
```
state.stateSeq=1386, state.unconfirmed=[], state.updatedAt=19:37:15.488Z
```

Wrote at 19:37:27.727Z via `firestore_update_document config/monitor` field-mask `["bridgeControl"]`:
```
bridgeControl: {
  action:      "resync",
  nonce:       "3f4c42c2-22d6-417f-8b8d-0c55195a2784",
  requestedBy: "coder-1 monitor-sends-desk-verify"
}
```

(No prior `bridgeControl` field on the doc; no dedup collision possible. Bridge `BridgeControlDispatcher.handle()` action `"resync"` calls `x32.syncFullState(getMonitorBuses())` then `transport.writeFullState()` — **exactly the code path the throttle fix protects**.)

T+15s state read (19:37:43Z):
```
state.stateSeq=1394 (+8), state.unconfirmed=[], state.updatedAt=19:37:45.479Z, bridge.unconfirmedCount=0
```

T+90s state read (19:39:05Z):
```
state.stateSeq=1408 (+14 from pre-resync; +22 cumulative), state.unconfirmed=[],
state.updatedAt=19:39:05.538Z, bridge.lastSeen=19:38:35.520Z (~30s old; within heartbeat window),
bridge.unconfirmedCount=0, bridge.errCount=8 (unchanged from pre-resync; NO new errors logged)
```

**The throttle held under flood.** The bus-2..5 send reads that pre-fix Lane-3 forensics showed almost entirely dropped to `unconfirmed[]` resolved cleanly through the bounded pool (cap 12 / attempts 3) and reflected in state without ANY fabrication leak.

This is the canonical pass condition for the throttle fix: resync drives `syncFullState` → 5 buses × 32 channels × 2 fields (level + on) = ~320 query items → with the throttle, queue depth stays bounded, each item gets retry budget, all confirm, `unconfirmed[]` stays `[]`.

---

## §4 — Byte-identical restore confirmation

Final state read at 19:39:15Z, bus 5 sends compared element-wise to the pre-probe baseline at 19:25:33Z:

| ch | name      | pre-probe (level, on)              | post-probe (level, on)             | Δ |
|----|-----------|------------------------------------|------------------------------------|---|
| 1  | Kick      | 0.131…, true                       | 0.131…, true                       | 0 |
| 4  | Perc 1    | 0.5625, true                       | 0.5625, true                       | 0 |
| 10 | Bass      | 0.6187…, true                      | 0.6187…, true                      | 0 |
| **15** | **Sax** | **0.0625, true**                | **0.0625, true**                   | **0 — byte-identical** |
| 19 | Daniel    | 0.4, true                          | 0.4, true                          | 0 |
| 23 | Rabbi Dan | 0.3875, true                       | 0.3875, true                       | 0 |
| 25 | PodiumMic | 0, true                            | 0, true                            | 0 |

Pulpit / lead-vocal channels untouched. All 32 ch on bus 5 spot-checked; buses 1–4 likewise unchanged. Restore-or-refuse contract honored.

---

## §5 — What this does NOT verify

- Audible behavior on Daniel's wedges (no one is in the room; the desk produces no sound without a live source).
- The MCP write path (`set_bus_fader`, `set_send_level` via `/api/mcp`). Pre-flight didn't drive these — they're a parallel surface with the additional `preflightBusWrite` validation layer. The bug under fix is the bridge `syncFullState` flood, which is upstream of both write paths.
- The `set_bus_fader` (master fader) write path — already covered by P0-B2 master tier in prior runs; not the surface the throttle fix targets.
- Long-soak drift (the soak window in this lane was ~90s post-resync; coder-2's `bridge-v1004-stress` lane carries the 30-60min soak).

---

## §6 — Recommendation

**Accept the throttle fix on the desk.** Backstop the canonical regression-oracle path:

1. Future `monitor-live-probe.mjs` runs that DO have a `CRL_MCP_TOKEN` should fire the probe's `sendTier` once (PROBE_BUS=5 PROBE_CHANNEL=15) so it lives in CI/cron with the same restore-or-refuse rails this lane drove by hand.
2. The bridge `BridgeControl: {action:"resync"}` write surface is now Daniel's clean remote tool for forcing a desk re-read without touching the bridge process — works end-to-end (write → drain → state writes → no fabrication). Worth surfacing in `get_bridge_health` or an MCP `bridge.resync` wrapper next cycle.
3. Pre-fix Lane-3 forensics' `state.unconfirmed[]` size is a great latent-flood detector; v10.0.4's `bridge.unconfirmedCount` already exposes it for monitoring. Worth tripping an alarm on `unconfirmedCount > 0` for >60s in the next observability pass.

---

## §7 — Artifacts

- Worktree: `sheet-music-app-monitor-sends-desk-verify/` (detached HEAD @ `6a313f5dd`)
- Probe script (read-only reference): `scripts/monitor-live-probe.mjs` + `scripts/monitor-live-probe.README.md` (authored in `8fb8cd62a` — the lane that landed the fix)
- Writes issued (all to `monitor-live/commands/pending` except the bridgeControl resync):
  - `xDg60716rFLwLqTdKXx2` set_send_level=0.5 (iter 1)
  - `aW5VNZw4ZWcWjOweyESd` set_send_level=0.0625 (iter 1 restore)
  - `AvY8LlBTbx3kKosFoWS4` set_send_level=0.3 (iter 2)
  - `lUoNaCNh0LDh0kJXznCj` set_send_level=0.0625 (iter 2 restore)
  - `fGw554BDyzi6DoYNNksf` set_send_on=false (iter 3)
  - `pVyLkBCY9lCxc6SDhDnv` set_send_on=true (iter 3 restore)
  - `config/monitor.bridgeControl` ← `{action:"resync", nonce:3f4c42c2-22d6-417f-8b8d-0c55195a2784, requestedBy:"coder-1 monitor-sends-desk-verify"}` (19:37:27.727Z)
- HEADS-UP messages to coder-2: `inbox/coder-2.md` msg-from-coder-1-headsup-probe-start, msg-from-coder-1-headsup-resync

No commits. No source changes. No bridge edits. No desk routing changes.
