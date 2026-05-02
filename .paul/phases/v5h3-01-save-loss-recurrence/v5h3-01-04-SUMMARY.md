---
phase: v5h3-01-save-loss-recurrence
plan: 04
subsystem: process-discipline
tags: [postmortem, harness-fidelity-gate, project-md-constraint, binding-gate, h-sl-7, daniel-loop-uat-validated-2x, twice-implicated]

# Dependency graph
requires:
  - phase: v5h3-01-save-loss-recurrence
    provides: H-SL-7 fix shipped (commit `36e9fa1`); auto-capture instrumentation shipped (commit `1d8d94c`); investigation doc with 6→3-hypothesis matrix; mid-execution UAT evidence section adding H-SL-7 (HIGH) + H-SL-8 (MEDIUM-HIGH)
  - phase: v5h-01-track-edit-save-loss
    provides: parent postmortem `v5h-01-save-loss.md` §5 action item #2 (kitchen-sink remediation deferred under "opportunistic" framing); precedent for postmortem-only plan structure (autonomous=true, docs only, no source/test changes)
  - phase: v51-04-vocal-lead-rename
    provides: PROJECT.md "UAT Discipline (data-flow fixes)" subsection precedent for binding-constraint codification under §Constraints
provides:
  - Postmortem at `.paul/postmortems/v5h3-01-save-loss-recurrence.md` covering H-SL-7 mechanism + mid-execution UAT pivot + Daniel-loop UAT 2x-validated-today + harness-fidelity gap RE-IMPLICATED
  - PROJECT.md gained binding "Harness Fidelity Gate (binding from v5.3)" subsection escalating v5h-01 §5 action item #2 from "opportunistic" → BLOCKING for any future data-flow phase
  - Phase v5h3-01 closes at 4-of-4 PLANS-APPLIED; enters PENDING-UAT until Daniel weekly worship cycle confirms `36e9fa1` holds
