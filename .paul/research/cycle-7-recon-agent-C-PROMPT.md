# Cycle-7 Recon — Agent C: Prior-Cycle Protocol Critique

You are one of three parallel research agents scaffolding the next cowork
stress test for **centralreform.live**. Sibling agents map user flows
(A) and audit cowork capability (B). Your job is the **adversarial
critique** of cycles 1–6: where the protocol over-fit, where the tests
got predictable, what blind spots emerged, what to change for cycle-7.

You are working in `C:\Users\dsbog\CentralReform.live\sheet-music-app\`
on the master branch. Read-only mission.

---

## §0 — Identity

- Sign your deliverable `from recon-agent-C`.
- One-shot research: read, think, write the deliverable, stop.
- Do NOT modify code, run dev server, or push.
- Do NOT consult Agent A's or Agent B's outputs (they run in parallel).

---

## §1 — Mission (one sentence)

Daniel's hypothesis: the cowork test has become predictable and some
protocol decisions are wrong; surface concrete evidence for or against
that hypothesis from the prior-cycle artifacts in the repo, and recommend
specific protocol changes for cycle-7.

You are the adversarial / red-team voice. If everything was fine, say
so — but the default expectation is that you'll find real over-fitting.

---

## §2 — Context to internalize

Six full cowork cycles have run (2 → 3 → 3.5 → 4 → 5 → 6). Each
followed a pattern:

1. PARENT spec authored by Daniel + supervisor → mission profiles
   + green rubric + cross-instance probes.
2. 4 instances dispatched into Claude Desktop tabs, ~75min each.
3. HANDOFFs land → supervisor reconciles into TRIAGE.
4. Cycle-N-fixes wave shipped (3–7 lanes, parallel coders).
5. Cycle closes; rubric → "green" or loop.

Protocol decisions that hardened over the cycles (the binding
standing rules):
- **Binary verdict** (no DEFER) — auditor either ACCEPTs or BLOCKs.
- **Repro-paste mandate** — SHIP-NOTICEs need `## Repros` blocks
  with `observed_pre_fix` / `observed_post_fix`.
- **Supervisor pre-flight** — 5-item gate before prompt-write (MCP
  tool inventory / params / fs paths / memory citations / SHA-bound
  claims).
- **BLOCKS-GREEN vs POLISH triage** — finding-time classification.
- **Cycle-6-fixes = last major wave** commitment (Daniel ratified).
- **Sandbox isolation via uidPrefix** — parallel instances must not
  clobber each other's `test-*` fixtures.

Your job is to interrogate every one of those decisions PLUS the
mission-profile shape itself.

---

## §3 — Read order (load-bearing)

Read in this order. Don't read every PROMPT; sample.

1. **Decisions ledger.**
   `C:\Users\dsbog\CentralReform.live\sheet-music-app\.coord\shared\decisions.md`
   — all ratified protocol decisions. Skim front-to-back; note dates.

2. **Most recent PARENT.**
   `C:\Users\dsbog\CentralReform.live\sheet-music-app\.paul\research\cycle-6-cowork-PARENT.md`
   — the most mature design. Read in full.

