# Lane P1-A — Bridge State-Write Root-Fix (Monitor Overhaul Phase 1, Wave 1)

**Owner:** coder-1 (bridge expert; `bridge/**` is a single-owner, Daniel-gated zone).
**Tier 2.** **Boundary:** `bridge/src/**` only (production bridge code + its tests). NO web `src/`.
**★ DO NOT build or publish a bridge release in this lane** — the code lands + is mock-verified here; the release is a SEPARATE Daniel-gated step (the release path caused the 2026-05-21 outage). STOP and surface if you find yourself touching `bridge/package.json` version or the release/electron-updater path.
**Base:** cut `feat/p1-a-bridge-rootfix` off **fresh origin/master** (verify tip at fire — currently `19b1ab105`).

## Why
This is THE root-fix. The single fault is the bridge's state-write contract; the three root bugs (R1 read-of-own-write, R2 idle-freeze, R3 array→map corruption) all close by redesigning only the write path. The contract is RATIFIED — implement it.

## Context to read first
- `.paul/research/monitor-overhaul/PHASE-1-PLAN.md` Lane P1-A.
- `.paul/research/monitor-overhaul/DEFECT-REGISTER.md` §3 (ratified contract C1-C5).
- `.paul/research/monitor-overhaul/AUDIT-bridge.md` **Part A** (R1/R2/R3 with file:line) + **Part C** (C1-C5 + the **C5 concrete write algorithm** — implement that), + the B-items you're folding in.
- The P0-B1 mock you built: `bridge/src/__tests__/{x32-mock-server.ts, x32-mock-fidelity.test.ts, x32-r1-readback.test.ts}` — the R1 test is your red→green target.

## Build (DEFECT-REGISTER §3 / AUDIT-bridge C5)
- **C1 — full-state writes.** Delete `scheduleDeltaWrite` + the dot-path `.update()` flush (`firestore-transport.ts:106-174`); route ALL state writes through a throttled `writeFullState` (`.set()` whole `MixerSnapshot`, ≤10/s via the existing 100ms `STATE_WRITE_INTERVAL`). **[R3]**
- **C2 — query-after-command.** After `processCommand` applies a SET (`firestore-transport.ts:283-316`), query the affected param back (`x32-client.ts:468-502`) → update cache → schedule a full-state write. Debounce per `targetKey` (~50-100ms). Correlation = latest-value-wins + ~300ms timeout; on timeout do NOT write a fabricated value (let the heartbeat reconcile). **[R1]**
- **C3 — two-tier heartbeat.** `STATE_HEARTBEAT_MS=10s` (re-`.set()` cached snapshot, no X32 traffic) + `FULL_REQUERY_MS=30s` (syncFullState) + on reconnect/config-change. **[R2]**
- **C4 — schema.** Keep `buses` an ARRAY; add `schemaVersion:1` + `bridgeVersion` + `stateSeq` (monotonic per write); STOP embedding `config` in the state doc (`firestore-transport.ts:89`); **reserve but do NOT implement** `monitor-live/acks/{commandId}` (Phase 2).
- **C5/B3 — liveness** from (socket-alive AND state-age < threshold) before publishing `x32Connected`.
- **Fold-ins:** B2 (create+start transport THEN syncFullState — fix startup ordering, `index.ts:116/121/124`), B11 (confirmed-vs-unknown sentinel on query failure — no silent 0/`true`), B12 (remove dead `lastSnapshot` block `firestore-transport.ts:44,152-157`), B14 (version via `bridgeVersion`), B15 (delete dead `verifyToken` `config.ts:90-103`).

## Acceptance (self-check before SHIP-NOTICE)
- **The P0-B1 mock R1 test (`x32-r1-readback.test.ts`) FLIPS GREEN** (own-write now refreshes state via query-after-command) — and you remove its `// PHASE-1 TARGET` marker.
- NEW tests: full-state-not-delta (no dot-path `.update`), query-after-command-refreshes-state, heartbeat-advances-`updatedAt`-on-idle, schema fields present, B11 sentinel.
- Bridge suite green; `check:types` ✅ (app↔bridge mirror).
- `git diff --stat` shows only `bridge/src/**`. No release artifacts touched.

## Hard rules
- bridge single-owner; NO bridge release in this lane (separate Daniel-gated step). Claims staked: `bridge/src/{firestore-transport,x32-client,index,config}.ts`.
- Run tests from a worktree with a complete `node_modules` (canonical's vitest is broken — coder-1's P0-B1 gotcha: `node node_modules/vitest/dist/cli.js run bridge/src/__tests__`).
- Ship via worktree off origin/master, FF (narrow-lane cherry-pick if origin moved). Update `master-tip.md` + status. **SHIP-NOTICE → inbox/auditor.md** (Tier 2). The live confirmation (P0-B2 probe green) happens AFTER the Daniel-gated bridge release — note that in the SHIP-NOTICE; this lane's evidence is the mock R1 flip + bridge suite.
