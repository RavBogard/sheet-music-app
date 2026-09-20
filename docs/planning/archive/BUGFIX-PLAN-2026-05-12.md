# Bugfix Plan — 2026-05-12 (v2, rewritten against real architecture)

Three bugs. Confidence after reading the actual code: **Bug 1: 90%, Bug 2: 90%, Bug 3: 75%**.

This supersedes v1 — v1 was based on subagent reports that fabricated parts of the architecture (a `useSetlistLogic` hook, a `TrackSheet.tsx`, a 1-second `performSave()` debounce). None of those exist. The real system is a sophisticated local-first sync engine with an IndexedDB outbox.

---

## Architecture you need to know to read this plan

- **Writes go through `applyEdit(EditDescriptor)`** in [src/lib/local/write.ts](src/lib/local/write.ts). One Dexie transaction: mutate the entity row (`db.tracks` / `db.setlists`) + enqueue an `OutboxRow {status: 'pending', op, collection, docId, payload, expectedUpdatedAt}`. Both atomic.
- **`SyncEngine`** [src/lib/sync/engine.ts](src/lib/sync/engine.ts) drains the outbox to Firestore with retry/backoff. On success: deletes outbox row + writes server `updatedAt` back into local. On `VersionMismatchError`: outbox row → `status: 'failed'`. Subsequent rows for the same docId are blocked.
- **Reads on initial open: `SetlistGridHydrator`** [src/components/setlist/grid/SetlistGridHydrator.tsx](src/components/setlist/grid/SetlistGridHydrator.tsx) primes Dexie from server-fetched `initialSetlist` + `initialTracks`. Guards: skip if outbox has a pending row for that docId; LWW by `updatedAt`.
- **Live updates: `snapshot-listener`** [src/lib/sync/snapshot-listener.ts](src/lib/sync/snapshot-listener.ts) feeds Firestore deliveries into Dexie with the same outbox-pending + LWW guards.
- **`SyncIndicator`** [src/components/setlist/grid/SyncIndicator.tsx](src/components/setlist/grid/SyncIndicator.tsx) shows `idle | dirty | saving | conflict | failed | offline` derived from outbox shape.
- **`ReconciliationProvider`** [src/components/setlist/grid/ReconciliationProvider.tsx](src/components/setlist/grid/ReconciliationProvider.tsx) is *supposed* to show a per-row "Keep mine / Take theirs" modal when `state === 'conflict' || state === 'failed'`. **It does not.** See Bug 2.

---

## Bug 1 — Setlist drag handle non-functional (desktop + iPad)

### Confirmed root cause

[src/components/setlist/grid/SetlistGrid.tsx:1400-1407](src/components/setlist/grid/SetlistGrid.tsx:1400)

```ts
const sensors = useSensors(
    useSensor(PointerSensor, {
        activationConstraint: { delay: 150, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, ...),
)
```

A `delay: 150, tolerance: 5` activation requires the user to press-and-hold *still* for 150ms within a 5px tolerance before drag activates. A natural click-and-drag gesture (press → immediate motion) moves >5px before 150ms elapses → activation cancels → drag never starts.

The code even documents this explicitly at [DragHandleCell.tsx:54-56](src/components/setlist/grid/cells/DragHandleCell.tsx:54): *"…activationConstraint delay:150 + tolerance:5 — a quick click without movement does NOT activate drag."* That was deliberate to make plain clicks fall through to the multi-select `onClick` — but the same constraint also kills the natural drag gesture.

A `PointerSensor` with delay-based activation is the right choice for *touch* (need to disambiguate from tap and scroll) but the wrong choice for *mouse* (clicks and drags should both work without a hold).

### Fix (systemic)

Split the unified `PointerSensor` into `MouseSensor` + `TouchSensor`. Each gets the activation pattern that fits its modality.

1. **[src/components/setlist/grid/SetlistGrid.tsx:1400-1407](src/components/setlist/grid/SetlistGrid.tsx:1400)** — replace:
   ```ts
   useSensors(
       useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
       useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
       useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
   )
   ```
   - Mouse: drag activates after 5px of motion. Plain clicks (no motion) still fall through to `onClick` for multi-select. No hold required.
   - Touch: 200ms hold + 5px tolerance — disambiguates from tap (multi-select) and scroll.
   - Keyboard: unchanged.