3. **PARENT predecessors (sample to detect drift).**
   - `cycle-5-cowork-PROMPT.md`
   - `cycle-4-cowork-PROMPT.md`
   - `cycle-3-cowork-PROMPT.md`
   All at `C:\Users\dsbog\CentralReform.live\sheet-music-app\.paul\research\`.
   Track: how many mission profiles? what changed cycle-to-cycle?
   what stayed the same suspiciously long?

4. **TRIAGE docs.**
   - `cycle-5-fixes-TRIAGE.md`
   - `cycle-6-fixes-TRIAGE.md`
   Both at `.paul\research\`. Note: are findings clustering in the
   same buckets (gig-packet, MCP envelope drift, unauth, a11y)?
   Cluster repetition = test repetition + likely blind spot
   elsewhere.

5. **Fix-lane PROMPTs (sample 2–3 only).** Pick one cycle-5 fix
   prompt + one cycle-6 fix prompt. Read enough to see whether
   fix-lane structure has converged or is still genuinely
   contingent on the findings.

6. **Supervisor running log.**
   `C:\Users\dsbog\CentralReform.live\sheet-music-app\.coord\SUPERVISOR.md`
   — read the §"Cowork prompt pre-flight" standing rule + the most
   recent 2–3 PICKUP POINTER entries. Surface places the supervisor
   self-corrected.

7. **Auditor running log (if present).**
   `C:\Users\dsbog\CentralReform.live\sheet-music-app\.coord\AUDITOR.md`
   — §"Validation workflow" and any recent verdict-discipline
   ratifications.

8. **Memory entries** (read 4–6 only; sample):
   - `[[feedback_cowork_prompt_verify_before_write]]`
   - `[[feedback_cowork_real_harness]]`
   - `[[feedback_sandbox_test_isolation]]`
   - `[[feedback_mcp_lane_deployed_surface_evidence]]`
   - `[[feedback_auditor_deployed_surface_verification]]`
   - `[[project_cowork_sweep_cycle]]`
   At `C:\Users\dsbog\.claude\projects\C--Users-dsbog-CentralReform-live\memory\`.

---

## §4 — Research questions

**Q1. Per-cycle ledger.** For each cycle (2, 3, 3.5, 4, 5, 6) produce
a 3-row mini-table: (a) what it probed (mission profile shape),
(b) what it found (top 2–3 findings + cluster), (c) what it MISSED
(your judgment — what should have shown up but didn't).

**Q2. Finding-cluster repetition.** Across cycles, are the same
buckets producing findings (gig-packet, MCP envelope, unauth/SEO,
a11y, drive-auth, sandbox isolation, observability)? Quantify if
possible. Repetition signals one of:
- (a) genuinely fragile zone (correct, keep probing), OR
- (b) test design biased toward known issues (over-fit), OR
- (c) fix lanes didn't actually fix root cause (regression).
Distinguish for each cluster.

**Q3. Protocol decisions — which were genuinely load-bearing vs
ceremony?** Walk the 6 standing rules in §2 above. For each:
- Evidence it caught a real bug or saved a real session.
- Counter-evidence (a cycle where it slowed things without
  catching anything).
- Recommendation: keep / amend / drop.

**Q4. Predictability symptoms.** Daniel's hypothesis is the test
became predictable. Surface 3–5 concrete symptoms from artifacts:
e.g., "cycle-5 and cycle-6 PARENTs have 87% phrase overlap in
mission profile sections — copy-paste with delta"; or "instance
PROMPTs grew from 250 → 500 lines, all in standing-rules boilerplate,
not mission specifics"; or "finding count plateaued at 13–15 per
instance independent of mission". Be specific.

**Q5. Mission-profile mono-culture.** Cycles 5 + 6 used the same
4-instance shape (Daniel-shadow / webVitals-Sentry / David-shadow
or template-probe / DB-dep-AI-cost). What ALTERNATE shapes were
considered and discarded? What got NO consideration that should
have? (Cross-ref Agent B's §7 if useful, but answer independently.)

**Q6. The "last major wave" commitment.** Cycle-6-fixes is
designated last major wave; Daniel framed this as a commitment.
Is it the right framing — or does the commitment itself create
pressure to declare green prematurely? What's the failure mode if
cycle-7 surfaces 15 BLOCKS-GREEN findings — does the rubric have
slack for that, or has the org been pre-committed to a verdict?

**Q7. Auditor + supervisor friction.** Read recent supervisor +
auditor running logs (§3.6, §3.7). Where are they correcting each
other? Are the corrections converging (protocol maturing) or
oscillating (protocol drift)? Examples welcome.

**Q8. Recommended protocol changes for cycle-7.** Concrete list.
For each: what to change, why, what risk it introduces. Aim for
5–10 surgical changes, not a rewrite. Be willing to recommend
DROPPING decisions — Daniel can pushback.

**Q9. The contrarian profile.** If cycle-7 ran ONE instance with
a deliberately *anti-protocol* shape — no PARENT, no green rubric,
no triage discipline, just "go find what's broken, surprise me" —
would that surface signal the disciplined instances miss? Argue
both sides. If yes, propose the prompt shape.

---

## §5 — Deliverable

Write to:
**`C:\Users\dsbog\CentralReform.live\sheet-music-app\.paul\research\cycle-7-recon-C-PROTOCOL-CRITIQUE.md`**

Shape:
```markdown
# Cycle-7 Recon — Agent C — Prior-Cycle Protocol Critique

**Author:** recon-agent-C
**Date:** 2026-05-19 (or actual)
**Sibling agents:** A (user flows), B (cowork capabilities)

## §1 — Per-cycle ledger (Q1)
[6 mini-tables, terse]

## §2 — Finding-cluster repetition + diagnosis (Q2)
[bucket-by-bucket: fragile / over-fit / regression]

## §3 — Standing rules verdict (Q3)
[6 rules × keep/amend/drop with evidence]

## §4 — Predictability symptoms (Q4)
[3–5 concrete artifacts]

## §5 — Mission-profile mono-culture (Q5)
[what alternates got skipped]

## §6 — The "last major wave" pressure (Q6)
[failure-mode analysis]

## §7 — Supervisor/auditor friction map (Q7)
[converging or oscillating]

## §8 — Recommended protocol changes (Q8) — 5–10 surgical
[what / why / risk]

## §9 — The contrarian-profile thought experiment (Q9)
[for/against + draft prompt if "for"]

## §10 — Open questions for Daniel
```

Target length: 2000–3500 words. Be opinionated; cite evidence;
don't sugarcoat.

---

## §6 — Anti-patterns (what NOT to do)

- DO NOT map user flows (Agent A's lane).
- DO NOT audit cowork harness capabilities (Agent B's lane).
- DO NOT propose specific cycle-7 mission content — propose
  *protocol shape* changes, not findings to probe.
- DO NOT moderate your critique to be agreeable. Daniel asked for
  the adversarial voice. Soften nothing.
- DO NOT cite memories as gospel — memories ARE protocol
  artifacts you're auditing. If a memory looks wrong in light of
  evidence, flag it.
- DO NOT recommend wholesale rewrite. Surgical changes only.

---

## §7 — Go

Read §3 inputs. Answer §4 questions. Write §5 deliverable.

Sign off `from recon-agent-C`. Stop.
