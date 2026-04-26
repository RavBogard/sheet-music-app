---
phase: v50-05-spreadsheet-editor
plan: 03
subsystem: ui
tags:
  - multi-select
  - batch-edit
  - alert-dialog
  - radix
  - context-provider
  - dnd-kit
  - aria-pressed
  - keyboard
  - destructive-action

requires:
  - phase: v50-05-spreadsheet-editor
    provides: SetlistGrid + DragHandleCell + cell contracts (v50-05-01); SetlistGridHydrator + ChartBindPopover + cmdk-in-Popover pattern + cleanup-then-findByTestId test pattern (v50-05-02)
  - phase: v50-04-song-catalog
    provides: propagateTrackEditToSong (consumed in bulk-set per-songId fanout)
  - phase: v50-03-sync-engine
    provides: applyEdit (consumed by bulk-set + bulk-delete; per-doc ordering invariant preserved)
provides:
  - useGridSelection hook — Set<string> + anchor-aware extendRange + pruneTo for stale-row cleanup; pure computeRangeSelection helper extracted for unit testing
  - DragHandleCell modifier-aware onClick — Shift / Cmd / Ctrl + click routes to selection action; plain clicks fall through to dnd-kit; `aria-pressed` + `aria-label` placed AFTER `{...attributes}` spread (dnd-kit injects its own)
  - BatchActionBar — sticky toolbar (selection size ≥ 2) with bulk Type / Key / Lead / Delete + ✕ Clear; KEY_OPTIONS_DATA + TYPE_OPTIONS exported from cells for reuse
  - DeleteConfirmProvider — React-context wrapper with shadcn AlertDialog; cancel-and-replace semantics; ConfirmInfo discriminated union (`{kind:'row',title}` | `{kind:'bulk',count}`); useDeleteConfirm + useDeleteConfirmOptional hooks
  - SetlistGrid `confirmDelete` prop (new ConfirmInfo signature) co-existing with legacy `confirmDeleteWithTitle` alias; resolution precedence prop → context → window.confirm
  - /setlists/[id] page wrap: `<DeleteConfirmProvider>` mounted around both isNew and existing-setlist render paths
affects:
  - v50-05-04 (iPad / pointer-coarse Sheet swap + ContextMenu) — toolbar buttons inherit 44px touch-target sizing; ContextMenu wires to the same selection state; `BulkPopover` swap-target candidate for pointer-coarse Sheet
  - v50-05-05 (mobile + WCAG AA + Undo) — undo middleware intercepts BEFORE applyEdit at the same point bulk-set fans out; AlertDialog + selection state both already accessible from mobile flow's parallel render path
  - v50-06 (concurrent-edit safety) — when reconciliation modal lands, the DeleteConfirmProvider pattern is the template (Radix dialog + context + cancel-and-replace promise resolution)

tech-stack:
  added: []
  patterns:
    - "useGridSelection: anchor moves with each toggle; extendRange replaces (not adds) selection inclusive between anchor and clicked id; pruneTo surgically removes stale ids while preserving survivors + valid anchor — surgical, not all-or-nothing."
    - "Modifier-aware onClick on a dnd-kit drag handle: Shift / Cmd / Ctrl + click preventDefault + stopPropagation and route to selection action; plain click falls through to dnd-kit (PointerSensor delay:150 + tolerance:5 already prevents drag activation on quick click). Pattern reusable for any future modifier-aware row affordance."
    - "ARIA + override placement: when wrapping a button with `{...useSortable.attributes}`, ALWAYS place app-owned `aria-pressed` / `aria-label` AFTER the spread — dnd-kit injects its own aria-pressed for drag state, which would otherwise silently override. Discovered by failing test (aria-pressed=null even when state was correct)."
    - "Cell-options as exported constants: KEY_OPTIONS_DATA + TYPE_OPTIONS exported from KeyCell.tsx + TypeCell.tsx so cells AND BatchActionBar share one source of truth. Lighter than a separate options module; future toolbar growth follows the same pattern."
    - "DeleteConfirmProvider: context-provider + Radix AlertDialog + Promise-based confirm() returning user's choice. Cancel-and-replace if a prior confirm is in flight (predictable; queueing is a future option). ConfirmInfo discriminated union avoids string-parsing back out of synthesized titles."
    - "Confirmation precedence inside SetlistGrid: prop (rich `confirmDelete`) → prop (legacy `confirmDeleteWithTitle`) → provider context → window.confirm. Tests bypass provider entirely via prop injection; production gets the themed dialog."

