# AUDIT — Bridge + data model (Monitor Overhaul, Phase 0, Lane P0-A1)

**Author:** coder-1 (bridge expert). **Tier 0, READ-ONLY.** **Date:** 2026-05-21.
**Baseline:** all `file:line` evidence is against `origin/master` @ **`70357f47f`** (read from a master-pinned
worktree; the canonical `sheet-music-app/` cwd is on stale `fix/b1-error-envelope-sweep` and was NOT trusted).
Repo is a **shallow clone** (`--is-shallow-repository`=true) → no history/datedness claims made here.

**Companion:** `AUDIT-consumers.md` (coder-5, P0-A2 — iPad/MCP/rules). **Parent:** `PROGRAM-SPEC.md`,
`PHASE-0-PLAN.md`. **Synthesizes into:** `DEFECT-REGISTER.md` + the ratified target state-contract.

**Scope audited:** `bridge/src/{index,x32-client,firestore-transport,config,types,main}.ts` +
`bridge/src/__tests__/*`; data model `config/monitor`, `monitor-live/state`,
`monitor-live/commands/pending` (incl. `firestore.rules` wire-schema + canonical `src/types/monitor.ts`
consumer contract + `src/lib/mcp/server-monitor.ts` read path).

---

## 0. Executive summary

The monitor system's single architectural fault is the **bridge's state-write contract**. Control
(iPad/MCP command → X32) works; the **readback** is broken by three interlocking bugs, all confirmed below
with `file:line`. A redesign of *only* the state-write path (full-state writes + query-after-command
confirmation + a state heartbeat) fixes all three at the root. Beyond the three, this audit enumerates **15
further defects/gaps** (B1–B15) and proposes a **concrete target state-contract** (Part C) implementable by
Phase 1 without re-deriving intent.

Severity legend: **R** = root bug (program-defining), **HIGH/MED/LOW** = secondary.

---

## Part A — The three confirmed root bugs

### R1 — Read-of-own-write (the bridge never confirms its own commands)

**The X32 does not echo a client's own writes back to that client, and the bridge does not
optimistically update its cache or query-back after sending.** So an MCP/iPad-driven change is applied on
the desk but never reflected in `monitor-live/state`.

Evidence chain:
- The SET methods are pure fire-and-forget — they `send()` an OSC packet and return; they do **not** touch
  the in-memory cache (`this.buses[i].fader`) and do **not** schedule a read-back:
  `x32-client.ts:506-509` (`setBusFader`), `:511-514` (`setSendLevel`), `:516-519` (`setSendOn`),
  `:521-524` (`setMatrixFader`), `:526-529` (`setMatrixOn`). Each is one `this.send(addr, [...])` call.
- The in-memory cache is mutated **only** by `routeParameterChange` (`x32-client.ts:341-436`), which is
  reached **only** from `handleMessage` (`x32-client.ts:327-339`) on an **inbound** `socket "message"`
  (`x32-client.ts:143-148`). No inbound message ⇒ no cache update.
- The Firestore state write is triggered **only** by the X32 `bus_fader`/`send_level`/`send_on`/
  `matrix_fader`/`matrix_on` events (`firestore-transport.ts:392-444`), which are emitted **only** from
  `routeParameterChange` (e.g. `x32-client.ts:367`, `:382`, `:398`, `:421`, `:432`).
- Therefore a command processed by `processCommand` (`firestore-transport.ts:283-316` — e.g. the
  `set_bus_master` case at `:284-287` calls `this.x32.setBusFader(...)`) produces: X32 applies the change →
  X32 sends nothing back to the bridge → no `raw_message` → no `routeParameterChange` → no `bus_fader`
  event → **no delta/state write**. `monitor-live/state` stays at its prior value for that parameter.

Why a *manual* desk move looks different: a physical fader move **is** echoed to `/xremote` subscribers, so
it travels the inbound path above and *does* update state (and also triggers R3). This is exactly the
asymmetry observed live (`monitor-f1-probe` @ `b95715f13`): Kim's hand-move updated state; the queued command
did not. **Root, not artifact.**

The header comment "X32 echoes parameter changes from any source" (`x32-client.ts:6-10`) is the latent
false assumption — true for *other* clients, false for the *originating* client. The bridge already owns the
query primitives to fix this (`queryBusFader` `x32-client.ts:468-472`, `querySendLevel` `:474-478`, etc.) —
they are simply never called after a SET.

