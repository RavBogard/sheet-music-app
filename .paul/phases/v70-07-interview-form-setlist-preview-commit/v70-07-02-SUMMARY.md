---
phase: v70-07-interview-form-setlist-preview-commit
plan: 02
subsystem: ui
tags: [importer-modal, doc-import, interview-form, setlist-preview, gemini, react]

requires:
  - phase: v70-04 (doc upload + text extraction)
    provides: POST /api/setlists/import/extract-document — .docx/.pdf/.txt → raw text
  - phase: v70-05 (Gemini structured extraction)
    provides: POST /api/setlists/import/extract-structure — raw text → { sections, tracks }
  - phase: v70-06 (resolve + missing-chart + recording-match)
    provides: POST /api/setlists/import/resolve + ResolvedStructure/ResolvedTrack types — annotates tracks with libraryMatch / missingChart / recordingCandidates
provides:
  - ImporterModal "Upload Document" input option + the extract-document→extract-structure→resolve client chain
  - src/lib/setlist-import/interview-defaults.ts — suggestServiceDate / inferServiceType / toDateInputValue / SERVICE_TYPE_LABELS
  - ImporterModal 'interview' step (structured metadata form) + 'preview' step (read-only resolved setlist, grouped by section)
affects:
  - v70-07 plan 03 (commit wiring — wires the inert "Create Setlist" button to POST /api/setlists/import/commit-document → createSetlistServerSide)

tech-stack:
  added: []
  patterns:
    - "Doc-import is an additive path inside the existing ImporterModal — a third 'input'-step option plus two new Step states ('interview', 'preview'). The URL/CSV 'review' flow is untouched. The three v70-04→06 import routes are chained client-side; no orchestration route was added."
    - "Parser-unfillable setlist metadata (name / service date / service type / rabbi) is collected via a structured interview form (NOT chat). Service date is REQUIRED and gates the step; it is auto-suggested by parsing the uploaded filename. Service type is auto-inferred from document keywords; the user confirms."

key-files:
  created:
    - src/lib/setlist-import/interview-defaults.ts
    - src/lib/setlist-import/__tests__/interview-defaults.test.ts
  modified:
    - src/components/setlist/importer/ImporterModal.tsx

key-decisions:
  - "Service-type inference is keyword-only (suggestServiceType scans filename + section names + track titles/notes). The plan's 'date-based inference as fallback' was dropped: liturgical-calendar's getServiceContext returns a ServiceType enum (friday_night, sukkot, purim, …) that does not map cleanly onto Setlist['templateType'] (shabbat_morning | friday_night | rosh_hashanah | yom_kippur | festival | other), and the user confirms the value in the form regardless. Added a CRC-specific 'shir shabbat' → friday_night rule since the canary doc is a Shir Shabbat service."
  - "The three import routes are chained client-side in handleDocSubmit (extract-document multipart → extract-structure JSON → resolve JSON) rather than behind a new orchestration route — the routes already exist as independent siblings, and plan 02's lane is UI only. The Gemini-touching calls pass timeout: 60000 to match the routes' maxDuration."
  - "The 'Create Setlist' button on the preview step is rendered but disabled — commit/persistence is v70-07-03's scope. A TODO(v70-07-03) comment marks the wiring seam."
  - "interview-defaults.ts owns toDateInputValue (Date → yyyy-mm-dd) alongside the two spec'd helpers — it is interview-form-specific formatting and belongs with the other interview helpers; kept it exported + unit-tested rather than inlining it in the component."

patterns-established:
  - "When extending ImporterModal with a new import source: add a mutually-exclusive input option to the 'input' step (selecting one source clears the others), a dedicated submit handler, and new Step states for any post-input screens — leave the existing source flows untouched."

duration: ~40min
started: 2026-05-14T22:25:00Z
completed: 2026-05-14T23:05:00Z
---

# Phase v70-07 Plan 02: Document-Import Flow — Upload, Interview, Preview Summary

