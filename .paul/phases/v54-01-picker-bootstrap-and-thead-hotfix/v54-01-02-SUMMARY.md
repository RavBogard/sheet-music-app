---
phase: v54-01-picker-bootstrap-and-thead-hotfix
plan: 02
subsystem: ui-substrate, sync-engine-adjacent
tags: [hotfix, perform-view, fileId, songId, regression, uat]

requires:
  - phase: v54-01-picker-bootstrap-and-thead-hotfix
    provides: songs/{libId} where id === fileId === library_index doc id
provides:
  - handlePickSong + handleBindChart now write track.fileId alongside track.songId
  - Regression test src/components/setlist/grid/__tests__/SetlistGrid.fileId-on-pick.test.tsx pinning the contract
affects:
  - SetlistRow.tsx perform-view click handler (now finds track.fileId on newly-picked tracks)

duration: ~10min
started: 2026-05-08T17:50:00Z
completed: 2026-05-08T18:00:00Z
---

# Phase v54-01 Plan 02: fileId on picker writes (UAT regression hotfix)

**One-line fix in 2 places — handlePickSong and handleBindChart now write `track.fileId = song.id` alongside `track.songId = song.id` so newly-picked tracks are clickable in perform-view.**

## UAT trigger

Daniel during v54-01 PENDING-UAT, 2026-05-08:

> "Problem: when I go to perform for a setlist I just made I can't click on them to open the charts."

This is exactly the v51-04 codified pattern — UAT failure routes to a follow-up plan in the same phase.

## Root cause

`src/components/setlist/grid/SetlistRow.tsx:47`:
```ts
const hasFile = isSong && !!track.fileId
const isInteractive = hasFile || isLeader
```

Perform-view clickability is gated on `track.fileId`. But v54-01-01's `handlePickSong` (`SetlistGrid.tsx:1448-1485`) wrote tracks with `songId` only — no `fileId`. Same gap in `handleBindChart` (`SetlistGrid.tsx:1082-1101`).

Pre-v54-01 the picker was empty (`songs/*` collection unbootstrapped — see v54-01-01-SUMMARY) so this code path was effectively dead. v54-01-01 enabled it; the missing `fileId` write surfaced immediately on Daniel's first new-setlist UAT.

Existing legacy tracks (the 385 back-stitched in v54-01-01) already have `fileId` preserved from before, so they continued to work in perform-view. The bug ONLY hit tracks created post-v54-01-01 via the picker.

## Fix

Per v54-01-01 locked decision, `songs/{libId}` uses the library_index doc id directly as both `songs/{id}.id` AND `songs/{id}.fileId`. Therefore in both write paths, `song.id IS the fileId`. Adding one line to each:

1. **`handlePickSong`** (`SetlistGrid.tsx:1448-1485`): added `fileId: song.id` to the `applyEdit('set','tracks',doc)` payload.
2. **`handleBindChart`** (`SetlistGrid.tsx:1082-1101`): added `fileId: sel.songId` to the `applyEdit('update','tracks',patch)` patch.

## Regression test

New file: `src/components/setlist/grid/__tests__/SetlistGrid.fileId-on-pick.test.tsx` (2 tests, FakeIndexedDB + real SetlistGrid mount).

1. **Pick path:** seed Dexie songs with one library entry → mount SetlistGrid → open `+ Song` picker → click library entry → assert outbox has `op:'set'` with `{ songId, fileId, title, type:'song' }` all populated, fileId === songId.
2. **Bind path:** seed one free-text track + one library song → mount → open ChartBindPopover → pick library entry → assert outbox has `op:'update'` patch with both `songId` and `fileId` set.

Pre-fix: both tests fail on `expect(payload.fileId).toBe(...)` — `Received: undefined`. Post-fix: both pass.

## Verification

| Check | Result |
|---|---|
| Regression test (2 cases) | ✅ Pass |
| Full grid suite | ✅ 173 / 173 pass (+2 over 171 baseline) |
| tsc --noEmit | ✅ No errors |
| Boundary check: only SetlistGrid.tsx + new test file modified | ✅ |

## Daniel UAT (next)

Push deploys via Vercel auto-deploy. Daniel re-runs UAT against new commit:
1. Open existing setlist (must already work — back-stitch covered legacy tracks).
2. Create new setlist; pick a song from `+ Song` picker; navigate to perform mode; tap row → chart opens.
3. ChartBindPopover re-bind on a free-text track; navigate to perform; tap → chart opens.

If any of (1)/(2)/(3) fails, route to v54-01-03 follow-up plan.

## Patterns reaffirmed

- **v51-04 UAT-failure routing:** UAT bug → follow-up plan in same phase (v54-01-02 created mid-PENDING-UAT, not blocking other v5.4 phases).
- **Single-source invariant:** v54-01-01 locked `songs.id === songs.fileId === library_index.id`. Both consumer write paths must respect this — the fix enforces it explicitly rather than relying on perform-view to fall back to songId.
- **Test-first regression:** failing test written before fix, asserted on the exact field, made the verification deterministic.

---
*Phase: v54-01-picker-bootstrap-and-thead-hotfix, Plan: 02*
*Completed: 2026-05-08*
*Status: LOOP COMPLETE — PENDING-UAT*
