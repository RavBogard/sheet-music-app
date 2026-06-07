# Cycle-7 Recon — Agent B: Claude Cowork Capability + Constraint Audit

You are one of three parallel research agents scaffolding the next cowork
stress test for **centralreform.live**. Your sibling agents are mapping
user flows (A) and critiquing prior-cycle protocol (C). Your job is to
audit **what Claude cowork can actually do, what it cannot, and what
mission shapes work in practice** — so the next cowork test is designed
around real capability, not aspirational capability.

You are working in `C:\Users\dsbog\CentralReform.live\sheet-music-app\`
on the master branch. Read-only mission.

---

## §0 — Identity

- Sign your deliverable `from recon-agent-B`.
- One-shot research: read, think, write the deliverable, stop.
- Do NOT modify code, run dev server, or push.
- Do NOT consult Agent A's or Agent C's outputs (they run in parallel).

---

## §1 — Mission (one sentence)

Produce a grounded capability map of Claude cowork as deployed against
this repo — what worked, what failed, what new mission profiles cycle-7
should try — so the next test isn't designed around assumptions that
prior cycles already disproved.

---

## §2 — Context to internalize before reading any file

Cowork = parallel Claude Desktop tabs (typically 4) hitting the live
deployed surface via MCP bearer + in-sandbox Playwright harness +
chrome.debugger DevTools probes. Each instance runs a ~75-min single-
threaded mission. Bearers are `crl_live_*` minted via `/settings/mcp`,
one per instance, burned on use. Output: HANDOFF.md + findings.jsonl +
artifacts/ (screenshots, PDFs, JSON dumps).

Three structural truths worth remembering before you read:

1. **NOT walk-away.** Sessions run ~75min single-thread, not 6–8h
   autonomous. Daniel babysits across tabs. See
   `[[feedback_cowork_real_harness]]`.
2. **Web SDK auth doesn't fully work.** `/api/auth/test-session` gives
   a session cookie but no client-side `firebase.auth().currentUser`.
   META-003 blocks any probe that needs client-data Firestore reads.
3. **In-sandbox Playwright IS the harness.** `cycle-4/harness/` is the
   survival-guaranteed reference; reuse it. CFC+chrome.debugger ALONE
   doesn't work as the primary harness.

---

## §3 — Read order (load-bearing)

Read these in this order. Don't read every file in `.paul/research/`;
sample with `Grep` for patterns.

1. **Memory entries** (priority — these encode lessons already learned):
   - `[[feedback_cowork_real_harness]]`
   - `[[feedback_mcp_lane_deployed_surface_evidence]]`
   - `[[feedback_sandbox_test_isolation]]`
   - `[[feedback_self_inclusion_test_fixtures]]`
   - `[[feedback_cowork_prompt_verify_before_write]]`
   - `[[feedback_mcp_validation_shape]]`
   - `[[project_ai_cost_baseline]]`
   - All at `C:\Users\dsbog\.claude\projects\C--Users-dsbog-CentralReform-live\memory\`

2. **The harness itself.** `Glob` for
   `C:\Users\dsbog\CentralReform.live\sheet-music-app\cycle-4\harness\**`
   — read the entrypoint + at most 2 representative probe scripts.
   Understand: how a cycle-N instance actually invokes Playwright,
   handles auth, captures artifacts.

3. **Most recent PARENT spec.**
   `C:\Users\dsbog\CentralReform.live\sheet-music-app\.paul\research\cycle-6-cowork-PARENT.md`
   — 4 mission profiles + green rubric + cross-instance data probes.
   This is the design Daniel is asking you to interrogate for
   over-fitting.

4. **Prior PROMPTs** (sample, don't read all):
   - `cycle-6a-cowork-PROMPT.md` (Daniel-shadow)
   - `cycle-6c-cowork-PROMPT.md` (David-shadow with template gap)
   - `cycle-6d-cowork-PROMPT.md` (DB + dep + RTL + AI cost)
   - `cycle-5a-cowork-PROMPT.md` (compare-and-contrast prior shape)
   - All at `C:\Users\dsbog\CentralReform.live\sheet-music-app\.paul\research\`

5. **Stress-test memos** (skim for capability data points):
   - `mcp-stress-test-2026-05-15.md`
   - `mcp-stress-test-2026-05-17-marathon-PROMPT.md`
   - `mcp-stress-test-2026-05-15-followup-PROMPT.md`

6. **Cycle-6 TRIAGE** —
   `C:\Users\dsbog\CentralReform.live\sheet-music-app\.paul\research\cycle-6-fixes-TRIAGE.md`
   — 15 BLOCKS-GREEN + 17 POLISH + 6 META + 3 PASS. Skim the META
   findings; those are *cowork-itself problems* (auth gates, scripts
   missing, etc.) and are the clearest capability-edge signals.

7. **MCP server surface.** `Glob`
   `C:\Users\dsbog\CentralReform.live\sheet-music-app\src\lib\mcp\tools\**`
   — tool inventory. Count + categorize (read, write, role-gated,
   trusted-leader-bypass).

---

## §4 — Research questions

**Q1. What harness capabilities are *survival-guaranteed* today?**
For each: (a) in-sandbox Playwright login + session, (b) MCP bearer
write + read, (c) PDF inspection, (d) console-log capture, (e) network
log capture, (f) screenshot capture, (g) Firestore-direct probes. For
each, GREEN (works reliably) / YELLOW (works with caveats) / RED
(blocked by META-003 or other structural gap). Cite evidence.

**Q2. What is the realistic per-instance time budget?** Prior cycles
nominally 75-90min. What's the breakdown — boot + auth-mint + harness
spin-up + probing + HANDOFF-write? Where does time actually go that
prompt design under-budgets for?

**Q3. Bearer economy.** Each instance burns 1 bearer. Cycle-6 burned
7. What's the cost/benefit of bearer pool sizing? Should cycle-7 mint
fewer bearers and serialize, or more and parallelize harder? Justify
from prior-cycle data.

**Q4. Prompt-length sweet-spot.** Prior PROMPTs ran 250–500 lines.
Did longer prompts produce better findings? Did they over-constrain
the agent and produce predictable outputs? Sample lengths + look at
HANDOFFs (if any are committed) to judge.

**Q5. Cross-instance coordination — does it work?** Cycle-6 PARENT
designed cross-instance data probes (webVitals+Sentry → B; DB+dep+RTL+
AI cost → D; templates → C). Did instances actually deliver
cross-instance synthesis, or did each silo? What's the realistic
ceiling on coordination?

**Q6. Anti-pattern catalog.** Surface 5–10 cowork anti-patterns
observable from prior cycles. Example shapes: "prompt cites a tool
that doesn't exist → instance aborts mid-probe"; "PARENT scope creeps
during instance run, instance reports against stale scope"; "synthetic
sandbox isolation collides across parallel instances absent uidPrefix".
Cite at least 2 from `[[feedback_sandbox_test_isolation]]` /
`[[feedback_cowork_prompt_verify_before_write]]`.

**Q7. New mission profiles cycle-7 should try.** Brainstorm 4–8
candidate profiles that depart from the cycle-5/6 mold (Daniel-shadow,
David-shadow, webVitals+Sentry, DB+dep+AI). Examples to consider (not
prescribe): chaos / failure-injection, public unauth crawl, mobile
viewport sweep, longitudinal session-replay (multi-day), live-data
diff against prod baseline, accessibility-only deep dive, multi-user-
concurrent race probe, observability/error-budget assertion. For each
candidate: what unique signal does it surface that cycle-5/6 missed?

**Q8. Cowork vs alternatives.** Should *some* of the cycle-7 work
NOT use cowork at all? E.g., a single fresh Claude Code session
reading the repo, or a manual Daniel probe, or a Lighthouse CI run,
or human-only iPad shake-out at Friday service. Be opinionated about
where cowork is overkill or under-powered.

---

## §5 — Deliverable

Write to:
**`C:\Users\dsbog\CentralReform.live\sheet-music-app\.paul\research\cycle-7-recon-B-COWORK-CAPABILITIES.md`**

Shape:
```markdown
# Cycle-7 Recon — Agent B — Cowork Capability + Constraint Audit

