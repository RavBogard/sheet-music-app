# Audit — Hot-path walkthroughs

HEAD: `4ee6e70`. Walk-throughs reflect current code at that commit, not historical behavior.

Conventions:
- **Firestore** = the durable server.
- **Dexie** = the local IndexedDB cache (collections `setlists`, `tracks`, `outbox`, `tombstones`).
- **Outbox** = engine's queue of pending writes draining to Firestore.
- All `applyEdit` writes hit both Dexie *and* an outbox row in one tx (`src/lib/local/write.ts:99-154`).

---

## Scenario 1 — Load editor (mixed legacy+migrated)

**Setup state assumed:**
- Firestore `setlists/{S}` has `hydrated: true`, `tracks: [{id:'X'}, {id:'Y'}]` (legacy embedded array, never cleaned).
- Firestore `tracks/X` and `tracks/Y` exist top-level with real `updatedAt`.
- Firestore `tracks/Z` exists top-level with `setlistId == S` but is NOT in the embedded array (added in a prior session via the editor).
- Local Dexie has a tombstone `['tracks', 'W']` from a prior delete (post-`6cd2c4e`: tombstones survive successful delete-commit).
- Dexie `tracks` may have stale copies of X / Y / Z (or be empty if this is a different device).

**Step-by-step:**

1. `src/app/(main)/setlists/[id]/page.tsx:101` — server component `SetlistEditorPage` runs. Fetches `setlists/{S}` via admin SDK (line 129).
2. `page.tsx:135-144` — `canEditSetlist` gate; edit users continue, others get redirected to `/perform/setlist/{id}`.
3. `page.tsx:146-149` — `serializeSetlist(doc.id, data)` produces the plain `serialized` object including `serialized.hydrated === true` and `serialized.tracks = [{id:'X'},{id:'Y'}]`.
4. **`page.tsx:154-161` — branching read** (the `c9e92a5` SSR fix):
   - Because `serialized.hydrated === true`, the page calls `fetchTopLevelTracks(db, S)` (lines 65-97). It queries `tracks where setlistId == S`, sorts by `order` client-side, returns `[X, Y, Z]` — three rows, **with Z** that does not appear in the embedded array.
   - The embedded `tracks: [{id:'X'},{id:'Y'}]` array is silently ignored.
5. `page.tsx:166-178` — render `<SetlistGridHydrator initialSetlist initialTracks={[X,Y,Z]} />`.
6. `SetlistGridHydrator.tsx:69-189` — first effect runs `hydrate()`:
   - Pre-fetches the setlist tombstone (line 100-103) — none assumed.
   - Pre-fetches all `tracks` outbox rows by filter scan (line 129-133) → empty.
   - Pre-fetches track tombstones limited to the incoming initialTracks set (line 138-154). Critically, **the `W` tombstone is NOT loaded** — `W` is not in `initialTracks`. The tombstone for `W` will only matter if a later snapshot delivery or a fresh hydrate tries to put `W` back. That's not this scenario, but it shows the tombstone scope is per-call.
   - For each of X, Y, Z compares server `updatedAt` against local — bulk-puts the newer rows into Dexie (line 156-178).
   - Sets `hydration === 'done'` (line 182).
7. `SetlistGridHydrator.tsx:199-203` — once hydrated, mounts the Firestore `onSnapshot` listener via `startSnapshotListener({ setlistId: S, db })`.
8. `snapshot-listener.ts:343-371` — listener subscribes to:
   - `setlists/{S}` doc (line 103-118).
   - `tracks where setlistId == S` (line 119-142).
9. Initial snapshot fires. For tracks: 3 `added` deliveries for X, Y, Z. `handleTracks` (line 225-340):
   - For each: outbox guard passes (no pending writes), tombstone guard passes (W not in this set), LWW guard skips because local now equals delivery.
10. **`SetlistGridHydrator.tsx:221-295` — lazy-hydration cascade** is gated by `initialSetlist.hydrated === true` (line 223) → **SKIPPED**. The setlist is already migrated. No new outbox rows enqueued.
11. `SetlistGridHydrator.tsx:311-316` — `primeSongsLibrary()` fires once (best-effort).
12. `SetlistGridHydrator.tsx:335-370` — `liveTrackCount` reconciler observes Dexie's live count = 3.
    - Compares against `lastWrittenCountRef.current ?? initialSetlist.trackCount`.
    - If `setlists/{S}.trackCount` is anything other than `3` (e.g. legacy field = 2 from when the embedded array was the source of truth), the reconciler debounces 800ms and writes `trackCount: 3` via `applyEdit({op:'update', collection:'setlists'})`. This enqueues a setlist outbox row → engine drains → Firestore `setlists/{S}.trackCount` becomes 3, `updatedAt` bumped.
13. `SetlistGrid.tsx:946-953` — main `useLiveQuery` re-emits the same `[X, Y, Z]` ordered by `order`.

**Where it diverges:**
- Firestore: `setlists/{S}.tracks[]` still contains only `[X, Y]` — **never cleaned**. The engine has never written to that embedded array post-`v50-05`.
- Firestore top-level: `tracks/{X,Y,Z}` are the truth.
- Dexie `tracks`: `[X, Y, Z]`.
- Dexie `tombstones`: `[['tracks','W']]` (untouched this load).
- SSR `initialTracks`: `[X, Y, Z]` (top-level only, embedded ignored).

