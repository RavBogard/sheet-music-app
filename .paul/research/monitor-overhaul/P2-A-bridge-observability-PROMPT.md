# Lane P2-A — Bridge observability + robustness (coder-1) — Tier 2, bridge single-owner, Daniel-gated

Read `.paul/research/monitor-overhaul/PHASE-2-PLAN.md` (Lane P2-A) + `DEFECT-REGISTER.md` (B3/B4/B5/B6/B9/B10/B13) end-to-end first. You own the bridge plane (you shipped P1-A + v10.0.1).

## Context
Phase 1 is LIVE (v10.0.1 on the studio desk): full-state writes + query-after-command + heartbeat all confirmed in prod. P1-A **reserved** the ack-doc shape in C4 but did NOT implement it. Phase 2 makes the bridge observable + robust under multi-musician load.

## Scope (`bridge/src/**` only — single-owner; VERIFY file:lines against CURRENT post-P1-A source, the DEFECT-REGISTER numbers predate your P1-A rewrite — [[feedback_cowork_prompt_verify_before_write]])
- **B6 — ack surface (HEADLINE).** Write `monitor-live/acks/{commandId}` = `{status:'applied'|'rejected'|'timeout', confirmedValue?, reason?, at}` (server-write/client-read, TTL-swept). Hook it where `processCommand` resolves — P1-A's C2 query-after-command gives the confirmed value (applied), a timeout → `timeout`, a validation/desk refusal → `rejected`+reason. This is the data source for P2-B `get_command_status` + the iPad C-9 failure UI.
- **B4 — clock-skew:** move the command timeout + ordering off cross-machine wall-clock `createdAt` onto a monotonic/server-relative basis (or reuse the `stateSeq` you added in C4).
- **B5 — ordering / idempotency** (rests on B4): defined order + dedupe so a re-delivered command can't double-apply.
- **B9 — query/echo correlation:** `query()` keyed only by address can collide now that C2 queries after every command. Add per-request correlation so concurrent same-address query/echo can't cross.
- **B10 — two-bridge guard:** `checkForRunningInstance` only warns; add a single-writer lease/election (e.g. in `config/monitor`) so two PCs don't both drain `pending`.
- **B13 — real `clients` count** (currently hardcoded 0).
- **B3 — VERIFY ONLY:** confirm P1-A's C5 state-age liveness suffices; close residual only, don't redo.

## Verify (mock/unit, NO desk)
Extend the faithful X32 mock + bridge suite: ack written on apply/reject/timeout; correlation under concurrent queries; ordering/idempotency; two-bridge election. Bridge suite green (run from a worktree with complete node_modules — canonical vitest is broken; junction to `sheet-music-app-mcp/node_modules` per your P1-A gotcha) + `check:types` ✅ + eslint.

## Boundary / hard rules
- **★ NO bridge release in this lane.** Code lands + mock-verifies only. The release is a SEPARATE Daniel-gated step, bundled before the ~5/29 rollout — NOT now (we just shipped v10.0.1). STOP + surface if tempted to bump version / touch the release path.
- Keep the ack-doc shape EXACTLY as P1-A reserved it (P2-B + the iPad C-9 build against it).
- Cut a FRESH worktree off current origin/master (tip `4a68de3ec`). Claims staked: `bridge/src/{x32-client,firestore-transport,index,config}.ts`.
- Tier 2: SHIP-NOTICE → inbox/auditor.md (mock/unit evidence; live ack verification defers to the next bridge release).
**Action required:** ACK in inbox/supervisor.md, then build.
