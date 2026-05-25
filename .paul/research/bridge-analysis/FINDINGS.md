# Bridge Analysis — FINDINGS

**Lane:** `bridge-analysis` (Tier-0 research; no code changes)
**Coder:** coder-6
**Date:** 2026-05-25T20:00–22:00Z
**Base SHA:** `de1d96a34` (origin/master; bridge/ identical to dispatch-time `f7c23e3c3`)
**Method:** read all `bridge/**` source (9 files / ~3.5k LOC + 14 test files / ~2.6k LOC + `bridge/ui/index.html` + `bridge/{README,SETUP_GUIDE,Dockerfile,docker-compose.yml,package.json}`); cross-reference `src/lib/mcp/tools/bridge-recovery.ts` + `src/app/api/bridge/setup-code/route.ts`; verify against prior research (`bridge-recon-FINDINGS.md`, `bridge-update-ux-FINDINGS.md`, `monitor-audit-lane1-bridge-FINDINGS.md`, `monitor-stress-v1004/REPORT.md`, `monitor-overhaul/AUDIT-{bridge,consumers}.md`) and the memory entries `[[project_bridge_release_build]]` / `[[project_bridge_update_ops]]` / `[[project_bridge_state_freshness_diagnostic]]` / `[[project_monitor_live_probe]]`. **ZERO `src/` + ZERO `bridge/` content changes.** Single doc commit at ship.

---

## §1 Architecture map (1-page)

```
                ┌──────────────────────────────────────────────────────────┐
                │  Production PC (studio) — Electron tray app, single box  │
                │                                                          │
   ┌────────┐   │   ┌─────────────────────────────────────────────────┐    │
   │ Tray   │◀──┤   │  main.ts — Electron entry (536 LOC)             │    │
   │ menu / │   │   │  - BrowserWindow + Tray icon, hidden by default │    │
   │ window │   │   │  - SingleInstanceLock (gotTheLock guard)        │    │
   │ + IPC  │   │   │  - Auto-start at Windows login (packaged only)  │    │
   └────────┘   │   │  - Credential discovery: userData → exeDir fb   │    │
                │   │  - Setup-code IPC (POST /api/bridge/setup-code) │    │
                │   │  - Crash guards: uncaughtException + unhandled  │    │
                │   │  - electron-updater w/ BR-03 idle-defer install │    │
                │   │  - Self-migrate creds: exeDir → userData (v10)  │    │
                │   └────────┬────────────────────────────────────────┘    │
                │            ▼ setRestartHandler() injection              │
                │   ┌─────────────────────────────────────────────────┐    │
                │   │  index.ts — bridge entry (459 LOC)              │    │
                │   │  - Wraps console.error/warn → RemoteLogger      │    │
                │   │  - Boot order: load cfg → discover X32 →        │    │
                │   │    acquire lease → start transport → sync       │    │
                │   │    state → publish IP → start heartbeat (60s)   │    │
                │   │    + lease renew (20s)                          │    │
                │   │  - getLocalIp() (Ethernet preferred over Wi-Fi) │    │
                │   │  - Sleep/wake detect via 90s heartbeat gap      │    │
                │   │  - Single-writer lease B10 (90s TTL / 20s renew)│    │
                │   │  - BridgeControlDispatcher (R1) on config       │    │
                │   │    snapshots; dispatch by action, dedup by nonce│    │
                │   └─┬─────────────┬─────────────┬───────────────────┘    │
                │     ▼             ▼             ▼                        │
   ┌────────┐   │  config.ts    firestore-     x32-client.ts (862 LOC)     │
   │ X32    │◀──┼───OSC/UDP────│transport.ts │  - OSC msg encode/decode    │
   │ mixer  │   │              │ (701 LOC)   │  - /xremote subscribe (8s)  │
   │ ports  │   │  314 LOC      - listen for │  - /xinfo keepalive (8s)    │
   │ 10023  │   │  - load doc   commands     │  - 20s silence → reconnect  │
   └────────┘   │  - watch+     - debounce   │  - exponential backoff      │
                │    resub on   batch (20ms) │    (2s→60s cap; no max)     │
                │    error (R5)  - throttled │  - syncFullState w/         │
                │  - DEFAULT_   .set state   │    bounded pool (cap=12)    │
                │    CONFIG fb    write (≤10/│    + retry (3) + unconfirmed│
                │  - busAssign  s heartbeat) │    sentinel (B11)           │
                │    array      - C3 idle    │  - B9 FIFO per-address      │
                │    aware      heartbeat 10s│    callback queue           │
                │    (BR-04)    - C3 re-query│  - C2 query-after-command   │
                │  - heartbeat  resync 30s   │    confirm (debounce 75ms)  │
                │    +O2 diags  - B6 ack via │  - R3 forceReconnect()      │
                │  - lease TX   ack-writer   │  - Static .discover()       │
                │    acquire/   (TTL sweep)  │    255.255.255.255 + per-iface│
                │    renew/rel  - B4 server  │    broadcasts               │
                │  - chkRunning createTime   │                             │
                │    on boot    ordering     │  remote-log.ts (181 LOC)    │
                │               - B5 idemp   │  - error/warn ring (50)     │
                │               - B13 active │  - debounce flush (5s)      │
                │               clients      │  - startup-noise filter     │
                │               - F1 users   │    (DEP*, STANDBY) — v10.0.5│
                │               read timeout │                             │
                │               (3s)         │  bridge-control.ts (281 LOC)│
                │               - B10 active │  - DispatcherR1: resync /   │
                │               bridge gate  │    reconnect / restart /    │
                │                            │    selftest                 │
                │  ack-writer.ts (114 LOC)   │  - dedup by nonce           │
                │  - monitor-live/commands/  │  - v10.0.5 stale-request   │
                │    acks/{id} write+sweep   │    guard (requestedAt <      │
                │  - TTL 5min                │    processStartedAt)       │
                │                            │  - clearBridgeControl()     │
                │  ui/index.html (390 LOC)   │    before restart           │
                │  - Catppuccin-Mocha theme  │  - collectDiagnostics() →   │
                │  - Status grid + log list  │    O2 heartbeat fields +    │
                │  - Setup wizard overlay    │    O4 selftest snapshot     │
                │    (10-char code, app URL) │                             │
                └────────────────────────────────────────────────────────────┘

  Outbound only — no inbound TCP/UDP listening sockets (HTTP /health was REMOVED
  with the WebSocket→Firestore transport pivot; README/Dockerfile haven't caught up).
  All iPad↔bridge communication routes through Firestore:
      monitor-live/state            ← bridge writes (full snapshot)
      monitor-live/commands/pending ← iPad writes, bridge drains
      monitor-live/commands/acks/{id} ← bridge writes (per-command ack)
      monitor-live/bridgeLog        ← bridge writes (error ring buffer)
      monitor-live/selftest         ← bridge writes (on-demand diag snapshot)
      config/monitor                ← admin writes, bridge reads (with bridgeControl)
      bridge-setup-codes            ← admin POST creates, bridge GET redeems
      bridge-redemptions            ← server audit log (S02)
```

