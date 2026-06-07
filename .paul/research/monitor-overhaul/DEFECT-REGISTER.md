# Monitor Overhaul — Phase 0 DEFECT REGISTER + Target State-Contract

**Author:** supervisor (synthesis of `AUDIT-bridge.md` P0-A1 / coder-1 + `AUDIT-consumers.md` P0-A2 / coder-5).
**Status:** Wave-1 audits auditor-ACCEPTed + torn down (`fac57af08`, `335dd7544`). This register + the
target-contract fork in §4 is the **Wave-1 synthesis gate** — ratify §4 with Daniel to unlock Wave 2.
**Baseline:** all `file:line` evidence is against `origin/master` (audits pinned `70357f47f`; current tip
`afac68dd9` adds only the get_mix down-payment). Repo is a shallow clone — no datedness claims.
**Parents:** `PROGRAM-SPEC.md`, `PHASE-0-PLAN.md`.

---

## 1. Root cause (one paragraph)

The monitor system has a **single architectural fault: the bridge's state-write contract.** Control works —
an iPad/MCP command reaches and applies on the X32 (live-desk proven, `monitor-f1-probe` `b95715f13`). The
**readback** is broken by three interlocking bridge bugs, and the consumers *amplify* the breakage because
there is no shared contract for reading `monitor-live/state`. Fixing only the write path (full-state writes +
query-after-command confirmation + a state heartbeat) closes all three at the root; everything else is
secondary hardening or a consumer-side adaptation to the same root.

---

## 2. Unified defect register

Severity: **R** = root (program-defining) · **HIGH/MED/LOW**. Plane: **B**ridge · **C**onsumer (iPad) ·
**M**CP · **R**ules. "Phase" = where it closes per PROGRAM-SPEC §5.

### 2a. Root bugs (the contract)

