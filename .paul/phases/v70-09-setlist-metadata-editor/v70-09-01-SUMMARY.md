---
phase: v70-09-setlist-metadata-editor
plan: 01
subsystem: ui
tags: [setlist, metadata-editor, sheet, applyEdit, sync-engine, tablet-ui, react]

requires:
  - phase: v6.0 sync engine (existing)
    provides: applyEdit('update','setlists',…) outbox writer — the whole write path for this feature
  - phase: (existing) CreationWizard + ui primitives
    provides: the Calendar-in-Popover date pattern, Sheet/Select/Input/Label primitives reused as-is
provides:
  - src/components/setlist/grid/SetlistMetaEditSheet.tsx — Sheet-based setlist metadata editor (name / eventDate / templateType / rabbi); changed-fields-only applyEdit patch; never-destructive cancel
  - SetlistGridTopBar onEditMeta pencil-button affordance
  - SetlistGrid useLiveQuery on the setlist doc → live header + Sheet seed values
affects:
  - v70-07 (interview form + commit) — shares the "edit setlist metadata" surface; the server-callable setlist-write module is v70-07's concern, separate from this client-side applyEdit path
  - Any future setlist-metadata UX (serviceNotes, musicians, ownership) extends this Sheet

tech-stack:
  added: []
  patterns:
    - "Setlist-level metadata edits go through applyEdit('update','setlists',{patch}) with a CHANGED-FIELDS-ONLY patch — never writes unchanged fields (keeps the outbox + edit-log clean). Same op shape the SetlistGridHydrator reconcilers already use."
    - "eventDate in a setlist patch is written as an ISO string — firestoreTimestampSchema accepts Date / {seconds,nanoseconds} / string but NOT plain numbers; ISO string matches what service.createSetlist writes."
    - "A metadata-edit Sheet seeds its form from a useLiveQuery on the doc and re-seeds on closed→open, so reopening always shows current values; the host (SetlistGrid) owns the open state."

key-files:
  created:
    - src/components/setlist/grid/SetlistMetaEditSheet.tsx
    - src/components/setlist/grid/__tests__/SetlistMetaEditSheet.test.tsx
    - src/components/setlist/grid/__tests__/SetlistGridTopBar.test.tsx
  modified:
    - src/components/setlist/grid/SetlistGridTopBar.tsx
    - src/components/setlist/grid/SetlistGrid.tsx

key-decisions:
  - "eventDate patch value = ISO string (not epoch ms) — firestoreTimestampSchema rejects plain numbers; verified against schemas.ts + service.createSetlist."
  - "Rabbi is a free-text Input, not the congregation-rabbiProfiles Select the CreationWizard uses — deliberate minimal-scope choice; avoids a congregation-context dependency."
  - "Patch contains only changed fields; an unchanged Save closes the Sheet without enqueueing any write."
  - "SetlistGridTopBar gains an optional onEditMeta prop — callers that don't pass it (e.g. perform view) render unchanged (back-compat)."
  - "SetlistGrid keeps the static name/eventDateLabel prop path as a fallback; the new useLiveQuery on the setlist doc is preferred when present (live header)."

patterns-established:
  - "Per-doc metadata-edit Sheet: pencil trigger in the header → Sheet form → changed-only applyEdit patch → live header via useLiveQuery. Reusable for other doc-level metadata editors."

duration: ~50min
started: 2026-05-14T19:15:00Z
completed: 2026-05-14T20:05:00Z
---

# Phase v70-09 Plan 01: Setlist Metadata Editor Summary

