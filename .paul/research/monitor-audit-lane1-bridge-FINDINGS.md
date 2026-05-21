# Monitor Audit — Lane 1: Bridge, Transport & X32 control plane

**Scope:** the device/LAN half of the monitor-mix system — `bridge/**`, the
Firestore message-bus mechanics (consumer side), and the X32 OSC layer. READ-ONLY
analysis at `origin/master` `b7b5bb4d8` (worktree `sheet-music-app-monitor-audit-1`,
branch `feat/monitor-audit-1-bridge`). Companion migration is dead and out of scope.

**Seam:** Lane 2 owns producers (MCP tools, iPad UI), `firestore.rules`, and the
cross-layer authz **verdict**. This lane supplies the bridge-side facts (incl. the
`isCommandAuthorized` behavior) and owns the end-to-end latency budget. Where a
finding straddles the seam it is marked `[SEAM]` and the verdict deferred to Lane 2.

---

## TL;DR

**Transport verdict: the architecture is the *right* call for this context; the
implementation has real, fixable correctness/efficiency/ops bugs.** "Firestore as the
message bus between a cloud app and a LAN device" is not a hack — it is the best-fit
choice for *this* deployment (one synagogue, ~16 shared iPads, weekly use, solo
maintainer, serverless/Vercel shop, X32 on LAN). Its decisive property is that the
bridge makes **only outbound** connections: no inbound firewall, no NAT traversal, no
TLS-cert-trust dance on 16 iPads — which is exactly what killed the original WebSocket
design. Don't rip it out.

**But three things are wrong right now, in priority order:**

1. **`BR-04` [CRITICAL, correctness/SEAM] — non-engineer musicians cannot move their
   faders.** The engineer-facing assignment UI writes `busAssignments[bus]` as an
   **array** (`BusAssignmentPanel.tsx:69`), but the bridge's `getUserBus`
   (`config.ts:117-124`) only understands the single-object shape, so it returns
   `null` for everyone assigned that way → `isCommandAuthorized` rejects their commands
   as "Unauthorized." Only `admin`/`soundEngineer` can actually drive the X32. The
   `npm run check:types` guard *flagged this exact drift* and it was downgraded to a
   non-failing warning (`BR-19`).
2. **`BR-01` [HIGH, efficiency/latency] — a `users/{uid}` Firestore read on every
   single command.** `isCommandAuthorized` (`firestore-transport.ts:329`) does a fresh
   admin read of the user doc for *every fader tick*. That is the dominant avoidable
   latency in the command path **and** the dominant Firestore-op cost under load.
3. **`BR-03` [HIGH, ops] — auto-update can restart the bridge mid-service.**
   `electron-updater` is `autoDownload=true` + installs and relaunches 3 s after any
   GitHub release lands (`main.ts:171-195`), with no maintenance-window guard. A
   release published Friday evening freezes everyone's monitor mix.

Plus a large **documentation/architecture drift** (`BR-05`, `BR-20`): the `README.md`
and `SETUP_GUIDE.md` still describe a WebSocket + Docker + Windows-service + HTTP-API
product that the code abandoned — and one drifted surface is a *live broken feature*
(the admin "Scan for X32" button calls an HTTP endpoint that no longer exists).

---

## Architecture verdict (Q8) — is Firestore-as-bus right for *this* context?

**Yes — keep it. It is well-matched, not "just made to work." The single
architectural refinement worth genuinely considering is moving the *hot path* to
Firebase Realtime Database; everything else is fix-the-implementation.**

### Why Firestore-as-bus is the right fit here

The job: a cloud-hosted (Vercel) web app must control a mixer that lives on a private
LAN, from ~16 iPads also on that LAN, with one part-time maintainer and a hard "no
local dev / deploy-to-prod" workflow.

