# Cycle-9 Hardening Lane A — Unit-test baseline TRIAGE

**Author:** coder-2 (`feat/cycle9-hardening-a-test-baseline`, cut from `edb24a47c`)
**Date:** 2026-05-20
**Suite:** `npm run test` (unit, vitest) — NOT emulator.

## Baseline measured (at `edb24a47c`, fresh worktree)

```
Test Files  12 failed | 183 passed | 3 skipped (198)
     Tests  66 failed | 2043 passed | 41 skipped (2150)
     Errors  1 error (unhandled DexieClosedError leak — see Cluster 7)
```

The prompt's file list (from stale gate notes) was imprecise. The ACTUAL
12 failing files / 66 failures resolve into **6 root-cause clusters + 1
unhandled-rejection leak**. **5 of 6 clusters are stale tests/mocks that
never caught up with intentional production changes — ZERO are production
regressions.** Only Cluster 1 is large.

## Failure-count by file

| failures | file | cluster |
|---|---|---|
| 13 | SetlistGrid.a11y.test.tsx | 1 |
| 11 | SetlistGrid.contextmenu.test.tsx | 1 |
| 9 | src/lib/sync-engine.test.ts | 2 |
| 7 | src/hooks/__tests__/use-library.test.ts | 3 |
| 7 | src/app/api/library/__tests__/upload-musescore.test.ts | 4 |
| 6 | SetlistGrid.edit.test.tsx | 1 |
| 5 | SetlistGrid.undo.test.tsx | 1 |
| 3 | SetlistGrid.dnd.test.tsx | 1 |
| 2 | SetlistGrid.read.test.tsx | 1 |
| 1 | SetlistGrid.fileId-on-pick.test.tsx | 1 |
| 1 | smart-score-viewer.test.tsx | 5 |
| 1 | a11y/touch-targets.test.tsx | 6 |

## Clusters

### Cluster 1 — SetlistGrid table→card refactor left integration tests asserting dead DOM  (41 failures, 7 files)  **LARGE — split candidate**

