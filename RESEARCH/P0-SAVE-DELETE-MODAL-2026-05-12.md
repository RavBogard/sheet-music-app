# P0 Save/Delete/Modal Investigation — 2026-05-12

Investigator: read-only research agent (no edits made).
Target HEAD: `7d6e43d` (master). Tier-1 fixes that landed: `57f4447` (T1.2), `5cdc405` (T1.3), `6878c53` (T1.4), `01c423c` (T1.5).

---

## Executive summary

Three independent bugs combine to produce all three reported symptoms. **None of them is "T1.3 over-firing on legacy pre-stamp Firestore docs" in the simple form the hypothesis describes** — but T1.3 IS implicated in a related way (see Hypothesis 1).

The dominant root cause is **structural, not in T1.3**:

1. **Resurrection of deleted tracks** is caused by the SSR page handler at `src/app/(main)/setlists/[id]/page.tsx:109-113` reading the legacy embedded `setlists/{id}.tracks[]` array as `initialTracks` on every reload. Nothing in the v50-05+ engine ever removes entries from that embedded array — the lazy-hydration cascade only flips `hydrated:true`. After a successful top-level `tracks/{id}` delete, the engine clears the tombstone (`engine.ts:275-280`), and the next reload's hydrator (`SetlistGridHydrator.tsx:159-173`) sees "embedded array has it, Dexie doesn't, no tombstone" → puts it back. The snapshot listener can't repair this because Firestore's `tracks where setlistId == X` query returns no record for the deleted id, so there's no `'removed'` delivery to feed `handleTracks`.

2. **Aggressive reconciliation-modal popups** are caused by **persistent `status: 'failed'` outbox rows that never clear**, plus T1.3 newly converting a previously-silent class of legacy edits into hard `VersionMismatchError`s, plus a state-machine quirk that holds `state` in `'conflict'`/`'failed'` until the outbox is fully empty. Any setlist with at least one pre-stamp legacy track on the server (no `updatedAt` field) now produces a fresh failed row on EVERY edit, which mutates `idSetKey` and re-opens the modal even after the user dismisses it.

3. **Added tracks don't save** is **not** caused by T1.3 directly — `op: 'set'` never runs `checkUpdatePrecondition` (init.ts:78-93). The most plausible mechanism is **the trackCount reconciler racing the lazy-hydration cascade** so the setlist's `hydrated:true` update fails with `VersionMismatchError`, latches state to `'conflict'`, blocks all future setlist writes (per-doc serialization), and — once the engine's drain returns `'stop-drain'` after the first VersionMismatch — leaves the user staring at the modal while their new-track outbox row IS draining successfully in the background. From the user's POV, "I added a track and the modal blocks me / Take theirs / now my track is gone" is consistent with `engine.resolveConflict(localId, 'theirs')` deleting an outbox row (engine.ts:546-547) and the user accidentally discarding the new track's pending `set`. The new track was never committed to Firestore because its outbox row was deleted under it.

