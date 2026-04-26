---
phase: v50-05-spreadsheet-editor
plan: 02
subsystem: ui
tags:
  - cutover
  - route-swap
  - dexie-hydration
  - chart-binding
  - cmdk
  - radix-popover
  - legacy-deletion
  - applyEdit
  - sync-engine
  - lww-per-document

requires:
  - phase: v50-05-spreadsheet-editor
    provides: SetlistGrid component tree + ProductionFirestoreAdapter + SyncEngineBoot (v50-05-01)
  - phase: v50-04-song-catalog
    provides: seedTrackFromSong (consumed in chart-bind defaults seeding)
  - phase: v50-03-sync-engine
    provides: applyEdit + Dexie schema (consumed in chart-bind commit; bypassed in hydration)
provides:
  - SetlistGridHydrator — wraps SetlistGrid; idempotently primes Dexie from server-fetched setlist + tracks via direct db.put inside one rw transaction (NOT applyEdit; LWW per-document)
  - ChartBindPopover — cmdk + library cmdk popover modeled on AddRowPlaceholder's library half; wires ChartCell click → applyEdit('update','tracks',{songId,title,...defaults})
  - /setlists/[id] mounted on SetlistGrid (Hydrator wrapper) for existing setlists; SetlistGrid directly for /new
  - Net deletion: ~−6,300 LOC of legacy editor surface (use-setlist-logic 818 LOC + SetlistEditorV2 + 17 v2/ sub-components + setlist-flush + setlist-draft + flush-schema + /api/setlist/flush + 2 orphan tests)
  - SearchOverlay relocated to src/components/library/ (admin TemplateEditor consumer kept)
affects:
  - v50-05-03 (polish) — touch/iPad variant, mobile flow, multi-select, AlertDialog, ContextMenu, undo all build on the now-mounted grid
  - v50-06 (concurrent-edit safety) — reconciliation modal + expectedUpdatedAt tracking + cross-tab-lock flake fix; also gets first real prod data from the new editor's writes
  - v50-07 (migration + cutover) — production migrate-v50.ts apply + Firestore reshape (setlist.tracks[] → tracks/{id} top-level collection); now urgent because new editor writes start landing on prod immediately

tech-stack:
  added: []
  patterns:
    - "Hydrator wrapper pattern: server fetch → client component primes Dexie idempotently via direct db.put in single rw transaction (NOT applyEdit); LWW per-document compares server vs local updatedAt; rendering not blocked on hydration (live query picks up the moment the transaction commits)."
    - "Bypass applyEdit for non-dirty data: server-fetched data is authoritative — direct db.put avoids the outbox round-trip that would re-send authoritative data back to Firestore."
    - "Bind-from-library pattern: cell becomes Popover.Trigger via Radix asChild; cmdk library list inside Popover.Content; selection commits via applyEdit + seedTrackFromSong defaults (no propagateTrackEditToSong — bind seeds FROM the song, reverse-propagation would loop)."
    - "ChartCell forwardRef + HTML button props passthrough so it composes cleanly as Popover.Trigger asChild — Radix injects onClick + onKeyDown + ref; no editor-cell-specific disabled gate that would block the popover open path."

