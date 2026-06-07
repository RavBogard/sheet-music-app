# Cycle-7 Recon — Agent B — Cowork Capability + Constraint Audit

**Author:** recon-agent-B
**Date:** 2026-05-19
**Sibling agents:** A (user flows), C (protocol critique)
**Anchor SHA at recon time:** `59b25c87a` (master tip per `.coord/shared/master-tip.md`)
**Scope:** read-only audit of cowork *capabilities and shapes* — not findings, not user flows, not protocol critique.

---

## §1 — Harness capability map (Q1)

Verdicts are evidence-anchored. GREEN = ≥2 cycles delivered without harness reframe. YELLOW = works with documented caveat or required ad-hoc rebuild. RED = structural blocker per `[[feedback_cowork_real_harness]]` / `[[feedback_mcp_lane_deployed_surface_evidence]]`.

| # | Capability | Verdict | Evidence anchor |
|---|---|---|---|
| a | In-sandbox Playwright + session cookie | **GREEN** | `cycle-4/harness/lib/probe.mjs::mintSession` — POSTs `/api/auth/test-session`, sets `__session` jar-side; 4+ cycles consume without rebuild. |
| b | MCP bearer write + read | **GREEN** with provenance rule | Cycle-1..6 ran ~24 tools live. But: emulator-only evidence is **insufficient** per 2026-05-19T~19:30Z Decision 1; lane prompts MUST mint a coder-bearer for deployed REPRO transcripts (`[[feedback_mcp_lane_deployed_surface_evidence]]`). |
| c | PDF inspection (e.g., gig-packet pages, shortcut-merge) | **YELLOW** | Cycle-5 + cycle-6 successfully verified gig-packet PDF shape via `generate_gig_packet` response + manual SHA-anchored open. No general-purpose PDF byte/page diff probe exists — Lane-1 used a Lechu-Goldman canonical fileId as a fixture, not an automated diff. |
| d | Console log capture | **GREEN** | Playwright sandbox surfaces `page.on('console')`; cycle-4 + cycle-3.5 P2-005 FOUC + P2-017 web-vitals all exercised this. |
| e | Network log capture | **GREEN** | Playwright `page.on('request' \| 'response')` + `attachWebVitals` in `probe.mjs`. Cycle-6 Instance B did webVitals + Sentry pulls using this path. |
| f | Screenshot capture | **GREEN** | Standard `page.screenshot()` — present in every cycle since cycle-2. |
| g | Firestore-direct probes (client-data via Web SDK) | **RED → YELLOW** as of 2026-05-18 META-003 ship `8fec5291f` | META-003 fix returned `customToken` from `/api/auth/test-session`; `probe.mjs::mintSession` now awaits `signInWithCustomToken` when `firebaseAuth` is passed. CAVEAT: many cycle-6 instance prompts still don't pass `firebaseAuth`, so the warning log fires; the *capability* is YELLOW because it works *if wired*, but most prompts don't wire it. |
| h | CFC + `chrome.debugger` for true-mobile CDP | **RED, structural** | CFC build lacks the manifest permission; the toggle doesn't exist on `chrome://extensions/`. Verified by Daniel 2026-05-18T22:00Z. No path forward inside CFC. |
| i | Absolute CWV/RTT measurement | **RED** | Sandbox = datacenter egress. Relative throttle comparisons valid; absolute "real-iPad-in-synagogue" RTT is unattainable. |
| j | Cross-instance live coordination (instance ↔ instance) | **RED** | No shared mailbox; supervisor reconciles HANDOFFs serially after run. Section §5 below. |
| k | Long-running / multi-day sessions | **RED** | CFC conversation context ceiling + Daniel attention budget. Session converges in ~75min focused; ~120min is ceiling. |
| l | Trusted-leader (band_leader) seat probe | **GREEN** as of cycle-6 Lane 0 ship | `create_test_account({role:'band_leader', uidPrefix})` deployed with uidPrefix at `a42fd8a47`+; verified by cycle-6 Instance C C6C series. |

