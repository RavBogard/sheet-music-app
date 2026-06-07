# Monitor Overhaul — Phase 2 Plan (Robustness & Observability)

> **Parent:** `PROGRAM-SPEC.md` §5 · `DEFECT-REGISTER.md` §5 (Phase-2 map) + B3/B4/B5/B6/B9/B10/B13 + MCP-D3/MCP-D4 + C-9.
> **Gated on:** Phase 1 LIVE ✅ (v10.0.1 on the desk; state-write contract correct + the `monitor-live/acks/{commandId}` shape RESERVED by P1-A's C4).
> **Status:** Ratified (Daniel 2026-05-22 "let's do them both") — running in parallel with Phase 3 (disjoint planes).

**Goal:** make the monitor system *trustworthy under load + observable* — multiple concurrent musicians each control only their bus with no cross-talk, commands have a readable status (did it apply / why not), liveness reflects real state-freshness, and reconnect/clock-skew/duplicate-bridge edge cases are closed. This is the robustness layer the band rollout (6 iPads, ~5/29) leans on — distinct from Phase 3's hand-feel.

**Two lanes, disjoint planes, fully parallel** (and disjoint from Phase 3's iPad plane):

---

## Lane P2-A — Bridge observability + robustness — coder-1, `bridge/src/**`, Tier 2, single-owner, Daniel-gated
**Surface:** `bridge/src/{x32-client,firestore-transport,index,config}.ts` + a small NEW ack-writer module. **Verify all file:lines against CURRENT post-P1-A source** (you wrote P1-A — the DEFECT-REGISTER line numbers predate it). [[feedback_cowork_prompt_verify_before_write]]

**Build (DEFECT-REGISTER Phase-2 items):**
- **B6 — ack surface (the headline; = MCP-D3's data source).** Implement the write of `monitor-live/acks/{commandId}` per the shape P1-A RESERVED in C4: `{ status:'applied'|'rejected'|'timeout', confirmedValue?, reason?, at }`. Server-write/client-read, TTL-swept. After `processCommand` resolves (the query-after-command confirm from P1-A's C2 gives the confirmed value, or a timeout/rejection), write the ack. This is what unblocks `get_command_status` (P2-B) + the iPad C-9 failure UI (Phase-3 follow-up).
- **B4 — clock-skew.** `createdAt` is cross-machine wall-clock → skew breaks the command timeout + ordering. Move timeout/ordering off wall-clock onto a monotonic/server-relative basis (or the `stateSeq` already added in P1-A's C4).
- **B5 — command ordering / idempotency** (rests on B4): well-defined order + dedupe so a re-delivered command can't double-apply.
- **B9 — query/echo correlation hardening.** `query()` keyed by address → concurrent queries/echoes can collide (matters now that P1-A's C2 queries after every command). Add per-request correlation so a concurrent same-address query/echo can't cross wires.
- **B10 — two-bridge guard.** `checkForRunningInstance` only warns; two bridges on different PCs both drain `pending`. Add a single-writer election/refusal (e.g. a lease in `config/monitor`).
- **B13 — real `clients` count** (currently hardcoded 0; misleads dashboards).
- **B3 — verify, don't redo.** P1-A's C5 already derives `x32Connected` from (socket-alive AND state-age<threshold). Confirm that's sufficient; close any residual only.

**Verify (mock/unit, no desk):** extend the faithful X32 mock + bridge suite — ack written on apply/reject/timeout; correlation under concurrent queries; ordering/idempotency; two-bridge election. Bridge suite green + `check:types` ✅.
**★ NO bridge release in this lane.** Like P1-A: code lands + mock-verifies; the release is a SEPARATE Daniel-gated step, bundled into the next gated release **before the ~5/29 band rollout** (NOT tonight — we just shipped v10.0.1). Live acceptance (acks visible in prod, get_command_status returns real data) follows that release.

---

## Lane P2-B — MCP observability + bus-assignment tools — coder-2, `src/lib/mcp/**`, Tier 2
**Surface:** `src/lib/mcp/tools/monitor.ts` + NEW tool file(s) + the tool registration in `src/lib/mcp/.../index.ts` (registerMonitorTools block); `src/lib/mcp/server-monitor.ts` helpers. **Verify against CURRENT post-P1-B source** (you wrote P1-B). Disjoint from P2-A (bridge) + P3-A (iPad).

**Build:**
- **MCP-D3 — `get_command_status(commandId)`.** Reads `monitor-live/acks/{commandId}` (the shape P1-A reserved / P2-A writes) → returns `{status, confirmedValue?, reason?, at}`. Same trusted-leader/role gating as the other monitor tools; rich error envelope ([[feedback_mcp_validation_shape]]). **Dependency:** real data needs P2-A's ack-write LIVE (post bridge release) — build against the reserved shape + emulator tests now; mark live-verify as post-P2-A-release. Until acks exist, return a clean "no ack yet / pending" result, never throw.
- **MCP-D4 — `assign_monitor_bus` / `unassign_monitor_bus`.** Write `config/monitor.busAssignments` (the UI's `BusAssignmentPanel` already does this; MCP doesn't). Trusted-leader gated (admin + band_leader, per [[feedback_admin_rate_limit_bypass]] pattern); validate bus ∈ 1..5 + a real uid; `dryRun` support per [[feedback_dryrun_is_observability]]. **Fully independent of the bridge** — immediately useful + live-testable (lets Daniel/David assign band members to IEM buses via Claude — directly serves the rollout).

**Verify:** monitor emulator suite (both tools) + `next build --webpack` + check:types + eslint. Deployed bearer-probe: `assign_monitor_bus` testable live NOW; `get_command_status` live after the P2-A release. Tier 2 → SHIP-NOTICE to auditor with `## Repros`.

---

## Deferred to a Phase-3 follow-up (not this plan's lanes)
- **C-9 — iPad "command rejected because X" UI.** Consumes the ack doc; lives in the iPad plane (coder-5's Phase-3 files). Sequenced AFTER P2-A's ack-write is live; layered onto the Phase-3 fader state machine. Don't dispatch separately (would collide with P3-A).

## Notes
- **Bridge release cadence:** P2-A's bridge changes ride the NEXT gated release (before ~5/29). Do not rush a second release tonight. When it ships, re-run P0-B2 + verify acks/get_command_status live.
- **Concurrency (PROGRAM-SPEC §6 "N musicians, zero cross-talk")** is partly P2-A (ordering/idempotency/correlation) + Phase-4 soak; P2-A lays the groundwork, Phase 4 proves it under multi-iPad load.