**Root cause:** `SetlistGrid.tsx` was intentionally unified to render
**`MobileCardList` only** for both desktop + iPad (see in-file comments:
"BatchActionBar removed — multi-select no longer a feature", "one code
path across desktop + iPad"). The old desktop `<table>` path —
`SortableRow` (`<tr role="row">`), `useReactTable`/`getRowModel`,
`DndContext`, `DragHandleCell` (`data-testid="drag-handle"`) — is now
**fully dead code** (defined but never rendered: zero `<SortableRow`,
`<table`, `getRowModel()`, `<DndContext>` in JSX).

The 7 failing test files were written against that table DOM and never
updated. Dominant signature: `Unable to find [data-testid="drag-handle"]`
(30×), plus `Unable to find role="row"` and `Unable to find a label
"Track title"/"Track key"/"Track lead musician"` (cell-editor opened off
a table row that no longer exists). The card-specific tests
(`MobileCardList.test`, `MobileRowCard.test`, `AddBar.test`, …) ALL PASS,
confirming the card UI is real + correct. `SetlistGrid.selection.test` is
already `describe.skip`'d (multi-select was removed).

**Fix:** rewrite the 7 files to drive the card DOM — `mobile-card-{id}`,
`mobile-card-handle-{id}`, `mobile-card-context-menu-{edit,bind-chart,
duplicate,delete}`, card aria-labels — instead of table testids. The
behaviors under test (context menu, cell edit, undo/redo, drag-reorder,
delete-confirm, bind-chart, fileId-on-pick) all still exist in card form,
so this is real test value, not deletion. Any behavior that genuinely no
longer exists (e.g. multi-select) gets `.skip` + reason.

**Production code:** correct as-is. No SetlistGrid.tsx change expected
(would only touch it if a rewrite surfaces a real card bug).

### Cluster 2 — sync-engine Firestore mock missing `.where()` chain  (9 failures, 1 file)  **small, test-only**

**Root cause:** `sync-engine.ts:~100` runs a concurrent-run guard
`db.collection('sync_runs').where(...)...`. The test's `createMockCollection`
returns an object with `.doc/.select/.get` but **no `.where/.orderBy/.limit`**
→ `TypeError: db.collection(...).where is not a function`.
**Fix:** make the mock collection chainable (`where/orderBy/limit` return
the collection; terminal `.get()` resolves `{empty:true,docs:[]}`).

### Cluster 3 — use-library `vi.mock('@/lib/firebase')` missing `db` export  (7 failures, 1 file)  **small, test-only**

**Root cause:** `useLibrary` imports `db` from `@/lib/firebase`; the mock
factory omits it → `[vitest] No "db" export is defined on the
"@/lib/firebase" mock`.
**Fix:** add `db` (+ any `collection/query/where/onSnapshot` it touches)
to the mock factory.

### Cluster 4 — upload-musescore sends `application/octet-stream` after G-7 tightening  (7 failures, 1 file)  **small, test-only**

**Root cause:** `library-upload.ts` G-7 (documented, intentional) rejects
`application/octet-stream` with 400 ("a real mimeType is required").
MuseScore MIME types `application/x-musescore` (.mscz) /
`application/x-musescore+xml` (.mscx) ARE in `ALLOWED_TYPES`; the pipeline
converts by extension. But the test's `createUploadRequest` defaults
`mimeType='application/octet-stream'`, so MuseScore uploads 400 before the
conversion branch → `expected 400 to be 201/422`. The sibling
`.doc/.exe` rejection test (also octet-stream) PASSES, confirming G-7 is
the gate.
**Fix:** test passes the correct MuseScore MIME per extension. No prod
change (G-7 is intentional).

### Cluster 5 — smart-score-viewer TransposeCalculator init-order assertion  (1 failure, 1 file)  **tiny, investigate**

**Root cause (provisional):** the order test fails `tcIndex >= 0` (-1) —
`new TransposeCalculator()` not captured by the per-test mock impl.
`SmartScoreViewer` sets TC only inside a lazy `if (!osmdRef.current)`
init branch (`SmartScoreViewer.tsx:57-66`), so capture is race-sensitive.
Test 1 ("assigns TC") + test 3 ("Sheet.Transpose") PASS; only the order
assertion fails. **Fix:** confirm exact cause by running in isolation;
likely a brittle-assertion test fix (don't weaken the real init contract).

### Cluster 6 — touch-targets reads stale perform-page path post RSC split  (1 failure, 1 file)  **tiny, test-only**

**Root cause:** UNAUTH-009 (`ca221b67f`) split
`/perform/setlist/[id]/page.tsx` into server `page.tsx` + client
`SetlistPerformClient.tsx`. The back link MOVED to
`SetlistPerformClient.tsx:137-139` and is STILL 44px-compliant
(`href={backHref}` … `className="h-11 w-11 …"`). The test still reads the
old `page.tsx` source → regex no longer matches.
**Fix:** repoint the source-level assertion at `SetlistPerformClient.tsx`.
The a11y guarantee itself holds — no UI fix needed.

### Cluster 7 — unhandled DexieClosedError leak (1 reported error, not a test failure)

`property-failures.test.ts` ("AC-5: offline edits drain") leaks a
`DatabaseClosedError` unhandled rejection after the test completes —
async Dexie work outstanding past teardown. Doesn't fail a test but
vitest flags it ("might cause false positives"). Low priority; will
address if cheap (await/teardown the offline queue) else note in
SHIP-NOTICE.

## Proposed plan

1. **Now (no split needed):** fix Clusters 2,3,4,6 (24 failures) — pure
   mechanical test/mock updates, all unambiguously in-lane.
2. **Investigate + fix Cluster 5** (1) and **Cluster 7** (leak).
3. **Cluster 1 (41):** large but independent (all test files under one
   component dir; SetlistGrid.tsx is this lane's mandate, low cross-lane
   contention). **Recommend keeping it in THIS lane** for coherence —
   it's mechanical (swap table testids → card testids). Flagging per
   protocol so supervisor can split to a sibling lane if preferred.

**Commits** grouped by cluster for readable history. Target: `npm run
test` honest-green (0 fail) or every residual a justified `.skip`.