**Take:** the harness is **stable on the JS/Playwright surface** (a, d, e, f) and **stable on the MCP read/write surface** (b, l). The cracks are around (c) PDF byte-diff, (g) Web-SDK auth (works if wired but every prompt forgets), and the structural REDs (h, i, j, k) — which cycle-7 design must route around, not around-fight.

---

## §2 — Per-instance time budget (Q2)

Reading cycle-4 HANDOFFs + cycle-6 Instance A abort + 4 cycle-6 prompt §3 sections, here's the empirical breakdown for a ~90-min "focused depth" run:

| Phase | Wall-clock | Notes |
|---|---|---|
| Boot + filesystem MCP mount handshake (§3.1) | 2–4 min | `read_file` on `package.json`. Cheap; rarely fails. |
| Bearer probe (§3.2: `list_library({limit:1})`) | 1–2 min | Cheap. |
| Harness discovery (§3.3: `find probe.mjs`) | 3–8 min | Variable — first time in a new sandbox, longer; later cycles cache. |
| uidPrefix isolation sanity (§3.4) | 2–4 min | Mint test user, verify uid shape, revoke. |
| Confirmation post + master baseline capture | 2 min | Trivial. |
| **Subtotal: prereqs** | **10–20 min** | **~15–22% of a 90-min budget burned before P1.** |
| Mission probes (P1–P5) | 40–70 min | Where actual signal-generation happens. |
| HANDOFF.md authoring + findings.jsonl emit + screenshots flush | 10–20 min | Cycle-6 Instance A documented this as load-bearing — easy to under-budget. |
| Cleanup (`cleanup_all_test_data({prefix})`) + bearer-burn note | 2–5 min | Cheap if uidPrefix discipline held; expensive if not (cross-instance contamination cleanup). |

**Where time *actually* goes that prompts under-budget:**

1. **Prereq stall on missing schema.** Cycle-6 Instance A aborted at P0 §3.4 because `uidPrefix` wasn't deployed — burned ~20 min before bailing. Prompts written against memory-as-deployed-fact pay this tax. `[[feedback_cowork_prompt_verify_before_write]]` is the post-mortem rule.
2. **Harness rebuild when sandbox is fresh.** Pre-2026-05-19 ratification, instances re-rolled harness primitives inline because `scripts/` wasn't ship-canonical. The ratification (Lane 6 `a42fd8a47`) closed this in principle — but the prompt note still consumes ~5 min of "verify scripts/ present."
3. **HANDOFF write.** Less under-budgeted than the rest, but Instance C cycle-6 (~140 min budget) still ran its HANDOFF flush into the tail end.
4. **Mission-creep on adjacent surfaces.** If a probe surfaces an unexpected gap (e.g., C6C-008 gig-packet shortcut drop), the instance can spend 20+ min triangulating before logging — eating the next planned probe's budget.

**Practical sweet-spot:** **budget 75 min** in prompt copy, **expect 90–110 min** of wall-clock, **never promise > 120 min single-thread.** Daniel cannot walk away (see `[[feedback_cowork_real_harness]]`); this is a focused depth-run, not a duration-run.

---

## §3 — Bearer economy (Q3)

Cycle-6 dispatched 4 instance prompts (A/B/C/D). Instance A re-fired as "A-headline" after the original abort → 5 bearers. The recon prompt's "7" likely also counts the 2 pre-flight test bearers Daniel minted during the cycle-6 dispatch repair (and burned on `tools/list` probes). The TRIAGE says "5 burned bearers from cycle-6 dispatch need revoke" — that's the dispatch surface. Net wall-clock cost of 5–7 bearers per cycle: low (minting via `/settings/mcp` is ~30 sec each); the friction is *Daniel-attention* during rotation, not bearer count.

**Pool sizing options for cycle-7:**

