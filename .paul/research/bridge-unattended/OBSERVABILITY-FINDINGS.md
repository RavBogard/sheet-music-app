# Bridge Unattended-Remote — OBSERVABILITY & Remote-Diagnostics FINDINGS

- **Lane:** bridge-observability-audit (coder-3), Tier-0 **READ-ONLY**
- **Source SHA:** origin/master `ba7663584` (bridge v10.0.3 source). Read via the clean
  `sheet-music-app-auditor-validation` worktree (detached @ ba7663584) + `git ls-tree`.
  The canonical cwd `bridge/` is STALE (v3.1.0) and was NOT used for evidence.
- **Live reads:** `config/monitor`, `monitor-live/state` (Firebase MCP, project `crcmusiccharts`,
  read 2026-05-23 ~14:00Z). READ-ONLY. No writes, no commits, no OSC.
- **Sibling:** coder-2 owns RESILIENCE/recovery. Shared seam handled in §Coordination.
- **Context:** Daniel installs an updated bridge ONCE, then the studio PC + X32 are **ON but
  physically inaccessible for ~2 days** (remote-only). This audit answers: over those 2 days, can we
  SEE and DIAGNOSE the bridge + desk remotely, and what low-risk observability is worth adding to a
  one-shot **v10.0.4** before the install.

---

## TL;DR / verdict

**Today you can confirm the bridge is HEALTHY, but you largely cannot diagnose WHY it is sick — and
the two "alive" booleans actively lie once it dies.**

What works remotely today:
- **`get_command_status`** closes the loop on a single command (applied/rejected/timeout +
  confirmedValue). This is the one solid remote confirm lever. (Its in-code "~5/29" comment is stale —
  the ack-writer ships in v10.0.3, so it is LIVE during the window.)
- The MCP read tools (`list_monitor_buses`/`get_mix`/`get_matrix`) expose a derived
  `bridge.stateAgeSeconds` + `bridge.stateStale` off `monitor-live/state.updatedAt`, so a *smart*
  caller can detect a frozen desk.
- `monitor-live/state.unconfirmed[]` names exactly which OSC reads failed the last sync — a real
  desk-marginality signal.

The gaps that bite over 2 blind days (priority order):
1. **NO remote log/error sink at all.** Every error is `console.*` → redirected only to the LOCAL
   Electron UI on the inaccessible PC. If the bridge throws at hour 30, there is **zero** remote
   trace of what happened.
2. **Heartbeat booleans have no TTL and go stale silently.** Live read RIGHT NOW:
   `bridge.status:"online"`, `bridge.x32Connected:true` — while `bridge.lastSeen` is **13.5h old**
   and `bridgeLease` expired 13.5h ago. A naive reader of the published fields is told the bridge is
   online and the desk connected when the bridge has been **down for half a day**.
3. **The "alive vs zombie" diagnosis is collapsed into one boolean.** `x32Connected` already folds
   `socketAlive AND stateFresh` (good intent) — but because it is one bit, you cannot tell
   socket-dead from state-write-wedged from the heartbeat, and nothing publishes the raw inputs.
4. **No dedicated remote health probe.** Bridge health is only reachable as a side-block of the
   bus-read tools (which require monitor access) — there is no `get_bridge_health` one-call tool.
5. **No uptime / restart / queue-depth / error-count / last-OSC-write surface** — a restart
   mid-window (e.g. an auto-update install) is only *inferable* from a stateSeq reset.

The recommended v10.0.4 obs layer (§Prioritized) is **all additive, fail-open, off the hot path** —
the right risk posture for the one component we cannot physically touch for 2 days.

---

## Live ground-truth snapshot (the failure mode, frozen in amber)

Read 2026-05-23 ~14:00Z. The studio PC/board is currently OFF (board-on pending), so this is the
*exact* picture a remote observer gets when the bridge stops while the Firestore docs persist:

