# Bugs 4 / 5 / 6 — Implementation Plan (2026-05-12)

Three post-deploy bugs reported after the Bug 1/2/3 push. Each fix below ships independently. No cross-dependencies.

User decisions locked in:
- **Bug 4:** drag-reorder only (no Move Up/Move Down buttons). Cards-everywhere is fine.
- **Bug 5:** re-prime `songs` library on `ChartBindDialog` open.
- **Bug 6:** investigate Serwist version, drop `clientsClaim` if needed.

---

## Bug 4 — Drag-reorder broken; Move Up/Down broken; multi-select unwanted

### Root cause (from architecture map)

Commit `0ec6773c` (May 9, 2026) "Replaced TanStack table with card list in SetlistGrid.tsx" deleted the entire desktop table. The `SetlistGrid` now only renders `MobileCardList` at [SetlistGrid.tsx:1673](src/components/setlist/grid/SetlistGrid.tsx:1673), regardless of viewport. No drag library was wired to the cards. The grip icon on each card is a multi-select toggle ([MobileRowCard.tsx:166-179](src/components/setlist/grid/MobileRowCard.tsx:166)), not a drag handle.

My Bug 1 fix earlier this session (split `MouseSensor` + `TouchSensor` in `SetlistGrid.tsx`) applied to dead code. The `SortableRow` + `DragHandleCell` chain is defined but never rendered.

### What lands

**Add real drag-reorder to `MobileCardList` via @dnd-kit; remove Move Up/Down and multi-select entirely.**

### Files & specific changes

1. **`src/components/setlist/grid/MobileCardList.tsx`**
   - Wrap the `<ul>` body in `<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>` + `<SortableContext items={trackIds} strategy={verticalListSortingStrategy}>`.
   - Sensors: split `MouseSensor` (`{distance: 5}`) + `TouchSensor` (`{delay: 200, tolerance: 5}`) + `KeyboardSensor` — same activation rationale as the original Bug 1 fix.
   - `handleDragEnd`: identical pattern to the old desktop `handleDragEnd` in `SetlistGrid.tsx:1443-1501` — `computeReorderUpdates(rows, active.id, over.id)` → parallel `applyEdit({op: 'update', collection: 'tracks', docId, patch: { order }, expectedUpdatedAt})` for each affected row → single composite undo entry.
   - Delete `handleMoveUp`, `handleMoveDown`, and `editingTrackId`/`editingIndex`/`editingTrack` state used to wire them.
   - Delete `selectedIds`, `onSelectionClick` props from the interface. Remove their threading.

2. **`src/components/setlist/grid/MobileRowCard.tsx`**
   - Wrap the card in `useSortable({ id: track.id })` (or extract a `SortableCard` wrapper component, depending on how `useSortable` + the inline-edit pane interact).
   - The grip `<button>` becomes the drag handle: spread `{...attributes} {...listeners}` from `useSortable`; remove `onClick={handleHandleClick}`, `aria-pressed`, `isSelected`/`isInBulkSelection`/`bulkSelectionCount` props and their references.
   - Delete `Move Up` and `Move Down` buttons (lines 387-402).
   - Delete `canMoveUp`, `canMoveDown`, `onMoveUp`, `onMoveDown` props.
   - The card body retains its tap-to-edit gesture, but it now needs to NOT compete with the drag gesture — easy because the drag handle is a sibling button and dnd-kit only listens on the handle (with `attributes` + `listeners` spread there).
   - Inline edit pane keeps everything except the move buttons.

3. **`src/components/setlist/grid/SetlistGrid.tsx`**
   - Remove `<BatchActionBar>` render at [line 1656-1663](src/components/setlist/grid/SetlistGrid.tsx:1656). Multi-select is gone; nothing to batch.
   - Remove `useGridSelection` hook call + all references to `selection.selectedIds`, `selection.clear`, `selectedTracks`, `handleDragHandleClick` (the desktop handle multi-select handler), `handleBulkSet`, `handleBulkDelete`.
   - Remove the `onSelectionClick` prop from the `<MobileCardList>` call.
   - **Dead code cleanup** (defer to Cluster 4 follow-up, but mark it now):
     - The entire `SortableRow` component (lines 444-700+) is dead. So is `DragHandleCell` and `BatchActionBar`. The columns config that drives TanStack Table is dead. Leave for the dead-code cluster but add a `// DEAD CODE — slated for removal in cluster 4` comment at the top of each so a future reader doesn't refactor it accidentally.