| Pool size | Pros | Cons |
|---|---|---|
| **1 (serialize)** | Trivial bearer hygiene; zero cross-instance contamination risk; cheapest to rotate. | Loses parallelism's primary advantage — independent fresh-eyes across mission profiles. Reduces to "one big cowork session," which is functionally cycle-3 shape. |
| **2 (paired)** | Permits a write-mission + read-mission to cross-validate (e.g., A writes test data; B reads it under fresh-eyes). Halves bearer rotation. | Loses cycle-5/6's cross-domain coverage (David-shadow + unauth + DB + AI cost as 4 different lenses). |
| **3 (current cycle-3 shape)** | Sweet-spot historically; uses CARL "up to 5 concurrent" ceiling with headroom. | Still pays full prereq tax × 3. |
| **4 (cycle-5/6 shape)** | Maximum domain coverage; matches the 4-axis green rubric (regression + unauth + David-flow + wide-domain). | Highest contamination risk if `uidPrefix` discipline slips (caught 2026-05-19 in cycle-6 Instance A abort). |
| **5+** | Theoretically possible but Daniel-attention saturates; cycle-6 already strained at 4. | Diminishing signal-per-bearer-burned. |

**Recommendation (capability-grounded, not mission-prescriptive):** cycle-7 should default to **3 instances**. The cycle-5/6 4-way shape paid full ~10 min prereq tax × 4 = 40min collective overhead AND surfaced contamination issues (`[[feedback_sandbox_test_isolation]]`); 3 instances cover the must-have axes (regression / fresh-eyes / synthetic-flow) with 25% less rotation friction. If cycle-7 needs a 4th axis (e.g., AI cost pull from `[[project_ai_cost_baseline]]`), fold it into the wide-domain instance rather than spinning a dedicated bearer.

**Justification from prior-cycle data:** cycle-6 Instance D's AI-cost pull was budget-friendly *because* it was a single tool call (`dump_collection_size` + Cloud Console snapshot); it didn't need its own instance, it needed its own *probe slot* inside an existing instance.

---

## §4 — Prompt-length sweet-spot (Q4)

Empirical line counts of every cowork PROMPT shipped (`wc -l` against `.paul/research/`):

| Cycle | Prompt | Lines | Observation |
|---|---|---|---|
| 3 | `cycle-3-cowork-PROMPT.md` | 1137 | longest single-instance prompt ever shipped |
| 4 | `cycle-4-cowork-PROMPT.md` | 746 | also single-instance |
| 2 | `cycle-2-cowork-PROMPT.md` | 618 | single-instance |
| 4 | `cycle-4-supplement-unauth-cowork-PROMPT.md` | 578 | follow-up probe |
| 5d | `cycle-5d-cowork-PROMPT.md` | 520 | 4-way era begins; 5d still verbose |
| 5c | `cycle-5c-cowork-PROMPT.md` | 442 | David-flow first version |
| 5a | `cycle-5a-cowork-PROMPT.md` | 394 | regression close-out |
| 3.5 | `cycle-3.5-cowork-PROMPT.md` | 375 | P2-only sweep, tighter |
| 5b | `cycle-5b-cowork-PROMPT.md` | 348 | fresh unauth audit |
| 6a | `cycle-6a-cowork-PROMPT.md` | 296 | refactored — PARENT carries boilerplate |
| 6d | `cycle-6d-cowork-PROMPT.md` | 289 | same era as 6a |
| 6c | `cycle-6c-cowork-PROMPT.md` | 281 | same |
| 6b | `cycle-6b-cowork-PROMPT.md` | 240 | shortest production cycle-6 |
| 6a-headline | `cycle-6a-headline-cowork-PROMPT.md` | 186 | abort-recovery re-prompt |

**Trend:** cycle-3 (1137) → cycle-4 (746) → cycle-5 (~350–520 range) → cycle-6 (~240–296 range). Roughly **3.8× compression from cycle-3 to cycle-6**. Driver: PARENT extracted shared boilerplate (policy primer, harness reality, prereqs handshake) into a parent spec, and each instance prompt became a mission-specific delta + bearer + output dir.

