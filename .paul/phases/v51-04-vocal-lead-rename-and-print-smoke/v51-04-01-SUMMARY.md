---
phase: v51-04-vocal-lead-rename-and-print-smoke
plan: 01
subsystem: ui
tags: [terminology, label-rename, print, pdf, project-discipline, uat]

requires:
  - phase: v50-07-migration-cutover
    provides: track-edit save-loss postmortem (v5h-01-04 SUMMARY) — source of action item #4 (Daniel-loop UAT codification)
  - phase: v51-02-editor-readability
    provides: SetlistGrid column-width contract (Vocal Lead column at size: 156 still fits "Vocal Lead" header)
provides:
  - "Vocal Lead" terminology shipped end-to-end (6 user-facing surfaces)
  - BulkPopover.testId prop — decouples user-facing label from testid stems so future label rewrites don't break test seams
  - PROJECT.md "UAT Discipline (data-flow fixes)" subsection codifying the Daniel-loop UAT cadence
affects: [v5.0 milestone audit (band-onboarding gate), future terminology audits]

tech-stack:
  added: []
  patterns:
    - "Label-rename audit pattern: grep for `[\"'>]Lead[\"'<:]|[\"'>]Leader[\"'<]` excluding identifier patterns (leadMusician, setlistLeads, etc.) reliably surfaces every user-facing string while preserving DB/internal names"
    - "Decoupled testid stems: components that derive testids from user-facing labels (e.g. `batch-action-${label.toLowerCase()}`) should accept an explicit `testId` prop override so terminology rewrites don't cascade into test churn"

key-files:
  created:
    - .paul/phases/v51-04-vocal-lead-rename-and-print-smoke/v51-04-01-PLAN.md
    - .paul/phases/v51-04-vocal-lead-rename-and-print-smoke/v51-04-01-SUMMARY.md
  modified:
    - src/components/setlist/grid/SetlistGrid.tsx (column header)
    - src/components/setlist/grid/BatchActionBar.tsx (label + aria-label + placeholder + emptyHint + new testId prop on BulkPopover)
    - src/components/setlist/grid/MobileEditSheet.tsx (field label + input aria-label)
    - src/components/setlist/importer/ImporterModal.tsx (preview-table column header + performer placeholder)
    - src/lib/print-pipeline.ts (cover-page column header + colLead x-coordinate shift)
    - .paul/PROJECT.md (UAT Discipline subsection under Constraints)

key-decisions:
  - "Add `testId` prop to BulkPopover: necessary because the testid stem was previously derived from the user-facing `label` prop. Renaming label='Lead' → label='Vocal Lead' would have flipped batch-action-lead-trigger → batch-action-vocal lead-trigger (with embedded space). Explicit testId='lead' preserves the test seam per plan boundary lock."
  - "Shift colLead by 20pt left in print-pipeline.ts: 'Vocal Lead' (~52pt @ 10pt Helvetica-Bold) is wider than the original 50pt header gap to colTransKey. Both with-trans (380→360) and no-trans (430→410) variants shifted; no other column positions affected."
  - "Sweep ImporterModal during Task 1 grep audit: caught a 6th user-facing surface (preview-table `<th>Key/Lead</th>` at line 236) the planning grep had missed. Renamed to 'Key/Vocal Lead' for terminology consistency. Documented as a scope addition (within plan boundary — was always intended as 'every visible Lead label')."

patterns-established:
  - "When renaming user-facing labels in components that derive identifiers from those labels, add an explicit override prop FIRST (e.g. testId), then rename. Avoids the auto-derived-id collision footgun."
  - "Print PDF column-header rewrites need to pre-flight column-width math: header text width @ font/size MUST fit between adjacent column x-coordinates. 10pt Helvetica-Bold word widths: 'Lead' ~24pt, 'Vocal Lead' ~52pt — so a +28pt header needs a ~20pt left-shift of the column origin."

duration: ~30min
started: 2026-04-27T19:25:00Z
completed: 2026-04-27T19:32:00Z
---

# Phase v51-04 Plan 01: Vocal Lead Rename + Daniel-Loop UAT Codification — Summary

