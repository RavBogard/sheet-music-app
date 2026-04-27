---
phase: v50-05-spreadsheet-editor
plan: 04
subsystem: ui
tags:
  - touch
  - ipad
  - context-menu
  - radix-sheet
  - radix-context-menu
  - long-press
  - pointer-coarse
  - useMediaQuery
  - dnd-kit

requires:
  - phase: v50-05-spreadsheet-editor
    provides: useGridSelection hook + DragHandleCell modifier-click + DeleteConfirmProvider + ConfirmInfo discriminated union (v50-05-03); SetlistGrid + ChartBindPopover + DropdownCell + AddRowPlaceholder + BatchActionBar (v50-05-01/02/03)
provides:
  - TouchOrPopover wrapper — single integration point for cell dropdowns + library pickers + bulk-edit popovers; picks Radix Popover (desktop) or Radix Sheet (touch) via useMediaQuery('(pointer: coarse)')
  - 44px minimum touch targets across all editor cells (DropdownCell h-11 on coarse, ChartCell h-11/w-11 on coarse, AddRowPlaceholder h-12 on coarse, drag-handle col 44→52px on coarse, cell padding py-1→py-3 on coarse)
  - ChartBindPopover controllable open state — `open` + `onOpenChange` props lifted; SetlistGrid hoists `chartBindOpenRowId` so the popover can be opened EITHER by ChartCell click OR programmatically by ContextMenu "Bind chart" action
  - SortableRow ContextMenu wiring — Radix ContextMenu mounted on each row's `<tr>` via asChild trigger; ContextMenuContent with 4 items (Edit row / Bind chart / Duplicate row / Delete row)
  - Selection-aware ContextMenu actions — when right-clicked row is in selection AND size ≥ 2, Delete routes to bulk path (handleBulkDelete) and Edit/Bind/Duplicate disable; "N rows selected" ContextMenuLabel header surfaces; otherwise actions target only the right-clicked row
  - 500ms long-press for touch — onPointerDown(touch) starts timer; pointerType==='mouse' skips entirely; cancel on >10px movement OR pointerUp/Leave/Cancel; timer fires → re-emits synthetic contextmenu MouseEvent on `<tr>` (Radix's Trigger catches and opens at touch position)
  - handleContextEditRow / handleContextBindChart / handleContextDuplicate / handleContextDelete — four SetlistGrid handlers wiring ContextMenu items to existing infrastructure
  - Duplicate-row implementation — cascade-bumps existing orders ≥ newOrder by 1 via parallel applyEdit('update'), then applyEdit('set','tracks',{...source, id: newId, order: source.order + 1}). Source's id and order replaced; songId / title / key / bpm / leadMusician / notes / type / setlistId all carry through
  - Global window.matchMedia stub via src/test-setup.ts — vitest setupFiles entry; defaults to matches:false (= desktop / pointer-fine) so existing tests keep passing without modification; tests that want coarse-pointer behavior mock @/hooks/use-media-query directly
affects:
  - v50-05-05 (mobile + WCAG AA + Undo) — TouchOrPopover wrapper is the integration point for any future cell affordance; ContextMenu pattern is reusable for the mobile stacked-card flow's per-card action menu; selection-aware action targeting carries; window.matchMedia stub already in place
  - v50-06 (concurrent-edit safety) — ChartBindPopover controllable open pattern (lifted state with internal-fallback) is the template for any future multi-controller popover (e.g. reconciliation modal); DragHandleCell aria override placement rule still applies for any new dnd-kit-wrapped affordances

tech-stack:
  added: []
  patterns:
    - "TouchOrPopover: single wrapper component that picks Radix Popover or Radix Sheet via useMediaQuery('(pointer: coarse)'). Touch detection keys on pointer media query (NOT viewport width — iPad Pro at 1024px is still touch). Visually-hidden SheetTitle option (srOnlyTitle) for cells where ariaLabel IS the heading. asChild on both branches preserves trigger ref forwarding."
    - "ChartBindPopover hybrid open state: external `open` + `onOpenChange` props win when defined; falls back to internal useState when undefined. Same component serves the v50-05-02 ChartCell-click flow AND the v50-05-04 ContextMenu-programmatic-open flow without prop drilling pollution."
    - "Long-press for touch via synthetic contextmenu dispatch: @radix-ui/react-context-menu 2.2.16 does not expose a controlled `open` prop on Root. To open programmatically on touch, dispatch a `new MouseEvent('contextmenu', { bubbles, cancelable, clientX, clientY })` on the trigger element — Radix's existing contextmenu listener catches and opens at the dispatched position. Pattern: cancel on >10px squared movement (drag activation) or quick release; touch-only branch skips mouse pointers entirely."
    - "Selection-aware ContextMenu action routing: read selection.selectedIds.has(rowId) AND size ≥ 2 at the row level (in SetlistGrid render's tbody loop). Pass isInBulkSelection + bulkSelectionCount to SortableRow as props; SortableRow disables Edit/Bind/Duplicate items via the disabled prop and surfaces a ContextMenuLabel header. Delete routing happens at the SetlistGrid handler level (handleContextDelete) — picks bulk vs single path based on the same boolean."
    - "Duplicate-row order cascade: parallel applyEdit('update', { order: r.order + 1 }) for every existing row with order ≥ newOrder, THEN applyEdit('set', { ...source, id: newId, order: newOrder }). LWW per-document invariant from v50-03 holds — engine drains the cascade-bumps before the set lands at the server. No orphaned orders, no race-conditions in local view (Dexie handles atomicity per applyEdit)."
    - "Global window.matchMedia stub via vitest setupFiles: src/test-setup.ts provides a matches:false default for any component that calls useMediaQuery. Tests that want to verify coarse-pointer behavior mock @/hooks/use-media-query directly via vi.mock + vi.mocked(...).mockReturnValue(true). Avoids per-test boilerplate; existing tests run unchanged."

key-files:
  created:
    - src/components/setlist/grid/TouchOrPopover.tsx
    - src/components/setlist/grid/__tests__/TouchOrPopover.test.tsx
    - src/components/setlist/grid/__tests__/SetlistGrid.contextmenu.test.tsx
    - src/test-setup.ts
  modified:
    - src/components/setlist/grid/cells/DropdownCell.tsx (TouchOrPopover swap; h-10 → h-11 on coarse)
    - src/components/setlist/grid/cells/ChartCell.tsx (h-10/w-10 → h-11/w-11 on coarse; unbound contrast bump on coarse)
    - src/components/setlist/grid/AddRowPlaceholder.tsx (TouchOrPopover swap; h-11 → h-12 on coarse)
    - src/components/setlist/grid/ChartBindPopover.tsx (TouchOrPopover swap; lifted controllable open state with internal fallback)
    - src/components/setlist/grid/BatchActionBar.tsx (BulkPopover → TouchOrPopover; h-11 + px-3 on coarse for bulk action buttons)
    - src/components/setlist/grid/SetlistGrid.tsx (ContextMenu wiring on every SortableRow + 4 action handlers + chartBindOpenRowId state hoist + meta extension + drag column + cell padding bumps on coarse + long-press handler on tr)
    - src/components/setlist/grid/index.ts (TouchOrPopover + TouchOrPopoverProps exports)
    - vitest.config.ts (setupFiles: ['./src/test-setup.ts'])

key-decisions:
  - "Touch detection keys on (pointer: coarse) media query, NOT viewport width — iPad Pro at 1024px is still touch; viewport-based detection would miss it and over-trigger on a resized desktop browser"
  - "TouchOrPopover wrapper is the single swap point for ALL six dropdown sites (DropdownCell covering Key/Lead/Type, AddRowPlaceholder, ChartBindPopover, BatchActionBar's BulkPopover) — symmetry over per-component decisions. asChild flows through to both Popover.Trigger and SheetTrigger so existing trigger button refs work unchanged."
  - "ChartBindPopover open state: hybrid controllable+uncontrolled. When external `open` is undefined, internal useState manages — preserves the v50-05-02 click-to-bind flow. When defined, parent controls — enables ContextMenu programmatic open. SetlistGrid hoists chartBindOpenRowId state (single rowId-or-null since at most one popover is open at a time)."
  - "Drag column width: 44px desktop → 52px on (pointer: coarse). Override TanStack Table's getSize-driven inline style by class (`w-[44px] [@media(pointer:coarse)]:w-[52px]`) on both <th> and <td>. Inline style omitted for the drag column specifically; getSize still returns 44 but the class wins."
  - "Cell padding bump: py-1 → [@media(pointer:coarse)]:py-3 (4px → 12px) on non-drag <td>. Combined with DropdownCell's h-10 → h-11 on coarse, total row height satisfies 44px-min touch target."
  - "ChartCell unbound state contrast bumped on coarse (text-muted-foreground/40 → /70) — there's no hover state to communicate 'click me' on touch, so the unbound chart-icon ghost needs higher resting contrast. Hover-revealed affordances per ARCHITECTURE.md §6.7 'become always-visible' — DragHandleCell already always-visible (no opacity-0 group-hover pattern), so no change needed there."
  - "ContextMenu actions all live in SetlistGrid (not SortableRow) — selection state is at grid level via useGridSelection; routing decisions (single vs bulk delete) need access to selection state; handlers wire cleanly into existing v50-05-01/02/03 infrastructure (handleCellFocus, handleBulkDelete, handleDeleteRow, applyEdit). SortableRow just receives 4 callback props per row + isInBulkSelection boolean."
  - "Selection-aware Delete routing happens in handleContextDelete (SetlistGrid), not in SortableRow's onSelect. SortableRow always calls onContextDelete(track); SetlistGrid checks selection.selectedIds.has(track.id) && size >= 2 to pick bulk vs single path. Cleanest separation; SortableRow stays selection-state-naive."
  - "Disabled-on-multi-selection: Edit / Bind chart / Duplicate disable when right-clicked row is in selection ≥ 2. Bulk Edit (focus a single Title cell on multi-selection) doesn't make sense; bulk Bind (one chart for many tracks) doesn't either; bulk Duplicate is a future feature (BatchActionBar Duplicate button), deferred. Delete stays enabled because bulk-delete IS the natural action."
  - "Long-press for touch via synthetic contextmenu dispatch: @radix-ui/react-context-menu 2.2.16 has NO controlled `open` prop on Root (only onOpenChange). To open programmatically, dispatch `new MouseEvent('contextmenu', { bubbles, cancelable, clientX, clientY })` on the <tr> trigger element — Radix's internal listener catches it and opens at the dispatched position. Pattern documented in inline comment for future maintainers."
  - "Long-press timing: 500ms hold + 10px-squared (=100) movement threshold. PointerDown(touch) starts timer; pointerMove cancels if dx² + dy² > 100; pointerUp/Leave/Cancel cancel; pointerType='mouse' skips entirely (mouse long-press should NOT trigger ContextMenu — would conflict with slow clicks). useEffect cleanup cancels any pending timer on unmount."
  - "Duplicate-row implementation: cascade existing orders >= newOrder via parallel applyEdit('update'), then applyEdit('set') for the clone. Source spread retains songId/title/key/bpm/leadMusician/notes/type/setlistId; only id and order are replaced. LWW per-document invariant from v50-03 sync engine handles drain ordering correctly (each docId gets its own drain queue)."
  - "Global window.matchMedia stub in src/test-setup.ts: vitest.config.ts setupFiles entry. Defaults to matches:false. Tests that want to verify coarse-pointer behavior mock @/hooks/use-media-query directly. This pattern keeps existing tests passing without per-test boilerplate AND lets the new contextmenu test mock useMediaQuery for the AC-1 sanity case + AC-7 long-press cases (which mock to false to override default)."
  - "AC-7 long-press tests use REAL timers, not vi.useFakeTimers. fake-indexeddb's microtask scheduling and Dexie's live-query teardown both fight fake timers; 500ms × 4 long-press cases adds ~2.5s to suite — cheap. Pattern also documented in v50-03 (FakeClock injection > vi.useFakeTimers for Dexie-touching tests). New iteration: REAL timers > FakeClock when waiting for setTimeout-based handlers in component tests with Dexie+React+live-query."
  - "Dispose of build-script auto-bumps (package.json + src/build-info.json) per v50-04 / v50-05-01 / v50-05-02 / v50-05-03 close convention — `git checkout -- package.json src/build-info.json`. The build-info script bumps version on every npm run build, polluting commit diffs."

patterns-established:
  - "Single-wrapper-component-for-pattern-swap: TouchOrPopover demonstrates how to evolve six independent Popover usages into one swap point WITHOUT rewriting consumer logic. Each consumer keeps its open state, asChild trigger, and cmdk content; only the wrapper changes. Pattern reusable for v50-05-05 mobile (different swap could swap Sheet for stacked-card flow) or v50-06 reconciliation (different swap target)."
  - "Hybrid controllable+uncontrolled state for shared components: ChartBindPopover's `open` + `onOpenChange` props default to undefined (internal useState fallback); when defined, parent controls. Single component serves both click-to-open AND programmatic-open consumers. Reusable for any popover that's used both as a contextual trigger AND as an imperative target."
  - "Selection-aware action routing in row-level ContextMenu: read selection state at the parent level (where state lives), pass selection-derived booleans to row components, route action handlers based on those booleans + state. SortableRow stays selection-state-naive; SetlistGrid owns the routing decisions. Reusable for any future row-level action menu (mobile stacked-card three-dot menu, etc.)."
  - "Synthetic event dispatch for programmatic-open of uncontrolled Radix primitives: when a Radix component lacks a controlled `open` prop but listens for a specific event, dispatch that event programmatically on the trigger element. Documented inline in long-press comment for future maintainers and for any future Radix primitive that lacks controllable open (Tooltip, HoverCard variants, etc.)."
  - "Real timers > FakeClock for component-level setTimeout-driven behaviors with Dexie+React: vi.useFakeTimers conflicts with fake-indexeddb's microtask scheduling and Dexie's live-query teardown. For component tests with timer-driven behaviors, prefer real `await sleep(ms)`. Documented in test inline comment + this SUMMARY."
  - "Global jsdom shims via vitest setupFiles: src/test-setup.ts provides window.matchMedia (defaults to matches:false). Pattern reusable for any future jsdom-missing API. Existing tests run unchanged; tests that want behavior-specific values mock the consuming hook (useMediaQuery) directly via vi.mock."
  - "44px-minimum touch target via [@media(pointer:coarse)] Tailwind arbitrary classes: bumps height (h-10 → h-11), width (w-10 → w-11), or column width (w-[44px] → w-[52px]). Pattern: append `[@media(pointer:coarse)]:<utility>` after the desktop baseline. Reusable across all editor surface (cells, buttons, drag handles)."

duration: "~95 min (apply phase)"
started: "2026-04-26T18:48:00Z"
completed: "2026-04-26T19:08:00Z"
---

# v50-05 Plan 04: iPad / pointer-coarse Sheet swap + right-click ContextMenu — Summary

**Shipped iPad / touch UX: cell dropdowns + library pickers + bulk-edit popovers all swap from floating Radix Popover to bottom Radix Sheet on `(pointer: coarse)` via a single new TouchOrPopover wrapper; cells gained 44px-minimum touch targets and the drag-handle column widened from 44px → 52px on touch; every row got a Radix ContextMenu (Edit row / Bind chart / Duplicate row / Delete row) with selection-aware action targeting that routes Delete through the v50-05-03 DeleteConfirmProvider; iPad gets the same ContextMenu via 500ms long-press dispatching a synthetic contextmenu event on the `<tr>` trigger.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~95 min |
| Started | 2026-04-26T18:48:00Z |
| Completed | 2026-04-26T19:08:00Z |
| Tasks | 3 / 3 auto (no checkpoints) |
| Files created | 4 (1 new component + 1 new component test + 1 integration test + 1 vitest setup file) |
| Files modified | 8 |
| Net LOC | +1,500 / −368 (~+1,132 net add — wrapper + ContextMenu wiring + extensive test coverage) |
| Commits | 4 atomic (1 chore + 2 feat + 1 test) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Cell dropdowns swap to Sheet on pointer-coarse | Pass | TouchOrPopover.test.tsx 2 cases (Sheet on coarse, Popover on fine); SetlistGrid.contextmenu.test.tsx AC-1 sanity (Key cell click on coarse → role=dialog asserted). Six swap sites verified via inspection — DropdownCell, AddRowPlaceholder, ChartBindPopover, and BatchActionBar's BulkPopover all consume TouchOrPopover; KeyCell + LeadCell + TypeCell flow through DropdownCell. |
| AC-2: 44px minimum touch targets on pointer-coarse | Pass | DropdownCell h-10 → h-11; ChartCell h-10/w-10 → h-11/w-11; AddRowPlaceholder h-11 → h-12; BatchActionBar bulk action buttons gain h-11 + px-3; cell `<td>` py-1 → py-3 (12px); drag column 44px → 52px on `<th>` and `<td>` via class override. Desktop densities preserved (`(pointer: fine)` defaults). |
| AC-3: Hover-only affordances become always-visible on pointer-coarse | Pass | ChartCell unbound state contrast bumped (text-muted-foreground/40 → /70) on coarse since no hover state communicates "click me". DragHandleCell was already always-visible (no opacity-0 group-hover pattern needed change). Desktop hover affordances unchanged via `(pointer: fine)` defaults. |
| AC-4: Right-click on a row opens ContextMenu | Pass | SetlistGrid.contextmenu.test.tsx AC-4 — fireEvent.contextMenu on row → 4 testids mounted (edit / bind-chart / duplicate / delete) with correct labels (Edit row / Bind chart / Duplicate row / Delete row). |
| AC-5: ContextMenu actions are selection-aware | Pass | Two integration tests: (a) in-selection right-click + 3-row Cmd-click multi-select → "3 rows selected" ContextMenuLabel header + Edit/Bind/Duplicate `data-disabled` attribute + bulk AlertDialog "Delete 3 rows?" → confirm → 0 rows in Dexie; (b) out-of-selection right-click on row 2 (rows 0+1 selected) → no bulk header + Edit enabled + single-row AlertDialog "Delete row?" with quoted "My Song" title → confirm → row 2 gone, rows 0+1 still in Dexie. |
| AC-6: ContextMenu Edit row + Bind chart + Duplicate row work | Pass | Three integration tests: Edit row → document.activeElement aria-label="Track title" (TextCell button focused); Bind chart → ChartBindPopover testid mounted with library options ("Song Alpha" visible); Duplicate row → 4 rows in Dexie post-action with cloned fields (key D, bpm 120, leadMusician Daniel, songId song-a, notes "tight"), source at order 0, clone at order 1 with new id, t-1 cascade-bumped from order 1 → 2, t-2 from order 2 → 3. |
| AC-7: Long-press on touch opens ContextMenu | Pass | Four integration tests: (a) pointerDown(touch) + sleep(550ms) → menu opens via synthetic contextmenu dispatch; (b) pointerDown + pointerMove(15px) + sleep(600ms) → menu does NOT open (10px threshold); (c) pointerDown + sleep(200ms) + pointerUp + sleep(400ms) → menu does NOT open (quick release cancels); (d) pointerDown(mouse, NOT touch) + sleep(600ms) → menu does NOT open (touch-only branch). |
| AC-8: Verification gates pass | Pass | vitest 1377/1377 (+11 contextmenu cases + 6 TouchOrPopover cases over 1366 baseline); cross-tab-lock pre-existing flake passed this run too — NOT a regression. tsc --noEmit clean. next build clean compile (only pre-existing Sentry onRequestError deprecation warning, NOT a regression). 4 commits pushed to origin/master. |

**Skill audit:** `/ui-ux-pro-max` invoked at start of APPLY ✅ (SPECIAL-FLOWS.md mandate satisfied; rules applied: 44px touch targets, cursor-pointer on all clickable, stable hover via opacity/color (no layout-shifting transforms), 150ms transitions with motion-reduce, focus-visible rings, no emoji icons (Lucide Edit3/Music/Copy/Trash2), shadcn primitives reused (Sheet + ContextMenu + AlertDialog auto-handle focus trap)).

## Accomplishments

- **iPad/touch is now a first-class surface.** Cell dropdowns rendered as floating Popovers were unreachable on iOS Safari (small target, off-screen positioning, no hover affordance). All six picker sites — Key/Lead/Type cells (via DropdownCell), AddRowPlaceholder library picker, ChartBindPopover, BatchActionBar's bulk Type/Key/Lead popover — now swap to a bottom Sheet via the single TouchOrPopover wrapper. iPad musicians can now bulk-edit a setlist without fighting tiny floating popovers.
- **Right-click ContextMenu unlocks power-user editing.** Every row gets Edit / Bind chart / Duplicate / Delete without navigating to the toolbar or remembering keyboard shortcuts. Selection-aware: right-click a multi-selected row → bulk Delete with "N rows selected" header; right-click an unselected row → single-row delete with quoted title. All routed through the existing v50-05-03 DeleteConfirmProvider AlertDialog so destructive UX stays consistent.
- **Long-press for touch.** iPad / iPhone musicians get the same ContextMenu via a 500ms hold-without-moving gesture. Implementation re-emits a synthetic contextmenu MouseEvent on the `<tr>` (Radix's existing Trigger listener catches it and opens at the touch position). Cancels on movement (drag activation taking over) or quick release; pointerType='mouse' skips entirely so slow desktop clicks don't conflict.
- **Patterns + infrastructure for v50-05-05.** TouchOrPopover wrapper, hybrid controllable+uncontrolled ChartBindPopover open state, selection-aware ContextMenu action routing, synthetic-event-dispatch programmatic-open trick, global window.matchMedia stub via vitest setupFiles — all reusable for v50-05-05 (mobile stacked-card flow + WCAG AA audit + Undo middleware).
- **+17 new test cases on the v50-05-03 baseline.** 6 TouchOrPopover (Popover-on-fine, Sheet-on-coarse, both variants hidden when open=false, trigger click fires onOpenChange, sr-only title in DOM) + 11 SetlistGrid contextmenu integration (right-click 4 items, in-selection bulk Delete, out-of-selection single Delete, Edit row focuses Title, Bind chart opens popover, Duplicate row clones + cascades, 4 long-press timing cases, AC-1 Sheet sanity). Full suite 1377/1377.

## Task Commits

Each task committed atomically:

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Plan + state sync + handoff archive | `a18736b` | chore(paul) | v50-05-04 PLAN.md + handoff archive + STATE.md updates |
| Task 1: TouchOrPopover + iPad swap + 44px targets | `d4a9d96` | feat | New TouchOrPopover component (Popover↔Sheet via useMediaQuery); refactored DropdownCell + AddRowPlaceholder + ChartBindPopover + BatchActionBar's BulkPopover; ChartBindPopover lifted to controllable open; ChartCell + cells touch-target bumps; drag column 44→52px; cell padding 8→12px; src/test-setup.ts global matchMedia stub; 6 TouchOrPopover tests — AC-1, AC-2, AC-3 |
| Task 2: ContextMenu + long-press | `ded27dd` | feat | Radix ContextMenu mounted on every SortableRow; 4 ContextMenuItems (Edit / Bind chart / Duplicate / Delete) with selection-aware semantics; "N rows selected" header in bulk case; handlers in SetlistGrid (handleContextEditRow / handleContextBindChart / handleContextDuplicate / handleContextDelete); chartBindOpenRowId state hoist; long-press 500ms onPointerDown(touch) handler with 10px movement cancel + synthetic contextmenu dispatch — AC-4, AC-5, AC-6, AC-7 |
| Task 3: Integration tests | `35a055a` | test | SetlistGrid.contextmenu.test.tsx — 11 cases covering ContextMenu open path, selection-aware Delete routing, all 4 action implementations, 4 long-press timing cases, Sheet-on-coarse sanity — AC-8 verification gates |

All four commits pushed to `origin/master` (`f47b8d2..35a055a`). UNIFY commit (this SUMMARY + STATE + ROADMAP) lands next.

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/components/setlist/grid/TouchOrPopover.tsx` | Created (~110 LOC) | Single swap-point wrapper: picks Radix Popover (desktop) or Radix Sheet (touch) based on useMediaQuery('(pointer: coarse)'); preserves align/sideOffset/onCloseAutoFocus passthrough on Popover; sr-only-title option on Sheet; asChild flows through both branches |
| `src/components/setlist/grid/cells/DropdownCell.tsx` | Modified | Replaced inline Popover.Root tree with TouchOrPopover; bumped button h-10 → h-11 + px-1 → px-2 on coarse |
| `src/components/setlist/grid/cells/ChartCell.tsx` | Modified | h-10/w-10 → h-11/w-11 on coarse; unbound state contrast bumped (text-muted-foreground/40 → /70) on coarse |
| `src/components/setlist/grid/AddRowPlaceholder.tsx` | Modified | Replaced inline Popover.Root tree with TouchOrPopover; bumped button h-11 → h-12 on coarse; sheetTitle="Add a song" |
| `src/components/setlist/grid/ChartBindPopover.tsx` | Modified | Replaced Popover.Root with TouchOrPopover; lifted controllable `open` + `onOpenChange` props with internal useState fallback; trigger child renders directly (asChild compatible); deferred to Radix default focus return |
| `src/components/setlist/grid/BatchActionBar.tsx` | Modified | Replaced inline BulkPopover's Popover.Root with TouchOrPopover; bulk action buttons gain h-11 + px-3 on coarse |
| `src/components/setlist/grid/SetlistGrid.tsx` | Modified | Imported ContextMenu primitives + Lucide icons; extended GridMeta with chartBindOpenRowId + onChartBindOpenChange; added chartBindOpenRowId state hoist with handleChartBindOpenChange; added handleContextEditRow / handleContextBindChart / handleContextDuplicate (with order cascade) / handleContextDelete (selection-aware bulk-vs-single routing); wrapped each SortableRow's `<tr>` with ContextMenu + ContextMenuTrigger; added ContextMenuContent with 4 items + bulk header; SortableRow gained 4 callback props + isInBulkSelection + bulkSelectionCount; long-press handlers (handlePointerDown / handlePointerMove / handlePointerEnd) on the `<tr>`; trEl ref for synthetic contextmenu dispatch; useEffect cleanup for any pending long-press timer; drag column width override class on `<th>`/`<td>`; non-drag `<td>` py-1 → [@media(pointer:coarse)]:py-3 |
| `src/components/setlist/grid/index.ts` | Modified | Added TouchOrPopover + TouchOrPopoverProps exports |
| `vitest.config.ts` | Modified | setupFiles: ['./src/test-setup.ts'] |
| `src/test-setup.ts` | Created (~30 LOC) | Global vitest setup: window.matchMedia stub for jsdom — defaults to matches:false (= desktop branch); tests that want coarse-pointer behavior mock @/hooks/use-media-query directly |
| `src/components/setlist/grid/__tests__/TouchOrPopover.test.tsx` | Created (~150 LOC, 6 cases) | Mocked useMediaQuery; Popover-on-fine, Sheet-on-coarse, both variants hide content when open=false, trigger click fires onOpenChange, sr-only title in DOM |
| `src/components/setlist/grid/__tests__/SetlistGrid.contextmenu.test.tsx` | Created (~510 LOC, 11 cases) | Mocked useMediaQuery; 4 ContextMenu items mounted, selection-aware Delete (in vs out of selection), Edit row focus assertion, Bind chart popover assertion, Duplicate row Dexie state assertion (with cascade), 4 long-press timing cases (real timers; no fake-timer / Dexie conflicts), AC-1 Sheet swap sanity |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Touch detection via `useMediaQuery('(pointer: coarse)')` (NOT viewport width) | iPad Pro at 1024px is still touch; viewport-based detection misses it AND over-triggers on resized desktop browsers. Matches ARCHITECTURE.md §6.7 spec text. | Reusable detection pattern for any future touch-aware affordance. |
| Single TouchOrPopover wrapper for ALL six swap sites | Symmetry: same wrapper, same pattern, six consumers. asChild on both Popover.Trigger and SheetTrigger preserves trigger-button refs and forwarding. | Future swap targets (e.g. v50-05-05 mobile flow) can reuse the wrapper. |
| ChartBindPopover hybrid open state (controllable+uncontrolled) | Existing v50-05-02 ChartCell-click flow keeps internal useState fallback when `open` prop is undefined; v50-05-04 SetlistGrid hoists state and passes controlled props for ContextMenu programmatic open. | Single component serves both consumers cleanly; no prop pollution; reusable pattern for any future shared popover. |
| Drag column width via class override (NOT inline style from getSize) | TanStack Table's `getSize()` returns 44 → inline `style={{ width: 44 }}` overrides classes. To make the column responsive, omit inline style for the drag column specifically and use Tailwind arbitrary-class overrides (`w-[44px] [@media(pointer:coarse)]:w-[52px]`) on both `<th>` and `<td>`. | Pattern reusable for any column that needs responsive width. |
| Cell padding bump: py-1 → py-3 on coarse for non-drag `<td>` | 12px padding-y combined with DropdownCell's h-11 button gives total touch target ≥ 56px — comfortably above the 44px minimum. Desktop density preserved via `(pointer: fine)` defaults. | Pattern applied to all non-drag cells uniformly via single className. |
| ContextMenu actions live in SetlistGrid (not SortableRow) | Selection state lives at grid level (useGridSelection); single-vs-bulk routing decisions need access. SortableRow stays selection-state-naive — it just receives 4 callback props per row + a boolean. | Clean separation; SortableRow contract minimal; bulk-vs-single routing centralized. |
| Disabled-on-multi-selection for Edit / Bind / Duplicate | These don't make semantic sense on multi-selection (focus single Title cell, bind one chart for many rows, duplicate single row). Bulk Duplicate is a future BatchActionBar feature, deferred. | Delete stays enabled because bulk-delete IS the natural action; "N rows selected" header makes intent explicit. |
| Long-press via synthetic contextmenu dispatch | @radix-ui/react-context-menu 2.2.16 has NO controlled `open` prop on Root (verified by grep on installed `index.d.ts`). Re-emit `new MouseEvent('contextmenu', { bubbles, cancelable, clientX, clientY })` on the `<tr>` trigger element — Radix's internal listener catches it and opens at the dispatched position. | Pattern reusable for any uncontrolled Radix primitive that listens for a specific event; documented inline + this SUMMARY. |
| Long-press timing: 500ms hold + 10px-squared movement threshold | 500ms is the standard mobile-OS long-press duration. 10px² (=100, for hypot avoidance) tolerance lets a steady touch fire even with slight drift; movement past it indicates drag intent (PointerSensor delay:150 + tolerance:5 takes over). pointerType='mouse' skip prevents slow desktop clicks from triggering. | Touch-only branch — desktop right-click is the natural path. |
| Duplicate-row implementation: cascade-bump THEN set | Parallel applyEdit('update', { order: r.order + 1 }) for every row with order >= newOrder, then applyEdit('set','tracks', { ...source, id: newId, order: newOrder }). Source spread retains all fields except id and order. | LWW per-document invariant from v50-03 sync engine handles drain ordering correctly per docId. |
| Global window.matchMedia stub via vitest setupFiles | src/test-setup.ts default to matches:false. Tests that want coarse-pointer mock @/hooks/use-media-query directly. | Existing tests run unchanged; new contextmenu test mocks per-case for AC-1 sanity + AC-7 long-press. Pattern reusable for any jsdom-missing API. |
| Real timers (NOT vi.useFakeTimers) for long-press tests | vi.useFakeTimers conflicts with fake-indexeddb's microtask scheduling and Dexie's live-query teardown — beforeEach hook timeouts cascaded across all tests after a fake-timer one. 500ms × 4 cases = ~2.5s total — cheap. | Reinforces the v50-03 lesson: fake timers + Dexie don't mix. New iteration: REAL timers > FakeClock when waiting for setTimeout-based handlers in component tests. |
| Discard build-script auto-bumps on package.json + src/build-info.json | Per v50-04 / v50-05-01/02/03 close convention. Build-info script bumps version on every `npm run build`, polluting commit diffs. | Working tree stays clean for the UNIFY commit; version bumps land deliberately, not silently. |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | First-pass ChartBindPopover refactor wrapped children in span (broke asChild) — caught by re-reading own change before testing; fixed in same commit |
| Scope additions | 1 | src/test-setup.ts added beyond original PLAN — required to fix existing tests' window.matchMedia errors after TouchOrPopover landed |
| Deferred | 0 | Plan executed end-to-end; no items punted from this plan to a later one |

**Total impact:** Both deviations strengthened the implementation — the asChild fix kept ChartBindPopover backward-compatible with v50-05-02 callers, and src/test-setup.ts is a project-wide testing infrastructure addition that benefits all future cell-level tests. No scope creep.

### Auto-fixed Issues

**1. ChartBindPopover refactor broke asChild — wrapped children in span**
- **Found during:** Task 1 first ChartBindPopover refactor — initial draft wrapped `{children}` in `<span ref={triggerRef} className="contents">{children}</span>` to attach a triggerRef for manual focus return.
- **Issue:** TouchOrPopover passes its `trigger` to `<Popover.Trigger asChild>` / `<SheetTrigger asChild>`. asChild merges props onto a SINGLE child. Wrapping in a span makes the span the asChild target; the actual ChartCell button (forwardRef) doesn't receive the click handler — popover never opens.
- **Fix:** Removed the span wrapper. Pass `children` directly as the trigger. Dropped manual focus return (`triggerRef.current?.focus()` in `onCloseAutoFocus`) and let Radix's default behavior handle focus return to the trigger element (works correctly since ChartCell is forwardRef).
- **Files:** src/components/setlist/grid/ChartBindPopover.tsx
- **Verification:** Existing ChartBindPopover.test.tsx (4 cases) all green after Task 1; integration with SetlistGrid via the controllable `open` prop verified in Task 3's AC-6 Bind chart test.
- **Commit:** Bundled into Task 1 (`d4a9d96`) — root-caused + fixed in the same edit pass.

### Scope Additions

**1. src/test-setup.ts — global window.matchMedia stub via vitest setupFiles**
- **Reason:** First test run after TouchOrPopover landed in Task 1 surfaced `TypeError: window.matchMedia is not a function` across 44 test cases (every test that renders DropdownCell, AddRowPlaceholder, ChartBindPopover, or BatchActionBar — i.e., the entire grid suite plus several more). jsdom doesn't ship matchMedia; previously no component in the test path called useMediaQuery, so it was never needed.
- **Implementation:** New file `src/test-setup.ts` (~30 LOC) with `Object.defineProperty(window, 'matchMedia', { value: vi.fn((q) => ({ matches: false, ... })) })`. Default `matches: false` returns the desktop branch for any test that doesn't explicitly mock useMediaQuery. Wired via `vitest.config.ts setupFiles: ['./src/test-setup.ts']`.
- **Impact:** Existing tests pass without modification (44 → 0 failures). Tests that want to verify coarse-pointer behavior mock `@/hooks/use-media-query` directly via `vi.mock(...)` (pattern in TouchOrPopover.test.tsx + SetlistGrid.contextmenu.test.tsx). Pattern reusable for any future jsdom-missing API.
- **Commit:** Bundled into Task 1 (`d4a9d96`) — discovered + fixed in the same APPLY pass.

### Deferred Items

None — plan executed exactly as written; the v50-05 polish split (03 done + 04 done + 05 next) was already locked into ROADMAP at PLAN time and is not a deferral from THIS plan.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| 44 grid tests failed with `window.matchMedia is not a function` after Task 1 TouchOrPopover landed | Added src/test-setup.ts with global window.matchMedia stub via vitest setupFiles; matches:false default returns desktop branch (existing tests' behavior). See Scope Addition #1. |
| AC-7 long-press tests + AC-1 Sheet sanity timed out under vi.useFakeTimers (Dexie's afterEach hook hung) | Switched all 4 long-press cases + AC-1 sanity to REAL timers with `await sleep(ms)`. 500ms × 4 = ~2.5s added to suite — cheap. Documented in test inline comments + this SUMMARY's patterns-established section. |
| Test polling pattern with recursive setTimeout-based `tick()` deadlocked under fake timers | Replaced with `await screen.findAllByTestId('drag-handle')` + querySelector by data-row-id — same pattern as v50-05-03 SetlistGrid.selection.test.tsx. |
| Build script auto-bumped `package.json` version + `src/build-info.json` on `npm run build` | Discarded with `git checkout -- package.json src/build-info.json` per v50-04 / v50-05-01 / v50-05-02 / v50-05-03 close convention. |
| `next build` Sentry deprecation warning during Task 3 verification | Pre-existing; cosmetic; deferred (in STATE.md outstanding list as "Sentry deprecation: sentry.client.config.ts → instrumentation-client.ts rename"). NOT a regression. |

## Next Phase Readiness

**Ready (v50-05-05 — mobile + WCAG AA + Undo, the LAST plan in v50-05):**
- TouchOrPopover wrapper is the integration point for any future cell-level affordance — mobile stacked-card flow's per-card sheets can reuse it directly.
- ContextMenu pattern (asChild on `<tr>` + 4 items + selection-aware action targeting) is reusable for the mobile stacked-card three-dot menu.
- Selection state via useGridSelection survives across the parallel mobile render path (it's grid-level, not table-level). pruneTo + extendRange still apply.
- DeleteConfirmProvider already accessible from any render path; ContextMenu Delete + bulk-delete + single-row delete all flow through.
- ChartBindPopover controllable open state available for any future programmatic-open consumer (e.g. mobile flow's "Bind chart" button).
- Long-press synthetic-contextmenu-dispatch pattern is documented inline; reusable for any future Radix primitive that lacks controlled open.
- Global window.matchMedia stub in place for any future test that touches useMediaQuery.
- 44px-min touch target Tailwind class pattern (`[@media(pointer:coarse)]:<utility>`) reusable across all editor surface.

**Concerns:**
- **Synthetic contextmenu dispatch is a workaround**, not the long-term home. If @radix-ui/react-context-menu adds controlled `open` in a future minor, migrate to that. Inline comment notes the version (2.2.16) so future dependency bumps trigger re-evaluation.
- **Real timers for component-level setTimeout tests** is documented but adds ~2.5s × N to the suite at scale. v50-05-05 Undo middleware will likely need its own timer-driven tests; same pattern applies but watch overall suite duration. Currently 60s+ end-to-end on local; acceptable for now.
- **Cross-tab-lock test flake remains** in the broader suite (1377/1377 this session, but historically intermittent) — deferred to v50-06 per established precedent. v50-06 must root-cause before shipping concurrent-edit safety because the same lock primitive is the substrate.
- **Production smoke verification of v50-05-04** still pending from user (added to deferred-smokes #6). User pattern: "I'll look at it later"; not blocking forward planning.
- **Production migrate-v50.ts apply** still deferred to v50-07 — split-brain (legacy embedded `setlists/{id}.tracks[]` + new top-level `tracks/{id}` docs) becomes more pronounced now that bulk-edit + Duplicate row are shipping more writes per session. Not blocking v50-05-05; remains a v50-07 imperative.

**Blockers:** None for v50-05-05. Production smoke verification of v50-05-02 + v50-05-03 + v50-05-04 still pending from user (deferred, not blocking UNIFY).

---
*Phase: v50-05-spreadsheet-editor, Plan: 04*
*Completed: 2026-04-26*
