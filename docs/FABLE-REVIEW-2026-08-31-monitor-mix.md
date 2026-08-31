# Monitor-Mix Path Audit — sheet-music-app (centralreform.live)

**Date:** 2026-08-31
**Scope:** musician iPad UI -> app/API -> cloud<->bridge transport -> X32 mixer, plus reliability, observability and ranked risk/fix list.
**Snapshot:** /tmp/crc/sheet-music-app (read-only)
**Bridge version in tree:** bridge/package.json = **10.0.7** (docs still describe 2.0.x/2.1.0 — see R10)

---

## 0. Executive summary

The monitor path is the most carefully hardened subsystem in this codebase. It is Firestore-only (no WebSocket, no LAN path), with an impressive amount of correctness work already done: server-relative command ordering, idempotency, supersede detection, query-after-command read-back confirmation, a per-command ack surface, a single-writer lease, two-tier state heartbeats, honest staleness math, a per-fader confirmation state machine, and remote recovery verbs. Roughly 20 lettered defect classes (B*, C*, R*, O*, F*) have visibly been fixed in place.

What is left is not sloppiness — it is a set of **seams between well-built parts**:

1. The bridge produces excellent diagnostics that **never reach a musician's screen** (per-command acks are locked out by Firestore rules; `unconfirmed` is dropped by the client coercion). Every distinct failure mode collapses into one indistinguishable symptom: the knob spins for 2s, then eases back with no explanation.
2. A **bridge crash costs up to 90 seconds of dead control while every iPad still reads green**, because the 90s single-writer lease outlives the crashed process and `lastSeen` stays fresh for 120s.
3. **Nothing proactively tells Daniel** the bridge is down. Detection is entirely pull-based, and there are 11 cron jobs plus push infrastructure sitting unused for this purpose.
4. One structural gamble is unvalidated: a **single ~10KB hot state document written up to 10x/s and fanned out to every iPad**, against Firestore's ~1 write/s sustained guidance for a single document. The ADR acknowledged this and set a P95 trigger for switching architectures — but **latency has never been measured** and cannot be, because the only measurement tool is a manual browser-console utility whose own instructions point at a filename that does not exist.

---

## 1. End-to-end architecture map

### 1.1 Text diagram

```
+------------------------ iPad (Safari / PWA) -------------------------+
|                                                                      |
|  /monitor  (src/app/(main)/monitor/MonitorClient.tsx)                 |
|      +- MonitorTabs -> FaderStrip (horizontal)                       |
|  Perform toolbar popover                                             |
|      +- QuickMonitorPanel -> VerticalFaderStrip                      |
|                                                                      |
|  useMonitorAccess ---- config/monitor.busAssignments  (onSnapshot)    |
|      access = isAdmin || soundEngineer || hasBusAssigned              |
|                                                                      |
|  useMonitorConnection  (module singleton, ref-counted, 5s teardown    |
|      debounce, 3s auth-null debounce, visibilitychange revive)        |
|      +- onSnapshot(config/monitor)      -> store.setConfig            |
|      +- FirestoreMonitorClient                                        |
|           +- onSnapshot(monitor-live/state)  <- DOWNLINK              |
|           |     coerceMixerSnapshot -> 150ms debounce (1st immediate) |
|           |     -> store.setSnapshot (bumps snapshotCount = auth seq, |
|           |        records stateUpdatedAt from bridge serverTimestamp)|
|           +- addDoc(monitor-live/commands/pending)  -> UPLINK         |
|                 50ms per-key throttle (leading + trailing)            |
|                                                                      |
|  monitor-store (Zustand): channels, buses, matrices, config,          |
|      myBusIndex, snapshotCount, stateUpdatedAt, starred/default chans |
|  fader-confirmation.ts: per-fader reducer                             |
|      idle -> dragging (snapshots suppressed) -> pending -> confirmed| |
|      reverted, keyed off snapshotSeq so the optimistic echo can't     |
|      false-confirm; 2000ms confirm timeout, 0.02 tolerance            |
+-------------------------------+--------------------------------------+
                                |  HTTPS/HTTP2 (Firebase JS SDK)
                                v
+-------------------------- Firestore (cloud) -------------------------+
|  config/monitor            busAssignments, x32Address, monitorBuses,  |
|                            bridge.* (60s heartbeat + diagnostics),    |
|                            bridgeLease {ownerId, expiresAt}, and      |
|                            bridgeControl {action, nonce, requestedAt} |
|  monitor-live/state        FULL snapshot ~10KB, .set() <=10/s         |
|                            {schemaVersion, channels[32], buses[],     |
|                             matrices[6], unconfirmed[], stateSeq,     |
|                             bridgeVersion, updatedAt: serverTS}       |
|  monitor-live/commands/pending/{id}   iPad + MCP writes, bridge dels   |
|  monitor-live/commands/acks/{id}      bridge writes; DENY-ALL to       |
|                                       clients (no rules match) <- R2  |
|  monitor-live/selftest     forensic snapshot, on demand + every 10min  |
|  bridgeLog (RemoteLogger ring)  console.error/warn mirror, rate-ltd    |
+-------------------------------+--------------------------------------+
                                |  firebase-admin (service-account key
                                |  in Electron userData, self-migrating)
                                v
+------------- Bridge: Electron tray app, venue production PC ---------+
|  bridge/src/main.ts     tray, auto-update policy, crash guards,       |
|                         openAtLogin, restart handler                  |
|  bridge/src/index.ts    lease election, 60s heartbeat loop, DHCP      |
|                         guard, >90s sleep/wake detect, 10min          |
|                         selftest cadence, bridgeControl dispatch      |
|  bridge/src/firestore-transport.ts                                    |
|     onSnapshot(commands/pending, orderBy createdAt) docChanges added   |
|       -> queueCommand -> 20ms COMMAND_BATCH_WINDOW                    |
|       -> sort by SERVER createTime -> per command:                     |
|            idempotency (60s TTL) -> isCommandAuthorized                |
|            -> stale >10s drop -> superseded drop -> shape validate     |
|            -> X32Client.setX() -> registerPendingAck (1.5s)            |
|            -> batch delete pending doc                                 |
|     X32 change events -> resolvePendingAck + scheduleStateWrite        |
|     10s state heartbeat (re-.set cache), 30s full re-query             |
|  bridge/src/x32-client.ts                                             |
|     /xremote every 8s (subscribe to EXTERNAL changes)                  |
|     /xinfo keepalive every 8s; health check every 5s;                  |
|     20s silence -> disconnected -> reconnect 2s->60s backoff, inf tries|
|     C2 query-after-command: 75ms-debounced GET after every SET         |
|     syncFullState: <=12 concurrent queries, 3 attempts, unconfirmed set|
+-------------------------------+--------------------------------------+
                                |  OSC over UDP :10023, same LAN
                                |  (X32Client.discover() UDP broadcast)
                                v
                    +----------- Behringer X32 / Midas -----------+
                    |  /bus/NN/mix/fader   /bus/NN/mix/on         |
                    |  /ch/NN/mix/NN/level /ch/NN/mix/NN/on       |
                    |  /mtx/NN/mix/fader   /mtx/NN/mix/on         |
                    +---------------------------------------------+

SECOND CONTROL PLANE (Daniel via Claude Desktop / MCP):
  set_send_level, set_bus_fader, set_matrix_fader, set_send_mute ...
     -> src/lib/mcp/tools/monitor.ts -> server-monitor.enqueueCommand
     -> SAME monitor-live/commands/pending path (Admin SDK)
  get_mix, get_matrix, list_monitor_buses  -> read monitor-live/state
  get_command_status  -> reads monitor-live/commands/acks (only reader)
  get_bridge_health   -> derives liveness from config/monitor.bridge.lastSeen
  bridge_resync / _reconnect / _restart / _selftest
     -> config/monitor.bridgeControl -> bridge config listener -> dispatcher
  bridge_clear_acks / _clear_pending_commands  (housekeeping)
  assign_monitor_bus / unassign_monitor_bus -> config/monitor.busAssignments
```