**User sees:** All three rows (X, Y, Z) in the editor, correctly. The embedded-array drift no longer matters for this code path.

**Verdict:** Working as designed at HEAD. The `c9e92a5` SSR top-level read is the load-bearing fix; without it, Z would have been invisible. The legacy embedded `[X, Y]` is now dead weight on the server doc — written once, never reread, never cleaned. Anything else that *still* reads `setlists/{S}.tracks[]` (perform view, print, dashboard) keeps seeing only `[X, Y]`. See Scenario 2 verdict for the cross-surface implication.

---

## Scenario 2 — Add via editor AddBar

**Setup:** Editor mounted for setlist `S` (state from Scenario 1). User clicks AddBar tile, picks library song `song-A`.

**Step-by-step:**

1. AddBar fires `onPickSong(song)` → `SetlistGrid.tsx:1494` `handlePickSong`.
2. `SetlistGrid.tsx:1495-1518` — generates `newId`, computes `order = rows.length` (3 in our setup), calls `seedTrackFromSong(song.id)` for sticky-memory defaults, then a single `applyEdit({op:'set', collection:'tracks', doc:{...}})`.
3. `src/lib/local/write.ts:99-154` — single Dexie tx:
   - `db.tracks.put({id:newId, setlistId:S, songId:song-A, fileId:song-A, order:3, title, type:'song'})`.
   - `db.outbox.add({op:'set', collection:'tracks', docId:newId, payload:{...}, expectedUpdatedAt:undefined, attempts:0})`.
   - `db.tombstones.delete(['tracks', newId])` (defensive; nothing to clear).
4. `write.ts:173-180` — fires edit-log breadcrumb.
5. `write.ts:190` — calls `getSyncEngine()?.notifyEditCommitted()` which dispatches `EDIT_COMMITTED` → state goes to `'dirty'` (state-machine.ts:38-41), then `pump()`.
6. `engine.ts:172-198` — `pump()`. Acquires cross-tab lock, `drainOnce()`.
7. `engine.ts:200-240` — picks the new outbox row. Marks `sending`.
8. `engine.ts:251-323` — `ProductionFirestoreAdapter.commitOutboxRow` (init.ts:78-93): `setDoc(tracks/newId, {...payload, updatedAt: serverTimestamp()})`, re-reads, returns `{updatedAt: ms}`.
9. `engine.ts:272-323` — writeback tx: delete outbox row, propagate `updatedAt` into any other pending rows for `tracks/newId`, and `db.tracks.put({...existing, updatedAt:ms})`.
10. `engine.ts:344-346` — `DRAIN_OK` → state `'idle'`.
11. If `seedTrackFromSong` returned defaults (key/lead/bpm), `SetlistGrid.tsx:1519-1536` fires a second `applyEdit({op:'update', docId:newId, patch})` with `expectedUpdatedAt: undefined`. Because the engine's writeback for the prior `set` may not have rendered yet, the comment at lines 1525-1529 acknowledges this is the right call. The engine drains the update next.
12. Snapshot listener also receives an `added` delivery for `tracks/newId`. `snapshot-listener.ts:243-244` — outbox guard: while the set was in-flight there was a pending row; by the time the snapshot lands the row is gone — so the guard may pass. LWW guard at line 297 — `local.updatedAt >= change.updatedAt` will normally hold (engine writeback set local to the server stamp). Delivery is skipped.
13. Hydrator's `liveTrackCount` reconciler observes count=4 → debounces 800ms → writes `setlists/{S}.trackCount = 4` via `applyEdit`.
14. After that update commits, Firestore `setlists/{S}.updatedAt` bumps. Snapshot listener for setlists delivers the new doc → `snapshot-listener.ts:175-223` puts it into Dexie's setlists row.

**Where it diverges:**
- Firestore: new track lives at `tracks/{newId}` top-level only. `setlists/{S}.tracks[]` is **not touched** — `handlePickSong` writes only the top-level doc.
- Firestore: `setlists/{S}.trackCount` updated to 4 via the hydrator's reconciler.
- Dexie tracks: includes `newId`.
- Dexie outbox: empty after drain.

**Then: dashboard tab.** Dashboard's `useSetlistDashboard` calls `setlistService.subscribeToAllSetlists` (`setlist-firebase.ts:238-258`), an `onSnapshot` on the entire collection. When `setlists/{S}.trackCount` updates (step 13), this fires and `SetlistCards.tsx:104` re-renders the `trackCount || 0` cell with `4`.

**User sees:**
- Editor: new row appears immediately (Dexie put is optimistic), persists after drain.
- Dashboard (other tab): `Songs` count bumps from 3 → 4 after ~800ms (reconciler debounce) + drain latency.

**Verdict:** Editor add works correctly. Dashboard reflects the change *only because* the trackCount reconciler exists — if the reconciler debounce hasn't fired (rapid close-tab before 800ms) or the reconciler write fails (network blip), the dashboard count is stuck. Perform view (`SetlistDrawer.tsx`, embedded array consumer) **will not see** the new track at all — only the editor and dashboard. See Summary table.

