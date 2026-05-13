---
phase: v60-07-writer-removal-strip
plan: 01
subsystem: ui-library
tags: [dual-write-bridge, applyEdit, engine-path, library-add-to-setlist, writer-removal]

requires:
  - phase: v60-04-01
    provides: getTracksForSetlist server reader (ensures the engine-path writes are visible to all server-side readers)
  - phase: v60-05-01
    provides: getTracksForSetlistClient (ensures the engine-path writes are visible to all client-side readers)
  - phase: v60-06-08
    provides: backfill tool for historical setlists (ensures pre-existing setlists can be hydrated before/after this writer change)
provides:
  - mirrorTracksToTopLevel dual-write bridge DECOMMISSIONED
  - Library "Add to setlist" flow writes exclusively to top-level tracks/{id} + denormalized parent-doc fields
  - Pattern template for v60-07-NN: engine-path applyEdit fanout + denormalization-only parent update
affects:
  - v60-07-02 (setlist-firebase.ts createSetlistService W1-W6 writers) — same template applies
  - v60-07-NN (API route writers W7-W11) — same template applies
  - v60-08 cleanup — once all writers are engine-path-only, the embedded-array reader fallback in server-tracks.ts + client-tracks.ts can be dropped

tech-stack:
  added: []
  patterns:
    - "Engine-path-only write pattern for hook-level dual-write decommissioning: per-track applyEdit('set'|'delete', 'tracks', ...) via Promise.all with `{ withoutUndo: true }` (toast Undo affordance is the user-facing inverse), plus a single denormalization-only setlistService.updateSetlist({trackCount, hydrated: true}) on the parent doc — no `tracks` field. Subsequent v60-07-NN plans follow this template."
    - "Test contract migration pattern for writer refactors: when production tests assert on the OLD mock contract (e.g., `mockUpdateSetlist.mock.calls[0][1].tracks`), update existing tests to assert the NEW contract (mockApplyEdit captures the fanout; mockUpdateSetlist receives only denorm fields). Test maintenance, not adding new tests."

key-files:
  created: []
  modified:
    - src/hooks/use-add-to-setlist.ts
    - src/hooks/__tests__/use-add-to-setlist.test.ts

key-decisions:
  - "Targeted W24 (mirrorTracksToTopLevel) as the first v60-07 writer-removal because (a) it's the only EXPLICIT dual-write bridge in the audit, (b) v5.4 close-notes explicitly called it out for v6.0 decommissioning, and (c) it's the smallest blast radius — single file, hook-level"
  - "Always write hydrated:true on the parent-doc denorm update — even if the setlist was previously unhydrated, this flow now produces top-level rows, so the setlist IS hydrated"
  - "Undo handler reads current setlist via subscribeToSetlist for fresh trackCount, then applies decrement — avoids stale-closure arithmetic if user makes other edits between add + undo"
  - "/ui-ux-pro-max gate satisfied transitively (loaded earlier this session); pure write-path refactor with NO visual/styling/copy changes"

patterns-established:
  - "v60-07 writer-removal template: replace `setlistService.updateSetlist({tracks: updatedTracks, trackCount})` with `Promise.all(newTracks.map(t => applyEdit({op: 'set', collection: 'tracks', doc: {...t fields...}}, {withoutUndo: true})))` followed by `setlistService.updateSetlist(id, {trackCount, hydrated: true}, expected)` for the parent denorm. Inverse (delete) for undo paths uses `applyEdit({op: 'delete', collection: 'tracks', docId, expectedUpdatedAt: undefined}, {withoutUndo: true})`."
  - "When refactoring a write surface that has existing tests pinning the OLD mock contract: add a new mock for the new write surface (e.g., mockApplyEdit) BEFORE updating individual test assertions; this lets the unchanged tests (e.g., 'closes the sheet after adding', 'shows toast') pass without modification while only the contract-asserting tests need rewrites."

duration: ~20min (single-task plan + 1 test-fixture iteration after contract drift detected)
started: 2026-05-13T09:30:00-05:00
completed: 2026-05-13T09:50:00-05:00
---

# Phase v60-07 Plan 01: Decommission mirrorTracksToTopLevel dual-write bridge