**Subsystem ownership map** (which file holds what):

| Concern                         | File                       | Notes                                                                            |
|--------------------------------|----------------------------|----------------------------------------------------------------------------------|
| Electron tray + window + IPC   | `bridge/src/main.ts`       | Crash guards, auto-updater, cred discovery + self-migrate                        |
| Bridge boot + heartbeat loop   | `bridge/src/index.ts`      | Lease wiring, sleep/wake detect, BridgeControlDispatcher injection               |
| X32 OSC transport              | `bridge/src/x32-client.ts` | UDP, /xremote 8s, /xinfo keepalive, reconnect, sync pool, B9 FIFO, C2 confirm    |
| Firestore message-bus          | `bridge/src/firestore-transport.ts` | command-listen + drain + ack-write + state-write throttle + 2-tier heartbeat |
| Firestore config + heartbeat   | `bridge/src/config.ts`     | onSnapshot + R5 resubscribe-on-error + bus-assignment array-aware + B10 lease TX |
| Per-command ack subcollection  | `bridge/src/ack-writer.ts` | sweep TTL 5min                                                                   |
| Remote error ring              | `bridge/src/remote-log.ts` | bounded 50, debounced flush 5s, fail-open silent, startup-noise filter           |
| Remote dispatch + diagnostics  | `bridge/src/bridge-control.ts` | R1 dispatcher (R1 verbs) + O2 collectDiagnostics shared with O4 selftest    |
| Shared types (canonical mirror)| `bridge/src/types.ts`      | mirrors `src/types/monitor.ts`; `BridgeControl` is bridge-only                   |
| Operator dashboard             | `bridge/ui/index.html`     | log streaming + status badges + setup-code overlay                               |

**Currently DEPLOYED:** `bridge.version: 10.0.4` on production PC (per `bridge-update-ux-FINDINGS.md` Firebase MCP read 2026-05-23). v10.0.5 accumulator parked at `048297c8c` — items 1 (restart-nonce persistence), 2 (startup-noise filter), 3 (4 bridge-recovery MCP wrappers) — Daniel publishes tomorrow morning. **All historical R1-R5 + B1-B13 + C1-C5 + O1-O4 fixes have landed**; this analysis catalogues what remains.

---

## §2 TOP-10 prioritized recommendations

Ranked HIGH-impact × LOW-effort first. Each is a candidate lane scaffold (§4 for sketches).

| #  | Recommendation                                                                                  | Impact | Effort | Type        | Recommended owner | Citation        |
|----|-------------------------------------------------------------------------------------------------|--------|--------|-------------|-------------------|-----------------|
| 1  | **Sentry alarm on `bridgeLog.errCount` jumps via `/api/cron/admin-consistency`**                | HIGH   | S      | Feedback    | any (coder-3 owns PGR-* cron pattern) | `[[project_bridge_state_freshness_diagnostic]]`, `src/app/api/cron/admin-consistency/route.ts` |
| 2  | **Delete `bridge/{Dockerfile,docker-compose.yml}` + rewrite `bridge/README.md` to reflect Electron + Firestore reality** | HIGH | S | Bug (docs) | any | README L7-15, L143-160, L186-208 reference deleted ws-server.ts + non-existent HTTP /health |
| 3  | **Standby-drop pending command ack: write `rejected:standby` for dropped queue commands**       | HIGH   | S      | Bug         | any (single-file) | `firestore-transport.ts:281-285` (silent queue drop on STANDBY) |
| 4  | **Periodic `selftest` snapshot (every 10min) so we get fresh forensic state without an MCP call** | MED  | S      | Feedback    | bridge single-owner (coder-1) | `bridge-control.ts:260-275` `selftest` only fires on dispatch |
| 5  | **Dashboard update UI** — add a "Check / Download / Install" panel to `bridge/ui/index.html` so the tray-only path stops being the bottleneck | HIGH | M | Feature | bridge single-owner | `bridge-update-ux-FINDINGS.md` §"Pain 1" — REAL open gap |
| 6  | **Periodic `autoUpdater.checkForUpdates()` (every 4h)** — currently only runs on `app.whenReady()`, an unattended bridge never rechecks | HIGH | S | Bug | bridge single-owner | `main.ts:303-352` `checkForUpdates()` only on `ready-to-show` |
| 7  | **Rewrite `bridge/SETUP_GUIDE.md`** to drop manual-Node path (no longer the supported flow) and fix the "6-character code" → "10-character code" lie | MED | S | Bug (docs) | any | SETUP_GUIDE L31 |
| 8  | **`/api/cron/bridge-health-alarm` — alarm when `config/monitor.bridge.lastSeen` is stale > 3min OR `bridge.x32Connected===false` for > 5min** | HIGH | M | Feedback | any (coder-3/4) | no current alarm path — bridge silence on a Friday night is invisible until Daniel notices |
| 9  | **Add bridge MCP enrichment**: `set_bus_assignment` (currently `assign_monitor_bus` exists; cover all admin write paths for the band-leader flow) + `bridge_clear_acks` + `bridge_clear_pending_commands` | MED | M | Feature | any | `[[project_mixer_feature]]` 2026-05-14 ask; partial via bridge-recovery.ts |
| 10 | **Cold-boot fresh-laptop integration test (mocked Firebase)** — exercises the setup-code wizard + cred persist + first heartbeat | MED | L | Test | any | no current test covers this; only S02 setup-code GET route is unit-tested |

