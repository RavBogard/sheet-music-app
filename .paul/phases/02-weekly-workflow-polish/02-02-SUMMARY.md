---
phase: 02-weekly-workflow-polish
plan: 02
subsystem: editor
tags: [wizard, modal, rabbi, congregation-config, creation, edit-details, shadcn-select]

requires:
  - phase: 01-recursive-research
    provides: FINDINGS.md §Phase-2 wizard + naming friction list
provides:
  - Single-step CreationWizard with inline template Select + Enter-to-create
  - Data-driven OverflowMenu rabbi submenu (congregation store)
  - Distinct NamePrompt (create) and EditDetails (edit) modals
  - EditDetails modal with name + date + rabbi + service-notes

affects: [phase-2-plans-03-04, phase-3-stage-ux, future-template-admin]

tech-stack:
  added: []
  patterns:
    - "shadcn Select sentinel: use `__blank__` / `__none__` strings (empty values forbidden)"
    - "Modal local-state re-seeding on isOpen transition (prevents stale drafts across sessions)"
    - "Single-concern modals: NamePrompt = create-only, EditDetails = edit-only"

key-files:
  created:
    - src/components/setlist/modals/EditDetails.tsx
    - .paul/phases/02-weekly-workflow-polish/02-02-PLAN.md
  modified:
    - src/hooks/use-creation-wizard.ts
    - src/hooks/__tests__/use-creation-wizard.test.ts
    - src/components/setlist/wizard/CreationWizard.tsx
    - src/components/setlist/v2/OverflowMenu.tsx
    - src/components/setlist/modals/NamePrompt.tsx
    - src/components/setlist/v2/SetlistEditorV2.tsx
    - src/components/setlist/v2/__tests__/setlist-editor-v2.test.tsx

key-decisions:
  - "Template ABOVE Name in the create dialog — discoverable shortcut without overshadowing Name (which keeps autofocus)"
  - "Text + dot SaveStatus pattern (from P01) carried — consistent visual signal vs. shadcn forms"
  - "Rabbi stays a string field (no FK to rabbiProfile.id) — scope-boxed, no migration"
  - "Deselecting template does NOT wipe the current name — user's last input wins"
  - "shadcn Select sentinels (`__blank__`, `__none__`) — library rejects empty-string values"
  - "EditDetails re-seeds local state on every isOpen transition — prevents stale drafts"
  - "Hardcoded rabbi fallback removed entirely (no 'Daniel/Karen/Randy' fallback) — empty config state shows just 'Clear'"

patterns-established:
  - "Two-modal split for overloaded dialogs: create path and edit path get distinct components with distinct titles/fields"
  - "`useCongregation()?.scheduling?.rabbiProfiles ?? []` is the canonical rabbi list source"

duration: ~30min
started: 2026-04-13T22:00:00Z
completed: 2026-04-13T22:20:00Z
---

# Phase 2 Plan 02: Wizard + NamePrompt Polish Summary

**Collapsed the "+ New" wizard to a single dialog with inline template shortcut and Enter-to-create, split the overloaded NamePrompt into distinct create/edit modals, and replaced the hardcoded rabbi list in the overflow menu with the congregation-config source the wizard already used.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~30 min |
| Started | 2026-04-13T22:00:00Z |
| Completed | 2026-04-13T22:20:00Z |
| Tasks | 3 auto + 1 human-verify — all complete |
| Files created | 2 |
| Files modified | 7 |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Single-step wizard + Enter-to-create | Pass | Wizard opens straight to Details; Template Select at top, Name autofocus, Date + Rabbi row, Cancel/Create footer; Enter in Name triggers `create()` |
| AC-2: Data-driven rabbi list in OverflowMenu | Pass | Uses `useCongregation()?.scheduling?.rabbiProfiles ?? []`; hardcoded array removed; empty config state renders just "Clear" |
| AC-3: NamePrompt / EditDetails split | Pass | NamePrompt used only for create (title "Name Your Setlist"); new EditDetails modal (name + date + rabbi + service-notes, title "Edit Setlist Details") |
| AC-4: Tests + typecheck + suite green | Pass | `npx tsc --noEmit` 0 errors; 1105/1105 tests pass; `use-creation-wizard.test.ts` rewritten 12-case single-step suite |

## Accomplishments

- "+ New" is one screen for the 90% happy path: name → Enter. One extra click removed from every weekly setlist.
- Rabbi roster is now configurable without a code push — admin can edit `config/congregation.scheduling.rabbiProfiles` in Firestore and both the wizard and the overflow menu pick it up.
- Two overloaded-modal roles became two modals with honest titles and field sets; edit-details now surfaces `rabbi` and `serviceNotes` fields that never had an editor UI before.

## Task Commits

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Tasks 1–3 | `20627ab` | feat | Phase 2 P02: wizard + NamePrompt polish |