**A pencil/edit button in the setlist editor's top bar opens a mobile-friendly Sheet (`SetlistMetaEditSheet`) to edit a setlist's name, event date, service type, and rabbi after creation — writes route through the v6.0 sync engine via a changed-fields-only `applyEdit('update','setlists',…)` patch; the top bar reflects edits live. Closes long-standing Issue 2 (no UX to modify a created setlist's metadata).**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~50min |
| Started | 2026-05-14T19:15:00Z |
| Completed | 2026-05-14T20:05:00Z |
| Tasks | 3 auto PASS (autonomous — no checkpoints) |
| Files modified | 3 created, 2 modified |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Edit affordance opens the metadata sheet | Pass | Pencil button (`onEditMeta`) in SetlistGridTopBar beside the name; opens `SetlistMetaEditSheet`, pre-filled from the live setlist doc. Test: form renders with name/rabbi input values + date-button text + service-type select value. |
| AC-2: Saving name + date persists and reflects live | Pass | Save builds a changed-only patch → `applyEdit({op:'update',collection:'setlists',docId,patch})`; SetlistGrid's `useLiveQuery` on the setlist doc feeds `displayName`/`displayEventDateLabel` so the top bar updates without reload. eventDate written as ISO string (firestoreTimestampSchema-compatible) so it round-trips through Firestore. Test: name change → patch `{name}` only. |
| AC-3: Saving service type + rabbi persists | Pass | templateType (Select, 6 enum values) + rabbi (Input) diffed into the patch. Tests: rabbi change → patch `{rabbi}`; service-type change → patch `{templateType:'friday_night'}`. |
| AC-4: Cancel / Escape / unchanged-save are non-destructive | Pass | Empty patch → close without `applyEdit`; Cancel button → `onOpenChange(false)`, no write; Sheet's built-in Escape/overlay-click route through `onOpenChange`. Tests: no-change Save and Cancel both assert `applyEdit` NOT called. |
| AC-5: Mobile / tablet friendly | Pass | Renders as a `Sheet` (side panel); every control (pencil trigger `min-h/w-[44px]`, inputs `h-11`, Select trigger `h-11`, date button `h-11`, Save/Cancel `min-h-[44px]`) ≥44px; each field has a `<Label htmlFor>`. |

## Verification Results

- `npx tsc --noEmit` → the 3 new files + 2 modified files are type-clean. The only errors are the 2 pre-existing `performance-toolbar.test.tsx` errors (unrelated, not introduced — same as v70-05).
- `npx next build` → ✓ Compiled successfully; `/setlists/[id]` route builds.
- `npx vitest run src/components/setlist/grid/` → **41 failed / 150 passed** vs the pre-change baseline **41 failed / 140 passed** (proven by reverting the 2 modified files and re-running). Exactly **+10 new tests passing, ZERO new failures**. The 41 failures are the pre-existing dead-TanStack-table baseline in `SetlistGrid.*` test files (the v70-03-flagged tech debt / part of the milestone's 52-failure baseline) — untouched by this plan.
- New tests: `SetlistMetaEditSheet.test.tsx` 6/6, `SetlistGridTopBar.test.tsx` 4/4.

## Accomplishments

- **Issue 2 closed.** Daniel can now edit a created setlist's name, event date, service type, and rabbi without delete-and-recreate. Pencil → Sheet → Save.
- **No engine touch, no new deps, no new API route.** The entire write path is the existing `applyEdit('update','setlists',…)` outbox — the sync engine handles propagation unchanged.
- **Live header.** A new `useLiveQuery` on the setlist doc means the top bar's name + date reflect edits immediately, no reload — and also seeds the Sheet form.
- **Plan executed exactly as written** — 3 auto tasks, all PASS at qualify, zero deviations, zero deferred items.

## Task Commits

Project config has `auto_commit: false`; per memory `feedback_paul_phase_commits`, the entire `.paul/phases/v70-09-setlist-metadata-editor/` directory + the 5 source files + the `.paul/UAT-PENDING.md` entry are committed as a single bundled phase commit at the v70-09 transition.

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Tasks 1–3 + plan/summary metadata | `<phase-commit>` | feat | SetlistMetaEditSheet component + top-bar pencil trigger + SetlistGrid wiring + tests; v70-09 phase close |

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/components/setlist/grid/SetlistMetaEditSheet.tsx` | Created | Sheet-based metadata editor — name/eventDate/templateType/rabbi form; changed-fields-only `applyEdit` patch; loading + error-toast feedback; non-destructive cancel; injectable `applyEdit` for tests |
| `src/components/setlist/grid/SetlistGridTopBar.tsx` | Modified | Optional `onEditMeta` prop → renders a pencil edit button beside the name (matches the back-button styling, ≥44px, `aria-label="Edit setlist details"`); absent when `onEditMeta` not passed |
| `src/components/setlist/grid/SetlistGrid.tsx` | Modified | `useLiveQuery` on `getDb().setlists.get(setlistId)` → live `displayName`/`displayEventDateLabel` (static props kept as fallback); `metaSheetOpen` state; mounts `<SetlistMetaEditSheet>`; passes `onEditMeta` to the top bar |
| `src/components/setlist/grid/__tests__/SetlistMetaEditSheet.test.tsx` | Created | 6 tests — pre-fill, changed-only patch (name / rabbi / service type), no-change + cancel non-destructive; Gemini-free, injects mock `applyEdit`, stubs ResizeObserver/scrollIntoView/PointerCapture for Radix |
| `src/components/setlist/grid/__tests__/SetlistGridTopBar.test.tsx` | Created | 4 tests — name/date render, onBack fires, pencil button renders + fires `onEditMeta`, button absent without `onEditMeta` |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| `eventDate` patch value = ISO string, not epoch ms | `firestoreTimestampSchema` (schemas.ts) validates Date / `{seconds,nanoseconds}` / string — a plain number would fail validation on read and silently drop the date. ISO string matches `service.createSetlist`. | Date edits round-trip correctly through Firestore + reload. |
| Rabbi = free-text `Input`, not the congregation-rabbiProfiles `Select` | The `Setlist.rabbi` field is a plain `string`; the profile Select pulls a congregation-context dependency this minimal slice doesn't need. | Component is self-contained; a profile Select is a possible later polish. |
| Patch contains only changed fields; unchanged Save = no write | Writing unchanged fields pollutes the outbox + edit-log; AC-4 requires non-destructive no-op. | Clean sync history; predictable AC-4 behavior. |
| `onEditMeta` is an optional prop on SetlistGridTopBar | Callers that don't offer metadata editing (perform view) must render unchanged. | Back-compat preserved; the pencil only appears in the editor mount. |
| Kept SetlistGrid's static `name`/`eventDateLabel` props as fallback | The `id === 'new'` mount + existing tests pass static props; the new `useLiveQuery` is preferred only when it returns a doc. | No regression to the new-setlist path or existing tests. |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | Test-harness setup correction caught at qualify — no production impact |
| Scope additions | 0 | — |
| Deferred | 0 | — |

**Total impact:** Minimal. One qualify-time test-harness fix (jsdom stubs + an accessible-name assertion correction). No scope creep, no deferred items, plan executed as written.

### Auto-fixed Issues

**1. [Test] Radix Select + label-association test assertions failed under jsdom**
- **Found during:** Task 3 (tests) — first qualify run: 2 of 6 SetlistMetaEditSheet tests failed.
- **Issue:** (a) The date-trigger `Button` has a `<Label htmlFor>` associated with it, so its *accessible name* is the label text ("Event date"), not its visible date text — the `getByRole('button',{name: <date>})` assertion couldn't match. (b) Radix `Select` calls `Element.prototype.hasPointerCapture`, which jsdom does not implement — opening the Select threw.
- **Fix:** (a) Assert the date via `getByText(EVENT_DATE_LABEL)` instead of role+name. (b) Stub `hasPointerCapture` / `setPointerCapture` / `releasePointerCapture` (alongside the existing ResizeObserver/scrollIntoView stubs) at the top of the test file — the standard jsdom-Radix-Select shim.
- **Files:** `src/components/setlist/grid/__tests__/SetlistMetaEditSheet.test.tsx`
- **Verification:** `npx vitest run` on both new test files → 10/10 green.

### Deferred Items

None — plan executed exactly as written.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Existing `SetlistGrid.*` test files show 41 failures | Confirmed pre-existing baseline (the dead-TanStack-table path; v70-03 tech-debt flag / milestone 52-failure baseline) — NOT introduced by this plan. Proven by `git stash`-ing the 2 modified files and re-running: identical 41 failures with or without the changes. |
| Radix Select / label-association assertions under jsdom | See Auto-fixed #1. |
| `tsc` reports 2 `performance-toolbar.test.tsx` errors | Pre-existing, unrelated, not introduced (same as v70-04 / v70-05). Out of scope. |

## Skill Audit (per .paul/SPECIAL-FLOWS.md)

| Expected | Invoked | Notes |
|----------|---------|-------|
| /ui-ux-pro-max | ✓ | Invoked during `/paul:plan v70-09` — design guidance (Sheet composition, ≥44px touch targets, labeled fields, submit feedback, pencil trigger matching the glass top bar) is captured in the plan + reflected in `SetlistMetaEditSheet.tsx`. Daniel also explicitly reinforced the requirement 2026-05-14. |

## Next Phase Readiness

**Ready:**
- v70-09 phase complete (single-plan phase, LOOP CLOSED) — transition runs next (commit + push).
- Per Daniel's handoff: after v70-09 ships + pushes, return to roadmap sequence — next is **v70-06** (resolve + missing-chart + recording-match), then v70-07, then v70-08.

**Concerns:**
- A Daniel iPad UAT entry is in `.paul/UAT-PENDING.md` — verified at milestone end per the codified non-blocking pattern (v51-04).
- Parallel MCP workstream now active (Daniel's handoff 2026-05-14): v70-06/07/08 must stay in their lane (`src/components/setlist/**`, `src/lib/setlist-import/**`, `src/app/api/setlists/import/**`, the setlist write path) and NOT touch `src/app/api/mcp/**`, `src/lib/mcp/**`, the settings MCP block, `bridge/**`, or `mcpTokens` in firestore.rules. **v70-07 coordination point:** the server-callable setlist-write module v70-07 must author is consumed by the MCP write tools — agree on the signature with Daniel BEFORE designing it. Shared files (firestore.rules, firestore.indexes.json, package.json/lockfile, src/types/models.ts) — coordinate + rebase end-of-day.

**Blockers:** None.

---
*Phase: v70-09-setlist-metadata-editor, Plan: 01*
*Completed: 2026-05-14*