`config/monitor.bridge`:
```
status:        "online"        ← LIES (still online)
x32Connected:  true            ← LIES (still connected)
lastSeen:      2026-05-23T00:27:33Z   → ~13.5h stale
version:       "10.0.2"        ← v10.0.3 not yet installed (consistent w/ pending board-on)
clients:       0
localIp:       192.168.1.201
```
`config/monitor.bridgeLease`:
```
ownerId:   ProductionDSKTP-21588-bd70d922
expiresAt: 2026-05-23T00:29:23Z   → EXPIRED ~13.5h ago
```
`monitor-live/state`:
```
updatedAt:     2026-05-23T00:28:03Z   → ~13.5h stale
stateSeq:      1232 (frozen)
bridgeVersion: "10.0.2"
unconfirmed:   ~250 entries (whole send banks of buses 2/3/4/5) — the v10.0.2 pre-throttle
               flood artifact, frozen at the last write
```
**Takeaway:** `status`/`x32Connected` are last-write-wins fields with no server-side expiry. Liveness
is ONLY knowable by computing `now − lastSeen` (or `now − state.updatedAt`, or `lease.expiresAt < now`).
The MCP read path does this for `state.updatedAt`; nothing does it for the heartbeat's own booleans.
Over a 2-day blind window this is the #1 way to be fooled into thinking a dead bridge is fine.

---

## Q1 — Heartbeat: what does the bridge write to `config/monitor.bridge`, and how often?

**Writer:** `ConfigManager.writeHeartbeat` — `bridge/src/config.ts:151-174`.
**Driver:** `heartbeatLoop` — `bridge/src/index.ts:183-244`; fired once immediately
(`index.ts:247`) then every **60s** (`setInterval(heartbeatLoop, 60_000)`, `index.ts:249`).
**Gate:** only the **active lease-holder** writes the heartbeat (`if (leaseHeld)`, `index.ts:233`) —
a standby bridge publishes nothing.

Fields written (all under the `bridge.` map, `config.ts:157-164`):

| field | value | source |
|---|---|---|
| `bridge.lastSeen` | server timestamp | `config.ts:158` |
| `bridge.status` | `"online"` (or `"offline"` on graceful shutdown only) | `config.ts:159`, `writeOffline` `config.ts:177-189` |
| `bridge.x32Connected` | **derived health** = `socketAlive && stateFresh` (NOT raw socket) | computed `index.ts:218-220`, passed `index.ts:235-239` |
| `bridge.clients` | distinct uids that sent a command in the last 60s (B13) | `transport.getActiveClientCount()` `transport.ts:496-504` |
| `bridge.localIp` | detected LAN IP | `index.ts:160`, `getLocalIp` `index.ts:50-69` |
| `bridge.version` | `process.env.BRIDGE_VERSION` ← `app.getVersion()` | `config.ts:163`, set in `main.ts:341-347` |

Cadence/robustness: the write has a **5s timeout** and **swallows all errors** (`config.ts:166-172`)
— so a failed heartbeat is invisible remotely (only `console.warn`). `writeOffline` (status:"offline")
fires ONLY on a clean SIGINT/SIGTERM shutdown (`index.ts:290-302`); a crash / power-loss / kill never
flips status to offline — it just freezes at "online" (exactly the live snapshot above).

**Note (good):** `bridge.x32Connected` is already the cross-checked health (`index.ts:212-220`,
`STATE_LIVENESS_THRESHOLD_MS = 30_000`, `index.ts:34`), an intentional fix for the
[[project_bridge_state_freshness_diagnostic]] trap — it flips false if state writes wedge >30s even
with a live socket. The limitation is that it's a single collapsed bit (see Q2) and that `status` +
`lastSeen` keep advancing regardless.

---

## Q2 — State freshness: can a remote observer tell "writes are LANDING" vs "alive but frozen"?

**Partially today; not cleanly.**

State writer: `FirestoreTransport.writeFullState` — `bridge/src/firestore-transport.ts:158-178`
(`.set monitor-live/state`). Fields: `schemaVersion`, `channels`, `buses`, `matrices`, `unconfirmed`
(B11), `bridgeVersion`, `stateSeq` (monotonic `++`), `updatedAt` (server ts). `lastSuccessfulStateWriteAt`
is bumped **only on success** (`transport.ts:174`); `getStateAgeMs()` exposes the age (`transport.ts:203-207`).

