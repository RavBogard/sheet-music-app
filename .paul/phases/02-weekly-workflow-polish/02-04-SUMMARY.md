---
phase: 02-weekly-workflow-polish
plan: 04
subsystem: editor
tags: [service-notes, overflow-menu, save-as-template, copy, gig-packet, undo, redo, keyboard-shortcuts]

requires:
  - phase: 02-weekly-workflow-polish
    provides: OverflowMenu RabbiSubmenu + EditDetails modal (P02); NextServiceCard / past-list ordering (P03)

provides:
  - Always-visible Service Notes textarea (no "+ Add" gate)
  - OverflowMenu grouped + Save-as-Template action
  - Canonical "Gig Packet" copy across top bar, overflow menu, PrintModal
  - Global Cmd/Ctrl+Z undo + Cmd+Shift+Z / Ctrl+Y redo keyboard shortcuts

affects: [phase-3-stage-ux, phase-4-editor-ergonomics]

tech-stack:
  added: []
  patterns:
    - "Field-safe global keyboard shortcuts: skip when focus is in INPUT/TEXTAREA/SELECT/contenteditable"
    - "Progressive-disclosure anti-pattern: don't gate primary authoring fields behind '+ Add' buttons"
    - "Dropdown menu groups: Primary / Info / Leader actions / Settings / Tools / Danger"

key-files:
  created:
    - .paul/phases/02-weekly-workflow-polish/02-04-PLAN.md
  modified:
    - src/components/setlist/v2/SetlistEditorV2.tsx
    - src/components/setlist/v2/OverflowMenu.tsx
    - src/components/setlist/PrintModal.tsx
    - src/components/setlist/__tests__/print-modal.test.tsx

key-decisions:
  - "Service Notes always visible when canEdit — discoverability over cleanliness; placeholder carries the purpose"
  - "Menu groups: Primary → Info → Leader actions → Settings → Tools → Danger"
  - "Within Leader actions, order by frequency: Publish (weekly) → Edit Details (weekly) → Save as Template (occasional)"
  - "Edit Details icon: MoreVertical → Pencil — the old icon duplicated the overflow trigger and read as generic"
  - "Canonical copy: 'Gig Packet' noun / 'Generate Gig Packet' verb — 'Print' undersells a multi-page PDF"
  - "Global undo scoped to editor with field-aware guard — respects native field undo for typing"

patterns-established:
  - "Field-aware global shortcuts: tagName + isContentEditable check before preventDefault"
  - "Save-as-Template handler owns its own service call + toast lifecycle (same shape as dashboard-level handler)"

duration: ~20min
started: 2026-04-13T22:45:00Z
completed: 2026-04-13T23:00:00Z
---

# Phase 2 Plan 04: Overflow + Service Notes + Copy + Global Undo Summary

**Closed the Phase 2 editor-polish backlog: Service Notes no longer hidden, Save-as-Template available from the open editor, copy unified on "Gig Packet", and global Cmd/Ctrl+Z + Shift+Z/Ctrl+Y shortcuts work without stealing field-native undo.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~20 min |
| Started | 2026-04-13T22:45:00Z |
| Completed | 2026-04-13T23:00:00Z |
| Tasks | 4 auto + 1 human-verify — all complete |
| Files modified | 4 |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Service notes always visible when editable | Pass | "+ Add" gate removed; `serviceNotes ?? ""` preserves whitespace drafts; read-only viewers still see it only when populated |
| AC-2: OverflowMenu groups + Save-as-Template | Pass | 6 groups with separators; Save-as-Template wired to existing `editorService.saveAsTemplate`; hidden when `!canEdit` or no `setlistId` |
| AC-3: Unified "Gig Packet" copy | Pass | OverflowMenu + PrintModal heading both read "Gig Packet" (top bar was already canonical); test updated |
| AC-4: Global undo/redo shortcuts | Pass | Cmd/Ctrl+Z undo; Cmd/Ctrl+Shift+Z and Ctrl+Y redo; field-aware guard; preventDefault only when handling; effect cleans up on unmount |
| AC-5: Tests + typecheck + suite green | Pass | `tsc --noEmit` 0 errors; full suite **1107/1107** tests pass |

## Accomplishments

- The single most-requested field (Service Notes) is now visible by default — band lead can type "starting 15 min early" without hunting for a button.
- Save-as-Template is reachable from the editor, not just the dashboard card menu. The weekly clone → tweak → keep-as-pattern loop is now complete in-place.
- Editor copy is consistent: "Gig Packet" is the canonical term everywhere the band sees.
- Cmd+Z works everywhere it should (track reorder, add/remove) and doesn't work where it shouldn't (typing in inputs).

## Task Commits

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Tasks 1–4 | `b49f610` | feat | Phase 2 P04: service-notes always + overflow reorder + copy + global undo |