4. **Tests**
   - Delete or rewrite `SetlistGrid.dnd.test.tsx` (currently tests dead code; 3 failing tests already pre-existing on master).
   - Delete `SetlistGrid.contextmenu.test.tsx` once context-menu still works on cards (it does — `MobileRowCard` has its own ContextMenu wired) — but the test file references the old `<tr>` structure. Rewrite against the cards.
   - Delete `BatchActionBar.test.tsx` if BatchActionBar is removed.
   - Delete `SetlistGrid.selection.test.tsx` — multi-select is gone.
   - Add new `MobileCardList.dnd.test.tsx` covering: drag-reorder produces the right `applyEdit` calls; undo works.

### Verification

- Open a setlist with 5+ tracks. Drag the 3rd row's grip onto the 1st row's grip → list reorders. Refresh page → new order persists.
- Try to drag on iPad — long-press grip → drag activates after 200ms hold.
- Click the grip (no drag) → nothing happens (no multi-select toggle).
- `BatchActionBar` never appears.
- Undo (Ctrl/Cmd-Z) after a reorder → original order restored.
- Move Up / Move Down buttons no longer in the edit pane.

### Risk register

- **R4.1 — Inline edit pane vs drag.** The edit pane opens below the card on tap. `useSortable` listeners are on the grip button (not the whole card) so tapping the body still opens the edit pane and dragging the grip still drags. Verify on iPad — touch may go to whichever element captures the pointer first.
- **R4.2 — Section/header rows.** Sections (`type === 'header'|'section'`) currently render with a different style and shouldn't drag-reorder freely (they group adjacent rows visually). Decide if they participate in drag or not. Recommendation: yes, treat as ordinary rows for drag (current behavior matches if user wants it). Flag for testing.
- **R4.3 — Drag preview / DragOverlay.** Without a `<DragOverlay>` the dragged row's transform may visually clip on iPad. Worth adding the overlay for polish.

### Estimate

1-2 sessions including tests.

---

## Bug 5 — New library song doesn't appear in chart-bind picker

### Root cause

[src/lib/songs/prime.ts:31-39](src/lib/songs/prime.ts:31) uses a one-shot `getDocs(collection(db, 'songs'))`. The hydrator fires `primeSongsLibrary()` once per mount ([SetlistGridHydrator.tsx:251-256](src/components/setlist/grid/SetlistGridHydrator.tsx:251)) and never re-runs. New songs added to Firestore during the session don't enter Dexie. `ChartBindDialog` reads from Dexie via `useLiveQuery(() => getDb().songs.toArray())` → empty for new songs.

### What lands

**Re-prime `songs` on `ChartBindDialog.open === true`.**

### Files & specific changes

1. **`src/components/setlist/grid/ChartBindDialog.tsx`**
   - Add a `useEffect` that fires `primeSongsLibrary()` whenever `open` transitions from false → true.
   - Throttle: track `lastPrimedAtRef`. Skip re-prime if last prime was < 5 seconds ago (avoid hammering Firestore when the user reopens the dialog repeatedly).
   - The prime helper is already failure-swallowing — no need for error handling here.