Two heartbeats keep `updatedAt` moving:
- **10s cheap re-`.set()` of the cached snapshot** (`STATE_HEARTBEAT_MS`, `transport.ts:66,129-132`)
  → `updatedAt` advances even on a fully idle desk.
- **30s authoritative `syncFullState` re-query** (`FULL_REQUERY_MS`, `transport.ts:67,136-144`).

The signals a remote observer can use **today**:
1. `monitor-live/state.updatedAt` fresh (<~15s) ⇒ **bridge process + Firestore-write path alive.**
   ⚠️ **Caveat:** the 10s heartbeat re-publishes the *cached* snapshot, so `updatedAt` keeps
   advancing **even if the X32 is dead/unreachable** — as long as the process + Firestore write work.
   So `updatedAt` proves "bridge is writing", NOT "the desk is responding".
2. `config/monitor.bridge.x32Connected` (derived `socketAlive && stateFresh`) ⇒ desk reachable AND
   state fresh. But it's ONE bit → on `false` you can't tell socket-dead from state-wedged.
3. `monitor-live/state.unconfirmed[]` — names exactly which OSC value reads failed in the last
   `syncFullState` (`x32-client.ts:671-770`, `getUnconfirmed()` `x32-client.ts:543-546`). A growing /
   large set ⇒ the desk is dropping reads (flooded/marginal). This is the **best desk-health signal**
   that exists today (the live read shows ~250 — the pre-throttle v10.0.2 artifact).

**What is NOT exposed:** an explicit `lastSuccessfulStateWriteAt` / `lastOscRxAt` timestamp, or a raw
`socketAlive` separate from the folded `x32Connected`. So you can detect "frozen" (via updatedAt age)
but you cannot remotely diagnose *which* path froze without physical access. `getStateAgeMs()` exists
in-process but is never published as a number.

MCP-side: `buildBridgeHealth` (`src/lib/mcp/tools/monitor.ts:111-125`) + `computeStateAgeSeconds` /
`isStateStale` (`src/lib/mcp/server-monitor.ts:139-151`, 90s threshold) DO surface `stateAgeSeconds`
+ `stateStale` to MCP callers — the smart-consumer mitigation. Good, but reader-side only and gated.

---

## Q3 — Remote logs/errors: accessible remotely at all? Firestore log sink?

**No. This is the headline blind spot.**

Every diagnostic in the bridge is `console.log` / `console.warn` / `console.error`. In the packaged
Electron app these are intercepted and re-emitted **only to the local renderer UI**
(`main.ts:355-366`: `console.* = (...) => { original(...); mainWindow?.webContents.send('log', …) }`).
There is **no Firestore log sink, no remote ring buffer, no error counter** published anywhere.

Exhaustive inventory of every Firestore path the bridge writes (grep of `bridge/src/**`, tests excluded):
- `config/monitor` — load/default/watch/x32Address/bridgeUrl/heartbeat/offline/lease
  (`config.ts:44,50,61,132,142,167,180,194,229,258`)
- `monitor-live/state` — `.set` (`firestore-transport.ts:164`)
- `monitor-live/commands/pending` — listen + stale-cleanup delete (`firestore-transport.ts:213,612`)
- `monitor-live/commands/acks/{commandId}` — ack `.set` + TTL sweep (`ack-writer.ts:85,101`)
- `users/{uid}` — **read only** (auth role check, `firestore-transport.ts:550`)

That's the whole surface. **Nothing carries an error/event history.** Concretely, every one of these
failure logs is invisible remotely: `[Transport] Failed to write state` (`transport.ts:176`),
`[Heartbeat] Write failed` (`config.ts:172`), `[Lease] Acquire/renew failed` (`config.ts:251`),
`[X32] Socket error` (`x32-client.ts:203`), command-listener error (`transport.ts:233`),
`[Transport] Full re-query failed` (`transport.ts:141`), `[Transport] Batch commit error`
(`transport.ts:282,288`). If any of these fire at hour 30, **you will never know.**