**Did longer prompts produce better findings?** *No clear correlation.* Cycle-3 (1137 lines) shipped 17 findings; cycle-6 instances (~280 lines each × 4 = ~1100 lines collective) shipped 40+ findings across 4 axes. Per-line yield went **up** as prompts shrank. Anecdotally, the longest cycle-3 prompt produced an unusually high number of "agent restates the prompt scope back at you" turns — long prompts spawn meta-commentary.

**Did long prompts over-constrain?** Symptom-evidence yes: cycle-5d (520 lines) included explicit "out of scope" enumerations for findings cycle-5d's siblings would cover. Cycle-6 PROMPTs replaced this with a one-line "Stay in your lane. Don't touch <sibling-prefix>." Less ceremony, same outcome.

**Sweet-spot for cycle-7:** **180–280 lines per instance prompt**, riding on a shared PARENT for cross-cutting boilerplate. The 6b shape (240 lines) is the floor; below ~180 risks under-specifying acceptance criteria. Long bearer / output / policy primer tables stay; long mission monologues come out.

**Corollary:** keep the PARENT itself terse too — cycle-6's PARENT is 457 lines, which is fine because four instances read it once. A 1000+ line PARENT would defeat the compression.

---

## §5 — Cross-instance coordination ceiling (Q5)

Cycle-6 PARENT assigned cross-instance probes:
- webVitalsObservations + Sentry → Instance B
- DB-size + dep drift + RTL/edge + AI cost → Instance D
- Templates → Instance C
- Regression validate → Instance A

**Did instances actually deliver cross-instance synthesis?** *No, and structurally they can't.* Instances run in parallel Claude Desktop sessions with no shared mailbox; supervisor reconciles four HANDOFFs *afterward* into a single TRIAGE. Each instance silos by design. The "cross-instance" naming in the PARENT just means "each axis lives in exactly one instance to avoid duplicate work" — not "instances talk."

**Could they?** Only via the supervisor as relay (mid-run inbox poke), which has never been exercised. Daniel-attention is the bottleneck; mid-run relay would require him to broker, which collapses the focused-depth-run model.

**Realistic ceiling on coordination:** **assign axes pre-flight; reconcile post-flight.** Cycle-6's pattern works. Cycle-7 should NOT design "instance A and instance B both probe X then diff results" — that's 2× cost for the same signal a single instance could yield. Where two angles on one surface are wanted (e.g., synthetic walk + fresh-eyes on the same flow), put them in different instances with different *mission framings* but no expectation of mid-run cross-reference.

**One real coordination mechanism that *did* work:** the `uidPrefix` `test-6{A,B,C,D}-` discipline. That's a "passive coordination" — each instance owns a sandbox slice — and it scales fine. Lean on more of these (per-instance Firestore prefix, per-instance output dir, per-instance findings prefix) rather than attempting active coordination.

---

## §6 — Anti-pattern catalog (Q6)

Five to ten anti-patterns observable from prior-cycle data, ordered by frequency × cost-when-hit.

1. **Prompt cites a tool/param that doesn't deploy → instance aborts mid-probe.** Cycle-6 Instance A: 5 deploy-vs-claim gaps in P0 (`uidPrefix`, `cleanup prefix`, `list_service_personnel`, `dump_collection_size`, `harness/scripts`). Burns 15–25 min before bail. Rule: `[[feedback_cowork_prompt_verify_before_write]]` — `tools/list` + Zod-schema-grep at dispatch SHA.

2. **Memory-as-deployment-fact.** `[[feedback_sandbox_test_isolation]]` claimed `uidPrefix` was deployed; it was *proposal-shape* until Lane 0 shipped. Treat every `[[memory]]` cite as proposal-shape until verified at code level. Cross-ref: `[[feedback_cowork_prompt_verify_before_write]]`.