**Total lane LOC budget for TOP-10:** ~2,000-3,000 LOC across 10 dispatches (mostly S/M with one L). Items 1, 2, 3, 6, 7 are S-sized and could ship in one combined `bridge-quickwin-sweep` wave (~600 LOC total) before Daniel publishes v10.0.5 tomorrow.

---

## §3 Per-axis detailed findings

### §3.1 Bugs (anything obviously wrong / unfinished / surfaced in memory)

#### B-A1 — Docker setup is fundamentally broken (`bridge/Dockerfile` + `bridge/docker-compose.yml`)
- **Evidence:** Dockerfile L9-11 builds `dist/index.js`; `CMD ["node", "dist/index.js"]`. But the entry point in `package.json` is `dist/main.js` (Electron). The Dockerfile-built image runs `index.ts` directly, which bypasses ALL of `main.ts` (tray, IPC, setRestartHandler injection, cred discovery, auto-updater, sleep/wake). `HEALTHCHECK` calls `http://localhost:9001/health` — that endpoint **does not exist** (no HTTP server in current source).
- **`docker-compose.yml`** exposes ports 9000+9001, but the bridge binds NEITHER (Firestore-only transport).
- **Impact:** anyone trying to `docker compose up` (per README "Option A — Docker (recommended)") gets a container whose `/health` healthcheck loops failure every 30s; if it *did* start, it would run Node-only `index.ts` with no auto-updater, no tray, no setup-code IPC, no R4 restart handler — silently degraded.
- **Fix:** delete Dockerfile + docker-compose.yml + README's "Option A: Docker" section. The Electron tray is the only supported runtime today.
- **Owner:** any (1-line file deletes + README rewrite — bundles with B-A2 below).

#### B-A2 — `bridge/README.md` describes a phantom architecture
- **Evidence:** README L7-15 shows `iPad Browser ──WebSocket──► Bridge`. Source has no WebSocket server. L143-160 documents an `HTTP API on port 9001` (`/health`, `/status`, `/scan`) — none of these exist. L186-208 "File Structure" lists `launcher.ts`, `ws-server.ts`, `scripts/install-service.js`, `scripts/uninstall-service.js`, `.env.example` — **none exist**. L86-105 documents `npm install -g node-windows` + `npm run install-service` — those scripts don't exist either.
- **Impact:** anyone trying to bring up a new bridge from the README docs is stuck. The actual supported flow is the EXE installer + setup-code wizard, undocumented here.
- **Fix:** rewrite README around Electron + Firestore + setup-code. Cite the deployed EXE flow. Keep ~80 lines, drop ~130.
- **Owner:** any.

#### B-A3 — `bridge/SETUP_GUIDE.md` lies about setup-code length
- **Evidence:** L31 "You'll see a **6-character code** (valid for 10 minutes)". The actual code is 10 characters (`/api/bridge/setup-code/route.ts:20` `CODE_LENGTH = 10`; `bridge/ui/index.html:275` `maxlength="10"`). Multiple memory entries record the historical "app 10-char vs bridge UI ~6" mismatch (`[[project_bridge_update_ops]]`) — that's been fixed in v10.0.1, but the doc didn't follow.
- **Impact:** operator looking at the dashboard's 10-char field while reading the guide for a 6-char code thinks setup is broken.
- **Fix:** s/6-character/10-character/ + drop the entire "Manual Way (for developers)" section (Parts 1-10, also covered by README rewrite in B-A2).
- **Owner:** any.

#### B-A4 — `processedCommandIds` mark-before-execute, but STANDBY drop bypasses the ack write
- **Evidence:** `firestore-transport.ts:281-285` — when `!isActiveBridge()` the entire `pendingCommandQueue` is silently dropped (`this.pendingCommandQueue = []; return;`). No ack is written. The iPad client polling `monitor-live/commands/acks/{id}` waits ack-timeout (~1.5s) and falls back to "unknown" — confusing UX.
- **Impact:** band member taps fader during a brief lease-flip window (rare, but happens when a second bridge boots and one stands by) — their fader command silently drops, no feedback.
- **Fix:** for every command in the dropped queue, write `{status: "rejected", reason: "bridge-standby"}` via `ackWriter.write()` before clearing. ~10 LOC.
- **Owner:** any.

#### B-A5 — `cleanupStaleCommands` uses client `createdAt`, not server time (B4 inconsistency)
- **Evidence:** `firestore-transport.ts:642-649` — `.where("createdAt", "<", Date.now() - 30_000)`. `createdAt` is the iPad wall-clock; B4 already established that server-relative `createTime` is the authoritative time for ordering + staleness (`firestore-transport.ts:243-251`). This sweep predates B4 and was missed.
- **Impact:** an iPad with a 60s-fast clock has its commands swept early; an iPad with a 60s-slow clock leaves stale commands in `pending` longer than intended. Minor (safety net only — real processing path uses server time).
- **Fix:** swap to a `createTime`-based query (Firestore admin SDK exposes `createTime` on snapshots; could store a server-stamped `createdAtServer` on doc write from the iPad side and query that).
- **Owner:** any.