**Added the "Feed a doc, get a setlist" user-facing surface to `ImporterModal`: a third "Upload Document" option (.docx/.pdf/.txt) that chains the v70-04→06 backend (extract text → Gemini structure → library resolution), then walks a structured interview form for parser-unfillable metadata and a read-only setlist preview that surfaces chart matches, missing charts, and recording candidates per track. Stops before commit — that is v70-07-03.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~40min |
| Started | 2026-05-14T22:25:00Z |
| Completed | 2026-05-14T23:05:00Z |
| Tasks | 3 auto PASS (autonomous — no checkpoints) |
| Files modified | 2 created, 1 modified |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Document upload runs the extract→structure→resolve chain | Pass | `handleDocSubmit` POSTs the file (multipart) to `extract-document`, feeds the text to `extract-structure`, feeds `{ sections, tracks }` to `resolve`, stores the `ResolvedStructure` + filename, and advances to the `interview` step. Each step's non-`ok` response throws the server's `error` message → `toast.error` + return to `input`. `next build` ✓ proves the chain + new Step states compile; runtime behavior is queued for human-verify (UAT-PENDING). |
| AC-2: Interview form collects parser-unfillable metadata | Pass | The `interview` step renders a structured form (name `Input`, REQUIRED service-date `<input type="date">`, service-type `<select>` over the 6 `templateType` values, optional rabbi `Input`) with proper `htmlFor`/`id` label association. Fields are seeded on chain success: date via `suggestServiceDate(filename)`, type via `inferServiceType(...)`, name from the filename. "Next: Preview" is `disabled` while `interviewDate` is empty. `interview-defaults.test.ts` 13/13 covers the helpers (date parse incl. ordinal/separator/overflow-reject/no-match; every `inferServiceType` branch + `'other'` fallback; `toDateInputValue` padding). |
| AC-3: Preview shows the resolved setlist with gaps surfaced | Pass | The `preview` step renders `previewGroups` (a `useMemo` that buckets tracks under their `sectionName` in document order, with an "Ungrouped" bucket last). Each track is a max-density text row — title / key / vocal lead, then either a violet `libraryMatch` badge (name + `confidence` %) or an amber `FileWarning` "Missing chart" indicator, plus a `Disc3` recording-count marker when `recordingCandidates` is non-empty. A header band reflects the interview values. The "Create Setlist" button is present but `disabled` (TODO(v70-07-03) marks the commit seam). `next build` ✓. |

## Verification Results

- `npx tsc --noEmit` → no errors in `ImporterModal.tsx` or `interview-defaults.ts` (filtered). The pre-existing MCP-test-file + `performance-toolbar.test.tsx` baseline errors are unrelated and not introduced here.
- `npx next build` → ✓ Compiled successfully; full route tree built (App Router route-export rules respected — no route files added by this plan).
- `npx vitest run src/lib/setlist-import` → **39/39** (26 prior + 13 new `interview-defaults` tests). Zero regressions in `extract-document` / `extract-structure` / `resolve`.

## Accomplishments

- **v7.0's headline feature now has a usable front door.** v70-04/05/06 shipped the doc→text→structure→resolve backend with zero UI. This plan makes it real: Daniel can pick the May 15 Shir Shabbat doc in the import modal and walk to a fully-resolved setlist proposal with gaps flagged.
- **Structured interview form, not chat** (constraint 3). Service date is REQUIRED and auto-suggested from the filename (constraint 9); service type is auto-inferred from doc keywords with user confirmation (constraint 10).
- **Resolved-setlist preview surfaces the gaps** — every track shows its library chart match (with confidence) or an amber missing-chart flag, plus recording-candidate counts — as max-density text rows (no cover art, per the Logic-Pro track-list convention).
- **Stayed in lane.** No new dependencies, no new API route, no recording-binding work (deferred), no edits to MCP territory or `SetlistGrid.tsx`, and the existing URL/CSV import flow is byte-for-byte untouched.

## Task Commits