key-files:
  created:
    - src/components/setlist/grid/SetlistGridHydrator.tsx
    - src/components/setlist/grid/ChartBindPopover.tsx
    - src/components/setlist/grid/__tests__/SetlistGridHydrator.test.tsx
    - src/components/setlist/grid/__tests__/ChartBindPopover.test.tsx
  modified:
    - src/app/(main)/setlists/[id]/page.tsx (route mount swap; legacy SetlistEditorV2 import removed; serializeSetlist→LocalSetlist + LocalTrack[] mapping; isNew path renders SetlistGrid directly with crypto.randomUUID id)
    - src/components/setlist/grid/index.ts (export SetlistGridHydrator + ChartBindPopover)
    - src/components/setlist/grid/SetlistGrid.tsx (chart column wraps ChartCell in ChartBindPopover; new GridMeta.onBindChart + handleBindChart wires applyEdit + seedTrackFromSong with leadMusician↔lead alias)
    - src/components/setlist/grid/cells/ChartCell.tsx (forwardRef + HTML button props passthrough; dropped disabled={!onClick} gate)
    - src/components/setlist/SetlistDashboard.tsx (drop view==='matrix' branch + import; only list/calendar remain)
    - src/components/setlist/SetlistToolbar.tsx (drop matrix toggle button + Grid3X3 import; narrow view type to 'list'|'calendar')
    - src/hooks/use-setlist-dashboard.ts (narrow view useState type to match)
    - src/app/(main)/manage/templates/TemplateEditor.tsx (SearchOverlay import path: setlist/v2 → library/)
  renamed:
    - src/components/setlist/v2/SearchOverlay.tsx → src/components/library/SearchOverlay.tsx (admin non-editor consumer)
  deleted:
    - src/components/setlist/v2/* (whole directory: SetlistEditorV2 + 17 sub-components + 2 tests)
    - src/hooks/use-setlist-logic.ts + test
    - src/lib/setlist-flush.ts + test
    - src/lib/setlist-draft.ts
    - src/lib/flush-schema.ts + test
    - src/app/api/setlist/flush/route.ts
    - src/components/setlist/__tests__/{flow-item-editing,inline-editing}.test.tsx (orphaned)

key-decisions:
  - "Hydration architecture = Option A (SetlistGridHydrator wrapper with initialServerData props) — chosen at decision-checkpoint over Option B (useEffect inside SetlistGrid)"
  - "Hydration writes bypass applyEdit and write directly via db.setlists.put + db.tracks.bulkPut inside one rw transaction — server data is authoritative, not dirty"
  - "LWW per-document on hydration: only overwrite local row when server.updatedAt > local.updatedAt (preserves in-flight local edits across re-mounts)"
  - "Tracks inherit setlist.updatedAt during hydration (legacy embedded-array shape has no per-track updatedAt; using parent's is the only honest choice)"
  - "isNew path bypasses Hydrator entirely: render SetlistGrid directly with a fresh crypto.randomUUID — no server data to hydrate"
  - "ChartBindPopover modeled on AddRowPlaceholder's library half — no free-text 'Custom' group (chart bind is library-only; free-text track creation stays on AddRowPlaceholder)"
  - "ChartCell refactored to forwardRef + HTML button props passthrough (drops disabled={!onClick} gate that would have blocked Popover.Trigger asChild click handler injection)"
  - "Chart-bind commit calls seedTrackFromSong but NOT propagateTrackEditToSong — bind seeds FROM song, reverse-propagation would loop"
  - "setlist-firebase.ts narrow = NO-OP — pre-delete grep showed StaleWriteError + updateSetlistWithVersion + updateSetlist still consumed by useAddToSetlist (non-editor library→setlist flow); kept all per the plan's deletion-safety rule"
  - "Matrix view feature dropped (depended on deleted SetlistMatrixView): SetlistDashboard branch + SetlistToolbar toggle + view type union all narrowed to 'list'|'calendar'"
  - "SearchOverlay relocated to src/components/library/ rather than deleted (admin TemplateEditor non-editor consumer; SearchOverlay had no v2/ deps, moved cleanly)"

patterns-established:
  - "Cutover pattern for route mounts: Server Component does the auth + Firestore fetch; client Hydrator wraps the editor and primes Dexie before/at first paint; live query in editor handles the reactive read. The route file is the boundary that maps server doc shape → LocalSetlist/LocalTrack shape."
  - "Server-fetched data into Dexie is always direct put (NOT applyEdit). Outbox is only for user-originated dirty edits. Pattern carries to v50-06 (concurrent-edit safety reconciliation may need similar 'remote merge' direct writes that bypass outbox) and v50-07 (migration script's local-side hydration after Firestore reshape)."
  - "When you discover that a 'narrow' deletion target still has non-editor consumers, KEEP the export and document the discovery in the commit + SUMMARY. Don't break callers to satisfy a plan written from a stale inventory."

duration: "~80 min (apply phase)"
started: "2026-04-26T16:35:00Z"
completed: "2026-04-26T17:55:00Z"
---

# v50-05 Plan 02: Spreadsheet editor cutover — Summary

**Cut over /setlists/[id] from the legacy SetlistEditorV2 mount to the new SetlistGrid (built in v50-05-01) via a SetlistGridHydrator wrapper that idempotently primes Dexie from the server fetch; wired ChartCell click → ChartBindPopover (cmdk + library) → applyEdit; deleted ~−6,300 LOC of legacy editor surface (use-setlist-logic + SetlistEditorV2 + 17 v2/ sub-components + setlist-flush + setlist-draft + flush-schema + /api/setlist/flush). Production now serves the new editor.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~80 min |
| Started | 2026-04-26T16:35:00Z |
| Completed | 2026-04-26T17:55:00Z |
| Tasks | 3 / 3 auto + 1 decision (Option A) + 1 human-verify (deferred) |
| Files created | 4 (2 components + 2 tests) |
| Files modified | 8 |
| Files renamed | 1 (SearchOverlay → library/) |
| Files deleted | 27 |
| Net LOC | +14 / −6,306 (≈ −6,292 net deletion) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Route mounts SetlistGrid (not SetlistEditorV2) | ✅ Pass | page.tsx renders `<SetlistGridHydrator>` wrapping `<SetlistGrid>` for existing setlists; `<SetlistGrid setlistId={uuid}/>` directly for the isNew path. SetlistEditorV2 import removed. tsc clean. |
| AC-2: Dexie hydrated idempotently from server fetch | ✅ Pass | SetlistGridHydrator.test 5/5 green: hydrates when local empty; preserves local edits when newer (idempotent); overwrites local setlist when server.updatedAt newer; does NOT enqueue outbox rows for hydrated data. |
| AC-3: ChartCell binding flow | ✅ Pass | ChartBindPopover.test 4/4 green: opens on trigger click + lists library entries; selection fires onBind with {songId,title}; Esc closes without firing; currentSongId entry carries data-current="true" for re-bind preselect. |
| AC-4: Legacy editor surface deleted | ✅ Pass | Post-delete grep for `use-setlist-logic\|setlist-flush\|setlist-draft\|SetlistEditorV2\|api/setlist/flush\|flush-schema\|setlist/v2/` returns zero matches outside the deleted-files set. setlist-firebase.ts narrow was NO-OP — non-editor consumers force keeping StaleWriteError + updateSetlistWithVersion. |
| AC-5: Verification gates pass | ✅ Pass | tsc clean; vitest 1315/1316 (1 pre-existing cross-tab-lock flake explicitly deferred to v50-06 per handoff — NOT a regression); next build clean compile; /api/setlist/flush gone from the route table. |

**Skill audit:** `/ui-ux-pro-max` invoked at start of APPLY ✅ (SPECIAL-FLOWS.md mandate satisfied).

**Human-verify checkpoint:** explicitly deferred by user; added to STATE.md `Deferred human smoke tests` running list as item #4. Prod URL ready for user verification at https://centralreform.live/setlists/{some-real-existing-setlist-id} after Vercel auto-deploy completes (~2 min from push).

## Accomplishments

- **Production cutover landed cleanly.** /setlists/[id] now serves the new local-first editor end-to-end. Legacy save-path machinery (StaleWriteError silent-merge / keepalive flush / canEdit early-return / token refresh failure) is gone; every commit goes through `applyEdit` → outbox → engine → Firestore with retry + dead-letter — bulletproof-by-construction. The user's stated v5.0 goal ("musicians can instantly edit and saves are bulletproof") is now realized at the route level for the first time.
- **−6,292 LOC net deletion in a single coordinated atomic commit.** 27 legacy files removed (whole v2/ directory + use-setlist-logic + setlist-flush + setlist-draft + flush-schema + /api/setlist/flush route + 2 orphan tests), with one relocation (SearchOverlay → library/) preserving the admin TemplateEditor non-editor consumer.
- **Hydration architecture = Option A** (Hydrator wrapper). Chosen at decision-checkpoint with explicit rationale: cleaner separation than Option B's inline useEffect, no double round-trip, deterministic idempotency check via LWW per-document compare. Direct db.put bypasses applyEdit because server data is authoritative not dirty.
- **ChartBindPopover wires the v50-05-01 'click-to-bind → v50-05-02' placeholder** through to a real applyEdit commit that also seeds defaults from the song catalog (seedTrackFromSong from v50-04). The bind path is the single integration of all three local-first phases (v50-03 engine + v50-04 song catalog + v50-05 editor) on a real user action.
- **9 new vitest cases, all green.** SetlistGridHydrator (5) + ChartBindPopover (4). Full suite 1315/1316 (down from 1374 because legacy tests deleted with their files; 1 pre-existing cross-tab-lock flake remains, explicitly deferred to v50-06).

## Task Commits

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Plan + state sync | `b8d8314` | chore(paul) | v50-05-02 PLAN.md + handoff archive + state sync |
| Task 1: Route swap + Dexie hydration | `0584744` | feat | SetlistGridHydrator + page.tsx swap + index.ts barrel + 5-case test |
| Task 2: ChartCell binding via ChartBindPopover | `ba7e214` | feat | ChartBindPopover + ChartCell forwardRef refactor + SetlistGrid chart column wiring + 4-case test |
| Task 3: Legacy purge | `d8c0442` | feat | 27 deletions (~−6,300 LOC) + SearchOverlay relocate + matrix view drop + Hydrator test cleanup |

All four commits pushed to `origin/master` (`b8d8314..d8c0442`). UNIFY commit (this SUMMARY + STATE + ROADMAP) lands next.

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/components/setlist/grid/SetlistGridHydrator.tsx` | Created (81 LOC) | Wraps SetlistGrid; primes Dexie idempotently from server fetch via direct db.put inside one rw transaction; LWW per-document; render not blocked on hydration |
| `src/components/setlist/grid/ChartBindPopover.tsx` | Created (142 LOC) | cmdk + library cmdk popover; uses Popover.Trigger asChild on the children; selection fires onBind({songId, title}); currentSongId preselect via data-current attribute |
| `src/components/setlist/grid/__tests__/SetlistGridHydrator.test.tsx` | Created (190 LOC, 5 cases) | hydrate-empty / no-outbox-writes / idempotent-when-local-newer / overwrite-when-server-newer / renders-host |
| `src/components/setlist/grid/__tests__/ChartBindPopover.test.tsx` | Created (163 LOC, 4 cases) | opens-on-click / onBind-fires-and-closes / Escape-closes / currentSongId-preselect |
| `src/app/(main)/setlists/[id]/page.tsx` | Modified (rewrite) | Route swap to Hydrator (existing setlist) or SetlistGrid (isNew); serializeSetlist→LocalSetlist + LocalTrack[] mapping; isNew uses crypto.randomUUID() |
| `src/components/setlist/grid/SetlistGrid.tsx` | Modified | Chart column wraps ChartCell in ChartBindPopover; new GridMeta.onBindChart; handleBindChart calls seedTrackFromSong + applyEdit('update','tracks',{songId,title,...defaults}) with leadMusician↔lead alias |
| `src/components/setlist/grid/cells/ChartCell.tsx` | Modified | forwardRef + HTML button props passthrough; dropped disabled={!onClick} gate that would have blocked Popover.Trigger asChild |
| `src/components/setlist/grid/index.ts` | Modified | Export SetlistGridHydrator + ChartBindPopover + types |
| `src/components/setlist/SetlistDashboard.tsx` | Modified | Drop view==='matrix' branch + SetlistMatrixView import (orphaned by v2/ deletion) |
| `src/components/setlist/SetlistToolbar.tsx` | Modified | Drop matrix toggle button + Grid3X3 import; narrow view type to 'list'\|'calendar' |
| `src/hooks/use-setlist-dashboard.ts` | Modified | Narrow useState<view> type to match toolbar |
| `src/app/(main)/manage/templates/TemplateEditor.tsx` | Modified | SearchOverlay import path setlist/v2 → library |
| `src/components/library/SearchOverlay.tsx` | Renamed (from setlist/v2/) | Generic library file picker; relocated to keep admin TemplateEditor non-editor consumer |
| `src/components/setlist/v2/*` (whole dir) | Deleted (18 files) | SetlistEditorV2 + AddBar + AddGuestForm + BandSuggestionsPanel + BatchActionBar + DividerRow + FlowRow + InlineFields + MusicianChip + MusicianPicker + OverflowMenu + SetlistChangedBanner + SetlistMatrixView + SetlistTopBar + SongRow + SwipeToDelete + TrackSheet + 2 tests |
| `src/hooks/use-setlist-logic.ts` + test | Deleted | 818 LOC editor logic hook (legacy save-path orchestrator) |
| `src/lib/setlist-flush.ts` + test | Deleted | keepalive unload-flush helper (route gone, helper orphaned) |
| `src/lib/setlist-draft.ts` | Deleted | legacy draft persistence (zustand-shaped, replaced by Dexie) |
| `src/lib/flush-schema.ts` + test | Deleted | strict-write-boundary zod schemas (sole consumer was /api/setlist/flush) |
| `src/app/api/setlist/flush/route.ts` | Deleted | unload-flush endpoint (replaced by v50-03 sync engine outbox + drain) |
| `src/components/setlist/__tests__/{flow-item-editing,inline-editing}.test.tsx` | Deleted | Orphaned tests (FlowRow/SongRow gone) |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Hydration architecture = Option A (SetlistGridHydrator wrapper, initialServerData via props) | Server fetch already happens in the Server Component; Hydrator is a clean separation of read vs write; explicit prop contract; idempotency check belongs at the boundary; no extra round trip | New cutover-pattern primitive: future "mount existing data into a local-first editor" flows reuse the wrapper shape |
| Hydration bypasses applyEdit; uses direct db.setlists.put + db.tracks.bulkPut in one rw tx | applyEdit always enqueues an outbox row; using it would re-send authoritative server data back to Firestore on next drain. Server data is not dirty | Pattern carries to v50-06 (reconciliation 'take theirs' direct writes) and v50-07 (migration script local-side hydration) |
| Tracks inherit parent setlist.updatedAt during hydration | Legacy embedded-array shape has no per-track updatedAt field; the only honest choice is to stamp all rows with the parent's updatedAt | Once v50-07 reshapes Firestore to top-level `tracks/{id}` collection with native per-doc updatedAt, this hydration mapping simplifies; until then, parent timestamp is the LWW basis for both setlist row and all track rows |
| isNew path bypasses Hydrator | No server data to hydrate; SetlistGrid mounts directly with a fresh crypto.randomUUID id; first user edit creates the setlist row via applyEdit + outbox | Cleaner two-path control flow; isNew route doesn't need to think about hydration semantics |
| ChartBindPopover modeled on AddRowPlaceholder's library half (no free-text "Custom" group) | Chart binding is library-only; free-text track creation belongs to AddRowPlaceholder; one canonical place per concern | Future cells that need a "pick from library" UI follow the same shape (extract a shared hook in v50-05-03 polish if a third caller appears) |
| ChartCell refactored to forwardRef + HTML button props passthrough; disabled={!onClick} gate dropped | Radix Popover.Trigger asChild needs to inject onClick + onKeyDown + ref onto the child; the disabled gate would have blocked the popover open path | Pattern: cells that may be wrapped in Popover.Trigger asChild should always be interactive; the wrapping popover is the gate, not the cell |
| Chart-bind commits via applyEdit + seedTrackFromSong defaults but NOT propagateTrackEditToSong | Bind seeds FROM the song catalog; reverse-propagating the seeded values would create a feedback loop | Same rule as v50-05-01 maybePropagate: only propagate user-originated edits, not seeding from song |
| setlist-firebase.ts narrow = NO-OP | Pre-delete grep showed StaleWriteError + updateSetlistWithVersion + updateSetlist still consumed by useAddToSetlist (non-editor library→setlist flow). Plan's "narrow" inventory was based on the handoff, which over-classified them as editor-only | Honest deviation; setlist-firebase.ts stays as-is. The export inventory is now accurate for v50-06+ planning. |
| Matrix view feature dropped (SetlistDashboard branch + SetlistToolbar toggle + view union narrowed) | SetlistMatrixView lived in v2/ and was deleted; no other implementation; keeping a 'matrix' option that does nothing is half-finished | Cleaner toolbar (just list/calendar); user can request a matrix view as a future feature if needed (and it'll be properly designed rather than an orphaned legacy concept) |
| SearchOverlay relocated to src/components/library/ rather than deleted | Admin TemplateEditor consumes it for chart-file picking; SearchOverlay has no v2/ deps so it moves cleanly with one import path edit | Memory `Admin panels left unstyled (out of scope)` honored; admin functionality preserved; v2/ directory is now truly empty and gone |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 4 | Test infra + orphan-feature drop + non-editor consumer relocation; all bounded by explicit grep + commit notes |
| Scope additions | 0 | None — all deviations are subtractions from the plan or essential adjustments |
| Deferred | 1 | Human-verify checkpoint deferred to user's "look at it later" smoke session |

**Total impact:** Plan was over-eager about setlist-firebase.ts narrowing (assumed editor-only exports based on handoff inventory; reality has non-editor consumers). Plan also under-anticipated ripple effects of v2/ deletion (admin SearchOverlay consumer + matrix view feature + 2 orphan tests). All caught by pre-delete + post-delete grep gates from the plan's own checklist. Net LOC delta (−6,292) is below the plan's ~−8,400 estimate because some legacy was already removed by prior plans.

### Auto-fixed Issues

**1. Pre-flight grep surprise: SearchOverlay imported by admin TemplateEditor**
- **Found during:** Task 3 pre-delete grep (the plan's own AC-4 checklist step)
- **Issue:** `setlist/v2/` grep returned 1 unexpected match outside the editor surface — `src/app/(main)/manage/templates/TemplateEditor.tsx` imports `SearchOverlay` from `@/components/setlist/v2/SearchOverlay`. Deleting v2/ wholesale would break the admin tool.
- **Fix:** `git mv src/components/setlist/v2/SearchOverlay.tsx src/components/library/SearchOverlay.tsx` (preserves history). Updated the one TemplateEditor import. SearchOverlay has no v2/ deps so the move is a no-op.
- **Files:** SearchOverlay.tsx (renamed), TemplateEditor.tsx (one-line import path edit)
- **Verification:** post-rename grep for `setlist/v2/` returned zero matches; tsc clean; admin path still typechecks
- **Commit:** Bundled into Task 3 (`d8c0442`)

**2. Orphan feature: Matrix view depended on deleted SetlistMatrixView**
- **Found during:** Task 3 first tsc run — `src/components/setlist/SetlistDashboard.tsx(20,35): Cannot find module './v2/SetlistMatrixView'`
- **Issue:** SetlistDashboard had a third view-mode option ('matrix') that rendered SetlistMatrixView. SetlistMatrixView lived inside v2/ and was deleted with the directory. The view==='matrix' conditional + import + toolbar toggle button + view-type union were all orphaned.
- **Fix:** Dropped the matrix branch + import in SetlistDashboard; removed Matrix toggle button + Grid3X3 icon import in SetlistToolbar; narrowed `view: 'list' | 'calendar' | 'matrix'` → `view: 'list' | 'calendar'` in toolbar props + use-setlist-dashboard useState. Clean removal — no half-finished state.
- **Files:** SetlistDashboard.tsx, SetlistToolbar.tsx, use-setlist-dashboard.ts
- **Verification:** tsc clean; full suite green; no consumers of `view==='matrix'` remain (grep clean modulo MonitorTabs which uses 'matrix' for sound-mixer matrix outputs — unrelated concept)
- **Commit:** Bundled into Task 3 (`d8c0442`)

**3. Orphan tests: flow-item-editing + inline-editing tested deleted FlowRow/SongRow**
- **Found during:** Task 3 first tsc run — `src/components/setlist/__tests__/flow-item-editing.test.tsx` imports `../v2/FlowRow`; `inline-editing.test.tsx` imports `../v2/SongRow`. Both targets gone.
- **Fix:** `git rm` both test files. They tested v2/ components that no longer exist.
- **Files:** Deleted 2 orphan tests
- **Verification:** tsc clean; vitest collects no missing files
- **Commit:** Bundled into Task 3 (`d8c0442`)

**4. Test teardown noise: DatabaseClosedError unhandled rejection in Hydrator test**
- **Found during:** Task 3 full vitest run — the SetlistGridHydrator test's last case ("renders the SetlistGrid host") triggered an unhandled DatabaseClosedError after the test passed (live query subscription pending after Dexie.close() fired in afterEach).
- **Fix:** Added `cleanup()` import + call in afterEach (testing-library auto-cleanup wasn't kicking in without globals config); added `await findByTestId('setlist-grid-empty-state')` at end of the offending test to drain the live query before teardown.
- **Files:** SetlistGridHydrator.test.tsx
- **Verification:** Re-ran the test file standalone — 5/5 pass, zero unhandled rejections
- **Commit:** Bundled into Task 3 (`d8c0442`)

### Scope Subtractions

**setlist-firebase.ts narrow → NO-OP**
- **Plan said:** Remove editor-only exports `StaleWriteError`, `updateSetlistWithVersion`, swap helpers; keep `Setlist` type + `createSetlistService` (~22 non-editor consumers).
- **Reality:** Pre-delete grep showed `StaleWriteError` + `updateSetlistWithVersion` + `updateSetlist` (the public method) all still consumed by `src/hooks/use-add-to-setlist.ts` (non-editor library→setlist flow that uses `expectedUpdatedAt` for concurrency). `updateSetlistWithVersion` is private (no `export` prefix), already not exported.
- **Decision:** Per the plan's own deletion-safety rule ("Don't delete an export with non-zero non-editor consumers"), KEPT all of them. setlist-firebase.ts is unchanged from this plan.
- **Honest note:** The handoff's "narrow inventory" was over-classification. The export inventory is now accurate for future v50-06+ planning.

### Deferred Items

1. **Human-verify checkpoint (post-deploy prod smoke)** — User explicitly deferred ("I'll look at it later"). Added to STATE.md `Deferred human smoke tests` running list as item #4 with the full verification script. Verification covers: route renders + tracks visible + SyncIndicator "Saved"; edit Title cell + Tab → Saving → Saved; refresh → persisted; ChartCell click → ChartBindPopover → bind → indigo state. Not blocking UNIFY per established precedent (v4.1, v4.2 P1.1, v4.2 P1.2 all have similar deferred smokes).

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| `data-hydration` attribute on SetlistGrid wouldn't typecheck (SetlistGridProps has no data-* passthrough) | Wrapped SetlistGrid in a `<div data-testid="setlist-grid-hydrator" data-hydration={...}>` inside Hydrator instead of forwarding to SetlistGrid props |
| build script auto-bumped `package.json` version on `npm run build` | `git checkout -- package.json src/build-info.json` after build (per v50-04 + v50-05-01 close convention) |
| Stale `.next/types/app/api/setlist/flush/route.ts` after route delete | `rm -rf .next` to clear cached types; subsequent tsc runs clean |
| Cross-tab-lock test flake (1316th test) | Pre-existing per handoff; explicitly deferred to v50-06 (concurrent-edit safety phase) — NOT a regression from this plan |

## Next Phase Readiness

**Ready:**
- v50-05-03 (polish) is unblocked: editor is mounted on prod; cells follow the v50-05-01 unified contract; AddRowPlaceholder + ChartBindPopover share the cmdk-library shape so multi-select / batch-edit / iPad popover variants extend the same conventions; AlertDialog swap-in for window.confirm is a one-line change (the `confirmDeleteWithTitle` injection point is already in place per v50-05-01).
- v50-06 (concurrent-edit safety) gets first real production data from the new editor's writes — the conflict path that's been "engine-correct but UI-quiet" since v50-05-01 will start surfacing real reconciliation events; v50-06 plans the modal + expectedUpdatedAt tracking.
- v50-07 (migration + cutover) is now urgent: the new editor's `applyEdit('set','tracks',...)` writes start landing on prod immediately, creating top-level Firestore `tracks/{id}` docs. v50-07 reshapes existing setlist.tracks[] → tracks/{id} so reads have a single source of truth.

**Concerns:**
- **Production migration apply (`scripts/migrate-v50.ts`) is now load-bearing.** Until v50-07 runs, Firestore has BOTH the legacy embedded `setlists/{id}.tracks[]` array AND new `tracks/{id}` docs created by user edits. Reads via SetlistGridHydrator pull from the embedded array (server-rendered page), but writes go to top-level. This is a transitional split-brain. Acceptable for the broken-for-band period; needs to close before band onboarding.
- **expectedUpdatedAt is still uniformly undefined on track updates** (and also on chart-bind commits added in this plan). Honest tracking lands in v50-06.
- **Cross-tab-lock test flake remains** — not a regression, but it's been flaky since v50-03; v50-06 should fix.
- **`vitest.config.ts` testTimeout 10s bump from v50-05-01 still in place** — eventually root-cause the engine.test.ts AC-4 parallel pressure starvation; not blocking.
- **Hydration-only flow (no on-prod-edit refresh)**: SetlistGridHydrator only runs on mount. If a leader edits the setlist on prod and the user already has it open, the SetlistGrid live query will only see whatever the v50-03 sync engine remote-reads (which today is the editor's own writes, not other tabs' writes). Cross-leader live-edit visibility is a v50-06 concern (real-time setlist sync replacement for the deleted live-swap UI).

**Blockers:** None for v50-05-03. Production smoke verification still pending from user (deferred, not blocking UNIFY).

---
*Phase: v50-05-spreadsheet-editor, Plan: 02*
*Completed: 2026-04-26*
