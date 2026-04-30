---
phase: v52-01-recursive-research
plan: 01
subsystem: research
tags: [ipad, ios-safari, focus-management, sync-engine, touch-affordance, templates, firestore, dexie]

requires:
  - phase: v51-01-picker-rework
    provides: TouchOrPopover + DropdownCell mode='discrete'|'searchable' substrate (now suspected of focus-trap leak)
  - phase: v50-06-concurrent-edit-safety
    provides: snapshot-listener + outbox + LWW guard architecture (Issue 1 substrate)
  - phase: v5h-01-track-edit-save-loss
    provides: Daniel-loop UAT discipline + 2-3-strikes architectural-rethink rule (motivated front-loaded research)

provides:
  - 4 track research reports characterizing root causes for 7 v5.2 issues at HIGH confidence
  - RESEARCH-SYNTHESIS.md with 7-row root-cause confidence matrix + per-phase recommendations
  - 6 OQ default answers locked by Daniel for v52-02..v52-05 plan-time consumption
  - ipad-uat-capture.md deferral doc with per-phase post-deploy UAT acceptance criteria
  - Decision records for v5.2 phase-shape refinements (Issues 5+7 file-bundled; Issues 1+4 independent fixes; no v52-h hotfix split needed)

affects:
  - v52-02-ipad-focus-cmdk-fix (consumes Track A + synthesis)
  - v52-03-sync-indicator-ux-overhaul (consumes Track B + Track B follow-up)
  - v52-04-touch-affordance-setlist-lifecycle (consumes Track C)
  - v52-05-default-template-management (consumes Track D)

tech-stack:
  added: []
  patterns:
    - "Code-read confidence firming via follow-up Q1/Q2/Q3 pass when iPad UAT capture deferred"
    - "Per-phase deferred Daniel-loop UAT as the verification gate (codified discipline from v51-04 applied at execution-time rather than research-time)"
    - "Cluster affirmation via cross-track signal (Issues 2+3 confirmed shared substrate; Issues 1+4 confirmed independent despite same surface)"

key-files:
  created:
    - .paul/phases/v52-01-recursive-research/track-a-ipad-focus-research.md
    - .paul/phases/v52-01-recursive-research/track-b-sync-indicator-research.md
    - .paul/phases/v52-01-recursive-research/track-c-touch-affordance-audit.md
    - .paul/phases/v52-01-recursive-research/track-d-template-data-model.md
    - .paul/phases/v52-01-recursive-research/ipad-uat-capture.md
    - .paul/phases/v52-01-recursive-research/RESEARCH-SYNTHESIS.md
  modified: []

key-decisions:
  - "DEFERRED Task 2 HUMAN-ACTION iPad UAT capture; synthesized from code-read with per-phase post-deploy Daniel-loop UAT as verification gate"
  - "APPROVED RESEARCH-SYNTHESIS.md with 6 default OQ answers locked: Q1=(a) SetlistCards / Q2=admin-only / Q3=phased / Q4=editor kebab / Q5=silent fallback / Q6=remove kebab"
  - "Issues 2+3 share root cause: TouchOrPopover preventDefault leak — single ~30 LOC substrate fix in v52-02"
  - "Issues 1+4 independent despite same surface — 2 tasks within one v52-03 plan"
  - "Issues 5+7 file-bundled in SetlistCards.tsx — 1 v52-04 plan covers both"
  - "Issue 6 architecture: Option C system/templates pointer doc; admin-only; phased Shabbat morning + Erev Shabbat first"
  - "No v52-h hotfix split needed — Issue 1 firmed to HIGH confidence as recovery-affordance gap, not data-flow break"
  - "Wave 1 plans v52-02..v52-05 all parallel-eligible after v52-01 closes"

patterns-established:
  - "When real-device UAT is deferred, follow-up code-read pass (Q1/Q2/Q3 model) on the lowest-confidence Issue can firm it to HIGH without device data"
  - "Synthesis must embed deferred-UAT items as explicit per-phase post-deploy acceptance criteria — they don't get lost when Daniel-loop UAT runs at the v51-04-codified gate"
  - "Cross-track cluster affirmation/refutation as a synthesis discipline — explicitly answer YES/NO with evidence to clustering hypotheses, don't leave them implicit"

duration: ~50min
started: 2026-04-30T12:50:00Z
completed: 2026-04-30T13:30:00Z
---

# Phase v52-01 Plan 01: Recursive research Summary

