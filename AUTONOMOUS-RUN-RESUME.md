# Resume Prompt — Autonomous-Run Build (Paused 2026-05-16 evening)

Paste this into a fresh Claude Code session in
`C:/Users/dsbog/CentralReform.live` to pick up the autonomous-run
build. Daniel paused mid-build because cowork was already running
the marathon stress test from an earlier prompt upload.

## Context

You (a prior Claude Code session) were today's bugstomp Claude.
Earlier in the day you shipped 6 v6 cowork findings to master
(F-02-pt2, W04 envelope polish, F-07 retry-remount, B-006 orphan
mark, B-007 repack + version backfill, publisher-filter doc).
Tip when paused: `d9de5d189`. Both branches ff-equal.

Daniel then asked you to design a closed-loop autonomous overnight
system: cowork stress test → you process the report → ship fixes →
spawn next cowork to verify → repeat until all-green or
termination. Architecture approved by Daniel:

- **Orchestrator = thin /loop session** (this kind of session, with
  ScheduleWakeup pacing). Polls for cycle's COWORK-DONE.flag.
- **Each cycle = fresh `claude -p` subprocess** with full 1M
  context (avoids the auto-compress detail-loss problem Daniel
  flagged). Reads state, ships fixes per protocol, spawns next
  cowork, exits with ≤500-token summary.
- **State persists in `outputs/autonomous-run/AUTONOMOUS-STATE.md`**
  — single source of truth across cycles.
- **Termination:** all-green (0 CRIT + 0 HIGH + 0 MED) OR cycle
  cap 5 OR time cap 18 hr OR regression abort (cycle N+1 worse
  than N) OR CRIT-mid-cycle paged to Daniel.
- **Auto-shipping with safety rails:** every fix gated on tests +
  build + post-deploy smoke probe; smoke fail = `git revert` +
  push; pure auto-shipping only after gates pass.

## What's already built (load these)

1. `sheet-music-app-mcp/.paul/research/mcp-stress-test-2026-05-17-marathon-PROMPT.md`
   — the marathon stress-test prompt for cowork. Recently edited
   in Phase 11 to instruct cowork to write to
   `outputs/autonomous-run/cycle-{N}/cowork-report.md` + emit
   `COWORK-DONE.flag` when done.
2. `sheet-music-app-mcp/outputs/autonomous-run/AUTONOMOUS-STATE.md`
   — cross-cycle state schema + initial doc with the cycle-1-in-
   flight integration caveat (cowork loaded the prompt BEFORE the
   Phase 11 edits — see §"Cycle 1 — IN FLIGHT" section).
3. `sheet-music-app-mcp/prompts/autonomous-processor-cycle.md` —
   self-contained prompt the cycle subprocess receives. Reads
   state, triages, ships, spawns next, exits with summary.
   Includes hard guards (no --no-verify, no force-push to master,
   no env mutation, no real publish fanout).
4. `sheet-music-app-mcp/prompts/cowork-cycle-1-handoff.md` — a
   message Daniel could have pasted to cowork at cycle-1 launch
   to tell it about the loop architecture. **Not used** — cowork
   was already running when Daniel decided to do the autonomous
   loop. Kept for reference / reuse on future cycle 1s.

## What's NOT built yet (pick up here)

Remaining tasks (open in TaskList):
- **Task #4 — `prompts/autonomous-cowork-cycle.md`** (template):
  parameterized verification prompt for cycle N+1+ cowork. Distinct
  from the marathon: focused on re-testing what cycle N just
  shipped + spot-checking everything else. Outputs report + flag
  at cycle-{N+1}/.
- **Task #5 — `scripts/orchestrator-poll.ts`**: polling script the
  /loop invokes each tick. Checks for COWORK-DONE.flag at current
  cycle path. If found, spawns processor via `claude -p`, returns
  ≤500-token summary. If absent, returns brief status.