### 1.2 Latency characteristics (derived from code; never measured in production)

| Hop | Budget | Source |
|---|---|---|
| Knob -> optimistic store write | 0ms (instant) | `updateSendLevel` before the command |
| FaderStrip throttle | 0-100ms + 1 rAF | `FaderStrip.tsx:74-90` |
| Client per-key throttle | 0-50ms | `COMMAND_THROTTLE_MS = 50` |
| `addDoc` local ack | 5-20ms | Firestore latency compensation |
| Firestore -> bridge | 30-150ms | ADR estimate, unmeasured |
| Bridge batch window | 0-20ms | `COMMAND_BATCH_WINDOW = 20` |
| Authz | ~0ms cached / 50-200ms cold / **up to 3000ms** worst | `ENGINEER_CACHE_TTL_MS = 30_000`, `ENGINEER_READ_TIMEOUT_MS = 3_000` |
| OSC UDP -> desk | <1ms | same LAN |
| Read-back confirm debounce | 75ms + desk reply | `CONFIRM_DEBOUNCE_MS = 75` |
| State write throttle | 0-100ms | `STATE_WRITE_INTERVAL = 100` |
| Firestore -> iPad | 30-150ms | ADR estimate, unmeasured |
| Client snapshot debounce | 0-150ms | `SNAPSHOT_DEBOUNCE_MS = 150` |

- **Audible latency (fader -> sound in the wedge):** ~80-350ms typical. The command reaches the desk before any state round-trip; this is the number musicians actually feel.
- **Visual confirmation latency (spinner -> check):** ~250-650ms typical, ~1s+ under load. Budget before revert: 2000ms client / 1500ms bridge ack.
- **Every hop above the OSC line is estimate, not measurement.** `src/lib/__tests__/bridge-latency.util.ts` is a manual browser-console utility, and its own usage instructions import from `@/lib/__tests__/bridge-latency.test` — **a path that does not exist** (the file was renamed to `.util.ts`). No telemetry records monitor latency anywhere, so the ADR's own architecture-switch trigger ("> 300ms P95 consistently -> implement hybrid WebSocket") is currently unevaluable.

### 1.3 Command acking

Genuinely good, and genuinely invisible to musicians:

- Bridge writes `monitor-live/commands/acks/{commandId}` with `applied` (carrying the desk-confirmed value from the C2 read-back), `rejected` (`unauthorized` / `superseded` / `bridge-standby` / `unknown or malformed` / X32 error), or `timeout` (expired >10s, or applied but no read-back within 1500ms). TTL-swept by `AckWriter.sweep()`.
- **The iPad never reads it.** `firestore.rules` has no `match` for `monitor-live/commands/acks`, so the deny-all fallback applies; `FirestoreMonitorClient` never subscribes; `fader-confirmation.ts` confirms purely by comparing an authoritative snapshot value against the optimistic value within tolerance. The only consumer is the MCP `get_command_status` tool via the Admin SDK.

### 1.4 Echo of external changes — yes, and well done