### R2 — BR-02 idle-freeze (no mixer-state heartbeat)

**There is no periodic write of `monitor-live/state` that is independent of desk activity.** On an idle desk
(no manual moves, and — per R1 — no own-write echoes) the state doc's `updatedAt` never advances and the
fader/mute values go and stay stale.

Evidence:
- State is written **only** at: startup (`index.ts:124` `transport.writeFullState()`); the `state_synced`
  event (`firestore-transport.ts:447-450`); the `reconnected` event (`:451-457`); and inbound-echo delta
  writes (`:392-444`). There is **no timer** that rewrites state.
- The one 60s timer — `heartbeatLoop` (`index.ts:151-198`) — writes the **`config/monitor`** doc via
  `config.writeHeartbeat` (`config.ts:166-189`), which updates only `bridge.lastSeen/status/x32Connected/
  clients/localIp/version`. It does **not** touch `monitor-live/state`.
- BR-02 (`bridge-cleanup-fixes` @ `e991d7b60`) added the `/xinfo` keepalive + response-based liveness
  (`x32-client.ts:215-260`) which **removed** the prior false-disconnect-every-20s. That false disconnect
  had been the *accidental* periodic resync: disconnect → `attemptReconnect` → `reconnected` →
  `syncFullState` → `state_synced` → state write, roughly every 20s. With it gone, **nothing** periodically
  rewrites state.

Net effect (matches the shipped staleness-guard rationale `server-monitor.ts:78-90` and `monitor-f1-probe`
@ `b95715f13`): the `config/monitor` heartbeat reads green every 60s while `monitor-live/state.updatedAt`
freezes — the "green health + dead writes" trap. The app-side staleness guard (`70357f47f`) correctly
*flags* this; it does not *fix* it. **Root.**

### R3 — Array→map delta corruption (dot-path `update()` destroys the `buses` array)

**Delta writes use Firestore dot-notation field paths with numeric segments, which Firestore interprets as
map keys — converting the `buses` (and `matrices`) ARRAY into a MAP and dropping every sibling entry.**

Evidence:
- `scheduleDeltaWrite` is called with dot-path keys carrying numeric indices:
  `firestore-transport.ts:398` `` `buses.${arrayIndex}.fader` ``; `:409` `` `buses.${i}.sends.${j}.level` ``;
  `:421` `` …sends.${j}.on ``; `:431` `` `matrices.${i}.fader` ``; `:440` `` `matrices.${i}.on` ``.
- These accumulate into `pendingDeltas` (`:106-110`) and are flushed via
  `this.db.doc("monitor-live/state").update({ ...deltas, updatedAt })` (`firestore-transport.ts:159-164`).
- Firestore `update()` treats a dotted field path (`buses.0.fader`) as nested **map** keys; it cannot
  address an array element by index. Applied to a doc where `buses` is an array, it **replaces** `buses`
  with a map `{ "0": { fader: v } }`, dropping buses 1..N. Consumers expect `MixerSnapshot.buses: BusInfo[]`
  (`src/types/monitor.ts:40-45,61-66`) and iterate/`.find()` over it (e.g. `server-monitor` /
  `get_mix`) → `i.buses.find is not a function` at the deployed surface (`PROGRAM-SPEC.md §8`,
  live throw documented in `monitor-f1-probe` @ `b95715f13`).
- The **initial** write is correct: `writeFullState` (`firestore-transport.ts:84-100`) uses `.set()` with
  the real arrays. **Corruption is triggered by the FIRST delta** — i.e. the first inbound echo (a manual
  desk move). After corruption the shape stays broken until the next *full* write (startup / `state_synced`
  / reconnect), which — per R2 — may never come on an idle desk. This also explains the dual live symptom:
  the moved bus's value *did* appear (`buses["0"].fader` set) **while** the array shape was simultaneously
  destroyed (siblings dropped). **Root.**

> The three compose exactly as the live diagnosis found: R1 freezes own-writes, R2 freezes idle state, R3
> corrupts the shape on the first echo and breaks reads/`set_bus_fader` validation. Fixing the **write
> contract** (Part C) closes all three.

---

## Part B — Other bridge defects / gaps (each verified, not assumed)