key-files:
  created:
    - src/hooks/use-grid-selection.ts
    - src/hooks/__tests__/use-grid-selection.test.ts
    - src/components/setlist/grid/BatchActionBar.tsx
    - src/components/setlist/grid/__tests__/BatchActionBar.test.tsx
    - src/components/setlist/grid/DeleteConfirmProvider.tsx
    - src/components/setlist/grid/__tests__/DeleteConfirmProvider.test.tsx
    - src/components/setlist/grid/__tests__/SetlistGrid.selection.test.tsx
  modified:
    - src/components/setlist/grid/SetlistGrid.tsx (selection wiring, BatchActionBar mount, confirmFn precedence, new confirmDelete prop, GridMeta extension, bulk handlers)
    - src/components/setlist/grid/cells/DragHandleCell.tsx (modifier-aware onClick + selected styling + aria override placement)
    - src/components/setlist/grid/cells/KeyCell.tsx (export KEY_OPTIONS_DATA)
    - src/components/setlist/grid/cells/TypeCell.tsx (export TYPE_OPTIONS)
    - src/components/setlist/grid/index.ts (BatchActionBar + DeleteConfirmProvider + ConfirmInfo exports)
    - src/app/(main)/setlists/[id]/page.tsx (DeleteConfirmProvider wrap on both isNew + existing-setlist paths)

key-decisions:
  - "Multi-select wired to drag handle (NOT row body) per ARCHITECTURE.md §6.6 — keeps cell click → focus/edit semantics untouched"
  - "Toolbar mounts at selection size ≥ 2 (per spec); 1 selected row shows aria-pressed indicator but no toolbar"
  - "extendRange REPLACES selection (Sheets convention) rather than additive union — anchor moves with each toggle so subsequent Shift-clicks extend from the most recent toggle"
  - "Selection PRESERVED across bulk-set (user can keep editing other fields on the same set); CLEARED on bulk-delete"
  - "Bulk-set propagation: per UNIQUE songId in selection (skips rows without songId), via the existing v50-04 helper — same lead-musician change to 5 rows of 3 different songs = 3 propagation calls, not 5"
  - "BatchActionBar V1 columns = Type + Key + Lead + Delete (Architecture mockup says Type+Lead+Delete; spec text says key/lead/bpm; chose Type+Key+Lead+Delete as practical superset; BPM bulk-set deferred since rare)"
  - "Cell-options constants exported (KEY_OPTIONS_DATA, TYPE_OPTIONS) rather than extracted to a new shared module — minimal change, single source of truth, no extra file"
  - "DeleteConfirmProvider uses cancel-and-replace (not queue) when a second confirm fires while one is open — predictable for the rare double-confirm case; queueing reserved for future if needed"
  - "ConfirmInfo discriminated union ({kind:'row',title} | {kind:'bulk',count}) — avoids string-parsing 'N rows' back out of a generic title; tests stay clean"
  - "useDeleteConfirmOptional returns null when unmounted (vs throwing) — SetlistGrid uses this for graceful test fallback while still exposing useDeleteConfirm (throws) for production consumers"
  - "useGridSelection.pruneTo added beyond the original PLAN — needed for surgical stale-row cleanup that preserves survivors. Plan said clear-and-rebuild; pruneTo is cleaner."
  - "Aria override placement after dnd-kit attributes spread — discovered via failing test (aria-pressed=null despite correct selection state); root-caused to dnd-kit injecting its own aria-pressed for drag state; documented in DragHandleCell + commit body"

