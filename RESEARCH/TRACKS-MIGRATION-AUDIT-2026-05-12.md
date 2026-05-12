# Tracks Migration Audit — Synthesis & Design

**Status:** read-only synthesis, no code touched
**Author:** synthesizer agent
**Date:** 2026-05-12
**Sources:** `audit-writes.md`, `audit-reads.md`, `audit-sync.md`, `audit-hotpaths.md`
**Master HEAD:** `4ee6e70`

---

## Executive summary

The app is operating on two parallel storage schemas for the same data. Tracks live in two places: the legacy embedded `setlists/{S}.tracks: SetlistTrack[]` array (written by 11 distinct production writers, read by ~21 production surfaces including print, publish, email, perform, scheduling, dashboard, and SSR-when-unhydrated) and the v50-05 top-level `tracks/{id}` collection (written by 14 engine-path writers, read directly by only 2 top-level readers and indirectly by everything that pulls through Dexie). The migration was started but never finished: every editor mutation routes to top-level, every non-editor surface still reads embedded, and only one writer (`use-add-to-setlist.ts` after `4ee6e70`) currently mirrors. This split is the source of every P0 symptom Daniel reports.

The fork point matters: the embedded array remains the cross-surface source of truth (print PDFs, publish snapshots, email bodies, perform-view playback queue, dashboard search, offline-cache badges, new-song detection in scheduling). The top-level collection is the editor's source of truth (SSR for hydrated setlists, Dexie cache, snapshot-listener deliveries, undo/redo). Both halves are currently maintained by uncoordinated paths. Whichever direction we pick must end with one source.

**Recommendation: finish the v50-05 migration (Option A), but phase it conservatively over ~3 sessions, starting with the highest-blast-radius readers (print/publish/email/perform/scheduling) and ending with the embedded-array delete and an irreversible Firestore-side cleanup.** Rollback (Option B) looks tempting because most readers already hit embedded — but Option B requires the *engine* to write the embedded array, which means either teaching the engine about Firestore array-mutation semantics (very high complexity given LWW + tombstones + outbox) or routing every engine write back through `setlistService.updateSetlist` (which destroys the per-track local-first ergonomics the engine was built for). Option B also throws away the Tier 3 Y.js pivot's natural unit of work (per-doc tracks), making the next migration far worse.

The first 24 hours of work should NOT touch the engine, the state machine, the snapshot listener, or any embedded-array writer. The riskiest sequence is closing readers in dependency order: introduce a single read-helper (`readTracksForSetlist(setlistId)`) that resolves "the live track list" deterministically, ship it behind a read-only feature flag for one surface (the publish snapshot), measure correctness, then expand. The state-machine `'conflict'` stuck-pill is a separable concern — fix it in parallel as a tiny commit that wires `retryFailedOutboxRows` to the conflict click handler (no migration coupling). That gives Daniel relief in days, not weeks.

---

## The dual-source-of-truth picture in one diagram

```
                       Firestore (cloud)
   ┌─────────────────────────────────────────────────────┐
   │                                                     │
   │   setlists/{S}                       tracks/{id}    │
   │   ├─ name                            ├─ setlistId   │
   │   ├─ date / eventDate                ├─ order       │
   │   ├─ ownerId / publishedAt           ├─ title       │
   │   ├─ hydrated: bool                  ├─ key / bpm   │
   │   ├─ trackCount: int                 ├─ leadMusician│
   │   └─ tracks: SetlistTrack[]   <───── ├─ fileId      │
   │      ▲                               └─ updatedAt   │
   │      │                                  ▲          │
   │      │                                  │          │
   └──────┼──────────────────────────────────┼──────────┘
          │                                  │
          │ 11 writers                       │ 14 writers
          │ (direct Firestore)               │ (applyEdit → outbox → engine)
          │                                  │
          │ W1-W11:                          │ W12-W25:
          │ - createSetlist                  │ - handlePickSong (editor add)
          │ - updateSetlist (W2)             │ - handleCreateFreeText
          │ - duplicate / clone / template   │ - handleAddTrackOfType
          │ - import/execute                 │ - handleDeleteRow / handleBulkDelete
          │ - publish (scalar only)          │ - handleBindChart
          │ - rename / transfer (scalar)     │ - handleContextDuplicate
          │ - delete (cascades to            │ - handleDragEnd / MobileCardList drag
          │   setlists/{S} but NOT to        │ - SetlistGridHydrator cascade
          │   tracks/{id})                   │ - trackCount reconciler
          │                                  │ - mirrorTracksToTopLevel (W24, the one
          │                                  │   bridge added by 4ee6e70)
          │                                  │ - undo/redo executeEntry
          │
    ~21 readers                        2 top-level readers + ~7 Dexie readers
    R1 SSR-unhydrated, R3 publish,     R27 SSR-hydrated, R28 snapshot-listener
    R4 print/personal, R5 print/       (everything else top-level-derived reads via
    public, R6 email-packets, R7       Dexie, which is fed by R28 + engine writeback)
    resend-email, R8 scheduling-       R-Dexie1 editor live grid, R-Dexie3 perform-
    assign, R9 new-song detector,      view (with embedded fallback), R-Dexie4-7
    R12 matrix, R13 admin              hydrator / reconciler / undo internals
    templates, R14 SSR dashboard,
    R15 dashboard search/download,
    R16 upcoming-prep, R17 HeroCard,
    R18-R22 dashboard cards, R23
    SetlistDrawer (perform), R24
    PublicSetlistListing, R25 wizard
    clone, R26 history-panel,
    R-Sub1-Sub5 subscriptions
```