### B1 — Reconnect does not explicitly re-arm `/xremote` (LOW; prompt hypothesis partially refuted)
The prompt flagged `x32-client.ts:294-302` as "NOT re-arming `startXRemote()`." **Verified:** the success
branch (`:294-302`) sets `connected=true` + emits `"reconnected"` and indeed does **not** call
`startXRemote()`. **However**, the `xremoteInterval` (set in `startXRemote` `:206-208`) is **never cleared
on disconnect** — only `disconnect()` (`:185-188`) clears it, and that runs only on shutdown. The
health-check failure path (`:244-259`) sets `connected=false` + `attemptReconnect()` but leaves the interval
running. So `/xremote` keeps being sent every 8s throughout, and the subscription **self-re-arms within ≤8s**
of the X32 returning. Plus `index.ts:142-145` runs a full `syncFullState` on `reconnected`, refreshing all
values. **Real residual gap:** a ≤8s window post-reconnect where external echoes can be missed before the
next `/xremote` lands — bounded and largely covered by the reconnect resync. **Severity LOW**, not the
severe bug the hypothesis implied. (No interval *stacking* risk: `connect()`/`startXRemote()` run once;
reconnect never re-invokes them.)

### B2 — Startup `state_synced` is emitted before the transport listener attaches (LOW, latent)
`index.ts:116` `await x32.syncFullState(...)` emits `state_synced` (`x32-client.ts:589`) **before** the
transport exists (`index.ts:121`) and before `transport.start()` → `setupX32Listeners()` registers the
`state_synced` handler (`index.ts:122`, `firestore-transport.ts:74-78,447-450`). The initial event is
**lost**. It is currently **compensated** by the explicit `transport.writeFullState()` at `index.ts:124`, so
initial state *is* written. Latent fragility: if someone deletes line 124 trusting the event, startup state
silently never publishes. Order should be: create+start transport, *then* sync. **LOW.**

### B3 — Liveness is derived from `/xinfo` keepalive, not state-freshness (MED — observability root of R2)
The health check marks "connected" purely from `lastMessageAt`, which any inbound OSC bumps — including the
keepalive echo (`x32-client.ts:146`, `:241-259`). The 60s heartbeat then publishes `x32Connected =
x32.isConnected()` to `config/monitor` (`index.ts:181,185-189`). So the bridge can report
`status:online, x32Connected:true` while `monitor-live/state` is frozen (R2). This is precisely the
"green health + dead writes" mismatch that *forced* the app-side staleness guard. The contract should make
liveness reflect **state freshness**, not just socket chatter. **MED.**

### B4 — `createdAt` is cross-machine wall-clock; staleness + ordering trust clock agreement (MED)
Commands carry `createdAt: Date.now()` set by the **writer** — the Vercel server for the MCP path
(`server-monitor.ts:257`) or the iPad browser for the direct path — and the rules require
`createdAt is number` (`firestore.rules:411`). The **bridge** (studio PC clock) then:
(a) discards commands with `Date.now() - cmd.createdAt > 10_000` (`firestore-transport.ts:258`), and
(b) drops "obsolete" reordered commands via `cmd.createdAt < lastCmdTime` across writers
(`firestore-transport.ts:269-280`). With cross-machine clock skew >10s, **every** command is rejected as
`Timeout`; with negative skew, stale commands never expire; with two writers skewed differently (iPad vs
Vercel), the per-target `latestCommandTimestamps` ordering is wrong. No clock-sync assumption is documented
or enforced. **MED.** (Prefer a server timestamp or a bridge-side received-at clock for these decisions.)

### B5 — Command ordering / batch edge cases (LOW)
`processCommandBatch` (`firestore-transport.ts:210-238`) sorts each 20ms batch by `createdAt` and processes
serially. Edges: equal `createdAt` for the same target → both execute (strict `<` at `:273`); two
same-target commands inside one batch → both sent to the X32 (last wins, harmless); the obsolete-drop relies
on B4's clock. No correctness break observed, but the ordering guarantees are weaker than they appear and
rest on B4. **LOW.**

### B6 — Command results are written to a doc nobody can read; no ack/confirmation surface (MED)
On reject/timeout/error, `processCommand` annotates the command doc — `batch.update(ref, {error:
"Unauthorized", processedAt})` (`:253`), `{error:"Timeout"}` (`:259`), `{error: msg}` (`:322`) — but the
rules set `allow read: if false` on `pending` (`firestore.rules:408`), and the doc is later swept by
`cleanupStaleCommands` after 30s (`firestore-transport.ts:464-482`). **No caller ever learns whether a
command applied, was rejected, or timed out.** This is the gap `monitor-mcp-polish`'s `confidence:"queued"`
(@ `62a287f06`) papers over and that Phase-2 `get_command_status` (R-1) targets. The new contract should
define a readable ack surface (Part C2/C4). Also note error/timeout branches `return` without
`batch.delete(ref)` (`:253-260`), so error docs linger up to 30s. **MED.**

