---
phase: v5h3-01-save-loss-recurrence
plan: 01
subsystem: research
tags: [save-loss, recurrence, autonomous-investigation, code-scan-only, anti-pattern-audit, harness-fidelity-gap]

# Dependency graph
requires:
  - phase: v53-01-recursive-research
    provides: 6 hypotheses (H-SL-1..6) sourced from iPad UAT capture; rescope decision that inserted v5h3-01 as a hotfix
  - phase: v5h-01-track-edit-save-loss
    provides: postmortem (defense-in-depth pattern + harness fidelity gap deferral) + E+F+B contract verified intact via anti-pattern audit
provides:
  - Investigation doc with code-scan verdicts on 6 hypotheses
  - Anti-pattern audit confirming all v5h-01 fixes still in place
  - Round-2 path locked (Option B — auto-capture instrumentation)
  - Back-propagated ChartBind H2 deferral note to v53-01 RESEARCH-SYNTHESIS.md
affects: [v5h3-01-02 (auto-capture instrumentation build), v5h3-01-03 (postmortem + fix after recurrence captured), v53-02 chart-binding-and-verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Autonomous code-scan investigation: when production capture is blocked (already-refreshed iPad + autonomous-mode session), code-scan can RULE OUT hypotheses where the code path categorically cannot produce the symptom; cannot CONFIRM without evidence; honest output is round-2 instrumentation rather than guess-and-fix"
    - "Anti-pattern audit format (cross-reference prior postmortem): line-by-line check of each prior-fix's contract still in place; 12-row table covering rules, listener guards, atomicity, instrumentation, and absence of new bypass paths"

key-files:
  created:
    - sheet-music-app/.paul/postmortems/v5h3-01-save-loss-recurrence-investigation.md
  modified:
    - sheet-music-app/.paul/phases/v53-01-recursive-research/RESEARCH-SYNTHESIS.md (back-propagated ChartBind H2 deferral)

key-decisions:
  - "HUMAN-ACTION DEFERRED per Daniel autonomous-mode direction + already-refreshed iPad"
  - "Code-scan verdicts: H-SL-2/3/4 RULED OUT (definitive); H-SL-1/5/6 STILL OPEN (need evidence)"
  - "Anti-pattern audit PASSES — all v5h-01 fixes intact (12-row checklist)"
  - "Round-2 Option B selected — auto-capture instrumentation only (no manual capture path)"
  - "Harness fidelity gap (v5h-01 §5 action item #2) ESCALATED — recurrence is evidence v5h-01-04 deferral was wrong; v5h3-01-03 postmortem must commit to closure"

patterns-established:
  - "Round-2 Option B (auto-capture instrumentation): when manual production capture is unavailable, build observability infra to catch next recurrence without user intervention. Pattern: Sentry breadcrumbs at hot write paths + IndexedDB-persisted edit log + upload-on-mount. Enables evidence-driven fix without depending on user iPad availability."
  - "Code-scan-only investigation discipline: rule out what code paths can't produce; explicitly do NOT pick a fix shape on hypotheses requiring evidence (avoids v5h-01 §2 'wrong handoff hypotheses' mistake)"
  - "Back-propagation note pattern: when one phase's investigation defers a question relevant to a sibling phase's synthesis, append a back-propagation note to the sibling synthesis with a forward pointer to where it'll be resolved"

# Metrics
duration: ~30min
started: 2026-05-02T08:00:00Z
completed: 2026-05-02T08:30:00Z
---

# v5h3-01-01: Save-Loss Recurrence Investigation Summary

**Code-scan investigation ruled out 3 of 6 hypotheses; 3 still open requiring production evidence; anti-pattern audit confirms all v5h-01 fixes intact; Round-2 Option B (auto-capture instrumentation) locked for v5h3-01-02 to ship.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~30 minutes |
| Started | 2026-05-02T08:00:00Z |
| Completed | 2026-05-02T08:30:00Z |
| Tasks | 3 of 3 resolved (Task 1 deferred per autonomous-mode; Task 2 + 3 completed) |
| Files created | 1 (investigation doc) |
| Files modified | 1 (back-propagation note to v53-01 synthesis) |
| Source files modified | 0 (boundary clean) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Production state captured from Daniel's iPad | ⏸️ Deferred | Daniel directed autonomous mode; iPad already refreshed (Console + Network history lost). Per plan's accommodation, marked "deferred" with route-forward to v5h3-01-02 auto-capture instrumentation |
| AC-2: Code-scan diagnostics narrow the 6 hypotheses | ✅ Pass | 3 RULED OUT (H-SL-2/3/4) + 3 STILL OPEN (H-SL-1/5/6) with file:line evidence + reasoning per hypothesis |
| AC-3: Ranked confidence matrix produced | ✅ Pass | 6-row matrix; highest still-open priority = H-SL-5 auth-claim (MEDIUM, known prior art) |
| AC-4: ChartBind H2 sibling diagnosis resolved | ⏸️ Deferred | Songs-table count not captured; back-propagation note added to RESEARCH-SYNTHESIS.md with forward pointer to v5h3-01-01b round-2 |
| AC-5: Decision-checkpoint resolution recorded | ✅ Pass | Daniel selected Round-2 Option B (auto-capture instrumentation only) |

## Accomplishments

- **Anti-pattern audit PASSES** — 12-row cross-reference against v5h-01 postmortem confirms all defense-in-depth fixes are still in place: rules `match /tracks/{id}` + `match /songs/{id}` (firestore.rules:115-120, 128-133); snapshot-listener LWW guards (snapshot-listener.ts:186-189, 233-236); engine writeback atomicity (engine.ts:259-282); Sentry dead-letter capture (engine.ts:398-404). Recurrence is NOT a regression of v5h-01 fixes; it's a NEW failure mode the existing defenses don't cover.
- **3 hypotheses eliminated definitively by code-scan**: H-SL-2 (sticky-memory writes to songs/{id} not tracks/{id}); H-SL-3 (clearFailedOutboxRows is user-triggered only, incompatible with selective-failure pattern); H-SL-4 (engine has no shared capacity; v52-05 setDefaultForServiceType bypasses outbox via direct setDoc). Code-scan-strong, would only reverse with contradictory production evidence.
- **3 hypotheses remain open requiring evidence**: H-SL-5 (auth-claim staleness, MEDIUM confidence — Sentry would have captured if dead-letter fired); H-SL-1 (TextCell single-tap blur/commit race, LOW-MED — needs cell-type-correlated failure pattern from Daniel's recall); H-SL-6 (different bug entirely, LOW — code-scan exhausted, no specific candidate found).
- **Harness fidelity gap (v5h-01 §5 action item #2) escalated**: kitchen-sink harness should have caught this recurrence but didn't — the v5h-01-04 deferral of Firebase emulator + thin RTL editor↔perf-view test pair was wrong. v5h3-01-03 (final postmortem) MUST commit to closure (either v5.4 standalone phase OR include in v5h3-01-02 fix scope as "harness-fidelity-only" bundle).
- **Round-2 path locked**: Option B (auto-capture instrumentation only). v5h3-01-02 will build Sentry breadcrumbs at TextCell.commit + applyEdit + engine.drainOnce per-row + snapshot-listener.handleTracks; IndexedDB-persisted edit recovery log → upload on next mount. Deploy to production. Wait for next recurrence; auto-capture surfaces cause without Daniel intervention.

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `sheet-music-app/.paul/postmortems/v5h3-01-save-loss-recurrence-investigation.md` | Created | 6-hypothesis verdict matrix + anti-pattern audit (12 rows) + ChartBind H2 deferral + Round-2 Option B rationale + open questions for Daniel |
| `sheet-music-app/.paul/phases/v53-01-recursive-research/RESEARCH-SYNTHESIS.md` | Modified | Back-propagated ChartBind H2 disambiguation deferral note (3-line append above "Files produced" section) |
| `sheet-music-app/.paul/phases/v5h3-01-save-loss-recurrence/v5h3-01-01-PLAN.md` | Pre-existing | Plan for this loop (created in PLAN phase earlier this session); modified mid-flight to reflect refresh constraint (Captures 4 + 7 reframed; Capture 8 added) |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| HUMAN-ACTION deferred (autonomous mode) | Daniel said "1 continue autonomously" after reporting iPad already refreshed | Code-scan-only diagnosis; cannot confirm hypotheses without evidence; honest output is round-2 not best-guess fix |
| H-SL-2/3/4 RULED OUT (code-scan definitive) | H-SL-2: writes songs/{id} not tracks/{id}; H-SL-3: user-triggered-only incompatible with selective failure; H-SL-4: bypasses outbox + no shared capacity | 3 hypotheses removed from instrumentation scope; v5h3-01-02 breadcrumbs target H-SL-1 + H-SL-5 + H-SL-6 surfaces only |
| Round-2 Option B selected over A or C | Option B = zero Daniel time on iPad; matches autonomous-mode directive; Option A required manual capture which user explicitly deferred; Option C added Daniel work he just declined | v5h3-01-02 builds instrumentation; deploys; next recurrence auto-captures evidence |
| Harness fidelity gap escalated, not deferred again | v5h-01-04 deferred this; recurrence proves the deferral was wrong; deferring twice would compound the cost when next recurrence happens | v5h3-01-03 (postmortem) committed to closure decision; choices are v5.4 phase OR bundled into v5h3-01-02 |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 0 | — |
| Scope additions | 1 | Mid-flight plan revision: refresh-constraint accommodations to Captures 4 + 7 + new Capture 8 (live-edit reproduction). Daniel reported the refresh AFTER plan was approved; plan revised to reflect reality before APPLY. |
| Deferred | 2 | HUMAN-ACTION capture (per autonomous-mode direction) + ChartBind H2 sibling diagnosis (depends on songs-table count from production) |

**Total impact:** Plan accommodation worked as designed (deferral path explicit); autonomous-mode direction surfaced a constraint the plan was built to handle. Round-2 Option B is the route-forward.

### Auto-fixed Issues

None.

### Deferred Items

- **HUMAN-ACTION production capture (AC-1)** — Per Daniel autonomous-mode direction + iPad already refreshed. Route-forward: v5h3-01-02 auto-capture instrumentation will catch next recurrence without manual capture.
- **ChartBind H2 sibling diagnosis (AC-4)** — Songs-table count not captured. Route-forward: v5h3-01-01b round-2 plan if Daniel decides to manually capture; OR resolved automatically via v5h3-01-02 instrumentation deployment + first recurrence.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Daniel refreshed iPad mid-session, before APPLY started | Plan updated in-flight with refresh-constraint accommodations (Captures 4 + 7 reframed, Capture 8 added for live-edit reproduction). Daniel then chose autonomous mode, deferring all capture work. |
| 3 of 6 hypotheses cannot be disambiguated by code-scan alone | v5h-01 §2 lesson honored — did NOT guess a fix shape. Round-2 Option B locks instrumentation build; evidence-driven fix lands later in v5h3-01-03 (or sibling phase) once recurrence captured. |

## Skill Audit

SPECIAL-FLOWS.md exists: `/ui-ux-pro-max` is required for any phase touching frontend UI/UX. v5h3-01-01 is research-only (zero source code modified, boundary clean) — gate does NOT apply. Skill audit: ✓ correctly N/A.

`/ui-ux-pro-max` consultation NOT required at v5h3-01-02 APPLY entry either, per precedent: v50-07-05 Sentry instrumentation phase did not require /ui-ux-pro-max because it was observability-only with no visual surface change. v5h3-01-02 follows the same precedent (Sentry breadcrumbs + IndexedDB recovery log are observability infra; no new UI surfaces).

## Next Phase Readiness

**Ready:**
- v5h3-01-02 plan can be written with concrete scope: Sentry breadcrumb sites (4 hot paths), Dexie schema bump v(N+1) for new `edit_log` table (additive non-indexed per v50-04 rule), upload-on-mount helper, no-PII enforcement, tests.
- Investigation doc provides anti-pattern audit baseline so v5h3-01-02 instrumentation doesn't accidentally re-introduce v5h-01 anti-patterns.
- Round-2 path is explicit; no decision-checkpoint friction at v5h3-01-02 PLAN time.

**Concerns:**
- 3 hypotheses remain open; v5h3-01-02 instrumentation must cover ALL 3 surfaces (TextCell.commit for H-SL-1; engine drain + auth-error path for H-SL-5; broad write-path coverage for H-SL-6). Missing one risks not catching the recurrence.
- Sentry breadcrumb noise budget: too many breadcrumbs = signal-to-noise drops; too few = miss the cause. Tune carefully, perhaps ratio'd or sampled.
- IndexedDB edit_log capacity: must cap at small N (~500 rows; ~7 days at typical edit rate) to avoid bloating local storage; rotation policy + delete-on-upload.

**Blockers:**
- None for v5h3-01-02 planning. v53-02 + v53-03 + v53-04 stay blocked behind v5h3-01-02 deploy + first-recurrence-captured (per rescope ordering).

---

*Phase: v5h3-01-save-loss-recurrence, Plan: 01*
*Completed: 2026-05-02*
