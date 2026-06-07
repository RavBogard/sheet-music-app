# Cycle-7 Recon — Agent C — Prior-Cycle Protocol Critique

**Author:** recon-agent-C
**Date:** 2026-05-19
**Sibling agents:** A (user flows), B (cowork capabilities)
**Scope:** adversarial read of cycles 2 → 6 protocol; no overlap with A/B.

---

## §1 — Per-cycle ledger (Q1)

| Cycle | Probed (mission profile) | Found (top clusters) | MISSED (my call) |
|---|---|---|---|
| **2** (~24min, 618-line monolithic prompt) | MCP surface + browser + mutation parity + cycle-1 regression sweep; 22 findings. Single bearer, autonomous. | REG-001/2/3 envelope; SEC-004 isTest flag; GAP-001 programmatic browser auth; UI-003 dup rows. | Cron-route exposure paths; Storage-vs-Drive divergence under real-world Drive permissions; any test of Daniel's actual mental-model authoring loop (cycle-2 had no MCP-first probe at all even though Daniel had already pivoted). |
| **3** (~ same, 1137-line PEAK prompt) | Wide product audit + cycle-2 carry-forward + a1/a2/a3/a4/b1/b5/b6/c2 ship probes; multi-cohort tagging. | b1 envelope sweep; F-04 substantive HEAD probe; AI subscriber end-to-end; trusted-leader rate-limit (first probe). | The prompt was so wide that the AI-enrichment recipe in §7.B.3 alone was longer than cycle-6 Instance C's entire prompt — and it produced fewer findings than predicted. Wide ≠ deep. Also: no real probe of `bridge/**` even as black-box at the edge (Companion direction was already in motion; would have surfaced sooner). |
| **3.5** (~17min P2-only follow-up via CFC; 375 lines) | Specific cycle-3 ships P2-001..P2-017. CFC-only harness. Self-converged early on resize-window. | 17 findings; a11y rollup; viewport meta lock; web-vitals client. | The whole run hit a harness wall (CFC can't simulate true mobile). That's a META finding, not a product gap — but it foreshadowed cycle-4's CFC+CDP fantasy. The fact that cycle-3.5 hit and acknowledged the wall, yet cycle-4 §2.2 still tried to negotiate CDP attach, is a real protocol-drift smell. |
| **4** ("go big", 746 lines, ~6-8h target) | Cycle-3 close-out + new-bug hunt + BIG testing axis + multi-role concurrency. Prereq handshake + CDP. Single bearer. | 7 HIGH + supplement 1 CRITICAL (UNAUTH-009 slow-3G); cycle-4-fixes + supplement-unauth waves. | The "6-8h walk-away" framing was structurally false — see `[[feedback_cowork_real_harness]]`. So a budgeted ~5h-worth of testing-axis work got crammed into ~75min of real depth and produced lower-fidelity testing findings than designed. The MISS isn't a product surface, it's that the prompt itself encoded a fantasy. |
| **5** (4-way ABCD split, 1704 lines aggregate) | Cycle-4-fixes regression + unauth + David-flow + wide-domain. 74 findings → 6-lane fix wave + 38 ships. | The big-set: C5D-001 XSS, C5D-003 CSP, C5C-006 gig-packet shortcut-merge, C5B-015 contrast, sitemap, login SSR. | **The MISS is now known: C5C-006 shipped, auditor ACCEPTed, fix did not actually close the bug.** Same for C5C-014 + C5D-013 (auditor msg-007 ACCEPT, production absent). So the cycle-5 framework *taught the protocol that it could ship false ACCEPTs*. Verdict integrity, not finding coverage, was the gap. |
| **6** (4-way ABCD mirror cycle-5; 1106 lines aggregate; 50% instance yield) | Behavioral re-verify of 38 cycle-5 ships + fresh unauth + synthetic David + wide-domain+telemetry. 15 BLOCKS-GREEN / 17 POLISH / 6 META / 3 PASS. | C6C-008 (= C5C-006 still extant), C6C-009 missing Firestore index, C6B unauth bundle/SSR set, template-MCP gap. Plus 12 supervisor-prompt-process gaps. | **Two structural misses:** (a) Instance A original aborted at P0 — the protocol's `uidPrefix` claim was unshipped, so disciplined instances got stuck on a protocol bug, not a product bug. (b) Nothing in cycle-6 probed `/monitor` despite the cycle-4 §1.B carry-forward; nothing probed real-user-data; nothing probed real-Safari mobile. The ABCD mirror collapsed surface coverage. |

---

## §2 — Finding-cluster repetition + diagnosis (Q2)

Across the six runs, six clusters recur. Three are fragile-zone (correct to keep probing), two are over-fit (test design biased toward known sores), one is regression (the fix lane didn't actually fix).

- **MCP error envelope / rich-shape** — touched in 2, 3, 4, 5, 6. (a) **Genuinely fragile.** Envelope drift is real and surfaces a new endpoint every cycle (`/api/drive/metadata`, `/api/library/list`, `/login` POST 405, `salvage_chart_bytes` 500-vs-422). The contract is load-bearing for MCP-first authoring. Keep probing — but the probe should be **lint-style continuous**, not handcrafted per cycle. Cycle-7 should ship an "envelope conformance checker" once and stop hand-rolling 50 envelope assertions per cycle.

- **a11y / unauth-edge** — touched in 3.5, 4, 5 (big set), 6 (big set). (b) **Over-fit.** Axe-core on the same six routes returns variations on the same six rules. Cycle-5 + cycle-6 unauth bundles found "login bundle too big" twice — same finding, with the second cycle confirming the first cycle's fix regressed. The cluster is large because the harness *runs the same axe sweep on the same surfaces every time*. Cycle-7 should rotate which routes axe is run against and put a CI guardrail on bundle-size for the routes already audited.

- **Gig-packet / publish** — touched in 1 (F-012), 2, 5 (C5C-006 ship), 6 (C6C-008 same bug). (c) **REGRESSION.** This is the smoking gun. C5C-006 was authored, ACCEPTed, shipped, then cycle-6 Instance C ran the exact same setlist-with-Drive-shortcut probe and found the original bug still happening. That's *the* fix-lane-didn't-actually-fix case. Root cause: auditor ratified code-shape at the worktree; never executed the user-visible repro at the deployed surface. The repro-paste rule (2026-05-19) was created precisely from this incident — but the rule's effectiveness is unproven; Lane 2 cycle-6-fixes BLOCK then UNBLOCK by Daniel-bearer was its first big test, and the test still needed Daniel intervention to land correctly.

- **Sandbox / test isolation** — touched in 5 + 6 + cycle-6-fixes Lane 0. (a) **Fragile but resolved.** Real bug (parallel instances clobbered each other), fixed via `uidPrefix` + prefix-filter cleanup. Now ratified standing rule. Keep, but **stop re-probing it** — cycle-6 META findings on uidPrefix were "we claim it exists but it doesn't" which is a supervisor-pre-flight failure, not a product probe.

- **AI cost / drift** — introduced cycle-3 (a3-AI-enrichment), probed deeply only cycle-6 Instance D. (a) **Genuinely fragile zone, under-probed.** One cycle of evidence; baseline established at green-decl but no drift comparison possible. Cycle-7 should re-probe; this is one of the FEW clusters that hasn't crossed into over-fit yet.

- **Trusted-leader / rate-limit** — probed cycle-3 once (§7.B.5, PASS). Quietly absent cycles 4/5/6. (a) Fragile, but the *cluster's silence* is itself a finding. Cycle-3's burst probe was 50 calls × 3 roles. Since then, role-gate logic has shifted (Lane 6 cycle-5-fixes added `/monitor` exclusion; cycle-3 cowork closed RATE-001 PASS prematurely). No subsequent cycle re-burst-probed. This is an under-fit zone.

**Net diagnosis:** Two clusters are genuinely active fragile zones (envelope, AI cost). Two are over-fit (a11y-unauth, isolation). One is regression-spawning (gig-packet/publish — and the *protocol* for closing it). Two clusters are silent and probably should not be (`/monitor`, rate-limit). The cycle-7 mission shape should reflect this distribution, not the cycle-5/6 ABCD distribution.

---

## §3 — Standing rules verdict (Q3)

Six binding standing rules. One-by-one with evidence and recommendation.

1. **Binary verdict (no DEFER).** *Keep.* Ratified 2026-05-19 explicitly to close the auditor-hallucination gap. One cycle of evidence (cycle-6-fixes wave) — verdict integrity held. Cost: ~5min per ACCEPT. Counter-evidence: zero confirmed cases of binary-verdict slowing the wave. KEEP unchanged.

2. **Repro-paste mandate.** *Keep — but explicitly amend.* Caught C5C-006 retroactively (Instance C re-probed and found the unshipped fix). Worked exactly as designed. But the rule's blind spot: emulator-evidence-only ≠ deployed-surface-evidence. The Lane 2 cycle-6-fixes BLOCK confirmed: a coder can paste a `## Repros` block and still not have probed prod. The follow-up memory `[[feedback_mcp_lane_deployed_surface_evidence]]` is the patch — promote it into AUDITOR.md proper, don't leave it in a feedback memory. AMEND.

3. **Supervisor 5-item pre-flight.** *Keep — provisional.* Brand new (2026-05-19), one cycle of evidence. Caught 12 deploy-vs-claim gaps post-hoc, presumably catches them pre-emptively going forward. BUT: it's a checklist run by the supervisor against itself, which is the agent most likely to skip it under time pressure (the very pattern that caused cycle-6 dispatch failure). The rule depends on the agent being honest about its own work. KEEP for cycle-7, but expect to amend with "auditor pre-validates supervisor's pre-flight evidence" if cycle-7 dispatch fails again.

4. **BLOCKS-GREEN vs POLISH triage.** *Amend.* The rule is reasonable in shape but the *timing* is wrong. Tagging at discovery time creates a pressure gradient: a finding tagged BLOCKS-GREEN delays the wave, so under uncertainty the tagger leans POLISH. Cycle-6 cowork emitted 15 BLOCKS-GREEN + 17 POLISH — symmetric, suspiciously so. AMEND: split the dimensions. Severity (HIGH/MED/LOW) stays at discovery — what the cowork tagger can actually judge. Green-gating (BLOCKS-GREEN vs not) moves to **TRIAGE time**, where the supervisor with full-wave context can decide. Today's rule mashes them together and rewards under-tagging.

5. **"Last major wave" commitment.** *Drop, replace.* Cycle-6 evidence is explicit: even with 15 BLOCKS-GREEN + 12 process gaps + a new verification discipline + a Lane 2 BLOCK requiring Daniel intervention, the response was "scope fits one wave as ~6 lanes." That's the commitment producing premature compression. The decisions.md entry for the commitment-hold says, almost in plain text, "splitting into 2 waves violates the prior 'last major wave' commitment." That's not an engineering argument; that's commitment-defense. Replace with: "post-green = single-lane trailing work BY DEFAULT, but parallel-wave mode auto-revives if any subsequent probe surfaces ≥3 BLOCKS-GREEN or ≥1 regression-of-shipped-fix." Honors the spirit (stop the wave-loop, force ruthless triage). Removes the pressure.

6. **Sandbox isolation via uidPrefix.** *Keep.* Real bug avoided (cross-instance test clobber); cheap. The META finding *about* the rule (claim-vs-shipped) is a supervisor pre-flight failure, not a rule failure. Rule itself is fine.

Net: 3 keep, 2 keep-with-amend, 1 drop-and-replace. Surgical.

---

## §4 — Predictability symptoms (Q4)

Five concrete artifacts of the test becoming predictable. Daniel's hypothesis lands.

1. **Mission-profile shape unchanged cycle-5 → cycle-6.** Cycle-6-cowork-PARENT.md §1 says "Mirror cycle-5: 4 parallel instances (A/B/C/D)." ABCD = {Daniel-shadow regression, unauth audit, David-shadow, wide-domain + telemetry}. Both cycles. Identical. The PARENT doesn't justify the mirror; it asserts it.

2. **Per-instance prompt growth is in protocol carrier, not mission specifics.** Per-instance line counts: cycle-5 ~425 avg; cycle-6 ~277 avg. So per-instance dropped — good. But of the cycle-6 instance prompts I sampled, ~120 of the ~280 lines are bearer/test-prefix/standing-rules/memory-pointers/output-shape boilerplate. That's ~43% of every instance's prompt. The mission-specific content fits in roughly the same word count as cycle-2 (which was 618 lines monolithic + zero protocol boilerplate because the protocol didn't exist yet).

3. **Same-finding-twice across cycles.** C5C-006 (gig-packet shortcut-merge) shipped in cycle-5-fixes Lane 2, auditor ACCEPTed, then Instance C re-probed in cycle-6 with the EXACT same setlist-with-Drive-shortcut probe and got the same observed pre-fix. Two cycles, same finding, same repro. Auditor-protocol patch ratified mid-cycle-6. Then THREE cycle-5 ACCEPTs (C5C-006, C5C-014, C5D-013) were retroactively false-positives caught in cycle-6 — a 7.9% false-ACCEPT rate on cycle-5 ships.

4. **Finding count plateaued.** Cycle-5 emitted 74 across 4 instances (18.5 avg). Cycle-6 emitted 15 BLOCKS-GREEN + 17 POLISH + 6 META + 3 PASS = 41 across 4 (10.3 avg, but with one instance aborted and one blocked — effectively 41 across 2.5 productive instances = 16.4 avg). Within noise. Different missions, same magnitude. That's coverage-saturation, not a coincidence.

5. **Recovery-rule cascade.** 2026-05-19 alone ratified five binding rule changes: binary-verdict, repro-paste, supervisor pre-flight, auditor-as-subboss, MCP-lane bearer evidence. Each was a patch for the prior patch's blind spot. C5C-006 false ACCEPT → repro-paste rule → cycle-6 Lane 2 emulator-only repro → MCP-lane deployed-surface evidence rule. That's a system chasing the next-adjacent failure mode. The cluster of patches is itself an over-fit symptom: the protocol is learning to defend against cycle-6's specific shape, which doesn't generalize to cycle-7 unless cycle-7 is shaped like cycle-6.

There is real over-fitting. Not catastrophic — the patches landed and held — but Daniel's hypothesis is grounded.

---

## §5 — Mission-profile mono-culture (Q5)

The cycle-5/6 ABCD shape (Daniel-shadow / unauth-audit / David-shadow / wide-domain+telemetry) crowded out alternates. Searching decisions.md for "considered and discarded": there is no entry. The ABCD shape was inherited cycle-5 → cycle-6 by assertion ("mirror cycle-5") and never re-evaluated. That's the mono-culture signal.

What got NO consideration that should have:

- **Cross-role concurrency.** Cycle-4 §1.B flagged it as new surface (admin publishes while musician is mid-Perform; band_leader edits while admin re-clones). Cycle-5/6 dropped it. With multi-role realtime sync as part of the product (drift banner, library-signals broadcast), this is one of the highest-likelihood undetected-failure-mode zones.

- **Real-data, read-only probe.** Every cowork probe is `isTest:true` synthetic. The 272-orphan baseline (`[[project_orphan_baseline]]`) was surfaced via real-data inspection — but no cowork instance was *missioned* to inspect real data. That's where data-drift hides.

- **Browser-reality probe (Safari iPad).** The band uses iPads in Perform mode. Cycle-4 was supposed to do real-device emulation via CFC+CDP; that failed structurally. Cycles 5/6 dropped real-device entirely and use Playwright Chromium-in-sandbox. The actual primary-use browser is unprobed.

- **Adversarial / hostile-input.** Cycle-3 §6 had a sliver (Unicode bidi, NUL bytes, very-large-payload). Cycle-4/5/6 lost it. Cycle-7 should restore.

- **Time-shift / cron-interaction.** All cowork runs are Daniel-paste-on-demand (typically evening). Cron behavior at off-hours, drive-sync cadence under real load, AI enrichment under burst — never probed.

- **External-service degradation.** What happens to the in-app surface when Firebase auth flaps for 30 seconds, Gemini API times out, Vercel cold-start hits 4s? Never simulated.

- **Real-user telemetry-driven probe.** Cycle-6 Instance B pulled `webVitalsObservations` for the first time. The right move would be to *use* that data to *choose* the next cycle's surfaces (which routes p95-LCP are worst?). It was treated as a checkbox, not a guide.

The ABCD shape spent 4 instances covering ~3 missions' worth of unique surface (Daniel-shadow + David-shadow heavily overlap; both are MCP-first weekly-flow probes from slightly different angles). Cycle-7 has slack to do 3 instances of genuinely-disjoint missions.

---

## §6 — The "last major wave" pressure (Q6)

This is the protocol decision I'm most adversarial about.

The commitment was ratified 2026-05-19 explicitly to STOP the wave-after-wave loop. Good motive. Real failure mode at the time: cycle-N → cycle-N-fixes → cycle-(N+1) → cycle-(N+1)-fixes was eating Daniel's weekends. Commit to a stopping point, force ruthless triage in the final cycle, ship.

The failure mode of the commitment itself is visible in the exact words used to defend it. From decisions.md 2026-05-19T~19:30Z Decision 2: "Splitting into 2 waves violates the prior 'last major wave' commitment Daniel ratified to end the wave-after-wave loop. The work fits; the constraint is sequencing." That's not engineering reasoning. That's commitment-defense reasoning. The argument is "we committed, therefore one wave."

What happens if cycle-7 surfaces 15 BLOCKS-GREEN? Three plausible paths, in order of likelihood:

1. **Re-tag for fit.** Some BLOCKS-GREEN get re-classified POLISH at TRIAGE time to keep wave count ≤1. The rubric calls them "mutually exclusive and required" — but the line between "MEDIUM affects user-visible flow" and "MEDIUM affects non-critical surfaces" is judgment. Pressure compresses judgment.

2. **Explicit re-commitment ask.** Daniel ratifies cycle-7-fixes as also-the-last-major-wave. Each subsequent cycle reaffirms. Commitment becomes ritual.

3. **Rubric expansion.** Green criteria get broadened to absorb the BLOCKS-GREEN that don't fit. Already happened: Lane 4 cycle-6-fixes was originally "npm audit pass" then declared SUPERSEDED DEAD ON PRE-FLIGHT — verdict-by-redefinition.

The fix isn't to drop the spirit. The fix is to convert the commitment from a hard wave-count cap to a soft re-entry rule: "post-green = single-lane work BY DEFAULT, but parallel-wave mode auto-revives if any subsequent probe surfaces ≥3 BLOCKS-GREEN or any regression-of-shipped-fix." Daniel keeps the win (no default loop). The protocol keeps the safety valve.

If cycle-7 surfaces 15 BLOCKS-GREEN under the current rule, the rubric *has been pre-committed to green*. That is the failure mode.

---

## §7 — Supervisor/auditor friction map (Q7)

I read the supervisor running log (~2400 lines) and the auditor log (~800 lines) tails carefully. The friction is converging fast, not oscillating — but the convergence is concerning in its shape.

2026-05-19 alone produced five binding rule changes; three of them in a single ~6h window:
- ~19:30Z verification-discipline package (3 sub-rules) — auditor SHIP-NOTICE repro-paste + supervisor pre-flight + last-major-wave hold
- ~22:00Z auditor BLOCK of Lane 2 → Daniel-bearer unblock workflow → ratified into [[feedback_mcp_lane_deployed_surface_evidence]]
- ~22:35Z wave-close after Daniel intervention

Each change responded to a real problem the prior change exposed. That's healthy in isolation. The bad smell is the *rate*: five protocol patches in a calendar day means the protocol was below tolerance for the kind of stress cycle-6 imposed. Either the protocol was under-baked entering cycle-6 (it was — verification-discipline was bolted on mid-wave) or cycle-6 itself was atypically stressful.

Specific places supervisor + auditor were correcting each other:

- Auditor msg-007 ACCEPT of cycle-5 Lane 2 (gig-packet shortcut-merge) → Instance C cowork found unshipped → supervisor flagged retroactive false positive → auditor amended Validation Workflow + reissued binary verdict guidance. That's one round of mutual correction; both sides accepted it.

- Lane 2 cycle-6-fixes (template-MCP) BLOCK from auditor → supervisor surfaced via AskUserQuestion to Daniel → Daniel ratified the BLOCK (option 1 over 2/3) → unblock path required Daniel-bearer relay through supervisor → coder re-probed → auditor re-validated ACCEPT. Three-way negotiated, no oscillation.

- Auditor authority widened to "subboss" 2026-05-19T18:00Z. This is auditor *asking permission to do more*, not auditor *overriding supervisor*. Healthy direction.

The friction is converging from above — rules pile on. That's better than oscillating (rules thrash). But it suggests the protocol is approaching a complexity ceiling: each new rule adds load to every future agent's reading-list. AUDITOR.md is 818 lines, SUPERVISOR.md is 2435. A re-fired supervisor reading both files is 4MB+ of context, and decisions.md adds another ~800 lines. Cycle-7 protocol decisions should preferentially *consolidate* (move related rules into a single document section) rather than *append*.

---

## §8 — Recommended protocol changes (Q8) — surgical

Eight changes. None is a rewrite.

1. **Drop the ABCD mirror.** Cycle-7 missions should NOT be authored by reference to cycle-5/6 shape. Specifically: do NOT have a "Daniel-shadow regression validation" instance and a "David-shadow weekly flow" instance in the same wave. They overlap heavily. Replace with one MCP-first weekly-flow instance + one product-real-data instance + one cross-role-concurrency instance. **Risk:** loses behavioral re-verification of cycle-5/6 ships. **Mitigation:** the auditor's cross-lane regression sweep already covers this; promote that explicitly.

2. **Move BLOCKS-GREEN/POLISH tagging from discovery to TRIAGE.** Coworkers tag severity only (HIGH/MED/LOW/INFO). Supervisor tags green-gating at TRIAGE with full-wave context. **Risk:** delays TRIAGE by ~30min per wave. **Mitigation:** that delay is paid against pressure to undertag at discovery, which already costs more than 30min in re-classification debate.

3. **Convert "last major wave" from hard cap to soft re-entry rule.** Post-green single-lane is the default; parallel-wave mode auto-revives on ≥3 BLOCKS-GREEN or any regression-of-shipped-fix. **Risk:** Daniel's wave-loop fatigue could return. **Mitigation:** the auto-revive bar is high (≥3 BLOCKS-GREEN) and the rule explicitly puts the cycle-N+1 trigger inside the protocol, not inside Daniel's judgment.

4. **Promote deployed-surface evidence into AUDITOR.md (`§Validation workflow`), don't keep it in feedback memory.** Today `[[feedback_mcp_lane_deployed_surface_evidence]]` lives in memory only. Memory rots; AUDITOR.md is reread on every re-fire. **Risk:** AUDITOR.md grows. **Mitigation:** delete the feedback memory after promotion (cross-ref kept in memory MEMORY.md).

5. **Cap per-instance prompt length at 200 lines OF MISSION CONTENT.** Carry-over rules and standing protocol move into PARENT-or-AUDITOR.md and are NOT re-pasted in per-instance prompts. Cycle-6 instances had ~120 lines of boilerplate per prompt; that's pure repetition. **Risk:** an instance reads the PARENT poorly and skips a rule. **Mitigation:** acceptable — the PARENT is short, and cycle-6 instances were already supposed to read it.

6. **Add one real-data, read-only mission.** Cycle-7 instance whose job is to inspect actual production data (orphans, dedup state, AI enrichment cache, library_index health) without mutating. Distinct from the synthetic instances that all use `isTest:true`. **Risk:** privacy / chart-access concerns. **Mitigation:** chart-access is already public per `[[feedback_chart_access_policy]]`; setlist contents are public per `[[feedback_setlist_public_policy]]`. The only privacy-sensitive surface is user PII, which a read-only mission can avoid.

7. **Re-introduce adversarial / hostile-input probe** (Unicode bidi, NUL byte, very-large-payload, malformed JSON envelope). Cycle-3 had it; cycle-4-6 lost it. Bundle into one of the cycle-7 instances. **Risk:** none meaningful — these probes are bounded and non-destructive. **Mitigation:** N/A.

8. **Stop re-probing axe-on-the-same-six-routes.** If cycle-5 and cycle-6 both ran axe-core against `/login`, `/perform`, `/library` and produced overlapping findings, that's a CI-guard story, not a cowork-instance story. Ship a CI bundle-size + axe-rule conformance check; remove from cowork scope. **Risk:** misses NEW a11y regressions. **Mitigation:** axe in CI catches what's checkable; cowork rotates to surfaces NOT yet covered.

Optional 9th if Daniel's willing to entertain it: **Time-shift one instance.** Run one of the cycle-7 instances at an off-hours window (Tuesday afternoon US Central). Surfaces time-of-day / cron-interaction / cold-start failure modes. Cheap to try.

---

## §9 — The contrarian-profile thought experiment (Q9)

Argue both sides, then resolve.

**For the contrarian instance:** Cycle-6 Instance A original aborted at P0 because the *protocol* gated it (uidPrefix wasn't shipped) — not because of a product issue. The disciplined instances are now bound by so much scaffolding that their failure mode is increasingly "protocol breakage" rather than "product discovery." A genuinely un-scaffolded instance — no PARENT, no green rubric, no triage discipline, no Repros block, no test-prefix isolation, no Output dir spec — would route around the protocol's blind spots by definition. Daniel's hypothesis (the test became predictable) is in part a hypothesis that the *scaffolding* has become the thing being probed, not the product. A contrarian instance is the cheapest test of that hypothesis.

**Against:** Zero structure = output that supervisor can't triage into lanes. No `findings.jsonl`, no severity tagging, no `surface_cohort`, no `touch_lane` guesses. Parallel-agent dispatch breaks. Cleanup discipline lost. Bearer-leak risk goes up. There is also the second-order risk that a contrarian instance reports "I couldn't find anything" and Daniel reads that as evidence of green-ness when actually it's evidence the contrarian was poorly briefed.

**Resolve — yes, but contained.** Run ONE contrarian instance alongside two disciplined ones. The disciplined siblings carry the structured-finding workload (their output feeds supervisor TRIAGE as today). The contrarian's output is freeform prose, read by Daniel directly, not by supervisor. Its job is to surface NARRATIVES (one big thing that feels wrong) not to enumerate findings. If it surfaces something the disciplined instances missed, the disciplined-instance shape gets adjusted next cycle. If it surfaces nothing, the disciplined-instance shape stays.

**Draft prompt shape (≤25 lines target):**

> You are cycle-7 contrarian. Production target: `https://www.centralreform.live`. Admin bearer: `<INSERT>`. Mounted MCP: `centralreform-live` at `/api/mcp`.
>
> Mission: find the most user-painful broken thing within 60 minutes. Single user. Real workflow. No test-data prefixes. No findings JSONL. No severity tags. No green rubric.
>
> Hard rules: don't mutate real published setlists. Don't `publish_setlist` to real recipients. Don't probe `bridge/**`.
>
> Cleanup: revoke whatever bearer you mint.
>
> Output: HANDOFF.md as a single freeform document. Open with "the most painful thing I found." Spend ~70% of the doc on that one thing. Don't enumerate everything; tell the story of the worst thing. If you find nothing genuinely user-painful, say so plainly.
>
> Stop at 60min wall-clock or when you've answered the question.

That's the whole prompt. Read against the cycle-6c-PROMPT (281 lines), it's ~5% the size. If the contrarian instance produces a narrative that a disciplined instance missed, cycle-7 has its answer. If not, the disciplined-instance shape was probably right and Daniel's predictability hypothesis is partially refuted — also useful information.

---

## §10 — Open questions for Daniel

- **Are you willing to drop the ABCD mirror?** Most of my §8 changes hinge on this. If ABCD is sacrosanct, several of the recommendations become weaker.

- **Is the "last major wave" commitment a hard line or a heuristic?** §6 + §8.3 treat it as a heuristic that should auto-revive. If you treat it as a hard line (no cycle-N+1 fixes-wave under any circumstance), the protocol needs a different escape valve and BLOCKS-GREEN findings get pushed into single-lane trailing work — which roughly inverts the rubric.

- **How much real-data exposure are you comfortable with in a cowork instance?** §8.6 wants a read-only real-data mission. Chart access is already public; setlist contents are public; but cowork would touch actual production setlists by ID. If that's too close, scope drops to inspecting collection-size + orphan-list + cache-state only.

- **Should the contrarian instance run alongside disciplined instances or instead of one?** §9 says alongside (3-instance total: 2 disciplined + 1 contrarian). If you'd rather replace one of the disciplined slots entirely, the disciplined-coverage budget shrinks.

- **Do you want cycle-7 to ship a CI bundle-size + axe-conformance check** before the cowork run, so the cowork stops re-finding the same a11y bundle? §8.8 assumes yes. If no, the cycle-7 a11y cluster will continue.

- **Re-probe `/monitor`?** Cycle-4 §1.B flagged it; cycles 5/6 dropped it. The MCP monitor-mix workstream is still live (Companion direction post-ratification). Cycle-7 has slack for a `/monitor` probe but the prompt would need to say so explicitly.

- **Bearer-rotation discipline going forward.** Cycle-6 burned 5 bearers + reserved 2 + Lane 2 unblock needed a 3rd Daniel-handed one. Cycle-7 with 3 instances + contrarian = 4 bearers minimum. Confirm the pool depth.

from recon-agent-C