patterns-established:
  - "Modifier-aware drag-handle click pattern: any future affordance that needs Shift/Cmd/Ctrl + click on a dnd-kit-wrapped element should preventDefault + stopPropagation in the modifier branch, fall through in the plain branch. Drag activation already gated by activationConstraint."
  - "Stale-row prune via pruneTo(validIds): the contract for any local state that holds row ids — survive remote deletes by pruning, not by clearing. Same pattern lands in v50-06 reconciliation modal selection state if needed."
  - "Cell-option constants as exports: cells own the canonical list; toolbar / future bulk affordances reuse via import. Avoid premature refactor into a shared module."
  - "Provider + context + Promise-based imperative API for blocking dialogs: render-prop alternative is awkward in Server Component children; context fallback in consumer components keeps prop contract minimal for tests."

duration: "~75 min (apply phase)"
started: "2026-04-26T17:35:00Z"
completed: "2026-04-26T17:55:00Z"
---

# v50-05 Plan 03: Multi-select / batch edit + AlertDialog swap-in — Summary

**Shipped row-level multi-select (Cmd/Ctrl-click toggle, Shift-click range, Esc clears, anchor-aware) wired through the drag handle to a sticky BatchActionBar (Type / Key / Lead / Delete) that fans out N parallel applyEdit calls + per-songId propagation; replaced window.confirm at /setlists/[id] with a shadcn AlertDialog mounted via React-context provider — both single-row Backspace and bulk-delete now route through the same themed, focus-trapped dialog with row-vs-bulk copy.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~75 min |
| Started | 2026-04-26T17:35:00Z |
| Completed | 2026-04-26T17:55:00Z |
| Tasks | 3 / 3 auto (no checkpoints) |
| Files created | 7 (3 components/hook + 4 tests) |
| Files modified | 6 |
| Net LOC | +1,929 / −32 (~+1,897 net add — UI scaffold + extensive test coverage) |
| Commits | 4 atomic (1 chore + 3 feat) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Cmd-click drag handle toggles aria-pressed | ✅ Pass | SetlistGrid.selection.test 3 cases (single-row Cmd-click; non-contiguous multi-Cmd-click; both rows pressed). aria-pressed override placed AFTER {...attributes} spread to defeat dnd-kit's own aria-pressed injection. |
| AC-2: Shift-click extends range from anchor | ✅ Pass | extendRange replaces selection (Sheets convention) with inclusive range from anchor to clicked id. Pure helper computeRangeSelection unit-tested with 6 cases (forward/reverse/equal/null/stale/full). |
| AC-3: Esc clears selection | ✅ Pass | Root-div onKeyDown handler — only fires when selection.size > 0 (no interference with cell-internal Esc). Works for both Cmd-click and Shift-click ranges. |
| AC-4: BatchActionBar mounts at selection ≥ 2 | ✅ Pass | size=1 → no toolbar (drag handle still aria-pressed); size=2 → toolbar mounts with "2 rows selected" + 4 action buttons + Clear. Test: SetlistGrid.selection AC-4. |
| AC-5: Bulk-set Key fires N applyEdit + propagation | ✅ Pass | 3 selected rows (2 with songId, 1 without) → 3 applyEdit calls + 2 propagateTrackEditToSong calls (per unique songId, skipped row without). Selection PRESERVED. SyncIndicator transitions through Editing → Saving → Saved. |
| AC-6: Bulk-delete via AlertDialog | ✅ Pass | Both prop-injection path (BatchActionBar test + SetlistGrid integration with confirmDeleteWithTitle prop) and provider-context path (SetlistGrid wrapped in `<DeleteConfirmProvider>` → bulk Delete → "Delete 2 rows?" dialog → action button → 2 deletes + selection cleared) verified. Cancel path leaves rows intact. |
| AC-7: Single-row delete via AlertDialog | ✅ Pass | Backspace on focused drag handle under `<DeleteConfirmProvider>` opens "Delete row?" dialog with quoted track title in description. Cancel preserves; Delete commits to applyEdit. window.confirm gone from production /setlists/[id]. |
| AC-8: Verification gates pass | ✅ Pass | vitest 1359/1360 (1 pre-existing cross-tab-lock flake remains, deferred to v50-06 — NOT a regression); tsc --noEmit clean; next build clean compile (only Sentry deprecation warning, pre-existing). 4 commits pushed to origin/master. |