**Library "Add to setlist" flow (`use-add-to-setlist.ts`) now writes EXCLUSIVELY to top-level `tracks/{id}` via the engine + a denormalization-only parent-doc update. The explicit dual-write bridge `mirrorTracksToTopLevel` from the v5.4 P0-fix era is removed. First of ~3-4 v60-07 writer-removal plans; establishes the template for subsequent plans (setlist-firebase.ts W1-W6 + API routes W7-W11).**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~20 min (research + refactor + 1 test-fixture iteration) |
| Started | 2026-05-13T09:30:00-05:00 |
| Completed | 2026-05-13T09:50:00-05:00 |
| Tasks | 1 of 1 (DONE/PASS after qualify) |
| Files modified | 2 (1 production hook + 1 test file) |
| Net source LOC | +14 (production) / +35 (test fixtures rewritten in-place) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: mirrorTracksToTopLevel function removed | ✅ Pass | `grep mirrorTracksToTopLevel src/hooks/use-add-to-setlist.ts` returns 0 matches |
| AC-2: addToSetlist uses engine-path-only writes | ✅ Pass | Promise.all(applyEdit('set', 'tracks', ...)) with order/setlistId/songId/fileId/title/type/key?/notes? + denorm-only updateSetlist({trackCount, hydrated: true}) |
| AC-3: addDirectlyToSetlist uses engine-path-only writes | ✅ Pass | Same pattern as addToSetlist |
| AC-4: Undo handler uses engine-path-only writes | ✅ Pass | Promise.all(applyEdit('delete', 'tracks', docId)) + trackCount decrement; no embedded tracks field written |
| AC-5: applyEdit calls use withoutUndo for fanout | ✅ Pass | All 3 fanout sites + the delete fanout pass `{ withoutUndo: true }`; toast Undo is the user-facing inverse |
| AC-6: tsc + next build clean; suite baseline preserved | ✅ Pass | tsc EXIT=0; next build Compiled successfully; vitest 1613 pass / 52 fail — EXACT baseline match |
| AC-7: LOC ≤ +30 | ✅ Pass | +14 LOC net production (+90 ins / -76 del); 53% under ceiling |
| AC-8: PENDING-UAT — library Add-to-setlist on hydrated + unhydrated setlists | ⏳ Deferred | Daniel uses library Add-to-setlist; verifies editor + dashboard + Undo affordance. Joins v6.0 PENDING-UAT bundle. |

## Accomplishments

- **Explicit dual-write bridge DECOMMISSIONED.** `mirrorTracksToTopLevel` was the only function in the audit explicitly labeled "the start of the dual-write bridge v6.0 will decommission" (per v5.4 close-notes for `4ee6e70`). It's gone. The library Add-to-setlist flow now writes top-level only.
- **v60-07 writer-removal template established.** Subsequent plans (setlist-firebase.ts W1-W6, API routes W7-W11) follow the same shape: `Promise.all(applyEdit('set', 'tracks', ...))` for per-track writes + `updateSetlist({trackCount, hydrated: true})` for parent-doc denormalization. The "no `tracks` field on the parent" contract is now load-bearing.
- **Test contract migration pattern documented.** When existing tests pin the OLD mock contract via assertions on `mockUpdateSetlist.mock.calls[0][1].tracks`, the migration pattern is: (a) add a new mock for the new write surface (`mockApplyEdit`), (b) keep unchanged tests passing without modification (the bare `applyEdit` mock satisfies their needs), (c) only rewrite the contract-asserting tests to use both mocks. 5 of 11 existing tests required rewrites; 6 stayed untouched.
- **Engine path active for library Add flow.** Sync engine now handles the library Add-to-setlist writes: undo/redo discipline, reconciliation, retries, all the v50-05 invariants. The hook no longer has its own dual-write bookkeeping.

## Task Commits