A fader moved at the console **is** reflected on the iPads. `/xremote` is renewed every 8s, which subscribes the bridge to the desk's parameter-change broadcasts from any source (console surface, Mixing Station, another app). Each echo -> `routeParameterChange` -> typed event -> `scheduleStateWrite` -> full-state `.set()` -> all iPads within ~130-400ms. Two safety nets behind that: the 10s state heartbeat re-publishes the cached snapshot so `updatedAt` advances on a fully idle desk (so "idle" is never mistaken for "frozen"), and a 30s authoritative `syncFullState` re-query catches any echo that was dropped.

One correctness subtlety handled correctly: the X32 does **not** echo the sender's own writes back to the sender, which is why `scheduleConfirm` issues a debounced GET after every SET (`C2`). Without it, the bridge would never learn the applied value and the iPad's confirmation machine would revert every move.

---

## 2. Reliability under live-service conditions

### 2.1 Bridge process crash / restart — **the weakest link**

| Layer | Behaviour |
|---|---|
| `uncaughtException` / `unhandledRejection` | Logged, **process kept alive deliberately** (`main.ts:31-39`). Policy: degraded beats dead. |
| X32 EventEmitter `error` | Listener attached in `index.ts` so a UDP `ECONNRESET` from a powered-off desk can no longer throw fatally (B1). |
| True hard crash (Electron main death, OOM, GPU process kill) | **No watchdog anywhere.** `openAtLogin: true` only helps on reboot. The ADR explicitly recommended a Task Scheduler watchdog for Phase 2; `grep -ri watchdog` across the tree finds only PDFViewer and the ADR itself. Recovery is manual. |
| Remote restart | `bridge_restart` (admin-only) -> `bridgeControl` -> `app.relaunch(); app.exit(0)`, with `clearBridgeControl()` before the relaunch plus a `processStartedAt`/`requestedAt` guard to prevent a boot loop. Well built — but requires a human who already knows something is wrong. |
| **Restart -> lease deadlock** | On relaunch the process mints a **new** `bridgeInstanceId` (`hostname-pid-uuid`). `acquireOrRenewLease` refuses because the dead instance's lease is still unexpired for up to `LEASE_TTL_MS = 90_000`. The new bridge enters **STANDBY**: it drains no commands, writes no state, and writes **no heartbeat**. Meanwhile `bridge.lastSeen` is <120s old, so `isBridgeOnline()` returns true and every iPad shows **green "Connected / Live"**. Musicians' moves get `rejected: bridge-standby` acks they cannot read, and revert silently after 2s. |

### 2.2 Venue network blips

- **iPad WiFi drop:** Firebase JS SDK auto-reconnects; `FirestoreMonitorClient` tolerates 2 consecutive listener errors with a 2s retry before surfacing `error` (`MAX_CONSECUTIVE_ERRORS = 3`), and `recoverFromFirestoreShutdown` suppresses shutdown-race noise. On reconnect the state doc carries a full snapshot, so values self-correct. Solid.
- **Bridge PC network drop:** command listener re-subscribes after 5s on error; the config listener does the same (R5) — important, because the config listener carries the `bridgeControl` recovery channel, so losing it silently would disable remote recovery for the rest of the unattended window.
- **Firestore write stall:** heartbeat writes are raced against a 5s timeout and swallowed. State writes log and drop. A stall >30s flips `stateFresh` false -> `x32Connected: false` published -> see R7 (faders get disabled on a healthy desk).
- **Cloud unreachable from the venue:** **no fallback whatsoever.** Monitor control is 100% dead. `ws` and `selfsigned` remain in `bridge/package.json` but no WebSocket or HTTPS server exists in `bridge/src` any more.

### 2.3 Mixer power-cycle

Clean: 20s silence on the `/xinfo` keepalive -> `disconnected` -> `attemptReconnect()` probes with 2s->60s exponential backoff, **unbounded attempts** (the ADR's "60 attempts / 10 min" description is stale). On success -> `reconnected` -> `syncFullState`. The `/xinfo` keepalive (BR-02) is the right fix for the earlier bug where an idle-but-healthy desk looked dead every 20s, since `/xremote` is one-way and produces no inbound traffic.

### 2.4 Multiple musicians simultaneously

- **Ordering:** correct. Batches are sorted by Firestore server `createTime`, not the skew-prone client `createdAt` (B4), and a command whose server time precedes the last applied time for the same target key is rejected as superseded (B5). Distinct musicians own distinct buses so target keys rarely collide at all.
- **Debounce/throttle:** three stages — 100ms + rAF in the fader component, 50ms per-key in the client, 20ms dedupe batch at the bridge. A 3s drag becomes ~3 OSC writes per 20ms window rather than 180.
- **Fan-out cost (R3):** every change by anyone rewrites the **single shared ~10KB** `monitor-live/state` and pushes it to **every** listener. 5 musicians dragging -> up to 10 writes/s x 10KB x 5 listeners ~= 500KB/s downstream on congregation-shared WiFi, plus a full re-render of every fader on each arrival. Firestore's documented sustained guidance for one document is ~1 write/s; the ADR called 10/s "acceptable... monitor in production" and it was never monitored.
- **Serialized authz (R11):** `processCommandBatch` awaits each `processCommand` in turn, and each may `await getIsEngineer(uid)` for up to 3s on a cache miss. N musicians' first moves after a 30s lull pay N Firestore reads in series inside the critical path.

### 2.5 iPad backgrounding / stale UI on foreground

- The connection is a module-level singleton with ref counting, a 5s unmount-teardown debounce (sized for iPad tab suspension) and a 3s auth-null debounce for token-refresh blips. Careful work.
- `visibilitychange` **only reconnects when `activeClient === null`** — i.e. only after a full teardown. Returning from a suspension where the client object survived but its Firestore stream is stalled triggers **no forced resync**; recovery depends entirely on the SDK. There is no "visible for 5s with no snapshot -> cycle the client" watchdog.
- The saving grace is honest staleness: `useMonitorStaleness` ticks every 2s and derives age from the bridge's own `state.updatedAt` (90s threshold, deliberately mirroring the MCP's `STALE_STATE_THRESHOLD_SECONDS`) rather than the "a snapshot arrived" proxy that used to read green over a 2-hour-old value. Both surfaces show a Stale badge and a per-fader Clock cue. But on the iPad a **stalled listener is indistinguishable from a dead bridge** — both present as Stale.
- The 2s staleness tick also happens to be what keeps `ConnectionIndicator`'s bridge-liveness math re-evaluating; `isBridgeOnline` is a pure render-time computation with no clock of its own, so without that tick it would freeze on "Connected" the moment heartbeat writes stopped. Both surfaces call the hook, so this works — but it is incidental coupling, not a designed guarantee.