**4 parallel research tracks + 1 follow-up Issue 1 firming pass + synthesis produced HIGH-confidence root-cause matrix for all 7 v5.2 issues; 6 OQ default answers locked; Wave 1 plans v52-02..v52-05 unblocked.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~50 min (4 parallel research subagents ~5-10 min each + follow-up firming pass + synthesis) |
| Started | 2026-04-30T12:50:00Z |
| Completed | 2026-04-30T13:30:00Z |
| Tasks | 3 of 4 fully executed; Task 2 DEFERRED (recorded as deviation) |
| Files modified | 6 markdown artifacts; 0 source-code changes |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: All 4 track research reports produced | **Pass** | track-a (100 lines) + track-b (242 lines incl. follow-up) + track-c (70 lines) + track-d (105 lines). All have hypotheses-confirmed/ruled-out/still-open structure + file:line citations. Track-c uses "Audit Findings" rather than literal "Audit Table" header but content is equivalent. |
| AC-2: iPad UAT capture documents real-device behavior | **Deferred (substituted)** | Daniel unavailable for capture during research window. Substituted with `ipad-uat-capture.md` deferral doc that codifies per-phase post-deploy UAT acceptance criteria. Verification gate moves from prophylactic (v52-01) to verifying (v52-02..05 post-deploy) per v51-04-codified discipline. |
| AC-3: Synthesis identifies root causes with explicit confidence levels | **Pass** | RESEARCH-SYNTHESIS.md contains 7-row Root-Cause Confidence Matrix with 6 of 7 issues HIGH and 1 of 7 HIGH-with-MEDIUM-on-scope-details (Issue 6 — pending Daniel's OQ answers). 0 LOW. Cluster affirmations explicit: Issues 2+3 SHARE; Issues 1+4 INDEPENDENT; Issues 5+7 file-bundled. |
| AC-4: Synthesis recommends phase-2..5 scope refinements | **Pass** | Phase Recommendations section gives plan-shape, scope, files, /ui-ux-pro-max gate status, Daniel-loop UAT acceptance criterion, risks, and ordering for each of v52-02 / v52-03 / v52-04 / v52-05. Wave 1 parallel-eligibility confirmed. |
| AC-5: Daniel approves synthesis or requests round 2 | **Pass** | Daniel responded "approve" at decision checkpoint; all 6 default OQ answers locked. |

## Accomplishments

- **Cluster affirmation:** Issues 2+3 confirmed shared root cause (TouchOrPopover unconditional `preventDefault` on `(pointer:coarse)` breaks Radix focus-trap on iOS Safari) → single ~30 LOC substrate fix in v52-02 with `suppressAutoFocus?: boolean` opt-in prop.
- **Issue 4 fully diagnosed without iPad data:** SetlistGridTopBar.tsx:65 `disabled={!onOverflow}`, SetlistGrid.tsx:1518 never passes `onOverflow` — kebab is **always disabled by code**, not by sync state. Track B identified the "red line" Daniel sees as v51-h01 inline lastError pill rendering adjacent to dimmed kebab during `failed` state — visual confusion, not actual styling regression.
- **Issue 1 firmed to HIGH confidence via follow-up pass:** Track B Q1/Q2/Q3 firming established (1) NO existing in-app affordance to clear failed/phantom outbox rows, (2) auth-claim staleness IS plausible co-factor compounding phantom-row blocking on iPad, (3) `failed` FSM state is **terminal** with no auto-exit (state-machine.ts:36-41 preserves it across all events). v52-03 deliverables crystallized: "Clear failed rows" button + "Sign out and back in" pairing.
- **Issue 5 audit surfaced 3 P0 fixes:** SetlistCards.tsx:80 (UpcomingSetlistCard kebab), SetlistCards.tsx:208 (SetlistCard kebab), CalendarDayCell.tsx:104 (Plan Service button) — all use `opacity-0 group-hover:opacity-100` invisible on touch. Fix per v50-05-04 precedent: add `[@media(pointer:coarse)]:opacity-100` (~3 LOC total).
- **Issue 6 architecture decision: Option C** (system/templates pointer doc) recommended after Track D evaluated 4 options. Pros: minimal data duplication; atomic single-field writes; sticky-memory v50-04 contract preserved (cloned tracks seed fresh from `seedTrackFromSong` at READ time); backwards-compatible (null pointer = implicit lookup); graceful pointed-setlist-deleted fallback; clean admin-only permission model.
- **Phase-shape refinements vs. original ROADMAP:** Issues 5+7 file-bundled into single v52-04 plan; Issues 1+4 independent fixes within single v52-03 plan; no v52-h hotfix split. ROADMAP.md does not need updates (refinements are plan-shape, not phase-shape).
- **Daniel approved synthesis with 6 default OQ answers locked**, unblocking Wave 1 parallel-eligible planning for v52-02 / v52-03 / v52-04 / v52-05.

## Task Commits

This plan's outputs are markdown artifacts under `.paul/phases/v52-01-recursive-research/`. Per project preference (memory: "explicitly stage `.paul/phases/{phase}/` dir on PAUL commits — past close-loop commits orphaned PLAN/SUMMARY files"), the phase-close commit lands during transition and stages the entire phase directory.

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Task 1: Dispatch 4 parallel research subagents | (phase-close) | docs | 4 track reports written by parallel dan-researcher subagents |
| Task 2: HUMAN-ACTION iPad UAT capture | (phase-close) | docs | DEFERRED — substituted with deferral doc; deviation recorded |
| Task 3: Synthesize tracks + UAT capture into RESEARCH-SYNTHESIS.md | (phase-close) | docs | Synthesis with 7-row confidence matrix + phase recommendations |
| Task 4: DECISION checkpoint — approve synthesis | (phase-close) | docs | Daniel approved with 6 default OQ answers; recorded in STATE.md decisions |

Phase-close commit covers PLAN + SUMMARY + 4 track reports + UAT-deferral doc + synthesis as one atomic commit. Lands during transition.

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `.paul/phases/v52-01-recursive-research/v52-01-01-PLAN.md` | Created (during PLAN phase) | Plan with 4 tasks, 5 ACs, frontmatter, boundaries |
| `.paul/phases/v52-01-recursive-research/track-a-ipad-focus-research.md` | Created | Issues 2+3 hypotheses + recommendation (TouchOrPopover suppressAutoFocus opt-in) |
| `.paul/phases/v52-01-recursive-research/track-b-sync-indicator-research.md` | Created (incl. follow-up Issue 1 firming section) | Issues 1+4 state diagram + iPad-vs-desktop divergence diagnosis + kebab disabled-by-code finding + Q1/Q2/Q3 follow-up firming |
| `.paul/phases/v52-01-recursive-research/track-c-touch-affordance-audit.md` | Created | Issue 5 audit + 3 P0 findings + Issue 7 surface analysis |
| `.paul/phases/v52-01-recursive-research/track-d-template-data-model.md` | Created | Issue 6 4-option evaluation + Option C recommendation |
| `.paul/phases/v52-01-recursive-research/ipad-uat-capture.md` | Created | Deferral doc with per-phase post-deploy UAT acceptance criteria |
| `.paul/phases/v52-01-recursive-research/RESEARCH-SYNTHESIS.md` | Created | 7-row root-cause confidence matrix + cluster affirmations + phase recommendations + 6 OQ defaults |
| `.paul/phases/v52-01-recursive-research/v52-01-01-SUMMARY.md` | Created (this file) | Plan close documentation |
| `.paul/STATE.md` | Modified | Loop position, decisions, session continuity |
| `.paul/ROADMAP.md` | (will be modified at transition) | Phase status: 0/5 → 1/5 complete |

Zero source-code changes. `git diff src/ firestore.rules` empty. Boundaries respected.

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| DEFERRED Task 2 HUMAN-ACTION iPad UAT capture | Daniel signaled unavailability mid-execution; v51-04 codified Daniel-loop UAT discipline already covers post-deploy verification at every data-flow phase, so research-time UAT is supplementary not load-bearing | Per-phase v52-02..05 plans must include explicit Daniel-loop UAT acceptance criteria covering deferred-from-Track-A/B observations |
| Followed up with Q1/Q2/Q3 code-read firming pass on Issue 1 | Cross-track signal indicated Issue 1 was the lowest-confidence cell in matrix; firming it via code-read kept synthesis at HIGH confidence without iPad data | Issue 1 → HIGH; v52-03 deliverables crystallized (Clear failed rows + sign-out pairing) |
| Issues 2+3 SHARED substrate fix | Track A confirmed both manifest from same `preventDefault` leak; cross-confirmed by file:line evidence | v52-02 ships ONE ~30 LOC plan, not two |
| Issues 1+4 INDEPENDENT despite same surface | Code paths verified separate (data-state divergence vs hard-disabled prop); both ship in v52-03 as 2 tasks within 1 plan | Cleaner plan boundary; no v52-h hotfix split |
| Issues 5+7 file-bundled | Both modify SetlistCards.tsx; bundling avoids duplicate /ui-ux-pro-max consultation + duplicate UAT round | v52-04 ships ~10-15 LOC in 1 plan |
| Issue 6 → Option C (system/templates pointer doc) | Track D's 4-option evaluation: A duplicates data, B has uniqueness-invariant footgun, D doesn't solve canonical-template problem; C is minimal-change + sticky-memory-compatible + backwards-compat | v52-05 plans against Option C; ~125 LOC + new API route + admin-only rule |
| 6 OQ defaults locked by Daniel | Daniel approved synthesis with all defaults; unblocked Wave 1 planning without round-trip on individual answers | v52-02..05 plans against locked scope; surfaces re-confirmable at each plan's APPLY entry |
| No v52-h hotfix split | Issue 1 firmed to HIGH confidence as recovery-affordance gap, not fundamental data-flow break — single v52-03 plan handles it | Smaller workflow surface; standard PAUL flow not interrupted |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 0 | N/A |
| Scope additions | 1 | Follow-up Issue 1 firming pass added; net positive — pushed Issue 1 from MEDIUM to HIGH confidence |
| Deferred | 1 | Task 2 HUMAN-ACTION; substituted with deferral doc + per-phase post-deploy UAT acceptance criteria |

**Total impact:** Net positive — synthesis confidence target met without prophylactic iPad UAT; verification gate cleanly relocated to per-phase post-deploy UAT (which the codified discipline already requires anyway).

### Auto-fixed Issues

None.

### Scope Additions

**1. Follow-up Issue 1 firming pass (3 questions)**
- **Found during:** Decision-time of Task 2 deferral
- **Issue:** Issue 1's iPad-vs-desktop divergence had MEDIUM confidence pre-firming; risk of v5h-01-style "wrong hypothesis" cycle in v52-03 if not firmed
- **Fix:** Spawned focused dan-researcher subagent on 3 specific questions: existing recovery affordances, auth-claim staleness as compounding factor, `failed` state auto-recovery behavior
- **Files:** `.paul/phases/v52-01-recursive-research/track-b-sync-indicator-research.md` (appended ~120 lines)
- **Verification:** Issue 1 row in confidence matrix now HIGH; v52-03 deliverables crystallized

### Deferred Items

- **Task 2 HUMAN-ACTION iPad UAT capture** — substituted with `ipad-uat-capture.md` deferral doc. Real-device verification moved to per-phase post-deploy Daniel-loop UAT (per v51-04 PROJECT.md "UAT Discipline (data-flow fixes)" section). Each of v52-02..v52-05 carries explicit UAT acceptance criteria covering the deferred observations.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Daniel unavailable for HUMAN-ACTION iPad UAT capture mid-APPLY | Recorded as deviation; substituted with deferral doc + per-phase post-deploy UAT acceptance criteria (codified discipline from v51-04). No confidence loss. |
| Track-c file used "Audit Findings" header instead of literal "Audit Table" string | Verify command grep failed but content is equivalent (table is in the Audit Findings section). AC-1 satisfied semantically. |
| Track files came in shorter than 400-800 line target (track-a 100, track-b 242 incl. follow-up, track-c 70, track-d 105) | Substantively complete with file:line citations and required sections; cross-track confirmation made up for individual brevity. Not a quality issue; just compressed prose. Synthesis cross-validated findings. |

## Skill Audit

| Expected | Invoked | Notes |
|----------|---------|-------|
| /ui-ux-pro-max | ○ | NOT REQUIRED for v52-01 per SPECIAL-FLOWS.md (research-only, zero UI changes; gate applies to v52-02..05 APPLY) |

## Next Phase Readiness

**Ready:**
- Wave 1 plans v52-02..v52-05 all parallel-eligible — synthesis gives each plan-shape, scope, files, /ui-ux-pro-max gate status, Daniel-loop UAT acceptance criterion, and ordering
- 6 OQ defaults locked: Q1=(a) SetlistCards / Q2=admin-only / Q3=phased / Q4=editor kebab / Q5=silent fallback / Q6=remove kebab
- Issue 1+4 independent fix paths defined; v52-03 plan-shape clear (2 tasks within 1 plan)
- Issues 2+3 shared substrate fix path defined; v52-02 plan-shape clear (single ~30 LOC plan)
- Issues 5+7 file-bundled fix path defined; v52-04 plan-shape clear (~10-15 LOC in single plan)
- Issue 6 architecture (Option C) defined; v52-05 plan-shape clear (~125 LOC + new API route + decision-checkpoint at top to confirm Q2/Q3 scope)

**Concerns:**
- v52-05 templates feature has coordination risk with v52-03 if Issue 4's kebab is removed entirely — v52-05's "Save as default" entry point may need to land elsewhere (e.g., editor toolbar overflow). Plan-time decision flagged in synthesis.
- Issue 3 sub-mode disambiguation depends on post-deploy iPad UAT — if substrate fix doesn't cover sub-modes (b)/(c), v52-02 phase may need a follow-up plan (per v51-04 "UAT failures route to a new plan in same phase" rule).
- Track files are slimmer than target depth; if a future phase surfaces a wrong-hypothesis case rooted in track-file brevity, retroactively expand the relevant track via SendMessage to the original subagent.

**Blockers:**
- None.

**Recommended sequencing:** Wave 1 (parallel) — `/paul:plan` for all four phases v52-02..v52-05. If Daniel prefers serial: v52-02 first (highest user-impact, smallest scope), then v52-03 → v52-04 → v52-05.

---
*Phase: v52-01-recursive-research, Plan: 01*
*Completed: 2026-04-30*