Single combined commit per session precedent:

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Task 1 + test updates + SUMMARY + STATE/ROADMAP docs | (see Git State in STATE.md after push) | feat(v60-07-01) | mirrorTracksToTopLevel removed + 3 write paths refactored to engine-path-only + 6 test fixtures updated |

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/hooks/use-add-to-setlist.ts` | Modified (+14 net; +90/-76) | mirrorTracksToTopLevel helper removed; addToSetlist + addDirectlyToSetlist + undo onClick refactored to Promise.all(applyEdit) + denorm-only updateSetlist |
| `src/hooks/__tests__/use-add-to-setlist.test.ts` | Modified | mockApplyEdit added; 5 addToSetlist tests rewritten to assert new contract; undo test rewritten to assert applyEdit('delete', ...) instead of mockUpdateSetlist.tracks |
| `.paul/phases/v60-07-writer-removal-strip/v60-07-01-PLAN.md` | Created | Plan artifact |
| `.paul/phases/v60-07-writer-removal-strip/v60-07-01-SUMMARY.md` | Created | This file |
| `.paul/STATE.md` | Modified | Loop position → UNIFY ✓; phase v60-07 progress updated |
| `.paul/ROADMAP.md` | Modified | v60-07 row reflects v60-07-01 closure |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Target W24 (mirrorTracksToTopLevel) as first v60-07 plan | Smallest blast radius (1 file, hook-level), only EXPLICIT dual-write bridge in the audit, v5.4 close-notes flagged it for v6.0 decommissioning | Sets the template for subsequent v60-07 plans without committing to the more disruptive setlist-firebase.ts W1-W6 surgery in the first plan |
| Always set `hydrated: true` in the parent-doc denorm update | Even if the setlist was previously unhydrated, this flow now produces top-level rows, so by definition the setlist IS hydrated post-write | Eliminates a future "unhydrated setlist with top-level tracks" data state that would confuse the lazy-hydration cascade gate |
| Undo handler reads current setlist freshly via subscribeToSetlist for trackCount | Avoids stale-closure arithmetic if user makes other edits between add + undo (e.g., manually deletes one of the added tracks before clicking Undo) | trackCount math stays accurate; the Math.max(0, ...) clamp prevents going negative if state drifted |
| Update existing tests in-place vs deleting them | Tests still cover valid user-facing behavior (sheet closes, toast fires, duplicate-warning, batch-add, undo-removes-only-added); only the mock contract changed | Coverage preserved; no test-debt introduced; pattern documented for future writer-removal plans |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | Test fixture contract drift (existing tests pinned old mock shape) — updated to new contract |
| Scope additions | 0 | — |
| Deferred | 0 | — |

**Total impact:** Single test-fixture maintenance cycle. All functional ACs PASS. Vitest baseline EXACTLY restored.

### Auto-fixed Issues

**1. [TEST] use-add-to-setlist.test.ts contract drift on 6 tests**
- **Found during:** Task 1 qualify — full vitest run after the production refactor showed 6 new failures in `src/hooks/__tests__/use-add-to-setlist.test.ts` (1613 → 1607 pass, 52 → 58 fail).
- **Issue:** Existing tests asserted the OLD contract via `mockUpdateSetlist.mock.calls[0][1].tracks` — checking the embedded `tracks` array passed to the parent-doc update. The v60-07-01 refactor intentionally removes that field. Plan's "no new tests" boundary did NOT contemplate existing test fixtures needing migration to the new contract. Test maintenance vs new tests — distinct concerns.
- **Fix:** Added `mockApplyEdit` mock at file top (vi.mock for `@/lib/local/write`); rewrote 5 of the addToSetlist tests + the undo test to assert via `mockApplyEdit.mock.calls` (per-track applyEdit) AND `mockUpdateSetlist.mock.calls` (denorm-only update with no `tracks` field). 5 tests stayed unchanged (sheet open/close, permissions, sorting, filter, loading) because they don't touch the write contract.
- **Files:** `src/hooks/__tests__/use-add-to-setlist.test.ts`
- **Verification:** Targeted test file run → 15/15 pass; full suite → 1613/52 EXACT baseline restored; zero net new failures.
- **Commit:** part of the v60-07-01 single combined commit.

### Deferred Items

None — plan executed cleanly aside from the auto-fixed test-fixture migration.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| 6 existing tests asserted OLD contract via `mockUpdateSetlist.mock.calls[0][1].tracks` | Added mockApplyEdit; rewrote contract-asserting tests; non-contract tests left untouched. Pattern documented in patterns-established. |

## Skill Audit

| Expected | Invoked | Notes |
|----------|---------|-------|
| /ui-ux-pro-max | ✓ | Loaded earlier this session (v60-06-03 APPLY); transitively satisfied. Cleared as no-op — zero visual/layout/styling/copy changes; pure write-path semantic refactor. Toast strings + Undo affordance preserved verbatim. |

All required skills invoked ✓.

## Next Phase Readiness

**Ready (remaining v60-07 plans):**
- **v60-07-02** — setlist-firebase.ts W1-W6 writers (`createSetlistService` methods: createSetlist + updateSetlist + duplicateSetlist + cloneSetlist + cloneForNextWeek + saveAsTemplate). Bigger blast radius (6 service methods, multiple call-sites across the app). Each needs the engine-path-only refactor — create new setlists by seeding top-level tracks; update setlists by writing trackCount/hydrated only (no `tracks` field) AND `tracks: FieldValue.delete()` for the "immediate strip" mandate.
- **v60-07-03** — API route writers W7-W11 (publish, rename, transfer, delete, import/execute). Server-side strips of the embedded `tracks` field; these routes are simpler than the service methods (no createSetlist seed problem) but each needs `FieldValue.delete()` on the patch.
- **v60-07-NN** — composite writer cleanup if needed; the createNewSetlist function in use-add-to-setlist.ts (uses W1 createSetlist) will pick up v60-07-02's W1 change automatically.

**Concerns:**
- The v60-06-08 backfill `--apply` is still PENDING-UAT (Daniel runs during Mon–Wed window). Until that runs, 5 historical setlists (uBkulVkN, tIJ5Dlvk, IvowaTdX, fgxquthW, 9bmwUMJz) still have only embedded `tracks[]` data. v60-07-01 only changed the library Add-to-setlist flow — it doesn't touch reads, and the historical setlists are read via the embedded fallback branch. No data-loss risk from this plan, but v60-07-02 + v60-07-03 should consider the same hydration gate (`setlist.hydrated === true` check before stripping embedded data on update).
- Tests for `addDirectlyToSetlist` are NOT covered by the test file (only `addToSetlist` + undo). Future test additions could close that gap; deferred per the plan boundary.

**Blockers:**
- None for v60-07-02.
- **v6.0 PENDING-UAT carry:** Daniel uses library Add-to-setlist on a hydrated setlist + an unhydrated setlist; verifies editor + dashboard + Undo. Joins v5.0 / v5.2 / v5.3 / v5.4 / v60-01..06-08 PENDING-UAT bundle.

---
*Phase: v60-07-writer-removal-strip, Plan: 01*
*Completed: 2026-05-13*