### 2.6 Authorization

Three layers, deliberately split:

1. **UI gate** — `useMonitorAccess`: `isAdmin || soundEngineer || hasBusAssigned`.
2. **Firestore rules** (`monitor-live/commands/pending`) — real membership (`isMember() || isSoundEngineer()`, not bare `isSignedIn`), self-attribution (`uid == auth.uid`), a closed field set, per-field types, a `type` allowlist, and matrix primitives gated to admin/SE in-rule. Per-bus ownership is **intentionally not** enforced here (needs a `get()` on `config/monitor` per command).
3. **Bridge** `isCommandAuthorized` — the *only* per-bus ownership check: `isEngineer || getUserBus(uid) === cmd.busIndex`. The rules file documents this explicitly ("if it is removed or weakened, any member could control any bus").

Notes and gaps: the engineer flag is cached 30s, so revoking sound-engineer status leaves up to 30s of matrix access (bus reassignment itself propagates instantly via the config listener). The engineer read fails **closed** on timeout/error and is not cached, so the next command retries — correct. And `getUserBus` returns only the *first* owned bus (R6).

### 2.7 Local-network fallback

None. See R10.

---

## 3. Health and observability

### 3.1 What `get_bridge_health` reports

`src/lib/mcp/tools/bridge-health.ts` is exemplary and its header comment names the exact trap it exists to defeat: `bridge.status` / `bridge.x32Connected` are last-write-wins with **no TTL**, so after the bridge dies they read `"online"` / `true` forever (the audit trail records a live-confirmed 13.5-hour-stale "online"). The tool therefore returns a **derived** verdict:

- `alive` — `now - bridge.lastSeen <= 120s` (2 missed 60s beats). The only trustworthy liveness signal.
- `stateAgeS` / `stateStale` — age of `monitor-live/state.updatedAt`, 90s threshold. Splits "bridge process alive" from "state pipeline wedged".
- `leaseExpired` — whether `bridgeLease.expiresAt` has passed.
- Raw last-write-wins fields, explicitly labelled as possibly lying.
- v10.0.4 additive diagnostics, `null` against an older bridge: `socketAlive` (raw socket, unfolded), `unconfirmedCount`, `queueDepth`, `uptimeMs`, `errCount`, `lastError {msg, ts}`.
- `summary` — a one-line human verdict that names the staleness warning inline.

Gate: `assertEditor` (admin / band_leader) — deliberately not bus-scoped so an admin without a bus can run a clean probe.

### 3.2 Heartbeats and cadences

| Signal | Cadence | Written by | Consumer |
|---|---|---|---|
| `config/monitor.bridge.*` | 60s | **active (lease-holding) bridge only** | iPad `isBridgeOnline` (120s), `get_bridge_health` |
| `monitor-live/state` | <=10/s on change; **10s** idle re-set; **30s** authoritative re-query | active bridge | iPad `onSnapshot`, `get_mix` / `get_matrix` |
| `bridgeLease` | renew 20s, TTL 90s | every bridge | `get_bridge_health.leaseExpired` |
| `monitor-live/selftest` | **10 min** + on demand | any bridge (no lease gate) | manual read |
| `bridgeLog` ring | on every `console.error`/`warn` | any bridge | `bridge_get_log` |
| Tray icon colour | 2s poll, edge-triggered | Electron main | whoever is looking at the PC |

The `x32Connected` bit published to consumers is deliberately **folded**: `socketAlive && stateAgeMs < 30_000`. The comment names the reasoning precisely — "the bridge can hold a live socket while the state-write path is wedged; publishing `x32Connected=true` then is the 'green health + dead writes' trap." Raw `socketAlive` is published alongside for callers that need to distinguish. This is good design that then causes R7 on the client side.

### 3.3 How a failure would surface to Daniel

**Today: only if he asks.**

- `get_bridge_health` — accurate, but pull-only.
- Tray icon on a PC nobody watches during a service.
- iPad indicator — only once a musician opens the panel, and see R1 for the 90-120s green-while-dead window.
- Sentry (`sentry.*.config.ts`) covers the Next.js app, not the bridge; the bridge's remote ring buffer (`bridgeLog`) is read only via an MCP call.
- **No cron, no push, no email watches the bridge**, despite 11 existing cron routes (`src/app/api/cron/*`), a push API (`src/app/api/push`), and email infrastructure (`src/lib/email.ts`). The only bridge mention in cron is `admin-consistency`, which is unrelated.

The realistic failure story: the bridge died Thursday, nobody noticed, and the band discovers it during Friday-evening soundcheck.

### 3.4 Self-healing inventory

