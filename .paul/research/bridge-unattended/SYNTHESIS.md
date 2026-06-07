# Bridge v10.0.4 — unattended-remote build SYNTHESIS (RATIFIED scope)

**Daniel ratified 2026-05-23: "all of it."** Builds on `RESILIENCE-FINDINGS.md` (coder-2) +
`OBSERVABILITY-FINDINGS.md` (coder-3). Context: Daniel installs an updated bridge ONCE, then the
studio PC + X32 are **ON but physically inaccessible ~2 days** (remote-only via Firestore/MCP).
Goal: get work done + test + **FIND BUGS blind**.

- **Builder:** coder-4 — SINGLE lane (changes are tightly coupled in `bridge/src/config.ts`,
  `index.ts`, `firestore-transport.ts`, `main.ts`, `x32-client.ts`; splitting would collide — both
  researchers flagged this).
- **Baseline:** origin/master `ba7663584` (bridge v10.0.3). **Target version: v10.0.4.**

## RATIFIED SCOPE (all in)

### Observability — "see + debug it blind"
- **O1. Remote error/event log → Firestore.** Bounded ring (~50), rate-limited (error/warn only,
  debounce/batch every few s), **fail-open** (try/catch swallow — can NEVER destabilize the box or
  blow quota). Target: `monitor-live/bridgeLog` (capped array) OR `monitor-live/diag/log`
  subcollection w/ ack-writer-style TTL sweep. Capture at the existing console-intercept seam
  (`main.ts:355-366`) or a small logger in `index.ts`. NEVER per-line.
- **O2. Richer heartbeat** — ADDITIVE keys on `config.writeHeartbeat` (`config.ts:151-174`), emitted
  in the existing 60s loop. **Do NOT change existing `status`/`x32Connected`/`clients` semantics.**
  Add: `socketAlive` (raw `x32.isConnected`), `stateAgeMs` (`transport.getStateAgeMs`),
  `unconfirmedCount` (`x32.getUnconfirmed().length`), `lastOscRxAt` (getter on `x32.lastMessageAt`),
  `lastStateWriteAt`, `startedAt` + `uptimeMs`, `queueDepth` (getter on
  `transport.pendingCommandQueue.length`), `errCount` + `lastError {msg,ts}`.
- **O3. `get_bridge_health` MCP tool** — **APP-SIDE** (`src/lib/mcp`), ships independent of the bridge
  install. Reads `config/monitor.bridge` + `monitor-live/state.updatedAt` + `bridgeLease.expiresAt`,
  returns a DERIVED verdict `{alive, lastSeenAgeS, stateAgeS, leaseExpired, socketAlive,
  unconfirmedCount, version, queueDepth?}` doing `now−lastSeen` math (so the stale booleans can't
  fool a caller). Reuse `computeStateAgeSeconds`/`isStateStale` (`server-monitor.ts:139-151`). Admin
  access WITHOUT requiring a bus assignment (clean one-call probe).
- **O4. `bridge.selftest`** (via the shared channel below) — writes a fresh diagnostic snapshot to
  `monitor-live/diag/selftest` on demand (don't wait for the 60s heartbeat).

### Bug fix (real latent crash they found)
- **B1. Crash guard.** `x32.on("error", logSwallow)` in `index.ts` + `process.on('uncaughtException')`
  & `('unhandledRejection')` last-resort loggers in `main.ts`. Closes the board-power-off → Windows
  UDP `ECONNRESET` → unhandled EventEmitter `"error"` → **process crash with no relaunch** path
  (`x32-client.ts:202-205`). Pure additive; zero behavior change when healthy. **Highest-value fix.**

### Remote recovery (all in)
- **R1. Shared control channel:** `config/monitor.bridgeControl { action, nonce, requestedAt,
  requestedBy }`, **admin-write-gated**, watched by the EXISTING `config.onChange` listener
  (`config.ts:60-73` / `index.ts:272-282`), dispatched by `action`, deduped by `nonce`
  (`lastHandledNonce` guard). ONE channel for ALL control verbs (resolves the coder-2↔coder-3 seam):
  `action ∈ { resync, reconnect, restart, selftest }`. Purely additive; does NOT touch the X32
  command-exec path.
- **R2. `resync`** (safest): `await x32.syncFullState(cfg.monitorBuses); await transport.writeFullState()`.
  No socket churn. Cures frozen-state + drift.
- **R3. `reconnect`**: new public `X32Client.forceReconnect()` (flip `connected=false`, emit
  `"disconnected"`, call existing `attemptReconnect()`). Recovers a wedged socket without a restart.
- **R4. `restart`** (last resort): `app.relaunch(); app.exit(0)` from `main.ts` via IPC/callback.
  Only lever for an alive-but-stuck process; brief outage, recoverable because relaunch re-spawns.
- **R5. Config-listener resubscribe-on-error** (REQUIRED): mirror the command-listener resubscribe
  (`firestore-transport.ts:232-236`) on the config snapshot listener (`config.ts:70-72`). The recovery
  channel rides `config.onChange`, so it MUST survive a transient error or recovery silently dies.

### Cheap adjacent fixes (fold in)
- **F1.** Timeout the `users/{uid}` role read in `getIsEngineer` (`firestore-transport.ts:550`) so a
  hung read can't stall the command batch.
- **F2.** Doc fix: correct the stale "acks go live ~5/29" comment (`monitor-observability.ts:77-81`) —
  acks are LIVE since v10.0.3.

## EXPLICITLY DROPPED (Daniel's call)
- **Auto-update pin/disable** (resilience P0-2 / Q4). Daniel 2026-05-23: auto-update has worked fine
  the last couple times; leave it EXACTLY as-is. → `autoDownload` + startup `checkForUpdates()`
  UNCHANGED. Do not add a disable flag.

## Channel decision (resolves coder-2's HEADS-UP)
Single `config/monitor.bridgeControl` field channel (NOT `monitor-live/commands`) per both
researchers' blast-radius rationale. ONE shared "bridge control & diagnostics" command-type family +
ONE additive heartbeat field-set. coder-4 owns the whole thing (no cross-lane collision).

## Release (after code ships green)
Bump `bridge/package.json` 10.0.3→10.0.4, build NSIS (electron-builder), publish a **NON-DRAFT**
GitHub release — **hyphen-rename assets to match `latest.yml`, sha512-verify** — per
[[project_bridge_release_build]] (tsconfig excludes `src/__tests__`). Daniel installs via DIRECT
download (the one shot).

## Gates
Bridge vitest incl. NEW tests: crash-guard error-listener (no-crash on socket error), `bridgeControl`
dispatch + nonce-dedup, `forceReconnect`, heartbeat new fields, ring-buffer rate-limit/fail-open ·
check:types · eslint · tsc-clean on touched bridge files · app-side `get_bridge_health` unit +
`next build --webpack` for the MCP tool.

## Post-install note (for Daniel, surfaced at ship)
Don't publish a NEWER bridge release during the 2-day window unless intended — auto-update is left ON,
so a fresh release could auto-install/restart mid-window.
