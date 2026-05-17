# Autonomous Cowork — Cycle N+1 Verification Prompt (template)

This file is a **template**, not a standalone prompt. The autonomous
processor (see `prompts/autonomous-processor-cycle.md`) reads this,
substitutes the `{{...}}` placeholders, writes the result to
`outputs/autonomous-run/cycle-{N+1}/cowork-prompt.md`, then spawns
cowork against that rendered prompt.

The substitutions are mechanical — every `{{...}}` token below is
replaced verbatim with the value from the processor's context. Do not
edit the rendered prompt by hand; edit this template if you need to
change cycle-N+1 behavior for all future cycles.

## Substitutions the processor performs

- `{{CYCLE_N_PLUS_1}}` — integer, e.g. `2`
- `{{CYCLE_N}}` — integer, e.g. `1` (the cycle whose fixes this run
  verifies)
- `{{PRIOR_REPORT_PATH}}` — absolute Windows path to cycle-N's
  cowork-report.md
- `{{SHIPPED_COMMITS_BLOCK}}` — markdown bullet list of `<sha>
  <one-line subject>` for every fix the processor shipped this cycle
- `{{DEFERRED_FINDINGS_BLOCK}}` — markdown bullet list of `<id>
  <reason>` for findings the processor skipped/deferred
- `{{REVERTED_COMMITS_BLOCK}}` — markdown bullet list of `<sha>
  <reason>` for any auto-reverts. Empty bullet `(none)` if N/A.
- `{{MASTER_TIP_SHA}}` — production tip at the time cycle-N+1 launches
- `{{RUN_ID}}` — the autonomous-run identifier from AUTONOMOUS-STATE.md
- `{{ISO_NOW}}` — ISO timestamp at render time

---

# CRC Music — Cycle {{CYCLE_N_PLUS_1}} Verification Run (Autonomous Loop, Run {{RUN_ID}})

Rendered: {{ISO_NOW}}
Master tip at launch: {{MASTER_TIP_SHA}}
You are cowork session for cycle **{{CYCLE_N_PLUS_1}}** of an
autonomous closed loop. The processor running in parallel will read
your final report, ship fixes, and spawn cycle {{CYCLE_N_PLUS_1}}+1
based on what you find. **Daniel is not online.** All inputs are this
prompt; all outputs are files; you will not be asked clarifying
questions.

## Mission shape vs. the marathon

This is a **verification + regression-watch** run, not a fresh
whole-product exhaustion sweep. The marathon stress test
(`.paul/research/mcp-stress-test-2026-05-17-marathon-PROMPT.md`)
already enumerated the surface in cycle 1. Your job:

1. **Verify cycle {{CYCLE_N}} fixes landed and work.** For each
   shipped commit (list below), re-run the cycle-{{CYCLE_N}} repro
   and confirm the bug is gone. If a fix didn't take, surface as a
   regression — the processor will retry.
2. **Watch for NEW issues introduced by the cycle-{{CYCLE_N}} fixes.**
   Especially: tools the processor touched, files the processor
   edited, surfaces adjacent to changed code. Look for collateral
   damage.
3. **Spot-check the rest of the product** at lower intensity than
   the marathon — sample-size 1-2 per surface category rather than
   exhaustive enumeration. New bugs in unchanged areas matter, but
   you have less time than the marathon, so prioritize.
4. **Re-check anything that was DEFERRED in cycle {{CYCLE_N}}** —
   list below. The processor skipped these for a reason
   (memory-rule conflict, wrong-target trap, ambiguity) — do NOT
   re-suggest the same fix. If the finding is still present, just
   confirm it's still there with fresh evidence; the processor will
   handle re-triage.

## Cycle {{CYCLE_N}} shipped commits (what to verify)

{{SHIPPED_COMMITS_BLOCK}}

For each commit: read its `git show <sha>` to understand what was
changed and where, then run the SAME repro cowork used in cycle
{{CYCLE_N}} to confirm the bug is now closed. Pass = silently note
in the per-finding table. Fail = file as a REGRESSION finding.

## Cycle {{CYCLE_N}} deferred findings (still expected to be open)

{{DEFERRED_FINDINGS_BLOCK}}

These were intentionally NOT fixed. If they're still present,
re-affirm with one-line "still present, no new info" entries.
**Do not propose fixes** — the processor will read your report
knowing these were deferred and skip them again unless you surface
genuinely new information.

## Cycle {{CYCLE_N}} auto-reverted commits (if any)

{{REVERTED_COMMITS_BLOCK}}

For each reverted commit: confirm the revert took (production is
back to the pre-fix state) AND that the original bug is therefore
still present. File the original bug as a finding with severity
matching cycle-{{CYCLE_N}}'s original finding (probably HIGH or
CRIT, since reverts usually mean a CRIT-grade smoke fail).

## Scope (much narrower than marathon)