| Mechanism | Present | Notes |
|---|---|---|
| X32 socket auto-reconnect | YES | 2s->60s backoff, unbounded, `syncFullState` on recovery |
| Firestore command-listener re-subscribe | YES | 5s after error |
| Firestore config-listener re-subscribe | YES | 5s, guarded by `watchStopped` (R5) |
| Client listener retry | YES | 2s, tolerates 2 errors before showing `error` |
| Sleep/wake detection | YES | >90s heartbeat gap -> re-detect IP, re-publish |
| DHCP guard | YES | IP change -> re-publish every 60s |
| Crash guards (keep alive) | YES | `uncaughtException`/`unhandledRejection` logged, not fatal |
| Standby->active promotion | YES | Resyncs + writes state on promotion |
| Update deferral during service | YES | Never installs while X32 connected; requires 30 sustained idle minutes, or a human, or app quit. Directly fixes an earlier mid-service freeze. |
| Credential durability | YES | Electron `userData` with self-migration from exeDir — fixes the 2026-05-21 reinstall outage |
| **OS-level watchdog** | NO | Nothing. ADR Phase-2 recommendation never implemented. |
| **Fast crash-restart takeover** | NO | 90s lease TTL blocks it (R1) |
| **Client forced resync on foreground** | NO | Only reconnects if the client was fully torn down |
| **Proactive alerting** | NO | Pull-only (R8) |

---

## 4. Ranked risks with concrete fixes

### R1 — Bridge crash-restart is dead for up to 90s while every iPad shows green — **Critical**

*Mechanism.* Hard crash -> relaunch -> new `bridgeInstanceId` -> `acquireOrRenewLease` sees the dead instance's lease unexpired (TTL 90s) -> refuses -> **STANDBY**: no command drain, no state write, **no heartbeat**. `bridge.lastSeen` from seconds before the crash keeps `isBridgeOnline()` true for 120s. Musicians' moves get `rejected: bridge-standby` acks they cannot read and revert silently.

*Files.* `bridge/src/index.ts` (`LEASE_TTL_MS = 90_000`, `LEASE_RENEW_MS = 20_000`, heartbeat `if (leaseHeld)`), `bridge/src/config.ts` `acquireOrRenewLease`, `src/components/monitor/ConnectionIndicator.tsx` `isBridgeOnline`.

*Fix (quick, ~2h).* Same-host lease steal: split the lease into `{ hostname, bootId, pid, expiresAt }` and treat a lease whose `hostname` equals this machine's as **free** — a previous instance on the same box that is not this process is by definition dead. Drop TTL to 30s / renew to 8s. Have a STANDBY bridge write `bridge.status: 'standby'` + `lastSeen` so the iPad can say "Bridge restarting..." instead of green.

*Fix (structural, ~1d).* The watchdog the ADR asked for: a Windows Task Scheduler entry (`schtasks /create /sc minute /mo 1`) running a script that relaunches the exe when the process is absent, installed by `bridge/build/installer.nsh`. Belongs in the installer so Daniel never has to think about it.

---

### R2 — The per-command ack surface is invisible to musicians — **Critical (UX)**

*Mechanism.* The bridge classifies every command as `applied` / `rejected` (with a reason) / `timeout` and writes it to `monitor-live/commands/acks/{id}`. `firestore.rules` has **no match** for that subcollection, so the deny-all fallback denies clients. The client never subscribes. Consequence: unauthorized, superseded, bridge-standby, expired, malformed and X32-error all present **identically** — spinner for 2s, then an amber undo glyph and no words. Musicians cannot distinguish "not your bus", "bridge restarting", and "the desk is fine, your value just lost a race".

*Files.* `firestore.rules` (~line 502 region), `src/lib/firestore-monitor-client.ts` `sendCommandImmediate` (discards the `addDoc` ref), `src/lib/monitor/fader-confirmation.ts` (no `rejected` event), `bridge/src/ack-writer.ts` (does not stamp `uid`).

*Fix (~4h).* (a) Stamp `uid` into the ack doc in `ack-writer.ts`. (b) Add `match /monitor-live/commands/acks/{commandId} { allow read: if isSignedIn() && resource.data.uid == request.auth.uid; allow write: if false; }`. (c) Return the `DocumentReference` id from `sendCommandImmediate`, subscribe to that ack doc for ~2s. (d) Add a `{ type: 'rejected', reason }` event to `faderReducer` that reverts *immediately* with the reason surfaced as a toast/inline label. This converts the single most common "the killer feature feels unreliable" complaint into a sentence a musician can act on.

---

### R3 — Single hot state document fanned out to every iPad — **High (structural)**

*Mechanism.* One `.set()` of a ~10KB full snapshot, up to 10 writes/s, pushed to every listener regardless of whose bus changed. 5 musicians dragging ~= 500KB/s downstream on WiFi shared with the congregation, plus a full fader re-render per arrival. Firestore's sustained guidance for a single document is ~1 write/s; the ADR flagged this ("monitor in production") and it was never monitored. Degradation is insidious: rising server-confirm latency pushes confirmations past the 2000ms window, so faders start reverting **on a healthy desk** — indistinguishable from a broken mixer.

*Files.* `bridge/src/firestore-transport.ts` (`writeFullState`, `STATE_WRITE_INTERVAL`, `scheduleStateWrite`), `src/lib/firestore-monitor-client.ts` (single state listener), `src/lib/monitor/coerce-state.ts`, `firestore.rules`.

*Fix (quick, ~2h).* Make `STATE_WRITE_INTERVAL` adaptive off `getActiveClientCount()` — 100ms with 1 client, 200ms with 3+. Halves the hot-doc write rate exactly when contention matters.