3. **Synthetic sandbox contamination across parallel instances absent `uidPrefix`.** `[[feedback_sandbox_test_isolation]]`: without per-instance prefix at `create_test_account` + matching prefix at `cleanup_all_test_data`, one instance's cleanup wipes siblings' fixtures via the global `test-` filter. Hit cycle-5 once; mitigated for cycle-6 by Lane 0; cycle-7 must keep the discipline.

4. **Self-inclusion fixture gap.** `[[feedback_self_inclusion_test_fixtures]]`: tool whose caller can be in the operand set (e.g., `cleanup_all_test_data` called by a `test-*` bearer revoking itself mid-sweep) needs a regression test modeling the path. Cycle-prod regression caught 2026-05-17; emulator missed it.

5. **PARENT scope creep during instance run.** Cycle-6 PARENT was *ratified* before dispatch but Decisions 1+2+3 (verification-discipline package) ratified 2026-05-19T~19:30Z — after most instances had already framed their probes. Instances reported against stale framing. Mitigation: lock the discipline-package decision *before* writing PROMPTs, not in parallel.

6. **MCP-tool lane "emulator-only evidence."** `[[feedback_mcp_lane_deployed_surface_evidence]]`: caught cycle-6 Lane 2 BLOCK 2026-05-19. Code-shape PASSes + emulator green do NOT satisfy the repro-paste rule. Every MCP-tool lane needs a coder-minted bearer + deployed transcript.

7. **F-02 wrong-target fix.** `[[feedback_mcp_validation_shape]]`: MCP inputSchema validation surfaces as `result.isError:true` with content prose prefixed `"MCP error -32602: ..."`, NOT as wire-level `error.code === -32602`. Three prior wrong-target fixes shipped before v6-pt2 (`84645abbc`) hit. Cycle-7 SHOULD include a 1-line regression probe that any future F-02-style "I fixed it" claim must pass the SSE-shape test against, not a JSON-RPC envelope test.

8. **CFC + chrome.debugger plan.** Cycle-3.5 P2-015 and cycle-4 §2.2 both planned for "CFC + CDP for true mobile." Both wrong. CFC build lacks the manifest permission. Default-route to in-sandbox Playwright in *every* cycle-7 prompt; do not write CFC+CDP as a fallback.

9. **Web-SDK probes without wiring `firebaseAuth` in `mintSession`.** Cycle-4 META-003. The fix exists (`probe.mjs` line 102–107 awaits `signInWithCustomToken` when `firebaseAuth` is passed) but most cycle-6 prompts forget to pass it. Result: silent unauth state on client listeners. Cycle-7 PARENT should state once: "ANY client-listener probe MUST pass `firebaseAuth: getAuth()` to `mintSession`."

10. **Long prereq blocks in instance prompts.** Cycle-6's §3 BLOCK protocol is good *as a safety net* but cycle-3/4 over-used "BLOCK on missing item" for things that turned out non-blocking (e.g., scripts/ missing when only `probe.mjs` was needed). Cycle-7 should tier prereqs: **HARD-BLOCK** (probe.mjs missing, bearer rejected) vs **DEGRADED-OK** (scripts/ absent, instance synthesizes inline).

---

## §7 — Candidate cycle-7 mission profiles (Q7)

Eight candidates, ranked by capability-fit × signal-uniqueness. None prescribed; recon-only.