affects: [v5.4-milestone (gates first phase to harness-fidelity remediation: Firebase emulator + RTL editor↔perf-view test pair), v53-02 chart-binding-and-verification (unblocks once v5h3-01 PENDING-UAT clears), v53-03 polymorphic-Add-menu (same), v53-04 editor-affordance-pass (same)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Binding-constraint codification under PROJECT.md §Constraints: when a deferred remediation gets re-implicated in a second incident, escalate the action item from 'opportunistic' framing into a binding gate with named work + named owner + named milestone target + waiver semantics. Pattern reusable for any deferred-then-re-implicated process gap."
    - "Waiver semantics for binding gates: 'three waivers in a row triggers re-prioritization to v5.4 phase 1' — counter-intuitive when applied (the bindingness is enforced via plan boundaries naming the open ticket), encodes that exceptions are allowed but tracked + auto-escalating."
    - "Mid-execution UAT pivot pattern: a UAT signal that arrives during APPLY of a different plan can pivot the plan trajectory same-day. v5h3 demonstrated this twice (morning UAT opened the phase; mid-instrumentation UAT pivoted Round-2-Option-B → ship-targeted-fix-today). Pre-condition: code-scan diagnostic doc must already rank candidate hypotheses so high-signal evidence triages cleanly."

key-files:
  created:
    - sheet-music-app/.paul/postmortems/v5h3-01-save-loss-recurrence.md
  modified:
    - sheet-music-app/.paul/PROJECT.md
    - sheet-music-app/.paul/STATE.md

key-decisions:
  - "Postmortem is a SIBLING file to v5h-01-save-loss.md (not an extension). v5h-01 postmortem is canonical for that incident; v5h3 sibling cross-links upward (one-way)."
  - "Cross-link doc structure: 4 references to v5h3-01-save-loss-recurrence-investigation.md (research artifact preserved separately) + 2 references to v5h-01-save-loss.md (parent postmortem)."
  - "Binding gate codified IN PROJECT.md §Constraints (not ROADMAP.md). Constraints are the durable surface that future plan-creation reads; ROADMAP entries shift between milestones. PROJECT.md ordering preserved: Technical Constraints → Business Constraints → UAT Discipline → Harness Fidelity Gate → Tech Stack."
  - "Waiver semantics drafted with explicit ESCAPE HATCH ('P0 production hotfix') so the gate doesn't block emergency response, AND auto-escalation ('three waivers in a row triggers re-prioritization') so the escape hatch can't normalize."
  - "Harness build itself (Firebase emulator + RTL pair) is NOT scoped to this plan — it's named, owned, and ticketed for v5.4 phase 1. Doing it here would be over-engineering and conflate v5h3 hotfix scope with v5.4 milestone scope."

patterns-established:
  - "Postmortem sibling-not-extension convention: when a recurrence happens, write a NEW postmortem that cross-links to the parent. Avoids editing canonical history. Pattern: `v{NN}-{name}.md` + `v{NN+1}-{name}-recurrence.md` with one-way `v{NN+1}` → `v{NN}` cross-links."
  - "Binding-gate insertion location in PROJECT.md: append under §Constraints AFTER existing UAT Discipline (or whichever existing data-flow constraint is closest semantically), BEFORE §Tech Stack. Group complementary gates (UAT Discipline catches what harness misses; Harness Fidelity raises the floor of what harness CAN catch)."
  - "Skill-not-required precedent for postmortem plans: docs-only plans inherit the v5h-01-04 + v50-07-05 precedent — /ui-ux-pro-max NOT required because zero UI/styling surface is touched. The skill audit is N/A, not a gap."

# Metrics
duration: ~30min (in-context; no executor agent dispatched — single-context plan-and-write)
started: 2026-05-02T11:00:00Z
completed: 2026-05-02T11:30:00Z
---

# v5h3-01-04: Postmortem + Binding Harness-Fidelity Gate Summary

**Phase v5h3-01 closes at 4-of-4 plans. Postmortem at `.paul/postmortems/v5h3-01-save-loss-recurrence.md` (177 lines; H-SL-7 mechanism + mid-execution UAT pivot + Daniel-loop UAT 2x-validated-today + harness-fidelity gap RE-IMPLICATED). PROJECT.md §Constraints gained binding "Harness Fidelity Gate (binding from v5.3)" subsection — escalates v5h-01 §5 action item #2 from "opportunistic" → BLOCKING for any future data-flow phase. Suite 1560/1560; `next build` clean; zero source/rules/indexes touched. Phase enters PENDING-UAT until Daniel weekly worship cycle confirms `36e9fa1` holds.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~30 minutes (in-context; no agent dispatch) |
| Started | 2026-05-02T11:00:00Z |
| Completed | 2026-05-02T11:30:00Z |
| Tasks | 2 of 2 PASS |
| Files created | 1 (postmortem) |
| Files modified | 2 (PROJECT.md additive; STATE.md loop-position) |
| LOC delta | +177 (postmortem) + ~+22 (PROJECT.md additive subsection) + STATE.md updates |
| Source/test/rules LOC delta | 0 (docs only) |
| Tests added | 0 |
| Suite | 1560/1560 (no regression — no test changes) |
| `next build` | Clean (Sentry SDK config warning is pre-existing, unrelated) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Postmortem written + cross-linked | ✅ Pass | 177 lines (target 150-250); 8 H2 sections (TL;DR / Timeline / Root Cause / What Got Shipped / Lessons / Action Items / Deferred Items / Appendix); 2 cross-links to `v5h-01-save-loss.md` (companion artifact line + Lessons.3 inline link); 4 cross-links to `v5h3-01-save-loss-recurrence-investigation.md`; 12 H-SL-7 mentions; 10 commit refs (`36e9fa1` + `1d8d94c`); parent v5h-01 postmortem untouched (`git diff` empty) |
| AC-2: Harness-fidelity gate codified in PROJECT.md | ✅ Pass | New "### Harness Fidelity Gate (binding from v5.3)" subsection at line 186; ordering preserved (Technical Constraints 171 → Business Constraints 177 → UAT Discipline 181 → **Harness Fidelity Gate 186** → Tech Stack 202); names twice-implicated gap (v5h-01 + v5h3); names remediation (Firebase Local Emulator Suite + RTL editor↔perf-view test pair); names BLOCKING semantics (waiver-with-ticket required for any pre-remediation data-flow plan; three waivers in a row auto-escalates); cross-references both v5h-01 §Lessons.2 and v5h3 §Lessons.3; names v5.4 phase 1 as binding ship target; Owner: Rabbi Daniel |
| AC-3: Phase v5h3-01 ships 4 of 4 plans | ✅ Pass (on UNIFY commit) | 4 PLAN.md files exist (01, 02, 03, 04); after this SUMMARY lands, 4 SUMMARY.md files exist; STATE.md transitions to "v5h3-01 LOOP COMPLETE — PENDING-UAT"; phase-close commit pending in transition step (stages `.paul/phases/v5h3-01-save-loss-recurrence/v5h3-01-04-{PLAN,SUMMARY}.md` + `.paul/postmortems/v5h3-01-save-loss-recurrence.md` + `.paul/PROJECT.md` + `.paul/STATE.md` + `.paul/ROADMAP.md` per transition workflow) |
| AC-4: Boundaries respected; suite + build green | ✅ Pass | `npm test` 1560/1560 passing (zero regression — no test changes this plan); `npm run build` clean (Sentry SDK warning is pre-existing config note, unrelated to this plan); `git diff sheet-music-app/src/ sheet-music-app/firestore.rules sheet-music-app/firestore.indexes.json sheet-music-app/storage.rules` shows ONLY pre-existing `src/build-info.json` (auto-stamped by dev script per project memory; intentionally excluded from PAUL commits); boundary diff confirms only `.paul/PROJECT.md` + `.paul/postmortems/v5h3-01-save-loss-recurrence.md` modified outside the phase directory |

## Accomplishments

- **Phase v5h3-01 closes with the third deferral explicitly prevented.** v5h-01-04 deferred kitchen-sink remediation as "opportunistic"; v5h3 made it twice-implicated (harness was 1528/1528 green throughout, missed both incidents). The Harness Fidelity Gate now lives in PROJECT.md §Constraints as a binding plan-time check — future data-flow phases either land AFTER the remediation OR carry an explicit per-plan waiver naming the v5.4 ticket. Three waivers in a row auto-escalates to v5.4 phase 1.
- **Postmortem captures TWO same-day Daniel-loop UAT validations.** First: morning UAT during v53-01 synthesis surfaced the recurrence at all (without it, v5h3-01 wouldn't have been opened). Second: mid-instrumentation-build UAT message pivoted v5h3-01-02 → v5h3-01-03 same-day. Both validations reinforce that real-iPad UAT against real production is the irreplaceable diagnostic surface for this app's data-flow class.
- **Sibling-not-extension postmortem convention established.** v5h3 postmortem cross-links to v5h-01 (parent) one-way; parent canonical history untouched (`git diff sheet-music-app/.paul/postmortems/v5h-01-save-loss.md` empty). Pattern: `v{NN}-{name}.md` + `v{NN+1}-{name}-recurrence.md`. Reusable for any future recurrence postmortem.
- **Waiver-with-auto-escalation semantics drafted for the binding gate.** Escape hatch ("P0 production hotfix; cannot block on harness work") prevents the gate from blocking emergency response; auto-escalation ("three waivers in a row triggers re-prioritization to v5.4 phase 1") prevents the escape hatch from normalizing into a permanent loophole. Reusable pattern for any binding gate with realistic escape needs.
- **Pure docs ship; zero source/test/rules/indexes risk.** Plan executed exactly as written. No auto-fixes, no scope additions, no deferrals. Suite remained 1560/1560.

## Task Commits

This plan ships docs only. Per v5h-01-04 + v50-07-05 precedent for autonomous postmortem plans, ALL plan artifacts ship in a single combined commit at the transition step (NOT atomic per-task commits — the postmortem + PROJECT.md + STATE.md + PLAN + SUMMARY form one cohesive narrative deliverable).

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Task 1: Write v5h3-01 postmortem | (combined at transition) | docs | New `.paul/postmortems/v5h3-01-save-loss-recurrence.md` (177 lines) covering H-SL-7 mechanism + mid-execution UAT pivot + Daniel-loop UAT 2x-validated-today + harness-fidelity gap RE-IMPLICATED. Sibling-not-extension to v5h-01 postmortem; cross-links one-way. |
| Task 2: Codify Harness Fidelity Gate in PROJECT.md | (combined at transition) | docs | Appended "### Harness Fidelity Gate (binding from v5.3)" subsection under §Constraints (line 186); names twice-implicated gap + remediation work + binding semantics + waiver-with-auto-escalation + v5.4 phase 1 target. Ordering preserved. |

Plan metadata: phase-close commit at transition step bundles `.paul/phases/v5h3-01-save-loss-recurrence/v5h3-01-04-{PLAN,SUMMARY}.md` + the postmortem + PROJECT.md + STATE.md + ROADMAP.md updates (per `feedback_paul_phase_commits.md` — explicitly stage entire `.paul/phases/{phase}/` dir; do NOT stage `src/build-info.json` or `package.json`).

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `.paul/postmortems/v5h3-01-save-loss-recurrence.md` | Created (177 lines) | Sibling postmortem for v5h3 save-loss recurrence; H-SL-7 mechanism documented; Daniel-loop UAT 2x-validated-today; harness-fidelity gap RE-IMPLICATED; 5 numbered Action Items with owner + target + blocking flag |
| `.paul/PROJECT.md` | Modified (~+22 LOC additive) | New "### Harness Fidelity Gate (binding from v5.3)" subsection appended under §Constraints between UAT Discipline and Tech Stack. Binding from v5.3 onward; v5.4 phase 1 ship target |
| `.paul/STATE.md` | Modified (loop position + Session Continuity) | PLAN ✓ → APPLY ✓ → UNIFY ✓ on this loop close; phase v5h3-01 progress 75% → 100% PLANS-COMPLETE-PENDING-UAT; next action becomes /paul:audit-milestone v5.3 once v53-02..04 ship |
| `.paul/phases/v5h3-01-save-loss-recurrence/v5h3-01-04-PLAN.md` | Created (at PLAN step) | This plan's executable PLAN.md (frontmatter + 4 ACs + 2 tasks + boundaries + verification) |
| `.paul/phases/v5h3-01-save-loss-recurrence/v5h3-01-04-SUMMARY.md` | Created (this file) | Closes the loop; reconciles plan-vs-actual; documents AC results + accomplishments + decisions + zero deviations |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Postmortem is a SIBLING file to v5h-01-save-loss.md, not an extension | v5h-01 postmortem is canonical for that incident; editing it after-the-fact would corrupt historical record. Sibling-and-cross-link preserves both incidents' narratives independently. | Pattern established for any future recurrence postmortems: `v{NN}-{name}.md` + `v{NN+1}-{name}-recurrence.md`, one-way cross-links upward. |
| Cross-link count low after first draft (1 vs AC ≥ 2 to v5h-01-save-loss.md) | Many references to "v5h-01" by phase name throughout, but only one literal-filename match (the companion artifacts list at top). AC required ≥ 2 explicit filename links so a reader following a single link gets to the parent doc. | Added inline link in Lessons.3 ("see [v5h-01-save-loss.md](v5h-01-save-loss.md) §5 Action Item #2") after first verification pass. AC-1 satisfied on second check. |
| Binding gate codified in PROJECT.md §Constraints, NOT in ROADMAP.md | Constraints are the durable surface that future plan-creation reads (every plan's `<context>` references @.paul/PROJECT.md); ROADMAP entries shift between milestones and would lose the gate when v5.3 archives. | Gate persists across milestones; v5.4 / v5.5 / etc. plan-creation will see the gate as a load-bearing constraint. |
| Waiver semantics include both escape hatch AND auto-escalation | Without escape hatch, a P0 production hotfix would be blocked by the gate (unsafe). Without auto-escalation, the escape hatch could normalize into a permanent loophole (defeats the gate's purpose). Three-strikes-then-escalate balances both. | Pattern reusable for any binding gate with realistic escape needs. Naming three explicit thresholds (escape hatch / waiver / auto-escalation) prevents ambiguous interpretation later. |
| Harness build itself (Firebase emulator + RTL pair) NOT scoped to this plan | Building the remediation here would conflate v5h3 hotfix scope with v5.4 milestone scope. v5h-01-04 + v50-07-05 precedent for autonomous postmortem plans is "docs only; the action items defer build to the right milestone." Daniel's standing principle "minimal and focused — only modify what's directly requested" reinforces. | Action Item #2 in postmortem names v5.4 phase 1 as the build target. /paul:new-milestone for v5.4 picks this up automatically once v5.3 closes. |
| Single combined commit at transition (NOT atomic per-task commits) | Task 1 (postmortem) + Task 2 (PROJECT.md) form one cohesive narrative deliverable; splitting would orphan the cross-references. v5h-01-04 + v50-07-05 + v51-04 + v52-02..05 precedent for vertical-slice docs commits. | Phase-close commit stages all `.paul/` artifacts atomically; honors `feedback_paul_phase_commits.md`. |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | Minor: post-write verification revealed cross-link count 1 (vs AC ≥ 2); added inline link in Lessons.3. Single 3-line edit. |
| Scope additions | 0 | — |
| Deferred | 0 | — |

**Total impact:** Plan executed exactly as designed. One in-flight verification gap auto-corrected before AC review. Zero scope drift.

### Auto-fixed Issues

**1. [Verification] Cross-link count below AC-1 threshold after first draft**
- **Found during:** Task 1 (postmortem write) — post-write verification step
- **Issue:** `grep -c 'v5h-01-save-loss.md' .paul/postmortems/v5h3-01-save-loss-recurrence.md` returned 1, AC-1 required ≥ 2. The companion-artifacts list at top had the only literal-filename match; many phase-name references ("v5h-01") elsewhere didn't include the filename anchor.
- **Fix:** Added inline link in Lessons.3: changed `"v5h-01-04 framed the kitchen-sink remediation as..."` → `"v5h-01-04 (see [v5h-01-save-loss.md](v5h-01-save-loss.md) §5 Action Item #2) framed the kitchen-sink remediation as..."`. Improves doc navigation: the Lessons.3 section is the harness-gap discussion and naturally points back to the parent doc's harness-gap discussion.
- **Files:** `.paul/postmortems/v5h3-01-save-loss-recurrence.md` (one Edit; +1 inline link reference)
- **Verification:** `grep -c 'v5h-01-save-loss.md'` returned 2 after fix; AC-1 satisfied.
- **Commit:** combined at transition (postmortem ships as one cohesive deliverable)

### Deferred Items

None — plan executed exactly as written. All open hypotheses (H-SL-1, H-SL-8, snapshot-listener double-mount) explicitly inherited from the postmortem's Deferred Items table; routed via Daniel-loop UAT or future plan in same phase if signal arrives. These are NOT new deferrals from this plan; they're carried forward from v5h-01 + v5h3 investigation.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Cross-link count below AC-1 threshold (post-first-draft) | Auto-fixed inline (see Auto-fixed Issues §1). |
| `next build` Sentry SDK warning — `Could not find onRequestError hook in instrumentation file` | Pre-existing config note (NOT introduced by this plan; unrelated to docs-only changes); deferred to future Sentry SDK upgrade phase if it surfaces as a runtime issue. Build still exits clean. |
| Pre-existing dirty `src/build-info.json` (and `package.json`) | Per project memory + STATE.md historical note: auto-touched by dev script; intentionally excluded from all PAUL commits. Honored by NOT staging at transition. |

## Skill Audit

`.paul/SPECIAL-FLOWS.md` declares `/ui-ux-pro-max` required for "any phase that touches frontend UI/UX". This plan modifies docs only (postmortem + PROJECT.md constraint + STATE.md loop-position + SUMMARY); zero UI/test/source surface. Skill audit: ✓ correctly N/A (same precedent as v5h-01-04 + v50-07-05). Plan declared this explicitly in its `<skills>` section at PLAN time.

## Next Phase Readiness

**Ready:**
- Phase v5h3-01 transitions to PENDING-UAT (4-of-4 plans applied; final commit at transition step).
- Postmortem + binding gate are durable surfaces future planning reads automatically.
- v5.4 phase 1 target is named (Firebase emulator integration + thin RTL editor↔perf-view test pair); first /paul:new-milestone for v5.4 picks this up via the harness-fidelity ticket in postmortem Action Item #2.
- v53-02 (chart binding picker fix + ChartCell discoverability) unblocks once Daniel weekly worship cycle UAT confirms `36e9fa1` holds. v53-03 (polymorphic Add menu) and v53-04 (editor affordance pass) follow.
- Daniel-loop UAT discipline + Harness Fidelity Gate now BOTH live in PROJECT.md as binding constraints (paired complementary gates).

**Concerns:**
- H-SL-7 fix verified ONLY in the test harness (CapturingTwoWriterAdapter for evidence + FailNthCallAdapter for genuine-multi-writer simulation). Real production verification is the Daniel weekly worship cycle UAT in Action Item #3 — same kind of harness-vs-production gap that motivated the binding gate. Until UAT confirms, "phase complete" is asterisked.
- H-SL-8 (snapshot-listener delivery bumps local.updatedAt between edit-prep and edit-commit) NOT addressed by `36e9fa1`; v50-06-03 outbox-pending guard SHOULD prevent it under sane conditions but specific edge cases remain (listener-before-outbox-write ordering; cross-tab; initial delivery before first edit). Watched by v5h3-01-02 instrumentation.
- v5.4 milestone hasn't been opened yet; the binding gate's "v5.4 phase 1" target is a forward reference. If a v5.4 data-flow phase is planned BEFORE the harness-fidelity remediation ships, the gate kicks in (waiver path or wait-for-remediation). Path is clear; just needs sequencing discipline at /paul:new-milestone time.

**Blockers:**
- None for transition to phase-close commit. Phase v5h3-01 mechanically closes at 4-of-4.
- Daniel weekly worship cycle UAT clears the PENDING-UAT asterisk; this is opportunistic and not a hard blocker for v5.4 planning, but is a soft blocker for v5.3 milestone close (per UAT Discipline subsection in PROJECT.md).

---
*Phase: v5h3-01-save-loss-recurrence, Plan: 04*
*Completed: 2026-05-02*
*Phase v5h3-01 LOOP COMPLETE (4 of 4) — PENDING-UAT pending Daniel weekly worship cycle*