**The imbalance in one sentence:** the editor is the only top-level reader; every other surface that decides "what songs are in this setlist" is still on the embedded array.

---

## The five user-reported symptoms — root causes

1. **Deleted tracks resurrect on reload.** Fixed at HEAD for the editor surface (`audit-hotpaths.md` Scenario 4) by two commits: `c9e92a5` made SSR read top-level when `hydrated === true` (`src/app/(main)/setlists/[id]/page.tsx:154-161`), and `6cd2c4e` stopped the engine clearing tombstones on delete-commit (`src/lib/sync/engine.ts:261-271` comment). Embedded `setlists/{S}.tracks[]` still contains the deleted track id forever; this is now silent dead weight for the editor, but anything reading embedded (R3 publish, R4 print/personal, R5 print/public, R6 email, R23 SetlistDrawer in perform — see `audit-reads.md`) will still show the deleted song in PDFs, emails, and the performance view's playback queue. Fixed-where-Daniel-sees-it; latent everywhere else.

2. **Library "Add to setlist" tracks invisible in editor.** Fixed at HEAD by `4ee6e70` (`audit-hotpaths.md` Scenario 3): `use-add-to-setlist.ts:189-193` and `:282-286` now call `mirrorTracksToTopLevel` (W24, `audit-writes.md` lines 500-521) which fans an `applyEdit({op:'set', collection:'tracks'})` per new track *after* the embedded-array write. The fix has a narrow race window: if Daniel's tab closes between the embedded write (Firestore-synchronous, W2) and the outbox draining the mirror sets, the editor's next SSR observes `hydrated:true` + an embedded array that still has the new ids but a top-level collection that doesn't. The cross-surface inverse problem is also open: tracks added via the **editor AddBar** (W12 `handlePickSong`) never write to the embedded array at all, so the perform view, the publish snapshot, the print PDF, and the email body all miss those additions until somebody manually re-publishes or re-prints from a path that touches top-level.

3. **"Conflict — review" pill with no exit.** Live at HEAD; not a migration symptom but a state-machine UI bug. Trace path documented in `audit-sync.md` (TraceC, lines 642-688) and `audit-hotpaths.md` (Scenario 5c). When the adapter throws `VersionMismatchError` with a numeric remote `updatedAt` (i.e., a real two-writer race, not a legacy-unstamped doc), the self-heal at `src/lib/sync/engine.ts:400-409` does NOT fire (regex `/remote=undefined/` matches only the unstamped case), the row flips to `status:'failed'`, and `DRAIN_VERSION_MISMATCH` dispatches the state machine into `'conflict'`. `ReconciliationProvider.tsx:242` hardcodes `hasConflict = false` (deliberately, per the comment block lines 235-241 — sole-user app, "Keep mine / Take theirs" is friction), so the modal never opens. `SyncIndicator.tsx:163-164` routes the conflict-state click to `resolveConflictHandler` (modal-opener) rather than `retryFailedHandler`, so clicking the pill is silently a no-op. Per-doc serialization at `engine.ts:208-214` then treats the failed row as a blocker, so subsequent edits to the same doc queue but never drain. Only reload + manual `discardFailedOutboxRows` from devtools clears it.

4. **Mid-edit SW reload loses typed text.** Live at HEAD; not migration-related. `audit-sync.md` TraceD (lines 692-708) and `audit-hotpaths.md` Scenario 6 walk it: `controllerchange` fires when a new SW activates (`src/lib/firebase.ts:156-176`), the handler awaits `whenEngineIdle(10_000)` (`src/lib/sync/init.ts:255-281`), and `whenEngineIdle` reads only `useSyncStatus` (which reflects the engine + outbox, *not* React component-local text). Text typed into a `<textarea>` or `<input>` in `MobileRowCard` only commits on blur (`src/components/setlist/grid/MobileRowCard.tsx:340-368` per `audit-hotpaths.md` Scenario 6) or arrow keys; the in-progress unblurred draft is invisible to the engine. The 10s timeout always reloads, and the draft dies. No `beforeunload` blur, no `pagehide` flush, no draft snapshot.

5. **Aggressive reconciliation modal (now disabled but state-machine still trips).** Same root as symptom 3. The modal was force-disabled in `a0c61cc` / `ed63efc` at `ReconciliationProvider.tsx:242`. The FSM is independent of the modal — `audit-sync.md` lines 670-688 spells it out: the engine still transitions to `'conflict'`, the indicator still shows red `"Conflict — review"`, and the failed outbox row still blocks per-doc drains. Disabling the modal removed the loud popup but kept the silent state latch.