- **Task #6 — `prompts/orchestrator-loop.md`**: the /loop input
  Daniel pastes before bed. Each tick runs the poller, parses
  summary, decides continue/terminate. ScheduleWakeup with ~15-min
  delays to pace.

Plus an integration step (NEW, raised by cycle-1-in-flight):
- **Cycle-1 integration:** when cowork finishes, either Daniel
  manually moves its report to
  `outputs/autonomous-run/cycle-1/cowork-report.md` + touches
  `COWORK-DONE.flag`, OR the orchestrator's poller has cycle-1-
  special-case logic that checks multiple known paths and self-
  migrates. Decide which when you resume.

## Repo state when paused

- Branch: `feat/mcp-server` (worktree `sheet-music-app-mcp/`)
- Master ff-equal at `d9de5d189`
- Today's shipped commits (chronological):
  - `84645abbc` F-02-regression-pt2 (HIGH)
  - `173e69e4a` W04 envelope polish (NOTE bundle)
  - `a80a4669c` F-07 retry-remount (LOW)
  - `455744dd0` B-006 orphan-mark (MED — 272 prod rows)
  - `9ac08cdb7` B-007 repack + version backfill (MED — 30+619 docs)
  - `07840c65b` publisher-filter doc (NOTE)
  - `d9de5d189` marathon stress-test prompt (docs)
- Uncommitted: the autonomous-run scaffolding files (Tasks 1-3 +
  7 are written but NOT staged yet). Cowork is mid-flight; don't
  push more until you decide the cycle-1 integration approach.

## Memory state

Auto-memory has been updated this session. Key additions:
- `feedback_mcp_validation_shape.md` (new) — pinned in MEMORY.md.
  THE wrong-target trap for F-02-class fixes.
- `project_mcp_status.md` (updated) — top entry now is the v6
  triage closeout at `07840c65b`.

## Sensitive item

Daniel pasted his MCP bearer `crl_live_22626bb19be81dcd3f75d2563e3ecc904aa6c0315181538c0d2134893764b1e0`
in chat earlier today. He asked me to retain it in conversation
context only (not committed anywhere; not written to disk). He'll
rotate it eventually. Honor that — when you resume, that token is
gone from your context unless he re-shares it; do not attempt to
guess or reconstruct it.

## Daniel's standing posture

"Full autonomous after that" — meaning he's OK with the closed loop
shipping fixes overnight without his review, given the safety rails
(test/build/smoke gates + auto-revert + regression-detection +
cycle/time caps). He also wants "all green" before terminating,
where all-green = 0 CRIT + 0 HIGH + 0 MED.

## When you resume

1. Read this file fully, plus the three built artifacts in §"What's
   already built" — those are your reference frame.
2. Check `outputs/autonomous-run/cycle-1/` — if `cowork-report.md`
   + `COWORK-DONE.flag` are present, cycle 1 finished cleanly and
   you can proceed to triage + ship.
3. Otherwise check `outputs/marathon-stress-test-2026-05-17-report.md`
   or any AppData-sandboxed path Daniel surfaces — that's the
   cycle-1-in-flight cowork's actual output location.
4. Decide cycle-1 integration approach (manual move or poller
   special-case) and execute.
5. Resume building tasks 4, 5, 6 to wire the orchestrator. After
   they're built, kick off cycle 2 via the new pipeline.

## Things NOT to do

- Don't re-do the v6 triage work — it shipped fine, see commits.
- Don't auto-ship cycle-1 findings UNTIL the orchestrator loop is
  wired and you're inside the safety-rail pipeline. First cycle
  through the manual path is OK (you're awake), but per-cycle
  protocol from cycle 2 onward goes through
  `prompts/autonomous-processor-cycle.md`.
- Don't touch bridge/** (CRIT-003).
- Don't try to tighten drive/file auth (intentional public per
  Daniel 2026-05-15).
- Don't re-attempt the F-02 fix at the JSON-RPC error.code layer —
  see [[feedback_mcp_validation_shape]].

— bugstomp processor (paused 2026-05-16 evening)