2. **[DragHandleCell.tsx:69-86](src/components/setlist/grid/cells/DragHandleCell.tsx:69)** — add `data-drag-handle` attribute to the `<button>` so the row's long-press handler can recognize and ignore handle events.

3. **[SetlistGrid.tsx:490-509](src/components/setlist/grid/SetlistGrid.tsx:490)** — `SortableRow.handlePointerDown` (the touch long-press → context-menu emitter). Add an early-return when the event originates inside the drag handle:
   ```ts
   if ((e.target as HTMLElement)?.closest('[data-drag-handle]')) return
   ```
   Without this, touching the handle and holding (e.g., while preparing to drag but moving <5px) would *both* activate TouchSensor (at 200ms) *and* fire the row's context-menu (at 500ms). The guard makes the row's long-press stay out of the handle's lane.

4. **Update the misleading comment** at [DragHandleCell.tsx:53-56](src/components/setlist/grid/cells/DragHandleCell.tsx:53) — the constraint no longer prevents quick clicks from activating drag because we no longer use a unified delay-based sensor; the new comment should describe the distance-based mouse / delay-based touch split.

### Verification

- Desktop: grip handle + drag in one motion → row picks up after ~5px of movement. Plain click on handle → no drag, no side effect (or selection if Shift/Cmd/Ctrl + click).
- iPad: tap handle → nothing. Long-press handle (~200ms) → drag activates. No context menu opens.
- Long-press *anywhere on the row body but not the handle* → row context menu opens (existing behavior preserved).
- Keyboard reorder still works (Space → arrow keys → Space).

---

## Bug 2 — Setlist reverts to old version after browser close/reopen

### Confirmed root cause — three failures that compound

**(2a) The reconciliation modal is stubbed out.** [ReconciliationProvider.tsx:179](src/components/setlist/grid/ReconciliationProvider.tsx:179):

```ts
const hasConflict = (state === 'conflict' || state === 'failed') && failedRows.length > 0
const open = false                                                          // ← never opens
```

And [line 281-282, 326-327](src/components/setlist/grid/ReconciliationProvider.tsx:281):
```ts
const openModal = useCallback(() => {}, [])      // no-op
const closeModal = useCallback(() => {}, [])     // no-op
// ...
() => ({ openModal: () => {} }),                 // context value openModal is also no-op
```

The user **never sees a conflict prompt**. The whole per-row reconciliation UI (the diff renderer, the "Keep mine / Take theirs" radios at the bottom of the file) is dead code.

**(2b) Auto-resolve fires "mine" blindly — and silently abandons on second failure.** [ReconciliationProvider.tsx:296-307, 313-323](src/components/setlist/grid/ReconciliationProvider.tsx:296):

```ts
for (const r of failedRows) {
    const choice = 'mine' // Last write wins
    ...
    await resolveFn(r.localId, choice, { newExpectedUpdatedAt })
}
```

Auto-resolve always picks `'mine'` with a fresh `expectedUpdatedAt` from the remote snapshot. **The user's intent is never asked.** This is silent overwrite of cross-device edits — but worse, if the resolved retry *also* fails (e.g., another conflict, auth issue, dead-letter), `autoResolvedKeyRef` blocks any further auto-resolve in this mount. The row sits in `'failed'` indefinitely.

**(2c) The "Failed — retry" pill abandons the work.** [SyncIndicator.tsx:152-155](src/components/setlist/grid/SyncIndicator.tsx:152) and [cleanup.ts:26-44](src/lib/sync/cleanup.ts:26):

```ts
const defaultRetryFailed = async () => {
    await clearFailedOutboxRows()       // ← deletes the failed outbox rows
}
```

`clearFailedOutboxRows` literally deletes failed outbox rows. The button is labeled "Failed — retry" but its action is "discard". The user clicks it expecting a retry; they silently lose the edit.

**(2d) After (b) or (c) abandons the row, server-priming resurrects deleted entities.** [SetlistGridHydrator.tsx:104-135](src/components/setlist/grid/SetlistGridHydrator.tsx:104) and [snapshot-listener.ts:244-272](src/lib/sync/snapshot-listener.ts:244):

```ts
// Hydrator track loop:
for (const t of initialTracks) {
    if (trackOutboxIds.has(t.id)) continue
    const local = localById.get(t.id)
    if (!local || ((local.updatedAt) ?? 0) < ((t.updatedAt) ?? 0)) {
        toPut.push(t)            // ← resurrects the row
    }
}
```