---

## Structural Option A — Finish the v50-05 migration

### What it means

Make `tracks/{id}` the single source of truth for every reader and writer. Embedded `setlists/{S}.tracks[]` becomes either (a) immediately stripped post-backfill, or (b) frozen and ignored everywhere until pruned. Every read flows through one helper that queries top-level (with Dexie cache when on a primed client). Every write flows through `applyEdit({collection:'tracks'})` or the engine. The dual-source bridge (`mirrorTracksToTopLevel`, W24) is deleted because there is no more duality to bridge.

### What changes (concrete)

**Writers to migrate** (cited from `audit-writes.md`):

- **W1 `createSetlist`** (`src/lib/setlist-firebase.ts:142-176`): keep the setlist doc creation but stop writing the embedded `tracks` field. If initial tracks are needed (the template-create path passes them in), fan them out to top-level via `applyEdit({op:'set', collection:'tracks'})` after the setlist doc lands. Set `hydrated: true` on creation so SSR routes to `fetchTopLevelTracks` immediately.
- **W2 `updateSetlist`** (`src/lib/setlist-firebase.ts:194-212`): callers pass `{ tracks: [...] }` from `use-add-to-setlist.ts` (W26/W27). Migrate those callers to fan out per-track `applyEdit` calls and drop the `tracks` field entirely from the setlist update. `updateSetlist` itself can remain for non-tracks fields (name, owner, etc.).
- **W3 `duplicateSetlist`**, **W4 `cloneSetlist`**, **W5 `cloneForNextWeek`**, **W6 `saveAsTemplate`** (`src/lib/setlist-firebase.ts:261-459`): all four currently `addDoc` a new setlist with an embedded `tracks` array. Replace each with: addDoc the setlist (no tracks field, `hydrated: true`), then fan out one `applyEdit({op:'set', collection:'tracks'})` per remapped track. Use a transaction-equivalent (Promise.all the applyEdits, await all, surface a Sentry capture if any fail — the setlist still exists and can be repaired).
- **W7 `/api/setlists/import/execute`** (`src/app/api/setlists/import/execute/route.ts:130-144`): server-side Admin SDK. Instead of `setDoc(setlistRef, {..., tracks: resolvedTracks})`, do a `batch.set(setlistRef, {...})` + `batch.set(trackRef, ...)` for each track. Stamp `updatedAt` as a Firestore Timestamp (not ISO string — `audit-writes.md` W7 notes the current value won't round-trip through `expectedUpdatedAt.toMillis()`).
- **W8 `/api/setlist/publish`** (`src/app/api/setlist/publish/route.ts:85-115`): reads `setlist.tracks` to build `publishedSnapshot` (currently stale on hydrated setlists). Migrate to read top-level via `db.collection('tracks').where('setlistId','==',id).orderBy('order')`. This is the publish-snapshot stale-data bug; it's a read fix, not a write fix.
- **W11 `/api/setlist/delete`** (`src/app/api/setlist/delete/route.ts:114`): currently `recursiveDelete(setlistRef)` orphans every top-level `tracks/{id}` doc whose `setlistId == deletedId`. Add a cascade: `batchDeleteByField('tracks', 'setlistId', id)` before the recursive delete. Tag with the same Sentry capture site as the existing cascades.

**Readers to migrate** (cited from `audit-reads.md`):

- **R3 publish** (`src/app/api/setlist/publish/route.ts:85`): server-side, swap `setlist.tracks` for a `tracks where setlistId == id` query. Same SDK, same auth, two extra reads per publish.
- **R4 print/personal** (`src/app/api/setlist/print/personal/route.ts:49`): server-side. Same swap. This is the highest-blast-radius reader — wrong PDF = musician plays the wrong song.
- **R5 print/public** (`src/app/api/setlist/print/public/route.ts:51`): same.
- **R6 email-packets** (`src/app/api/setlist/email-packets/route.ts:61-67`): same. Email body shows wrong song titles when stale.
- **R7 resend-email** (`src/app/api/setlist/resend-email/route.ts:118-119`): same.
- **R8 scheduling-assign** (`src/app/api/scheduling/assign/route.ts:47-57`): same. Feeds new-song detection.
- **R9 new-song-detector** (`src/lib/new-song-detector.ts:60-71`): historical-setlist scan. Migrate but special-case: pre-migration historical setlists may not have top-level docs at all. Backfill step (below) closes that.
- **R12 matrix** (`src/app/api/setlists/matrix/route.ts:62-76`): bulk scan over 8-week date range. Cost-aware migration: instead of `forEach(setlist => find on embedded array)`, do one batch `tracks where setlistId in [...]` query. (Firestore `in` limit: 30 ids; chunk if needed.)
- **R14 SSR dashboard** (`src/lib/server-setlists.ts:63-69`): hardest one. The dashboard SSR serializes 50 setlists each with their tracks, and downstream consumers (R15 search, R17 cached-badge, R18 offline, R19/R20/R21 song-count, R22 prep) all access `.tracks`. Two options: (a) keep `trackCount` denormalized + serve cards with no track-list until the live sub fills them in; (b) issue an N+1 batch of `tracks where setlistId in [chunks of 30]` at SSR. (a) is cheaper but degrades search-by-track-title to require a live sub. Recommended: (a) for the count-only consumers (R17/R19/R20/R21), and lift the search to a Dexie-backed full-text index later.
- **R-Sub1 `subscribeToAllSetlists`** (`src/lib/setlist-firebase.ts:237-258`): the dashboard's live sub. Same fix as R14 — keep the setlist sub for metadata, add a separate per-setlist track sub on demand (or rely on Dexie + the editor-mounted top-level sub for the one setlist that matters).
- **R23 SetlistDrawer** (`src/components/performance/SetlistDrawer.tsx:117-156`): perform-view's public picker. This is the live-performance surface — wrong queue is bad. Migrate to a top-level sub the moment the drawer picks a setlist.
- **R24 PublicSetlistListing** (`src/components/performance/PublicSetlistListing.tsx`): count-only, same as R19/R20/R21.
- **R13 admin templates** (`src/components/admin/TemplatesSection.tsx:43-58`): admin-only, out of scope per project memory but follows the same pattern.

**One-time backfill script** (new, e.g. `scripts/backfill-tracks-v50-05.ts`):

1. Iterate `setlists` ordered by `updatedAt asc`.
2. For each setlist whose `hydrated !== true` OR whose embedded `tracks[]` contains any id NOT present in `tracks where setlistId == S`: write the missing top-level `tracks/{id}` docs with their original `order`/`updatedAt`/etc, then `setlists/{S}.update({ hydrated: true, trackCount: N })`.
3. For every setlist (regardless of hydration): strip the embedded `tracks` field via `setlists/{S}.update({ tracks: FieldValue.delete() })`. Do this in a second pass *after* all readers are off the embedded array — i.e., as Phase 3.
4. Audit: count setlists with `tracks` field still present at end of run; alert if any.

**Cleanup:**

- Remove `tracks` from `SetlistTrack[]` field on `setlists/{S}` in `serializeSetlist` and `setlistConverter` (would change the TS shape — break-fix readers).
- Remove `mirrorTracksToTopLevel` (W24) from `use-add-to-setlist.ts`.
- Remove the `serialized.hydrated === true` branch in `page.tsx:154-161` — there is only one branch, top-level read.
- Deprecate `setlistService.updateSetlist`'s handling of the `tracks` field (throw or no-op if passed).

### Phases

**Phase 1 — Reader migration (server-only).** Migrate W7 publish, R4 print/personal, R5 print/public, R6 email-packets, R7 resend-email, R8 scheduling-assign behind a single new helper `getTracksForSetlist(db, setlistId)` (Admin SDK). All six are server-only and Daniel can verify each one independently. No client changes. Shippable as 5-6 small commits.

**Phase 2 — Editor & perform-view reads.** Migrate R23 (SetlistDrawer playback queue), R10 (perform-view print modal — already routes through Dexie via `useSetlistPerformance` but its embedded fallback at `useSetlistPerformance.ts:125-130` needs to die). Replace the fallback with "if Dexie empty, kick the top-level fetcher and show a loading spinner". This is the single highest-stakes client path because it touches live performance.

**Phase 3 — Dashboard reads + backfill.** Migrate R14 (SSR dashboard initial), R-Sub1 (live sub), R15-R22 (the count/badge/search readers). For the search-by-title (R15) consider deferring or doing a quick client-side Dexie scan. Run the backfill script in production *before* this phase so all setlists have top-level rows.

**Phase 4 — Embedded-array writer removal + field strip.** Migrate W1 createSetlist, W3-W6 duplicate/clone/template, W7 import/execute, W11 delete-cascade. Then re-run backfill in "strip mode" to FieldValue.delete the embedded `tracks` array. Last commit removes the SSR branch in `page.tsx`.

**Phase 5 — Cleanup.** Delete `mirrorTracksToTopLevel`, drop `tracks` from `setlistConverter`, drop the embedded-fallback in `useSetlistPerformance`, remove `R1`-equivalent legacy SSR path. Schema doc is now single-source.

Each phase is independently shippable and reversible. Phase 1 in particular is server-route-by-server-route — if a publish goes wrong on a Saturday morning, revert that one commit, the others stay.

### What we lose by NOT doing this

- The publish snapshot, print PDF, email body, perform-view queue, and scheduling new-song detector all stay subtly wrong for any setlist whose editor edits diverged from the embedded array. Daniel is about to onboard a band — they'll get a PDF that says "Adon Olam" while the editor (and the rabbi's iPad) shows "Mi Chamocha".
- The Y.js pivot (tier 3, ~6-7 weeks out) becomes a three-way merge: Y.js doc ↔ top-level tracks ↔ embedded array. Y.js per-doc is naturally one-doc-per-track; "one Y.js doc with an embedded array" is wrong shape and forces a server-side adapter.
- The `'conflict'` stuck-pill cannot be cleanly fixed because the failed row could be against either source. Every fix has to ask "embedded or top-level?".