*Fix (structural, ~3-5d).* Split the state: `monitor-live/state` keeps low-churn shared data (channel names, matrices, `unconfirmed`, meta) and `monitor-live/buses/{busIndex}` carries `{fader, on, sends}`, written only when that bus changes. Each iPad subscribes to the shared doc plus **its own** bus doc; engineers subscribe to all. Per-drag fan-out drops ~5x, every document lands under the 1 write/s guidance, and one musician's drag stops competing with everyone else's. This is the single biggest "feels reliable with the whole band on it" win.

---

### R4 — The final fader position can be dropped on release — **High, and the most-felt symptom**

*Mechanism.* `throttledOnChange` defers any write within 100ms of the previous one into a `requestAnimationFrame`. `handlePointerUp` cancels the pending frame and calls `throttledOnChange(displayValue)` — which, because the last write was almost certainly <100ms ago, schedules **another** rAF. If the popover closes, the component unmounts, or iOS backgrounds the tab in that frame, **the drop value is never sent**: the desk keeps the second-to-last throttled value, and the reducer (already `pending`) eases the knob back 2s later. This is precisely the "I set it and it snapped back" complaint. There is also no unmount cleanup cancelling `rafRef`.

*Files.* `src/components/monitor/FaderStrip.tsx:74-90, 121-127`; `src/components/monitor/VerticalFaderStrip.tsx:74-82, 121-133`.

*Fix (~30 min).* Commit paths must bypass the throttle: on pointer-up, pointer-cancel, double-tap reset and keyboard nudge, call `onChange(value)` **synchronously** and reserve the rAF path for mid-drag continuous motion. The client's own 50ms per-key throttle already protects Firestore, and `FirestoreMonitorClient.disconnect()` already flushes pending throttled commands. Add a `useEffect` cleanup cancelling `rafRef`. Best effort-to-relief ratio on this entire list.

---

### R5 — `unconfirmed` never reaches the iPad; fabricated values shown with full confidence — **Medium-High**

*Mechanism.* When `syncFullState` cannot read a value (UDP drop after 3 attempts), the bridge records the target key in `unconfirmed` and falls back to a **fabricated** `0`/`false`. It publishes `unconfirmed[]` in the state doc precisely so consumers can tell "unknown" from a real zero. `MixerSnapshot` has no such field and `coerceMixerSnapshot` drops it. So a musician can see a confident `0%` where the truth is "we never read this". `get_bridge_health` exposes `unconfirmedCount`; nothing musician-facing does.

*Files.* `src/types/monitor.ts` (`MixerSnapshot`), `src/lib/monitor/coerce-state.ts`, `src/lib/monitor-store.ts`, `FaderStrip.tsx` / `VerticalFaderStrip.tsx` (the `stale` cue machinery already exists).

*Fix (~2h).* Add `unconfirmed: string[]` to `MixerSnapshot`, carry it through coercion into the store, and reuse the existing per-fader Clock cue with the label "level unknown — could not read from the desk" when a fader's confirm key is present.

---

### R6 — Multi-bus assignment is silently half-supported — **Medium**

*Mechanism.* `bridge/src/config.ts getUserBus()` returns only the **first** bus a uid owns, and `isCommandAuthorized` compares `userBus === cmd.busIndex`. The canonical app-side helper `src/lib/mcp/server-monitor.ts getOwnedBuses()` correctly returns **all** of them, and `BusAssignmentPanel` writes arrays (co-ownership is a designed feature). A musician assigned two buses can drive only the lower-numbered one; MCP commands for the other are rejected `unauthorized`. The client's `findUserBus` has the same first-match behaviour, so the second bus is not even reachable from the UI. `getUserBus`'s own doc comment claims "the command authorizer checks the specific bus per command" — which it does not.

*Files.* `bridge/src/config.ts:132-141`, `src/lib/monitor-store.ts` `findUserBus` / `deriveMyBusIndex`, `src/lib/mcp/server-monitor.ts` `getOwnedBuses` (the correct reference implementation).

*Fix (~0.5d).* Replace with `getUserBuses(uid): number[]` and check `.includes(cmd.busIndex)`; make `findUserBus` return all owned buses and add a small bus selector to the UI when the list length exceeds 1.

---

### R7 — A wedged state pipeline disables the faders on a healthy desk — **Medium**

*Mechanism.* The heartbeat publishes the folded `x32Connected = socketAlive && stateFresh(<30s)`. `isMixerOffline()` then wraps every fader in `DisconnectedOverlay` with `pointer-events-none` and the label "Mixer offline — last known levels". So a transient Firestore write stall >30s (congested venue uplink, or a `RESOURCE_EXHAUSTED` burst caused by R3) makes a perfectly healthy desk **un-adjustable mid-service**. The raw `socketAlive` diagnostic that distinguishes the two cases is published but consumed only by MCP. Ironically, `ConnectionIndicator`'s own comment argues exactly the right policy for staleness — "its control path still works, so blocking interaction would wrongly stop a musician on a healthy-but-idle desk" — and then the folded bit bypasses that reasoning.

*Files.* `src/components/monitor/ConnectionIndicator.tsx` (`isMixerOffline`, `getConnectionDisplayState`), `src/types/monitor.ts` (`BridgeStatus` lacks `socketAlive`), `bridge/src/index.ts` (folding site).

*Fix (~1h).* Add `socketAlive` to the `BridgeStatus` type and have `isMixerOffline` return true only when the socket is genuinely down (`socketAlive === false`, falling back to `x32Connected` for older bridges). Route "state wedged" to the existing non-blocking Stale cue instead. Never take control away from a musician while the command path still works.

