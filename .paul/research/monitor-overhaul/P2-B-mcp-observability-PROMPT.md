# Lane P2-B — MCP observability + bus-assignment tools (coder-2) — Tier 2

Read `.paul/research/monitor-overhaul/PHASE-2-PLAN.md` (Lane P2-B) + `DEFECT-REGISTER.md` (MCP-D3, MCP-D4) first. You own the MCP monitor plane (you shipped P1-B).

## Scope (`src/lib/mcp/**` only — disjoint from P2-A bridge + P3-A iPad; VERIFY file:lines against CURRENT post-P1-B source — [[feedback_cowork_prompt_verify_before_write]])
- **MCP-D3 — `get_command_status(commandId)`.** Reads `monitor-live/acks/{commandId}` (shape P1-A reserved / P2-A writes: `{status:'applied'|'rejected'|'timeout', confirmedValue?, reason?, at}`) → returns it. Same trusted-leader/role gating as the other monitor tools; rich `isError` envelope ([[feedback_mcp_validation_shape]]), NEVER a raw throw. **Dependency:** real data needs P2-A's ack-write live (post bridge release) — build against the reserved shape + emulator tests NOW; until acks exist, return a clean `{status:'pending'|'unknown'}`-style result, never throw. Mark live-verify as post-P2-A-release.
- **MCP-D4 — `assign_monitor_bus` / `unassign_monitor_bus`.** Write `config/monitor.busAssignments` (the UI `BusAssignmentPanel` already does this; MCP doesn't). **Trusted-leader gated** (admin + band_leader); validate bus ∈ 1..5 + a real uid (admin SDK lookup); `dryRun:true` returns the full plan without writing ([[feedback_dryrun_is_observability]]). Honor the array-form `busAssignments` shape (bus-index-keyed → array of `{userId,userName}`; see the live `config/monitor`). **Fully independent of the bridge — immediately live + useful** (lets Daniel/David assign band IEM buses via Claude; directly serves the ~5/29 rollout).

## Verify
Monitor emulator suite for both tools (get_command_status: applied/rejected/timeout/pending shapes; assign/unassign: trusted-leader ALLOW, musician DENY, invalid bus/uid, dryRun, array-form) + `next build --webpack` exit 0 + check:types + eslint. Tier 2 → SHIP-NOTICE → inbox/auditor.md with deployed bearer-gated `## Repros`: **`assign_monitor_bus` is live-probeable NOW** (assign a test/real uid to a spare bus, dryRun first); `get_command_status` live-verify defers to the P2-A bridge release.

## Boundary
- `src/lib/mcp/**` only; `errors.ts`/`error-envelopes.ts` read-only. Disjoint from P2-A (bridge) + P3-A (iPad consumer).
- Cut a FRESH worktree off current origin/master (tip `4a68de3ec`). Claims staked: `src/lib/mcp/tools/monitor.ts`, `src/lib/mcp/server-monitor.ts`, the MCP tool-registration `index.ts`.
- Your prior P1-B worktree stays until the auditor's deployed bearer-probe closes it (auditor-side; not your concern) — cut P2-B fresh, don't reuse it.
**Action required:** ACK in inbox/supervisor.md, then build.
