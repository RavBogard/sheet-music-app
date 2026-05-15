---
phase: v70-08-best-practice-audit
plan: 03
subsystem: ui
tags: [accessibility, a11y, keyboard-nav, aria, importer-modal, ux-consistency, react]

requires:
  - phase: v70-07
    provides: ImporterModal doc-import flow (dropzones, interview form, preview)
  - phase: v70-08-01
    provides: v70-08-AUDIT.md (the a11y + UX-consistency P1/P2 punch list)
provides:
  - keyboard-reachable + accessibly-named ImporterModal file dropzones
  - doc-aware processing copy + non-destructive interview back-navigation
  - brand-consistent ImporterModal CTAs + formatted preview date + zero-track commit guard
  - MobileRowCard "Vocal Lead" house-term consistency
  - RecordingBindPopover <audio> accessible names + real loading state
  - ImporterModal.a11y.test.tsx regression guard
affects: [v70-08-04 (doc-import performance), v70-08 phase transition, v7.0 milestone close]

tech-stack:
  added: []
  patterns:
    - "File-upload affordances use sr-only <input> + styled <label htmlFor> (keyboard-reachable by default) — not click-only <div> wrappers"
    - "Async popover/list surfaces track a `loaded` flag and show a spinner row until the first data arrives, instead of flashing a definitive empty state"

key-files:
  created:
    - src/components/setlist/importer/__tests__/ImporterModal.a11y.test.tsx
  modified:
    - src/components/setlist/importer/ImporterModal.tsx
    - src/components/setlist/grid/MobileRowCard.tsx
    - src/components/setlist/grid/RecordingBindPopover.tsx
    - src/components/setlist/grid/__tests__/MobileRowCard.test.tsx

key-decisions:
  - "Used the sr-only input + <label htmlFor> pattern (not role=button divs) — /ui-ux-pro-max guidance: semantic HTML before ARIA; pattern already proven in RecordingBindPopover"
  - "Interview 'Back' relabelled 'Start over' + explicit state reset (kept the escape hatch rather than removing the button)"
  - "Amber 'Missing chart' → text-amber-600 dark:text-amber-400 — material light-mode contrast gain; full small-text AA would need amber-700 (muddy), and the status is icon+text labelled so color is not load-bearing"

patterns-established:
  - "sr-only <input type=file> + <label htmlFor> for keyboard-accessible file uploads"
  - "`loaded` flag + Loader2 row for async list surfaces (no false empty-state flash)"

duration: ~40min
started: 2026-05-14T18:24:00Z
completed: 2026-05-14T18:40:00Z
---

# Phase v70-08 Plan 03: ImporterModal accessibility + UX Summary

**Closed the v7.0 ImporterModal accessibility + UX-consistency P1s — the doc-import file dropzones are now keyboard-reachable + accessibly named (unblocking the whole keyboard/SR flow), the processing copy and interview back-navigation tell an honest story, and the clustered UX-consistency P2s (brand CTAs, formatted date, zero-track guard, select focus ring, audio labels, RecordingBindPopover loading state) are resolved.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~40 min |
| Started | 2026-05-14T18:24:00Z |
| Completed | 2026-05-14T18:40:00Z |
| Tasks | 3 completed (3/3 qualify PASS) |
| Files modified | 4 (+1 created) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: File-dropzones keyboard-reachable + accessibly named | Pass | Both dropzones → `<label htmlFor>` wrapping an `sr-only` `<input type=file>` with `aria-label`; selected filename in an `aria-live="polite"` region. New `ImporterModal.a11y.test.tsx` (2 tests) asserts both inputs are queryable by accessible name and `sr-only` (not `hidden`). |
| AC-2: Processing step tells the right story for a doc import | Pass | Heading + body branch on `isProcessingDoc` — "Reading your document" / "Reading your file and building the setlist…" vs. the spreadsheet "Analyzing Rows" copy. |
| AC-3: Interview back-navigation is non-destructive or honestly labelled | Pass | "Back" → "Start over"; new `handleStartOver` explicitly resets docFile/resolved/docFileName + all interview-* fields before `setStep('input')`. |
| AC-4: MobileRowCard uses "Vocal Lead" | Pass | Badge label (`:292`) and inline-editor field label (`:418`) both now read "Vocal Lead". `track.leadMusician` field name untouched. |
| AC-5: Clustered UX-consistency P2s resolved | Pass | 4 CTAs `bg-blue-600` → `bg-brand`; preview date `format(..., 'PPP')`; "Create Setlist" disabled + handler guarded on zero-track preview; interview `<select>` `focus-visible` ring; RecordingBindPopover `<audio>` `aria-label`; `loaded`-flag loading row replaces the false "No recordings yet" flash. |

## Accomplishments

- **Unblocked the entire doc-import flow for keyboard/SR users** — the cascading P1: with the dropzones unreachable, the (correctly-labelled) interview form + preview were keyboard-dead. Converting to the `sr-only` input + `<label htmlFor>` pattern fixes the whole chain.
- **The doc-import flow now tells an honest story** — processing copy matches the document path; the interview back button no longer silently discards a 1-3 min AI pipeline run.
- **Stage-card terminology is consistent** — MobileRowCard now says "Vocal Lead", matching ImporterModal and the project terminology rule.
- **Added a regression guard** — `ImporterModal.a11y.test.tsx` will catch any future regression of the dropzone keyboard-reachability.