### Risk

- **Print/publish/email regressions.** Mitigation: Phase 1 ships one route per commit. Daniel hits the publish button on a real setlist after each. Server logs include before/after song-count comparison.
- **N+1 read cost on dashboard.** Mitigation: don't fetch tracks at SSR for the dashboard; use `trackCount` field for the count UI; defer search-by-title until phase 4 or fall back to Dexie scan.
- **Backfill data loss.** Mitigation: backfill writes top-level rows first, strips the embedded array only in a second pass days later. A `migration_snapshots/{setlistId}` doc captures the original embedded array before the strip.
- **Setlist deletion orphaning the new top-level docs.** Phase 4's W11 delete-cascade fixes this — but order matters: ship the cascade BEFORE the field-strip, so we don't leave orphans during the migration window.

### Effort

- Phase 1: 1 short session (~3-4 hrs). 6 server routes, one helper, one staging-style verify per route.
- Phase 2: 1 short session (~2-3 hrs). Two file changes + a Sentry-watched deploy.
- Phase 3: 1 medium session (~4-6 hrs) including the backfill script run.
- Phase 4: 1 short session (~2-3 hrs).
- Phase 5: 1 short session (~1-2 hrs).

Total: ~3 working sessions across ~7-10 calendar days with verification windows.

### Test plan