### B7 — The X32 mock ECHOES own-writes → CI cannot catch R1 (HIGH for test fidelity)
`x32-mock-server.ts` echoes every SET back to **all** clients including the sender:
bus fader `:393-396`, send level `:419-422`, send on `:446-449`, matrix fader `:483-486`, matrix on
`:504-507`. The **real** X32 does **not** echo to the originating client. Consequence: a bridge test driving
a SET through the mock sees state update afterward — exactly the behavior R1 lacks against real hardware —
so the read-of-own-write bug is **invisible to CI**. The mock also does not model `/xremote` subscription
state (it just emits an event at `:356-358`; all registered clients get echoes unconditionally) or
subscription expiry. **This is the precise Wave-2 P0-B1 target:** make own-writes silent to the sender +
model `/xremote` subscribe/renew/expire + add a red test that reproduces R1. **HIGH (test fidelity).**

### B8 — OSC parser has no `#bundle` support (LOW-MED, verify-on-hardware)
`parseOSCMessage` (`x32-client.ts:66-107`) decodes a single OSC message only. If the X32 ever sends an OSC
**bundle** (`#bundle` element — used by some `/node`/batch responses), the parser reads `#bundle` as the
address and the rest as garbage args. X32 parameter echoes are typically individual messages, so this may
never fire in practice — flag for hardware verification rather than assume. **LOW-MED.**

### B9 — `query()` is keyed by address; concurrent queries/echoes collide (MED — matters for the new contract)
`query()` registers one callback per address in `pendingCallbacks` (`x32-client.ts:440-453`), and
`handleMessage` (`:331-335`) resolves it on **any** inbound message for that address — including an
*unrelated* echo (e.g. a concurrent manual move), so a query can resolve with a value it didn't ask for.
Two in-flight queries to the same address also collide (the second overwrites the first's callback → the
first hangs to its 2s timeout). In `syncFullState` each address is queried once concurrently, so no
self-collision today — **but Part C2's query-after-command will issue queries for addresses that also
receive echoes**, so the contract must address correlation (see C2). **MED.**

### B10 — `checkForRunningInstance` only warns ("continue anyway") (LOW)
`index.ts:64-71` logs a warning when a recent heartbeat indicates another live bridge but proceeds anyway;
`config.checkForRunningInstance` (`config.ts:206-227`) is advisory only. The Electron single-instance lock
(`main.ts:21-24`) prevents two instances on the **same** PC, but two bridges on **different** PCs would both
consume `pending` and both write state (double execution + write thrash). Operationally unlikely; note for
completeness. **LOW.**

### B11 — Sync defaults are inconsistent / silent-zero on query failure (MED)
On a failed/timed-out query, `syncFullState` substitutes fabricated values that are written as if real:
fader→`0` (`x32-client.ts:471` and the `.catch(()=>0)` at `:553-554`, `:560-561`), send `on`→`false`
(`:562`), but matrix `on`→**`true`** (`:582`). So a flaky network during a sync can publish spurious zeros
(reads as "muted/at-floor") and asymmetric mute defaults, with no "unknown" sentinel. The full-state
contract should distinguish "confirmed value" from "unknown/unreachable." **MED.**

### B12 — Dead local-cache reconciliation; drift relies on a full sync that never comes (LOW-MED)
`flushState` contains a no-op block referencing `this.lastSnapshot` (`firestore-transport.ts:152-157`), but
`lastSnapshot` is declared (`:44`) and **never assigned**, so it is always `null`. The comment "let the next
full sync fix any drift" assumes a periodic full sync that R2 shows does not exist. Delta drift therefore
accumulates unbounded. Resolved naturally by Part C (full-state writes + heartbeat make this moot). **LOW-MED.**

### B13 — `connectedClients` / heartbeat `clients` hardcoded to 0 (LOW, observability)
`index.ts:182` `internalStatus.connectedClients = 0` and `:187` `clients: 0` (and `config.ts:177`
`bridge.clients`) are always 0 — the Firestore transport has no connected-client count. Cosmetic but
misleads any dashboard reading "0 clients." **LOW.**