---

## Scenario 3 — Add via library page (post-`4ee6e70`)

**Setup:** User on `/library`. Setlist `S` exists with `tracks: [{id:'X'},{id:'Y'}]` embedded + top-level `tracks/X`, `tracks/Y`. User selects a Drive file, opens AddToSetlistSheet, picks setlist `S`.

**Step-by-step:**

1. AddToSetlistSheet calls `useAddToSetlist().addToSetlist(S, setlist)` (`src/hooks/use-add-to-setlist.ts:146`).
2. `use-add-to-setlist.ts:151-167` — builds duplicate-detection set, constructs `newTracks` with ids of form `track-${now}-${file.id}-${index}`.
3. `use-add-to-setlist.ts:172-183` — **Write #1 (embedded array)**: `setlistService.updateSetlist(S, { tracks: updatedTracks, trackCount: updatedTracks.length }, expected)`. This routes to `setlist-firebase.ts:194-200` → `updateSetlistWithVersion` (lines 45-61) which does a `runTransaction` with `expectedUpdatedAt` precondition. Bumps `setlists/{S}.tracks[]`, `trackCount`, `updatedAt` atomically. On success, `await` returns. Toast is **not** fired yet at this point in code (it fires at line 212), so the visibility ordering relative to the mirror is "embedded landed; mirror queued client-side".
4. `use-add-to-setlist.ts:189-193` — **Write #2 (top-level mirror, `4ee6e70` fix)**: `mirrorTracksToTopLevel(S, newTracks, setlist.tracks.length)` (lines 24-51).
   - For each new track: `applyEdit({op:'set', collection:'tracks', doc:{id:t.id, setlistId:S, songId:t.fileId, fileId:t.fileId, order:startOrder+i, title, type:'song', ...}}, {withoutUndo:true})`.
   - Each `applyEdit` writes to Dexie + enqueues an outbox row.
   - But — note — this is the **library tab**, which is NOT mounted on the editor. There's no `SetlistGridHydrator` here, no snapshot listener for setlist `S`. The engine boots once per tab (`SyncEngineBoot`, `init.ts:296-304`) and drains the outbox regardless. So the engine drains the new set rows to Firestore `tracks/{newId}` top-level.
5. `use-add-to-setlist.ts:212-238` — toast with Undo action fires.

**Write ordering / visibility timeline (single tab):**
- T+0: Write #1 — `setlists/{S}` doc updated on server (tracks[], trackCount, updatedAt). Embedded array IS the source for any reader of that field RIGHT NOW.
- T+ε: Write #2 — sequential `applyEdit` calls put new tracks into local Dexie AND enqueue outbox rows.
- T+~100ms-1s: Engine drains, `setDoc` of each `tracks/{newId}` lands on Firestore.
- Top-level `tracks/{newId}` becomes visible to other readers.

**Then: user navigates back to editor for that setlist.** Next SSR run:

6. `page.tsx:129` — fetch `setlists/{S}` — observes the now-bigger embedded `tracks[]` and `hydrated: true` (still true; library write didn't unset it).
7. `page.tsx:154-161` — `serialized.hydrated === true` → goes through `fetchTopLevelTracks` (lines 65-97), which reads top-level `tracks where setlistId == S`. By the time SSR runs (subsequent page nav), the engine has typically drained the mirror writes, so this returns the original `[X, Y]` PLUS the newly-mirrored tracks. **New tracks are visible in the editor.**
8. Edge case — *if* the user navigates fast enough that the mirror outbox hasn't drained yet, the top-level `tracks/{newId}` may not yet exist server-side. `fetchTopLevelTracks` would return only `[X, Y]`. In that window, the editor shows the OLD set; the embedded array (with the new tracks) is ignored by the SSR fetcher. Once the engine drains and the next reload/snapshot fires, the new rows appear. The snapshot listener (`snapshot-listener.ts:225-340`), which subscribes after Dexie hydration, will deliver the new tracks as `added` once the mirror commits.

**Where it diverges:**
- Firestore `setlists/{S}.tracks[]`: includes all 2 + N new tracks (after Write #1).
- Firestore top-level `tracks/{newId}`: each gets created on engine drain (Write #2).
- The **timing gap between Write #1 (server-authoritative, synchronous) and Write #2 (client-queued, async drain)** is the dual-source crossover. Any consumer reading `setlists/{S}.tracks[]` sees the new tracks immediately; any consumer reading top-level `tracks` collection sees them after engine drain.

**User sees:**
- Library: toast "Added X to setlist S". No editor mounted, no immediate visual change.
- Editor (subsequent visit): new tracks visible via `c9e92a5`'s top-level read path.
- Editor (immediate visit before drain): old tracks visible only (rare race).
- Dashboard subscribers: `trackCount` bumped from the embedded-array write — visible immediately on the dashboard onSnapshot.

**Verdict:** Post-`4ee6e70` the cross-surface gap is closed for the common case. Two writes, two collections, no transactional coupling. If the embedded-array write succeeds and the user closes the tab before the mirror outbox drains, the mirror rows persist in Dexie+outbox and drain on next session start (`engine.ts:112-121` orphan-recovery). Worst case: a long offline window with this user's Dexie cleared = embedded array carries the new tracks but top-level never gets them. Editor on a different device will then read top-level via `c9e92a5`'s fetcher and **miss the library-added tracks entirely** (because `hydrated:true` → SSR ignores the embedded array). This is a latent inconsistency, not a regression.

---

## Scenario 4 — Delete from editor

**Setup:** Editor mounted for `S` with tracks `[X, Y, Z]`. User clicks Delete on row Y.

**Step-by-step:**

1. User confirms `DeleteConfirmProvider` modal — `SetlistGrid.tsx:1086-1101` `handleDeleteRow` resumes.
2. Calls `applyEdit({op:'delete', collection:'tracks', docId:Y, expectedUpdatedAt: track.updatedAt})`.
3. `write.ts:99-154`, delete branch (lines 142-152):
   - Reads `existingForTombstone` (line 142-144) for the original `updatedAt`.
   - `db.tracks.delete(Y)` — row gone from local cache.
   - `db.outbox.add({op:'delete', collection:'tracks', docId:Y, payload:{}, expectedUpdatedAt:track.updatedAt})`.
   - `db.tombstones.put({collection:'tracks', docId:Y, deletedAt:now, originalUpdatedAt:track.updatedAt})`. Compound primary key `[collection+docId]` so this dedupes if already present.
4. Outside tx: edit-log + `notifyEditCommitted()`.
5. Engine drains:
   - `engine.ts:248` — marks row sending.
   - `engine.ts:251` — adapter `commitOutboxRow` for `op:'delete'` (init.ts:137-140): `await deleteDoc(doc(db, 'tracks', Y))`. Returns `{}` (no `updatedAt` for delete).
   - `engine.ts:272-323` — writeback tx: `db.outbox.delete(row.localId)`. The `if (result.updatedAt !== undefined && row.op !== 'delete')` guard at lines 278-281 prevents resurrecting the doc. **Tombstone is NOT cleared here** — this is the `6cd2c4e` fix (engine.ts:261-271 comment explicitly says so).
6. `engine.ts:344-346` — `DRAIN_OK` → state `'idle'`.
7. Snapshot listener delivers `removed` for `tracks/Y` (`snapshot-listener.ts:256-266`): outbox is empty by now → guard passes → `db.tracks.delete(Y)` (no-op, already gone) AND `db.tombstones.delete(['tracks', Y])`. **Tombstone IS cleared on snapshot-confirmed removal.**

**Post-delete state:**
- Firestore `tracks/Y`: gone.
- Firestore `setlists/{S}.tracks[]`: **still contains `{id:'Y'}`** — never modified by the engine. Stale.
- Local Dexie `tracks`: Y gone.
- Local Dexie `outbox`: empty.
- Local Dexie `tombstones`: `['tracks', Y]` *transiently* exists between the engine writeback and the snapshot listener's `removed` delivery, then cleared. Other devices' Dexie tombstones for Y are untouched (each device has its own).
- `setlists/{S}.trackCount`: trackCount reconciler observes count=2, debounces, writes `trackCount:2`.

**Then: reload the page.** Next SSR:

8. `page.tsx:129` — fetch `setlists/{S}`: `hydrated:true`, `tracks: [{id:X},{id:Y},{id:Z}]`. **Embedded array still has Y.**
9. `page.tsx:154-161` — branch on `hydrated === true` → `fetchTopLevelTracks(db, S)` returns `[X, Z]` (Y is genuinely gone from top-level).
10. `initialTracks = [X, Z]`. `SetlistGridHydrator` mounts.
11. Hydrator's effect at `SetlistGridHydrator.tsx:69-189` primes Dexie with `[X, Z]`. Local Dexie was already `[X, Z]` after the delete; no-op.
12. **The embedded `setlists/{S}.tracks[]` containing Y is dead weight**. `fetchTopLevelTracks` never reads it. The hydrator's `initialTracks` never contains Y. The snapshot listener's `where setlistId == S` query on top-level never returns Y. The local tombstone for Y has already been cleared on the prior session's `removed` snapshot.

**User sees on reload:** `[X, Z]`. Y stays deleted. The resurrection bug from the comments (`engine.ts:261-271`, `page.tsx:58-64`) is closed.

**Edge case — same session, different device opens the editor before any tombstone exists locally:**
- That device's SSR reads `tracks/Y` via top-level — `tracks/Y` is gone, so `fetchTopLevelTracks` correctly omits it. No resurrection. The `hydrated:true` flag is doing the work.

**Edge case — perform view (`/perform/setlist/{id}`)** reads the *embedded* array (`SetlistDrawer.tsx` references trackCount and the embedded list). That surface **still sees Y** until somebody/something cleans the embedded array. The dashboard cards (`SetlistCards.tsx:104`) read `trackCount` only, so they're insulated from embedded-array drift.

**Verdict:** Editor-side delete is correct on reload at HEAD. The original "deleted tracks come back" symptom — caused by (a) hydrator priming from the embedded array, then (b) tombstones being cleared on delete-commit — is closed on both halves: SSR no longer reads the embedded array for hydrated setlists (`c9e92a5`), and tombstones survive delete-commit (`6cd2c4e`). The embedded array is now permanently desynced from top-level for any setlist where deletes have happened, but only readers of that array (perform view) are affected.

---

## Scenario 5 — Edit a cell value (cell-level commit)

**Common steps for 5a, 5b, 5c:** User has a track row in `MobileRowCard`'s expanded edit pane. Edits the "Key" field via `<select>` at `MobileRowCard.tsx:350`. The `onChange` handler synchronously updates local state and calls `commitKey(e.target.value)` (line 83). `commitKey` calls `onCommit?.({ key: next })` which in `MobileCardList.tsx:191-197` invokes `onCommitTrackPatch(track.id, { key: next }, track.updatedAt)`.

`SetlistGrid.tsx:1381` wires `onCommitTrackPatch: commitTrackPatchImpl`. `commitTrackPatchImpl` (lines 722-745) calls `applyEdit({op:'update', collection:'tracks', docId, patch, expectedUpdatedAt}, { undoKey: 'tracks:${docId}:key' })`.

`write.ts:118-135` update branch:
- Reads existing local track via `db.tracks.get(docId)`. Throws `WriteAtomicityError` if missing (line 121).
- Merges `{...existing, ...patch, id:docId}` and puts.
- Enqueues outbox `{op:'update', collection:'tracks', docId, payload:patch, expectedUpdatedAt}`.

Then `notifyEditCommitted` (line 190) → state `'dirty'` → `pump()` → drain.

The fork happens at adapter commit time inside `ProductionFirestoreAdapter.commitOutboxRow` (`init.ts:94-136`) and its precondition check in `checkUpdatePrecondition` (`init.ts:65-72`).

### 5a. Happy path — remote `updatedAt` matches `expectedUpdatedAt`

1. Engine drains the outbox row. Adapter `runTransaction`:
   - `tx.get(ref)` → snap.exists() true; `remote.updatedAt.toMillis() === expectedUpdatedAt`.
   - `checkUpdatePrecondition` returns `null` (line 70).
   - `tx.update(ref, {...payload, updatedAt: serverTimestamp()})`.
2. After tx, adapter re-reads (line 131-134) to get the resolved `updatedAt` ms.
3. Returns `{updatedAt: newMs}`.
4. `engine.ts:272-323` — writeback tx: deletes outbox row; **threads the new `newMs` into any pending outbox rows for the same `tracks/{docId}`** (lines 294-309 — the `v5h3-01-03` fix); updates `db.tracks.{docId}.updatedAt = newMs`.
5. `engine.ts:344-346` — `DRAIN_OK` → state `'idle'`. SyncIndicator shows green "Saved".
6. Snapshot listener delivers the `modified` event with the new `updatedAt`. `snapshot-listener.ts:284-304` — outbox is empty, no tombstone, local.updatedAt === newMs, so the `local.updatedAt >= change.updatedAt` guard skips the put (line 297).

**User sees:** key field updates, "Saving…" briefly, then "Saved". No surprises.

### 5b. Remote unstamped (legacy doc; `b0e7033` self-heal)

Pre-condition: Firestore `tracks/{docId}` exists but has no `updatedAt` field at all (created pre-v50-06). Local Dexie has `updatedAt: 1234`. User edits; `expectedUpdatedAt: 1234` is passed.

1. Engine drains. Adapter tx:
   - `tx.get(ref)` → snap.exists() true; `remote.updatedAt` is `undefined`.
   - `checkUpdatePrecondition(1234, undefined)` → returns `"expected updatedAt=1234, remote=undefined"` (init.ts:71). Adapter throws `VersionMismatchError(msg)` (init.ts:124).
2. `engine.ts:388-409` — VersionMismatch branch:
   - **`b0e7033` self-heal gate:** `if (/remote=undefined/.test(lastError) && row.attempts === 0)`:
     - Sets outbox row to `{expectedUpdatedAt: undefined, attempts: 1, scheduledFor: now, lastError: undefined}` (line 401-406).
     - Dispatches `DRAIN_RETRY_PENDING` → state stays `'saving'` (state-machine.ts:53-55).
     - Returns `'continue'`. **No** `DRAIN_VERSION_MISMATCH` dispatched, **no** transition to `'conflict'`.
3. Next pump picks the row up. Adapter tx runs again:
   - `tx.get(ref)` → still no `updatedAt`. But this time `expectedUpdatedAt: undefined`.
   - `checkUpdatePrecondition(undefined, undefined)` → returns `null` (line 69 short-circuits on `expectedUpdatedAt === undefined`).
   - `tx.update(ref, {...payload, updatedAt: serverTimestamp()})` — stamps the doc.
4. Adapter returns `{updatedAt: newMs}`. Engine writeback proceeds as in 5a.
5. State arrives at `'idle'`. SyncIndicator shows "Saved". The user never saw a "Conflict" pill — the FSM was `dirty → saving → saving (retry) → saving → idle`.
6. From now on, this doc has a real `updatedAt`; subsequent edits go down the 5a happy path.

**User sees:** "Saving…" potentially flickers a bit longer than usual; eventually "Saved". No pill flash, no modal (modal is disabled anyway — `a0c61cc`).

### 5c. Real two-writer conflict — remote `updatedAt` ≠ `expectedUpdatedAt`

Pre-condition: User's local `track.updatedAt = 1234`. Someone else's edit landed first and bumped server to `9999`. User edits; `expectedUpdatedAt: 1234`.

1. Engine drains. Adapter tx:
   - `tx.get(ref)` → `remote.updatedAt = 9999`.
   - `checkUpdatePrecondition(1234, 9999)` → returns `"expected updatedAt=1234, remote=9999"`.
   - Adapter throws `VersionMismatchError(msg)`.
2. `engine.ts:388-416` — VersionMismatch branch:
   - Self-heal gate: `/remote=undefined/.test("expected updatedAt=1234, remote=9999")` → **false**. Self-heal does NOT fire.
   - Falls through to lines 410-415: `db.outbox.update(localId, {status:'failed', lastError})`. Outbox row is now `failed`.
   - Dispatches `DRAIN_VERSION_MISMATCH` → state machine returns `'conflict'` (state-machine.ts:49-50).
   - Returns `'stop-drain'`.
3. `engine.ts:188-198` — drain loop exits via `stop-drain`. Engine calls `notifyFromDb()` which calls `onStateChange(state='conflict', queued, lastError)`. The wired handler (`store.ts:25-33`) pushes the state into `useSyncStatus` zustand.
4. **`SyncIndicator.tsx:108` reads `useSyncStatus(s => s.state)` → `'conflict'`** → renders pill "Conflict — review" (line 60-66 visuals).
5. Clicking the pill: `SyncIndicator.tsx:163-164` — when `state === 'conflict'`, `onClick = resolveConflictHandler`. Default handler from `ReconciliationProvider.useReconciliationModalOptional` → `openModal()` (`ReconciliationProvider.tsx:366-368`). `openModal` clears `dismissedKey`.
6. **`ReconciliationProvider.tsx:292` — `const open = hasConflict && dismissedKey !== idSetKey`**. But `hasConflict = false` (line 242 — the `a0c61cc` force-disable). So `open = false` regardless of `dismissedKey`. **The modal never opens.**
7. Result: the failed outbox row sits at `status: 'failed'` indefinitely; the FSM stays `'conflict'`; the pill stays red; clicking it is a no-op (it calls `openModal` which sets `dismissedKey=null`, but `open` is always false).
8. The only paths out:
   - Another `EDIT_COMMITTED` would *not* change the state away from `'conflict'`: state-machine.ts:38-41 says "Failed/Conflict take precedence — outstanding errors must be visible until the user resolves them" — returns the current state unchanged.
   - Re-drain attempts won't pick up failed rows: `engine.ts:208-214` — failed status puts the doc in `blockedDocs` set, so no further row for that doc drains until resolution.
   - `engine.resolveConflict(localId, choice, opts)` — exposed but not callable from the UI in the modal-disabled world.
   - The "Failed — retry" button is only wired when `state === 'failed'`, NOT when `state === 'conflict'` (SyncIndicator.tsx:163-164).
9. SyncIndicator at line 130-131: tooltip says "A remote change was rejected — review the differences before re-saving." — but there is no review UI to open.

**User sees:** "Conflict — review" pill in the topbar. Clicking it does nothing visible. Edit is stuck in outbox.failed. Subsequent edits to the same track also queue and are blocked (per-doc ordering, engine.ts:208-214). Subsequent edits to *other* tracks still drain fine (different `(collection, docId)` key). The pill stays red until the page is reloaded or `discardFailedOutboxRows()` is invoked — note that the indicator's default "retry" handler `retryFailedOutboxRows` (cleanup.ts; SyncIndicator.tsx:154-156) is NOT wired to the conflict state, only to `state === 'failed'`.

**Verdict:** The user-reported "Conflict — review" pill is real and reproducible. The FSM transitions to `'conflict'` on any genuine version-mismatch that doesn't trigger the self-heal (5b). The modal is force-disabled, so the user has no in-app path to resolve. The pill is a dead end. Reload helps: on reload, the failed outbox row persists; `engine.start()` (engine.ts:112-121) only resets `sending` orphans, not `failed`. So even reload doesn't recover. The user has to clear Dexie or have a developer call `discardFailedOutboxRows()`. Per-doc ordering means any further edits to the same track silently queue and never drain.

There is no automatic "promote conflict back to retry" — `resolveConflict` is the only documented out, and the UI no longer exposes it.

---

## Scenario 6 — SW reload mid-edit

**Setup:** User has the edit pane open on a track. They have typed into the Key `<select>` (state synced into `MobileRowCard`'s local `key` state via `onChange`); **the burst-flush has not fired yet** for select that's true only if `onChange` did not also call `commitKey` — but actually `MobileRowCard.tsx:350` calls `commitKey(e.target.value)` on `<select>` change immediately. So for the Key field, edits commit on each onChange. The realistic mid-edit case is the Title `<input>` (line 340) or the Notes `<textarea>` (line 368) — those commit on `onBlur`, NOT on each keystroke. So the typed-into-but-not-blurred case is real for title/notes.

User is typing in Title. `title` state is `"My new"` but `track.title` is still `"My old"`. No `commit*()` fired. **No outbox row enqueued. No engine writeback pending.** Engine is idle.

Vercel deploys. Service worker activates. Browser fires `controllerchange`.

**Step-by-step:**

1. `src/lib/firebase.ts:156-176` — `controllerchange` handler:
   - Logs "Service worker updated — waiting for sync drain before reload".
   - Dynamic-imports `./sync/init` and calls `whenEngineIdle(10_000)`.
2. `init.ts:255-281` — `whenEngineIdle`:
   - Reads `useSyncStatus.getState()`. Engine is idle (no outbox rows, state `'idle'`).
   - `isIdle({state:'idle', queued:0})` → true.
   - Resolves immediately with `'idle'` (synchronous return at line 263-266).
3. Back in firebase.ts:170-173 — logs "Sync drained — reloading", calls `window.location.reload()`.
4. Page reloads. SSR runs. The track's title is `"My old"` (engine never saw `"My new"` — the user's in-flight text was only in React component state).

**Where it diverges:** `whenEngineIdle` checks the **engine** (`useSyncStatus`). It does not check:
- React component-local state in `MobileRowCard` (the half-typed string).
- Pending burst-flushes in `pendingBursts` (undo-store.ts:98) — though those only exist for already-committed bursts, and a half-typed unblurred input is not in a burst yet.
- DOM focus state.
- Any pre-commit form state anywhere.

The check is "the outbox is empty" — which is true. The unflushed React state is invisible to it.

**User sees:** Page reloads. The Title field shows `"My old"` — their typed `"My new"` is gone. No warning, no recovery, no toast.

**Verdict:** Data loss for un-blurred text fields on SW deploy. `whenEngineIdle` is a sync-engine readiness check; it does not coordinate with the React tree's pre-commit state. This matches the project memory note `feedback_harness_real_firestore.md` about the zero-latency adapter missing races — but here the gap is even more direct: the design doesn't model "user has typed but not committed" at all. Cell-onChange commit (KeyCell, TypeCell, BPM via onBlur — and Title commits on `commitTitle`/onBlur) means the gap window is bounded to "between the last keystroke and the next blur". For a user typing actively, that window is always non-empty.

The SW reload latches in 10s either way (`timeoutMs = 10_000`, line 256). The reload is guaranteed to happen — either when engine idles or after the deadline.

---

## Summary table — symptom × cause

| Symptom user reports | Scenario | Root in code | Source-of-truth crossover |
|---|---|---|---|
| Deleted tracks come back | 4 (historical; closed at HEAD) | `page.tsx:58-64` + `engine.ts:261-271` — pre-fix, hydrator primed from `setlists/{S}.tracks[]` (embedded, still contained the deleted track) and tombstones were cleared on delete-commit, so nothing blocked re-priming | Embedded `setlists/{S}.tracks[]` vs top-level `tracks/{id}`. Closed by `c9e92a5` + `6cd2c4e`. |
| Library adds invisible in editor | 3 (pre-`4ee6e70`; closed at HEAD) | `use-add-to-setlist.ts:172-183` wrote only the embedded array; editor SSR `page.tsx:154-161` reads top-level → new tracks missing | Embedded vs top-level. Closed by `4ee6e70`'s `mirrorTracksToTopLevel`. Still has a small window where mirror outbox hasn't drained when editor reloads. |
| Library adds invisible in perform view | 3 (open at HEAD) | `use-add-to-setlist.ts` updates embedded; perform view consumes embedded — but tracks added via the **editor AddBar** in Scenario 2 write only top-level; perform view never sees those | Direction reversed: editor writes top-level only; perform-view reader still on embedded. |
| Mid-edit refresh wipes typed text | 6 | `firebase.ts:156-176` + `init.ts:255-281` — `whenEngineIdle` only sees outbox state, not React component-local text | React state vs engine state. No coordination. |
| "Conflict — review" pill stuck red | 5c | `engine.ts:410-415` flips outbox to `failed` and dispatches `DRAIN_VERSION_MISMATCH` → FSM `'conflict'`; `ReconciliationProvider.tsx:242` hard-codes `hasConflict = false` so modal never opens; SyncIndicator at `SyncIndicator.tsx:163-164` only fires retry on `'failed'`, not `'conflict'` | FSM `'conflict'` state lives even though modal disabled. Per-doc ordering blocks further drains for that doc. No UI escape. |
| Dashboard `trackCount` stale | 2, 4 (mitigated, conditional) | `SetlistGridHydrator.tsx:335-370` — 800ms debounce + best-effort `applyEdit`; if write fails or tab closes during debounce, count never updates | Live track count in Dexie vs `setlists/{S}.trackCount`. Only the editor's hydrator reconciles. |
| Hydrator's lazy-hydration re-runs | n/a (closed) | `SetlistGridHydrator.tsx:225` `fanoutStartedRef` ref guard + `initialSetlist.hydrated` gate at line 223; trackCount folded into the same write (line 255-267) per `5601726` | Trackcount reconciler racing the cascade — closed by single-write. |
| Edit silently lost (race) | 5c (via failed outbox row) | Engine never auto-retries `DRAIN_VERSION_MISMATCH` for `remote!==undefined`; row sits in `failed`; `discardFailedOutboxRows` discards without applying | Local edit in outbox.failed vs server. User has no path to push it through. |
| Self-heal of legacy doc edit | 5b (working) | `engine.ts:400-409` — `remote=undefined` + `attempts===0` → clear precondition + retry → server timestamp lands → subsequent edits normal | Pre-stamp legacy doc vs stamped engine model. Bounded to one auto-retry. |

---

## Verification footer

**Files opened (read directly):**
- `src/app/(main)/setlists/[id]/page.tsx` (full)
- `src/app/(main)/setlists/page.tsx` (full)
- `src/components/setlist/grid/SetlistGrid.tsx` (full)
- `src/components/setlist/grid/SetlistGridHydrator.tsx` (full)
- `src/components/setlist/grid/MobileRowCard.tsx` (lines 1-100 + grep)
- `src/components/setlist/grid/MobileCardList.tsx` (relevant sections)
- `src/components/setlist/grid/ReconciliationProvider.tsx` (full)
- `src/components/setlist/grid/SyncIndicator.tsx` (full)
- `src/components/setlist/grid/SetlistGridTopBar.tsx` (relevant sections)
- `src/hooks/use-add-to-setlist.ts` (full)
- `src/lib/local/write.ts` (full)
- `src/lib/sync/engine.ts` (full)
- `src/lib/sync/init.ts` (full)
- `src/lib/sync/state-machine.ts` (full)
- `src/lib/sync/snapshot-listener.ts` (full)
- `src/lib/sync/firestore-adapter.ts` (full)
- `src/lib/sync/store.ts` (full)
- `src/lib/sync/cleanup.ts` (first 50 lines)
- `src/lib/firebase.ts:130-208` (controllerchange + recovery)
- `src/lib/setlist-firebase.ts:40-260` (updateSetlistWithVersion + subscribeToAllSetlists)
- `src/lib/server-setlists.ts` (full)
- `src/components/setlist/SetlistDashboard.tsx` (top of file + dashboard hook grep)

**Confirmed directly:**
- HEAD = `4ee6e70`.
- `hasConflict = false` literal at `ReconciliationProvider.tsx:242`.
- SSR top-level branch at `page.tsx:154-161` gated on `serialized.hydrated === true`.
- Tombstone is NOT cleared on delete-commit success: `engine.ts:261-323` (writeback tx contains no `tombstones.delete`).
- Tombstone IS cleared on snapshot `removed`: `snapshot-listener.ts:260-261`.
- `commitTrackPatchImpl` calls `applyEdit({op:'update'})` with the row's snapshotted `expectedUpdatedAt`: `SetlistGrid.tsx:722-745` + per-cell call sites (`KeyCell` invocation at line 264-275).
- Self-heal gate at `engine.ts:400`: `if (/remote=undefined/.test(lastError) && row.attempts === 0)`.
- `useSyncStatus` is driven by `engine.onStateChange` → store.ts:25-33; FSM `'conflict'` is independent of `ReconciliationProvider`'s `hasConflict`.
- `whenEngineIdle` reads only `useSyncStatus`: `init.ts:260-281`.
- Library write order: `setlistService.updateSetlist` THEN `mirrorTracksToTopLevel`: `use-add-to-setlist.ts:180-193`.
- `mirrorTracksToTopLevel` uses `applyEdit({op:'set'}, {withoutUndo:true})`: lines 24-51.
- Engine per-doc ordering blocks further drains when status is `failed`: `engine.ts:208-214`.
- `retryFailedOutboxRows` only wired to `state === 'failed'`, not `'conflict'`: `SyncIndicator.tsx:163-164`.
- Hydrator's lazy-hydration fan-out folds `trackCount` into the same `setlists` update as `hydrated:true`: `SetlistGridHydrator.tsx:255-267` (the `5601726` fix).
- Engine writeback threads new `updatedAt` into pending outbox rows for the same `(collection, docId)`: `engine.ts:294-309`.
- `MobileRowCard` commits Title/Notes on `onBlur`, Key on `<select>` change, BPM on `onBlur`: lines 82-93 + 340-368.

**Inferred (NOT directly verified):**
- Perform view (`SetlistDrawer.tsx`) reads the embedded `setlists/{S}.tracks[]` for display — referenced in Scenario 2 and 4 verdicts. Not opened in this audit; based on the comment at `use-add-to-setlist.ts:18-20` ("for back-compat with perform view, print, dashboard") and the fact that the snapshot listener's top-level tracks query is editor-only (started in SetlistGridHydrator). Confirming this would require reading `SetlistDrawer.tsx`.
- The `subscribeToSetlist` callback inside the Undo handler in `use-add-to-setlist.ts:217-228` does not mirror its undo into top-level tracks. So undoing a library add removes the embedded entries only — the top-level `tracks/{newId}` rows remain orphaned. Not explicitly walked because the user's reported flows don't include undo from library.
- The dashboard's onSnapshot at `setlist-firebase.ts:238-258` is `orderBy("date","desc").limit(50)` — assumed to include the just-edited setlist; if S falls outside that limit, the dashboard's count wouldn't update at all. Not load-bearing for the user-reported symptoms.
- Reconciler debounce of 800ms in `SetlistGridHydrator.tsx:349` interacts with rapid tab close — assumed to drop the write on unmount. Not directly tested in the audit.