#### B-A6 — `cleanupStaleCommands` re-establishes listener on error without clearing old `commandUnsub`
- **Evidence:** `firestore-transport.ts:255-260` — `(err) => { ... setTimeout(() => this.listenForCommands(), 5000) }`. On error the old listener is already toast (Firestore drops it), but `this.commandUnsub` still points at it. The retry calls `listenForCommands()` which assigns a **new** `this.commandUnsub` — fine in steady state, but if `stop()` is called BETWEEN error + retry, the stale handle is used and the not-yet-rebuilt listener leaks.
- **Impact:** vanishingly small (single-instance bridge, deterministic shutdown). Worth a defensive `this.commandUnsub = null` in the error handler before the timeout, mirroring `config.ts:84` R5 pattern.
- **Owner:** any (1-line fix).

#### B-A7 — Memory rot risk: `bridge/README.md`'s "v2.0.0 Changes" section (L17-22) is from 8+ versions ago
- **Evidence:** README L17 "### v2.0.0 Changes" — and deployed is v10.0.4 with v10.0.5 ready. None of the post-v2 changes (Firestore transport, B-series, R-series, O-series fixes, single-writer lease, BridgeControl) are summarized anywhere in the repo. The closest is the in-line comment block at the top of `firestore-transport.ts`.
- **Impact:** new contributor (or future-Daniel) onboarding to bridge code reads README, gets WebSocket mental model, then has to discover the truth by reading source.
- **Fix:** drop "v2.0.0 Changes" + add a one-paragraph CHANGES summary or link to `[[project_bridge_release_build]]` memory entry. Bundles with B-A2.
- **Owner:** any.

### §3.2 Reliability / bulletproofing

#### R-A1 — `autoUpdater.checkForUpdates()` runs ONCE per process lifetime
- **Evidence:** `main.ts:303-352` — `checkForUpdates()` is invoked in `mainWindow.once('ready-to-show', ...)`. There is no periodic re-check.
- **Impact:** the studio PC is on for weeks at a time (band uses Friday-evening / Shabbat-morning only). A v10.0.5 release published Sunday isn't even *noticed* by the running bridge until someone uses the tray "Check for Updates" item or the bridge quits. This is the #1 reason auto-update is unreliable per `bridge-update-ux-FINDINGS.md`.
- **Fix:** `setInterval(() => checkForUpdates(), 4 * 60 * 60_000)` — every 4h. Pair with R-A2.
- **Owner:** bridge single-owner.

#### R-A2 — Tray UI is the only human "install now" path (the dashboard has no update button)
- **Evidence:** `bridge/ui/index.html` exposes status grid + log streaming + setup overlay only. The `update-pending` IPC fires (`main.ts:331`) but no DOM element listens for it. The `install-update` IPC handler exists (`main.ts:523-526`) but no UI invokes it.
- **Impact:** Daniel must Alt-Tab to the tray, find the small purple icon, right-click, see the "Install update" item, click — which only appears AFTER a download has completed. None of this is discoverable from the open dashboard window.
- **Fix:** add a `<div id="update-pending" hidden>` panel to `bridge/ui/index.html` that listens for `ipcRenderer.on('update-pending', ...)` and exposes a "Install & Restart" button calling `ipcRenderer.invoke('install-update')`. ~40 LOC HTML + JS.
- **Owner:** bridge single-owner. **Cite `bridge-update-ux-FINDINGS.md`** for full discovery.