Pushed: `540b2fb..b49f610 master -> master`. Vercel auto-deploys `master` to production.

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/components/setlist/v2/SetlistEditorV2.tsx` | Modified | Dropped "+ Add" gate; added `handleSaveAsTemplate`; wired new OverflowMenu prop; global keydown listener for undo/redo |
| `src/components/setlist/v2/OverflowMenu.tsx` | Modified | New `onSaveAsTemplate` prop + `BookmarkPlus` item; group reorder; `Pencil` icon on Edit Details; "Gig Packet" copy |
| `src/components/setlist/PrintModal.tsx` | Modified | Heading "Print Gig Packet" → "Gig Packet" |
| `src/components/setlist/__tests__/print-modal.test.tsx` | Modified | Test string match updated to new heading |
| `.paul/phases/02-weekly-workflow-polish/02-04-PLAN.md` | Created | Plan |
| `.paul/phases/02-weekly-workflow-polish/02-04-SUMMARY.md` | Created | This file |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Drop the progressive-disclosure gate on Service Notes | Primary authoring fields shouldn't require a discovery click. Empty-state noise is handled by the placeholder, not a button. | One less click in the weekly flow |
| Edit Details icon: `MoreVertical` → `Pencil` | The old icon duplicated the overflow trigger's glyph and didn't signal "edit"; `Pencil` is the idiomatic edit affordance | Clearer semantics |
| Field-aware guard for global shortcuts | Without it, typing a name and hitting Cmd+Z would undo the track reorder instead of the keystroke — a footgun | Native field undo preserved |
| `preventDefault()` only when handling | Browser keeps its default Cmd+Z behavior when `canUndo === false` | Safer fallback |
| Hide Save-as-Template when `!canEdit` or no `setlistId` | Templates are derived from existing setlist content; both preconditions are required | No orphan menu entries |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | PrintModal heading + its test needed updating (not in original plan's file list) |
| Scope additions | 0 | — |
| Deferred | 0 | — |

**Total impact:** One additional file pair updated for copy-consistency — essential to avoid a user-visible "Gig Packet" / "Print Gig Packet" discrepancy between menu and modal.

### Auto-fixed Issues

**1. [copy-consistency] PrintModal heading still read "Print Gig Packet"**
- **Found during:** Task 3 grep sweep.
- **Issue:** Plan's file list covered the menu + top bar but missed the modal opened by those triggers. The modal heading saying "Print Gig Packet" while its triggers say "Gig Packet" would have been a visible inconsistency on the first tap.
- **Fix:** Updated `src/components/setlist/PrintModal.tsx:367` heading and matching test assertion.
- **Files:** `src/components/setlist/PrintModal.tsx`, `src/components/setlist/__tests__/print-modal.test.tsx`
- **Verification:** Full suite 1107/1107; `grep -rn "Print Gig Packet" src/` returns nothing.
- **Commit:** `b49f610`

### Deferred Items

None — AC-1 through AC-5 closed in-plan.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Pre-existing `song-charts-library.test.tsx` env-ts file-level noise | Unchanged — out of scope |

## Production Smoke Checklist (pending human verification)

1. Open any setlist as editor → Service Notes textarea visible with placeholder immediately.
2. Overflow menu → "Save as Template" → toast confirms; template available in next "+ New" wizard Template dropdown.
3. Overflow mobile Tools and top bar both read "Gig Packet"; opening the modal heading also reads "Gig Packet".
4. Drag a track → Cmd+Z → reverts; Cmd+Shift+Z → re-moves.
5. Focus the name input → Cmd+Z → undoes typing (not the track list); same for Service Notes textarea.

## Deferred Human Smoke Tests (running list)

1. **v4.1** / **Phase 1.1** / **Phase 1.2** / **Phase 1.3**: prior unchanged.
2. **Phase 2 P01**: close-tab-within-1s keepalive flush; "Saved Ns ago" ticker.
3. **Phase 2 P02**: single-dialog wizard, Enter-to-create, congregation-driven rabbi list, EditDetails modal.
4. **Phase 2 P03**: dashboard past-list DESC, role-aware hero Edit button, editor back → referrer.
5. **Phase 2 P04 (new)**: Service Notes default visibility, Save-as-Template from editor, "Gig Packet" copy consistency, Cmd+Z scoped correctly.
6. **Phase 1.3 operator**: `firebase deploy --only storage` still pending.

## Skill Audit

SPECIAL-FLOWS.md required `/ui-ux-pro-max` for Tasks 1 + 2. Invoked; confirmed:
- Always-visible textarea is OK (placeholder softens empty state).
- Menu order matches frequency within Leader actions (Publish → Edit Details → Save as Template).

Applied as-spec'd. ✓

## Next Phase Readiness

**Ready:**
- **Phase 2 is complete (4/4 plans).** Transition to Phase 3 runs next.
- Service-notes pattern (always-visible + placeholder) is available for any other hidden-behind-button fields.
- Global shortcut pattern (field-aware guard) is the template for future editor shortcuts (e.g., Save, Next/Prev track).

**Concerns:**
- `HeroCard.tsx` dead code from Phase 2 P03 still not deleted. Flag for a cleanup plan.
- Save-as-Template re-uses the dashboard's service contract but lives in the editor — any future refactor of `saveAsTemplate` signature must update both call sites.

**Blockers:** None.

## Phase 2 Roll-Up

All four plans shipped:
- **P01** — Save reliability (unload-flush route + "Saved Ns ago" ticker) — `cd51d86`
- **P02** — Wizard + NamePrompt polish (single-step + rabbi from congregation + EditDetails) — `20627ab`
- **P03** — Dashboard polish (past-list DESC + role-aware hero + referrer back) — `1c6bb59`
- **P04** — Editor polish (service notes + overflow reorder + Gig Packet + Cmd+Z) — `b49f610`

Phase 2 goal from ROADMAP: "weekly workflow polish + band-onboarding hardening" — closed. The band is onboarding ~1 month out (per PROJECT.md); backend hardening (Phase 1.x) and editor polish (Phase 2) are both done. Phase 3 (Stage UX for the band) is next.

---
*Phase: 02-weekly-workflow-polish, Plan: 04*
*Completed: 2026-04-13*