Browser smoke (after each phase ships to master):

- **Phase 1:** create a setlist, add 3 songs via editor AddBar (top-level only), publish. Verify the publish email body lists all 3 songs. Click the personal-packet link. Verify the PDF has all 3 songs. Have a scheduled musician check their assignment email — verify "new songs" list is right.
- **Phase 2:** open perform view on the same setlist. Verify all 3 songs are in the playback queue. Delete a song from editor in another tab. Verify perform view removes it within ~2s.
- **Phase 3:** dashboard cards show correct song counts. Search "Adon Olam" from the dashboard search box. Verify hit.
- **Phase 4:** delete a setlist. Open Firestore console; verify no orphaned `tracks` docs for that setlistId.
- **Phase 5:** open a setlist editor 10 times in a row, delete a track each time, reload each time. Verify deletion sticks. (Closes the original P0.)

Unit/integration: keep the existing harness tests (`src/lib/sync/__tests__/*`) green at each phase. Add one new vitest per migrated reader proving "given a hydrated setlist with embedded tracks A,B and top-level tracks A,B,C — reader returns A,B,C". The Firebase-emulator concern from `feedback_harness_real_firestore.md` applies: dual-read/listener cutover phases (3 in particular) should be smoked in a real browser session, not just vitest green.

---

## Structural Option B — Roll back the migration

### What it means

Treat `setlists/{S}.tracks[]` as the source of truth. The top-level `tracks/{id}` collection becomes write-only legacy that gets pruned eventually. Engine writes route back into the embedded array.

### What changes (concrete)

- **Engine** (`src/lib/sync/engine.ts` + `init.ts`): teach the adapter that `collection: 'tracks'` actually means "an entry in `setlists/{setlistId}.tracks[]`". This is non-trivial: the adapter has to (a) read the setlist doc, (b) merge the patch into the right array element, (c) write the whole array back with an `expectedUpdatedAt` precondition. The current adapter is doc-per-row; this is array-element-per-row. Concurrency between two engine drains for the same setlist becomes contended (every track edit hits the same setlist doc).
- Alternative: replace every editor-path `applyEdit({collection:'tracks'})` with direct calls into `setlistService.updateSetlist({tracks: [...]})`. But that throws away local-first semantics — every edit goes straight to Firestore, no Dexie cache for tracks, no outbox queueing, no `controllerchange` durability.
- **Snapshot listener** (`src/lib/sync/snapshot-listener.ts`): the per-track `tracks where setlistId == S` query stops returning anything useful (top-level is dormant). Subscribe only to the `setlists/{S}` doc; whenever it fires, diff the embedded array against Dexie and emit per-track Dexie writes. Firestore cannot listen to "elements of an array changed" — only the whole array. So one setlist change = re-fan to all tracks.
- **SSR**: revert `c9e92a5`. Editor reads `setlist.tracks[]` again. Top-level reads (R27) deleted.
- **Hydrator**: lazy-hydration cascade (W22) deleted. `hydrated` field is meaningless.
- **Backfill**: opposite direction — for any setlist where embedded array is missing tracks present in top-level, merge them in. Then archive top-level `tracks/{id}` to a `_legacy_tracks/{id}` collection and drop the live collection.

### Phases

1. Stop new writes to top-level (revert `4ee6e70` mirror, remove `handlePickSong`, etc — these become embedded-array updates).
2. Backfill embedded array from top-level for any setlist where top-level has more rows.
3. Revert `c9e92a5` SSR.
4. Disable / rewrite snapshot-listener.
5. Drop top-level collection.