- **Outbound-only is the whole game.** The bridge dials *out* to Firestore; nothing
  dials *in* to the bridge. No port-forwarding, no inbound firewall rule, no public
  IP, no NAT traversal, no Cloudflare tunnel, nothing internet-exposed. The original
  WSS design (`README.md` architecture diagram, `SETUP_GUIDE.md`) required the bridge
  to be a *server* iPads connect to — which on an `https://` app forces `wss://`
  (browsers block mixed-content `ws://` from a secure page), which forces a TLS cert,
  which on a LAN IP means a self-signed cert trusted manually on every one of 16
  shared iPads. That is the pain the team correctly fled. Firestore erases it.
- **Zero iPad configuration.** iPads already hold an authenticated Firestore
  connection for the rest of the app; the monitor transport reuses it
  (`firestore-monitor-client.ts:11`). New iPad = sign in = done. For 16 shared
  devices this is the difference between "works" and "unmaintainable."
- **Auth is already solved.** Firebase Auth identity flows to both ends; the bridge
  can enforce server-side with the Admin SDK (it does, modulo `BR-04`).
- **Survives DHCP churn.** No fixed bridge URL the iPads must reach.
- **Solo-maintainer fit.** One managed dependency (Firestore) vs. a WSS server +
  cert rotation + a relay/broker to babysit.

### Honest cons (all immaterial at this scale, but real)

- **Latency floor ~150–400 ms per Firestore push hop** (see budget below). Firestore
  listeners are not a soft-realtime bus; you cannot engineer below this.
- **Write amplification / cost.** Every fader tick = a command-doc create + delete +
  a state-delta write + (today) a user-doc read. Hundreds of ops/sec during active
  mixing. Still pennies at weekly ~16-iPad scale, but architecturally wasteful.
- **A document DB pressed into a message-bus role** — the `monitor-live/state` doc is
  a single hot document rewritten up to 10×/s; `commands/pending` is a constantly
  churned collection.

### Alternatives, sized to this context

| Option | Latency | Ops/maintenance fit | Verdict |
|---|---|---|---|
| **Direct WSS (the abandoned design)** | ~20–50 ms (LAN) | **Bad** — cert-trust on 16 iPads, mixed-content forces wss, bridge must be reachable | Worse here. The latency win doesn't pay for the cert/onboarding tax. |
| **Self-hosted cloud WS relay / MQTT broker** | ~50–150 ms | **Bad** — adds a server/broker to run 24/7; contradicts the serverless/solo-maintainer model | Not worth it for weekly use. |
| **Bitfocus Companion** | n/a | rejected (confirmed obsolete) | Dead. |
| **Firebase Realtime Database (RTDB) for the hot path** | **lower than Firestore** for frequent small writes; purpose-built for live state/presence | **Same deployment wins** (outbound-only, zero iPad config, reuse Firebase auth) with a model designed for exactly this | **The one refinement worth costing.** Keep config in Firestore; move `monitor-live/state` + `commands` to RTDB. Tradeoff: a second Firebase product, rules in two places, a migration. |

**Bottom line for Daniel:** the *transport choice* is correct and defensible — leave
it. The depth problems are in the *implementation* (`BR-01`…`BR-13`) and in the
*documentation* (`BR-05`, `BR-20`). If you ever want materially lower latency without
losing the deployment properties you depend on, RTDB for the hot path is the only
move that qualifies — and even then it's an optimization, not a fix.

---

## Latency budget (Q2)

Analytical budget (live numbers need the prod-PC probe — see FACTS-vs-INFERENCES).
Assumes iPads + bridge on synagogue WiFi, Firestore in a single US region.

**Command path — iPad fader move → X32:**

