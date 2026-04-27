---
phase: v5h-01-track-edit-save-loss
plan: 04
subsystem: docs
tags: [postmortem, lessons, harness-fidelity, rules-audit, daniel-loop-uat]

requires:
  - phase: v5h-01-track-edit-save-loss
    provides: v5h-01-01 root-cause research; v5h-01-02 E+F+B fix shipped (rules + Hydrator outbox guard + listener LWW); v5h-01-03 perf-view architectural refactor (Dexie via useLiveQuery + listener mount)

provides:
  - Postmortem at .paul/postmortems/v5h-01-save-loss.md (cutover rules-audit gap proposal + harness fidelity gaps with remediation options + perf-view architectural-rethink lesson + auth-claim staleness incident + Daniel-loop UAT norm + Issue 2 routing rule + 5 action items)
  - ROADMAP.md correction (3-plan claim → actual 4-plan structure with v5h-01-03 = perf-view refactor, v5h-01-04 = postmortem)
  - 5 actionable lessons captured for v5.x and beyond

affects: [v5.1-ux-overhaul, future-cutover-phases, v5.x-harness-work, paul-plan-phase-workflow, carl-global-rules]

tech-stack:
  added: []
  patterns:
    - "Cutover rules-audit gate proposal (planning-time check for new top-level Firestore collections)"
    - "2-3-strikes architectural-rethink rule (stop patching after 2-3 hook iterations; question architecture)"
    - "Daniel-loop UAT cadence as v5.x milestone-close gate"

key-files:
  created:
    - .paul/postmortems/v5h-01-save-loss.md
  modified:
    - .paul/ROADMAP.md

key-decisions:
  - "Recommend Firebase emulator + thin RTL editor↔perf-view test PAIR for kitchen-sink remediation (covers all 3 named fidelity gaps)"
  - "Auth-claim auto-refresh on rules-version change is OUT of scope (Firebase doesn't expose rules-version; complexity not worth rare scenario)"
  - "Codify Daniel-loop UAT cadence in PROJECT.md or PAUL milestone-close gate before v5.1 ships"
  - "Issue 2 (iPad key-picker UI) routing rule: tap-target/sheet → v50-05-04 regression; feels janky → v5.1 UX overhaul"

patterns-established:
  - "Postmortems live at .paul/postmortems/{phase-id}-{topic}.md; cross-reference SUMMARYs with relative paths"
  - "Postmortem structure: TL;DR + Timeline + Root Cause + Shipped + Lessons (numbered subsections) + Deferred Items + Action Items + Appendix"

duration: 35min
started: 2026-04-27T13:30:00Z
completed: 2026-04-27T14:05:00Z
---

# v5h-01-04 SUMMARY — Postmortem (v5.0-hotfix Track-Edit Save-Loss)

**Wrote `.paul/postmortems/v5h-01-save-loss.md` codifying the 5 lessons from v5h-01-01..03, with concrete action items (cutover rules-audit gate; kitchen-sink emulator + RTL pair; Daniel-loop UAT codification) targeting v5.x and corrected ROADMAP.md to match the actual 4-plan structure.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~35 min |
| Started | 2026-04-27T13:30:00Z |
| Completed | 2026-04-27T14:05:00Z |
| Tasks | 3 of 3 completed |
| Files modified | 2 (1 created + 1 edited) |
| Suite | 1481/1481 |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Postmortem document exists at canonical path | ✅ Pass | `.paul/postmortems/v5h-01-save-loss.md` created; cross-linked from this SUMMARY |
| AC-2: Covers cutover-plan rules-audit gap | ✅ Pass | §Lessons.1 with proposed gate wording for PAUL plan-phase OR CARL global rule |
| AC-3: Covers kitchen-sink harness fidelity gaps | ✅ Pass | §Lessons.2 with 3 named gaps (no security-rules layer / no perf-view path / zero-latency adapters) and 3 remediation options each |
| AC-4: Covers perf-view fix iteration cycle | ✅ Pass | §Lessons.3 with 3a (`metadata.fromCache` is source not freshness) + 3b (research-before-execute) + 3c (2-3-strikes architectural-rethink rule) |
| AC-5: Covers auth-claim staleness + Daniel-loop UAT norm + Issue 2 routing | ✅ Pass | §Lessons.4 (auth-claim staleness, out-of-scope reasoning) + §Lessons.5 (Daniel-loop as v5.x norm) + Deferred Items table (Issue 2 routing rule) |
| AC-6: ROADMAP.md reflects 4-plan structure | ✅ Pass | Milestone table row updated (3 → 4); plan list rewritten with v5h-01-03 = perf-view refactor + v5h-01-04 = postmortem |
| AC-7: Suite + build remain green | ✅ Pass | `npm test` → 137 files, 1481/1481 passed (32.91s); `npm run build` → clean |

