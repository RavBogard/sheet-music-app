# Monitor Overhaul — Phase 1 Plan (Core Control Loop — the hybrid root-fix)

> **Parent:** `PROGRAM-SPEC.md` §4-5 · `DEFECT-REGISTER.md` §3 (ratified contract) + §5.
> **Gated on:** Phase 0 ACCEPT — the P0-B1 mock + P0-B2 live probe ARE Phase 1's verification oracle.
> **Status:** DRAFT for Daniel ratify. Dispatch only after Phase 0 closes + this plan is ratified.

**Goal:** implement the ratified state-write contract so the **iPad round-trip becomes correct** — own
moves confirmed from authoritative state, idle never freezes, no array→map corruption. FOH + MCP ride the
same substrate.

**Executable acceptance (the oracle decides — no human in the booth):**
- the **P0-B2 live probe goes GREEN** (an own-write is reflected in `monitor-live/state` within target; idle
  state stays fresh), and
- the **P0-B1 mock R1 test (`x32-r1-readback.test.ts`) flips green** (own-write now refreshes via query-after-command).

**Closes:** R1, R2, R3 (contract C1-C5) + C-5/MCP-D2 (MCP validate vs owned-buses) + schema/version fields;
folds in B2, B11, B12, B14, B15. (Phase 2 = ack surface / clock / observability; Phase 3 = iPad UX polish.)

---

## Sequencing

Wave 1 (parallel, disjoint, build) → **mock/unit gate** → **bridge release (Daniel-gated, careful)** →
**live gate** (re-run P0-B2 against the studio) → Phase 1 done.

---

## Wave 1 — build (parallel, disjoint)

### Lane P1-A — Bridge state-write contract (THE root-fix) — coder-1, bridge, Tier 2, single-owner, Daniel-gated
**Surface:** `bridge/src/{firestore-transport,x32-client,index,config,types}.ts`.
**Build** (DEFECT-REGISTER §3 / AUDIT-bridge Part C5 — the algorithm is already written out there):
- **C1 — full-state writes.** Delete `scheduleDeltaWrite` + the dot-path `.update()` flush (`firestore-transport.ts:106-174`); route ALL state writes through a throttled `writeFullState` (`.set()` whole `MixerSnapshot`, ≤10/s via the existing 100ms `STATE_WRITE_INTERVAL`). **[kills R3]**
- **C2 — query-after-command.** After `processCommand` applies a SET (`firestore-transport.ts:283-316`), query the affected param back (`x32-client.ts:468-502`) → update cache → schedule a full-state write. Debounce per `targetKey` ~50-100ms; correlation = latest-value-wins + ~300ms timeout (NO fabricated value on timeout — let the heartbeat reconcile). **[kills R1]**
- **C3 — two-tier heartbeat.** `STATE_HEARTBEAT_MS=10s` (re-`.set()` cached snapshot, no X32 traffic) + `FULL_REQUERY_MS=30s` (syncFullState resync) + on reconnect/config-change. **[kills R2]**
- **C4 — schema.** Keep `buses` an ARRAY; add `schemaVersion:1` + `bridgeVersion` + `stateSeq` (monotonic); STOP embedding `config` in the state doc (`firestore-transport.ts:89`); **reserve but do NOT implement** the `monitor-live/acks/{commandId}` shape (Phase 2).
- **C5/B3 — liveness** from (socket-alive AND state-age < threshold), not socket chatter, before publishing `x32Connected`.
- **Fold-ins:** B2 (create+start transport THEN syncFullState — fix the startup `state_synced` ordering), B11 (confirmed-vs-unknown sentinel on query failure — no silent 0/`true`), B12 (remove the dead `lastSnapshot` block), B14 (version via the new `bridgeVersion` field), B15 (delete the dead `verifyToken`).
**Verify (mock-side, no desk):** the P0-B1 mock R1 test FLIPS GREEN; NEW tests for full-state-not-delta, query-after-command-refreshes-state, heartbeat-advances-on-idle, schema fields present; bridge suite green; `check:types` ✅.
**Boundary:** bridge single-owner (coder-1), Daniel-gated. The bridge RELEASE is a separate gated step (below) — code lands + mock-verifies first; it is NOT auto-shipped to the studio.

### Lane P1-B — MCP validation against owned-buses — web coder (lowest-available), Tier 2
**Surface:** `src/lib/mcp/tools/monitor.ts` (`preflightBusWrite` :426-445, `get_mix` :266-276), `src/lib/mcp/server-monitor.ts` (`getOwnedBuses` :158-170).
**Build:** validate writes/reads against `getOwnedBuses(config)` / `config.monitorBuses` (the authoritative assignment), NOT the corrupted live-state; demote the live-state presence check to a soft "not currently visible on the desk" warning rather than a hard `invalid_bus_index` refuse. **[closes C-5/MCP-D2]**
**Verify:** emulator — owned-bus write ALLOWED even when live-state dropped it; unowned DENIED; deployed-surface probe (bearer). **Disjoint from P1-A** (web src vs bridge) → fully parallel.

---

## Gate after Wave 1 (mock/unit, no desk)
mock R1 flips green · bridge suite green · MCP-validation emulator tests green · `check:types` ✅ · `next build --webpack` clean. → cleared for the bridge release.

## Bridge release (Daniel-gated, single-owner coder-1, OUTWARD-FACING — handle with care)
P1-A only reaches the studio via an electron-updater → GitHub release. **The release path caused the 2026-05-21 outage** — bump bridge version → build → publish NON-DRAFT release w/ `latest.yml` → studio tray install → confirm `config/monitor.bridge.version`. **Schedule OUTSIDE a service window** ([[project_shul_cadence]]). Optional: bundle the still-open `bridge-setup-code-mismatch` fixes (durable-cred path + setup-UI maxlength) as a v10.0.1 if Daniel wants — see that lane's FINDINGS.

## Live gate (the real acceptance)
After the release lands on the studio PC, re-run the **P0-B2 live probe** → GREEN: an own-write is reflected in `monitor-live/state` within target; idle stays fresh. **The first full-state `.set()` also HEALS the currently-corrupted live state** (0 buses / map shape → clean array). This is the moment "the iPad round-trip becomes correct."

---

## Open forks for Daniel (at ratify)
1. **Bridge-release timing** + whether to bundle the `bridge-setup-code-mismatch` fixes into a v10.0.1.
2. **P1-B coder** (lowest-available; bridge stays coder-1).
3. **Consumer convergence** (one shared read guard replacing `toArray`/`safeArray`/raw + C-7 drop-embedded-`state.config`): fold the minimal C-7 coordination into P1-A's C4, **defer the shared-guard + fader-UX to Phase 3** (recommended), or pull into Phase 1?
4. **Latency targets** (PROGRAM-SPEC §6) — set the numbers from the P0-B2 baseline once it's green.

## Coders / dispatch
Wave 1 = **coder-1** (P1-A bridge) + one web coder (P1-B), parallel + disjoint. Dispatch AFTER Phase 0 ACCEPT + this plan's ratify. The bridge release is coder-1 single-owner, Daniel-gated.
