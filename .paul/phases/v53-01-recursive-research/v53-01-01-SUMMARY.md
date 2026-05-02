---
phase: v53-01-recursive-research
plan: 01
subsystem: research
tags: [chartbind, polymorphic-add, old-editor-archaeology, save-loss-recurrence, ipad-uat]

# Dependency graph
requires:
  - phase: v52-02-ipad-focus-cmdk-fix
    provides: TouchOrPopover suppressAutoFocus contract (ruled out as ChartBind cause via Track A H3)
  - phase: v50-04-song-catalog-sticky-memory
    provides: SongDefaults contract (cited by Track A H5: chartId NOT in sticky memory by design)
  - phase: v50-05-spreadsheet-editor
    provides: AddRowPlaceholder + ChartBindPopover + ChartCell substrate (Track A + C primary surfaces); commit d8c0442 was the deletion SHA Track B spelunked
  - phase: v5h-01-track-edit-save-loss
    provides: postmortem + E+F+B defense-in-depth pattern (cited as anti-pattern guard for Track B port-back inventory; recurrence finding triggers v5h3 hotfix)
provides:
  - 3 track research reports (ChartBind diagnosis / old-editor archaeology / polymorphic Add + chart-peek option sets)
  - iPad UAT capture documenting save-loss recurrence as NEW high-severity finding
  - RESEARCH-SYNTHESIS.md with rescope recommendation
  - Old-editor port-back inventory (RECOMMENDED / REJECTED / DEFERRED verdicts)
affects: [v5h3-01 (NEW hotfix), v53-02 chart-binding-and-verification, v53-03 polymorphic-add-menu, v53-04 editor-affordance-pass]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Recursive research with HUMAN-ACTION UAT checkpoint can surface NEW high-severity findings outside original scope (save-loss recurrence here); synthesis must adapt and recommend rescope rather than force-fit"
    - "Track B (git archaeology) verdict format: Pattern | Old SHA | What-it-did-well | Risk-if-ported | Verdict (RECOMMENDED/REJECTED/DEFERRED) — directly portable to future amputation/rebuild research"

key-files:
  created:
    - sheet-music-app/.paul/phases/v53-01-recursive-research/track-a-chartbind-research.md
    - sheet-music-app/.paul/phases/v53-01-recursive-research/track-b-old-editor-archaeology.md
    - sheet-music-app/.paul/phases/v53-01-recursive-research/track-c-polymorphic-add-and-chart-peek.md
    - sheet-music-app/.paul/phases/v53-01-recursive-research/ipad-uat-capture.md
    - sheet-music-app/.paul/phases/v53-01-recursive-research/RESEARCH-SYNTHESIS.md
  modified: []

key-decisions:
  - "RESCOPE — insert v5h3 hotfix BEFORE v53-02..04 (save-loss recurrence is higher priority than UX repair)"
  - "Drop chart-verification peek from v5.3 scope per Daniel"
  - "Track B verdicts: Polymorphic Add menu RECOMMENDED → v53-03; Inline chart binding REJECTED (re-introduces v5h-01 fragility); Chart preview DEFERRED → v53-04 (likely collapse)"
  - "ChartBind picker fix smallest-fix path: cmdk value format (`${title} ${id}` → `${title}`, ~10 LOC); Track A confidence MEDIUM-HIGH"
  - "AddRow no-suggestions and ChartBind picker filter share ONE root cause (both use identical useLiveQuery + cmdk value pattern) — fix bundle covers both surfaces"
  - "NEW finding: ChartCell off-screen on iPad — added to v53-02 scope (column-reorder vs. row-side affordance, /ui-ux-pro-max consultation needed)"

patterns-established:
  - "Daniel-loop UAT discipline (codified v51-04) WORKS — caught v5.3-not-yet-existent save-loss recurrence in the very first research-phase UAT, before any v5.3 code shipped. Validates the cycle: every research/data-flow phase gets real-iPad UAT."
  - "When research-phase UAT surfaces NEW high-severity findings outside original plan scope, synthesis MUST recommend rescope at decision checkpoint rather than approve. Rescue path: insert hotfix sibling phase before remaining phases."
  - "Old-editor archaeology: git-spelunk deletion commit (here: d8c0442 v50-05-02) → recover candidate UI patterns → score against postmortem-cited risks → produce verdict table. Reusable for any future amputation/rebuild milestone."

# Metrics
duration: ~45min
started: 2026-05-02T07:18:00Z
completed: 2026-05-02T07:55:00Z
---

# v53-01-01: Recursive Research Summary