#### R-A3 — `lastError` in `bridgeLog` can be misleading post-startup
- **Evidence:** v10.0.5's `isStartupNoise()` filter (`remote-log.ts:37-48`) correctly skips `[DEPNNNN]` + `entering STANDBY` lines from incrementing `errCount`/`lastError`. Good. But: any single error captured 30+ minutes ago remains `lastError` forever — there is no time-decay or auto-clear. A bridge that hit one transient error at boot and has been healthy for 6 hours STILL reports that error as `lastError`.
- **Impact:** `get_bridge_health` looks alarming when the bridge is actually fine; Daniel ignores it; real new errors get masked.
- **Fix options:**
  - (a) decay `lastError` to null after N minutes of no new error (~`errCount % decay` heuristic).
  - (b) surface `errCount` deltas (current vs last-snapshot) in the alarm path (TOP-10 #1) so a static-but-old lastError doesn't trip the alarm.
  - **Recommended:** (b) — keep `lastError` as historical forensic data, but make the alarm a delta-on-errCount; non-breaking.
- **Owner:** any.

#### R-A4 — `dotenv.config()` runs at the top of `index.ts` BEFORE the heartbeat is wired
- **Evidence:** `index.ts:19-20` runs immediately on import. The Electron path sets `process.env.BRIDGE_VERSION = app.getVersion()` BEFORE calling `startBridge()` (`main.ts:367-373`), so the heartbeat reports the real version. Direct-Node (`node dist/index.js` — what Dockerfile would do if it worked) falls back to `"2.0.0"` sentinel.
- **Impact:** if Docker ever did work, every heartbeat would lie about the version. Currently a non-issue because no one runs the Node-only path in production.
- **Fix:** read version from `bridge/package.json` directly in `index.ts` as a hardcoded fallback (the file is bundled). Or just delete the Docker path (B-A1) so this can never reoccur.
- **Owner:** bundles with B-A1.

#### R-A5 — `getLocalIp()` "prefer wired" heuristic is fragile
- **Evidence:** `index.ts:78-82` matches `/ethernet|eth\d|en\d/i`. On Windows, common adapter names include "Ethernet 2", "vEthernet (WSL)", "VirtualBox Host-Only Network" — the first will match the heuristic and be reported, even if it's a virtual adapter with no LAN connectivity.
- **Impact:** historically the published `bridge.localIp` has been the studio's real LAN IP (`192.168.1.201` per `bridge-update-ux-FINDINGS.md`), so this isn't biting today. But if Daniel ever runs WSL or Docker Desktop on the studio PC, the heartbeat could publish the wrong IP and iPads' "Bridge URL" auto-update would point at a dead address.
- **Fix:** prefer the iface whose subnet contains a discovered X32 (if `X32Client.discover()` succeeded), or whose IP matches `192.168.x.y` over `10.x.y.z`. Or just persist `localIp` once and not auto-update it.
- **Owner:** bridge single-owner (M effort — depends on discovery race).

#### R-A6 — Sleep/wake re-detect leans on a 90s heartbeat gap, which the X32 reconnect loop covers but local-IP DHCP-change handling depends on
- **Evidence:** `index.ts:240-254` — sleep detection fires only on `elapsed > 90_000`. Modern Windows S3 sleeps usually pause the JS event loop, so this works. But hibernate (S4) → cold boot may NOT trip this (process restarts → setTimeout chain resets; the 90s gap is between two `lastTick`s in the SAME process). And the X32 reconnect loop runs independently, so it likely covers actual reconnection — the only thing the wake-detect uniquely does is republish a new `bridge.localIp` if DHCP gave us a new lease.
- **Impact:** if the studio PC hibernates between Friday-evening and Shabbat-morning and DHCP issues a new IP, the heartbeat republish only fires when the NEXT 60s heartbeat tick happens — up to 60s of "Bridge URL points at dead IP" on cold-boot Saturday. iPads should still find the bridge via Firestore (zero-config; `monitor-live/state` doesn't depend on `bridgeUrl`).
- **Fix:** the bigger issue is the `bridgeUrl` field in `config/monitor` is legacy and not actually used by iPads in the Firestore-transport era. Consider deleting it.
- **Owner:** any (small surface cleanup).

### §3.3 Test infrastructure

#### T-A1 — `bridge/x32-r1-readback.test.ts` flake (known; not this lane's fix)
- **Evidence:** `[[feedback_parallel_load_flake_baseline]]` records this as one of 3 documented residual parallel-load assertion-flakes post `54378d7e5`. PASSES solo; fails under suite-wide parallel load on specific fast-check seeds.
- **Note:** coder-7 owns the fix lane (`assertion-flake-refactor`). **Do not touch the test in this analysis.** Cited per dispatch-prompt do-not-touch.
- **Owner:** coder-7.

#### T-A2 — No cold-boot integration test (fresh laptop → setup-code → first heartbeat)
- **Evidence:** existing 14 test files cover unit-level concerns (mocked firebase-admin / dgram). `src/app/api/bridge/__tests__/setup-code.test.ts` covers the server's GET endpoint in isolation. **No test** drives the full bridge-side flow: `main.ts` `submit-setup-code` IPC → fetch → write cred to userData → call `startBridge()` → boot → heartbeat tick.
- **Impact:** a regression that breaks the cred-vending or the cred-discovery path is silent until Daniel hits it during a service reinstall. The "memory rot" risk of the setup-code length mismatch (B-A3) is exactly the kind of thing a cold-boot test would catch.
- **Fix:** add a Playwright/Spectron Electron-host test that boots `main.ts` against a mocked `fetch` for `/api/bridge/setup-code`, drives the setup overlay, and asserts: userData cred file exists, `startBridge()` was called, first heartbeat lands within 60s (Firestore-admin mocked).
- **Effort:** L (multi-day) — needs Electron test harness setup.
- **Owner:** any with Electron test experience (worth queueing).

#### T-A3 — Auto-updater idle/install flow is not unit-tested
- **Evidence:** `bridge-control.test.ts` covers the dispatcher branches well (15 tests per claims-row 97 commit `048297c8c`). `remote-log.test.ts` covers ring + filter (5 added 2026-05-23). `command-auth-cache.test.ts` covers BR-01. But the BR-03 idle-install deferral logic in `main.ts:277-300` is NOT covered — the `consecutiveIdleMinutes` counter, `IDLE_MINUTES_BEFORE_AUTO_INSTALL`, `getBridgeStatus()` lookup race.
- **Impact:** a regression to the idle deferral could re-introduce the "mid-service force-restart" bug that BR-03 fixed in v10.0.x. Currently the only safety net is Daniel noticing.
- **Fix:** extract the idle-watch loop into a pure function (`shouldInstallNow({ pendingVersion, x32Connected, consecutiveIdleMinutes })`) and unit-test it. ~50 LOC test file.
- **Owner:** bridge single-owner. Bundles with R-A2 dashboard update UI.

#### T-A4 — No tests for `getLocalIp()` virtual-adapter cases
- **Evidence:** zero tests for the wired-vs-wireless preference or virtual-adapter rejection. The heuristic is in production code path without coverage.
- **Impact:** ties to R-A5 — any change to the heuristic has no regression coverage.
- **Fix:** mock `os.networkInterfaces()` returning realistic Windows adapter shapes; assert IP-selection. ~40 LOC.
- **Owner:** any (S).

#### T-A5 — `bridge/src/__tests__/x32-mock-server.ts` lacks fidelity coverage for matrix outputs
- **Evidence:** `x32-mock-fidelity.test.ts` (208 LOC) covers /xinfo, /xremote, bus echo behavior, R1 read-of-own-write. No test cases for /mtx/N/mix/{fader,on} symmetry — and the bridge's mtx setters (`x32-client.ts:616-625`) are the ONLY path for the FOH matrix primitives that engineers depend on.
- **Impact:** if the mock drifts from real X32 matrix behavior, the mtx tests pass against a wrong oracle.
- **Fix:** add 3-4 matrix fidelity assertions to `x32-mock-fidelity.test.ts`. ~30 LOC.
- **Owner:** any (S).

#### T-A6 — Test suite has no per-axis "verify bridge can survive a 30h unattended window" smoke
- **Evidence:** no time-based property test, no chaos-mode harness. Reliability is verified only by Daniel's lived experience.
- **Fix:** out of scope for this analysis (XL effort, separate research). Note for future planning.

### §3.4 Feedback / observability (how does operator know if something's wrong)

#### F-A1 — `bridgeLog.errCount` increments are SILENT — no alarm path
- **Evidence:** `remote-log.ts` writes to `monitor-live/bridgeLog`; `bridge-control.ts:collectDiagnostics` exposes `errCount` + `lastError` in the 60s heartbeat. But nothing reads these over time and alerts. By contrast `coder-7 pgr-03-staleness-alarm` ships an analog for storage-backup health.
- **Impact:** the bridge can be writing errors every minute and Daniel has no idea unless he runs `get_bridge_health` MCP manually.
- **Fix:** add a `bridgeHealth` section to `src/app/api/cron/admin-consistency/route.ts` analogous to `storageBackupHealth`:
  - read `config/monitor.bridge` (lastSeen, x32Connected, errCount, lastError)
  - read `monitor-live/bridgeLog` (entries)
  - compute deltas vs last-recorded snapshot (`config/bridgeHealth.lastSnapshot`)
  - fire Sentry alarm on: `errCount` delta > 5/run, OR `lastSeen` stale > 3min, OR `x32Connected===false` for > 5min consecutive
  - persist the snapshot for next-run delta
- **Effort:** S-M (mirrors PGR-03 shape closely).
- **Owner:** any (TOP-10 #1 + #8 are related — could bundle).

#### F-A2 — `selftest` snapshot is on-demand only — never auto-written
- **Evidence:** `bridge-control.ts:260-275` writes `monitor-live/selftest` only when a `bridge_selftest` MCP call dispatches the action. There is no periodic snapshot.
- **Impact:** if Daniel needs forensic data ("what was the queueDepth at 7:23pm last Friday?"), he can't get it post-hoc. The bridge has the data in memory but only publishes on demand.
- **Fix:** auto-write `selftest` every 10 minutes. Idempotent (overwrite). Single `setInterval` in `index.ts` calling `collectDiagnostics` + `db.doc('monitor-live/selftest').set({...})`. ~15 LOC.
- **Owner:** bridge single-owner (TOP-10 #4).

#### F-A3 — Tray icon doesn't change color on bridge unhealth
- **Evidence:** `main.ts:139-177` paints a static violet circle as the tray icon. It never changes based on bridge state.
- **Impact:** Daniel can't tell at-a-glance from the system tray whether the bridge is OK or wedged. He has to open the dashboard, read the X32 badge, check timestamps.
- **Fix:** swap the tray icon color (red → orange → green) based on the same health bit the dashboard renders. ~30 LOC + new `createTrayIcon(color)` factory.
- **Owner:** bridge single-owner (M).

#### F-A4 — Dashboard log stream resets on dashboard hide-restore (Electron renderer destroyed?)
- **Evidence:** `bridge/ui/index.html:288-315` — `ipcRenderer.on('log', ...)` appends to DOM. When the user closes the window (`main.ts:126-131` `mainWindow?.hide()` instead of destroy), the DOM persists. So the log SHOULD persist. BUT: the empty-state `.empty-logs` is removed only on first log line; if `mainWindow` is recreated (via `createWindow()` second invocation, which `gotTheLock` reopen flow doesn't do — it just shows the existing window), state survives.
- **Status:** **probably OK** in current flow; flagging as a thing to verify in cold-boot test (T-A2).
- **Owner:** any (verify-only).

#### F-A5 — `bridge.localIp` legacy field still written
- **Evidence:** `config.ts:189` writes `bridge.localIp` on every heartbeat. In Firestore-transport era, iPads don't consume this. Yet it's still updated 60×/h forever.
- **Impact:** harmless write traffic + a misleading field for anyone debugging.
- **Fix:** keep writing it for forensics, but document in code comment that it's legacy / not consumer-facing.
- **Owner:** any (1-line comment).

### §3.5 Additional features

#### Feat-A1 — Bridge MCP exposure for the band-leader monitor flow
- **Status:** PARTIALLY shipped. `bridge-recovery.ts` exposes `bridge_resync`/`bridge_reconnect`/`bridge_selftest`/`bridge_restart` (claims row 97 @ `048297c8c`). The set_*_fader/set_send_level/set_send_on/etc primitives are exposed via Wave-6 monitor MCP tools.
- **Gap:** no `bridge_clear_acks` (housekeeping), no `bridge_clear_pending_commands` (recovery if queue wedged), no `bridge_get_log` (return the 50-entry ring directly without an MCP round-trip).
- **Effort:** M for 3 wrapper tools. Cites `[[project_mixer_feature]]` 2026-05-14 ask.
- **Owner:** any.

#### Feat-A2 — Multi-X32 support (long-tail)
- **Evidence:** `index.ts:133-150` discovers and connects to ONE X32. The `monitorBuses` field in config is a flat array — no per-mixer separation.
- **Relevance:** zero for CRC today (one X32). Flag for the "one day this might matter" pile, NOT a build candidate.

#### Feat-A3 — Bridge-side LAN discoverability for diagnostics
- **Evidence:** removed when WebSocket transport was dropped. No `/health` endpoint, no `/scan`. Operator can't curl localhost to verify the bridge is running — has to either (a) check Firestore via Firebase MCP, or (b) open the Electron window.
- **Relevance:** MEDIUM. Restoring a TINY HTTP server (Node `http.createServer` on 9001 with one /health route) would let a future installer self-verify. ~50 LOC; minimal attack surface (localhost-only bind).
- **Owner:** bridge single-owner (M).

#### Feat-A4 — In-app bridge health surface (web app `/admin/sound-system` or similar)
- **Evidence:** the only consumer of `bridge.x32Connected` / `bridgeLog.errCount` / `bridgeLog.lastError` is the MCP tool `get_bridge_health`. No human-readable web page surfaces this.
- **Relevance:** MEDIUM. Daniel could check his phone for bridge health without firing up Claude Desktop. ~150 LOC page + read-only Firestore query.
- **Owner:** any (M).

#### Feat-A5 — Setup-code regeneration UX
- **Evidence:** `route.ts:42-51` invalidates previous unused codes from the same user, then mints a new one. No UI to *cancel* a code mid-validity or to *extend* a code about to expire.
- **Relevance:** LOW. Setup happens once.

#### Feat-A6 — Bridge software-side X32 firmware version recording
- **Evidence:** `X32Client.discover` reads firmware (`x32-client.ts:806-827`) but does not persist it. Only logged to console (`index.ts:138`).
- **Relevance:** LOW. Would help diagnose desk-firmware-specific bugs if any ever surface.

---

## §4 Suggested follow-on lane scaffolds

Each scaffold maps to a TOP-10 item; convert to dispatches by copying the §"Lane setup" block.

### Lane #1 — `bridge-health-alarm` (TOP-10 #1 + #8 bundle)
- **Scope:** add `bridgeHealth` section to `src/app/api/cron/admin-consistency/route.ts` mirroring `storageBackupHealth` (PGR-03) — read `config/monitor.bridge` + `monitor-live/bridgeLog`, compute deltas vs last snapshot at `config/bridgeHealth.lastSnapshot`, fire Sentry alarms on errCount delta > 5/run OR lastSeen stale > 3min OR x32Connected===false for > 5min.
- **Files:** `src/app/api/cron/admin-consistency/route.ts` (+~80 LOC) + `__tests__/route.test.ts` (+~60 LOC).
- **LOC:** ~140.
- **Effort:** S-M.
- **Coordination:** orthogonal to PGR-03 / PGR-04 / library-bytes-health alarms in the same route (claims rows 99 / 114 / 152).
- **Owner:** any.

### Lane #2 — `bridge-docs-rewrite` (TOP-10 #2 + #7 bundle)
- **Scope:** delete `bridge/{Dockerfile,docker-compose.yml}`; rewrite `bridge/README.md` to Electron + Firestore + setup-code reality (~80 lines, drop ~130); rewrite `bridge/SETUP_GUIDE.md` to drop manual-Node Part 1-10 and fix the "6-character code" lie. Single commit; ZERO `src/` or `bridge/src/` content changes.
- **Files:** `bridge/README.md` (rewrite), `bridge/SETUP_GUIDE.md` (rewrite + trim), `bridge/Dockerfile` (delete), `bridge/docker-compose.yml` (delete).
- **LOC:** -150 net (rewriting smaller).
- **Effort:** S (~1h focused).
- **Coordination:** none — pure docs.
- **Owner:** any.

### Lane #3 — `bridge-standby-ack-cleanup` (TOP-10 #3)
- **Scope:** in `firestore-transport.ts:processCommandBatch` STANDBY branch, write `rejected:bridge-standby` acks for each dropped command before clearing the queue.
- **Files:** `bridge/src/firestore-transport.ts` (+10 LOC), `bridge/src/__tests__/firestore-transport-commands.test.ts` (+30 LOC).
- **LOC:** ~40.
- **Effort:** S (~30min).
- **Owner:** any.

### Lane #4 — `bridge-periodic-selftest` (TOP-10 #4)
- **Scope:** add `setInterval(() => writeSelftest(collectDiagnostics(...)), 10 * 60_000)` in `index.ts` for on-the-fly forensics.
- **Files:** `bridge/src/index.ts` (+15 LOC), no test (timer wiring).
- **LOC:** ~15.
- **Effort:** S (~15min).
- **Owner:** bridge single-owner (or any — single-file additive).

### Lane #5 — `bridge-dashboard-update-ui` (TOP-10 #5 + R-A2)
- **Scope:** add `<div id="update-pending">` panel to `bridge/ui/index.html` with "Install & Restart" button; wire to existing `update-pending` IPC event + `install-update` invoke. Cite `bridge-update-ux-FINDINGS.md` "Pain 1".
- **Files:** `bridge/ui/index.html` (+40 LOC CSS+JS+HTML).
- **LOC:** ~40.
- **Effort:** M (~2h, requires Electron renderer reload to verify).
- **Coordination:** **bridge single-owner** ([[project_bridge_release_build]] — needs a v10.0.6 release after Daniel publishes v10.0.5).
- **Owner:** bridge single-owner.

### Lane #6 — `bridge-periodic-update-check` (TOP-10 #6)
- **Scope:** add `setInterval(() => checkForUpdates(), 4 * 60 * 60_000)` in `main.ts` after the first `checkForUpdates()` call. Ensure the registered handlers don't double-stack.
- **Files:** `bridge/src/main.ts` (+5 LOC), unit-test extracts `shouldInstallNow()` per T-A3.
- **LOC:** ~50 with tests.
- **Effort:** S.
- **Coordination:** **bridge single-owner**, bundles with Lane #5 if shipping together.
- **Owner:** bridge single-owner.

### Lane #7 — `bridge-mcp-housekeeping-tools` (TOP-10 #9 + Feat-A1)
- **Scope:** add `bridge_clear_acks` (sweep `monitor-live/commands/acks/*`) + `bridge_clear_pending_commands` (sweep `monitor-live/commands/pending`) + `bridge_get_log` (return the 50-entry ring without an MCP round-trip — read `monitor-live/bridgeLog` and reshape).
- **Files:** `src/lib/mcp/tools/bridge-recovery.ts` (+~80 LOC), `src/lib/mcp/tools/index.ts` (register, +4 LOC), `src/lib/mcp/tools/__tests__/bridge-recovery.test.ts` (+~80 LOC).
- **LOC:** ~165.
- **Effort:** M.
- **Coordination:** registration site in `src/lib/mcp/tools/index.ts` is high-contention — claim per `[[feedback_shared_worktree_race]]`.
- **Owner:** any.

### Lane #8 — `bridge-cold-boot-integration-test` (TOP-10 #10 + T-A2)
- **Scope:** Playwright/Spectron Electron-host test booting `main.ts` against mocked `fetch(/api/bridge/setup-code)`, driving the setup overlay, asserting userData cred persistence + first heartbeat.
- **Files:** `bridge/test/e2e/cold-boot.spec.ts` (NEW, ~200 LOC), `bridge/test/fixtures/mock-firebase.ts` (NEW, ~80 LOC), `bridge/package.json` (devDep `spectron` or `@playwright/test`).
- **LOC:** ~300.
- **Effort:** L (1-2 days; first Electron e2e in this repo).
- **Owner:** any with Electron test experience.

### Lane #9 — `bridge-tray-icon-health-color` (F-A3)
- **Scope:** `createTrayIcon(color)` factory; subscribe to `getBridgeStatus()` polling; tint icon red/orange/green based on (x32Connected ∧ stateFresh) / (x32Connected ∧ ¬stateFresh) / (¬x32Connected).
- **Files:** `bridge/src/main.ts` (~30 LOC).
- **LOC:** ~30.
- **Effort:** S-M.
- **Owner:** bridge single-owner.

### Lane #10 — `bridge-getLocalIp-virtual-adapter-test` (T-A4)
- **Scope:** mock `os.networkInterfaces()` returning realistic Windows shapes (incl. "vEthernet (WSL)", "VirtualBox Host-Only", "Ethernet 2"); assert wired-iface preference selects the real LAN interface.
- **Files:** `bridge/src/__tests__/get-local-ip.test.ts` (NEW, ~60 LOC), possibly extract `getLocalIp` into its own module for testability.
- **LOC:** ~80.
- **Effort:** S.
- **Owner:** any.

---

## §5 Out-of-scope / explicit non-findings

- **`bridge/x32-r1-readback.test.ts` flake** — known parallel-load assertion-flake; coder-7 owns the `assertion-flake-refactor` fix lane (T-A1). Not touched here.
- **No code changes** — this lane is Tier-0 research only. The 5-line bugs (B-A4, B-A6, F-A5) are written up; not applied.
- **No bridge live runs** — analysis is source-only + cross-reference of prior research + memory entries + deployed-state snapshots from `bridge-update-ux-FINDINGS.md`.
- **`src/` outside bridge-related touchpoints** — only `src/app/api/bridge/setup-code/route.ts` and `src/lib/mcp/tools/bridge-recovery.ts` were read for context.
- **SmartTransposer / library_index / monitor-store consumer UI** — out of bridge scope per dispatch.
- **Auditor handoff scope:** Tier-0 implicit ACCEPT per protocol — SHIP-NOTICE → supervisor inbox after this doc commits.

---

## §6 Verification artifacts

- **Source tree at base SHA `de1d96a34`:**
  - `bridge/src/*.ts` — 9 files / 3,567 LOC
  - `bridge/src/__tests__/*.test.ts` — 14 files / 2,579 LOC
  - `bridge/ui/index.html` — 390 LOC
  - `bridge/{README,SETUP_GUIDE}.md` — read in full
  - `bridge/{Dockerfile,docker-compose.yml}` — read in full
  - `src/lib/mcp/tools/bridge-recovery.ts` — 150 LOC (claims row 97 `048297c8c`)
  - `src/app/api/bridge/setup-code/route.ts` — 206 LOC
- **Prior research consulted:**
  - `.paul/research/bridge-recon-FINDINGS.md` (2026-05-21; bridge-recon coder-1)
  - `.paul/research/bridge-update-ux-FINDINGS.md` (2026-05-23; coder-4)
  - `.paul/research/monitor-audit-lane1-bridge-FINDINGS.md` (BR-01..BR-04 era)
  - `.paul/research/monitor-overhaul/AUDIT-{bridge,consumers}.md`
  - `.paul/research/monitor-stress-v1004/REPORT.md`
- **Memory entries:**
  - `[[project_bridge_release_build]]`, `[[project_bridge_update_ops]]`,
    `[[project_bridge_state_freshness_diagnostic]]`, `[[project_monitor_live_probe]]`,
    `[[project_band_ipad_hardware]]`, `[[feedback_parallel_load_flake_baseline]]`.
- **Deployed-state snapshot (from `bridge-update-ux-FINDINGS.md` 2026-05-23):**
  - `bridge.version: 10.0.4` (live as of v10.0.5 ship-pending tomorrow)
  - `bridge.x32Connected: true`
  - `bridge.lastSeen` fresh
  - `bridgeLease.ownerId: ProductionDSKTP-21588-bd70d922`

---

**Success criterion (per dispatch):** when Daniel reads this FINDINGS.md, he can immediately point to 3-5 lanes worth dispatching tonight + a slate of follow-ups for after v10.0.5 publish.

**Concrete tonight-dispatch candidates** (TOP-10 #1, #2, #3, #4 — all S-effort, disjoint surfaces, no bridge release required):
- Lane #1 `bridge-health-alarm` — Sentry path for bridge silence.
- Lane #2 `bridge-docs-rewrite` — docs match reality.
- Lane #3 `bridge-standby-ack-cleanup` — band UX during lease-flip.
- Lane #4 `bridge-periodic-selftest` — forensic data without an MCP call.

**After-v10.0.5-publish bridge-release-bound** candidates (Lane #5, #6, #9): require a v10.0.6 build + electron-builder release + GitHub asset upload + Daniel-installer-run.