| Rank | Profile | Capability-fit | Signal cycle-5/6 missed | Estimated bearer cost |
|---|---|---|---|---|
| **1** | **Chaos / failure injection on MCP write path** | High — bearer minting + `force:true` envelope is mature; `__test_delete_storage_object` exists. | Cycles 5/6 verified happy-path and refusal-shape. Untested: agent retry under partial-failure (Storage write OK + library_index fail; Drive 200 + Storage 404 mid-`reconcile_library`). Live failure-mode atlas. | 1 bearer; ~75min |
| **2** | **Public-unauth crawl + structured a11y/perf sweep** | High — sandbox Playwright + axe-core well-trodden (cycle-3.5 + cycle-5b + cycle-6b). | Cycle-6 Instance B partially did this. Cycle-7 could include `/sitemap.xml`-walks-every-link discipline + axe across the full public surface + structured-data validation (Google Rich Results). Goes broader than cycle-6b's 6 routes. | 1 bearer; ~90min |
| **3** | **AI cost + correction-signal longitudinal probe** | Medium — `dump_collection_size` + `aiCorrectionSignals` Firestore are deployed; pulling Cloud billing is manual. | Cycle-6 Instance D produced a point-in-time snapshot per `[[project_ai_cost_baseline]]`. A cycle-7 longitudinal pull (7d + 30d + per-day series, cross-referenced to deploy SHAs) catches "deploy X spiked usage 4×" patterns. | 1 bearer (admin); ~60min |
| **4** | **iPad-on-bimah ergonomics walk via mobile-emulated Playwright** | Medium — profile presets in `probe.mjs` cover iPad Mini, iPhone SE, Pixel 5 with real CDP touch + isMobile + DPR; absolute RTT inaccurate but layout/touch-target/orientation valid. | Cycle-6 didn't run an explicit perform-mode mobile walk under realistic-charts-per-setlist load. PDF page-turn UX, annotation gestures, key-badge contrast in stage lighting (simulated via reduced-luminance probe). | 1 bearer (band_leader); ~110min |
| **5** | **Multi-user-concurrent race probe (2+ bearers, simultaneous setlist edits)** | Medium — `wait_for_setlist_change` is shipped + version-versioned; `update_setlist` rejects stale-version writes. Untested at scale. | Cycle-5/6 didn't model two `band_leader` accounts editing the same setlist at the same time (Daniel + David collaboration shape). Race winners / stale-version envelope / live UI behavior. | 2 bearers (parallel); ~75min |
| **6** | **Live-data diff against prod baseline (zero-mutation read sweep)** | High — every read tool deployed; no risk of side effects. | Cycle-5/6 mostly wrote test data + verified. A pure read-side audit (`list_library` cardinality vs `dump_collection_size`; orphan count delta from baseline 272; assignment graph integrity) catches drift before users do. | 1 bearer; ~60min |
| **7** | **Observability assertion / error-budget validation** | Medium — `webVitalsObservations` + Sentry exist; query is straightforward. | Cycle-6 Instance B reported observations; cycle-7 could assert against criterion-4 thresholds and fail-fast if p75 LCP drifts above 2.5s for any of 5 watched routes. Less "audit" more "automated green-rubric runner." | 1 bearer; ~45min |
| **8** | **Longitudinal session-replay (multi-day)** | Low — exceeds CFC session ceiling; would require Daniel re-firing across days with a state-bridge file. | Could catch slow-drift bugs (cache poisoning, scheduled job race). High overhead; defer unless a specific incident motivates it. | Multi-day; not recommended yet |