---

### R8 — Nothing tells Daniel the bridge is down before a service — **High value, lowest effort**

*Mechanism.* Detection is entirely pull-based (3.3). `bridge.status` only becomes `"offline"` on a graceful shutdown, so a dead bridge reads `"online"` indefinitely. All the infrastructure to fix this already exists and is unused for this purpose.

*Files.* new `src/app/api/cron/bridge-watch/route.ts`; `vercel.json` (cron entry); reuse `src/lib/mcp/tools/bridge-health.ts` logic, `src/app/api/push`, `src/lib/email.ts`; service times are already in the scheduling data.

*Fix (~2h).* Hourly, plus a tighter cadence in the 90 minutes before each scheduled Friday-evening / Shabbat-morning service, evaluate the `getBridgeHealth` logic and push/email Daniel when `!alive`, `stateStale`, `leaseExpired`, or `errCount` jumps. Include `lastError.msg` and the recommended verb (`bridge_resync` vs `bridge_restart`) in the notification body. Highest value-per-hour item in this report: it converts every other failure on this list from "discovered by the band at soundcheck" into "handled Thursday night".

---

### R9 — Bus ownership has exactly one enforcement point, and the engineer cache can lag a revocation — **Medium (security)**

*Mechanism.* By design, rules enforce only membership, self-attribution, shape and the matrix gate; per-bus ownership lives **solely** in the bridge's in-memory `isCommandAuthorized` on an unattended Windows box. Any signed-in member can enqueue a well-formed command for any bus, and only that check stops it. Separately, `ENGINEER_CACHE_TTL_MS = 30_000` means revoking sound-engineer status leaves up to 30s of matrix (FOH) access — bus reassignment itself propagates instantly via the config listener, so the asymmetry is only on the privilege flag.

*Files.* `firestore.rules` `monitor-live/commands/pending`, `bridge/src/firestore-transport.ts` `isCommandAuthorized` / `getIsEngineer`.

*Fix (~1h + optional).* Invalidate `engineerCache` whenever `config/monitor` changes (the listener is already wired) and drop the TTL to ~10s. Optionally add a CEL `get()` per-bus check in rules for the two most dangerous primitives only (`set_matrix_*`, `set_bus_master`) — one extra read per command is affordable at these rates and makes the bridge genuine defence-in-depth rather than the sole gate for them.

---

### R10 — No LAN fallback, actively misleading runbooks, zero monitor E2E coverage — **Medium**

*Mechanism.* (a) If Firestore is unreachable from the venue, monitor control is 100% dead with no local path; `ws` and `selfsigned` are still bridge dependencies with no server behind them. (b) `docs/BRIDGE-v2.1.0-UPGRADE.md` still instructs Daniel to trust self-signed certs on each iPad and to look for `[WS] Secure WebSocket (wss://) attached` — for a transport that has been **deleted**. `docs/bridge-architecture-decision.md` (ADR-001, marked "Valid until: 2026-06-07") describes bridge v2.x while `bridge/package.json` reads 10.0.7, and cites reconnect limits ("60 attempts / 10 min") that no longer match the code. A wrong runbook is worse than no runbook when Daniel is troubleshooting ten minutes before a service. (c) 28 Playwright specs, **none** touching monitor. Rules coverage exists (`firestore-rules-monitor.emulator.test.ts`) and 22 bridge unit tests exist, but nothing exercises iPad -> Firestore -> bridge -> desk end to end, despite a capable X32 mock (`bridge/src/__tests__/x32-mock-server.ts`).

*Fix.* (~30 min) Banner the obsolete docs as superseded and re-date the ADR; delete `ws`/`selfsigned` or note why they are retained. (~1d) One Playwright spec driving a real fader against the X32 mock plus a live bridge process, asserting the confirmation reaches `confirmed`. (Deferred) Decide explicitly whether a LAN fallback is wanted; if so, prefer a bridge-hosted break-glass page on the venue LAN over reviving per-iPad cert trust, which is exactly what the current architecture was adopted to escape.

---

### R11 — Cold-cache authorization serializes the command batch — **Low-Medium**

*Mechanism.* `processCommandBatch` awaits each `processCommand` in turn, and each can `await getIsEngineer(uid)` for up to `ENGINEER_READ_TIMEOUT_MS = 3_000`. With the 30s TTL, the first move after a lull pays a `users/{uid}` read inside the critical path; with several musicians it is N reads in series, adding to the very latency budget that R3 is already straining.

*Files.* `bridge/src/firestore-transport.ts:275-325, 583-618`.

*Fix (~2h).* Resolve the distinct uids' flags with `Promise.all` before the loop, and warm the cache for every assigned musician at startup and on each `config/monitor` change. Assigned musicians are a known, tiny set — the cache should essentially never miss during a service.

---

### R12 — Minor correctness papercuts — **Low**

- `isBridgeOnline` fails **open** when `lastSeen` is absent ("no heartbeat data = legacy bridge, assume online"), so a never-provisioned bridge reads green. Fail closed with a distinct "Bridge not configured" label.
- `cleanupStaleCommands` filters on the client-supplied `createdAt` (device wall clock) while every other ordering/staleness decision correctly uses server `createTime` (B4). A forward-skewed iPad's abandoned commands can evade the sweep indefinitely. Use `createTime` or a server-stamped field.
- `bridge.version` falls back to a hardcoded `"2.0.0"` in three places (`index.ts` x2, `firestore-transport.ts`) while `package.json` says 10.0.7 — the exact "misleading bridge.version" problem a code comment elsewhere says was already fixed once. Inject at build time.
- `monitor-store.setSnapshot`'s `shallowEqualArray` reference comparison can never succeed against freshly deserialized Firestore objects — dead optimization, and it hides the fact that every heartbeat replaces the whole array.
- `monitor-live/state` is readable by **any** signed-in user, exposing every musician's mix. Consistent with the app's trust model; worth a conscious decision rather than an accident, and it disappears naturally under R3's per-bus split.