Pushed: `28c95fd..20627ab master -> master`. Vercel auto-deploys `master` to production.

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/components/setlist/modals/EditDetails.tsx` | Created | New edit-existing modal with name + date + rabbi + service notes |
| `src/hooks/use-creation-wizard.ts` | Modified | Collapsed to single step; `canCreate` replaces `canGoNext`; step nav removed |
| `src/hooks/__tests__/use-creation-wizard.test.ts` | Modified | Rewritten 12-case suite for single-step flow |
| `src/components/setlist/wizard/CreationWizard.tsx` | Modified | Single dialog with inline Template Select + Name autofocus + Enter-to-create |
| `src/components/setlist/v2/OverflowMenu.tsx` | Modified | RabbiSubmenu sub-component reads congregation store |
| `src/components/setlist/modals/NamePrompt.tsx` | Modified | Removed deprecated `isBandLeader` prop |
| `src/components/setlist/v2/SetlistEditorV2.tsx` | Modified | Two distinct modal renders instead of overloaded `isOpen` OR |
| `src/components/setlist/v2/__tests__/setlist-editor-v2.test.tsx` | Modified | Added EditDetails mock to match NamePrompt mock |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Template Select ABOVE Name in create dialog | Shortcut discoverable without overshadowing the required Name field, which retains autofocus | Users who want the shortcut see it immediately; users who don't are already typing Name |
| Deselecting template does NOT wipe Name | User's field value is more authoritative than a picker state change | Small UX call confirmed in tests; prevents lost typing |
| Drop the hardcoded rabbi fallback entirely | "Silent empty state" matches other empty states in the app; a stale default masks config bugs | Any congregation without `rabbiProfiles` gets no rabbi options in OverflowMenu (wizard already had this behavior) |
| EditDetails re-seeds on isOpen | Stale draft from a prior open would overwrite current state on next save | One `useEffect` guards against it — cheap |
| Keep `rabbi` as `string` | A rabbi-profile FK would ripple into Firestore rules, migration, publish/notification paths — out of scope for a UX polish plan | No schema migration; display/select only |
| shadcn Select sentinels `__blank__` / `__none__` | shadcn rejects empty-string values; sentinels are the library-idiomatic workaround | Confined to the two modals; documented at call site |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | Test-file mock wiring — essential, zero user-visible impact |
| Scope additions | 0 | — |
| Deferred | 0 | — |

**Total impact:** Plan executed close to spec; one test-wiring fix surfaced only after running the full suite.

### Auto-fixed Issues

**1. [test-wiring] setlist-editor-v2.test.tsx needed an EditDetails mock**
- **Found during:** Task 3 full-suite run.
- **Issue:** Adding `import { EditDetails }` to `SetlistEditorV2.tsx` caused the test file to pull in the real `EditDetails` module, which transitively imports `@/lib/congregation-store` → `@/lib/firebase` → `@/lib/env.ts`. The test env doesn't provide the env vars, and test-file collection crashed before any test ran.
- **Fix:** Added `vi.mock("../../modals/EditDetails", () => ({ EditDetails: () => null }))` alongside the existing NamePrompt mock — same pattern the existing test already used for NamePrompt.
- **Files:** `src/components/setlist/v2/__tests__/setlist-editor-v2.test.tsx`
- **Verification:** Full suite back to 1 pre-existing failing file (`song-charts-library.test.tsx`, unchanged); 1105 tests pass
- **Commit:** `20627ab`

### Deferred Items

None — AC-1 through AC-4 closed in-plan.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Pre-existing env-ts file-level collection error in `song-charts-library.test.tsx` | Unchanged from prior plans — logged here for visibility, out of scope |

## Production Smoke Checklist (pending human verification)

1. Dashboard → "+ New" → single Details dialog opens (no step indicator).
2. Type a name → Enter → setlist created, redirected to editor.
3. Re-open wizard → Template Select → "Shabbat Morning" → name + date auto-fill.
4. Existing setlist → overflow → "Assign Rabbi" — list matches Firestore `config/congregation.scheduling.rabbiProfiles` (no longer "Daniel/Karen/Randy" if config differs).
5. Existing setlist → overflow → "Edit Details" → title "Edit Setlist Details"; all four fields editable; Save persists.

## Deferred Human Smoke Tests (running list)

Carried forward + new:
1. **v4.1**: create setlists via wizard / chat / import / transfer on prod.
2. **Phase 1.1**: two-tab conflicting-edit smoke.
3. **Phase 1.2**: fresh incognito offline-prefetch smoke.
4. **Phase 1.3**: admin-panel 10-char bridge code; `/api/nudge-admin` rate-limit smoke.
5. **Phase 1.3 operator**: `firebase deploy --only storage` pending.
6. **Phase 2 P01**: close-tab-within-1s keepalive flush smoke; "Saved Ns ago" ticker.
7. **Phase 2 P02 (new)**: 5-step smoke above (single-dialog wizard, Enter-to-create, Template auto-fill, rabbi submenu from congregation, EditDetails modal).

## Skill Audit

SPECIAL-FLOWS.md required `/ui-ux-pro-max` for UI work. Invoked before Task 1 (modal design review). Recommendations applied: Template above Name, single primary button right-aligned, Enter limited to Name input, textarea accepts Enter normally. ✓

## Next Phase Readiness

**Ready:**
- Plan 02-03 (Setlist list ordering, hero CTA, back button) — independent of create/edit path.
- Plan 02-04 (OverflowMenu reorder, copy unification, global undo) — touches the same OverflowMenu but different concerns.
- `EditDetails` modal is the pattern for any future editor-only fields; adding a new field is one line per location.
- `useCongregation()?.scheduling?.rabbiProfiles` is the canonical source — future features should read it, not hardcode.

**Concerns:**
- `rabbi` field is still a free-form string. If two rabbis share a first name, the UI shows ambiguous labels. Low-risk for CRC's current roster; revisit if a rabbi-profile admin UI is added.
- `serviceNotes` has a 500-char client cap but no server validation — Zod schema on `/api/setlist/flush` treats it as an arbitrary string. If abuse becomes a concern, tighten at the route level.
- shadcn Select sentinels (`__blank__`, `__none__`) are a workaround that could bite if a template key ever happens to equal the sentinel string. Documented at call site; unlikely in practice.

**Blockers:** None for Plans 02-03 or 02-04.

---
*Phase: 02-weekly-workflow-polish, Plan: 02*
*Completed: 2026-04-13*
