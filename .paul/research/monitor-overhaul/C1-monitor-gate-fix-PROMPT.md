# Lane C-1 — Server `/monitor` Access-Gate Fix (Monitor Overhaul fast-track)

**Owner:** coder-2.
**Tier 2** (auth/access-gate change — full rigor).
**Boundary:** the server access gate only. Disjoint from the bridge + from P0-B1/P0-B2 (parallel-safe).
**Base:** cut `feat/c1-monitor-gate-fix` off **fresh origin/master** (verify the tip at fire — currently `afac68dd9`).

## The bug (AUDIT-consumers C-1, HIGH, NEW — auditor-ACCEPTed)
`src/app/(main)/monitor/page.tsx:27` reads `config.busAssignments?.[user.uid]` — but `busAssignments` is keyed by **bus-index string**, not by uid. So a plain musician assigned to their own IEM bus **never matches** → `hasAccess` stays false → the server renders "Monitor Access Denied" (`page.tsx:34-44`) and the mixer UI never loads. This blocks the program's **North Star user** before any bridge bug matters.

The client hook does it **correctly** (value-iterating, array-aware): `src/hooks/use-monitor-access.ts:59-67`. That's the inconsistency — the perform-toolbar `QuickMonitorPanel` (which uses the hook) lets the same user in, while the `/monitor` server gate denies them.

## Context to read first
- `.paul/research/monitor-overhaul/AUDIT-consumers.md` §5 row **C-1** + §1 (the consumer/contract map) + §9 (FACTS — C-1 is a definite code bug, latent-but-blocking until a real musician is assigned a bus).
- `src/app/(main)/monitor/page.tsx` (the gate) and `src/hooks/use-monitor-access.ts:59-67` (the correct logic to mirror).
- `src/lib/mcp/server-monitor.ts:158-170` (`getOwnedBuses`/`config.monitorBuses`) — if there's an existing shared predicate for "does this uid own a bus," **reuse it** rather than duplicating.

## Fix
Make the server gate determine access the same way the client does: a non-privileged user has access iff their uid appears in **any** bus assignment value (array-aware over `BusAssignment | BusAssignment[]`), not by indexing `busAssignments[uid]`. Admin/SE keep their existing access. Keep the change **minimal** — just the gate predicate; do not touch the contract, the bridge, or unrelated page logic. Prefer reusing the existing owned-bus helper to eliminate the divergence at the source (so the server gate and `use-monitor-access` can't drift again).

## Acceptance (self-check before SHIP-NOTICE)
- A plain musician (non-admin/SE) assigned a bus via `BusAssignmentPanel` now **passes** the server gate and loads the mixer UI; admin/SE still pass; an unassigned non-privileged user is still **denied**.
- Regression test on the gate predicate covering: assigned-musician ALLOW, unassigned-musician DENY, admin/SE ALLOW, array-form assignment ALLOW.
- Server gate now agrees with `use-monitor-access` (parity asserted or shared helper used).
- `next build --webpack` clean; `check:types` ✅; eslint clean.
- **Deployed-surface note:** a full deployed probe needs a band_leader/admin to assign a bus + a musician session — if that's not feasible without onboarding, state it as a limit; unit/component test on the predicate + the parity-with-client + code review is the feasible Tier-2 evidence. Capture whatever deployed evidence you can.

## Hard rules
- Claim already staked: `src/app/(main)/monitor/page.tsx` (shared/claims.md).
- Minimal, focused diff. Ship via worktree off origin/master, FF (narrow-lane cherry-pick if origin moved). Update `master-tip.md` + status. **SHIP-NOTICE → inbox/auditor.md** (Tier 2, full rigor) with per-acceptance evidence + `## Repros`.