---

## 5. Recommended fixes ranked by impact / effort

### This week — hours each, no architectural risk

| # | Fix | Risk | Effort | Why now |
|---|---|---|---|---|
| 1 | `bridge-watch` cron + push/email | R8 | ~2h | Daniel learns before the band does. Multiplies the value of every other fix. |
| 2 | Send the drop value synchronously on release | R4 | ~30 min | Kills the most-felt "it snapped back" symptom. |
| 3 | Same-host lease steal + TTL 30s + standby heartbeat | R1a | ~2h | Turns a 90s dead window into ~5s, and stops the green-while-dead lie. |
| 4 | Ack read path (rules + `uid` stamp + client subscribe + reducer event) | R2 | ~4h | Every silent revert becomes an actionable sentence. |
| 5 | Stop disabling faders on state-staleness | R7 | ~1h | Never take control away while the command path works. |
| 6 | Surface `unconfirmed` per fader | R5 | ~2h | No more confident fabricated zeros. |
| 7 | Banner the obsolete bridge docs | R10a | ~30 min | A wrong runbook actively harms troubleshooting. |

### Next — days

| # | Fix | Risk | Effort |
|---|---|---|---|
| 8 | Windows watchdog task, installed by NSIS | R1b | ~1d |
| 9 | `getUserBuses` plural + UI bus selector | R6 | ~0.5d |
| 10 | Parallel authz resolution + cache warming | R11 | ~2h |
| 11 | Engineer-cache invalidation on config change | R9 | ~1h |
| 12 | One monitor E2E spec against the X32 mock | R10c | ~1d |
| 13 | R12 papercuts (fail-closed indicator, server-time sweep, version injection) | R12 | ~2h |

### Structural — weeks, in priority order

| # | Fix | Risk | Effort | Payoff |
|---|---|---|---|---|
| 14 | **Split state into per-bus documents** | R3 | ~3-5d | ~5x less fan-out per drag; every doc under the 1 write/s guidance; one musician's drag stops competing with the rest of the band. The single biggest "feels reliable with everyone on it" win. |
| 15 | **Latency telemetry into the existing web-vitals sink** | 1.2 | ~2d | Record server-confirmed round-trip (the client already has `stateSeq`, `snapshotCount`, and documented `hasPendingWrites` semantics) so P95 during a real service becomes a number. The ADR's own switch-to-hybrid trigger (>300ms P95) is currently unmeasurable — this makes decision 16 evidence-based instead of a guess. |
| 16 | Hybrid LAN command path — **only if 15 says so** | R10a | ~1-2d | Prefer a bridge-hosted break-glass surface over reviving per-iPad cert trust, which is what the current architecture was adopted to escape. |

### Still-open ADR risks, now testable

The ADR's residual risks remain unresolved and are worth closing with fix 15 in place: iPad background throttling of `onSnapshot` (Risk 2), Firestore write-rate limiting (Risk 3 — the same hot document as R3), real-hardware OSC validation of `syncFullState` across all 32 channel names (Risk 4), and installer code signing (Risk 5, UX only).

---

## 6. What is genuinely well built (do not regress these)

Worth recording, because a future refactor could easily undo hard-won fixes:

- **Server-relative command ordering** (B4) — using Firestore `createTime` rather than iPad wall clocks for both ordering and the staleness cutoff. Cross-device clock skew broke this once.
- **Query-after-command confirmation** (C2) — the X32 does not echo the sender's own writes, so the 75ms-debounced read-back is what makes `applied` acks and honest fader confirmation possible at all.
- **Full-state `.set()` instead of dot-path `.update()`** (C1/R3-bridge) — dot-path updates silently converted the `buses` **array** into a **map**, and the consumer-side `coerceArray` guard is retained as defence in depth.
- **Staleness from the bridge's own `updatedAt`** (C-6) — the previous "a snapshot arrived" proxy showed green "Live" over 2-hour-old values on page load. The client and MCP now deliberately mirror the same 90s threshold.
- **`snapshotSeq`-gated fader confirmation** (C-2) — prevents a fader from "confirming" against its own optimistic echo; drag-suppression (C-12) stops a cross-device push yanking a knob out from under a finger; the revert eases rather than hard-snapping (C-3).
- **Bus index 0 is valid** (C-11) — `hasAssignedBus` exists because truthiness checks silently dropped every command from the musician on bus 0.
- **Update deferral during services** (BR-03) — an `electron-updater` release once froze every musician's mix mid-service; installs now require 30 sustained idle minutes, a human, or app quit.
- **`/xinfo` keepalive** (BR-02) — `/xremote` is one-way, so an idle-but-healthy desk used to look dead every 20s and trigger a needless full resync.
- **Credential durability** (Bug#1) — Electron `userData` with self-migration from the exe directory, after a reinstall orphaned the service-account key and caused the 2026-05-21 outage.
- **Boot-loop guards on remote restart** — `clearBridgeControl()` before relaunch, plus the `requestedAt` vs `processStartedAt` cross-process backstop.

The pattern in this codebase is that each of those was learned from a live failure. The gaps in section 4 are the ones that have not yet had their live failure — R1 and R8 are the two most likely to supply it.