| Stage | Est. | Source |
|---|---|---|
| Client throttle/coalesce | 0–50 ms | `firestore-monitor-client.ts:35` `COMMAND_THROTTLE_MS=50` |
| `addDoc` → Firestore write ack | ~30–150 ms | client RTT to Firestore region |
| Firestore → bridge `onSnapshot` push | ~100–400 ms | `firestore-transport.ts:173` listener push latency |
| Bridge batch window | 0–20 ms | `COMMAND_BATCH_WINDOW=20` (`:54`) |
| **`isCommandAuthorized` user-doc read** | **+30–150 ms** | `firestore-transport.ts:329` — *avoidable serial round-trip* (`BR-01`) |
| OSC encode + UDP send (LAN) | <5 ms | `x32-client.ts:287-290` |
| **Total** | **~165–675 ms; median ~250–500 ms** | |

**Return path — X32 change → iPad:**

| Stage | Est. | Source |
|---|---|---|
| X32 echo → bridge socket (LAN) | <5 ms | `x32-client.ts:142` |
| route + emit | <1 ms | `x32-client.ts:306` |
| State throttle | 0–100 ms | `STATE_WRITE_INTERVAL=100` (`:46`) |
| Delta `update()` → Firestore ack | ~30–150 ms | `firestore-transport.ts:152` |
| Firestore → client `onSnapshot` push | ~100–400 ms | `firestore-monitor-client.ts:77` |
| Client snapshot debounce | 0–150 ms (first immediate) | `SNAPSHOT_DEBOUNCE_MS=150` (`:39`) |
| **Total** | **~135–805 ms; median ~300–500 ms** | |

**Where the floor is:** two Firestore push hops (~100–400 ms each) dominate and are
irreducible with Firestore listeners. The person dragging their *own* fader does **not**
feel this — the client UI is optimistic (it moves its own fader locally and sends the
command async). The latency is felt on **cross-device reconciliation** (engineer nudges
your bus; you see it ~0.3–0.8 s later) and on **X32-originated changes**. That is
**acceptable for personal IEM tweaks** (the actual use case) and **marginal for live
fader rides**. `BR-01`'s per-command user read adds ~30–150 ms of pure waste on top.

---

## Findings

Severity: CRITICAL / HIGH / MED / LOW / NOTE. Class: **correctness-bug** /
**architecture** / **polish**. All line refs are at `b7b5bb4d8`.

### CRITICAL

#### BR-04 — Non-engineer musicians are locked out: bridge mis-reads array bus assignments  `[correctness] [SEAM]`
- **Evidence (producer):** `src/components/monitor/BusAssignmentPanel.tsx:67-73` —
  `saveAssignments(busIdx, assignments: BusAssignment[])` writes
  `newAssignments[String(busIdx)] = assignments.length > 0 ? assignments : null`, i.e.
  an **array** of `{userId,userName}`. This is the engineer-facing "assign musicians to
  buses" UI (README v2.0.0 feature).
- **Evidence (consumer / bridge):** `bridge/src/config.ts:117-124` `getUserBus(uid)`
  iterates `Object.entries(this.config.busAssignments)` and tests
  `assignment && assignment.userId === uid`. When `assignment` is an **array**,
  `assignment.userId` is `undefined`, so no bus ever matches → returns `null`.
- **Failure path:** `firestore-transport.ts:344-345` —
  `return isEngineer || userBus === cmd.busIndex`. With `userBus === null`, a regular
  musician's fader command resolves to `false` → `firestore-transport.ts:243` logs
  "Unauthorized" and the command is dropped. Only `role==='admin'` /
  `soundEngineer===true` users can move faders. Combined with `BR-15` (no error path),
  the musician sees the fader snap back and gets no explanation.
- **Why it slipped:** the bridge type mirror (`bridge/src/types.ts:15`) declares
  `Record<string, BusAssignment | null>` — it is **missing the `BusAssignment[]`
  variant** that the canonical `src/types/monitor.ts:15` has. `npm run check:types`
  detected the drift but the result is a warning (exit 0), so nothing failed
  (`BR-19`). The guardrail fired and was muted; the muted warning hid a
  feature-breaking bug.