**Final visible terminology audit + project discipline codification before band onboarding: 6 surfaces flipped to "Vocal Lead", PROJECT.md gains the UAT Discipline subsection, gig-packet print smoke confirmed end-to-end on production.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~7min wall time (single-session, post-v51-03 close) |
| Started | 2026-04-27T19:25:00Z |
| Completed | 2026-04-27T19:32:00Z |
| Tasks | 4 of 4 (3 auto + 1 HUMAN-VERIFY) |
| Files modified | 6 (5 source + 1 PROJECT.md) |
| Files created | 0 (plan + summary metadata only) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: All five user-facing "Lead" surfaces read "Vocal Lead" | Pass | Six surfaces shipped (5 originally planned + ImporterModal preview-table header caught during the Task 1 grep audit). All visible "Lead" literals on the editor / batch / mobile / importer / print surfaces now read "Vocal Lead". |
| AC-2: Internal identifiers unchanged (boundary lock) | Pass | `leadMusician`, `lead` patch alias, `setlistLeads`/`libraryLeads`/`knownLeads`, `LeadCell`, `isLeader`/`onLeaderSetPosition`, `band_leader`, `"Led by: ${rabbi}"`, all `data-testid` values (preserved via the new testId prop) untouched. Identifier-preservation grep + boundary diff both empty. |
| AC-3: PROJECT.md codifies Daniel-loop UAT cadence | Pass | New "UAT Discipline (data-flow fixes)" subsection under `## Constraints` cross-references `.paul/postmortems/v5h-01-save-loss.md` and lists the 7 data-flow surfaces requiring UAT (sync engine / Dexie / snapshot-listener / lazy-hydration / perf-view / editor cell-commit / Firestore rules). |
| AC-4: Suite + build pass with no regressions | Pass | Full suite 1513/1513 (no new tests, no regressions). tsc clean. next build exit 0. Boundary diff empty across src/types/, src/lib/sync/, src/lib/local/, src/components/performance/, src/lib/roles.ts, firestore.rules. |
| AC-5: Daniel UAT approved — rename + print smoke | Pass | Daniel said "go" at HUMAN-VERIFY checkpoint after `233d8b5` deployed. |

## Accomplishments

- "Vocal Lead" terminology now reads consistently across every user-facing surface — last visible language inconsistency before band onboarding cleared.
- PROJECT.md institutionalizes the Daniel-loop UAT discipline that caught the v5.0-hotfix save-loss bug; future cutover-shaped phases can no longer ship without a real-production verification gate.
- BulkPopover testId decoupling pattern unblocks future label rewrites without breaking test infrastructure.

## Task Commits

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Tasks 1–3 | `233d8b5` | feat | 6-surface label rename + BulkPopover testId prop + print-pipeline column shift + PROJECT.md UAT Discipline |

Plan dir + STATE.md transition were committed alongside the source files (single cohesive commit per the v51-03 precedent).

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/components/setlist/grid/SetlistGrid.tsx` | Modified (1 line) | leadMusician column `header: 'Lead'` → `'Vocal Lead'`. |
| `src/components/setlist/grid/BatchActionBar.tsx` | Modified (~12 lines) | Bulk popover label/aria/placeholder/emptyHint renamed; new `testId?` prop on BulkPopoverProps + `idStem = testId ?? String(label).toLowerCase()` resolution; Vocal Lead bulk passes `testId="lead"` to preserve testid stability. |
| `src/components/setlist/grid/MobileEditSheet.tsx` | Modified (2 lines) | Field label span text + input aria-label both renamed. |
| `src/components/setlist/importer/ImporterModal.tsx` | Modified (2 lines) | Preview-table `<th>Key/Lead</th>` → `Key/Vocal Lead`; performer cell placeholder renamed. |
| `src/lib/print-pipeline.ts` | Modified (~3 lines) | Cover-page header drawText "Lead" → "Vocal Lead"; `colLead` x-coordinate shifted left 20pt in both with-trans (380→360) and no-trans (430→410) variants; comment added explaining the shift math. |
| `.paul/PROJECT.md` | Modified (added subsection) | New "UAT Discipline (data-flow fixes)" under `## Constraints` — codifies the Daniel-loop UAT cadence per postmortem v5h-01 §5 action item #4. |
| `.paul/phases/v51-04-vocal-lead-rename-and-print-smoke/v51-04-01-PLAN.md` | Created | Plan metadata. |
| `.paul/phases/v51-04-vocal-lead-rename-and-print-smoke/v51-04-01-SUMMARY.md` | Created | This file. |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Add `testId` prop to BulkPopover | Auto-derived testid from `label.toLowerCase()` would have flipped `batch-action-lead-trigger` → `batch-action-vocal lead-trigger` (space-embedded), breaking 2 BatchActionBar tests AND the plan boundary that locked testid stability. Adding an explicit override prop is the minimal additive change that honors the boundary. | Pattern carries forward — any future label rewrite for components with label-derived testids should add the override prop first. |
| Shift colLead by 20pt left in print-pipeline.ts | "Vocal Lead" @ 10pt Helvetica-Bold is ~52pt wide vs "Lead" ~24pt; the original `colLead = 380` (with-trans) only had 50pt of space before `colTransKey = 430`. Without the shift the header would overflow into the transposed-key column on the gig-packet PDF. | No other column positions affected; data-cell text under the lead column is short (musician names ≤15 chars) so it still fits comfortably. |
| Include the ImporterModal `<th>Key/Lead</th>` rename in this plan | The Task 1 grep audit surfaced this as a 6th user-facing surface (the planning grep used a stricter pattern that missed compound headers like "Key/Lead"). Renaming inside the plan keeps the terminology sweep complete instead of leaving an inconsistency to be caught later. | Plan AC-1 wording held — "every visible 'Lead' label" — so this counts as catching a planning gap, not scope creep. |
| Single cohesive commit (Tasks 1–3) | Same precedent as v51-03-01 (vertical slice). Per-task split would have orphaned the testId-prop addition (Task 1 setup) from its consumer (Task 1 rename) and the print colLead shift from its sibling header rename. | One revert button if needed. |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | Test seam preservation (BulkPopover testId prop) |
| Scope additions | 1 | ImporterModal `<th>Key/Lead</th>` — caught by audit, included for terminology consistency |
| Deferred | 0 | Plan executed as written |