Project config has `auto_commit: false`; per memory `feedback_paul_phase_commits`, the entire `.paul/phases/v70-07-interview-form-setlist-preview-commit/` directory + all v70-07 source files commit as one bundled commit at the v70-07 **phase** transition — which happens after plan 03 closes, NOT now (v70-07 is a 3-plan phase; this is plan 02 of 3).

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Tasks 1–3 | `<v70-07 phase-commit>` (deferred to phase close after plan 03) | feat | ImporterModal document-import flow: upload option + extract chain + interview form + preview |

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/components/setlist/importer/ImporterModal.tsx` | Modified | Added the `'interview'` + `'preview'` Step states, the doc-import state (`docFile`, `resolved`, `docFileName`, `interview*` fields), `handleDocSelect` + `handleDocSubmit` (the 3-route client chain), the `previewGroups` `useMemo`, and the "Upload Document" input option + interview-form step + read-only preview step JSX. The URL/CSV `review` flow is untouched. |
| `src/lib/setlist-import/interview-defaults.ts` | Created | Pure helpers for the interview form: `suggestServiceDate` (filename → Date), `inferServiceType` (text → `templateType`), `toDateInputValue` (Date → `yyyy-mm-dd`), and the `SERVICE_TYPE_LABELS` map. |
| `src/lib/setlist-import/__tests__/interview-defaults.test.ts` | Created | 13 tests — `suggestServiceDate` (ordinal / abbreviated / separator / no-match / calendar-overflow), `inferServiceType` (every branch + `'other'` fallback), `toDateInputValue` padding. |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Service-type inference is keyword-only; dropped the date-based fallback | `getServiceContext` returns a `ServiceType` enum that doesn't map cleanly onto `Setlist['templateType']`; the user confirms the value anyway. Added a CRC `'shir shabbat'` → `friday_night` rule. | Counts as a minor deviation from AC-2's wording (see Deviations). Constraint 10 ("auto-inferred from doc keywords, user confirms") is fully satisfied. |
| Chain the three import routes client-side, no orchestration route | The routes already exist as independent siblings; plan 02's lane is UI only; a new route is plan-03 territory. | `handleDocSubmit` does three sequential `apiFetch` calls; Gemini-touching ones pass `timeout: 60000`. |
| "Create Setlist" button rendered but disabled | Commit/persistence is v70-07-03's scope. | A `TODO(v70-07-03)` comment marks the wiring seam; plan 03 enables + wires it. |
| `toDateInputValue` lives in `interview-defaults.ts` | It's interview-form-specific date formatting and belongs with the other interview helpers; kept exported + unit-tested. | Slight expansion of the helper file beyond the two spec'd functions — pure, tested, low-risk. |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 0 | — |
| Scope additions | 0 | — |
| Spec simplifications | 1 | Minor — service-type inference simplified to keyword-only |
| Deferred | 0 | — |

**Total impact:** Minimal. One deliberate simplification of AC-2's "date-based inference as fallback" wording; the core requirement (keyword-inferred service type, user-confirmed) is met. No scope creep, no deferred items, no auto-fixes needed — `tsc` and `next build` were clean on the first qualify pass.

### Spec Simplification

**1. [Service-type inference] Dropped the date-based fallback**
- **Found during:** Task 2 (interview-defaults helpers).
- **Issue:** AC-2 / the plan said service type should be inferred "from the document text (date-based inference as fallback)". `liturgical-calendar`'s `getServiceContext(date)` returns a `ServiceType` union (`friday_night | shabbat_morning | rosh_hashanah | yom_kippur | sukkot | simchat_torah | hanukkah_shabbat | purim | passover | shavuot | regular`) that does not map cleanly onto `Setlist['templateType']` (`shabbat_morning | friday_night | rosh_hashanah | yom_kippur | festival | other`).
- **Decision:** Implement keyword-only inference over filename + section names + track titles/notes, with a CRC-specific `'shir shabbat'` → `friday_night` rule. The user confirms the value in the form regardless (constraint 10), so a missing fallback degrades to "user picks the right one" — no functional loss.
- **Files:** `src/lib/setlist-import/interview-defaults.ts`.
- **Verification:** `interview-defaults.test.ts` covers every `inferServiceType` branch including the `'other'` fallback; 13/13 pass.

### Deferred Items

None — plan executed as written (modulo the spec simplification above).

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Bash tool working directory intermittently reset to the repo root (`CentralReform.live`) instead of `sheet-music-app/`, breaking `cd sheet-music-app && …` commands | Verified cwd with `pwd` and ran verification commands directly from `sheet-music-app/`. Environment quirk, not a code issue. |

## Skill Audit (per .paul/SPECIAL-FLOWS.md)

| Expected | Invoked | Notes |
|----------|---------|-------|
| /ui-ux-pro-max | ✓ | Invoked before APPLY (BLOCKING per the plan's `<skills>` section). Guidance applied: multi-step progress feedback, proper `htmlFor`/`id` label association on all interview-form inputs, loading/disabled button states, `cursor-pointer` on the select, consistency with the modal's existing dark/glass card visual language. |

## Next Phase Readiness

**v70-07 is a 3-plan phase — plan 02 of 3 complete. The phase is NOT done; do NOT run the phase transition.** (A mechanical PLAN-count = SUMMARY-count check now reads 2 = 2 and would say "transition" — but v70-07 is explicitly a 3-plan phase per Daniel's 2026-05-14 split. Route to plan 03.)

**Ready:**
- The doc-import UI is shipped through the preview step. v70-07-03's commit wiring has a clear seam: the disabled "Create Setlist" button (marked `TODO(v70-07-03)`) in `ImporterModal.tsx`'s `preview` step. Plan 03 adds `POST /api/setlists/import/commit-document` → `createSetlistServerSide` (v70-07-01) and wires the button — it has the resolved `{ sections, tracks }` plus the interview values (`interviewName` / `interviewDate` / `interviewServiceType` / `interviewRabbi`) already in component state.

**Concerns:**
- Nothing committed yet — all v70-07 source files (plan 01's setlist-write.ts + import/execute, plan 02's ImporterModal + interview-defaults) sit uncommitted, bundling into the single v70-07 phase commit at phase close after plan 03. (v70-07-01 was interim-committed + pushed earlier for the MCP workstream; plan 02's files are not — they are pure milestone-lane UI with no cross-workstream consumer, so the bundled-at-phase-close default holds.)
- Runtime behavior of the doc-import flow is human-verify — appended to `.paul/UAT-PENDING.md` (v51-04 pattern). The `next build` + unit tests prove it compiles and the helpers are correct, but the end-to-end upload→interview→preview walkthrough needs Daniel against a deployed build.

**Blockers:** None.

---
*Phase: v70-07-interview-form-setlist-preview-commit, Plan: 02*
*Completed: 2026-05-14*