### B14 — Version sentinel only fixed on the packaged path (LOW, mostly addressed)
`index.ts:53` (banner) and `config.ts:178` (heartbeat) default `process.env.BRIDGE_VERSION || "2.0.0"`.
`main.ts:315-321` now sets `BRIDGE_VERSION = app.getVersion()` before `startBridge()`, so the **packaged
Electron** app reports its real version (closing the recon version-blind gap from `bridge-recon` @
`1ab796a2f`). A **headless** run (`npm start` on `index.ts` directly) still reports the `"2.0.0"` sentinel.
Also note: an *embedded* `config` copy in `monitor-live/state` (`firestore-transport.ts:89`) is what made
the frozen-`config.bridge.version:"2.0.0"` detective work necessary in `monitor-f1-probe` — see C4. **LOW.**

### B15 — `verifyToken` is dead code (LOW, cleanup)
`config.verifyToken` (`config.ts:90-103`) — the only `admin.auth().verifyIdToken` call in the bridge — has
**zero callers** (the Firestore-transport model authenticates via Firestore rules + per-command `uid`
attribution, not ID-token verification). This was the basis for CRIT-003's "Firestore-only footprint"
finding (`crit003-impl` @ `cbf5cd704`). Safe to delete; reduces the bridge's apparent auth surface. **LOW.**

---

## Part C — Target state-contract proposal (the one real fork)