**Skill audit:** `/ui-ux-pro-max` invoked at start of APPLY ✅ (SPECIAL-FLOWS.md mandate satisfied; rules applied: 44px touch targets, cursor-pointer, stable selected-state without scale transforms, 150ms transition with motion-reduce, aria-pressed/aria-live, no emoji icons (Lucide), shadcn AlertDialog auto-handles focus trap).

## Accomplishments

- **Multi-select + bulk edit lands the highest-leverage weekly-workflow polish.** The "tweak 2-3 songs" cloning workflow (90% of weekly setlist work) now collapses N round-trips into one bulk-set: Cmd-click 3 rows, click Key, pick Dm, all 3 update + propagate to song-defaults in parallel via the v50-03 sync engine. Lead-musician swap for "Daniel" → "Randy" across an entire service is one toolbar action.
- **AlertDialog at the destructive boundary.** window.confirm — abrupt, unthemed, blocking — is gone from /setlists/[id]. shadcn AlertDialog (Radix under the hood — focus trap + Esc + overlay-click handled by the primitive) renders both row-delete ("Delete row?" with quoted title) and bulk-delete ("Delete N rows?") via a single context provider. Cancel-and-replace semantics for the rare double-confirm case.
- **Selection state primitives reusable for v50-05-04 + v50-05-05.** `useGridSelection` (anchor + extendRange + pruneTo + clear) is positioned for ContextMenu wiring (v50-05-04), Undo middleware integration (v50-05-05), and cross-leader live-edit reconciliation (v50-06). `pruneTo` was added beyond the PLAN — needed for surgical stale-row cleanup — and is the right shape for any future selection state that needs to survive remote mutations.
- **+44 new test cases on the v50-05-02 baseline.** 14 hook (use-grid-selection — toggle/anchor/extendRange/clear/pruneTo) + 13 SetlistGrid integration (modifier-click toggle, Shift-click range, Esc clear, plain-click no-op, toolbar mount/unmount, bulk-set + propagation, bulk-delete confirm true/false, Clear button parity, single-row + bulk delete via provider, stale-row prune surgery) + 7 BatchActionBar component (count, trigger render, popover commit for Type/Key/Lead, Delete + Clear callbacks) + 10 DeleteConfirmProvider (open/close, row vs bulk copy, Cancel/Delete/Esc resolution, cancel-and-replace, useDeleteConfirm throw, useDeleteConfirmOptional null-when-unmounted). Full suite 1359/1360.

## Task Commits

Each task committed atomically:

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Plan + state sync | `25b57ad` | chore(paul) | v50-05-03 PLAN.md + handoff archive + ROADMAP/STATE expansion to 03/04/05 |
| Task 1: Selection hook + drag-handle wiring | `e26626c` | feat | use-grid-selection hook (14 tests) + DragHandleCell modifier-click + SetlistGrid wiring (6 integration tests) — AC-1, AC-2, AC-3 |
| Task 2: BatchActionBar bulk toolbar | `ae0a8c3` | feat | BatchActionBar component (7 tests) + cell-options exports + SetlistGrid bulk handlers + 5 integration tests — AC-4, AC-5, AC-6 (toolbar path) |
| Task 3: DeleteConfirmProvider | `8acf7aa` | feat | DeleteConfirmProvider context + AlertDialog (10 tests) + SetlistGrid context fallback + new confirmDelete prop + page.tsx wrap + 2 integration tests — AC-6 (dialog path), AC-7, AC-8 |

