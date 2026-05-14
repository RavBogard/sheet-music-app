---
phase: v60-14-mobile-date-picker
plan: 01
subsystem: ui
tags: [react, usestate, usecallback, date-picker, calendar, react-day-picker, creation-wizard, mobile-ux]

requires:
  - phase: v51-03-create-setlist-wizard
    provides: useCreationWizard hook with handleTemplateSelect callback (the surface that was buggy)
  - phase: v60-13-sync-engine-resilience
    provides: hydrator dedup (RULED OUT as candidate root cause for this bug — the wizard is local React state, not Dexie/snapshot-driven)

provides:
  - handleTemplateSelect now preserves the user's already-chosen eventDate
  - Regression test asserting picked-date survives template selection
  - Discovery output: the date "reset on mobile" bug was NOT mobile-specific and NOT in the picker UI; it was a hook-level state-overwrite in the template auto-fill path

affects:
  - v70-09-setlist-metadata-editor (separate scope: post-create eventDate editing — this phase fixed PRE-create only)
  - v51-03 wizard refactors (any future change to handleTemplateSelect must maintain the eventDate-preservation semantics)

tech-stack:
  added: []
  patterns:
    - "Auto-fill helpers must respect user-set state: when a 'shortcut' callback (template select) populates derived fields, it must check whether the user has already set the field and only fill in the gap."
    - "useCallback dep arrays must include all closed-over state to avoid stale-closure auto-overwrites; the original `[]` deps caused this exact bug by closing over a stale (always null at definition) eventDate."

key-files:
  created: []
  modified:
    - src/hooks/use-creation-wizard.ts
    - src/hooks/__tests__/use-creation-wizard.test.ts

key-decisions:
  - "checkpoint:decision (b) patch-independently — v60-13-06 hydrator dedup was ruled out by inspection (wizard state is local React useState, no Dexie/snapshot involvement). Defer-and-retest would have wasted a UAT cycle confirming a non-fix."
  - "Preserve user-set eventDate in handleTemplateSelect via `eventDate ?? new Date()` for liturgical-context resolution + guard `if (!eventDate) setEventDate(targetDate)` for the assignment."

patterns-established:
  - "Discovery-first plans for ambiguous user-reported bugs: Task 1 = locate code path + identify root cause + present to checkpoint:decision before patching. Avoided patching the symptom (picker UI) instead of the cause (hook auto-fill)."
  - "Mobile UX bugs may have non-mobile root causes; investigate the call graph before assuming touch-event / virtual-keyboard / mobile-input shenanigans."

duration: ~30min
started: 2026-05-14T01:45:00Z
completed: 2026-05-14T02:15:00Z
---

# Phase v60-14 Plan 01: Mobile Date Picker — handleTemplateSelect eventDate Preservation Summary

**Stops `useCreationWizard.handleTemplateSelect` from silently overwriting the user's chosen `eventDate` with `new Date()` when a template is selected after a date is picked — closes Daniel's "date keeps resetting to today on mobile" UAT report.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~30min (discovery → checkpoint:decision → fix → test → deploy) |
| Started | 2026-05-14T01:45:00Z |
| Completed | 2026-05-14T02:15:00Z |
| Tasks | 1 discovery + 1 checkpoint:decision + 1 fix + 1 checkpoint:human-verify (PENDING-UAT) |
| Files modified | 2 |
| Commits | 1 (`8a5fc3b`) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Mobile date assignment persists | PENDING-UAT | Fix targets the actual root cause (hook-level overwrite). Awaiting Daniel iPad confirmation per "continue. i'll check later" — v51-04 carry-forward pattern, 6th consecutive use. |
| AC-2: Desktop unchanged | Pass | Fix is platform-agnostic; the same code path produced the bug on both surfaces. New regression test runs in jsdom (effectively desktop) and asserts user-picked date survives template selection. |
| AC-3: Build + suite green | Pass | `npx vitest run use-creation-wizard.test.ts` → 18/18 (17 existing + 1 new); `npx next build` exits 0 (only known Serwist+Turbopack info warning). |

## Accomplishments

- Diagnosed a user-reported "mobile bug" that was actually a platform-agnostic hook-level state-overwrite. The picker UI was correct; the bug was that `handleTemplateSelect` unconditionally called `setEventDate(new Date())`, blowing away whatever the user had just picked. Discovery-first plan paid off by routing past the wrong layer.
- Ruled out v60-13-06 (hydrator dedup) as a candidate root cause via inspection — the wizard state is local `useState`, not Dexie or snapshot-driven. Saved a UAT cycle that would have come back identical.
- Established the pattern that mobile UX bugs deserve full call-graph traversal before assuming touch/keyboard/viewport shenanigans.

