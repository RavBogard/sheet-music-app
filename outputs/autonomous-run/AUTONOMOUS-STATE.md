# Autonomous-Run State

This file is the cross-cycle source of truth. Every cycle processor
reads this BEFORE doing anything, and rewrites it AS THE LAST STEP
before exiting. Append-only history; never delete past cycle entries.

If you are a cycle processor: load this, parse it, work, then
overwrite-in-place with the updated version (preserving the
history block).

---

## Run identity

- **Run ID:** auto-run-2026-05-17T0411Z
- **Started:** 2026-05-17T04:11:32Z
- **Initial master SHA:** d9de5d189eefcef4bdc2804e5d7f8e4d820353bf
- **Current cycle:** 1 (in flight — cowork already running as of 2026-05-16 evening)
- **Orchestrator:** in-session orchestrator (this Claude Code session), self-pacing via ScheduleWakeup. Daniel asleep starting 2026-05-17T04:11Z.

## Cycle 1 — IN FLIGHT (redirect-mid-flight resolved 2026-05-16 ~23:05 CDT)

**Original problem:** Cowork received the marathon prompt at its
sandbox AppData path BEFORE the prompt was edited (Phase 11) to add
cycle-path + COWORK-DONE.flag instructions. So at launch cowork
would have defaulted to writing
`outputs/marathon-stress-test-2026-05-17-report.md` with NO flag.

**Resolution:** Daniel relayed an in-conversation redirect message
to cowork mid-run (text in this conversation's transcript, drafted
by the processor session at resume time). Cowork acknowledged the
redirect by writing a `write-probe.txt` containing `probe` at
`outputs/autonomous-run/cycle-1/write-probe.txt` (timestamp
~23:06:14 CDT 2026-05-16). This confirms cowork can reach the
deterministic path and is following the new protocol.

**Expected outcome:** when cowork finishes its run, it writes
`outputs/autonomous-run/cycle-1/cowork-report.md` followed by
`outputs/autonomous-run/cycle-1/COWORK-DONE.flag` per the redirect
instructions. The orchestrator's poller picks up the flag on its
next tick and dispatches a processor subprocess.

**Poller cycle-1 special case: NOT NEEDED.** The redirect message
made it unnecessary. `scripts/orchestrator-poll.ts` does not check
legacy paths.

Cycles 2+ follow the new protocol because the processor renders the
cycle-N+1 cowork prompt from `prompts/autonomous-cowork-cycle.md`,
which always specifies the deterministic cycle-N+1 path.

## Termination conditions

- All-green threshold: **0 CRIT + 0 HIGH + 0 MED** in latest cowork report
- Cycle cap: **5**
- Time cap: **18 hours from Started**
- Regression abort: if cycle N+1 has MORE total findings (sum across
  severities) than cycle N, abort + page Daniel
- CRIT-found mid-cycle: cowork writes `CRIT-WAKE-DANIEL.flag`,
  processor pages Daniel via PushNotification immediately, continues
  shipping fix
- Smoke-fail after deploy: auto-revert the offending commit
  (`git revert <sha>` + push), log the regression, continue

## Cycle history

Each completed cycle appends a block here. Schema:

```
### Cycle <N> — <ISO start> → <ISO end>
- Cowork report: outputs/autonomous-run/cycle-<N>/cowork-report.md
- Master SHA at start: <sha>
- Master SHA at end:   <sha>
- Findings:
  - CRIT: <count> (ids: ...)
  - HIGH: <count> (ids: ...)
  - MED:  <count> (ids: ...)
  - LOW:  <count> (ids: ...)
  - NOTE: <count> (ids: ...)
- Shipped commits: <list of SHAs with one-line summary>
- Deferred findings: <list of ids + reason>
- Auto-reverted commits: <list of SHAs + reason>
- Smoke-probe results: <pass/fail per fix>
- Termination check: <continue | terminate-green | terminate-cap | terminate-regression | abort-crit>
- Notes: <free-form for next cycle>
```

(No entries yet — first cycle still pending.)

## Regression-detection baseline

The processor uses this to decide whether cycle N+1 introduced new
issues vs. closed old ones. Compared field-by-field across cycle
reports.

```
Last cycle's findings (by ID): <empty until cycle 1>
Last cycle's total finding count: 0
```

## Safety locks

- `.autonomous-run-paused.lock` in this directory → if it exists,
  the processor must NOT ship anything and instead must page Daniel
  and exit. Daniel can write this file manually to pause the loop.
- `.autonomous-run-aborted.lock` → set by processor on regression
  abort or cap-reached; loop must terminate cleanly and not spawn
  more cowork.

## Notes for the cycle processor

- This file is your only persistent state between cycles. Don't
  rely on conversation memory.
- Auto-memory at `~/.claude/projects/C--Users-dsbog-CentralReform-live/memory/`
  is still authoritative for project context. Load it normally.
- The cowork report at the current cycle's path is your task spec.
- Before shipping any fix, gate on: emulator tests pass + tsc clean
  + next build clean + (after deploy) smoke probe of the changed
  surface passes. If any gate fails, do NOT push; log and continue
  to next finding.
- After all findings handled, write the next cowork prompt at
  `outputs/autonomous-run/cycle-<N+1>/cowork-prompt.md`,
  spawn cowork, update this file with cycle N's results, exit with
  ≤500-token summary line.