**Not on this list** (per anti-patterns §6 #8): cross-browser sweep, screen-reader probe, real-device tests — Daniel ratified these out-of-scope 2026-05-19. Acknowledged.

---

## §8 — Cowork vs alternatives (Q8)

Some cycle-7 work shouldn't use cowork. Opinionated mapping:

| Work shape | Best harness | Reason |
|---|---|---|
| **POLISH backlog drain** (17 items, single-lane each) | **Single fresh Claude Code session per lane** | Cowork is overkill for "fix 1 finding, ship 1 commit." `/bongo:resume <N>` is the right shape; no bearer; no harness. |
| **Lighthouse / CWV regression check** | **Lighthouse CI + Vercel Edge Insights** | Cowork is *under-powered* for absolute CWV — sandbox egress = datacenter (capability §1 row i). Use Lighthouse CI from a regional source, or rely on `webVitalsObservations` real-user data. |
| **iPad shake-out at Friday service** | **Human-only, David or Daniel** | No capability beats real-device-in-real-bimah-lighting. `[[user_mcp_is_primary_author_workflow]]` already concedes this — the in-app UI is the band/consumer surface; David's report ~1 week post-ship is the green-rubric criterion-8 retroactive validator. |
| **Cross-browser visual regression** | **Chromatic / Percy or manual sweep** | Out-of-scope per Daniel ratification anyway. |
| **Drive cron / NEW-1 importer reliability** | **Vercel cron logs + production observation, not synthetic probes** | Cowork can probe `chartImportQueue` shape post-failure but can't artificially induce real Drive 5xx. |
| **MCP regression of write semantics** | **Cowork is right** | Bearer + admin role + isolated `test-*` prefix space; cycle-5/6 demonstrated. |
| **Synthetic David-flow walk** | **Cowork is right (interim gate)** | Until David reports actual usage post-ship; criterion 8 retroactive hook stays. |
| **AI cost monitoring** | **Cloud Console snapshot + scheduled `dump_collection_size` runs** | One person, one minute per snapshot. Doesn't need a Claude session. Could be a `/bongo:schedule`-style cron. |
| **Security / dep drift** | **GitHub Dependabot + `npm audit` in CI** | Already shipped via Lane 1 (`6528fbcbc`). Cowork should validate the CI runs, not duplicate them. |

**Net opinion:** cycle-7 should resist the gravitational pull of cowork-as-default. Cowork is well-suited to **2–3 axes of behavioral discovery under realistic auth**. Past that, single-lane code work and existing CI/observability infrastructure cover the rest more cheaply.

---

## §9 — Open questions for Daniel

1. **Cycle-7 cadence vs maintenance-mode commitment.** Decisions.md 2026-05-19T~22:35Z declared cycle-6-fixes "last major wave" + maintenance-mode. Is cycle-7 a *new* cowork cycle (re-opening the cadence) or a *narrow probe* (e.g., chaos-injection only, single-instance)? The recon prompt implies "test cycle"; the closure decision implies trailing single-lane work.

2. **Bearer count: 5 or 7?** TRIAGE rotation note says 5 burned in cycle-6; the recon prompt §3 says 7. Discrepancy of 2 unaccounted bearers (likely Daniel-minted pre-flight probes during dispatch repair). Recommend logging bearer mints alongside dispatch in cycle-7 so the math is closeable post-hoc.

3. **Should Web-SDK auth (capability §1 row g) be promoted to GREEN by making `firebaseAuth: getAuth()` mandatory in every cycle-7 PROMPT?** It works when wired and is a per-prompt 2-line cost. Today it's YELLOW because prompts forget.

4. **Mobile mission (candidate §7 #4) — is iPad-on-bimah ergonomics in-scope, or deferred to David's post-ship report?** The Daniel 2026-05-19 deferral was for "real-device / screen-reader / cross-browser." Mobile-emulated Playwright is not the same as real device, but it's also not "screen-reader on real iPad." Worth clarifying so cycle-7 doesn't accidentally scope it back in.

5. **Multi-user concurrency probe (candidate §7 #5).** Requires 2 simultaneous bearers, both with `band_leader` role. Two-bearer mints are uncommon historically. Sanction or defer?

6. **Anti-pattern #7 (F-02 shape regression test).** Should cycle-7 explicitly ship a `wrapWithValidationRemap` end-to-end SSE-shape probe as a recurring sanity check? Cheap; one-time auth; high return if a future SDK bump regresses.

7. **Should cycle-7 instance prompts include the `_dynamic-pacing` self-paced shape** (a la `/loop` skill) for any axis, or stay single-pass-stop? All cycle-2..6 prompts have been one-shot. A self-paced re-fire could be useful for the longitudinal/observability mission (candidate §7 #7).

---

*from recon-agent-B*