- **Fix direction (bridge-side, recommendation only):** `getUserBus` must normalize
  both shapes — `const list = Array.isArray(a) ? a : a ? [a] : []; list.some(x =>
  x.userId === uid)`. Re-sync the type mirror. **Lane 2 owns the cross-layer authz
  verdict** (whether the canonical shape should even be a union, and whether
  `firestore.rules` enforces consistently); this lane supplies the bridge-side fact.
- **Confirm in prod (FACT-vs-INFERENCE):** code-certain. Real-world impact depends on
  whether a non-engineer has *ever* successfully driven a fader in prod — if the
  feature has only been exercised by admins/engineers, the bug is latent-in-practice
  but still blocks the feature's primary users (per-musician IEM is the entire point).

### HIGH

#### BR-01 — `users/{uid}` Firestore read on every command  `[architecture/efficiency]`
- **Evidence:** `firestore-transport.ts:241` calls `isCommandAuthorized` per command;
  `:329` does `await this.db.collection("users").doc(cmd.uid).get()` every time.
- **Impact:** (a) **latency** — an extra serial Firestore round-trip (~30–150 ms) in
  the command path (see budget); (b) **cost/amplification** — at 16 musicians dragging
  faders (client throttle 50 ms ⇒ up to ~20 cmd/s each ⇒ ~320 cmd/s) that's ~320
  user-doc reads/s on top of ~320 command writes + ~320 deletes + state deltas.
- **Fix direction:** cache user role/engineer status in-memory with a short TTL (the
  `config` watcher already streams `busAssignments`; role/`soundEngineer` rarely
  change). Or fold the per-user authz facts into the already-watched `config/monitor`
  doc so no per-command read is needed. Recommendation only.

#### BR-02 — Health-check false-disconnect on an idle X32 → reconnect + full resync  `[correctness/reliability]`
- **Evidence:** `x32-client.ts:209-225` marks the mixer disconnected when
  `Date.now() - lastMessageAt > 20000`; `lastMessageAt` is updated only on *received*
  OSC traffic (`:145`). `/xremote` is sent every 8 s (`:201-203`) but the X32 does
  **not** echo `/xremote` (confirmed by the mock, `x32-mock-server.ts:9,355-358`).
  The code comment at `:216` claims "X32 sends /xremote responses every 8s" — which
  contradicts the mock and, if false, means a quiet console (no fader/param activity)
  produces *no* inbound traffic.
- **Failure path:** idle room → 20 s of silence → `emit("disconnected")` +
  `attemptReconnect()` → reconnect sends `/xinfo` (which *does* respond) → immediate
  "reconnect" → `main.ts:142` `syncFullState()` re-queries 32 channel names + every
  monitor bus × 32 sends + 6 matrices and rewrites the whole state doc. So an idle
  bridge thrashes a heavy full-resync roughly every ~20 s for no reason.
- **Fix direction:** don't infer liveness from incidental param traffic. Send a
  periodic `/xinfo` (or `/status`) *query* as an explicit keepalive and base the
  health check on its response; only then is silence meaningful. Recommendation only.
- **Probe required:** confirm on the prod PC whether a truly idle X32 emits anything
  within 20 s. If not, this is firing in production today.

#### BR-03 — Auto-update installs + relaunches mid-service  `[ops]`
- **Evidence:** `main.ts:171-195` — `autoUpdater.autoDownload = true`,
  `autoInstallOnAppQuit = true`, and on `update-downloaded` it calls
  `quitAndInstall(true, true)` after a 3 s delay. No check for "is a service running
  right now."
- **Impact:** publishing a GitHub release (the publish target, `package.json:53-57`)
  at any time causes every running bridge to download, quit, and relaunch ~3 s later —
  freezing all monitor mixes during the restart + the subsequent full resync. CRC
  services are Friday evening / Shabbat morning ([[project_shul_cadence]]); an
  ill-timed release is a live outage.
- **Fix direction:** gate install to a maintenance window / manual "Install update"
  action (the IPC handler `install-update` at `main.ts:342` already exists — prefer it
  over auto-relaunch), or suppress auto-install while the X32 is connected + commands
  are flowing. Recommendation only.