| ID | Sev | Plane | Title | Evidence | Closes in | Consumer face |
|----|-----|-------|-------|----------|-----------|---------------|
| **R1** | R | B | Read-of-own-write — bridge never confirms its own commands (X32 doesn't echo own writes; SETs are fire-and-forget; cache only updated by inbound echo) | `x32-client.ts:506-529` (SETs), `:341-436` (`routeParameterChange`, inbound-only), `firestore-transport.ts:283-316`/`:392-444` | **Phase 1** (query-after-command, C2) | C-2 |
| **R2** | R | B | BR-02 idle-freeze — no mixer-state heartbeat; idle `monitor-live/state.updatedAt` never advances | `index.ts:124,151-198` (60s timer writes `config/monitor` only), `firestore-transport.ts:447-457`; BR-02 removed the accidental 20s resync (`x32-client.ts:215-260`) | **Phase 1** (heartbeat, C3) | C-6 |
| **R3** | R | B | Array→map delta corruption — dot-path `update({"buses.N.fader":v})` converts `buses` ARRAY→MAP, drops siblings | `firestore-transport.ts:398/409/421/431/440` + flush `:159-164`; correct `.set()` initial write `:84-100` | **Phase 1** (full-state writes, C1) | C-4, MCP-D1, C-5/MCP-D2 |

### 2b. Bridge secondary (B1–B15)

| ID | Sev | Title | Evidence | Phase |
|----|-----|-------|----------|-------|
| B1 | LOW | Reconnect doesn't *explicitly* re-arm `/xremote` (hypothesis partially refuted — interval self-re-arms ≤8s; residual ≤8s miss window) | `x32-client.ts:294-302,206-208,244-259`; `index.ts:142-145` | 2 |
| B2 | LOW | Startup `state_synced` emitted before transport listener attaches (latent; compensated by `index.ts:124`) | `index.ts:116,121,122,124`; `firestore-transport.ts:447-450` | 1 (ordering in C5) |
| B3 | MED | Liveness derived from `/xinfo` keepalive, not state-freshness (observability root of R2) | `x32-client.ts:146,241-259`; `index.ts:181,185-189` | 1 (C5 liveness) / 2 |
| B4 | MED | `createdAt` is cross-machine wall-clock → skew breaks timeout + ordering | `server-monitor.ts:257`, `firestore.rules:411`, `firestore-transport.ts:258,269-280` | 2 |
| B5 | LOW | Command ordering / batch edge cases (rests on B4) | `firestore-transport.ts:210-238,273` | 2 |
| B6 | MED | Command results written to a read-`false` doc → no ack/confirmation surface | `firestore-transport.ts:253,259,322,464-482`; `firestore.rules:408` | 2 (= MCP-D3) |
| **B7** | HIGH | X32 mock ECHOES own-writes → CI can't catch R1 (test fidelity) | `x32-mock-server.ts:393-396,419-422,446-449,483-486,504-507` | **0 / Wave-2 P0-B1 target** |
| B8 | LOW-MED | OSC parser has no `#bundle` support (verify on hardware) | `x32-client.ts:66-107` | 2 |
| B9 | MED | `query()` keyed by address; concurrent queries/echoes collide (matters for C2) | `x32-client.ts:440-453,331-335` | 1 (C2 correlation) |
| B10 | LOW | `checkForRunningInstance` only warns; two bridges on different PCs both consume `pending` | `index.ts:64-71`, `config.ts:206-227` | 2 |
| B11 | MED | Sync silent-zero on query failure (fabricated 0/false; matrix-on defaults true) — no "unknown" sentinel | `x32-client.ts:471,553-562,582` | 1 (C4 confirmed-vs-unknown) |
| B12 | LOW-MED | Dead `lastSnapshot` reconciliation; relies on a full sync that R2 shows never comes | `firestore-transport.ts:44,152-157` | 1 (moot under full-state) |
| B13 | LOW | `clients`/`connectedClients` hardcoded 0 (misleads dashboards) | `index.ts:182,187`, `config.ts:177` | 2 |
| B14 | LOW | Version sentinel `"2.0.0"` only fixed on packaged path; headless still wrong | `index.ts:53`, `config.ts:178`, `main.ts:315-321` | 1 (C4 `bridgeVersion`) |
| B15 | LOW | `verifyToken` dead code (zero callers) — safe delete, shrinks auth surface | `config.ts:90-103` | 1/2 cleanup |

### 2c. Consumer (iPad) + MCP + Rules (C-1…C-12, MCP-D1…D4)

| ID | Sev | Status | Title | Evidence | Phase |
|----|-----|--------|-------|----------|-------|
| **C-1** | HIGH | OPEN (NEW) | Server `/monitor` gate keys `busAssignments` by `user.uid` not bus index → musician **denied at server, never loads UI** | `page.tsx:27,34-44`; client `use-monitor-access.ts:59-67` does it right (inconsistent) | **Standalone — fast-track (pre-/with Phase 1)** |
| **C-2** | HIGH | OPEN | Own fader move never confirmed from authoritative state; reverts on next snapshot (read-of-own-write UX) | `FaderStrip.tsx:29-52`, `VerticalFaderStrip.tsx:34-58`, `monitor-store.ts:148-156`, `MonitorClient.tsx:90-106` | 1 (needs R1 fix) + 3 (fader state machine) |
| C-3 | MED | OPEN | 2s safety snap-back fights optimistic UI; visible revert-then-reapply on slow round-trip | `FaderStrip.tsx:44-52` | 3 (resolved by C2) |
| **C-4** | HIGH | **partly FIXED** | 3 inconsistent corrupted-`buses` coercions: iPad `toArray` keeps survivors / MCP `safeArray` drops all / `get_mix` raw **threw** | `firestore-monitor-client.ts:98-106`; `monitor.ts:150-155/354-359` vs `:266`; `MonitorClient.tsx:196-211` | **get_mix throw FIXED `afac68dd9`**; root in 1; converge on 1 shared guard in 1/3 |
| **C-5** | HIGH | OPEN | MCP validation refuses writes/reads to an **owned** bus when corruption drops it from live-state (= MCP-D2) | `monitor.ts:426-445` (`preflightBusWrite`), `:266-276`; should use `getOwnedBuses`/`config.monitorBuses` `server-monitor.ts:158-170` | 1 (independent of bridge) |
| C-6 | MED | partly OPEN | Idle-staleness inconsistent (10s/90s/120s, 3 sources); `ConnectionIndicator` bridge-health prop **unfed** on main route; faders show frozen values, no cue; iPad ignores `stateStale` | `MonitorTabs.tsx:36-70`, `monitor.ts:90`, `ConnectionIndicator.tsx:14-30`; `MonitorClient.tsx:150/172/225` | 3 (consume `stateStale` uniformly; needs C3 heartbeat) |
| C-7 | MED | OPEN | Dual `myBusIndex` derivation race: `state.config.busAssignments` vs `config/monitor` can disagree | `monitor-store.ts:124-126` vs `:222-230` | 1 (C4 drops embedded `state.config`) |
| C-8 | LOW | OPEN (by design) | Stale-while-revalidate freezes last-good on empty snapshot — masks corruption | `monitor-store.ts:113-122` | 3 |
| C-9 | LOW | OPEN | `_lastCommandError` captured but never surfaced (no "command failed" UI) | `firestore-monitor-client.ts:303-311` | 2/3 (pairs with ack surface) |
| C-10 | — | DEDUPE | F2 producer side: `BusAssignmentPanel` writes the array form (`:67-69`) — bridge now array-aware `a5d35f47f`; verify agree | cross-ref lane2 F2 / BR-04 | verify in 1 |
| C-11 | LOW | DEDUPE (F8) | `!myBusIndex` treats bus index 0 as "no bus" | `MonitorClient.tsx:91/97/103`, `QuickMonitorPanel.tsx` | 3 |
| C-12 | NOTE | DEDUPE (F9) | No "user is dragging" suppression on snapshot apply → cross-device push can yank a drag | `monitor-store.ts:148-156` | 3 |
| MCP-D1 | HIGH | **FIXED `afac68dd9`** | `get_mix` threw on corrupted/non-array state (= C-4) | `monitor.ts:266` (now `safeArray`+try/catch) | done (down-payment) |
| MCP-D2 | HIGH | OPEN | Validation coupled to corrupted live-state, not owned-buses/config (= C-5) | `monitor.ts:426-445,266-276` | 1 |
| MCP-D3 | MED | OPEN | No readable command result → AI + UI blind to rejection (= B6/F4) | `monitor.ts:568,604,633`; `firestore.rules:408` | 2 (`get_command_status` R-1) |
| MCP-D4 | LOW | OPEN | No `assign_monitor_bus`/`unassign_monitor_bus` MCP tool (= lane2 F5) | UI has it (`BusAssignmentPanel`), MCP doesn't | 2/3 |
| F6 | LOW | OPEN (accepted) | `monitor-live/state` readable by no-access roles | `firestore.rules:385-388` | tighten to `isMember()` if roster exposure matters |

### 2d. Already FIXED — do not regress

BR-04/F2 getUserBus array-aware (`a5d35f47f`) · rules F1/F7 command-create hardening (`c0b2342a2`) · cowork
F-3…F-7 + R-2 `confidence:"queued"` (`62a287f06`) · staleness-guard `stateAgeSeconds`/`stateStale` fields
(`70357f47f`) · **get_mix `safeArray`+try/catch R3 down-payment (`afac68dd9`)**. Firestore-as-bus transport
affirmed correct for ≤6 iPads by both audits — **not** changing the transport.

---

## 3. Target state-contract (the Phase-1 spec — coder-1 Part C + coder-5 §8)

One-line: **replace the dot-path delta writer with a single throttled full-state `.set()`, add
query-after-command confirmation, add a state-write heartbeat.** Every primitive already exists in the bridge.

- **C1 — FULL-STATE WRITES.** Write the whole `MixerSnapshot` via `.set()` on every change (throttled
  ≤10/s, existing 100ms `STATE_WRITE_INTERVAL`); **delete** `scheduleDeltaWrite` + the dot-path `.update()`
  branch (`firestore-transport.ts:106-174`). Kills R3 at the root; `writeFullState` (`:84-100`) already
  exists — route all triggers through it. Cost = whole-doc per write ≈ few KB at ≤10/s = negligible on LAN.
- **C2 — QUERY-AFTER-COMMAND CONFIRMATION.** After `processCommand` applies a SET, `await query<Param>back`
  (`queryBusFader` `x32-client.ts:468-472`, etc.) → update cache → schedule full-state write. Debounce per
  `targetKey` ~50–100ms (one confirmed read per gesture). **Correlation fork** (B9): (a) latest-authoritative-
  value-wins [recommended, simplest] with a ~300ms timeout (no fabricated value on timeout — let the
  heartbeat reconcile) vs (b) per-address FIFO request/response queue. Kills R1 → resolves C-2/C-3.
- **C3 — TWO-TIER HEARTBEAT.** (i) cheap state-write heartbeat every **~10s** (`STATE_HEARTBEAT_MS`) — re-`.set()`
  cached snapshot, no X32 traffic, sits inside the 90s `STALE_STATE_THRESHOLD_SECONDS`; (ii) authoritative
  re-query resync every **~30s** (`FULL_REQUERY_MS`) + on reconnect/config-change. Restores (intentionally)
  the periodic resync BR-02 removed. Kills R2 → others'-change reflection + honest staleness.
- **C4 — SCHEMA.** Keep `buses` an **ARRAY** (canonical `MixerSnapshot.buses: BusInfo[]`; no map migration).
  Add `schemaVersion:1` + `bridgeVersion` + `stateSeq` (monotonic) for forward-compat + frozen-at-upgrade
  detection. **Stop embedding `config` in the state doc** (`firestore-transport.ts:89` — the stale
  `config.bridge.version:"2.0.0"` source; consumers read `config/monitor` directly). Reserve an ack surface
  `monitor-live/acks/{commandId}` (`{status:'applied'|'rejected'|'timeout', confirmedValue?, reason?, at}`,
  server-write/client-read, TTL-swept) → closes B6/MCP-D3, read target for Phase-2 `get_command_status`.
- **C5 — Liveness** derived from (socket-alive AND state-age < threshold), not socket chatter (B3).
- **Consumer requirements (coder-5 §8):** arrays-written-whole → consumers collapse `toArray`/`safeArray`/raw
  into **one** shared defensive read helper; iPad **consumes `stateStale`** uniformly (collapse 10s/90s/120s
  toward `state.updatedAt`); **MCP validates against owned-buses/config, not live-state** (C-5/MCP-D2, can land
  with Phase 1); **C-1 server-gate fix is standalone + early**; reserve the ack doc shape now.

---

## 4. ★ OPEN FORKS FOR DANIEL (the Wave-1 gate decision)

The audits converge so hard that the "one real fork" is essentially **ratify coder-1's proposed contract**
(§3). Sub-decisions, each with a supervisor recommendation:

1. **Full-state writes (C1)** — **RECOMMEND YES.** Strong rationale (kills R3 at root; negligible cost;
   Firestore has no array-element write anyway). This is the load-bearing ratify.
2. **Query-after-command correlation (C2)** — **RECOMMEND (a) latest-wins** + ~300ms timeout, no fabricated
   value. Simpler; (b) FIFO only if concurrent same-address collisions prove real in Wave-2.
3. **Heartbeat cadences (C3)** — **RECOMMEND** `STATE_HEARTBEAT_MS=10s` / `FULL_REQUERY_MS=30s` as Phase-1
   starting defaults (tunable from measured baselines).
4. **Ack surface (C4)** — **RECOMMEND reserve the doc shape in Phase 1, implement in Phase 2** with
   `get_command_status`. (Or pull into Phase 1 if you want command-failure UX sooner.)
5. **Schema fields (`schemaVersion`/`bridgeVersion`/`stateSeq`)** — **RECOMMEND include in Phase 1** (cheap).
6. **Latency targets (PROGRAM-SPEC §6)** — **RECOMMEND defer** to measured baselines from the Wave-2 live
   probe (readback isn't real until Phase 1).
7. **Harness home (`e2e/` vs `scripts/`)** — minor; **RECOMMEND** let the Wave-2 probe lane (coder-5) pick.
8. **C-1 server-gate bug** — **RECOMMEND fast-track** as a standalone consumer fix (disjoint from bridge;
   could run as a quick lane in parallel with Wave 2). It blocks the North Star user regardless of the contract.

**On ratify → I dispatch Wave 2** (per PHASE-0-PLAN): coder-1 = P0-B1 faithful X32 mock (B7 target: own-writes
silent to sender + `/xremote` model + a red test reproducing R1), coder-5 = P0-B2 live query-after-write probe.
Optionally a parallel C-1 fast-fix lane.

---

## 5. Phase map (what each phase closes)

- **Phase 0 (this) — DONE pending §4 ratify:** audits + register + contract; Wave-2 harness next.
  Down-payments already shipped: get_mix R3 guard (`afac68dd9`), staleness flag (`70357f47f`).
- **Phase 1 — core control loop:** R1, R2, R3 (C1/C2/C3/C4 contract) + MCP validate-vs-owned-buses (C-5) +
  schema/version fields + B2/B11/B12/B14/B15 fold-ins + C-7. → iPad round-trip becomes correct.
- **Phase 2 — robustness/observability:** B3 (state-freshness liveness), B4/B5 (clock/ordering), B6/MCP-D3
  (`get_command_status` ack), B9 (correlation hardening), B10, B13, F3 (queue growth), MCP-D4, C-9.
- **Phase 3 — iPad UX (North Star):** C-2 fader state machine (optimistic→confirmed→reverted), C-3, C-6
  (uniform staleness cues + wire `DisconnectedOverlay`), C-8, C-11, C-12, one shared read guard.
- **Phase 4 — hardening + green:** multi-iPad soak, WiFi-blip, perf, B8 hardware verify, runbook, standing
  live-regression suite, green vs PROGRAM-SPEC §6.

---

## 6. Provenance
- `AUDIT-bridge.md` (P0-A1, coder-1, `fac57af08`) — R1-R3 + B1-B15 + Part C contract. Auditor ACCEPT 20:49Z.
- `AUDIT-consumers.md` (P0-A2, coder-5, `335dd7544`) — C-1…C-12 + MCP-D1…D4 + §8 consumer reqs. Auditor ACCEPT 20:49Z.
- Live note: at synthesis time `monitor-live/state` had degraded to 0 buses (R3 actively producing the
  corrupted shape); `get_mix` now degrades gracefully (`invalid_bus_index`) not a throw — confirms the
  down-payment + the urgency of the Phase-1 root-fix.
