---
phase: v54-01-picker-bootstrap-and-thead-hotfix
plan: 03
subsystem: ui-substrate, dashboard
tags: [hotfix, trackCount, dashboard, dexie, useLiveQuery, reconciler]

requires:
  - phase: v54-01-picker-bootstrap-and-thead-hotfix
    provides: top-level tracks/{id} write paths from picker / chart-bind / type-tile
provides:
  - SetlistGridHydrator subscribes to live Dexie tracks count and patches setlist.trackCount when drift detected
  - Two new tests covering drift + no-op cases

duration: ~15min
started: 2026-05-09T13:50:00Z
completed: 2026-05-09T14:05:00Z
---

# Phase v54-01 Plan 03: trackCount reconciler (UAT regression hotfix)

**Dashboard cards for v50-05+ setlists showed "0 songs" because `setlist.trackCount` was only written at create-time from the (empty) initial tracks array; v50-05 moved tracks to a top-level `tracks/{id}` collection but no path kept the count in sync. New setlists therefore looked empty on the main screen even though they opened with all songs intact.**

## UAT trigger

Daniel during v54-01 PENDING-UAT cycle, 2026-05-09 (after billing fix unblocked Storage):

> "the setlist i just created is working, but it shows as failed when saving, and on the main screen shows zero songs in it (even though when you open it it works fine)."

The "saving failed" was auth-staleness (resolved by sign-out/sign-in — token had aged out during billing fix). The "zero songs on main screen" is the actual bug; this plan addresses it.

## Root cause

`src/lib/setlist-firebase.ts:157` writes `trackCount: tracks.length` at `createSetlist` time. New setlists are created with `tracks: []` (the user picks songs after creation), so `trackCount: 0` is written. v50-05 cutover moved tracks into top-level `tracks/{id}` documents written via `applyEdit`, but **no path in the editor (`handlePickSong`, `handleCreateFreeText`, `handleAddTrackOfType`, `handleDelete`, `handleBulkDelete`, drag-reorder, etc.) updates the parent `setlists/{id}.trackCount` field**.

`SetlistCards.tsx:168` (`{setlist.trackCount || 0} songs`) and `HeroCard.tsx:93,129` read the stale field.

## Fix

Single coupling point in `SetlistGridHydrator.tsx` — a debounced reconciler that:

1. Subscribes to live Dexie tracks count via `useLiveQuery(() => db.tracks.where('setlistId').equals(setlistId).count())`.
2. Compares against the last written count (or `initialSetlist.trackCount` on first run).
3. When they differ, debounces 800ms then fires `applyEdit({ op:'update', collection:'setlists', docId, patch:{ trackCount: liveTrackCount } })`.
4. Tracks the last-written value in a ref so listener echo doesn't trigger a write loop.
5. Logs failures but doesn't surface — counts will reconcile on next mount if the patch fails.

This keeps every track-mutating path (picker / chart-bind / type-tile / delete / drag-reorder) honest without each having to update `setlist.trackCount` itself, AND fixes ALL existing legacy setlists the moment Daniel opens them.

## Verification

| Check | Result |
|---|---|
| 2 new tests in SetlistGridHydrator.test.tsx (patch-on-drift + no-op-when-matches) | ✅ Pass |
| Full hydrator suite | ✅ 19/19 pass (was 17, +2) |
| Full grid suite serial | ✅ 175/175 pass (was 173, +2) |
| tsc --noEmit | ✅ Clean |

## Decisions

- **Reconciler in SetlistGridHydrator (not in each handler)** — single coupling point; no engine touch; fixes legacy setlists automatically on next open.
- **800ms debounce** — coalesces rapid adds (e.g. picking multiple songs in succession) into one patch instead of N. Mirrors the propagateTrackEditToSong 1000ms debounce shape.
- **Ref-tracked last-written count** — prevents write loop when the snapshot listener echoes the patch back into Dexie.
- **No /ui-ux-pro-max needed** — bug is data-flow, not UX.
- **Harness Fidelity Gate counter unchanged at 1 of 3** — touches SetlistGridHydrator (priming-adjacent), but per v53-02 precedent this surface is already inside the priming-effects scope and doesn't add a snapshot listener; same clause-(b) waiver shape that covered v53-02 priming. NO new waiver entry needed because the existing v53-02 waiver covers SetlistGridHydrator effects through v54-02 ship target.

## Files modified

| File | Change |
|---|---|
| `src/components/setlist/grid/SetlistGridHydrator.tsx` | +47 LOC — useLiveQuery + debounced reconciler effect |
| `src/components/setlist/grid/__tests__/SetlistGridHydrator.test.tsx` | +90 LOC — 2 new test cases under v54-01-03 describe block |

---
*Phase: v54-01-picker-bootstrap-and-thead-hotfix, Plan: 03*
*Completed: 2026-05-09*
*Status: LOOP COMPLETE — PENDING-UAT*