**Confidence:** 85% on resurrection mechanism (#1), 75% on modal-frequency mechanism (#2), 60% on added-tracks-lost mechanism (#3). #3 has secondary plausible causes listed below.

---

## Hypothesis 1: T1.3 over-fires VersionMismatchError on legacy docs — PARTIALLY VERIFIED

**Refuted form:** "Every edit + delete on legacy pre-stamp Firestore docs now throws VersionMismatch."

- **Delete** is unaffected. `ProductionFirestoreAdapter.commitOutboxRow` `case 'delete'` (init.ts:137-140) calls `deleteDoc` directly with **no precondition check**. T1.3 only touches the `update` case (init.ts:94-136). Deletes still always succeed at the server.
- **Add** is unaffected. `case 'set'` (init.ts:78-93) is `setDoc` with no precondition.
- **Edit (update)** IS affected — but only for tracks that satisfy ALL of:
  - the local row has a defined `updatedAt` (so `expectedUpdatedAt !== undefined`), AND
  - the remote tracks/{id} doc has **no `updatedAt` field** at all (so `remoteMs === undefined`).

**Verified form:** T1.3 (`init.ts:65-72`) does turn the pre-stamp legacy case from "silent LWW" into a hard `VersionMismatchError`:

```ts
// init.ts:65-72
export function checkUpdatePrecondition(
    expectedUpdatedAt: number | undefined,
    remoteMs: number | undefined,
): string | null {
    if (expectedUpdatedAt === undefined) return null
    if (remoteMs === expectedUpdatedAt) return null
    return `expected updatedAt=${expectedUpdatedAt}, remote=${remoteMs ?? 'undefined'}`
}
```

The unit tests at `src/lib/sync/__tests__/init.test.ts:34-39` explicitly LOCK IN this behavior:
```ts
it('expected stamp set + remote stamp undefined → FAIL (regression for silent LWW)', () => {
    const err = checkUpdatePrecondition(1000, undefined)
    expect(err).not.toBeNull()
    expect(err).toContain('1000')
    expect(err).toContain('undefined')
})
```

**Where does the "defined local updatedAt + undefined remote updatedAt" combination actually occur in production?**

Two paths:

### Path A — synthetic `setlistUpdatedAt` from SSR

`src/app/(main)/setlists/[id]/page.tsx:40-56` (`buildLocalTracks`):
```ts
return rawTracks.map((t, index) => {
    const track = (t ?? {}) as Record<string, unknown>
    return {
        ...track,
        id: String(track.id ?? `${setlistId}-${index}`),
        setlistId,
        order: typeof track.order === "number" ? track.order : index,
        updatedAt: setlistUpdatedAt,   // ← synthetic stamp
    } as LocalTrack
})
```

Every track derived from the embedded `setlists/{id}.tracks[]` array gets `updatedAt = setlistUpdatedAt`, regardless of whether that track actually exists as a top-level `tracks/{id}` doc on Firestore.

The hydrator (`SetlistGridHydrator.tsx:151-173`) then `bulkPut`s these into Dexie. After the lazy-hydration cascade fans out (`SetlistGridHydrator.tsx:226-249`), the **first writeback** stamps each track's local `updatedAt` with a real server timestamp (engine.ts:281-321). BUT — if the user edits a cell BEFORE the cascade drains, or for **tracks that already exist top-level on Firestore from an earlier session** where the cascade succeeded but stamping was different, the local row can still carry the synthetic `setlistUpdatedAt`.

The legacy embedded `tracks[]` array stores tracks without their own `updatedAt`. When the cascade calls `applyEdit({op:'set'})`, the engine writes a fresh `serverTimestamp()` → Firestore now has a real stamp. **But** the snapshot listener line 290-296 SKIPS the modified-delivery when `local.updatedAt` is undefined OR `local.updatedAt >= change.updatedAt` — for `local = setlistUpdatedAt (T0)` and `change.updatedAt = freshly-stamped (T1)`, T0 < T1 → the snapshot listener DOES `put` the fresh data into Dexie. So this path usually self-heals.

### Path B — snapshot listener writes `updatedAt: 0` for un-stamped remote docs

`src/lib/sync/snapshot-listener.ts:94-98` (`timestampToMs`):
```ts
function timestampToMs(value: unknown): number {
    if (value instanceof Timestamp) return value.toMillis()
    if (typeof value === 'number') return value
    return 0   // ← undefined Timestamp → 0
}
```

And lines 127-136 (Firestore subscriber):
```ts
const updatedAt =
    c.type === 'removed' ? 0 : timestampToMs(data.updatedAt)
```

If a tracks/{id} doc on Firestore lacks `updatedAt` (pre-stamp legacy), the listener delivers `change.updatedAt = 0`. Then handleTracks:289-310 writes `next.updatedAt = 0` into Dexie when `!local` OR when `local.updatedAt < 0` (i.e., never — local is always ≥ 0 if defined). Practically the listener writes 0 only when there's no local row to compare against.

If the user then edits that row, `applyEdit({op:'update', expectedUpdatedAt: 0})` → engine drains → `runTransaction` reads remote → `remoteMs = undefined` → T1.3 returns error → **`VersionMismatchError`**.

The test at `init.test.ts:45-48` proves this is the intended new behavior:
```ts
it('expected stamp 0 + remote undefined → fail', () => {
    const err = checkUpdatePrecondition(0, undefined)
    expect(err).not.toBeNull()
})
```

### Net assessment

The hypothesis is verified in **edge cases**, not as the dominant cause for every edit. T1.3 will produce a fresh failed outbox row for any edit where:
- The local row has a synthetic `setlistUpdatedAt` OR a 0 stamp from the snapshot listener, AND
- The remote `tracks/{id}` (or `setlists/{id}`) doc lacks `updatedAt`

For a production setlist with any pre-stamp legacy track, this is enough to drive the "modal opens too often" symptom. But it does NOT explain "added tracks don't save" or "deletes resurrect."

---

## Hypothesis 2: Embedded `setlists/{id}.tracks[]` array is never cleaned — VERIFIED (resurrection root cause)

The page-level SSR fetcher at `src/app/(main)/setlists/[id]/page.tsx:88-113` reads `serialized.tracks` directly and unconditionally — regardless of `serialized.hydrated`:

```ts
const doc = await db.collection("setlists").doc(id).get()
// ...
const serialized = serializeSetlist(doc.id, data) as Record<string, unknown> & { id: string }
const initialSetlist = buildLocalSetlist(serialized)
const initialTracks = buildLocalTracks(
    id,
    initialSetlist.updatedAt,
    serialized.tracks,             // ← legacy embedded array, no conditional on hydrated
)
```

**`buildLocalTracks` is the ONLY source of tracks at SSR time.** Top-level `tracks/{id}` docs are NOT queried server-side. The hydrator (`SetlistGridHydrator.tsx:68-184`) primes Dexie from this `initialTracks` array, then the snapshot listener fills in any post-cascade modifications.

**What clears entries from `setlists/{id}.tracks[]`?** Nothing in the new sync engine. Confirmed by grepping `src/lib/setlist-firebase.ts` — only `createSetlist`/`updateSetlist`/`cloneFor*` paths write the embedded array. The v50-05 cutover deliberately stopped writing it from `applyEdit` (the comments at `BUGFIX-PLAN-2026-05-12.md:11-12` describe "All writes go through `applyEdit`" — and applyEdit never touches the embedded array). The lazy-hydration cascade at `SetlistGridHydrator.tsx:226-249` only flips `hydrated:true`; it does NOT clear the embedded array.

So after a successful delete:
- `tracks/{X}` is gone from Firestore top-level
- `tombstones[{tracks, X}]` is gone from Dexie (cleared by `engine.ts:275-280` on successful delete commit, AND by `snapshot-listener.ts:262` on `'removed'` delivery)
- `setlists/{S}.tracks[]` STILL contains X

Next page reload:
1. SSR: `initialTracks` contains X (with synthetic `updatedAt = setlistUpdatedAt`).
2. Hydrator (`SetlistGridHydrator.tsx:159-173`):
   ```ts
   for (const t of initialTracks) {
       if (trackOutboxIds.has(t.id)) continue
       if (trackTombstoneIds.has(t.id)) continue   // ← tombstone was cleared
       const local = localById.get(t.id)            // ← undefined (deleted last session)
       if (!local || ...) {
           toPut.push(t)                            // ← X is PUT BACK
       }
   }
   ```
3. `db.tracks.bulkPut(toPut)` → **X resurrected in Dexie**
4. Snapshot listener subscribes to `tracks where setlistId == X` — Firestore returns the current set (which does NOT include X). No `'removed'` delivery is fired for X because the listener never knew about it.
5. Local Dexie keeps the zombie X. User sees the deleted track back.

This affects ALL tracks that originated from the legacy embedded array. Tracks added post-v50-05 (via `handlePickSong` / `handleCreateFreeText` / `handleAddTrackOfType` — which never touch the embedded array) are NOT affected — those deletes stay deleted because they were never in `setlists/{S}.tracks[]` to begin with.

**This is the primary "deleted tracks resurrect" root cause.** It is NOT caused by T1.3.

---

## Save-path trace (add new track)

User clicks AddBar tile → `handlePickSong` (`SetlistGrid.tsx:1494-1538`):

```ts
const newId = makeId()
const order = rows.length
const defaults = await seedTrackFromSong(song.id)
await applyEdit({
    op: 'set',
    collection: 'tracks',
    doc: {
        id: newId,
        setlistId,
        songId: song.id,
        fileId: song.id,
        order,
        title: song.title,
        type: 'song',
    },
})
if (Object.keys(defaults).length > 0) {
    // ...
    await applyEdit({
        op: 'update',
        collection: 'tracks',
        docId: newId,
        patch,
        // NB: NO expectedUpdatedAt (line 1525-1529 comment: "row was just
        // created locally via the set above; first server commit hasn't
        // landed yet so there's no server `updatedAt` to assert")
    })
}
```

1. `applyEdit({op:'set'})` enqueues outbox row with **`expectedUpdatedAt: undefined`** (write.ts:38-41 — `set` op never carries expectedUpdatedAt).
2. Dexie tx commits → local tracks/{newId} put + outbox row added + any stale tombstone for newId cleared (write.ts:105-115). Local row has NO `updatedAt` field at this point.
3. write.ts:190 fires `getSyncEngine()?.notifyEditCommitted()` (T1.2 fix).
4. Engine pumps → drainOnce → 'set' row's status flips to 'sending' (engine.ts:248) → `setDoc(ref, {...payload, updatedAt: serverTimestamp()})` (init.ts:80-83).
5. Engine re-reads via `getDoc` to capture resolved `serverTimestamp` (init.ts:88-91). Returns `{ updatedAt: ms }`.
6. Engine writeback transaction (engine.ts:268-326): deletes outbox row + threads new `updatedAt=ms` into any pending same-doc rows + writes `{...existing, updatedAt: ms}` into local Dexie.
7. The `applyEdit({op:'update'})` for defaults (line 1530) is enqueued with `expectedUpdatedAt: undefined` (no precondition). When it drains, runTransaction reads remote → matches → `tx.update`. Succeeds.
8. The trackCount reconciler (`SetlistGridHydrator.tsx:313-349`) sees `liveTrackCount` change, debounces 800ms, fires `applyEdit({op:'update', collection:'setlists', patch:{trackCount}})` WITHOUT `expectedUpdatedAt`. No precondition. Drains.

**Add path is structurally sound for fresh setlists.** The only way it fails is if the engine is stuck:

- A pre-existing failed outbox row for `setlists/{S}` blocks setlist writes (engine.ts:210-214 — failed rows put their docId in `blockedDocs`, blocking further drains of same docId).
- A pre-existing failed row anywhere puts state at `'failed'`/`'conflict'`, which:
  - Opens the reconciliation modal
  - If the user clicks "Resolve all and save" with the default `'theirs'` choice (ReconciliationProvider.tsx:459), `engine.resolveConflict(r.localId, 'theirs')` deletes the failed outbox row (engine.ts:546-547).
  - **If the user accidentally `'theirs'`-resolves a `set` row that's not actually failed but is sitting in the `failed` bucket because it cascaded from a sibling failure**, the new track's outbox is destroyed before it commits.

Actually re-reading engine.ts:545-547 — `'theirs'` calls `db.outbox.delete(localId)` ONLY on the specific localId the modal hands it. So only literally-failed rows get deleted. But the local row is NOT restored to server state — local Dexie still has the track, but the outbox is gone. Now the track is in local-only purgatory: never on the server, but visible in the UI until the next reload (after which `initialTracks` won't contain it, snapshot listener won't deliver it, and Dexie purges it via... actually Dexie never purges; it stays as orphan. But the SetlistGrid live query shows it.

So the "added track disappears" symptom could come from:
- User adds track → outbox set X (pending)
- Pre-existing failed row Y (different doc) keeps modal open  
- User dismisses modal or resolves Y → modal re-opens because idSetKey changes when new failed rows appear
- A new versionmismatch on a DIFFERENT row (e.g., the cascade hydrated:true) → that row goes 'failed', state stays 'conflict'
- BUT: the per-doc serialization in drainOnce (engine.ts:210-214) means OTHER docs still drain.

So adds SHOULD succeed at server in this scenario. Where might they actually fail?

**Plausible failure cause:** Re-read `engine.handleAdapterError` (engine.ts:355-513). When the engine throws VersionMismatchError, it returns `'stop-drain'` (line 397). This **terminates the entire drainOnce loop** for the current pump cycle. So if a set X is BEHIND a `update setlists/{S}` row in `dueRows`, set X never gets attempted. Next pump fires — at line 207-228:

```ts
const allRows = await this.db.outbox.toArray()
const oldestPerDoc = new Map<string, OutboxRow>()
const blockedDocs = new Set<string>()
for (const r of allRows) {
    const k = `${r.collection}/${r.docId}`
    if (r.status === 'failed' || r.status === 'sending') {
        blockedDocs.add(k)
        continue
    }
    // ...
}
```

The failed setlist row blocks `setlists/{S}` only. The set X for `tracks/{X}` is still pending — eligible. So next pump should drain it.

**But there's a catch:** `scheduleNextPump` only fires if there's a pending row (engine.ts:520-536). If state is `'conflict'` and no pending rows are due, no pump scheduled. New edits trigger `notifyEditCommitted` → pump fires. So new adds nudge the engine. They should drain.

UNLESS `lock.tryAcquire()` fails (engine.ts:183) — i.e., another tab holds the cross-tab lock. Then pump exits without draining. The lock has an `onAvailable` callback (engine.ts:137-139) that fires when the lock becomes available, which triggers another pump. So eventually drains.

I cannot confirm an unconditional path where adds get permanently lost. The most likely explanation is the user is **inadvertently discarding adds via the modal flow**: the modal pops up on a failed setlist write (cascade or T1.3 trip), user clicks "Resolve all and save" with default `'theirs'`, sees other in-flight pending rows in the listing... actually no, modal only shows `status === 'failed'`. So set X (pending) is NOT in the modal. Safe.

**Alternative hypothesis for "added tracks don't save":** the user reloads the page right after adding, before the engine drained. Reload → SSR → embedded array doesn't have new track → SetlistGrid mounts → Dexie tracks query returns persisted Dexie rows including new track → user sees it. Engine boot resets 'sending' to 'pending', pump fires, drains. Should work.

UNLESS the SW reload coordination (T2.4) is racing. T2.4 added `whenEngineIdle()` to coordinate SW updates with engine drain, but it only triggers on SW `controllerchange` (firebase.ts:151-154 era). A fresh user-initiated reload doesn't go through `whenEngineIdle`. Engine just restarts and resumes.

**My best remaining hypothesis for #3:** The user perceives "added tracks don't save" because they see the modal pop, dismiss/resolve it, and the **add ROW IS still local** (Dexie has it) but **eventually the snapshot listener's interaction with the embedded array path triggers a stale-delivery overwrite**. Specifically: if the user adds X, engine drains (success), then a snapshot listener delivers Y (a sibling track) with stale data, and the trackCount reconciler races to write setlist.trackCount but fails because expected = some old value, etc. None of these are conclusive.

**Specific remaining suspects to verify with telemetry (Sentry / edit-log):**
- Count of `VersionMismatchError` outcomes recorded in `edit_log` table for `op:'set'` rows. If non-zero, that's a smoking gun for a path I missed.
- Count of outbox rows with `op:'set'` that get `status:'failed'`. By my reading this should be impossible because case 'set' never throws VersionMismatch. If non-zero, there's a code path I didn't trace.

---

## Delete-path trace (delete existing track)

User clicks Delete on a row → `handleDelete` (`SetlistGrid.tsx:1085-1101`):

```ts
async (track: LocalTrack) => {
    const title = track.title ?? ''
    if (typeof title === 'string' && title.trim() !== '') {
        const ok = await confirmFn({ kind: 'row', title })
        if (!ok) return
    }
    await applyEdit({
        op: 'delete',
        collection: 'tracks',
        docId: track.id,
        expectedUpdatedAt: track.updatedAt,   // ← passed but unused for delete
    })
}
```

1. `applyEdit({op:'delete'})` (write.ts:137-152) inside a Dexie tx:
   - Reads `existingForTombstone` for diagnostic `originalUpdatedAt`
   - `db[collection].delete(edit.docId)` (physical remove from Dexie)
   - `db.outbox.add({status:'pending', op:'delete', collection, docId, payload:{}, expectedUpdatedAt:track.updatedAt, ...})`
   - `db.tombstones.put({collection, docId, deletedAt, originalUpdatedAt})`
2. write.ts:190 fires `notifyEditCommitted()`.
3. Engine drains → `case 'delete'` (init.ts:137-140):
   ```ts
   case 'delete': {
       await deleteDoc(doc(firestoreDb, row.collection, row.docId))
       return {}
   }
   ```
   No precondition check. Always succeeds (Firestore `deleteDoc` is idempotent — succeeds even if doc doesn't exist).
4. Engine writeback transaction (engine.ts:268-326):
   - `db.outbox.delete(row.localId!)`
   - `if (row.op === 'delete') db.tombstones.delete([row.collection, row.docId])` ← **tombstone cleared here**
5. Snapshot listener (`snapshot-listener.ts:225-341`) receives `'removed'` change for tracks/{X}:
   - `outcome: 'remove-applied'` if local exists; idempotent if not
   - `db.tombstones.delete(['tracks', change.docId])` ← **tombstone cleared again** (no-op)
6. Server is now correctly in sync. **Embedded `setlists/{S}.tracks[]` is unchanged** (no code touches it).

The bug is at step 6. See Hypothesis 2.

**Cross-check:** in the same Dexie tx (engine.ts:268-326), why does the engine clear the tombstone on successful delete? Comment at engine.ts:264-267:

> "for successful delete commits, also clear the tombstone — server has acknowledged the delete, so the deletion intent is now durably realized on the server. Future server-priming passes will simply not see the doc; the tombstone is no longer needed."

This reasoning **assumes** server-priming reads from the live tracks/{id} collection. It DOES for the snapshot listener (correct). It DOES NOT for the SSR hydrator at `page.tsx:88-113`, which reads from the embedded array (incorrect). The tombstone-clearing is the wrong call as long as the SSR path still reads embedded.

---

## Resurrection mechanism

Step-by-step, fully concrete:

1. **Server state before delete:**
   - `setlists/S = { tracks: [{id:'X', title:'Adon Olam', ...}, {id:'Y', ...}], updatedAt: T0, hydrated: true, ... }`
   - `tracks/X = { setlistId:'S', title:'Adon Olam', updatedAt: T1, ... }` (T1 set by lazy-hydration cascade in a prior session)
   - `tracks/Y = { ... }`
2. **User deletes X:**
   - Dexie: tracks/X removed, tombstones[{tracks,X}] written, outbox: `{op:'delete', tracks/X, expectedUpdatedAt:T1, status:'pending'}`
   - Engine pumps → `deleteDoc(tracks/X)` → success
   - Engine writeback tx: outbox row deleted, tombstone deleted
   - Snapshot listener: fires `'removed'` for X → no-op deletes (already gone)
3. **Server state after delete:**
   - `setlists/S = { tracks: [{id:'X', ...}, {id:'Y', ...}], updatedAt: T0, hydrated: true, ... }` ← **tracks[] STILL has X**
   - `tracks/X` does not exist
   - `tracks/Y` unchanged
4. **User reloads page:**
   - SSR: `serializeSetlist` returns `{ ..., tracks: [X, Y], updatedAt: T0, hydrated: true }`
   - `buildLocalTracks` returns `[{id:'X', updatedAt: T0, setlistId:'S', ...}, {id:'Y', updatedAt: T0, ...}]`
   - Page renders `<SetlistGridHydrator initialSetlist={...} initialTracks={[X, Y]} />`
   - Dexie state on this device: tracks/X is gone (deletion persisted across reload), tracks/Y still there with `updatedAt: T1y`
   - Hydrator effect (line 64-184):
     - trackOutboxIds: empty
     - trackTombstoneIds: empty (tombstone was cleared)
     - localById: { Y: {...} }
     - Iteration:
       - X: `!localById.has('X')` → push to toPut
       - Y: `localById.has('Y')`, `local.updatedAt (T1y) >= initialTrack.updatedAt (T0)` → skip
     - `db.tracks.bulkPut([X])` → **X is back in Dexie**
   - `setHydration('done')`
5. **Snapshot listener mounts:**
   - Subscribes to `tracks where setlistId == S`
   - Initial snapshot delivers `'added'` for Y (currently in Firestore)
   - X is NOT in Firestore → no `'added'` for X, no `'removed'` either
   - handleTracks processes Y: tombstone none, local has Y with T1y, `change.updatedAt = T1y` → `local >= change` → skip
6. **User sees deleted track X back in the grid.**

If the user deletes X again, the cycle repeats. The embedded array is never cleaned.

**Why this affects "deleted setlists" (per FIX-PLAN-V2 references):** same mechanism applies to setlist-level deletes, but the resurrection is at the dashboard-list level (Firestore query of `setlists` collection). Out of scope for this P0 since the symptom report is tracks.

---

## Modal trigger mechanism

The reconciliation modal opens when (`ReconciliationProvider.tsx:219-220, 265`):

```ts
const hasConflict =
    (state === 'conflict' || state === 'failed') && failedRows.length > 0
// ...
const open = hasConflict && dismissedKey !== idSetKey
```

`idSetKey` is computed at line 252-259:

```ts
const idSetKey = useMemo(
    () =>
        failedRows
            .map((r) => `${r.localId}:${r.collection}/${r.docId}`)
            .sort()
            .join('|'),
    [failedRows],
)
```

**Every time the set of failed outbox rows changes, `idSetKey` mutates and `dismissedKey !== idSetKey` becomes true again.** The dismissal only sticks for the EXACT same set of failed rows.

State transitions to `'conflict'` on `DRAIN_VERSION_MISMATCH` (state-machine.ts:49-50). State transitions to `'failed'` on `DRAIN_BUDGET_EXHAUSTED` (5 transient-error retries) or `DRAIN_AUTH_FAILED`. `RemoteDocMissingError` dispatches `DRAIN_BUDGET_EXHAUSTED` (engine.ts:416), so it surfaces as `failed`. Critical edge: state-machine.ts:46-47:

```ts
case 'DRAIN_OK':
    return 'idle'
```

`DRAIN_OK` is only dispatched when `remaining === 0` (engine.ts:347 or 233). So as long as ANY outbox row exists (including a failed one), state is sticky in `'conflict'`/`'failed'`.

**Combined behavior under T1.3:**
- Pre-stamp legacy track edits now trip `VersionMismatchError` (per Hypothesis 1 Path B).
- Each such edit → a new failed outbox row.
- New failed row → idSetKey mutates → modal opens (or stays open if it was already open).
- User clicks "Resolve all and save" with default `'theirs'` (modal default is now `'theirs'` per `ReconciliationProvider.tsx:459`) → `engine.resolveConflict(localId, 'theirs')` deletes the failed row (engine.ts:546-547). Local Dexie still has the user's edit.
- Next edit on the same row → again expectedUpdatedAt (still synthetic / 0 / stale), remote still no stamp → VersionMismatch again → modal again.

**This is the "aggressive modal popups" cause.** Pre-T1.3 these would have silently last-write-won. Post-T1.3 they surface as conflict-loop.

**Secondary modal cause: persistent failed row from cascade race.** The lazy-hydration cascade fires `applyEdit({op:'update', setlists/{S}, expectedUpdatedAt: initialSetlist.updatedAt})` for `hydrated:true`. If the trackCount reconciler (`SetlistGridHydrator.tsx:313-349`, fires 800ms after Dexie track count changes) runs BEFORE the cascade's hydrated:true row drains, the trackCount reconciler's `applyEdit({op:'update', setlists/{S}})` (no expectedUpdatedAt) drains first, bumps server `setlists/{S}.updatedAt` to T0+ε, and now the cascade's hydrated:true row has stale expectedUpdatedAt=T0 → VersionMismatch on drain → setlists/{S} row goes `'failed'` → modal opens.

Per-doc serialization (engine.ts:210-214) then blocks **all further setlist writes** until the user resolves the failed setlist row. Trackcount reconciler keeps trying (each tick enqueues a new pending row that gets blocked by the failed one). On reload, the cascade re-fires (setlist.hydrated never landed `true`), repeating the cycle.

This is consistent with the modal opening repeatedly even after the user dismisses.

---

## Other findings

### F1 — `set` ops don't check for tombstones

`write.ts:105-115` does clear the tombstone on `op:'set'` for the case "user deletes then re-creates same docId" — good. But the listener at `snapshot-listener.ts:262, 270-282` also clears the tombstone on `'removed'` deliveries. So a delete-then-resurrection-via-embedded-array would have the tombstone cleared multiple times, which is fine (idempotent) but conceptually fragile.

### F2 — Embedded array stays stale even after lazy-hydration declares the migration done

`SetlistGridHydrator.tsx:240-249` only writes `{ hydrated: true }` to the setlist. **It does NOT clear `tracks[]`.** Conceptually the migration should also stamp the embedded array as "do not use" (e.g., `tracks: deleteField()` or `migratedFromEmbeddedAt: ts`). The page.tsx SSR should check `serialized.hydrated === true` and prefer the top-level `tracks/{id}` query.

### F3 — `useLiveQuery(... trackCount ...)` reconciler can fight the cascade

The reconciler is gated on `hydration === 'done'` AND `liveTrackCount !== undefined` AND drift from `lastWrittenCountRef.current ?? initialSetlist.trackCount`. After the cascade fires its N `set` ops, the live count drifts → reconciler queues a setlist update WITHOUT `expectedUpdatedAt`. This races the cascade's `hydrated:true` update which DOES carry `expectedUpdatedAt: initialSetlist.updatedAt`.

This is a fundamental two-writer race on `setlists/{S}` between two pieces of code in the SAME component. Resolution by per-doc serialization in the engine cannot help because the trackCount row queued AFTER the hydrated:true row (in same flush microtask) but might be deeper / older `localId` — depending on which `applyEdit` resolved first.

### F4 — Snapshot listener cannot distinguish "doc removed from Firestore" from "doc never existed"

`startSnapshotListener` subscribes via `query(... where setlistId == X)`. If a docId is missing from the query result, the listener has no way to fire `'removed'` for it because Firestore's `docChanges()` only fires for previously-seen docs that leave the query. On first subscribe with `X` missing, `X` is never in the snapshot → never fires `'removed'` → cannot tell hydrator "this is gone." This compounds Hypothesis 2.

### F5 — `state === 'failed'` opens the modal but failed rows include non-VersionMismatch cases

T1.4 added per-row labeling (`classifyOutboxError`) which is good UX. But the modal still opens for `RemoteDocMissingError` (dead-letter via `DRAIN_BUDGET_EXHAUSTED`), `AuthError`, and dead-letter transients. A network blip during a high-frequency edit session can push state to `'failed'` (5 retries × backoff 500/1000/2000/4000/8000ms) and pop the modal. This is by design but contributes to perceived "modal too often."

### F6 — `engine.resolveConflict('theirs')` doesn't restore server data to local

`engine.ts:546-547`:
```ts
if (choice === 'theirs') {
    await db.outbox.delete(localId)
}
```

It only deletes the outbox row. Local Dexie still has the user's failed edit. The user thinks they took "theirs" but their local screen shows mine. The snapshot listener will only correct this if a future remote update bumps the server's `updatedAt` past the local's. In the meantime, the user sees a UI that disagrees with what they just chose. This may be perceived as "the modal popup did nothing" or as data loss.

### F7 — T1.5 confirmed `clearFirestoreIndexedDB` does NOT wipe outbox

Verified the regression test at `src/lib/__tests__/firebase-recovery.test.ts`. The regex `/firestore/i` does not match `crc-local`. Not implicated in this P0.

---

## Recommended fix (concrete code changes)

### Fix #1 — Stop reading embedded `tracks[]` for already-hydrated setlists (PRIMARY FIX)

**File:** `src/app/(main)/setlists/[id]/page.tsx:108-113`

Add a conditional in the page-level fetcher: when `serialized.hydrated === true`, query top-level `tracks/{id}` instead of using the embedded array:

```ts
const initialSetlist = buildLocalSetlist(serialized)
let initialTracks: LocalTrack[]
if (serialized.hydrated === true) {
    // Authoritative source: top-level tracks/{id} collection.
    const tracksSnap = await db
        .collection('tracks')
        .where('setlistId', '==', id)
        .orderBy('order')
        .get()
    initialTracks = tracksSnap.docs.map((d) => ({
        ...d.data(),
        id: d.id,
        setlistId: id,
        updatedAt: (d.data().updatedAt?.toMillis?.() ?? 0),
    } as LocalTrack))
} else {
    initialTracks = buildLocalTracks(id, initialSetlist.updatedAt, serialized.tracks)
}
```

**Why this fixes resurrection:** once `hydrated:true` flips, the embedded array is never read again. Deleted tracks don't reappear on reload.

**Risk:** requires a Firestore index for `tracks` by `(setlistId, order)`. Likely already exists per `firestore.indexes.json`.

### Fix #2 — Don't clear the tombstone on engine delete-commit success while the embedded array can still be read

**File:** `src/lib/sync/engine.ts:275-280`

Either:
- (a) Remove the tombstone-clear in the delete-success branch entirely (keep the tombstone for ever, prune on TTL elsewhere). The cost: orphan tombstones over time.
- (b) Only clear the tombstone if the setlist is fully migrated (i.e., consult `setlists.hydrated`). Adds a cross-collection read inside a tx.
- (c) **Preferred:** keep the tombstone-clear, but **only clear it inside the snapshot-listener's `'removed'` branch** AND ALSO **inside Fix #1's page-level fetcher when hydrated:true is in effect**. This way, the tombstone protects against the embedded-array resurrection until the embedded-array path is no longer authoritative.

Concretely, drop engine.ts:275-280:
```ts
- if (row.op === 'delete') {
-     await this.db.tombstones.delete([
-         row.collection,
-         row.docId,
-     ])
- }
```

This leaves the tombstone in Dexie even after server confirms the delete. The hydrator's tombstone guard (`SetlistGridHydrator.tsx:163`) then blocks resurrection forever. Tombstones grow without bound — acceptable in the short term (one row per delete is small); add a 30/90-day TTL prune later.

### Fix #3 — Re-stamp legacy tracks at read time if remote has no updatedAt

This addresses Hypothesis 1's modal-flood problem WITHOUT reverting T1.3's correctness:

**File:** `src/lib/sync/init.ts:94-130` (the `update` case)

When `runTransaction` reads remote with `remoteMs === undefined`, perform a remediation write before the user's update: `tx.update(ref, { updatedAt: serverTimestamp() })`, then `throw VersionMismatchError`. The next user edit will see a stamped doc → preconditions match → success.

OR — cleaner — accept the precondition error semantically but UPGRADE the local `updatedAt` from the server's now-stamped value and auto-retry the same outbox row once with the new expectedUpdatedAt:

Add to engine.ts:391-398:
```ts
if (err instanceof VersionMismatchError) {
    // Special case: remote was unstamped. Re-read remote, harvest server stamp,
    // patch expectedUpdatedAt in-place, retry once.
    if (/remote=undefined/.test(lastError) && row.attempts === 0) {
        const fresh = await this.adapter.readDoc(row.collection, row.docId)
        if (fresh) {
            await this.db.outbox.update(localId, {
                expectedUpdatedAt: fresh.updatedAt,
                attempts: 1,
            })
            return 'continue'  // retry next pump
        }
    }
    await this.db.outbox.update(localId, { status: 'failed', lastError })
    this.dispatch({ type: 'DRAIN_VERSION_MISMATCH' })
    return 'stop-drain'
}
```

This silently self-heals pre-stamp legacy data on first edit. No user-visible modal. Subsequent edits proceed normally.

### Fix #4 — Fix the trackCount-vs-cascade race on setlist updates

**File:** `src/components/setlist/grid/SetlistGridHydrator.tsx:216-273` (lazy-hydration) and `:296-349` (trackCount reconciler)

Make the trackCount reconciler suppressed while the cascade is in flight: add a ref that the cascade sets to `true` before fanout and clears in `finally`. Reconciler short-circuits when the ref is set.

OR — cleaner — fold the trackCount update INTO the cascade's final setlist update:

```ts
await applyEdit(
    {
        op: 'update',
        collection: 'setlists',
        docId: setlistId,
        patch: { hydrated: true, trackCount: initialTracks.length },
        expectedUpdatedAt: initialSetlist.updatedAt,
    },
    { withoutUndo: true },
)
```

Then the live-count reconciler only triggers on subsequent user-driven track add/remove, well after the cascade has settled.

### Fix #5 — Don't open the modal on every transient/dead-letter

**File:** `src/components/setlist/grid/ReconciliationProvider.tsx:219-220`

Limit `hasConflict` to actual `VersionMismatchError` failures by checking `classifyOutboxError`:

```ts
const conflictRows = useMemo(
    () => failedRows.filter((r) => classifyOutboxError(r.lastError) === 'version-mismatch'),
    [failedRows],
)
const hasConflict = (state === 'conflict' || state === 'failed') && conflictRows.length > 0
```

Surface non-conflict failures via `SyncIndicator`'s "Failed — retry" affordance instead. This keeps the modal for actual cross-writer conflicts and stops it firing on auth/network/RemoteDocMissing.

### Fix #6 (band-aid for "until #1 lands") — Track-snapshot listener as authoritative source

In the hydrator's first effect, **AFTER** writing `initialTracks` from the embedded array, mark the hydration as "embedded" and skip the bulkPut until the snapshot listener fires its initial-snapshot pass. Use the listener's snapshot as the source of truth for which tracks exist on the server.

This is structurally similar to the proposed Fix #1 but client-side. Risk: snapshot listener takes a network round-trip; user sees no tracks until it arrives. Not preferred.

---

## Verification footer

Files opened and what I confirmed (vs inferred):

- `src/lib/sync/init.ts` — CONFIRMED: T1.3 `checkUpdatePrecondition` semantics (lines 65-72); set/update/delete adapter paths (78-141); engine boot and singletons (193-294).
- `src/lib/local/write.ts` — CONFIRMED: applyEdit transaction shape, expectedUpdatedAt threading at line 38-41, tombstone writes at line 137-152, set-clears-tombstone at line 105-115, T1.2 notifyEditCommitted at line 190.
- `src/lib/local/types.ts` — CONFIRMED: LocalTrack.updatedAt semantics ("Undefined for rows that haven't been server-committed yet"), Tombstone schema, OutboxRow shape.
- `src/lib/local/schema.ts` — CONFIRMED: Dexie v4 schema with tombstones compound primary key `[collection+docId]`.
- `src/lib/sync/snapshot-listener.ts` — CONFIRMED: subscriber transport, timestampToMs falls back to 0 (line 94-98), guard skip-if-local-undefined (line 290-296), guard skip-if-local-stale (line 297-303), tombstone clear on 'removed' (line 262), tombstone guard for added/modified (line 273-282).
- `src/lib/sync/engine.ts` — CONFIRMED: per-doc serialization with failed/sending blocking (line 210-219), 'set' writeback at line 281-321, 'delete' tombstone-clear at 275-280, handleAdapterError VersionMismatch → stop-drain (line 391-397), RemoteDocMissing → dispatch DRAIN_BUDGET_EXHAUSTED → state 'failed' (line 400-418), resolveConflict 'theirs' = delete row only (line 546-547).
- `src/lib/sync/state-machine.ts` — CONFIRMED: DRAIN_OK requires zero remaining; failed/conflict sticky; transition logic.
- `src/lib/sync/firestore-adapter.ts` — CONFIRMED: typed error classes.
- `src/lib/sync/cleanup.ts` — CONFIRMED: discardFailedOutboxRows vs retryFailedOutboxRows; T2.6 dropped the alias.
- `src/lib/sync/store.ts` — CONFIRMED: zustand store.
- `src/lib/sync/__tests__/init.test.ts` — CONFIRMED: T1.3 tests including line 45-48 (expected 0 + remote undefined → fail).
- `src/components/setlist/grid/SetlistGridHydrator.tsx` — CONFIRMED: bulkPut hydrator (line 80-184), snapshot-listener mount (194-198), lazy-hydration cascade (216-273), trackCount reconciler (296-349). NOTE: cascade's `hydrated:true` write uses `expectedUpdatedAt: initialSetlist.updatedAt`.
- `src/components/setlist/grid/SetlistGrid.tsx` — CONFIRMED: handlePickSong (1494-1538), handleCreateFreeText (1541-1558), handleDelete (1085-1101), bulkDelete and clone use applyEdit with expectedUpdatedAt: track.updatedAt; commitTrackPatchImpl always threads expectedUpdatedAt.
- `src/components/setlist/grid/MobileCardList.tsx` — CONFIRMED: drag-reorder calls applyEdit with expectedUpdatedAt: r.updatedAt at line 119-131; per-cell commit threads track.updatedAt at line 191-197.
- `src/components/setlist/grid/MobileRowCard.tsx` — CONFIRMED: only fires onCommit callbacks (no direct applyEdit).
- `src/components/setlist/grid/ReconciliationProvider.tsx` — CONFIRMED: open/hasConflict computation (line 219-265), `idSetKey` mutation reopens modal (line 252-259, 265), default choice is now `'theirs'` (line 459), classifyOutboxError per-row (line 160-172), handleResolveAll deletes outbox row via engine.resolveConflict on 'theirs' (line 358-381).
- `src/app/(main)/setlists/[id]/page.tsx` — CONFIRMED: SSR reads `serialized.tracks` (embedded array) unconditionally at line 109-113; buildLocalTracks synthesizes `updatedAt: setlistUpdatedAt` for every track at line 53.
- `src/lib/setlist-firebase.ts` — INSPECTED first 50 grep hits: no code path clears `setlists/{id}.tracks[]` after track delete. createSetlist/updateSetlist/cloneFor* write the embedded array but only at setlist create/clone time. Inferred (not exhaustively traced): no other write path maintains the embedded array.
- `firestore.rules` — CONFIRMED: tracks collection requires isBandLeader/isAdmin for create/update/delete. Daniel is admin → rules don't reject his writes.
- Git history (`git log --since 2026-05-10 --name-only`) — CONFIRMED: recent changes to sync/init.ts, write.ts, engine.ts, snapshot-listener.ts, ReconciliationProvider.tsx, SetlistGridHydrator.tsx all align with the T1.x / T2.x rollouts described in FIX-PLAN-V2.md.
- `BUGFIX-PLAN-2026-05-12.md`, `PREEXISTING-ISSUES-2026-05-12.md`, `FIX-PLAN-V2.md` — read for context. The Bug-2 fix added tombstones + un-stubbed modal but **did not address the underlying embedded-array source-of-truth problem** at `page.tsx:108-113`. That's the missing piece.

**What I INFERRED rather than directly observed:**
- That production has tracks/{id} docs without `updatedAt` field (Hypothesis 1 Path B). This depends on Daniel's production data shape — verifiable by reading `tracks` collection in Firebase console. If all tracks/{id} docs DO have updatedAt, Path B doesn't fire and the modal-flood cause shifts to the cascade-vs-trackCount race (also plausible — see F3).
- That the user's "added tracks don't save" experience is due to the modal-resolve-theirs flow accidentally discarding pending rows, OR misperception (the add did save, the user just couldn't see it because the modal was blocking). I could not find an unconditional code path where a fresh `op:'set'` outbox row gets dropped. Verification path: check Sentry `recordEdit` outcomes for `source:'engine-drain'` + `op:'set'` + `outcome:'success'` vs `outcome:*error*`. If ALL sets succeed, the symptom is user-perception (modal noise) rather than data loss.