---

## Q4 — Command/ack surface: what confirms a remote command executed? Gaps?

**The best-instrumented path. One real gap (lifecycle visibility) + one standby caveat.**

Lifecycle:
- **Enqueue:** `monitor-live/commands/pending/{auto}` — written by the iPad OR by MCP
  (`enqueueCommand`, `src/lib/mcp/server-monitor.ts:295-310`). Returns a `commandId`.
- **Drain:** bridge listens (`transport.ts:212-240`), authorizes (`transport.ts:509-530`), executes
  via OSC, then **deletes** the pending doc on success or stamps an `error` field
  (`transport.ts:309-413`). Pending docs are also TTL-swept after 30s (`transport.ts:608-622`).
- **Confirm (C2):** after every SET the X32Client issues a debounced read-back
  (`scheduleConfirm`, `x32-client.ts:531-541`); its reply resolves the pending ack with the desk's
  confirmed value (`registerPendingAck`/`resolvePendingAck`, `transport.ts:455-484`).
- **Ack:** `monitor-live/commands/acks/{commandId}` — `applied` (with `confirmedValue`) / `rejected`
  (reason) / `timeout` (`ack-writer.ts`, shape `ack-writer.ts:40-47`), **TTL-swept after 5min**
  (`ACK_TTL_MS`, `ack-writer.ts:56`).
- **Read:** **`get_command_status(commandId)`** (`src/lib/mcp/tools/monitor-observability.ts:82-115`,
  registered `tools/index.ts:2112`) → `{status, confirmedValue, reason, at, found}`; monitor-access
  gated; never throws (absent ack ⇒ clean `{status:"pending", found:false}` via `coerceCommandAck`,
  `server-monitor.ts:401-424`).

✅ So a remote operator who keeps the returned `commandId` CAN confirm whether a fader move landed,
was refused, or timed out — within the 5-minute ack TTL. **This is the one reliable remote confirm
lever for the window.** (⚠️ The tool's docstring `monitor-observability.ts:77-81` says acks "go live
only after the next gated bridge release (~5/29)" — that is **stale**; the ack-writer is wired in
v10.0.3 (`transport.ts:332,341,360,375,404,410,459,465,483`). Worth a 1-line comment fix.)

Gaps:
- **No aggregate / rollup.** Acks are per-commandId and 5-min-TTL'd; there is no "last N command
  outcomes" or success-rate surface. Over 2 days you can probe individual commands but cannot review
  history. You must hold the commandId; you can't enumerate (acks are not listable by the read tools).
- **Standby caveat (overlaps coder-2):** only the **active lease-holder** drains commands
  (`transport.ts:259-262`). If the bridge is in STANDBY (lost lease) or down, `pending` docs pile up
  undrained and **no ack is ever written** → from the caller's side a command just sits at
  `{status:"pending", found:false}` indefinitely. There is no signal that distinguishes "bridge busy"
  from "bridge gone" other than cross-reading the (stale) heartbeat. A growing `pending` count is
  itself a useful undrained-queue signal but is not surfaced anywhere.

---

## Q5 — Blind spots: what would we be UNABLE to see over 2 unattended days?

1. **Any error/exception** (Q3) — console-only, local-only. Total remote blindness to crashes,
   Firestore write failures, OSC socket errors, lease-loss, re-query failures.
2. **Bridge process death / crash / power-loss** — `status` stays `"online"`, `x32Connected` stays
   `true` forever (no TTL; `writeOffline` only on graceful shutdown). Detectable ONLY by reader-side
   `now − lastSeen` math, which nothing in the heartbeat itself signals. **(Live-confirmed: 13.5h
   stale + still "online".)**
