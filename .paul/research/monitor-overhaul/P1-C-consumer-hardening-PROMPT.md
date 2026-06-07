# Lane P1-C — iPad Consumer Hardening (Monitor Overhaul Phase 1, Wave 1)

**Owner:** coder-5 (you mapped this plane in P0-A2 — AUDIT-consumers).
**Tier 2.**
**Boundary:** the iPad consumer-read plane — `src/lib/firestore-monitor-client.ts`, `src/lib/monitor-store.ts`, `src/app/(main)/monitor/MonitorClient.tsx`, `src/components/monitor/{ConnectionIndicator,FaderStrip,VerticalFaderStrip,MonitorTabs}.tsx`. Disjoint from the bridge (P1-A) and MCP server (P1-B) → fully parallel.
**Base:** cut `feat/p1-c-consumer-hardening` off **fresh origin/master** (verify tip at fire — currently `19b1ab105`).

## Why
Even with the bridge fixed, the consumer plane has three weaknesses your own audit found (AUDIT-consumers C-4/C-6/C-7). Harden the read path now — independent of the bridge change (this makes consumers robust to whatever the bridge writes).

## Context to read first
- `.paul/research/monitor-overhaul/PHASE-1-PLAN.md` Lane P1-C + §"Open forks" (consumer scope).
- `.paul/research/monitor-overhaul/DEFECT-REGISTER.md` C-4 / C-6 / C-7 rows + §3 (consumer reqs).
- `.paul/research/monitor-overhaul/AUDIT-consumers.md` §2 (Bug A/B/C consumer manifestations) + §6 (UX gaps).

## Build
- **C-4 — ONE shared defensive read guard.** Today there are three divergent coercions of a corrupted/non-array `state.buses`: iPad `toArray` (`firestore-monitor-client.ts:98-106`, keeps survivors), MCP `safeArray` (drops all), `get_mix` raw. Add ONE shared helper (e.g. `src/lib/monitor/coerce-state.ts`) and route the iPad client through it so a future bad write degrades **identically + safely** everywhere on the consumer side. (MCP server side is P1-B's; this lane owns the iPad side.)
- **C-6 — staleness honesty.** Wire the **bridge health into the main route**: `MonitorClient.tsx`/`MonitorTabs.tsx` currently pass `ConnectionIndicator` only `status`+`error`, never `bridgeStatus` (`ConnectionIndicator.tsx` bridge-offline branch is dead on the main route); pass it. **Mount the existing-but-uncalled `DisconnectedOverlay`** ("Mixer offline — last known levels", `ConnectionIndicator.tsx:115-132`). **Consume the `stateStale` signal** (shipped on the MCP bridge-health `70357f47f`; the iPad ignores it) for a per-fader staleness cue so a frozen value isn't shown as live. Collapse the 10s/90s/120s threshold sprawl toward `state.updatedAt` where practical.
- **C-7 — drop embedded `state.config` reliance.** `monitor-store.ts` derives `myBusIndex` from BOTH `state.config.busAssignments` (`:124-126`) and `config/monitor` (`:222-230`), which can disagree — and P1-A is removing the embedded `config` from the state doc. Read assignments from `config/monitor` only.
- **EXCLUDE the C-2 fader-confirmation state machine** (optimistic→confirmed→reverted) — that's **Phase 3**; it needs P1-A's query-after-command confirmed-value signal to exist first. Don't build it here.

## Acceptance (self-check before SHIP-NOTICE)
- Unit/component tests: the shared guard degrades a corrupted (map/empty) `buses` shape predictably (no throw, no silent total loss); `ConnectionIndicator` shows bridge-offline/stale on the main route when `bridgeStatus`/`stateStale` say so; `DisconnectedOverlay` mounts on disconnect; `myBusIndex` derives from `config/monitor` only.
- `next build --webpack` clean; `check:types` ✅; eslint clean.
- Use `/ui-ux-pro-max` for the staleness/disconnect UI affordances ([[feedback_ui_ux_skill]]).

## Hard rules
- Claims staked: `firestore-monitor-client.ts`, `monitor-store.ts`, `MonitorClient.tsx`, `ConnectionIndicator.tsx` (FaderStrip cue shares the ConnectionIndicator claim region — coordinate within your own lane).
- Ship via worktree off origin/master, FF. Update `master-tip.md` + status. **SHIP-NOTICE → inbox/auditor.md** (Tier 2).