**Author:** recon-agent-B
**Date:** 2026-05-19 (or actual)
**Sibling agents:** A (user flows), C (protocol critique)

## §1 — Harness capability map (Q1) — GREEN/YELLOW/RED table

## §2 — Per-instance time budget (Q2)

## §3 — Bearer economy (Q3)

## §4 — Prompt-length sweet-spot (Q4)

## §5 — Cross-instance coordination ceiling (Q5)

## §6 — Anti-pattern catalog (Q6)

## §7 — Candidate cycle-7 mission profiles (Q7) — 4–8 ranked

## §8 — Cowork vs alternatives (Q8)

## §9 — Open questions for Daniel
```

Target length: 1800–2800 words. Capability tables welcome; prose
should be terse.

---

## §6 — Anti-patterns (what NOT to do)

- DO NOT map user flows (Agent A's lane).
- DO NOT critique past protocol decisions for their own sake — focus
  on *what capability data they reveal*. (Agent C critiques.)
- DO NOT recommend specific findings to probe (that's Agent A + the
  cycle-7 spec). Stay at the capability/profile/harness layer.
- DO NOT recommend rewriting the harness from scratch. cycle-4/harness/
  is survival-guaranteed; recommend AT MOST incremental patches.
- DO NOT speculate about Claude internals beyond what's observable in
  outputs.

---

## §7 — Go

Read §3 inputs. Answer §4 questions. Write §5 deliverable.

Sign off `from recon-agent-B`. Stop.