2. **`src/components/setlist/grid/SetlistGridHydrator.tsx`**
   - The mount-once prime stays. It guarantees we have *something* in Dexie before the dialog ever opens (so the dialog isn't empty on first open with no network).

3. **No tests required** for the throttle (timer-based; flaky to test). Add one test in `ChartBindDialog.test.tsx` (if it exists) that asserts `primeSongsLibrary` is called when `open: true` mounts. If the test file doesn't exist, write one.

### Verification

- Open the app. Open another tab; add a new song to the library. Back to the first tab — open a setlist track's "Bind chart" dialog → new song appears in the list.
- Spam-open the dialog 5x within 5 seconds → `getDocs` only fires once (throttle works).
- Network is offline + open dialog → no error surfaces; dialog falls back to whatever Dexie has.

### Risk register

- **R5.1 — Re-running prime on every open is wasteful.** Throttle mitigates. Long-term fix is Phase D's snapshot listener on `songs`, which retires this entirely.

### Estimate

0.5 session.

---

## Bug 6 — Service worker `InvalidStateError` console noise

### Root cause (suspected)

[src/app/sw.ts:14-20](src/app/sw.ts:14):

```ts
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});
```

Errors:
- `Failed to enable or disable navigation preload: The registration does not have an active worker`
- `Only the active worker can claim clients`

Both happen when a method that requires the worker to be in `'activated'` state is called during `'installing'`. `clientsClaim` and `navigationPreload` toggles both have this requirement. Serwist 9.5.11 (currently installed) may have a race in the install→activate sequence where it issues these calls before the activation transition completes.

### What lands

**Phased investigation; ship the safest mitigation while keeping cache invalidation working.**

### Step 1: Check for a Serwist fix in newer versions

- Run `npm view serwist versions --json | tail -10` to list recent releases.
- Check Serwist changelog (https://serwist.pages.dev/docs or the GitHub releases) for fixes to `clientsClaim` / `navigationPreload` activation-timing.
- If a newer version fixes it: bump `serwist`, `@serwist/next`, `@serwist/precaching` together (they share a version).

### Step 2: If no upstream fix, mitigate locally

Options ranked from least to most disruptive:

A. **Drop `navigationPreload: true`** — small loss (slightly slower navigation under SW); errors disappear immediately. Likely the right call given the app is small.
B. **Drop `clientsClaim: true`** — users won't get the new SW until they reload. With the existing `controllerchange → setTimeout(reload, 3000)` in [firebase.ts:151-154](src/lib/firebase.ts:151), reload-on-update still happens; this just defers until the user navigates.
C. **Keep both but wrap in `self.addEventListener('activate', ...)`** — only call after activate. Requires patching Serwist's behavior; brittle.

**Recommendation: try A first.** If the `clientsClaim` error persists, also drop B.

### Files & specific changes

1. **`src/app/sw.ts`** — depending on Step 1/2 outcome, either:
   - Bump versions (no code change), OR
   - Remove `navigationPreload: true` (and possibly `clientsClaim: true`).
2. **`package.json`** — version bumps if upgrade.

### Verification

- Open DevTools → Application → Service Workers. Unregister current SW. Reload page.
- Watch console during install → activate transition. No `InvalidStateError`.
- Make a code change. Deploy. Reload. New SW installs → activates. No errors. Old behavior of "controllerchange triggers reload" still works (verify in firebase.ts:151-154).

### Risk register

- **R6.1 — Disabling `clientsClaim` could leave users on stale code longer.** Acceptable trade-off; the controllerchange-reload handler mitigates.
- **R6.2 — Errors might be benign and ignorable.** If neither A nor B fully silences them and they don't break anything, document as known noise and move on.

### Estimate

0.5 session.

---

## Sequencing

Independent fixes; no cross-deps. Recommended order:

1. **Bug 6** — small, fast, fixes console noise that's distracting during testing.
2. **Bug 5** — small, fixes a real workflow blocker.
3. **Bug 4** — biggest. Land last so the previous two are stable while debugging.

All three are T1/T2 ship-now. None block on Phase D.

---

## Verification footer

**HEAD SHA at writing:** `63e3debc` (2026-05-12)

**Files cited and verified:**
- [src/components/setlist/grid/SetlistGrid.tsx](src/components/setlist/grid/SetlistGrid.tsx) — lines 1443-1501 (handleDragEnd), 1656-1663 (BatchActionBar), 1673 (MobileCardList render)
- [src/components/setlist/grid/MobileCardList.tsx](src/components/setlist/grid/MobileCardList.tsx) — full file
- [src/components/setlist/grid/MobileRowCard.tsx](src/components/setlist/grid/MobileRowCard.tsx) — full file
- [src/components/setlist/grid/SetlistGridHydrator.tsx](src/components/setlist/grid/SetlistGridHydrator.tsx) — lines 251-256 (prime call)
- [src/lib/songs/prime.ts](src/lib/songs/prime.ts) — full file (88 lines)
- [src/app/sw.ts](src/app/sw.ts) — full file (24 lines)
- [package.json](package.json) — `serwist@^9.5.11`, `@serwist/next@^9.5.11`, `@serwist/precaching@^9.5.11`
- Git: `0ec6773c` "fix(setlists): stabilize sync, UI redesign, and public access" — the commit that deleted the desktop table

**Claims marked Inferred (verify during implementation):**
- R4.1 — inline edit vs drag gesture interaction on iPad
- R4.2 — whether section rows should be draggable
- R6.1 — Serwist's activation race is the actual cause (might be a different SW interaction)