### What we lose by doing this

- Every line of code for engine ↔ Dexie ↔ top-level cohesion gets re-purposed or deleted. ~2 months of work.
- Y.js pivot (Tier 3) becomes the next data-model migration. Y.js doesn't naturally map to "one document with a large array"; expect another big migration in 6 weeks.
- Per-track concurrency goes from "tracked at the doc level" (independent docs) to "tracked at the setlist level" (a 50-track setlist update = a 50-element array transaction). Two musicians editing two different tracks on the same setlist contend.
- Optimistic local-first ergonomics for track edits get harder — every edit needs the whole array.

### Risk

- **Touching the engine and state machine.** Highest-risk code in the app. The audits document six discrete state-machine bugs already paid down; rewriting it again will surface a seventh.
- **Re-introducing every bug `c9e92a5` and `6cd2c4e` fixed.** Once SSR reads embedded again, every previously-deleted-but-still-in-array track resurrects. We'd have to keep tombstones working, but tombstones live in Dexie and don't survive a fresh device.

### Effort

- 2-3 weeks of disciplined work, more if any state-machine fix is needed. Significantly larger than Option A.

### Test plan

- Same smoke checks as Option A, in reverse direction. Every checkpoint where Option A would prove top-level correctness, Option B has to prove embedded-array correctness AND prove that the engine doesn't trample on concurrent edits to the same setlist.

---

## Recommendation

**Choose Option A. Phase 1 starts tomorrow.**

Defending against the obvious counter ("most readers already read embedded, so Option B is less work"): the work isn't in the readers — it's in the engine and the state machine. Option B requires teaching the engine that "a track row is an element of an array on a different doc," which is the *opposite* shape from what the engine and state machine were designed for. The audits document six prior state-machine bugs paid down at HEAD (`engine.ts:400-409` self-heal, `engine.ts:294-309` updatedAt propagation, `engine.ts:111-121` orphan recovery, `engine.ts:208-214` per-doc serialization, `5601726` cascade trackCount fold, `6cd2c4e` tombstone preservation). Every one of those bugs was caused by treating a doc-per-row model carefully; switching to array-per-setlist semantics resurrects each of them in a new form.

The current production data state argues for Option A too: Daniel has setlists where the embedded array has resurrected-deleted-tracks (Scenario 4 verdict, `audit-hotpaths.md`), setlists where the top-level has tracks the embedded doesn't (Scenario 1's `Z`), and setlists in pristine pre-hydration state. Option A's backfill consolidates all three into top-level. Option B's backfill has to handle "embedded has resurrected ghosts that top-level correctly omits" — which is harder.

The cost-of-time argument: Daniel publishes a setlist Friday afternoon for Friday evening services. If the publish path (R3, `audit-reads.md`) reads stale embedded, the PDF and email he and his band rely on are wrong. Phase 1 of Option A is six small server-only commits — each one removes one wrong-PDF risk. Option B's first commit (engine rewrite) doesn't fix any user-facing surface; it just changes which side of the fork is canonical, after which we'd still have to ship reads.

The cost-of-getting-it-wrong argument: deletes are destructive on either path. Option A's backfill writes top-level rows from the embedded array *before* it deletes anything — the embedded array stays intact through Phase 1-3, gets stripped only in Phase 4 *after* all readers are off it, and `migration_snapshots/{setlistId}` preserves the pre-strip state. Option B has to delete the top-level collection at the end; if a reader was missed, that data is gone.

Y.js pivot: Option A leaves a clean "one-doc-per-track" foundation that maps directly onto Y.js doc semantics. Option B leaves a "one big array on a parent doc," which forces either (a) Y.js per-array which has well-known reliability issues, or (b) yet another migration to per-track docs before Y.js.

**The risk in Option A is bounded and serialized.** Each phase ships independently. If Phase 1 publish migration goes wrong on a Saturday, revert one commit; the rest of the codebase doesn't know. Option B's "rewrite the engine to write into array elements" is one big change with no checkpoint mid-flight.

