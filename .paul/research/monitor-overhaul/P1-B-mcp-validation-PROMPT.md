# Lane P1-B — MCP Validation vs Owned-Buses (Monitor Overhaul Phase 1, Wave 1)

**Owner:** coder-2.
**Tier 2** (MCP write-path validation).
**Boundary:** `src/lib/mcp/tools/monitor.ts` + `src/lib/mcp/server-monitor.ts` only. Disjoint from the bridge (P1-A) and the iPad consumer plane (P1-C) → fully parallel.
**Base:** cut `feat/p1-b-mcp-validation` off **fresh origin/master** (verify tip at fire — currently `19b1ab105`).

## Why (DEFECT-REGISTER C-5 / MCP-D2)
MCP write/read validation is coupled to the **corrupted live-state** instead of the authoritative assignment. `preflightBusWrite` (`monitor.ts:426-445`) reads `state.buses` and refuses with `invalid_bus_index` / `validBusIndices:[]` when the index isn't present in the live snapshot — but under R3 the snapshot drops the user's owned bus, so a musician who **owns bus 3 per `config/monitor`** is told it's "not active" and the write is refused, even though the command path works. Same coupling in `get_mix` (`monitor.ts:266-276`). The live probe (P0-B2) caught this live: `set_bus_fader` → `invalid_bus_index`.

## Context to read first
- `.paul/research/monitor-overhaul/PHASE-1-PLAN.md` Lane P1-B.
- `.paul/research/monitor-overhaul/DEFECT-REGISTER.md` C-5 / MCP-D2 rows + §3 (consumer reqs).
- `.paul/research/monitor-overhaul/AUDIT-consumers.md` §3 MCP-D2.
- `src/lib/mcp/server-monitor.ts:158-170` (`getOwnedBuses` / `config.monitorBuses`) — the authoritative assignment source to validate against.

## Build
- Validate writes/reads against `getOwnedBuses(config)` / `config.monitorBuses` (authoritative `config/monitor` assignment), **not** the corrupted/possibly-stale `monitor-live/state`. An owned bus must pass even when live-state has dropped it.
- Demote the live-state presence check to a **soft warning** (e.g. "bus owned but not currently visible on the desk") rather than a hard `invalid_bus_index` refuse. Keep the rich error envelope shape ([[feedback_mcp_validation_shape]] — `isError`+content prose, never JSON-RPC -32xxx).
- Preserve all existing auth gating + the `confidence:"queued"` honesty (don't regress monitor-mcp-polish `62a287f06`).

## Acceptance (self-check before SHIP-NOTICE)
- Emulator: owned-bus write/read **ALLOWED even when live-state dropped that bus** (simulate the corrupted/empty `state.buses`); unowned bus **DENIED**; out-of-range still Zod-rejected.
- Deployed-surface probe (bearer): on the current degraded live state, an owned-bus `set_bus_fader` no longer hard-refuses with `invalid_bus_index`.
- `next build --webpack` clean; `check:types` ✅; eslint clean.

## Hard rules
- Claims staked: `src/lib/mcp/tools/monitor.ts` + `src/lib/mcp/server-monitor.ts`. Minimal, focused diff.
- Ship via worktree off origin/master, FF (narrow-lane cherry-pick if origin moved). Update `master-tip.md` + status. **SHIP-NOTICE → inbox/auditor.md** (Tier 2) with per-acceptance evidence + `## Repros` (bearer-gated deployed probe).