All four commits pushed to `origin/master` (`13870de..8acf7aa`). UNIFY commit (this SUMMARY + STATE + ROADMAP) lands next.

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/hooks/use-grid-selection.ts` | Created (~115 LOC) | Selection state hook: Set<string> + anchor + toggle/extendRange/pruneTo/clear/has + pure computeRangeSelection helper |
| `src/hooks/__tests__/use-grid-selection.test.ts` | Created (~145 LOC, 14 cases) | Pure helper tests (range math) + hook tests (toggle, extendRange, pruneTo surgery, anchor preservation, clear) |
| `src/components/setlist/grid/BatchActionBar.tsx` | Created (~245 LOC) | Sticky toolbar (selection ≥ 2): aria-live count, Type/Key/Lead Popover+cmdk dropdowns, destructive Delete, ✕ Clear; inline `BulkPopover` helper parameterized by trigger label + options + onCommit |
| `src/components/setlist/grid/__tests__/BatchActionBar.test.tsx` | Created (~165 LOC, 7 cases) | Count text, trigger render, Type/Key/Lead popover commit, Delete + Clear callback wiring |
| `src/components/setlist/grid/DeleteConfirmProvider.tsx` | Created (~125 LOC) | React context + Radix AlertDialog + Promise-based confirm(); cancel-and-replace; ConfirmInfo discriminated union; useDeleteConfirm + useDeleteConfirmOptional hooks |
| `src/components/setlist/grid/__tests__/DeleteConfirmProvider.test.tsx` | Created (~210 LOC, 10 cases) | Open/close, row vs bulk copy (singular vs plural), Cancel/Delete/Esc resolution, cancel-and-replace, throw-when-unmounted, optional-null |
| `src/components/setlist/grid/__tests__/SetlistGrid.selection.test.tsx` | Created (~365 LOC, 13 cases) | All multi-select integration scenarios + bulk-set + bulk-delete via prop AND provider paths + stale-row prune surgery |
| `src/components/setlist/grid/SetlistGrid.tsx` | Modified | useGridSelection wiring; allRowIds memo; handleDragHandleClick (Shift/Cmd routing); handleRootKeyDown (Esc); GridMeta extended with selectedIds + onDragHandleClick; SortableRow extended with isSelected + onSelectionClick; selectedTracks memo; handleBulkSet (parallel applyEdit + per-songId propagation); handleBulkDelete (confirm + parallel delete + clear); confirmFn (prop → context → window.confirm precedence); refactored handleDeleteRow to use confirmFn with ConfirmInfo; new confirmDelete prop on SetlistGridProps |
| `src/components/setlist/grid/cells/DragHandleCell.tsx` | Modified | New isSelected + onSelectionClick props; modifier-aware onClick (Shift/Cmd/Ctrl preventDefault + stopPropagation); selected styling (text-indigo-300 + bg-indigo-500/10 + ring-1); **aria-pressed + aria-label moved AFTER `{...attributes}` spread** to defeat dnd-kit's own aria-pressed injection |
| `src/components/setlist/grid/cells/KeyCell.tsx` | Modified | `KEY_OPTIONS_DATA` exported (was internal const) — single source of truth for key list across editor + toolbar |
| `src/components/setlist/grid/cells/TypeCell.tsx` | Modified | `TYPE_OPTIONS` exported (was internal const) — single source of truth for type list |
| `src/components/setlist/grid/index.ts` | Modified | BatchActionBar + BatchActionBarProps + BulkSetPatch + DeleteConfirmProvider + useDeleteConfirm + useDeleteConfirmOptional + ConfirmInfo + DeleteConfirmContextValue exports |
| `src/app/(main)/setlists/[id]/page.tsx` | Modified | `<DeleteConfirmProvider>` wraps both isNew (`<SetlistGrid>` direct) and existing-setlist (`<SetlistGridHydrator>`) render paths |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Multi-select on drag handle (not row body) | Per ARCHITECTURE.md §6.6; keeps cell click → focus/edit semantics untouched. Drag handle's Shift/Cmd/Ctrl + click is the new affordance; plain click stays for drag activation (already gated by PointerSensor delay:150 + tolerance:5). | Cell editing flow unchanged from v50-05-01/02; selection lives at row level above the cell editor state machine. |
| Toolbar at selection size ≥ 2 (per spec) | ARCHITECTURE.md §6.6 says "When 2+ rows selected"; single-row selection still shows aria-pressed for visual consistency but no toolbar UI. | Reduces UI noise for single-row workflows; bulk-edit affordance only when bulk is meaningful. |
| extendRange REPLACES selection (Sheets convention) | Spec text "Shift+Click row drag handle: extend selection to range" reads as inclusive-range overwrite, not additive union. Matches Google Sheets / Excel / VS Code convention. | Tested explicitly: prior selection wiped on Shift-click; user can rebuild via Cmd-clicks if additive is needed. |
| Anchor moves with each toggle | Subsequent Shift-clicks should extend from the most recent toggle, not a fixed start. Matches Sheets convention where the latest toggle becomes the new anchor. | extendRange falls back to single-select when anchor is null (first interaction is Shift-click); pruneTo nulls anchor when the anchored id is remote-deleted. |
| Selection PRESERVED across bulk-set; CLEARED on bulk-delete | Bulk-set is iterative ("now change Key, now change Lead"); bulk-delete is terminal. Tested explicitly. | User can change multiple fields on the same selection without re-selecting; bulk-delete naturally exits the selection mode. |
| Bulk propagation: per UNIQUE songId | The v50-04 helper writes to the song-defaults document; same songId → one write per song. Rows without songId skip propagation. | Same lead-musician change to 5 rows of 3 different songs = 3 propagation calls, not 5; rows without songId don't pollute song-defaults with bind-less data. |
| BatchActionBar V1 = Type / Key / Lead / Delete (drop BPM) | ARCHITECTURE.md §6.6 mockup shows Type+Lead+Delete; spec text says "key/lead/bpm". Chose superset minus BPM (rare bulk action). | Toolbar UI fits in one row at standard widths; future polish can add BPM if user demands; pattern is open. |
| KEY_OPTIONS_DATA + TYPE_OPTIONS exported from cell files | Cells own the canonical list; toolbar reuses via import. Lighter than extracting to a shared `cell-options.ts` module. | Single source of truth without an extra file; future bulk affordances follow the same pattern; extraction can happen later if a third caller appears. |
| DeleteConfirmProvider via React context (not render-prop) | Page.tsx is a Server Component; render-prop children would hit serialization boundary. Context wraps cleanly: server renders `<Provider><Hydrator/></Provider>` → client provider mounts dialog → consumers read via hook. | Provider can mount the AlertDialog itself; SetlistGrid prop contract stays minimal for tests; production gets themed dialog automatically. |
| Cancel-and-replace (not queue) for double-confirm | Predictable behavior for the rare case where two confirms fire concurrently. Queueing adds complexity for an edge case. | Tested explicitly: opening confirm B while A is open resolves A as false; B becomes the active dialog. Future queueing reserved if double-confirm flows surface in real usage. |
| ConfirmInfo discriminated union (`{kind:'row',title}` \| `{kind:'bulk',count}`) | Avoids string-parsing "N rows" back out of a synthesized title. Dialog can render correct copy (singular/plural) directly from the typed payload. | New `confirmDelete?: (info: ConfirmInfo) => Promise<boolean>` prop on SetlistGridProps; legacy `confirmDeleteWithTitle?` stays as back-compat alias for v50-05-01/02 tests; precedence prop → prop → context → window.confirm. |
| useDeleteConfirmOptional returns null when unmounted | SetlistGrid still renders without provider in test contexts (selection/edit/dnd tests inject `confirmDeleteWithTitle` directly). useDeleteConfirm (throws) for production code that requires the dialog. | Both tests AND production work; precedence inside SetlistGrid resolves to the right path automatically. |
| pruneTo added to useGridSelection beyond original PLAN | PLAN said "clear-and-rebuild on stale rows"; pruneTo is cleaner — surgically removes stale ids while preserving survivors and a still-valid anchor. | Test case verifies: 3 selected, remote-delete the middle row, survivors stay selected, anchor preserved. Pattern carries to v50-05-05 mobile + v50-06 reconciliation. |
| Aria override placement AFTER `{...attributes}` spread | useSortable.attributes injects its own `aria-pressed` for drag state. Spreading after our app-level aria-pressed silently overrode it (test failure: aria-pressed=null despite correct selection state). | Documented in DragHandleCell + commit `e26626c` body; pattern: any future drag-kit-wrapped element with custom aria semantics MUST place overrides after the spread. |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | dnd-kit aria-pressed override discovery (root-caused via test failure; fixed in-place) |
| Scope additions | 1 | `pruneTo` method added to useGridSelection beyond original PLAN |
| Deferred | 0 | Plan executed end-to-end; no items punted from this plan to a later one |

**Total impact:** Both deviations strengthened the implementation — pruneTo is the correct shape for stale-row handling (PLAN's "clear-and-rebuild" was simpler but lossy), and the aria-pressed override fix is a one-time pattern lesson now documented. No scope creep.

### Auto-fixed Issues

**1. dnd-kit aria-pressed injection silently overrode multi-select aria-pressed**
- **Found during:** Task 1 first integration-test run — 5 of 6 selection tests failed with `aria-pressed=null` even though the selection state was provably correct (plain-click test passed; toggle path itself was working).
- **Issue:** `useSortable.attributes` returns `{ role, tabIndex, 'aria-pressed', 'aria-roledescription', 'aria-describedby' }`. The DragHandleCell button had `aria-pressed={isSelected ? true : undefined}` placed BEFORE `{...attributes}` was spread, so dnd-kit's drag-state aria-pressed always overrode the multi-select signal at runtime.
- **Fix:** Moved `aria-pressed`, `aria-label`, `onKeyDown`, and `onClick` to AFTER `{...attributes}` and `{...listeners}` spreads. Added an inline comment explaining the override-after-spread rule for future maintainers.
- **Files:** src/components/setlist/grid/cells/DragHandleCell.tsx
- **Verification:** All 6 selection tests went from red to green in one re-run; full grid suite stayed at 70/70.
- **Commit:** Bundled into Task 1 (`e26626c`) — root-caused + fixed in the same commit since the test failure was the discovery surface.

### Scope Additions

**1. `pruneTo(validIds)` method added to useGridSelection**
- **Reason:** PLAN's stale-row handling sketch was "clear-and-rebuild" via toggle in a loop. That pattern (a) mutates state during iteration, (b) clobbers anchor unconditionally, (c) is lossy when only one of three rows is stale. pruneTo intersects current selection with valid set, preserves survivors, nulls anchor only if anchor itself is stale.
- **Implementation:** Added to GridSelection interface, useGridSelection hook, and tested with 2 dedicated cases (survivors preserved + anchor preservation; anchor nulled when stale).
- **Impact:** Cleaner SetlistGrid stale-prune useEffect; clearer contract for future selection consumers (v50-05-04 ContextMenu, v50-05-05 mobile flow). PLAN had no objection — this is the same intent, better-shaped.

### Deferred Items

None — plan executed exactly as written; the polish split (04 + 05) was already locked into ROADMAP at PLAN time and is not a deferral from THIS plan.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| 5 selection integration tests failed with `aria-pressed=null` despite state being correct | Root-caused to dnd-kit `useSortable.attributes` injecting its own aria-pressed; fixed by moving app-level aria-pressed AFTER the `{...attributes}` spread (see Auto-fix #1) |
| `act()` warning in stale-row prune test (Dexie delete outside act wrapper) | Wrapped `await getDb().tracks.delete('t-1')` in `await act(async () => { ... })` so live-query → React re-render path is observable to testing-library |
| Build script auto-bumped `package.json` version on `npm run build` | Discarded with `git checkout -- package.json src/build-info.json` per v50-04 / v50-05-01 / v50-05-02 close convention |
| Sentry deprecation warning during `next build` (`onRequestError` hook) | Pre-existing; cosmetic; deferred (in STATE.md outstanding list as "Sentry deprecation: sentry.client.config.ts → instrumentation-client.ts rename") |

## Next Phase Readiness

**Ready:**
- v50-05-04 (iPad / pointer-coarse Sheet swap + ContextMenu): selection state + drag-handle modifier-click + BatchActionBar all already mounted on prod. ContextMenu wiring (Radix ContextMenu on rows + drag handle) extends the same `useGridSelection` hook and the same row.id model. iPad swap target is the inline `BulkPopover` in BatchActionBar plus the cell-level `DropdownCell` Popover — both swap to Radix `Sheet` on `useMediaQuery('(pointer: coarse)')`.
- v50-05-05 (mobile + WCAG AA + Undo): selection state survives across the parallel mobile render path naturally (it's grid-level, not table-level); Undo via zustand temporal middleware intercepts BEFORE applyEdit at the same fanout point as bulk-set + bulk-delete; WCAG AA audit can leverage the existing aria-live / aria-pressed / focus-trap infrastructure already in place. Stacked-card mobile flow can mount the same DeleteConfirmProvider — the dialog is route-level, render-path-agnostic.
- v50-06 (concurrent-edit safety): DeleteConfirmProvider's pattern (Radix dialog + context + Promise-based imperative API + cancel-and-replace) is the template for the §6.9 reconciliation modal. ConfirmInfo's discriminated-union shape is the template for the modal's per-conflict payload.

**Concerns:**
- **dnd-kit attribute-override ordering** is a one-time discovery — but any future cell or row affordance that wraps a drag-kit element MUST place app-level ARIA after the spread. Pattern documented in DragHandleCell comment + this SUMMARY.
- **Cross-tab-lock test flake remains** (1359/1360) — not a regression, deferred to v50-06 per established precedent. v50-06 needs to root-cause this before shipping concurrent-edit safety because the same lock primitive is the substrate.
- **Production smoke verification** of v50-05-03 polish on prod still pending (toolbar appears + bulk-set Dm + AlertDialog UX). User said v50-05-02 smoke deferred to "later"; v50-05-03 should be added to the same backlog item once the user runs verification.
- **Production migrate-v50.ts apply** still deferred to v50-07 — split-brain (legacy embedded `setlists/{id}.tracks[]` + new top-level `tracks/{id}` docs) becomes more pronounced now that bulk-edit is shipping more writes per session. Not blocking v50-05-04/05; remains a v50-07 imperative.
- **Orphan `useBatchSelection` hook** (left over from v50-05-02 amputation, no consumers) — out of scope for this plan but should land in a future dep-cleanup pass alongside `openai` npm dep + `template-parser.ts` orphans (v50-02 deferred).

**Blockers:** None for v50-05-04. Production smoke verification of both v50-05-02 and v50-05-03 still pending from user (deferred, not blocking UNIFY).

---
*Phase: v50-05-spreadsheet-editor, Plan: 03*
*Completed: 2026-04-26*