### IN scope
- Re-running cycle-{{CYCLE_N}} repros (mandatory)
- MCP tools the processor touched (read `git diff master~N..master`
  to find what changed under `app/api/mcp/**`, `app/api/mcp-bridge/**`,
  or any tool handler)
- Surfaces adjacent to changed files (e.g. if `repack-track-order.ts`
  changed, re-probe the track-order rendering on iPad)
- Sample probes (1-2 per surface): `/library`, `/setlists/[id]`,
  Perform mode on iPad viewport, the `/monitor` route if shipped
- Hard-reset hunt: if you see ANY surface where a manual reload
  would have fixed visible state, flag it as a fresh finding

### OUT of scope (same as marathon)
- `bridge/**` — CRIT-003 deferred
- Tightening drive/file auth (intentional public policy)
- Real publish_setlist to the band — only dryRun or self-publish
- SMS/email/push to non-bugstomp recipients
- Admin panel styling (intentionally out of scope)
- Anything touching firestore.rules, env vars, or production code

## Standing rules (same as marathon)

- Prefix any setlist/chart you create with `⚠️ BUGSTOMP`
- Clean up your fixtures at the end
- Do NOT auto-fix anything — observation only
- Do NOT probe sandbox-only or auth-boundary edge cases that could
  page Daniel during sleep unless the finding genuinely needs
  CRIT-WAKE escalation

## Report shape

Same shape as the marathon report (see Phase 11 of that prompt for
the full spec). Top-to-bottom: Verdict, Run summary, Severity-ordered
findings table, Per-finding details, Per-phase pass/fail (where
"phase" = the verify/watch/spot-check categories above), Hard-reset
findings, NEW MCP-gap findings (only NEW ones; cycle-{{CYCLE_N}}'s
gaps don't need re-listing), Performance numbers (only deltas
vs. cycle {{CYCLE_N}}), Surfaces NOT probed, Cleanup confirmation,
Particularly want to know, Artifacts.

### Severity bar (same as marathon)

- **CRIT** — breaks Daniel's MCP-first weekly authoring flow, the
  band's iPad surface, an auth boundary, OR production data
  corruption. Write `CRIT-WAKE-DANIEL.flag` in addition to the
  normal flag.
- **HIGH** — wrong/silent data, orphan manufacture, regression of a
  prior fix
- **MED** — degraded UX with workaround, observable inconsistency
- **LOW** — cosmetic, edge-case, log spam
- **NOTE** — observations worth flagging that aren't bugs

### Special severity rule for this cycle

A **regression of a cycle-{{CYCLE_N}} fix** is automatically at
least HIGH (often CRIT, depending on the original bug's grade).
Mark it explicitly as `REGRESSION` in the finding ID so the
processor handles it with priority on the next cycle.

## Output paths (deterministic — DO NOT VARY)

When you finish:

- Report → `C:\Users\dsbog\CentralReform.live\sheet-music-app-mcp\outputs\autonomous-run\cycle-{{CYCLE_N_PLUS_1}}\cowork-report.md`
- Flag (LAST step, after report is verified on disk) →
  `C:\Users\dsbog\CentralReform.live\sheet-music-app-mcp\outputs\autonomous-run\cycle-{{CYCLE_N_PLUS_1}}\COWORK-DONE.flag`
  containing a single line with the ISO timestamp.
- CRIT-WAKE (only if a CRIT was found mid-run) →
  `C:\Users\dsbog\CentralReform.live\sheet-music-app-mcp\outputs\autonomous-run\cycle-{{CYCLE_N_PLUS_1}}\CRIT-WAKE-DANIEL.flag`
  containing a single line with the CRIT-ID and one-sentence
  summary.

**The directory already exists** (the processor mkdir'd it before
spawning you). Do NOT write to any other path; the orchestrator
poller only watches the deterministic path.

## Anti-patterns

- Don't re-do the whole marathon. You don't have the budget, and
  it's wasteful.
- Don't propose fixes for deferred findings — the processor will
  skip them again.
- Don't auto-fix.
- Don't probe `bridge/**`.
- Don't fire a real SMS/email/push/notification to anyone outside
  the bugstomp scope.

## Time budget

Aim for ~90-120 min, not 6+. If you blow past 3 hr without
finishing, write what you have, emit the flag, and exit — a
partial report with the flag set is better than a complete report
the orchestrator never sees.

## Particularly want to know

Answer in the report:

1. Did any cycle-{{CYCLE_N}} fix not take?
2. Did any cycle-{{CYCLE_N}} fix introduce a new regression?
3. Is there a NEW CRIT in unchanged surface that cycle 1 missed?
4. Is the regression-detection counter (total findings) trending
   down vs. cycle {{CYCLE_N}}? (You don't need to know the prior
   count; just report your own total and the processor compares.)

---

*Rendered from `prompts/autonomous-cowork-cycle.md` by the
autonomous processor for run {{RUN_ID}}, cycle
{{CYCLE_N_PLUS_1}}.*