## Task Commits

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Task 1: Discovery (read-only) | (no commit — diagnostic only) | — | Located picker at `CreationWizard.tsx:114-119` + state at `use-creation-wizard.ts:64`; identified root cause at `use-creation-wizard.ts:99` (`setEventDate(baseDate)` in `handleTemplateSelect`) |
| checkpoint:decision | (logged in this SUMMARY) | — | Daniel chose option [b] patch-independently after inspection ruled out v60-13-06 overlap |
| Task 2: Apply fix + regression test | `8a5fc3b` | fix | `handleTemplateSelect` now uses `eventDate ?? new Date()` for liturgical context and `if (!eventDate) setEventDate(targetDate)` for assignment; `useCallback` deps include `eventDate`; new "v60-14-01: template selection preserves the user's already-chosen eventDate" test |
| checkpoint:human-verify | PENDING-UAT (Daniel "i'll check later") | — | Carry-forward against deployed `8a5fc3b`; v51-04 pattern, 6th consecutive use this milestone |

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/hooks/use-creation-wizard.ts` | Modified | `handleTemplateSelect` (lines 87-104): use `eventDate ?? new Date()` as `targetDate`; guard `setEventDate(targetDate)` with `!eventDate`; `useCallback` dep array `[eventDate]` |
| `src/hooks/__tests__/use-creation-wizard.test.ts` | Modified | New test "v60-14-01: template selection preserves the user's already-chosen eventDate" — sets May 15, selects shabbat_morning template, asserts eventDate unchanged + `getFullServiceContext` called with the user's date |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Patch independently (option [b] at checkpoint:decision) | v60-13-06 hydrator dedup ruled out by inspection — no Dexie/snapshot involvement in wizard state. Defer would have wasted a UAT cycle. | Discovery-first pattern proved itself: the right diagnosis pointed at the right layer first try. |
| Use `eventDate ?? new Date()` for liturgical context, AND guard `setEventDate(targetDate)` with `!eventDate` | Two-part fix: (a) when computing the auto-fill name, use the user's date (more accurate parasha / service-type inference); (b) only push state when no user pick exists (preserves user intent). | Future template-shortcut UX changes must maintain both halves; one without the other re-introduces a partial bug. |
| Add `eventDate` to `useCallback` deps | Closure must see the current `eventDate` value; `[]` deps would freeze it at the initial null and re-introduce the unconditional-overwrite behavior under React's stale-closure semantics. | Lint rule `react-hooks/exhaustive-deps` already requires this; the prior code had no such reference, so no warning was emitted — adding `eventDate` is a quiet correctness fix. |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 0 | — |
| Scope additions | 0 | — |
| Deferred | 0 | — |

**Total impact:** None. Plan executed exactly as written. Discovery → checkpoint:decision → fix → test → deploy.

### Auto-fixed Issues

None.

### Deferred Items

None — boundaries respected. Setlist-firebase write contract untouched. Other date inputs (PrintModal, schedule page) confirmed out of scope.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| The plan's hypothesis ranking led with `<input type="date">` and snapshot-listener-race, both of which were wrong. The picker is shadcn react-day-picker (no native input) and the wizard state is local React `useState` (no listener). | Discovery completed by following the call graph rather than testing the plan's hypotheses. The actual root cause (hook-level overwrite via the template-select shortcut) was a plan-not-anticipated category. Logged as a knowledge-update for future "mobile UX" plan templates: include "investigate auto-fill / shortcut callbacks that touch the same field" as a baseline hypothesis. |

## Skill Audit (per .paul/SPECIAL-FLOWS.md)

| Expected | Invoked | Notes |
|----------|---------|-------|
| /ui-ux-pro-max | ○ (not applicable) | The fix is internal hook-state preservation logic. No visual surface change, no copy change, no styling. The user-facing effect (picked date sticks across template selection) is the REMOVAL of an unwanted side-effect, not a new UI design. UI/UX skill not invoked by judgment, not by gap. |

## Next Phase Readiness

**Ready:**
- v70-01-01 Task 3 (toolbar disable + PrintModal banner + print-pipeline image-skip guard) — ~20 min, no wizard or hydrator overlap; closes the v70-01 image-chart phase.
- v70-09-01 (setlist metadata editor) — separate scope from this phase; addresses POST-create eventDate editing while v60-14-01 fixed PRE-create. Bigger UX work; needs /ui-ux-pro-max consult.
- Roadmap update needed: ROADMAP.md still shows v60-13 as "🚧 In progress" — close v60-13 + v60-14 emergent rows in the same transition pass.

**Concerns:**
- Diagnostic logging from v60-13 wave 1 (DashboardClient.tsx subscription + outbox console dumps + visible diag strip) is still in code. Should be cleaned up before next non-emergent phase ships. Carry forward into v70-01-01 Task 3 commit OR a small cleanup commit.

**Blockers:** None.

---
*Phase: v60-14-mobile-date-picker, Plan: 01*
*Completed: 2026-05-14*