**3 parallel research tracks completed; iPad UAT surfaced save-loss recurrence as NEW high-severity finding; synthesis recommends RESCOPE — insert v5h3 hotfix before v53-02..04. Daniel selected RESCOPE at decision checkpoint.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~45 minutes end-to-end |
| Started | 2026-05-02T07:18:00Z |
| Completed | 2026-05-02T07:55:00Z |
| Tasks | 4 of 4 completed |
| Files created | 5 (3 track reports + UAT capture + synthesis) |
| Source files modified | 0 (research-only; boundary clean) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: All 3 track research reports produced | ✅ Pass | track-a (170 lines, 5 hypotheses tested with file:line evidence), track-b (91 lines, 3-pattern verdict table + 3 anti-pattern callouts), track-c (108 lines, 3+3 option sets ranked) |
| AC-2: iPad UAT capture documents real-device behavior | ✅ Pass | Daniel captured 3 surfaces + surfaced unplanned save-loss recurrence; not deferred |
| AC-3: Synthesis identifies root causes with confidence levels | ✅ Pass | 7-row confidence matrix; save-loss = LOW (needs production state capture in v5h3-01-01); ChartBind = MEDIUM-HIGH; AddRow polymorphism = HIGH |
| AC-4: Synthesis recommends phase-2..4 scope refinements | ✅ Pass | v53-02 scope expanded (ChartCell discoverability) + shrunk (chart-peek dropped); v53-03 unchanged shape; v53-04 likely collapses; NEW v5h3 phase recommended |
| AC-5: Daniel approves synthesis or requests round 2 | ✅ Pass | Daniel selected RESCOPE (not approve, not round-2) — strongest recommendation matched Daniel's choice |

## Accomplishments

- **Save-loss recurrence caught BEFORE any v5.3 code shipped.** Daniel-loop UAT discipline (codified v51-04) validated by surfacing a v5h-01-class bug during v53-01 UAT capture rather than letting it ship as a v5.3-hotfix-after-the-fact. Same pattern as v5h-01: production-only repro that unit tests miss.
- **ChartBind picker root cause confirmed sub-mode (c)** — picker opens, keyboard pops, typing produces no results. cmdk value-format scoring (H1 confirmed) + library hydration timing (H2 partial) implicated. Smallest-fix path is ~10 LOC; systemic-fix path adds Recents section (~80-120 LOC); decision deferred to v53-02 PLAN time depending on v5h3 production state diagnosis.
- **Old-editor polymorphic Add menu found in commit d8c0442** (`AddBar.tsx` 6-tile dropdown with distinctive icon colors per type). Verdict: RECOMMENDED to port to v53-03 with no architectural risk (pure UX affordance, single applyEdit path). Daniel's "MUCH better" memory has a concrete artifact.
- **Anti-pattern guards established for v53-04.** Track B's Replace/Unlink + dual-write + optimistic-state-divergence patterns formally REJECTED with v5h-01 postmortem citations. Future port-back consideration MUST clear these checks.
- **NEW iPad finding: ChartCell off-screen** ("scroll way to the right to see the chart button"). Daniel's report added a 4th v53-02 surface beyond Track A's plan. /ui-ux-pro-max consultation at PLAN entry will lock column-reorder vs. row-side-affordance choice.

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `sheet-music-app/.paul/phases/v53-01-recursive-research/track-a-chartbind-research.md` | Created | Track A — 5 hypotheses tested + 5-test sub-mode disambiguation plan + 2 fix paths |
| `sheet-music-app/.paul/phases/v53-01-recursive-research/track-b-old-editor-archaeology.md` | Created | Track B — git-spelunk d8c0442; 3 patterns inventoried with verdicts; 3 anti-pattern callouts |
| `sheet-music-app/.paul/phases/v53-01-recursive-research/track-c-polymorphic-add-and-chart-peek.md` | Created | Track C — 3 polymorphic Add option sets + 3 chart-peek option sets (latter shelved per Daniel) |
| `sheet-music-app/.paul/phases/v53-01-recursive-research/ipad-uat-capture.md` | Created | Daniel UAT — save-loss recurrence + ChartBind sub-mode (c) + ChartCell off-screen + AddRow no-suggestions + chart-verify dropped |
| `sheet-music-app/.paul/phases/v53-01-recursive-research/RESEARCH-SYNTHESIS.md` | Created | 7-row confidence matrix + port-back inventory + rescope recommendation + open questions for Daniel |
| `sheet-music-app/.paul/phases/v53-01-recursive-research/v53-01-01-PLAN.md` | Pre-existing | Plan for this loop (created in PLAN phase) |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| iPad UAT captured (not deferred) | Daniel was available; per v52-01 deferral was the alternative; capture closed Track A confidence gap AND surfaced save-loss recurrence | Save-loss caught before v5.3 code shipped (vs. caught post-deploy as a v5.3-hotfix) |
| Chart-verification peek DROPPED from v5.3 | Daniel: "don't worry about this. Fix the other pieces." | v53-02 scope ~halved; Track C chart-peek option set shelved as documentation for future milestone revival |
| RESCOPE selected over approve/round-2 | Save-loss is higher priority than UX repair; production state capture (round-2 alternative) belongs in v5h3-01-01 not as deferred research | v5.3 milestone shape changes: insert v5h3 hotfix; v53-04 likely collapses |
| ChartCell discoverability added to v53-02 scope | NEW UAT finding NOT in Track A original plan; "scroll way to the right" is iPad-blocking | v53-02 scope expanded by 1 surface |
| Track B port-back: RECOMMENDED only Polymorphic Add menu | Pure UX affordance; zero architectural risk; matches Daniel's regret exactly. Inline binding REJECTED (v5h-01 fragility). Chart preview DEFERRED (Daniel dropped chart-verify entirely → likely collapse v53-04) | v53-03 has clear scope; v53-04 likely collapses to zero |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 0 | — |
| Scope additions | 2 | Save-loss recurrence (NEW phase v5h3 inserted); ChartCell discoverability (added to v53-02). Both surfaced via UAT, not deviations from research methodology. |
| Deferred | 1 | Chart-verification peek option set shelved (Daniel dropped) |