**The state-machine `'conflict'` symptom is orthogonal.** It will be fixed in parallel by a 2-line commit wiring `retryFailedHandler` to the conflict state at `src/components/setlist/grid/SyncIndicator.tsx:163-164` (and possibly auto-promoting conflict back to retry after one no-op retry — but that's a follow-up). This fix lands during Phase 1 of Option A on a separate branch.

---

## Acceptance criteria for whichever path is chosen

(These are the acceptance criteria for the recommended Option A. Each is browser-smoke-testable, not just vitest green.)

1. **Delete persistence:** open a setlist in the editor, delete a track from the row context menu, reload the page. Track stays deleted. Do this 10 times in a row across 10 different tracks. Zero resurrections.

2. **Editor add reaches every surface:** add a song via editor AddBar to a setlist with `hydrated:true`. Within 5 seconds of "Saved" appearing, the perform view (`/perform/setlist/{id}`) on a second tab shows the new song. Publish the setlist. The published email body lists the new song. The personal-packet PDF includes the new song.

3. **Library add reaches every surface:** open `/library`, multi-select 3 files, "Add to setlist" → pick an existing setlist. Within 5s, the editor view shows all 3 new tracks. Within 5s, the perform view shows them. Publish. Email and PDF include them.

4. **Mid-edit text protection:** type into the Notes textarea of a track but do not blur. Trigger a deploy (or simulate `controllerchange`). After the auto-reload, the typed text is preserved. (This requires a `pagehide`-driven commit in addition to the migration — out of scope of the migration, but listed as a phase-aligned must-have.)

5. **No stuck conflict pill:** trigger a real version-mismatch (open same track in two tabs, edit in both, hit blur in tab A first, then in tab B). Tab B shows "Conflict — review". Clicking the pill silently retries; pill clears to "Saving…" then "Saved" (last-write-wins, surface-level acceptable for a sole-admin app). Cleared within 10 seconds.

6. **Backfill leaves no orphans:** after Phase 4 runs in production, query `setlists where tracks != null` returns zero docs. Query `tracks where setlistId not-in (current setlist ids)` returns zero docs.

7. **Dashboard correctness:** dashboard cards show the correct song count for every setlist, including setlists touched by editor-only adds and setlists touched by library-only adds.

8. **No regressions in unit + integration tests:** `npm run build && npm run test` green. Includes existing `state-machine.test.ts`, `engine.test.ts`, `snapshot-listener.test.ts`.

---

## What this doc INTENTIONALLY does not address

- **Mid-edit text protection on SW reload (symptom 4).** Genuinely orthogonal to the migration. Fix is a `pagehide` / `visibilitychange` listener in `MobileRowCard` and `TextCell` that calls the commit function on hide. ~15 line patch. Separate phase, ship anytime.
- **The publish-snapshot stale-data problem.** Downstream of Phase 1's R3 fix; explicitly closed when R3 reads top-level.
- **Y.js pivot (Tier 3).** Stays on its own track. Option A is a prerequisite, not a substitute. Y.js pivot will rewrite `applyEdit` and the engine; this migration just gets the data model into the shape Y.js expects.
- **Admin Templates (R13) and admin matrix UI (R12).** Out of scope per project memory (admin panels left unstyled). Will get migrated when those surfaces are reworked.
- **Cross-device tombstone propagation.** Tombstones are device-local. On any new device, a deleted track that's still in `setlists/{S}.tracks[]` would resurrect — but after Phase 4 the embedded array is gone, so this risk disappears with the migration.
- **The `useSetlistPerformance` embedded fallback (`audit-reads.md` R-Dexie3, line 125-130).** Will be removed in Phase 2. The audits do not yet specify what happens when Dexie is empty for a perform-view user who's not the editor (e.g., a band member who never opened the editor). The Phase 2 design must specify: bootstrap perform-view's Dexie cache from a one-shot top-level fetch on mount, so the embedded fallback is no longer needed.
- **A user-facing "Discard local edit" affordance for failed/conflict rows.** Currently only `discardFailedOutboxRows` exists but it's not wired anywhere. Add as a follow-up after symptom-3 fix.

---

## Implementation order for THE first 24 hours

Each commit is small (≤30 lines net change), independently shippable, and independently revertible.

**Commit 1 — Symptom 3 stuck-pill fix (orthogonal, no migration impact).**
File: `src/components/setlist/grid/SyncIndicator.tsx:162-164`.
Change: when `state === 'conflict'`, call `retryFailedHandler` instead of `resolveConflictHandler`. This causes a click on the conflict pill to flip the failed outbox row back to pending with `attempts=0`; if the underlying remote condition has stabilized, it drains. If it conflicts again, the pill latches back to conflict — but the user has a clear retry path. Smoke: induce a conflict, click pill once, confirm pill clears within 3s.

**Commit 2 — `getTracksForSetlist` server helper.**
File: NEW `src/lib/server-tracks.ts`.
Export `getTracksForSetlist(db, setlistId)` that does the same shape as `fetchTopLevelTracks` from `page.tsx:65-97` (Admin SDK, sort by `order`). No callers yet — pure addition, zero risk.

**Commit 3 — Migrate publish snapshot to top-level.**
File: `src/app/api/setlist/publish/route.ts:85-115`.
Change: replace `setlist.tracks` reads with `await getTracksForSetlist(db, setlistId)`. Keep the rest of the route unchanged. Smoke: publish a setlist that has top-level adds the embedded doesn't (Scenario 2's `Z`); verify `publishedSnapshot` and email body include `Z`.

**Commit 4 — Migrate personal-print PDF to top-level.**
File: `src/app/api/setlist/print/personal/route.ts:30-68`.
Change: same swap. This is the musician's actual playable PDF. Smoke: from a setlist Daniel has with both embedded and top-level state, GET `/api/setlist/print/personal?setlistId=…`. Verify PDF contains every song the editor shows.

**Commit 5 — Migrate public-print PDF to top-level.**
File: `src/app/api/setlist/print/public/route.ts:38-67`.
Same swap. Same smoke test on a published setlist.