**Recommendation in one line:** replace the dot-path delta writer with a single **throttled
full-state `.set()`** writer, add **query-after-command confirmation** (the X32 won't echo own-writes), and
add a **state-write heartbeat** so idle never freezes. The bridge already has every primitive needed.

### C1 — Full-state writes vs shape-preserving delta → **FULL-STATE WRITES** ✅

Write the complete, well-typed `MixerSnapshot` via `.set()` on every state change (throttled); **delete
`scheduleDeltaWrite` + the dot-path `.update()` branch entirely** (`firestore-transport.ts:106-174`).

Rationale:
- **Kills R3 at the root.** `.set()` with a real JS array stores an array; there is no dot-path to coerce
  it into a map. The corruption class disappears.
- **Trivial at this scale.** A full snapshot ≈ 32 channel names + 4 buses × (1 fader + 32 sends ×
  {level,on}) + 6 matrices ≈ a few KB. At the existing 100ms throttle (`STATE_WRITE_INTERVAL`,
  `firestore-transport.ts:46` → ≤10 writes/s) an active fader sweep is tens of KB/s — negligible on LAN +
  Firestore for ~6 iPads. Firestore has no per-array-element write primitive anyway, so a "shape-preserving
  delta" would have to read-modify-write the whole array in memory and `.set()` it — i.e. *more* code for
  the *same* write, with the array-corruption foot-gun still one mistake away.
- **Simpler invariant for consumers.** The state doc is always a complete snapshot; consumers never observe
  a half-built map (removes the need for the `safeArray` band-aid coder-4 is adding to `get_mix` as the R3
  down-payment — keep that guard as defense-in-depth, but it stops being load-bearing).
- The writer already exists and is correct: `writeFullState` (`firestore-transport.ts:84-100`). Route
  **all** triggers through it (throttled).

Tradeoff accepted: each write ships the whole doc. Quantified above as negligible. **Decision: full-state.**

### C2 — Query-after-command confirmation shape

After `processCommand` applies a SET (`firestore-transport.ts:283-316`), the bridge must **query the
affected parameter back** and update its in-memory cache, then schedule a full-state write — because the X32
will not echo the bridge's own write (R1).

- **Mechanism (primitives already present):**
  `set_bus_master` → after `setBusFader(bus,v)` → `await queryBusFader(bus)` (`x32-client.ts:468-472`) →
  set `this.x32.buses[i].fader` → schedule write. Same mapping for `set_send_level`/`set_send_on`
  (`querySendLevel` `:474-478`, `querySendOn` `:480-484`) and matrix (`queryMatrixFader` `:492-496`,
  `queryMatrixOn` `:498-502`).
- **Debounce per target** so a fast sweep doesn't issue a query per tick: re-query a target ~50–100ms after
  its *last* SET, keyed by the existing `targetKey` (`firestore-transport.ts:264-267`). One confirmed
  read-back per gesture, not per packet.
- **Correlation (fixes B9 for the new path):** query-after-command queries an address that may also receive
  third-party echoes. Two safe options — (a) accept "latest authoritative value wins": the read-back returns
  the desk's *current* value regardless of who set it, which is exactly what we want to publish; or
  (b) add a short per-address request/response queue (FIFO of pending callbacks) so a query resolves on the
  *next* response for its address, not an arbitrary echo. **Recommend (a)** for simplicity, with a bounded
  timeout (~300ms) → on timeout, do not write a fabricated value; let the next state heartbeat (C3) reconcile.
- **Ack surface (fixes B6):** on confirm/reject/timeout, write a small result the caller can read — see C4
  `monitor-live/acks/{commandId}`. This is also where Phase-2 `get_command_status` (R-1) reads.

Tradeoff: +1 LAN round-trip (~ms) per gesture. For the iPad North Star, *confirmation* is the entire point,
so this is the desired cost.

### C3 — State-heartbeat cadence (two tiers)

Fixes R2 — idle must never freeze — without hammering the X32:

- **Cheap state-write heartbeat (no X32 traffic):** every **~10s**, re-`.set()` the current in-memory
  snapshot so `updatedAt` advances even with zero desk activity. 10s sits comfortably inside the 90s
  `STALE_STATE_THRESHOLD_SECONDS` (`server-monitor.ts:90`) and the 60s config heartbeat, so a healthy idle
  desk never reads stale. Pure Firestore write of cached state.
- **Authoritative re-query resync (heavier):** every **~30s** (and on reconnect/config-change, as today)
  run `syncFullState` to catch any drift or missed echoes. This deliberately restores the periodic resync
  BR-02 accidentally removed — at a sane, intentional cadence rather than as a side effect of a false
  disconnect.

Both cadences are tunable consts. Suggested Phase-1 defaults: `STATE_HEARTBEAT_MS = 10_000`,
`FULL_REQUERY_MS = 30_000`. (Phase-0 open fork: confirm exact latency targets; these are starting points.)

### C4 — Document schema

- **Keep `buses` an ARRAY.** The canonical contract is `MixerSnapshot.buses: BusInfo[]`
  (`src/types/monitor.ts:40-45,61-66`) and every consumer iterates/`.find()`s it. Full-state `.set()` (C1)
  preserves the array. Migrating to a map would force changes across the iPad store, `server-monitor`, and
  `get_mix` for zero benefit. **No map migration.**
- **Add light freshness/identity fields to `monitor-live/state`:**
  - `updatedAt` (already written, `firestore-transport.ts:95`) — keep.
  - `schemaVersion: number` (start at `1`) — cheap forward-compat guard so any future shape change is
    detectable; **not** a heavyweight migration.
  - `bridgeVersion: string` + `stateSeq: number` (monotonic per write) — lets consumers and the staleness
    guard detect a "frozen at upgrade boundary" condition directly instead of inferring it from an embedded
    config copy (the exact detective work `monitor-f1-probe` had to do).
- **Stop embedding `config` in the state doc.** `writeFullState` currently nests `config: this.config.getConfig()`
  (`firestore-transport.ts:89`) — a duplicate of `config/monitor` that goes stale and was the misleading
  `config.bridge.version:"2.0.0"` source. Consumers read `config/monitor` directly. Drop it (or at minimum
  never embed bridge status). *(Coordinate with coder-5: confirm no iPad consumer reads
  `state.config.*`; canonical `MixerSnapshot.config` is typed but `server-monitor` reads `config/monitor`
  separately.)*
- **Reserve the ack surface:** `monitor-live/acks/{commandId}` doc — `{ commandId, status:
  'applied'|'rejected'|'timeout', confirmedValue?, reason?, at }` — server-write / client-read, swept on a
  TTL. Closes B6 and is the read target for Phase-2 `get_command_status`.

### C5 — Concrete write algorithm (so Phase 1 doesn't re-derive)

```
// ONE throttled full-state writer; dot-path deltas DELETED.
writeState():
  set monitor-live/state = {
    schemaVersion: 1,
    channels, buses /* ARRAY */, matrices,
    updatedAt: serverTimestamp(),
    bridgeVersion, stateSeq: ++seq,
  }   // .set() — NO .update() field-paths

// Triggers (all → throttled writeState at ≤10/s):
//  1. startup: createTransport → start() → syncFullState → writeState   (fixes B2 ordering)
//  2. inbound X32 echo: routeParameterChange updates cache → writeState
//  3. AFTER a command: applyOnX32 → (debounced) queryParamBack → update cache → writeState + writeAck
//  4. state-write heartbeat: every STATE_HEARTBEAT_MS (~10s) → writeState (cached snapshot)
//  5. full re-query resync: every FULL_REQUERY_MS (~30s) + on reconnect/config-change → syncFullState → writeState

// Liveness (fixes B3): derive bridge "healthy" from (socket-alive AND state-age < threshold),
//   not socket chatter alone, before publishing x32Connected to config/monitor.
```

Single-owner note: per PROGRAM-SPEC §7 and `decisions.md` 2026-05-21T~20:15Z, all `bridge/**` Phase-1 work
is **coder-1, Daniel-gated**, and a bridge release is outward-facing + single-owner.

---

## Part D — Dedup against prior audits (cite SHAs) + what this supersedes

- `monitor-audit-1` (`c2c45b6f4`) — bridge/transport/X32 FINDINGS; its CRITICAL BR-04 (getUserBus
  array-mis-read) is **already FIXED** (`monitor-fix-f2` @ `a5d35f47f`); confirmed correct here
  (`config.ts:128-137`, tests `config-bus-assignment.test.ts`). Not re-listed.
- `monitor-audit-2` (`22b5e1f1b`) — app/MCP/authz; F1/F7 rules **FIXED** (`monitor-fix-f1` @ `c0b2342a2`,
  see `firestore.rules:407-436`). Bridge remains the authoritative per-bus gate (`firestore-transport.ts:329-350`).
- `monitor-mcp-polish` (`62a287f06`) — app-side error-shape/bounds/`confidence:"queued"`. The "queued ≠
  confirmed" honesty there is the *symptom* of R1+B6; Part C2/C4 makes it actually confirmable.
- `monitor-state-staleness-guard` (`70357f47f`, current tip) — app-side `stateAgeSeconds`/`stateStale`.
  **KEEP** as defense-in-depth; C3 makes a healthy desk read fresh so the flag fires only on real failure.
- `monitor-f1-probe` (`b95715f13`) — live root-cause confirmation (read-of-own-write + idle-freeze +
  array→map). This audit confirms each at `file:line` (Part A) and **supersedes** the previously-open
  "F-1 write-drop vs state-sync — unresolved."
- `bridge-cleanup-fixes` (`e991d7b60`) — BR-02 keepalive (`x32-client.ts:215-260`, the trigger for R2),
  BR-01 engineer cache (`firestore-transport.ts:361-385`, verified correct + fail-closed), BR-05 app-side.
- `monitor-fix-br03` (`e41adbd30`) — auto-update mid-service gate (`main.ts:187-249`); unrelated to the
  state contract; verified present, no defect.
- The deployed `get_mix` throw (`PROGRAM-SPEC §8`) — coder-4's `safeArray` guard is a **consumer-side
  band-aid for R3**, not a bridge fix; keep it, but Part C removes the corruption that makes it necessary.

---

## Part E — Acceptance self-check (per P0-A1 §5)

- [x] R1/R2/R3 each confirmed with exact `file:line` evidence (Part A).
- [x] Every other defect/gap enumerated with evidence, each verified not assumed — including the prompt's
      named items: reconnect `/xremote` re-arm (**B1, hypothesis partially refuted with evidence**),
      startup `state_synced`-before-listener (**B2**), liveness-from-keepalive (**B3**), command
      timeout/obsolete/ordering (**B4/B5**), error handling (**B6/B11**), OSC encode/decode (**B8**;
      encode/decode of used addresses verified correct, bundle gap noted), two-instance "continue anyway"
      (**B10**).
- [x] Target state-contract is concrete + implementable without re-deriving intent: full-state vs delta
      (**C1, full-state**), query-after-command shape (**C2**), heartbeat cadence (**C3**), doc schema
      incl. `buses`-stays-array + light schema versioning (**C4**), write algorithm (**C5**).
- [x] Deduped against prior audits with SHAs (Part D); supersedes the open write-drop question.
- [x] No "TBD." No code/build (read-only, docs-only).
- [x] Open forks left for the Wave-1 synthesis gate (Daniel): exact latency targets;
      `STATE_HEARTBEAT_MS`/`FULL_REQUERY_MS` values; whether to ship the ack surface in Phase 1 or Phase 2.