**Total impact:** Two essential mid-execution adaptations, both inside the original "rename every visible Lead label" scope. No drift outside plan boundaries.

### Auto-fixed Issues

**1. BulkPopover testid stem broken by label rename**
- **Found during:** Task 1 verify step (`npx vitest run src/components/setlist/grid/__tests__`).
- **Issue:** BulkPopover derived `data-testid={`batch-action-${String(label).toLowerCase()}-trigger`}` and contentTestId similarly from the user-facing `label` prop. Renaming `label="Lead"` → `label="Vocal Lead"` flipped the testid to `batch-action-vocal lead-trigger` (with literal space), which broke 2 BatchActionBar tests asserting on `batch-action-lead-trigger`. The plan boundary explicitly locked all testids.
- **Fix:** Added an additive `testId?: string` prop to BulkPopoverProps. Inside the component, `idStem = testId ?? String(label).toLowerCase()` resolves the stem with explicit override taking precedence. The Vocal Lead bulk popover passes `testId="lead"` to preserve the original stem; the Type and Key bulks (whose labels still match their stems) leave `testId` unset and fall through to the label-derived default. Zero test churn.
- **Files:** `src/components/setlist/grid/BatchActionBar.tsx`
- **Verification:** BatchActionBar.test.tsx 7/7 green after fix; full suite stayed at 1513/1513.
- **Commit:** part of `233d8b5`.

### Scope Additions

**1. ImporterModal `<th>Key/Lead</th>` preview-table header**
- **Found during:** Task 1 grep audit of all visible "Lead" literals across `src/components` and `src/lib`.
- **Origin:** The planning grep used a pattern that matched single-word "Lead" surrounded by quotes/brackets. The compound "Key/Lead" pattern (slash-separated, no surrounding quotes) didn't match. Sweeping `git grep -n "Lead\b"` after Task 1's first pass surfaced it.
- **Decision:** Renamed to "Key/Vocal Lead" for terminology consistency. AC-1's wording — "every visible 'Lead' label" — covers this surface without expanding scope; the planning grep gap is what missed it, not the plan's intent.
- **Files:** `src/components/setlist/importer/ImporterModal.tsx:236`
- **Verification:** Same Task 1 verify step caught the surface; final grep shows zero remaining unrenamed visible "Lead" literals.

### Deferred Items

None — plan executed as written.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| BatchActionBar.test.tsx 2/7 fails after `label="Vocal Lead"` rename | Root-caused to label-derived testid; added BulkPopover.testId prop; passed testId="lead" for the Vocal Lead bulk. 7/7 green after fix. (See Auto-fixed §1.) |

## Skill Audit (v51-04)

| Expected | Invoked | Notes |
|----------|---------|-------|
| /ui-ux-pro-max | ✓ | Loaded earlier in the session (v51-03 APPLY); the verify_required_skills step found it already invoked in current session and proceeded. Quick consult only — terminology was fixed by user preference, no design DB queries needed beyond the v51-03 ones. |

All required skills invoked ✓

## Next Phase Readiness

**Ready:**
- v5.1 milestone is now 4/4 phases complete. Editor UX is clean enough for band onboarding (per the milestone's Done definition).
- v5.0 milestone audit unblocked: `/paul:audit-milestone v5.0` is the next major action — closes the parent v5.0 milestone that has been pending UAT since 2026-04-27 (the v5.0 milestone awaited Daniel's UAT cycle on real production; the v5.1 polish phases have been the prerequisite work to make that UAT comfortable).

**Concerns:**
- Sentry breadcrumb for `creation_mode` tag deferred from v51-03-01 was not picked up here (v51-04 was scoped tightly to label rename + UAT codification + print smoke). If telemetry on which create-setlist path users take is desired, address as a small standalone plan in a future milestone or accept the current toast-tagging coverage.

**Blockers:** None.

---
*Phase: v51-04-vocal-lead-rename-and-print-smoke, Plan: 01*
*Completed: 2026-04-27*