That's the first ~24 hours. Five commits. Each individually revertible. None touches the engine, the state machine, the snapshot listener, or any client-side code path that has been the source of bugs this session. After these five land, Daniel's publish/print flows are correct for the first time since the migration started.

Commits 6-7 the next day (email-packets + resend-email + scheduling-assign + new-song-detector) finish Phase 1. Then Phase 2 (perform view) the day after.

---

## Open questions for the user

1. **Mid-edit text protection (symptom 4):** is a Phase-0 fix (a 15-line `pagehide` blur-and-commit) acceptable to ship in parallel with Commit 1, or do you want to wait until the migration is done? Recommend: ship it now, it's truly independent.

2. **Phase 3 SSR dashboard search-by-track-title (R15):** acceptable to lose substring-search across all setlists' tracks during the migration window (Phase 3), with the understanding it comes back in Phase 5 via a Dexie-backed scan? Or do you want the SSR dashboard to N+1 query top-level (more reads, slower SSR)?

3. **Backfill timing for old setlists:** do you want the migration script to backfill *all* historical setlists (potentially hundreds of past Friday/Shabbat services) or just the most recent N? Old setlists are read by R9 (new-song-detector) but the cost may not be worth it if old historical tracks have no top-level analogue.

4. **`'conflict'` retry behavior (Commit 1):** if the retry hits the same conflict again, do you want the pill to clear silently (last-write-wins-on-retry) or stay red? Recommend silent clear with a Sentry capture, since this is a sole-admin app and Daniel almost never has true two-writer conflicts.

5. **Phase 4 strip vs. freeze:** after readers are migrated, do you want the embedded `tracks` field deleted immediately (`FieldValue.delete()`) or left frozen for one full sabbath cycle (one week) as a rollback safety net? Stripping is cleaner; freezing is reversible. Recommend: freeze for one week, then strip in a follow-up commit.

---

## Verification footer

**Audit docs used by section:**

- *Executive summary, dual-source diagram:* all four audits, primarily `audit-writes.md` (writer count) and `audit-reads.md` (reader count).
- *Five symptoms:* symptom 1 from `audit-hotpaths.md` Scenario 4 + `audit-writes.md` W11 + `audit-sync.md` lines 261-271 references. Symptom 2 from `audit-hotpaths.md` Scenarios 2-3 + `audit-writes.md` W24/W26. Symptom 3 from `audit-sync.md` TraceC (lines 642-688) + `audit-hotpaths.md` Scenario 5c. Symptom 4 from `audit-sync.md` TraceD + `audit-hotpaths.md` Scenario 6. Symptom 5 from `audit-sync.md` lines 670-688.
- *Option A writers list:* `audit-writes.md` W1-W11 (embedded writers) plus W22-W24 references.
- *Option A readers list:* `audit-reads.md` R1-R26 + R-Sub1-Sub5.
- *Option B engine concerns:* `audit-sync.md` State machine + Engine drain sections.
- *Acceptance criteria:* synthesized from all four; symptom mapping in `audit-hotpaths.md` summary table.

**Spot-reads of code I did to verify the synthesis:**

- `src/components/setlist/grid/ReconciliationProvider.tsx:235-249` — verified the `hasConflict = false` comment block confirming the modal force-disable is deliberate (sole-user app, not a TODO).
- `src/components/setlist/grid/SyncIndicator.tsx:140-174` — verified the click-handler routing (`onClick = state === 'conflict' ? resolveConflictHandler : retryFailedHandler`), which is the exact 2-line Commit 1 fix. Also confirmed `retryFailedHandler` exists and defaults to `retryFailedOutboxRows`.
- `src/app/(main)/setlists/[id]/page.tsx:50-160` — verified the SSR branch's `serialized.hydrated === true ? fetchTopLevelTracks : buildLocalTracks` shape and the comment-block (lines 58-64) confirming this is the P0 resurrection fix gating.

**Synthesis vs new findings:**

- **Synthesis (not new):** writer counts, reader counts, symptom-to-code mappings, state-machine transition rules, hot-path traces. All come from the four audits.
- **New (decision-making, not factual):** the recommendation, the phase ordering, the first-24-hour commit list, the acceptance criteria, the Commit 1 specific code change (which is a synthesis of `audit-sync.md`'s analysis of the modal-disabled state with a trivial UI rewire).

**Considered but not included:**

- A "Tier 3 Y.js pivot" detailed plan — out of scope per the brief.
- A subdirectory-by-subdirectory test plan — keeping the test plan high-level since the user's constraint is browser-smoke-testable acceptance, not unit-test completeness.
- Specific Firestore index requirements for Phase 3 (`tracks where setlistId in [...]` may need a composite index for `orderBy('order')`). Flagging this here as a TODO for Phase 3 planning.
- Cost analysis of additional Firestore reads. Phase 1 adds one read per publish/print call (negligible). Phase 3 dashboard adds ~50 reads per SSR if we go the N+1 route; ~0 if we choose the count-only route per recommendation.
