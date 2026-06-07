# Lane P0-B1 — Faithful X32 Mock (Monitor Overhaul Phase 0, Wave 2)

**Owner:** coder-1 (bridge expert; bridge is a single-owner, Daniel-gated zone).
**Tier 1 (build).** **Boundary: `bridge/src/__tests__/**` ONLY** — NO bridge production code (`bridge/src/{index,x32-client,firestore-transport,config,types,main}.ts`), NO web `src/`. This lane builds the *test foundation* that makes the Phase-1 root-fix verifiable; it does not change product behavior.
**Base:** cut `feat/p0-b1-x32-mock` off **fresh origin/master** (verify the tip at fire — currently `afac68dd9`). Repo is a shallow clone; read master via the worktree, not the stale canonical cwd.

## Why this lane
The X32 mock currently **echoes every SET back to all clients including the sender** (`x32-mock-server.ts:393-396,419-422,446-449,483-486,504-507`). The **real** X32 does **not** echo a client's own writes back to that client — which is the entire R1 "read-of-own-write" bug (`AUDIT-bridge.md` Part A R1 + B7). So today CI **cannot see** R1: a bridge test driving a SET through the mock sees state update afterward, exactly the behavior real hardware lacks. This lane makes the mock faithful so the Phase-1 fix (query-after-command) has a red→green target.

## Context to read first
- `.paul/research/monitor-overhaul/PROGRAM-SPEC.md` §3 (self-test architecture; the X32 query/response is the oracle) + §4 (the contract the mock must be able to test).
- `.paul/research/monitor-overhaul/PHASE-0-PLAN.md` Lane P0-B1.
- `.paul/research/monitor-overhaul/AUDIT-bridge.md` — **B7** (mock-fidelity defect, exact line refs), **Part A R1** (read-of-own-write), **Part C2** (query-after-command — what Phase 1 will add; your R1 test should flip green when it lands), **B9** (query/echo correlation).
- `.paul/research/monitor-overhaul/DEFECT-REGISTER.md` §3 (ratified contract).

## Build
Model the REAL X32 quirks in `bridge/src/__tests__/x32-mock-server.ts` (+ new mock-fidelity test files):
1. **Own-writes are NOT echoed to the sender.** A SET from a given client updates the mock's internal value but does **not** emit a parameter echo back to that same client. (Other subscribers still get the echo — see #4.)
2. **Query/response returns CURRENT values.** A param query (the `query*` primitives the bridge already has — `x32-client.ts:468-502`) returns the mock's current stored value for that address.
3. **`/xremote` subscribe + ~8s renewal + expiry.** Only subscribed clients receive external-change echoes; a subscription expires if not renewed within the window. (Today the mock emits to all registered clients unconditionally.)
4. **External changes echo to subscribers.** A change originated by a *different* client (or a simulated manual desk move) echoes to all *other* subscribed clients (this is the path that, on real hardware, keeps state fresh — and the asymmetry vs #1 is the whole point).

Then add a **RED-aware test that reproduces R1**: a SET issued by the bridge does **not**, by itself, refresh `monitor-live/state` (because the own-write isn't echoed). Per the established convention (cf. the `e2e/perform-ipad-deep.spec.ts` "flip when fix lands" marker), assert the **current/expected behavior** so CI stays green, with an explicit, greppable marker — e.g. `// PHASE-1 TARGET: flip this assertion when query-after-command lands (AUDIT-bridge C2)` — documenting that it must invert once Phase 1 confirms own-writes.

Wire the mock-fidelity tests into CI (root vitest globs `bridge/src/**/*.test.ts`; confirm they run under the normal test job + `check:types`).

## Acceptance (self-check before SHIP-NOTICE)
- Mock-fidelity tests green: own-write-not-echoed, query-returns-current, `/xremote` subscribe/renew/expire, external-change-echoes-to-others.
- The R1-reproducing test exists, passes against today's bridge behavior, and is clearly marked as the Phase-1 target to flip.
- CI wired (tests run in the standard job; `check:types` ✅).
- Bridge tests-only; zero production-code diff; `git diff --stat` shows only `bridge/src/__tests__/`.

## Hard rules
- `bridge/src/__tests__/**` only. If you find yourself needing to touch production bridge code to make a test pass, STOP and surface — that's Phase 1, not this lane.
- Claim already staked: `bridge/src/__tests__/x32-mock-server.ts` (shared/claims.md). New test files need no claim.
- Ship via worktree off origin/master, FF (narrow-lane cherry-pick if origin moved). Update `master-tip.md` + your status. **SHIP-NOTICE → inbox/auditor.md** (Tier 1, coder↔auditor direct) with per-acceptance evidence + how to run the new tests.