2b. **A restart mid-window** (e.g. the auto-update idle-install at `main.ts:251-275` after the X32 is
   idle ≥30min — plausible over 2 days) — only *inferable* from a `stateSeq` reset to 1 and a
   `version` change; no explicit `startedAt`/`restartCount`/uptime is published. (Pin/disable is
   coder-2's resilience call; the observability point is that a restart is currently silent.)
3. **Socket-dead vs state-write-wedged** — collapsed into one `x32Connected` bit; the raw
   `socketAlive` and `getStateAgeMs()` are computed but never published.
4. **Last successful OSC read/write time** — not exposed (only the implicit `state.updatedAt`, which
   advances on cached re-sets even with a dead desk).
5. **Pending-command queue depth** (`transport.pendingCommandQueue.length`) and **error count** —
   not exposed; an undrained queue or an error storm is invisible.
6. **`unconfirmed` is in `state` but has no at-a-glance count in the heartbeat** — you must read the
   (large) state doc and measure the array to gauge desk marginality.
7. **No way to actively poke the bridge** for a fresh diagnostic — no `bridge.selftest` (and no
   restart/reconnect/resync; the latter is coder-2's turf).
8. **No dedicated health tool** — health is a side-block of `list_monitor_buses`/`get_mix`/`get_matrix`,
   which require monitor access (Daniel=admin is fine, but it's buried and tied to a bus read).

---

## Prioritized low-risk v10.0.4 observability layer

Risk lens for the unattended box: **every item is additive, fail-open, rate-limited, and off the hot
command path.** No existing field changes semantics (consumers depend on `status` / `x32Connected` /
`stateAgeSeconds`). New heartbeat keys are additive map fields → zero consumer break.

### P0 — biggest unblind, lowest risk

- **P0-1 — Remote error/event ring buffer → Firestore.** THE single biggest fix for Q3/Q5.
  Capture `console.error`/`console.warn` at the seam that **already intercepts them**
  (`main.ts:355-366`) — or a small logger in `index.ts` — and push `{level, msg, ts}` into a
  **bounded** ring (~50 entries). Suggested target: a single doc `monitor-live/bridgeLog` with a
  capped array field (trim to last N), OR a `monitor-live/diag/log` subcollection with the same
  TTL-sweep pattern as `ack-writer.sweep()`. **Must be rate-limited** (write on error/warn only,
  debounce/batch every few seconds — never per log line) and fully fail-open (`try/catch`, swallow)
  so the logger can never destabilize the box or blow Firestore quota. Reuses the existing admin SDK;
  one new write target.
- **P0-2 — Richer heartbeat (additive keys on `config.writeHeartbeat`, `config.ts:151-174`).** Split
  the collapsed boolean and publish the raw inputs so alive-vs-zombie is diagnosable at a glance:
  - `bridge.socketAlive` — raw `x32.isConnected()` (separate from the folded `x32Connected`)
  - `bridge.stateAgeMs` — `transport.getStateAgeMs()`
  - `bridge.unconfirmedCount` — `x32.getUnconfirmed().length`
  - `bridge.lastStateWriteAt` / `bridge.lastOscRxAt` — epoch ms (need a getter for `x32.lastMessageAt`)
  - `bridge.startedAt` (boot server-ts) + `bridge.uptimeMs`
  - `bridge.queueDepth` — `transport.pendingCommandQueue.length` (new getter)
  - `bridge.errCount` + `bridge.lastError` `{msg, ts}` — running counter + most-recent error string
  These are pure reads of state the bridge already holds; emit them in the existing 60s loop.
- **P0-3 — A dedicated `get_bridge_health` MCP tool** (app-side, NOT a bridge change — can ship
  independent of the install). One call that reads `config/monitor.bridge` + `monitor-live/state.updatedAt`
  + `bridgeLease.expiresAt` and returns a **derived verdict**: `{alive, lastSeenAgeS, stateAgeS,
  leaseExpired, socketAlive, unconfirmedCount, version, queueDepth?}` — doing the `now − lastSeen`
  math so the caller is never fooled by the stale booleans. Reuse `computeStateAgeSeconds`/`isStateStale`
  (`server-monitor.ts:139-151`). Consider admin-only access without requiring a bus assignment so it's
  a clean one-call probe over the window. (If a full new tool is too much for v10.0.4, at minimum have
  the supervisor brief Daniel that liveness = `lastSeen` age, NOT `status`.)

### P1 — high value, slightly more surface

- **P1-1 — `bridge.selftest` command** via the existing command loop. Add a non-OSC command type to
  the `processCommand` switch (`transport.ts:383-399`) + `confirmKeyFor` (`transport.ts:421-446`) — or
  a separate `monitor-live/commands/control` doc — that runs a diagnostic snapshot (socketAlive,
  lastOscRxAt, last `syncFullState` confirmed/unconfirmed counts, queueDepth, uptime, mem) and writes
  it to `monitor-live/diag/selftest`. Lets Daniel/Claude actively poke for a fresh diagnostic instead
  of waiting on the 60s heartbeat. **Coordinate with coder-2** (their restart/reconnect/resync land on
  the same switch — do it as one shared command-type family). Does not touch the desk → low risk.
- **P1-2 — Pending-queue-depth alarm field.** Already covered by `bridge.queueDepth` (P0-2); call out
  that an undrained queue is the clean "active bridge gone / wedged" signal that the standby caveat
  (Q4) currently hides.

### P2 — nice-to-have

- **P2-1 — Surface state-write failure reason.** `writeFullState` swallows the error and only stops
  bumping `lastSuccessfulStateWriteAt` (`transport.ts:174-177`); the *reason* is console-only. Fold it
  into `bridge.lastError` (P0-2) so a wedged state-write path reports WHY, not just that it's stale.
- **P2-2 — Doc fix:** correct the stale "acks go live ~5/29" comment in
  `monitor-observability.ts:77-81` — acks are live in v10.0.3.

---

## Coordination with coder-2 (resilience)

**Shared seam = two files, two hook points:**
1. The **heartbeat writer** `bridge/src/config.ts:writeHeartbeat` (`config.ts:151-174`) — I own the
   additive field-list (P0-2). coder-2 may want to append recovery-related fields (e.g.
   `lastRestartReason`, watchdog state). One field schema, additively merged.
2. The **command loop** `bridge/src/firestore-transport.ts` `processCommand`/`confirmKeyFor`
   (`transport.ts:383-446`) — my `bridge.selftest` (P1-1, read/diagnostic, no OSC) and coder-2's
   `bridge.restart`/`reconnect`/`resync` (recovery, side-effecting) are the SAME switch addition.

**Recommendation to supervisor / coder-1:** treat these as **one shared "bridge control & diagnostics"
command-type family** + **one additive heartbeat field-set** so the v10.0.4 build lands obs + recovery
without two lanes colliding on `config.ts` / `transport.ts`. I (obs) and coder-2 (resilience) should
agree the command-type names + field names before coder-1 codes. My ring buffer (P0-1) and health tool
(P0-3) are obs-only and don't touch coder-2's surface.

---

## Appendix — key constants & references

- Heartbeat cadence 60s: `index.ts:249` · first-immediate `index.ts:247` · active-only `index.ts:233`
- State liveness threshold 30s: `index.ts:34` (`STATE_LIVENESS_THRESHOLD_MS`)
- State heartbeat 10s / full re-query 30s: `transport.ts:66-67`
- Heartbeat write timeout 5s, errors swallowed: `config.ts:166-172`
- Lease TTL 90s / renew 20s: `index.ts:43-44`; tx `config.ts:228-254`
- Ack TTL 5min: `ack-writer.ts:56` · ack path `monitor-live/commands/acks/{commandId}` `ack-writer.ts:53,85`
- MCP state-stale threshold 90s: `server-monitor.ts:90`
- Electron console→UI redirect (local only): `main.ts:355-366`
- Auto-update idle-install (≥30min X32 idle → restart): `main.ts:229,251-275`
- Bridge Firestore write-set: `config/monitor`, `monitor-live/state`, `monitor-live/commands/{pending,acks}` (+`users` read) — **no log sink**