**Total impact:** Plan executed exactly as designed; UAT surfaced findings the plan was designed to accommodate. The rescope decision is the plan's success path, not a deviation.

### Auto-fixed Issues

None.

### Deferred Items

- **Chart-verification peek (Track C output)** — Track C produced 3 option sets ranked (Option B tap-modal STRONGEST). Daniel dropped from v5.3 scope. Option set documented in `track-c-polymorphic-add-and-chart-peek.md` and shelved for future-milestone revival.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Track A H1 (cmdk value format) confidence partially bridged by code-read alone — needed UAT to confirm symptom matched hypothesis | Daniel UAT captured "never sees or suggests anything when I type" — confirms symptom; H2 (Dexie hydration) cannot be disambiguated from H1 without production state capture (deferred to v5h3-01-01) |
| Track B initially considered porting back inline chart preview — verdict required cross-checking against v5h-01 postmortem to confirm safety with new Dexie-backed ChartCell | Resolved: Chart preview = DEFERRED (safe IF ChartCell reads from Dexie, which it does post-v50-05) — but Daniel's chart-verify drop likely makes this moot |
| Save-loss recurrence is OUTSIDE the v5.3 milestone scope — handling required deciding whether to silently ignore, force-fit, or rescope | Resolved: synthesis recommended RESCOPE (insert v5h3-hotfix); Daniel agreed at decision checkpoint |

## Skill Audit

SPECIAL-FLOWS.md exists: `/ui-ux-pro-max` is required for any phase touching frontend UI/UX. v53-01 is research-only (zero source code modified, boundary clean) — gate does NOT apply. Skill audit: ✓ correctly N/A.

`/ui-ux-pro-max` WILL be required at v53-02 / v53-03 APPLY entry. Track C's option-set output is structured for direct /ui-ux-pro-max consultation at those entry points.

## Next Phase Readiness

**Ready:**
- v5h3 hotfix scope defined (3 plans recommended: reproduce+diagnose / fix / postmortem); plan template borrows from v5h-01 directly
- v53-02 scope refined (ChartBind picker fix + ChartCell discoverability; chart-peek out)
- v53-03 scope confirmed (Track C Option A vs. Option B decision deferred to PLAN time; touch-target compliance fix mandatory)
- Track B port-back inventory ready as input to v53-03 + v53-04
- iPad UAT discipline validated for v5.3+ — every data-flow phase gets real-iPad UAT before milestone close

**Concerns:**
- Save-loss recurrence confidence is LOW until v5h3-01-01 captures production state. If Daniel cannot get to this morning's affected setlist for inspection, fix may be wrong (cf. v5h-01 §2 "3 wrong handoff hypotheses").
- Kitchen-sink harness fidelity gap (v5h-01 §5) is now twice-implicated (v5h-01 + v5h3 recurrence). v5h3-01-03 postmortem MUST close the gap or escalate it as a milestone-level commitment (Firebase emulator + thin RTL editor↔perf-view test pair).
- v53-04 likely collapses entirely — Daniel decision pending in v5h3 plan window or at v53-04 PLAN entry.

**Blockers:**
- None for v5h3-01 planning. v53-02 / v53-03 are blocked behind v5h3-01 close (rescope ordering).

---

*Phase: v53-01-recursive-research, Plan: 01*
*Completed: 2026-05-02*