#### BR-05 — Admin "Scan for X32" calls a removed HTTP API (dead feature)  `[architecture/correctness] [SEAM]`
- **Evidence:** `src/components/admin/SoundSystemSection.tsx:100-145` parses the
  `bridgeUrl` and `fetch(`${apiProto}://${host}:${apiPort}/scan`)`. The current bridge
  (`bridge/src/index.ts`) starts **no HTTP server** — the WS/HTTP server was removed
  when `firestore-transport.ts` replaced it ("Replaces the WebSocket server
  entirely", `:5`). The published `bridgeUrl` is now `firestore://<ip>`
  (`main.ts:131`), which the scan URL parser (`new URL(bridgeUrl)` + port math) cannot
  turn into a working HTTP endpoint. The admin placeholder still shows
  `wss://192.168.1.50:9001` (`SoundSystemSection.tsx:281`, `MonitorSetupWizard.tsx:78`).
- **Impact:** the Setup Wizard's "scan" step errors out. The X32 is auto-discovered on
  bridge startup anyway (`x32-client.ts:566 discover()`), so the manual scan is
  redundant — but it's still presented and broken. **Lane 2 owns the UI fix verdict;**
  this lane supplies the bridge-side fact that no HTTP `/scan` exists.

### MED

#### BR-06 — Client wall-clock `createdAt` drives all bridge time logic  `[correctness]`
- **Evidence:** producer writes `createdAt: Date.now()` on the **iPad** client
  (`firestore-monitor-client.ts:302`). The bridge then uses that value for: the 10 s
  stale-discard (`firestore-transport.ts:249`), the obsolete-by-timestamp discard
  (`:264` `cmd.createdAt < lastCmdTime`), and the 30 s cleanup query
  (`:433` `where("createdAt","<",Date.now()-30000)`).
- **Failure paths:** (a) **bridge-vs-client skew** — if an iPad clock runs >10 s fast,
  *every* command it sends is instantly "Timeout"-discarded; if >10 s slow, its stale
  commands never expire and the 30 s cleanup misses them. (b) **client-vs-client skew**
  — when two devices target the same key (a musician + an engineer on the same bus, or
  two engineers on a matrix), the obsolete-discard compares two different wall clocks,
  so a genuinely-newer command can be dropped as "obsolete." iPads are usually
  NTP-synced so this is narrow, but it's a latent correctness landmine with no
  detection.
- **Fix direction:** stamp authority on the server — Firestore `serverTimestamp()` for
  ordering/expiry, or derive freshness from the doc's create time, not a client field.
  (Note: `serverTimestamp` is write-time only; for ordering you'd read it back, which
  the current "added"-only listener already gets.) Recommendation only.

#### BR-07 — `processCommandBatch` reentrancy over shared dedup state  `[correctness/concurrency]`
- **Evidence:** `firestore-transport.ts:201-229`. The method sets
  `this.commandBatchTimer = null` (`:202`) *before* its `await`s. A command arriving
  mid-flight (`queueCommand`, `:196`) sees the null timer and schedules a new one, so a
  **second** `processCommandBatch` can begin while the first is still awaiting its
  per-command `users/{uid}` reads + batch commit. Both run against the shared mutable
  `latestCommandTimestamps` map (`:50`) and both hold separate `db.batch()` handles.
- **Impact:** weakens the chronological-ordering guarantee the sort at `:209` is trying
  to provide, and the obsolete-discard map can be read/written by two interleaved
  async flows. Blast radius is small (fader sets are idempotent), but the ordering
  intent is not actually honored under load.
- **Fix direction:** a single in-flight guard (process-one-batch-at-a-time, re-arm the
  timer only after the awaited batch resolves). Recommendation only.

#### BR-08 — Reconnect leaks `raw_message` listeners on every failed attempt  `[reliability]`
- **Evidence:** `x32-client.ts:247-257` (and the same shape in `connect()`,
  `:167-177`). Each reconnect attempt does `this.once("raw_message", handler)` with a
  5 s timeout; on timeout the promise resolves `false` but the handler is **never
  removed**. Backoff caps at 60 s (`:128`), so ~1 attempt/min during an outage.
- **Impact:** over a multi-minute X32 outage, leaked handlers accumulate; every future
  OSC message (`emit("raw_message")`, `:293`) runs all of them. >10 ⇒
  `MaxListenersExceededWarning`; long outage ⇒ slow memory/CPU creep, and a late
  `/xinfo` can fire a stale (already-settled) handler.
- **Fix direction:** `this.off("raw_message", handler)` in the timeout branch (or use
  an `AbortController`/one-shot wrapper that always detaches). Recommendation only.

#### BR-09 — Delta dot-paths keyed by array index race with config resync  `[correctness]`
- **Evidence:** state deltas use positional paths like `buses.${arrayIndex}.fader`
  (`firestore-transport.ts:362,373,385,395,406`) where `arrayIndex` is resolved by
  `findIndex(b => b.index === busIndex)` at event time. The array order is set by the
  `monitorBuses` config; a config change triggers a full `syncFullState`
  (`main.ts:204-213`).
- **Impact:** if `monitorBuses` is reordered/resized in the admin UI, there is a window
  where an in-flight delta written against the *old* array order lands on the *new*
  index → a fader value written to the wrong bus until the resync `.set()` corrects it.
  Narrow window, but it's silent while it lasts.
- **Fix direction:** key state by stable bus index (a map keyed by `index`) rather than
  array position, or suppress deltas during a resync. Recommendation only.

#### BR-10 — No real single-instance lock across deploy mechanisms  `[ops/SPOF]`
- **Evidence:** `main.ts:63-71` `checkForRunningInstance()` only **warns** ("Continuing
  anyway — this instance will take over") with no Firestore lease/lock; `config.ts:194`
  just reads the last heartbeat age. Electron's `requestSingleInstanceLock()`
  (`main.ts:21`) guards only against a second copy of the *same* app, not against a
  leftover Docker container / Windows service / `npm start` also running.
- **Impact:** two bridges both listen on `commands/pending` and both write
  `monitor-live/state` → double OSC sends to the X32 + dueling state writes. Given the
  doc drift (`BR-20`) tells operators to install a Windows service *and* the code ships
  an Electron auto-start app, running both at once is plausible.
- **Fix direction:** a real Firestore lease (compare-and-set an owner token + TTL) so a
  second instance refuses to start. Recommendation only.

#### BR-11 — Thin observability; `clients` is hardcoded 0  `[observability]`
- **Evidence:** the only telemetry surfaced is `bridge.{lastSeen,status,x32Connected,
  clients,localIp,version}` (`config.ts:153-176`). `connectedClients`/`clients` is
  hardcoded `0` (`main.ts:182,188`) because the Firestore transport has no notion of
  connected clients — so the admin "connected clients" reads a permanent 0.
- **Impact:** for a remote solo maintainer, there is no signal for command throughput,
  rejected/Unauthorized counts, X32 reconnect count, or last-command-processed time —
  the things you'd need to diagnose `BR-02`/`BR-04`/`BR-06` in the field.
- **Fix direction:** publish lightweight counters (commands processed/rejected,
  reconnects, last-command ts) to the heartbeat doc; drop or repurpose `clients`.
  Recommendation only.

#### BR-12 — Vestigial `bridgeUrl` + DHCP-guard machinery  `[architecture/polish]`
- **Evidence:** `main.ts:127-178` detects the LAN IP, publishes
  `firestore://<ip>`, and re-publishes it on wake + on every IP change. Nothing
  connects to that URL anymore (iPads use Firestore directly); the admin UI still
  treats `bridgeUrl` as a `wss://` endpoint (`BR-05`). ~50 lines maintaining a field
  whose only remaining consumers are confused.
- **Fix direction:** retire `bridgeUrl` (or repurpose it as a human-readable "bridge
  located at <ip>" status string) and delete the DHCP-guard re-publish path.
  Recommendation only; coordinate with Lane 2 (UI consumer).

#### BR-13 — Full-admin service-account key on disk; ties to deferred CRIT-003  `[security/credentials] [SEAM]`
- **Evidence:** the bridge authenticates with a Firebase **Admin** service-account key
  stored plaintext next to the exe (`main.ts:316` writes `service-account-key.json`;
  `config.ts:28-39` loads it via `FIREBASE_SA_KEY_PATH`). The key is full-project
  admin, never rotated, downloaded once via the setup-code flow (`main.ts:297-339`).
- **Impact:** a physically-accessible studio PC holds an unscoped admin credential.
  The bridge only needs: read `config/monitor` + `users/{uid}` role, read/write
  `monitor-live/*`. This is the long-deferred **CRIT-003 bridge-credentials design**
  (memory). This audit is the right moment to reopen it as a scoped-credential
  question (custom token / least-privilege SA / signed short-lived creds).
- **Fix direction:** least-privilege credential scoped to the monitor collections +
  users-read; rotateable. Recommendation only; surface to Daniel as the CRIT-003
  decision checkpoint.

### LOW / NOTE

- **BR-14 [LOW, polish]** Dead `lastSnapshot` field + empty `if (this.lastSnapshot)`
  block with only comments. `firestore-transport.ts:44,144-148`. Delete.
- **BR-15 [LOW, correctness]** Rejected commands (Unauthorized/Timeout/error) write an
  `error` field onto the command doc (`:244,250,313`) that the client never reads — the
  iPad gets no feedback; the fader silently snaps back on the next state sync. No
  user-facing rejection path. Relevant to `BR-04` UX.
- **BR-16 [LOW, polish]** Unused deps remain after the WS removal: `ws`, `selfsigned`,
  `@types/ws`, `@types/selfsigned` (`bridge/package.json:13-19`). Prune.
- **BR-17 [LOW, reliability]** `cleanupStaleCommands` is `limit(50)` per 60 s heartbeat
  (`firestore-transport.ts:431-435`); a large post-outage backlog drains slowly.
- **BR-18 [NOTE]** On bridge restart the `onSnapshot` initial event replays all pending
  docs as `"added"` (`:177-182`) → reprocessing; mostly absorbed by the stale/obsolete
  guards and harmless because OSC sets are idempotent. Worth knowing, not fixing.
- **BR-19 [NOTE]** `npm run check:types` (`scripts/check-types-sync.js`) reports the
  monitor-type drift as a **warning with exit 0** (documented in
  `.paul/phases/v60-01-.../v60-01-01-SUMMARY.md:177`). The guardrail does not fail
  CI/build, which is why `BR-04`'s drift persisted. Consider making it fail.
- **BR-20 [NOTE, maintainability]** Major doc drift: `bridge/README.md` +
  `bridge/SETUP_GUIDE.md` describe WebSocket transport, ports 9000/9001, an HTTP API
  (`/health`,`/status`,`/scan`), Docker `network_mode: host`, and a node-windows
  service installed via `npm run install-service` / `npm run build-exe`. **None exist**
  in the current code: there is no HTTP server, no WS server, no `launcher.ts`/
  `ws-server.ts`/`scripts/` (the README "File Structure" lists files that aren't in the
  tree), and `package.json` scripts are only `build/start/dev/dist` — so
  `npm run install-service` / `build-exe` fail outright. The real product is an
  Electron tray app (`main.ts`) with `electron-updater` auto-update + Windows
  login-item auto-start, deployed as an NSIS one-click exe. An operator following the
  current docs cannot deploy it. High onboarding hazard for a solo-maintainer setup.

---

## Recommendations (prioritized; recommendations only — no implementation)

### Fix now (correctness)
1. **BR-04** — normalize array+object bus assignments in `getUserBus`; re-sync the
   bridge type mirror. *Unblocks the core feature for non-engineers.* (effort: S /
   impact: CRITICAL) — coordinate the authz verdict with Lane 2.
2. **BR-02** — replace the traffic-inferred health check with an explicit `/xinfo`
   keepalive + response-based liveness. *Stops idle-room resync thrash.* (S / HIGH) —
   probe prod first.
3. **BR-06** — move command ordering/expiry off the client wall clock onto a
   server-authoritative timestamp. (S–M / MED-but-insidious)
4. **BR-08** — detach the leaked `raw_message` handler on reconnect timeout. (S / MED)
5. **BR-07** — serialize `processCommandBatch` (one in-flight at a time). (S / MED)
6. **BR-09** — key state deltas by stable bus index, not array position. (M / MED)

### Fix soon (ops / efficiency)
7. **BR-01** — cache user role/engineer status; stop the per-command user-doc read.
   (S–M / HIGH for latency+cost)
8. **BR-03** — gate auto-update to a maintenance window / manual install. (S / HIGH ops)
9. **BR-10** — real Firestore single-instance lease. (M / MED)
10. **BR-11** — publish real counters; drop the always-0 `clients`. (S / MED)

### Consider (architecture / decisions for Daniel)
11. **RTDB for the hot path** — the only "materially better" transport move that keeps
    every deployment property. Optimization, not a fix. (L / situational)
12. **BR-13 / CRIT-003** — scoped least-privilege bridge credential. Reopen the
    deferred decision. (M / security)
13. **BR-12** — retire the vestigial `bridgeUrl`/DHCP-guard path. (S / cleanup)

### Polish
14. **BR-20 + BR-05** — rewrite `README.md`/`SETUP_GUIDE.md` to the actual Electron +
    Firestore architecture; fix or remove the dead admin "Scan" button. (M / docs)
15. **BR-19** make `check:types` fail; **BR-14** delete dead `lastSnapshot`;
    **BR-16** prune unused deps; **BR-15** add a client-visible rejection path;
    **BR-17** raise/loop the cleanup limit.

---

## FACTS vs INFERENCES & prod-PC probe list

**Facts (code-certain at `b7b5bb4d8`):** BR-01, BR-04 (both shapes confirmed in
source), BR-05 (no HTTP server in `index.ts`), BR-06 (`createdAt: Date.now()` at
`firestore-monitor-client.ts:302`), BR-07, BR-08, BR-09, BR-11 (`clients` hardcoded 0),
BR-12, BR-13, BR-14, BR-16, BR-19 (warning documented), BR-20 (files absent in tree).

**Inferences needing the prod-PC live probe:**
- **BR-02 (highest priority):** does a truly idle X32 emit *any* OSC within 20 s? If
  not, the false-disconnect resync thrash is live in production. Probe: connect bridge
  to the real X32, leave the room untouched, watch logs for `disconnected`/`Reconnected`
  cycling.
- **Latency budget:** measured Firestore push latency (both hops) on the synagogue's
  actual network + Firestore region. The ranges above are analytical.
- **BR-04 real-world impact:** has a non-engineer ever successfully moved a fader in
  prod, or has the feature only been used by admins/engineers? Determines
  live-vs-latent-in-practice (bug is code-certain regardless).
- **BR-01 cost:** actual Firestore op volume during a real service (read the usage
  dashboard after a Shabbat-morning service with active mixing).
- **Two-instance check (BR-10):** confirm only one bridge mechanism is actually
  installed on the prod PC (Electron app vs. any leftover service/Docker).

---

*Lane monitor-audit-1 · coder-1 · READ-ONLY · base `b7b5bb4d8` · seam-respecting:
authz verdict + UI fixes deferred to Lane 2.*
