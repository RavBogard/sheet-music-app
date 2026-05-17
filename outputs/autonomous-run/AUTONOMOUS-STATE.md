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

### Cycle 1 — 2026-05-17T03:37Z → 2026-05-17T04:48Z

- Cowork report: outputs/autonomous-run/cycle-1/cowork-report.md (34 KB)
- Master SHA at start: d9de5d189
- Master SHA at end:   d9de5d189 (no FF-merge — see "Shipped" below)
- feat/mcp-server SHA at start: 83b321113 (autonomous-run scaffolding)
- feat/mcp-server SHA at end:   194679531
- Cowork wall clock: ~46 min (faster than 6h budget — cowork batched parallel probes)
- Cowork verdict: **SHIPPABLE — land HIGHs first.** No CRIT.
- Findings:
  - CRIT: 0
  - HIGH: 5 (F-001, F-002, F-005, F-012, F-023)
  - MED:  12 (F-003, F-004, F-006, F-007, F-013, F-014, F-015, F-017, F-019, F-021, F-022, F-024)
  - LOW:  2  (F-016, F-018)
  - NOTE: 5  (F-008, F-009, F-010, F-011, F-020)
  - Total: 24
- Shipped commits:
  - **194679531** — fix(mcp/monitor): defensive array guards + structured envelope (cycle-1 F-001/F-002/F-003). Pushed to feat/mcp-server ONLY; master NOT FF-merged. Smoke probe pending — needs the rotated MCP bearer Daniel will supply in the morning.
- Deferred findings (16):
  - F-005 HIGH — wait_for_setlist_change race + stale currentVersion (two plausible fixes, needs Daniel pick)
  - F-012 HIGH — generate_gig_packet base64 wire overflow (needs Storage-URL architecture decision)
  - F-022 HIGH (recategorized from MED) — legal/marketing pages behind auth (A2P SMS compliance concern; surface immediately)
  - F-023 HIGH — browser onSnapshot missing on parent setlist doc (the F5-mystery Daniel reported; browser code, harder smoke surface)
  - F-004 MED — verify_setlist_charts false-positive on Drive-404 + Storage-OK
  - F-006 MED — chartHealth shape drift between preview_publish and publish_setlist dryRun
  - F-007 MED — search_library returns audio/.xlsx/.DS_Store (also F-024)
  - F-013 MED — connector intermittent (Vercel cold-start hypothesis)
  - F-014 MED — commit_staged_changes repack bumps version on every track
  - F-015 MED — error envelope inconsistency across tools (full unification scope)
  - F-017 MED — publishedSnapshot drift banner missing
  - F-019 MED — library duplicate rows (data hygiene)
  - F-021 MED — /api/drive/file/{missing} returns 401 instead of 404
  - F-024 MED — Kabbalat Shabbat.xlsx indexed as chart
  - F-016 LOW — adversarial input stored verbatim (render-safe per cowork verification)
  - F-018 LOW — monitor write tools return ok:true for invalid indices
  - F-008/009/010/011/020 NOTE — informational
- Auto-reverted commits: (none)
- Smoke-probe results: **deferred** — production smoke needs rotated MCP bearer (none in .env.local; daniel rotated 2026-05-16). Unit + emulator + next build gates passed on the shipped fix.
- Termination check: **terminate-manual-handoff** (not in the original enum — this is "loop ended cleanly with one fix shipped + Daniel triage queue queued in the morning"). Reasons: (a) volume of judgment-needed findings exceeds safe overnight scope, (b) cycle-2 cowork can't be auto-spawned because cowork relied on Claude Desktop + MCP, and the spawn path via `claude -p` was never validated for cowork, and (c) smoke probe gate failed at the bearer-availability check.
- Notes for next session: When Daniel resumes, his queue is (in priority order): (1) read this state file + cycle-1 cowork-report.md, (2) supply a fresh MCP bearer, (3) smoke-probe F-001/F-002 fix via curl `/api/mcp` with `list_monitor_buses` + `get_matrix` tool calls — expect them to return structured envelopes, not raw TypeError, (4) if smoke passes, FF-merge feat/mcp-server → master and push, (5) triage the 16 deferred findings (recommend F-022 first for compliance, then F-023 since it's the F5-mystery resolution, then the rest).

## Regression-detection baseline (updated end-of-cycle-1)

```
Last cycle's findings (by ID): F-001 F-002 F-003 F-004 F-005 F-006 F-007 F-008 F-009 F-010 F-011 F-012 F-013 F-014 F-015 F-016 F-017 F-018 F-019 F-020 F-021 F-022 F-023 F-024
Last cycle's total finding count: 24
Cycle-1 shipped IDs: F-001 F-002 F-003 (closed at 194679531 on feat/mcp-server, master deferred)
```

## Regression-detection baseline (template — see cycle-1 block above for the active baseline)

The processor uses this to decide whether cycle N+1 introduced new
issues vs. closed old ones. Compared field-by-field across cycle
reports.

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
