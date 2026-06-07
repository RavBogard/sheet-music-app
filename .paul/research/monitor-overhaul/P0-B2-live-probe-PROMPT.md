# Lane P0-B2 — Live Query-After-Write Probe (Monitor Overhaul Phase 0, Wave 2)

**Owner:** coder-5.
**Tier 1 (build).** **Boundary: harness only** — a NEW probe under `e2e/` OR `scripts/` (you pick; document the choice + rationale) + a runner doc. NO production `src/` changes, NO bridge changes.
**Base:** cut `feat/p0-b2-live-probe` off **fresh origin/master** (verify the tip at fire — currently `afac68dd9`).

## Why this lane
PROGRAM-SPEC §3 makes the self-test **autonomous** — no human in the booth. The X32's own query/response is the oracle: "did the desk actually change, per the desk itself." This probe is the live half (the faithful mock, P0-B1, is the CI half). It must currently **report the real state** — i.e. confirm control WORKS but readback FAILS — which is the exact Phase-1 target; after Phase 1's query-after-command + heartbeat land, the same probe should go fully green.

## Context to read first
- `.paul/research/monitor-overhaul/PROGRAM-SPEC.md` §3 (Tier 2 live probe) + §6 (acceptance; latency targets deferred to measured baselines this probe captures).
- `.paul/research/monitor-overhaul/PHASE-0-PLAN.md` Lane P0-B2.
- `.paul/research/monitor-overhaul/DEFECT-REGISTER.md` §3 (ratified contract) + §4.
- `.paul/research/monitor-overhaul/AUDIT-consumers.md` §1 (the two write paths: iPad command-queue + MCP) + §8.
- `.paul/research/monitor-overhaul/AUDIT-bridge.md` Part A (what readback failure looks like) + Part C2.

## Build — the autonomous probe
1. **Service-time guard FIRST** ([[project_shul_cadence]]: CRC services are Friday evening + Shabbat morning). Refuse to run during a service window; only monitor/IEM buses, never FOH.
2. Verify the desk is live (`config/monitor.bridge` fresh heartbeat + `x32Connected:true`) and pick a **safe, demonstrably-unused monitor/IEM bus** (re-verify; don't assume a bus number).
3. **Snapshot** the target both ways: via MCP `get_mix` AND via the raw `monitor-live/state` read.
4. **Write via BOTH paths:** (i) the iPad command-queue path (direct `addDoc` to `monitor-live/commands/pending`), and (ii) the MCP path (`set_bus_fader`).
5. **Query the desk back** to confirm it applied; **confirm `monitor-live/state` reflects it** (full round-trip).
6. **Restore** the original value, byte-identical. Verify the restore.
7. Emit clear **PASS/FAIL** per assertion + capture the **command-enqueue→state-reflect round-trip latency** (feeds the deferred PROGRAM-SPEC §6 targets).

## Acceptance (self-check before SHIP-NOTICE)
- Runs **headless** against the live desk with no human; idempotent + self-restoring (snapshot→…→restore verified byte-identical).
- Currently **reports the real state**: control applies (the desk/command path works) but readback does not reflect own-writes (R1) and/or idle state is stale (R2) — documented as the Phase-1 target the probe will later confirm green.
- Admin bearer parameterized (env/arg); dogfood-mint a CHILD bearer from the seed ROOT at fire, probe with it, then REVOKE the child (post-revoke 401).
- Harness-only; `git diff --stat` shows only the new probe + doc (+ no production `src/`).

## Hard rules
- Reversible (snapshot→restore, leave the desk byte-identical) — same discipline as `monitor-f1-probe`.
- Service-time guard is mandatory. STOP + report if any precondition fails (desk stale, no clean unused bus, in a service window, no bearer).
- New files → no claim needed. Ship via worktree off origin/master, FF. Update `master-tip.md` + status. **SHIP-NOTICE → inbox/auditor.md** (Tier 1) with the probe transcript + restore proof + the latency baseline.

## At fire, Daniel provides
ONE seed ROOT `crl_live_*` bearer + confirmation the desk is free to nudge (not in a service window).