## Accomplishments

- **Root cause + fix narrative captured at a referenceable URL** — future planners hitting a similar "harness green but production fails" situation can read the v5h-01 postmortem and recognize the pattern (cutover plan introduced unprotected Firestore collection; default-deny silent fail; harness can't see security rules).
- **Cutover rules-audit gate proposed with concrete wording** — ready to lift into either PAUL's `/paul:plan-phase` workflow or a CARL global rule. Detection at plan-write time: planner reads `firestore.rules`, extracts `match` paths, compares against new collections introduced in plan narrative.
- **Kitchen-sink harness fidelity gaps named with ranked remediation** — emulator + RTL test pair recommended; each gap has 3 options (highest-fidelity → cheapest) so future implementers can choose by cost.
- **2-3-strikes architectural-rethink rule codified** — when a hook gets patched 2-3 times without fixing the user-visible symptom, stop patching and ask whether the architecture is right. Saved retroactively from the v5h-01-03 4-iteration cycle.
- **Daniel-loop UAT cadence proposed as v5.x norm** — every fix touching data flow gets a Daniel UAT against real production before milestone close.

## Task Commits

This plan ships as a single atomic commit at the close (docs-only, no incremental commits during APPLY):

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Task 1: Write postmortem | (close commit, pending) | docs | `.paul/postmortems/v5h-01-save-loss.md` (TL;DR + Timeline + Root Cause + Shipped + 5 lessons + Deferred + 5 action items + Appendix) |
| Task 2: ROADMAP correction | (close commit, pending) | docs | `.paul/ROADMAP.md` (3 → 4 plans for v5h-01) |
| Task 3: Suite + build verify | (no commit; verification only) | — | 1481/1481 + `next build` clean |

Plan metadata + STATE.md + this SUMMARY land in the same close commit.

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `.paul/postmortems/v5h-01-save-loss.md` | Created (~250 lines) | Postmortem with 5 lessons + 5 action items |
| `.paul/ROADMAP.md` | Modified (2 edits) | Phase v5h-01: 3 → 4 plans; plan list rewritten |
| `.paul/STATE.md` | Modified (across PLAN/APPLY/UNIFY) | Loop position + last activity + how-to-resume routing |
| `.paul/phases/v5h-01-track-edit-save-loss/v5h-01-04-PLAN.md` | Created | Plan for this work |
| `.paul/phases/v5h-01-track-edit-save-loss/v5h-01-04-SUMMARY.md` | Created (this file) | Loop closure |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Recommend Firebase emulator + thin RTL editor↔perf-view test PAIR for kitchen-sink remediation | Emulator covers Gaps A (security rules) + C (cache-vs-fresh); RTL test covers Gap B (perf-view path). Pair is cheaper than full integration framework swap. | Future v5.x harness work has a recommended path; specific implementation deferred to opportunistic ticketing. |
| Auth-claim auto-refresh on rules-version change is OUT of scope | Firebase doesn't expose rules-version changes to client; auto-refresh requires server-side coordination via custom-claims revision bumps; rare scenario doesn't justify complexity. | Documented as awareness item; no plan opened. Future on-call sessions know "401-ish behavior post-rules-deploy → sign-out/in first". |
| Postmortems live at `.paul/postmortems/{phase-id}-{topic}.md` | Pattern already established by v50-07-save-loss-investigation.md. Discoverable via filename; cross-referenceable from SUMMARYs. | New postmortem lands at `.paul/postmortems/v5h-01-save-loss.md` (note: NOT `v50-07-save-loss.md` as the original v5h-01-03 plan had named it — that name conflicted with the existing investigation file). |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 0 | — |
| Scope additions | 0 | — |
| Deferred | 0 | — |

**Total impact:** Plan executed exactly as written. Docs-only plan with no decisions or checkpoints; postmortem content matched the 5-section scope from the plan's Task 1 action narrative.

### Notable

- The postmortem ended up slightly longer than ~30 min estimate (35 min actual) due to careful cross-referencing of SUMMARYs and verification of commit hashes / timestamps. Not a deviation; just a sizing note for future docs-shaped plans.
- The plan named the postmortem path `.paul/postmortems/v5h-01-save-loss.md`, which is what shipped. The original ROADMAP entry pre-correction had `.paul/postmortems/v50-07-save-loss.md` — that path would have collided with the existing `v50-07-save-loss-investigation.md` file. ROADMAP correction in Task 2 also fixed this naming clash.

### Deferred Items

None — postmortem itself defers items (Issue 2 iPad UI; auth-claim auto-refresh; listener-mount-singleton optimization), but those were deferrals captured AT plan-write time, not new ones surfaced during execution.

## Issues Encountered

None. Suite + build green on first run.

## Skill Audit

SPECIAL-FLOWS.md gates `/ui-ux-pro-max` on frontend UI/UX work. This plan was docs-only (postmortem markdown + ROADMAP correction); no UI surface modified. **Skill audit: All required skills invoked ✓** (vacuously — no skills required for this work type, matching v50-06-01 + v50-07-02 + v50-07-04 + v50-07-05 precedent).

## Next Phase Readiness

**Ready:**
- v5.0-hotfix milestone is now 4 of 4 plans complete. Phase v5h-01 done.
- Postmortem captures the lessons; ROADMAP reflects actual structure.
- All boundaries respected (no code changed in this plan; v5h-01-02 + v5h-01-03 fixes remain at their final commits).

**Concerns:**
- 5 action items from the postmortem are NOT implemented in this plan (cutover rules-audit gate; kitchen-sink emulator + RTL pair; Issue 2 resolution; Daniel-loop codification; 2-3-strikes rule codification). They're owned by Rabbi Daniel with target windows ranging from "before next cutover" to "low priority". The postmortem is the capture; implementation is separate work.
- Issue 2 (iPad key-picker UI) is still vague — Daniel needs to describe the symptom for routing.

**Blockers:**
- None for v5.0-hotfix milestone close. Ready for `/paul:audit-milestone v5.0-hotfix`.

## Hand-off to Phase Transition

This is the FINAL plan in phase v5h-01. The transition step (executed next):
1. Update ROADMAP.md phase v5h-01 status → ✅ Complete (4 of 4 plans)
2. Update PROJECT.md if any v5.x norms shifted (Daniel-loop UAT cadence is a candidate but NOT codified yet — captured as action item, not yet shipped)
3. Atomic git commit: `feat(v5h-01): track-edit save-loss diagnosis + fix + postmortem`
4. Route to milestone audit: `/paul:audit-milestone v5.0-hotfix` (the milestone is 1 of 1 phases complete; audit + close is next)
5. After milestone close: `/paul:new-milestone` for v5.1 UX overhaul

---

*Phase: v5h-01-track-edit-save-loss, Plan: 04 (postmortem)*
*Completed: 2026-04-27*