User deletes track X locally → outbox row goes `'failed'` (server-side conflict) → reconciliation auto-resolves `'mine'` once but second attempt also fails → user clicks "Failed — retry" pill → outbox row deleted. Now:
- Local Dexie: X is gone (user deleted it)
- Outbox: empty for X
- Firestore: X still exists (delete never succeeded)

On reload (or just on the next snapshot tick), `initialTracks` from server contains X. No outbox guard. Local `localById.get(X) === undefined` → "missing, put it" → **X is back in local Dexie.** User sees their deletion undone.

The system has **no representation of "the user intentionally removed this"** that survives outbox loss.

### Fix (systemic, multi-part — all three are necessary)

#### 2.1 Tombstones for delete intent (the central fix)

Add a `tombstones` table to the Dexie schema: `{ collection, docId, deletedAt, originalUpdatedAt }`. Lifecycle:

- **Write tombstone** inside `applyEdit` when `op === 'delete'` (same transaction as the physical delete + outbox enqueue). Atomic.
- **Clear tombstone** in the engine's drain success branch when a `delete` outbox row commits successfully (server has acknowledged the delete; intent is durably realized).
- **Clear tombstone** when the user re-creates the same docId (rare; defensive).
- **Optional TTL** (e.g., 30 days) via a periodic prune — defense against unbounded growth in pathological cases. Not required for correctness.

Then add a tombstone-guard at the two resurrection sites:

- **[SetlistGridHydrator.tsx:104-135](src/components/setlist/grid/SetlistGridHydrator.tsx:104)**: before `toPut.push(t)`, check `tombstones` for `{collection: 'tracks', docId: t.id}`. If present, skip the put. Also: explicitly do *not* delete the tombstone here — it only clears on confirmed server-delete.
- **[snapshot-listener.ts:244-272](src/lib/sync/snapshot-listener.ts:244)**: same guard before the `db.tracks.put(next)` in the modified/added branch.

This makes "user intent to delete" a first-class durable signal, independent of outbox state.

#### 2.2 Stop discarding failed writes; offer real recovery

- **Rename and rewire the "Failed — retry" pill action**. The pill should *actually retry* — reset failed rows to `status: 'pending', attempts: 0, scheduledFor: now` and call `engine.pump()`. Add a separate, confirmed "Discard failed change" affordance for the user who *actually* wants to give up.
- **Rewrite [cleanup.ts](src/lib/sync/cleanup.ts)**: rename the current function to `discardFailedOutboxRows` (be honest about what it does), and add a new `retryFailedOutboxRows()` that resets and pumps.
- **Wire SyncIndicator's `defaultRetryFailed` to the new retry function**, not the discard function.

#### 2.3 Un-stub the reconciliation modal (or remove auto-resolve)

Two reasonable approaches:

**Option A (preferred)** — actually show the modal. Replace [line 178-180](src/components/setlist/grid/ReconciliationProvider.tsx:178):
```ts
const [open, setOpen] = useState(false)
// open the modal whenever a conflict appears
useEffect(() => { if (hasConflict) setOpen(true) }, [hasConflict])
```
Restore the `openModal` / `closeModal` callbacks. Render the `<AlertDialog open={open}>` (the JSX appears to exist further down — verify). Remove the blind auto-resolve effect — let the user pick per row.