## Task Commits

No atomic per-task commits — `auto_commit: false` in `.paul/config.md`, multi-plan phase. All changed files (this plan's 5 + plan 02's 11) remain uncommitted in the working tree; they bundle into the `feat(v70-08)` phase-transition commit after plan 04 closes (mirrors the v70-07 bundled-commit pattern).

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/components/setlist/importer/ImporterModal.tsx` | Modified | Both dropzones → keyboard-reachable `<label>` + `sr-only` input + `aria-label` + `aria-live`; removed unused refs + `useRef` import; processing copy branches on `isProcessingDoc`; `handleStartOver` + "Start over" button; 4 CTAs `bg-brand`; date-fns formatted preview date; zero-track commit guard; `<select>` focus ring; amber status → `amber-600 dark:amber-400` |
| `src/components/setlist/importer/__tests__/ImporterModal.a11y.test.tsx` | Created | 2-test regression guard for dropzone keyboard-reachability + accessible naming |
| `src/components/setlist/grid/MobileRowCard.tsx` | Modified | "Lead" → "Vocal Lead" on the badge label + the inline-editor field label |
| `src/components/setlist/grid/RecordingBindPopover.tsx` | Modified | `<audio>` `aria-label` per recording; `loaded` state flag + `Loader2` loading row replacing the false "No recordings yet" flash |
| `src/components/setlist/grid/__tests__/MobileRowCard.test.tsx` | Modified | Auto-fix: `getByLabelText('Lead')` → `'Vocal Lead'` to match the intentional rename |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| `sr-only` input + `<label htmlFor>` pattern, not `role="button"` divs | `/ui-ux-pro-max` web guidance: "Use semantic HTML before ARIA"; the pattern is already proven in RecordingBindPopover; keeps the real `<input>` in the a11y tree + tab order | Simplest correct fix; no manual keydown/tabIndex wiring to maintain |
| Interview "Back" → "Start over" + explicit reset (kept the button) | The plan offered remove-or-relabel; relabel keeps an escape hatch while making the destructive intent honest | User can still abandon a bad extraction; no silent data loss |
| Amber "Missing chart" → `text-amber-600 dark:text-amber-400` | Material light-mode contrast gain (~1.9:1 → ~3.0:1) + a proper bright amber in dark mode. Full small-text AA (4.5:1) on the light glass bg would need `amber-700`, which reads muddy in this UI — and the status carries a `FileWarning` icon + literal "Missing chart" text, so color is not the sole indicator (WCAG 1.4.1 holds) | Improved, defensible contrast without a muddy token; documented as a known light-mode residual |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | Essential — a stale test assertion broken by an intentional rename |
| Scope additions | 0 | — |
| Deferred | 0 | — |

**Total impact:** Plan executed as written. One essential auto-fix (a test that asserted the old label text), no scope creep.

### Auto-fixed Issues

**1. [Test] `MobileRowCard.test.tsx` asserted the pre-rename "Lead" label**
- **Found during:** Task 3 (MobileRowCard "Vocal Lead" rename) — surfaced when the grid suite showed 42 failures vs. the documented ~41-failure dead-table baseline
- **Issue:** `MobileRowCard.test.tsx:117` did `screen.getByLabelText('Lead')` — the intentional label rename broke it
- **Fix:** Updated the assertion to `getByLabelText('Vocal Lead')`; the rename is the plan's P1 intent, so the stale test had to follow (not scope creep)
- **Files:** `src/components/setlist/grid/__tests__/MobileRowCard.test.tsx`
- **Verification:** `MobileRowCard.test.tsx` 11/11 PASS; full grid suite back to 41 failed = exactly the documented dead-table baseline

### Deferred Items

None — the plan's named scope executed exactly. Fold-forward items (ImageScoreViewer a11y, touch-target sizing, iPad-portrait scroll, mutual-exclusivity cue, processing-step cancel, MobileRowCard hand-rolled buttons) remain AUDIT-routed to v7.1, untouched.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Grid suite showed 42 failures vs. ~41 baseline | Isolated to `MobileRowCard.test.tsx` — the rename broke a stale label assertion. Fixed the assertion; re-ran full grid suite → 41 failed, exactly the baseline. |

## Skill Audit

`/ui-ux-pro-max` (required for frontend phases per SPECIAL-FLOWS.md) — **invoked ✓** during APPLY. Its `web` + `ux` + `react` guidance directly informed the decision to use the semantic `<label htmlFor>` pattern over `role="button"` divs.

## Next Phase Readiness

**Ready:**
- v70-08-04 (doc-import performance) can proceed — it touches `getServerLibrary` / `resolve.ts` caching + the ImporterModal client fetch chain; no overlap with this plan's a11y/UX surface beyond `handleDocSubmit` (which plan 04 will modify for the timeout/AbortController — this plan left it untouched).

**Concerns:**
- Amber "Missing chart" light-mode contrast is improved but still short of strict small-text AA (4.5:1) — accepted as a documented residual (icon + text mean color isn't load-bearing). If a future a11y pass wants strict compliance, `amber-700` on light is the move.

**Blockers:**
- None.

---
*Phase: v70-08-best-practice-audit, Plan: 03*
*Completed: 2026-05-14*