**Option B** — if Option A is too invasive for this pass, at minimum:
1. Make auto-resolve actually finish — on second failure (after the 'mine' retry), surface to the SyncIndicator unmistakably ("Click here to resolve" with proper modal); don't sit in `'failed'` silently.
2. Make the chosen default be `'theirs'` rather than `'mine'` for non-delete ops to prevent silent cross-device clobber. For `op === 'delete'`, `'mine'` is correct (the user's intent is preservation of the deletion).

The codebase contains a comment that 'theirs' is the "safe default" ([line 182](src/components/setlist/grid/ReconciliationProvider.tsx:182)) but the auto-resolve hardcodes 'mine'. That contradicts the documented design.

### Files

- src/lib/local/schema.ts — add `tombstones` table (Dexie schema bump; version migration)
- src/lib/local/types.ts — add `Tombstone` type
- src/lib/local/write.ts — write tombstone in delete branch (same tx)
- src/lib/sync/engine.ts:241-323 — clear tombstone on successful delete commit
- src/components/setlist/grid/SetlistGridHydrator.tsx:104-135 — tombstone guard
- src/lib/sync/snapshot-listener.ts:244-272 — tombstone guard
- src/lib/sync/cleanup.ts — rename + add real retry helper
- src/components/setlist/grid/SyncIndicator.tsx:152-155 — wire to real retry; add separate Discard
- src/components/setlist/grid/ReconciliationProvider.tsx:178-180, 281-323 — un-stub the modal (Option A) OR fix auto-resolve semantics (Option B)
- Tests: snapshot-listener.test, SetlistGridHydrator.test, engine.test, new tombstone tests, ReconciliationProvider integration

### Verification

- Delete a track. Block network (DevTools offline). Reload. Track should *stay deleted* (outbox still has the pending delete; on reconnect it drains).
- Delete a track. Force `VersionMismatchError` (edit same track in another tab so updatedAt advances). After auto-resolve runs once, manually click "Failed — retry" pill (after un-stubbing fix). Verify the delete is actually retried (not discarded).
- Delete a track. Force the row into a permanently-failed state. Click new "Discard failed change" affordance (confirm dialog). On reload, the track should *stay gone* if the tombstone is still active — and *come back* with a clear "remote restored" hint only if the user explicitly cleared the tombstone.
- Edit a setlist on two devices simultaneously. Conflict modal should *actually appear* with per-row choice. Auto-resolve to 'mine' should not silently overwrite the other device's edits.
- Run the engine + snapshot tests; add a new test for "delete-then-resurrection-prevented-by-tombstone".

---

## Bug 3 — "Bind Chart" does nothing on desktop when editing existing track

### What I found in the real code

Now that I've read [ChartBindPopover.tsx](src/components/setlist/grid/ChartBindPopover.tsx) and [TouchOrPopover.tsx](src/components/setlist/grid/TouchOrPopover.tsx), the picture is clearer than v1 described:

- `TouchOrPopover` is **not** a Sheet/Popover swap — it's a single Radix Popover with conditional `onOpenAutoFocus` suppression for discrete pickers on touch. ChartBindPopover doesn't suppress focus, so cmdk's `CommandInput` should auto-focus on open.
- `ChartBindPopover` is **already** cmdk-based (Command, CommandInput, CommandGroup, CommandItem). The UI we want already exists; the question is the *trigger geometry*.
- The handler [SetlistGrid.tsx:1251-1260](src/components/setlist/grid/SetlistGrid.tsx:1251) uses `setTimeout(0)` to defer past iPad's pointer-up teardown.

The brittle handoff is real:

1. User right-clicks track → Radix `ContextMenu` opens (one dismissable layer + focus scope).
2. Click "Bind chart" → `ContextMenu` begins teardown (focus restoration to the `<tr>` trigger).
3. `setTimeout(0)` fires → `setChartBindOpenRowId(rowId)` → ChartCell re-renders with `open={true}` on its Popover → second dismissable layer + focus scope activates.
4. Radix's dismissable-layer stack and focus-scope ordering during this two-tick handoff is the source of the desktop silence. The Popover's outside-click detector can fire on the still-living ContextMenu close event; the Popover's auto-focus loses the race against ContextMenu's restore-focus.

The 0ms timeout works on iPad (per `f1096e90`) probably because the touch event loop on Safari has different microtask scheduling, and may also be more lenient with focus transfer. Desktop's synchronous mouse event sequence is tighter.

### Design call

Per the user's stated ideal UX ("type inline in the same menu, not a popover that opens somewhere else"), and the canonical pattern for typeable secondary actions from a context menu (Linear/Notion/Raycast/Arc all use a centered command dialog, never a chained anchored popover), the systemic fix is to **stop anchoring this action to a table cell**.

### Fix

Replace the context-menu → anchored Popover handoff with a context-menu → centered `Dialog + cmdk` (CommandDialog pattern). The same `ChartBindPopover` body becomes a `ChartBindDialog` — cmdk content is unchanged, only the shell differs.

1. **New component `ChartBindDialog`** in src/components/setlist/grid/ — wraps the existing cmdk body inside a Radix `Dialog` (centered modal). No anchor, no trigger-element dependency.
2. **State change in SetlistGrid**: rename `chartBindOpenRowId` → `chartBindDialogTrackId`. Single piece of state, one dialog rendered at the grid root.
3. **Handler [SetlistGrid.tsx:1251-1260](src/components/setlist/grid/SetlistGrid.tsx:1251)**: drop the `setTimeout(0)` workaround. Just `setChartBindDialogTrackId(rowId)`. No two-overlay race because the Dialog is decoupled from any cell.
4. **ChartCell's inline-click path** (the existing chart icon → popover flow when the user clicks the chart cell itself, not the context menu) — leave as is for now, or migrate to the same Dialog for consistency. Recommendation: migrate for one code path, less surface, fewer test cases.
5. **Delete the popover open prop wiring** at [SetlistGrid.tsx:1387-1388](src/components/setlist/grid/SetlistGrid.tsx:1387) (`chartBindOpenRowId`, `handleChartBindOpenChange` in meta deps).

The cmdk content (`Command` + `CommandInput` + `CommandGroup` for Recent + Library) carries over verbatim. Behavior: dialog opens centered, input is auto-focused (cmdk does this natively), Esc / outside-click closes, Enter binds. Identical on desktop and iPad — one code path.

### Files

- src/components/setlist/grid/ChartBindDialog.tsx — new (cmdk body extracted from ChartBindPopover)
- src/components/setlist/grid/ChartBindPopover.tsx — keep for the inline-cell-click path, or delete if migrating fully (Recommendation: keep for now; migrate later in a small follow-up if it proves redundant)
- src/components/setlist/grid/SetlistGrid.tsx:1053-1058 — rename state
- src/components/setlist/grid/SetlistGrid.tsx:1251-1260 — drop setTimeout, set dialog state
- src/components/setlist/grid/SetlistGrid.tsx:1370-1390 — remove popover prop wiring from meta; render `<ChartBindDialog>` at grid root
- src/components/setlist/grid/SetlistGrid.tsx:416 (or wherever ChartCell consumes meta.chartBindOpenRowId) — remove that consumption
- Tests: new ChartBindDialog test; update SetlistGrid tests that asserted the popover-from-context-menu flow

### Verification

- Right-click track (desktop, mouse) → "Bind chart" → centered dialog opens with focused search input. Library + Recent groups populated. Type filters. Enter binds. Esc cancels.
- iPad long-press → context menu → "Bind chart" → same dialog, system keyboard pops automatically (cmdk autofocus).
- Re-opening on a track that already has a chart shows it (the `currentSongId` highlight already exists in the cmdk body) — verify the prop is threaded through.
- No `setTimeout` involved.

---

## Sequencing

1. **Bug 1 (drag handle)** — small, isolated, restores core editing. ~1 day.
2. **Bug 2 (persistence)** — data integrity, highest user impact. Bigger surface (schema migration, multi-file changes, modal un-stub). 2-3 days with careful testing. Includes:
   - Tombstones (schema + write + clear-on-success + guards)
   - Real retry + separate Discard
   - Reconciliation modal un-stub OR auto-resolve semantics fix
3. **Bug 3 (bind chart)** — replace popover with dialog. Medium surface (new component, state rename, test updates). 1-1.5 days. Lowest priority because the chart-cell-click path still works as a workaround; only the context-menu path is broken.

No cross-dependencies.

---

## Open questions

- **Bug 2 / reconciliation modal**: the file ([ReconciliationProvider.tsx:337-458](src/components/setlist/grid/ReconciliationProvider.tsx:337)) contains a `ReconciliationCard` JSX subcomponent that's never rendered (because `open = false`). Verify whether the full `<AlertDialog>` JSX exists earlier (it's imported at line 17-24) but was removed/commented out, or whether the dialog skeleton needs to be re-added. I want to confirm before estimating Option A's actual cost.
- **Bug 2 / current `auto-resolve = 'mine'` behavior in production**: how often does this fire silently? Worth a quick Sentry breadcrumb count via `recordEdit` outcomes before changing semantics — if it's the common path keeping the system limping along, we need a migration story.
- **Bug 3 / inline-cell-click path**: confirm with you whether to migrate both paths to the dialog (cleaner) or keep the inline popover for that specific entry point (smaller diff). Either is defensible.
- **Tombstone TTL**: do we want a TTL at all (defensive prune), or rely solely on engine-confirmed clear? No-TTL is simpler; TTL prevents unbounded growth in pathological cases (e.g., a permanently-failed delete that the user never resolves).
