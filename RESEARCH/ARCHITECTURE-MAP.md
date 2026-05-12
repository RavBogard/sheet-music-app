# Architecture Map — 2026-05-12

**Repo HEAD at writing:** `9fb45b5a185b13e134d23a764aa1b01dc1e9972a`
**Scope:** the local-first sync substrate (Dexie outbox + sync engine + Firestore adapter + reconciliation modal + recovery / SW / auth flows).
**Evidence convention:** every load-bearing claim has a file + line range and is marked **Verified** (read at HEAD), **Inferred** (likely-true pattern, not directly verified), or **Open** (unknown / flagged).

Where helpful, the doc cites the SHA that introduced a constraint (`git log` was run on each load-bearing file before writing the relevant section).

---

## 0. Read-this-first map

Pictorially, one user edit to one cell goes through these layers, in this order:

```
TextCell / DropdownCell / ChartCell / SetlistGrid handler
        │
        ▼
applyEdit(EditDescriptor)                                  src/lib/local/write.ts:65
        │  (single Dexie rw tx)
        ▼
db.{tracks|setlists|songs}.put / delete  +  db.outbox.add  +  db.tombstones.put/delete
        │
        ▼
useLiveQuery(...) in SetlistGrid (the live consumer)        src/components/setlist/grid/SetlistGrid.tsx:955
        │
        ▼ (rendered to the user — local write is now visible)

(asynchronously, on the engine's pump cycle:)
SyncEngine.pump → drainOnce → adapter.commitOutboxRow      src/lib/sync/engine.ts:172,200
        │
        ▼
ProductionFirestoreAdapter.commitOutboxRow                  src/lib/sync/init.ts:42
        │
        ▼
Firestore (set / runTransaction(update) / deleteDoc)
        │
        ▼ (server-stamped updatedAt re-read, returned as CommitResult)
        │
engine writes back local row.updatedAt + clears outbox row + clears tombstone (for delete ops)  engine.ts:268-326
```

And one cross-device snapshot delivery goes:

```
Firestore onSnapshot (setlists doc + tracks where setlistId == X)   snapshot-listener.ts:101-144
        │
        ▼
SnapshotListener.handleSetlist / handleTracks                       snapshot-listener.ts:175,225
        │  (single Dexie rw tx; outbox-pending + tombstone + LWW guards)
        ▼
db.setlists.put | db.tracks.put | db.tracks.delete | (skip)
        │
        ▼
useLiveQuery rerenders SetlistGrid
```

The two paths are deliberately separate. **Server data is authoritative — the snapshot listener writes to Dexie via `db.put` directly, NOT through `applyEdit`** (snapshot-listener.ts:1-6, 209-213, 311). This means cross-device deliveries don't loop back through the outbox.

---

## 1. Local write path

### 1.1 Files involved (all Verified)

- `src/lib/local/types.ts` — `EditDescriptor`, `OutboxRow`, `Tombstone`, `WriteAtomicityError`, `LocalCollection`.
- `src/lib/local/schema.ts` — Dexie schema. Database name `crc-local` (line 22). Schema v4 (lines 68-76) is current.
- `src/lib/local/write.ts` — `applyEdit` (line 65), `buildOutboxRow` (line 32). Single file containing the entire local-write path.
- `src/lib/sync/edit-log.ts` — `recordEdit` breadcrumb helper (called from `applyEdit:172` fire-and-forget).
- `src/lib/local/undo-store.ts` — Zustand undo store; `applyEdit` pushes snapshots into it after commit.

Consumers (verified callers of `applyEdit` outside tests):
- `src/components/setlist/grid/SetlistGrid.tsx` — 14 call sites: lines 736, 845, 868, 1102, 1128, 1165, 1236, 1304, 1318, 1465, 1508, 1539, 1554, 1578.
- `src/components/setlist/grid/MobileCardList.tsx` — lines 81, 88, 103, 110.
- `src/components/setlist/grid/AddBar.tsx`, `BatchActionBar.tsx` — also call `applyEdit` (verified via grep).
- `src/components/setlist/grid/SetlistGridHydrator.tsx` — lines 229-249 (lazy-hydration fan-out), 332-346 (trackCount reconciler).
- `src/lib/songs/defaults.ts`, `src/lib/songs/prime.ts` — sticky-memory + library priming use it for `songs` writes.
- `src/components/setlist/grid/__tests__/SetlistGrid.undo.test.tsx` and others (test seam).

### 1.2 What `applyEdit` actually does (Verified — write.ts:65-215, full read)

Single function, three branches keyed on `EditDescriptor.op`:

- **Read prevDoc OUTSIDE the tx for undo snapshot** (lines 77-90). Failure swallowed (`catch { prevDoc = undefined }`). Undo is best-effort, never a precondition for the write. Skipped entirely when `options.withoutUndo === true`.

- **Single Dexie `rw` transaction** spanning `db[collection]`, `db.outbox`, **and** `db.tombstones` (lines 98-153). On any throw, all three roll back. The transaction is wrapped in a try/catch that translates any non-`WriteAtomicityError` into a `WriteAtomicityError` (`write.ts:154-159`).

  - **`op: 'set'`** (lines 104-114): `db[collection].put(doc)` + `db.outbox.add({status:'pending', op:'set', payload:{...doc}})` + **`db.tombstones.delete([collection, doc.id])`**. The tombstone-clear-on-set is defensive: re-creating a docId clears any stale tombstone so subsequent server-priming isn't blocked. Comment explicitly cites this rationale (lines 110-113).
  - **`op: 'update'`** (lines 117-133): reads existing row inside the tx; throws `WriteAtomicityError` if missing (line 120). Merges patch into existing, preserves `id`, writes back, and enqueues outbox row carrying ONLY the patch (not the merged doc).
  - **`op: 'delete'`** (lines 141-151): reads existing row's `updatedAt` (for diagnostic on tombstone); `db[collection].delete`; `db.outbox.add({op:'delete', payload:{}})`; **`db.tombstones.put({collection, docId, deletedAt, originalUpdatedAt})`**. Tombstone is keyed by compound primary `[collection+docId]`, so it auto-dedupes (verified at schema.ts:75).

- **`OutboxRow` construction** (write.ts:32-52): `{status:'pending', scheduledFor: now, op, collection, docId, payload, expectedUpdatedAt, attempts:0, createdAt:now}`. `expectedUpdatedAt` is taken from the descriptor for `update`/`delete`; undefined for `set`.

- **Post-commit, OUTSIDE the tx** (lines 162-215):
  1. **edit-log breadcrumb** via `recordEdit({source:'apply-edit', op, collection, docId, payloadKeys})` — fire-and-forget, failure-swallowing. Placed outside the tx so instrumentation can't corrupt atomicity (write.ts:162-166 comment).
  2. **Undo snapshot push** (unless `withoutUndo`): reads `newDoc` from `db[collection]` (skipped for deletes), constructs `SimpleUndoEntry`, pushes to `useUndoStore`. `update` ops use `pushEntryDebounced` (burst-coalescing); `set`/`delete` use immediate `pushEntry`.

### 1.3 The engine pump and `commitOutboxRow`

**The engine is NOT explicitly nudged by `applyEdit`.** No call to `engine.pump()` or `engine.notifyEditCommitted()` exists in `applyEdit` or any production caller of `applyEdit`. Verified by grep across `src` excluding `__tests__`:

```
src/components/setlist/grid/ReconciliationProvider.tsx:312:   const engine = getSyncEngine()       (for resolveConflict)
src/lib/sync/cleanup.ts:113:                   if (engine) await engine.pump()              (after retryFailedOutboxRows)
src/lib/sync/init.ts:188: export function getSyncEngine()
```

`notifyEditCommitted` is defined (engine.ts:561) but **only called from tests**. See §1.5 latent-bug note.

When the engine *does* pump (start, online event, lock-available, or `scheduleNextPump` timer), `drainOnce` (engine.ts:200-353) executes:

1. **Per-doc ordering with per-doc blocking** (engine.ts:200-228). All outbox rows are scanned. For each `(collection, docId)`, the *oldest* pending row is the candidate. If ANY row for that `(collection, docId)` is `'failed'` or `'sending'`, that doc is blocked. Comment (engine.ts:204-208) calls out *why*: "preserves LWW per-document semantics — without it, a transient failure on row N could let row N+1 for the same doc leapfrog on the server."
2. Due rows (`scheduledFor <= now`) are sorted by `scheduledFor`, then `localId`.
3. For each due row in order: flip to `'sending'`, call `adapter.commitOutboxRow(row)`. On success, run the post-commit atomic writeback transaction (engine.ts:268-326). On error, dispatch to `handleAdapterError` (line 355).

**The post-commit writeback (engine.ts:268-326) is itself a `rw` Dexie transaction across `db.outbox`, `db[row.collection]`, `db.tombstones`.** Inside:
- `db.outbox.delete(row.localId)`.
- If `row.op === 'delete'`: `db.tombstones.delete([row.collection, row.docId])` (server has confirmed the delete; deletion intent is durably realized).
- If `result.updatedAt` is defined AND `row.op !== 'delete'`:
  - **v5h3-01-03 threading**: scan outbox for any remaining `'pending'` rows with same `(collection, docId)` and rewrite their `expectedUpdatedAt` to the new server timestamp (engine.ts:296-312). This fixes the phantom VersionMismatch that arises when rapid same-doc edits capture `expectedUpdatedAt` from useLiveQuery before the previous commit's writeback re-renders.
  - Read the existing entity row; if present, put back with new `updatedAt` (engine.ts:313-321).
  - Comment at engine.ts:322-323: "Guard: if the user deleted the row mid-flight, skip the writeback rather than resurrecting it." This is handled implicitly because `db[row.collection].get(row.docId)` returns undefined after a mid-flight delete and the put is conditional.

### 1.4 Firestore adapter (`commitOutboxRow`)

`src/lib/sync/init.ts:42-131` (Verified, full read of init.ts).

- **`op: 'set'`** (lines 45-60): `setDoc(ref, {...payload, updatedAt: serverTimestamp()})`. After commit, **re-reads** the doc with `getDoc` to capture the resolved server timestamp (line 55), returns `{updatedAt: ms}`. The comment (lines 51-53) explicitly accepts the cost: "one extra read per commit is acceptable — v50-06 reconciliation depends on this freshness."
- **`op: 'update'`** (lines 61-99): wraps in `runTransaction`. Inside the tx:
  - `tx.get(ref)`. If `!snap.exists()` → throws `RemoteDocMissingError` (terminal; see engine handling). Comment at lines 66-72 cites v51-h01 rationale (phantom docs).
  - If `row.expectedUpdatedAt !== undefined`: read remote `updatedAt`. If it doesn't match → throw `VersionMismatchError` (lines 80-87). **NOTE**: this throws only when `remoteMs !== undefined && remoteMs !== row.expectedUpdatedAt`. If `remoteMs === undefined` (no server timestamp on remote), the precondition silently passes.
  - `tx.update(ref, {...payload, updatedAt: serverTimestamp()})`.
  - Post-commit getDoc + return `{updatedAt: ms}`.
- **`op: 'delete'`** (lines 100-103): `deleteDoc(ref)`. Returns `{}` (no `updatedAt` since no resulting doc).
- **Error translation** (lines 105-130):
  - `VersionMismatchError` / `RemoteDocMissingError` / `TransientError` re-thrown as-is.
  - `Error` with `name === 'StaleWriteError'` (the *old* setlist-firebase API still throws this from its own version-precondition path) → re-wrapped as `VersionMismatchError`. Verified: `setlist-firebase.ts` defines `StaleWriteError` but this engine path is for the new outbox engine.
  - Firebase error codes `unauthenticated` / `permission-denied` → `AuthError`; `unavailable` / `deadline-exceeded` / `cancelled` → `NetworkError`; anything else → `TransientError`.

### 1.5 State-machine + state-store coupling

`src/lib/sync/state-machine.ts` (Verified, full read).

- States: `idle | dirty | saving | conflict | failed | offline`.
- Pure `transition(state, event)` (lines 27-70). Notable: `NETWORK_OFFLINE` is **sticky regardless of current state** (line 29). `EDIT_COMMITTED` preserves `failed`/`conflict` (lines 38-41) — outstanding errors stay visible.
- `deriveStateFromOutbox(rows)` precedence: `failed > sending > pending > idle` (lines 74-90). Used at engine startup (engine.ts:124).
- The store: `src/lib/sync/store.ts`. Zustand store `useSyncStatus` with `{state, queued, lastError, lastSyncAt}`. `wireSyncEngineToStore` sets `engine.onStateChange` to a handler that pushes into the store. `lastSyncAt` is set only when transitioning to `idle` (store.ts:31).
- The engine pumps state changes via `notify(queued)` (engine.ts:575-577), wrapping the assigned `onStateChange` callback.

### 1.6 Invariants (Verified)

1. **Atomicity of the local triple-write**: entity row, outbox row, and tombstone are mutated in one Dexie tx. On throw, all three roll back (write.ts:98-153, schema.ts confirms the three tables share the same Dexie db).
2. **Per-doc serial drain**: only one outbox row per `(collection, docId)` is in flight at a time (engine.ts:200-228). A failed or sending row blocks all later rows for that doc.
3. **`payload` semantics by op**: `'set'` carries the full new doc; `'update'` carries the patch (not the merged doc); `'delete'` carries `{}`.
4. **`expectedUpdatedAt` flows from cell → applyEdit → outbox row → adapter**: see `commitTrackPatchImpl` (SetlistGrid.tsx:723-746) and the adapter precondition (init.ts:80-87).
5. **Server-stamped `updatedAt` is the only source of truth for the precondition**: engine writeback always overwrites local `updatedAt` from the adapter's `CommitResult.updatedAt` (engine.ts:281-321). Local rows that have never been server-committed have `updatedAt === undefined`; the adapter treats `expectedUpdatedAt === undefined` as "no precondition" (init.ts:75).
6. **Tombstone lifecycle**: written on delete (write.ts:146-151), cleared on successful delete commit (engine.ts:275-280), cleared on `'set'` of the same docId (write.ts:113), cleared by snapshot-listener on remote remove (snapshot-listener.ts:261). No other code clears tombstones.

### 1.7 Edge cases handled (with commit refs where the code cites them)

- **Force-quit orphans 'sending' rows.** `engine.start()` resets all `status === 'sending'` rows to `'pending'` with `scheduledFor=now` (engine.ts:111-121). Without this, per-doc ordering would block forever after a crash.
- **Rapid same-doc edits** that captured stale `expectedUpdatedAt` from useLiveQuery before the previous commit's writeback. v5h3-01-03 (commit `36e9fa11`) threads the new server timestamp into any pending sibling outbox rows in the same writeback tx (engine.ts:296-312).
- **User deletes mid-flight.** Engine writeback only puts back the entity row if `db[collection].get(docId)` returns a row — a mid-flight delete makes it undefined, so the writeback silently no-ops on resurrection (engine.ts:313-323).
- **Re-creating a deleted docId.** `applyEdit('set')` clears the tombstone in the same tx (write.ts:113).
- **Successful delete commit clears the tombstone.** Engine writeback inside the same atomic tx deletes the tombstone for delete ops (engine.ts:275-280).
- **AuthError one-shot refresh** (engine.ts:420-456). On first attempt, calls `adapter.refreshAuthToken()` then retries inline once. Second failure → `'failed'` with `attempts=1`.
- **Transient errors get backoff schedule** `[500, 1000, 2000, 4000, 8000]` ms (engine.ts:30, 504). After `MAX_ATTEMPTS = 5`, dead-letter with Sentry capture via `captureSyncFailure(feature: 'dead-letter', ...)` (engine.ts:480-487).
- **`RemoteDocMissingError` is terminal — no retry** (engine.ts:400-418). Comment cites v51-h01 rationale: "burn 5 attempts of backoff for a doc that isn't coming back" is wasteful and confusing.

### 1.8 Edge cases NOT handled (Verified gaps + Inferred)

- **No engine nudge from `applyEdit`** (Verified by absence). `applyEdit` adds an outbox row but does NOT call `engine.pump()` or `engine.notifyEditCommitted()`. The engine's `scheduleNextPump` (engine.ts:515-537) only re-schedules when **pending rows exist after `drainOnce` completes** (line 524 early-returns if `next.length === 0`). Therefore: after the engine drains to empty and idles, a fresh local edit lands in the outbox but **no future pump is scheduled** until one of:
  - `online` event (engine.ts:130-133),
  - cross-tab lock becomes available (engine.ts:137-139),
  - the next `applyEdit` cycle happens *during* an in-flight drain (rare race window).

  In practice, since drains are fast (~tens of ms), most edits land while a drain is still pending and get picked up. But for an idle-then-edit pattern with no network/lock events, **the edit can sit in the outbox indefinitely**. The `idle → dirty` transition fires only when `EDIT_COMMITTED` is dispatched, which only `notifyEditCommitted()` does — and nothing calls that. So the user-visible `SyncIndicator` may stay on "Saved" while the outbox actually has pending work. **Open severity: how often is this hit in practice? Worth a test that creates one edit on an idle engine, doesn't network-cycle, and checks whether the outbox drains.**
- **`expectedUpdatedAt` precondition silently passes when remote `updatedAt` is undefined** (Verified: init.ts:80-87 — `remoteMs !== undefined && remoteMs !== row.expectedUpdatedAt`). If a remote doc was created without a `updatedAt` field at all, the precondition is effectively disabled. Inferred risk: phantom rows with no `updatedAt` could LWW-overwrite each other silently.
- **`WriteAtomicityError` on `update` of a missing local row** is thrown synchronously (write.ts:117-123), but callers in SetlistGrid don't appear to catch it — they `await applyEdit(...)`. Inferred: an unhandled promise rejection if the underlying row was deleted between user input and commit. Not verified end-to-end.
- **No tombstone TTL prune.** Verified absence — `tombstones` table grows monotonically. Cleared only on successful delete commit, on `set` of the same id, or on remote-remove via snapshot-listener. Documented as Phase D.1 / Q1 in the research plan.
- **Undo store snapshot read happens twice per write** (prevDoc before tx, newDoc after tx — write.ts:78-90, 186-195). Two extra Dexie reads per `applyEdit` even for fully-keyboarded burst-edit workloads. Performance impact unknown; flagged.

---

## 2. Cross-device read path

### 2.1 Files involved (Verified)

- `src/lib/sync/snapshot-listener.ts` (Verified, full read). Contains `startSnapshotListener`, `makeFirestoreSubscriber`, `hasPendingOutboxRow`, plus exported types.
- `src/components/setlist/grid/SetlistGridHydrator.tsx:194-198` — mounts the listener via `useEffect` once hydration is `'done'`.
- `src/components/setlist/grid/SetlistGrid.tsx:955-962` — consumes Dexie tracks via `useLiveQuery` to render rows.

### 2.2 Subscription topology (Verified)

The listener subscribes to **two** Firestore queries per setlist (snapshot-listener.ts:101-144):

1. `doc(firestoreDb, 'setlists', setlistId)` — single setlist doc.
2. `query(collection(firestoreDb, 'tracks'), where('setlistId', '==', setlistId))` — all tracks where `setlistId == X`.

There is **no subscription on `songs`**. Cross-device freshness for `songs` is deferred to v5.4 per the comment at SetlistGridHydrator.tsx:286.

### 2.3 Setlist delivery handling (`handleSetlist`, snapshot-listener.ts:175-223)

Single `rw` Dexie transaction across `db.setlists`, `db.outbox`, `db.tombstones`. Guards in order:

1. **Outbox-pending guard** (line 184): if `hasPendingOutboxRow(db, 'setlists', setlistId)` returns true → return. ANY row in the outbox for this docId (status ∈ {pending, sending, failed}) — verified by `hasPendingOutboxRow` doing an unindexed filter scan (snapshot-listener.ts:146-159) — blocks the delivery. Comment: "let the engine resolve it."
2. **Tombstone guard** (lines 191-195): if `db.tombstones.get(['setlists', setlistId])` returns a tombstone → return. The user deleted this row; server priming must not resurrect.
3. **LWW guard** (lines 203-206): if a local row exists AND its `updatedAt === undefined` → return (prefer local; engine writeback unresolved). If local `updatedAt >= delivery.updatedAt` → return (stale delivery). Otherwise put.
4. **Put** (lines 207-212): merge `delivery.data` with `{id, updatedAt}` and `db.setlists.put(next)`.

### 2.4 Tracks delivery handling (`handleTracks`, snapshot-listener.ts:225-341)

Single `rw` tx across `db.tracks`, `db.outbox`, `db.tombstones`. Each change is processed in order:

- Outbox-pending check first. If pending → skip (outcome `'guard-skipped-pending'`).
- `removed` (lines 256-266): if local row exists → `db.tracks.delete(docId)`. **Also clears the tombstone** (line 261) — server confirmed the delete.
- `added`/`modified`:
  - Tombstone guard (lines 273-283): skip if `db.tombstones.get(['tracks', docId])` exists. Outcome `'guard-skipped-tombstoned'`.
  - LWW guard mirror of setlist branch (lines 289-305).
  - Put (lines 306-316): merge `change.data` with `{id, updatedAt}` and `db.tracks.put(next)`.
- **Per-change outcomes** are collected and emitted as `recordEdit` breadcrumbs **after** the tx commits (lines 319-332). Comment at lines 229-235 explains the deliberate avoidance of nesting a second Dexie tx inside the listener.

### 2.5 Subscription lifecycle (Verified)

- **Started**: after `SetlistGridHydrator`'s initial Dexie priming completes — `hydration === 'done'` (SetlistGridHydrator.tsx:194-198). Effect dependency is `[hydration, setlistId, startSnapshotListener]`. Returns the unsubscribe function as the effect cleanup.
- **Stopped**: on `SetlistGridHydrator` unmount or when `hydration` flips back to `'pending'` (which only happens via setlistId-driven remount because `setHydration('done')` is called once per hydrate).
- **Cancellation guard**: `cancelled` ref set inside `startSnapshotListener` (snapshot-listener.ts:173, 373-385); both `handleSetlist` and `handleTracks` early-return if `cancelled`. The actual Firestore unsubscribe is also invoked. Belt-and-suspenders.

### 2.6 React render bridge (Verified)

- `SetlistGrid.tsx:955-962`: `useLiveQuery(() => getDb().tracks.where('setlistId').equals(setlistId).sortBy('order'), [setlistId])`. Returns `LocalTrack[] | undefined` (undefined while Dexie's first read settles).
- `SetlistGrid.tsx:964-965`: `isLoading = tracks === undefined`; `rows = tracks ?? []`.
- `SetlistGridHydrator.tsx:313-320`: ALSO uses `useLiveQuery` to track `liveTrackCount` for the trackCount reconciler (debounced 800ms patch via `applyEdit` on `setlists/{id}.trackCount` — see SetlistGridHydrator.tsx:322-349).
- `ReconciliationProvider.tsx:160-165`: `useLiveQuery` on `db.outbox.where('status').equals('failed').toArray()` — the modal's data source.

### 2.7 Invariants (Verified)

1. **Server data is authoritative ONLY when no local outbox row exists for that docId.** The outbox-pending guard is the load-bearing fence (snapshot-listener.ts:184, 243; mirror in SetlistGridHydrator.tsx:100-107).
2. **Server data NEVER resurrects user-deleted rows.** The tombstone guard fires before the LWW guard, regardless of remote `updatedAt`.
3. **The snapshot listener writes via `db.put` / `db.delete`, NOT `applyEdit`.** Comments at snapshot-listener.ts:1-6 and SetlistGridHydrator.tsx:71-73 both make this explicit. Means server-driven writes do NOT feed back into the outbox; the engine never re-sends server-originated data.
4. **LWW is strictly-greater on local-existing rows** (`local.updatedAt >= delivery.updatedAt` → skip). Equal timestamps go to the local. The asymmetry matters when server and local agree.
5. **`local.updatedAt === undefined` means "prefer local" under the v5h-01-02 fix B.** Comment at snapshot-listener.ts:18-19 cites the alternative `(undefined ?? 0) >= remote` which would clobber.

### 2.8 Edge cases handled

- **Server echo of our own in-flight edit.** Outbox-pending guard skips it; engine writeback handles the local row.
- **Stale delivery queued before the local commit's writeback.** LWW guard.
- **Local row has no resolved `updatedAt` yet** (engine writeback unresolved). Skip — the v5h-01-02 fix.
- **Tombstone exists when server delivers an add/modify.** Skip — Bug 2 fix.
- **Firestore subscription error.** Both `subscribeSetlist` and `subscribeTracks` register `onError` callbacks that `logger.warn` + `captureSyncFailure` (snapshot-listener.ts:343-371). The transport then emits no further deliveries until re-subscribed by remount — handlers don't throw out.

### 2.9 Edge cases NOT handled (Verified gaps)

- **`hasPendingOutboxRow` returns `true` for `'failed'` status too** (snapshot-listener.ts:152-159 — any outbox row matches). This means a permanently-failed conflict on the local side blocks server deliveries to that docId until the user resolves via the modal (or until the outbox row is discarded). On its face this is correct (keep user intent visible), but combined with the cross-restart `'failed'` state, it means: **if the user closes the browser with an unresolved `'failed'` row, server updates for that docId silently no-op on next open until the modal resolves it.** Inferred severity: medium; arguably correct, but the user has no signal that updates are being held back beyond the conflict-pill state.
- **No `songs` subscription means cross-device song-library edits aren't visible until re-mount.** Verified absence; documented at SetlistGridHydrator.tsx:286 ("cross-device freshness deferred to v5.4").
- **`handleTracks` collects outcomes for ALL changes even when most are skipped.** Minor: each delivery emits N edit-log rows. For a 50-track setlist, a single full-collection refetch could write 50 breadcrumbs. Inferred not a bottleneck but worth flagging.

---

## 3. Server-priming on open

### 3.1 Server fetch path (Verified)

`src/app/(main)/setlists/[id]/page.tsx` (full read).

- This is a **Next.js 16 server component (RSC)** — `async function SetlistEditorPage`. There is no `/api/setlist/get` route; the fetch happens inline on the server during the RSC render.
- `getServerUser()` from `@/lib/server-auth` (line 67) — returns the authenticated session-cookie user. Redirects to `/login` if missing (line 71).
- For `id === 'new'`: skips fetch, renders `<SetlistGrid setlistId={randomUUID()} />` directly inside the providers (lines 74-83). No hydrator — there's nothing to hydrate.
- Otherwise: `initAdmin()` + `getFirestore()` (server-side Firebase Admin SDK). Reads `db.collection('setlists').doc(id).get()` (line 88). If missing → `notFound()`. Permission check via `canEditSetlist` (lines 94-103); non-editors redirect to `/perform/setlist/{id}`.
- Builds `initialSetlist` via `buildLocalSetlist` (lines 25-38): `serialize → LocalSetlist` with `updatedAt`, `eventDate` coerced to ms.
- Builds `initialTracks` via `buildLocalTracks` (lines 40-56): reads `serialized.tracks` (the **embedded** legacy `tracks[]` array from the setlist doc; not the top-level `tracks/{id}` collection). Each track gets `setlistId`, `order`, and **`updatedAt: setlistUpdatedAt`** (line 53) — *all initialTracks share the setlist's updatedAt*. Inferred consequence: lazy-hydration writes will all carry the same `expectedUpdatedAt` and will only succeed in setlist-precondition order; not currently a bug because lazy-hydration uses `op:'set'` for tracks (no precondition).
- Renders `<SetlistGridHydrator key={id} setlistId={id} initialSetlist={initialSetlist} initialTracks={initialTracks} gridProps={{name}} />` (lines 118-130).

### 3.2 Hydrator transaction (Verified — SetlistGridHydrator.tsx:64-184)

Effect runs on `[setlistId, initialSetlist, initialTracks]`. Inside one Dexie `rw` tx across `db.setlists`, `db.tracks`, `db.outbox`, `db.tombstones`:

1. **Pre-fetch tombstone for the setlist** (lines 95-98).
2. **Pre-fetch outbox row for the setlist** (lines 100-106). Unindexed filter scan.
3. **Setlist priming** (lines 107-116): if no outbox row AND no tombstone → if local missing OR local.updatedAt < initialSetlist.updatedAt → `db.setlists.put(initialSetlist)`. Server-priming is one-shot LWW.
4. **If `initialTracks.length === 0` → return** (line 118).
5. **Pre-fetch all track outbox rows** in one scan (lines 122-128) and collect docIds.
6. **Pre-fetch track tombstones** for the specific id-set the server is offering (lines 130-149). Uses the compound `[collection+docId]` index for `anyOf`-style query (line 137).
7. **Pre-fetch local tracks for this setlist** (lines 151-156).
8. **Build `toPut` list**: for each initialTrack, skip if outbox has a pending row OR tombstoned. Otherwise if local missing or local.updatedAt < server.updatedAt → push to `toPut`. `db.tracks.bulkPut(toPut)` if non-empty.

After commit: `setHydration('done')` (line 177).

### 3.3 What runs after `hydration === 'done'`

Three effects fire (SetlistGridHydrator.tsx:194-349), each guarded `if (hydration !== 'done') return`:

- **Snapshot listener mount** (lines 194-198). Returns the unsubscribe.
- **Lazy-hydration fan-out** (lines 216-273). Gates: setlist not already hydrated (`initialSetlist.hydrated !== true`), `initialTracks.length > 0`, `fanoutStartedRef` not set. Fan-out: `Promise.all(applyEdit('set', tracks/{id}, withoutUndo:true))` then `applyEdit('update', setlists/{id}, {hydrated: true}, expectedUpdatedAt: initialSetlist.updatedAt, withoutUndo:true)`. On error: `captureSyncFailure(feature:'lazy-hydration')`.
- **Library priming** (lines 289-294): one-shot `primeSongsLibrary()` with `primedRef` guard.
- **Track-count reconciler** (lines 313-349): `useLiveQuery` on track count + 800ms debounce → `applyEdit('update', setlists/{id}, {trackCount})`. Skips if count matches last-written value.

### 3.4 Invariants (Verified)

1. **Hydrator priming is server-authoritative subject to outbox-pending + tombstone + LWW** — identical guard semantics to the snapshot listener (the pattern is intentional; see SetlistGridHydrator.tsx:73-79).
2. **Hydrator writes via `db.put`, NOT `applyEdit`** — except the lazy-hydration fan-out and trackCount reconciler, which DO use `applyEdit` because they create new outbox rows (the migration is a user-intent-equivalent server-roundtrip).
3. **Initial tracks all carry the setlist's `updatedAt` as their `updatedAt`** (page.tsx:53). Whether this is a bug depends on whether tracks are also surfaced from the top-level Firestore `tracks/{id}` documents in `serialized.tracks` (Open — would need to inspect the Firestore data model and the legacy `serializeSetlist` helper).

### 3.5 Edge cases handled

- **User deleted a track that's still in the embedded `tracks[]`.** Tombstone guard prevents resurrection. Bug 2 fix.
- **In-flight outbox row for a docId.** Outbox-pending guard prevents server data from clobbering an unresolved local edit. v5h-01-02 fix F (comment at SetlistGridHydrator.tsx:73-79).
- **Hydrator double-render via React effect dependency churn.** `fanoutStartedRef` and `primedRef` make the fan-out and prime one-shot per mount.
- **`initialSetlist` already hydrated** (server already migrated). Lazy-hydration short-circuits at line 218.

### 3.6 Edge cases NOT handled (Verified + Inferred)

- **`SetlistEditorPage` does NOT read top-level `tracks/{id}` documents server-side** (Verified — page.tsx only reads the setlist doc; `serialized.tracks` is the embedded array). For a *post-lazy-hydration* setlist whose tracks live in `tracks/{id}` and whose embedded `setlists/{id}.tracks` may be stale or absent, **the initial render relies on snapshot-listener to deliver the full track set after `hydration === 'done'`** — there's a render gap where the page shows empty until the listener fires. Inferred: tolerable for a fast Firestore round-trip but could flash for slow networks.
- **`buildLocalTracks` assigns `updatedAt: setlistUpdatedAt` to every initialTrack** (page.tsx:53). For setlists hydrated long ago whose tracks have since been edited individually, this server-prime `updatedAt` is **older** than the real per-track server `updatedAt`. The LWW guard correctly prefers local in that case, but **for the first-ever open** the local row inherits the older timestamp and any subsequent local edit will be preconditioned on it. Inferred consequence: a benign VersionMismatch on first edit that the engine should swallow once the snapshot listener delivers the real `updatedAt` and the threading logic in engine.ts:296-312 fires — but only if the new commit happens during a drain window.
- **No throttle / debounce on snapshot-listener deliveries.** A burst of remote changes (e.g. another tab dragging-to-reorder N rows) triggers N transactions. Inferred not a problem at small N; flagged.

---

## 4. Conflict / reconciliation path

### 4.1 Files involved

- `src/lib/sync/firestore-adapter.ts` — defines `VersionMismatchError` (lines 6-11) and `RemoteDocSnapshot` for the modal's diff (lines 64-72). (Verified, full read.)
- `src/lib/sync/engine.ts:391-398` — adapter error → outbox `status:'failed'` + dispatch `DRAIN_VERSION_MISMATCH`.
- `src/lib/sync/state-machine.ts:49-50` — transition: any state → `'conflict'`.
- `src/components/setlist/grid/ReconciliationProvider.tsx` (Verified, full read).
- `src/components/setlist/grid/SyncIndicator.tsx:142-144` — `useReconciliationModalOptional()` provides `openModal` to the conflict action button.

### 4.2 Sequence of events when a write hits a stale precondition (Verified)

1. `applyEdit('update', ..., expectedUpdatedAt: X)` writes the outbox row.
2. Engine pumps, `adapter.commitOutboxRow(row)` runs `runTransaction`. Reads remote → `remoteMs !== X` → throws `VersionMismatchError` (init.ts:84-86).
3. Engine's `handleAdapterError`: outbox row → `{status:'failed', lastError}` (engine.ts:392-395), dispatch `DRAIN_VERSION_MISMATCH` → state = `'conflict'`, **return `'stop-drain'`** (line 396-397). Per-doc ordering then blocks all later rows for the same doc until resolved.
4. `wireSyncEngineToStore` pushes `state='conflict'` + lastError into `useSyncStatus`.
5. `ReconciliationProvider.tsx:154` reads `state` via `useSyncStatus`. `failedOutboxRows = useLiveQuery(db.outbox.where('status').equals('failed').toArray())` (line 160). `hasConflict = (state === 'conflict' || state === 'failed') && failedRows.length > 0` (line 177). **Note**: covers BOTH `'conflict'` and `'failed'` — the cross-restart case where `deriveStateFromOutbox` returns `'failed'` (engine.ts:124 + state-machine.ts:86) instead of `'conflict'`.
6. `open = hasConflict && dismissedKey !== idSetKey` (line 223). `idSetKey` is a fingerprint of the failed row id-set (lines 210-217).
7. Effect at line 225-256 fetches `adapter.readDoc(collection, docId)` for each failed row to populate `remoteSnapshots`. Read failures fall back to `null` (line 243).
8. Modal renders per-row cards with `payload` (mine) vs `remote.data` (theirs), filtered through `DIFF_HIDDEN_FIELDS = {id, setlistId, order, createdAt, updatedAt}` (lines 48-54).
9. User picks radios; default is `'theirs'` per-row (line 322 — `choices.get(r.localId) ?? 'theirs'`). Clicks "Resolve all and save". `handleResolveAll` (lines 304-339) iterates rows:
   - If choice = `'mine'` AND remote snapshot exists → `newExpectedUpdatedAt = remote.updatedAt`.
   - Calls `engine.resolveConflict(localId, choice, {newExpectedUpdatedAt})` (line 332, default impl at lines 311-315).
10. `engine.resolveConflict` (engine.ts:539-559):
    - `'theirs'` → `db.outbox.delete(localId)`. The user's edit is abandoned.
    - `'mine'` → outbox row updated to `{status:'pending', attempts:0, scheduledFor:now, expectedUpdatedAt:newExpectedUpdatedAt, lastError:undefined}`.
    - Dispatches `CONFLICT_RESOLVED` (state → `'dirty'`).
    - `await this.pump()`.
11. The pump retries (for 'mine') with the new precondition. If it succeeds, state → `'idle'` via `DRAIN_OK`.

### 4.3 Cancel / dismiss semantics (Verified)

- Cancel button (line 421-426) → `closeModal()` → `setDismissedKey(idSetKey)`. Modal closes. `open = hasConflict && dismissedKey !== idSetKey` → false until the id-set changes (a new conflict adds/removes a row).
- ESC key → same `closeModal`.
- `SyncIndicator.tsx:142-144`: when `state === 'conflict'`, the action button's onClick is `reconciliation?.openModal`, which sets `dismissedKey = null` (ReconciliationProvider.tsx:297-299). Re-opens the same modal.
- A **new** conflict set (different `idSetKey`) automatically re-opens the modal even after dismissal.

### 4.4 Invariants (Verified)

1. **`'failed'` is the durable representation of `'conflict'`.** State `'conflict'` is reset on process restart back to whatever `deriveStateFromOutbox` returns — and that returns `'failed'` for any failed rows (state-machine.ts:86). The modal covers both states (ReconciliationProvider.tsx:177) so cross-restart conflicts still surface.
2. **Resolving any row pumps the engine.** `engine.resolveConflict` ends with `await this.pump()`.
3. **Default is `'theirs'`** per ARCHITECTURE.md §6.9 (cited at ReconciliationProvider.tsx:190-192 and 317-322). This is the post-Bug-2-fix behavior (was previously hardcoded `'mine'` — see PREEXISTING-ISSUES.md C.9).
4. **`newExpectedUpdatedAt` is only set for `'mine'`** (line 329). For `'theirs'`, the outbox row is simply deleted; no precondition matters.

### 4.5 Edge cases handled

- **Cross-restart conflict.** Covered by `hasConflict` covering `'failed'` (line 177).
- **Read failure on `adapter.readDoc`.** Falls back to `null`; modal still resolvable (line 243).
- **Multiple conflicts at once.** Modal renders all rows, "Resolve all and save" iterates. Each row's choice independent.
- **Resolve button disabled while snapshots load** (line 432-435: `snapshotsLoading || remoteSnapshots.size < failedRows.length`). Prevents resolving without remote context.
- **`getSyncAdapter()` returns null** (e.g. engine boot failure or non-browser context). The override mechanism (`adapterOverride`) is used in tests; in production, null silently means no remote snapshot.

### 4.6 Edge cases NOT handled (Verified gaps)

- **`adapter.readDoc` failure for ALL rows leaves `remoteSnapshots` with every entry as `null`.** Resolve button is then **enabled** (line 432-435 `remoteSnapshots.size < failedRows.length` is false because size === length even with nulls). User can resolve, but `'mine'` choices send `newExpectedUpdatedAt = undefined` (line 329 `remote ?` falls through), so the precondition is effectively dropped on the next retry. Inferred: surprising semantics — the choice should perhaps be blocked or auto-deferred.
- **`failed` status from a non-VersionMismatch error** (dead-letter from `DRAIN_BUDGET_EXHAUSTED`, or `AuthError`) ALSO surfaces in the modal because the modal queries `outbox.status === 'failed'` and `hasConflict` covers `'failed'`. The "Remote changes detected" copy at line 383 is misleading for those cases. Inferred: the modal will render with `diffKeys.length === 0` and show "Row reordered or deleted" (line 484-487). The user has no signal that this isn't actually a remote-conflict.
- **No telemetry for resolution choices** (PREEXISTING-ISSUES C.8). Verified — `handleResolveAll` doesn't call `recordEdit` or any Sentry breadcrumb. The user's "mine" vs "theirs" decision is lost.
- **Concurrent `pump()` calls.** `engine.resolveConflict` (engine.ts:558) awaits a pump. If another pump is already running, `pump()` sets `wantsRedrain` and returns (engine.ts:174-177). The user-initiated resolution waits — but for a multi-row resolve loop, this is fine.

---

## 5. Recovery paths

### 5.1 IDB-wipe on Firestore assertion failure (Verified — firebase.ts:122-141)

- `window.addEventListener('unhandledrejection')` (line 130). On any unhandled rejection whose message contains `INTERNAL ASSERTION FAILED` or `Unexpected state`, AND when `sessionStorage.getItem('firestore-idb-recovery-attempted')` is falsy:
  - Sets the recovery flag.
  - `await clearFirestoreIndexedDB()`.
  - `window.location.reload()`.
- `clearFirestoreIndexedDB()` (firebase.ts:94-119) enumerates `indexedDB.databases()` and deletes any whose name matches `/firestore/i` (line 102). Fallback for Safari <17: explicitly deletes `firestore/[default]/${projectId}/main` (lines 107-114).

**Verification of impact on `crc-local`:** The Dexie outbox database name is `'crc-local'` (schema.ts:22, full read). `/firestore/i` is a case-insensitive *substring* match against the DB name. `'crc-local'` does NOT contain "firestore" — **so `clearFirestoreIndexedDB` does NOT touch the outbox DB.** PREEXISTING-ISSUES C.6 asked this question; the answer is **safe at HEAD**. Verified.

**However**: the wipe happens on a tab where the engine may have rows in flight. After the reload:
- The fresh page's engine `start()` resets `'sending'` rows to `'pending'` (engine.ts:111-121).
- The page re-fetches the setlist (server-priming runs again with whatever the server has).
- The outbox is preserved; rows will drain on the fresh page.

So: **the wipe is safe for user edits, but loses any Firestore-cached server data** (next reads go to network). Inferred: a one-time cold-cache hit but no data loss.

### 5.2 Service-worker controllerchange reload (Verified — firebase.ts:150-155)

- On `serviceWorker.controllerchange`, `setTimeout(() => window.location.reload(), 3000)`. Single-shot per page load (no debounce / no checks).
- Hard reload mid-edit. PREEXISTING-ISSUES C.5 flags this; verified.

**Effect on in-flight outbox writes:**
- If the engine is mid-drain when the reload fires, the in-flight `commitOutboxRow` is **aborted by the page unload**. Row stays `'sending'` in IDB.
- After reload, `engine.start()` resets `'sending'` → `'pending'` (engine.ts:111-121). Drain resumes.
- **So no data is lost** in terms of *outbox row presence* — but the in-flight Firestore commit may or may not have actually landed server-side. If it did land, the retry will fail with `VersionMismatchError` (server's `updatedAt` already advanced past the row's `expectedUpdatedAt`). The user then sees the reconciliation modal.

Verified inference: this is safe, but it surfaces a spurious conflict to the user when the original write actually succeeded. Worth flagging.

### 5.3 `_shutdownRecoveryScheduled` (Verified — firebase.ts:164-173)

```ts
let _shutdownRecoveryScheduled = false
export function recoverFromFirestoreShutdown(err: unknown): void {
    if (typeof window === 'undefined') return
    const msg = String((err as Error)?.message || err || '')
    if (!msg.toLowerCase().includes('shutting down')) return
    if (_shutdownRecoveryScheduled) return
    _shutdownRecoveryScheduled = true
    logger.warn('[FirestoreRecovery] Firestore shut down — reloading in 1.5s')
    setTimeout(() => window.location.reload(), 1500)
}
```

**Verified contradiction**: comment at line 162 says "Debounced: subsequent calls within 5s are no-ops." The flag is **never reset**. This is a one-shot guard for the lifetime of the tab session, not a debounce. PREEXISTING-ISSUES C.1 calls this out; verified.

**Callers**: search for `recoverFromFirestoreShutdown`:
<!-- (verified by grep; only firebase.ts exports it; need to confirm callers) -->

### 5.4 Persistent single-tab manager (Verified — firebase.ts:47-58)

- `initializeFirestore` uses `persistentLocalCache({tabManager: persistentSingleTabManager({})})`. Comment (lines 49-54): "each tab manages its own IDB independently. Eliminates the cross-tab IDB version coordination that caused the 'Firestore shutting down' cascade."
- Recent commit `e5278070` (history confirmed by `git log` on firebase.ts) switched from the multi-tab manager to this. `e8e15f95` followed with "pass required settings arg" (the `{}`). This means the `recoverFromFirestoreShutdown` and `controllerchange` cascade defenses are now mitigations for an issue that the new tab manager *also* addresses architecturally.
- **Inferred consequence**: the shutdown cascade is now much less likely to happen at all. The 3-second SW reload (§5.2) is, in light of the tab manager, possibly overkill — but harmless.

### 5.5 Invariants (Verified)

1. **`crc-local` survives `clearFirestoreIndexedDB`** because the name doesn't match `/firestore/i`.
2. **`'sending'` rows are always recoverable across reload** via `engine.start()` reset (engine.ts:111-121). The cost is a spurious VersionMismatch if the original write already landed.
3. **`_shutdownRecoveryScheduled` is a one-shot per tab session** — a failed reload (e.g. blocked by `beforeunload` handler) cannot retry.

### 5.6 Edge cases NOT handled

- **The 3-second SW reload doesn't wait for outbox drain.** PREEXISTING-ISSUES C.5 proposes waiting for `queued === 0` via `engine.notifyFromDb()`. Verified absence in current code.
- **`recoverFromFirestoreShutdown` matches on the substring "shutting down"** (case-insensitive). Any unrelated error message containing those words could trigger an unintended reload. Inferred low risk; flagged.
- **Reload after IDB wipe doesn't notify the user.** Mid-edit data is preserved in `crc-local`, but the reload itself looks like a crash. UX gap noted in PREEXISTING-ISSUES C.5.

---

## 6. Auth flow

### 6.1 Files involved (Verified)

- `src/lib/firebase.ts` — Firebase Auth init (line 70: `auth = getAuth(app)`). Single `Auth` instance.
- `src/lib/auth-context.tsx` (Verified, full read) — `AuthProvider`, `useAuth`. Owns the user-visible session state.
- `src/lib/sync/init.ts:133-137` — `ProductionFirestoreAdapter.refreshAuthToken`: reads `auth.currentUser`, calls `getIdToken(true)`. Throws `AuthError` if no current user.
- `src/lib/sync/engine.ts:420-456` — the `AuthError` handler branch.
- `src/lib/session-cookie.ts` (Inferred — `syncSessionCookie` is imported in auth-context.tsx:16; not read directly here).
- `src/lib/drift-repair.ts` (Inferred — `repairDrift` import in auth-context.tsx:17).

### 6.2 Sign-in → engine-knows-about-the-user trace (Verified)

1. User clicks sign-in → `AuthProvider.signIn` calls `signInWithPopup(auth, googleProvider)` (auth-context.tsx:273).
2. `onAuthStateChanged(auth, ...)` listener (auth-context.tsx:89) fires with the new `User`.
3. `setUser(currentUser)` + `setLoading(true)`. `syncSessionCookie(currentUser)` fires (auth-context.tsx:103) to set the `__session` cookie used by middleware.
4. `subscribeToUserProfile(uid, ...)` mounted (auth-context.tsx:119) — pushes the Firestore-resident `UserProfile` into state.
5. `ensureUserProfile(currentUser)` fires in background (line 175).

**The sync engine is decoupled from `useAuth`.** `bootEngineOnce` in `init.ts:161-186` is called by `SyncEngineBoot` (a null-rendering component, line 214-222) in a `useEffect` with no dependencies. The engine starts as soon as it mounts — independent of `user` state. The engine uses `auth.currentUser` only via `adapter.refreshAuthToken` (init.ts:134), which is called lazily inside `handleAdapterError`.

**Open**: where is `<SyncEngineBoot />` mounted in the React tree? Not searched. The fact that `engineSingleton` is module-level and `booted` is a module-level flag suggests it's mounted high in the tree (probably `app/layout.tsx` or a top-level provider).

<!-- grep would clarify; flagged. -->

### 6.3 AuthError branch in `engine.handleAdapterError` (Verified — engine.ts:420-456)

- First attempt (`row.attempts === 0`):
  - `await adapter.refreshAuthToken()` → `auth.currentUser.getIdToken(true)`.
  - On refresh success: retry `commitOutboxRow` once inline (`fresh = {...row, attempts: 1}`). On success → `outbox.delete(localId)` → `'continue'`. On second failure → `'failed'` with `attempts:1`, dispatch `DRAIN_AUTH_FAILED` → state `'failed'`.
  - On refresh failure (`catch { }` at line 445): falls through to the unconditional `'failed'` block below (lines 449-455). `'stop-drain'`.
- Subsequent attempts: skip refresh, mark `'failed'`, dispatch `DRAIN_AUTH_FAILED`.

### 6.4 SyncIndicator → sign-out affordance (Verified — SyncIndicator.tsx:225-251)

When `state === 'failed'` AND `lastError` matches `AUTH_ERROR_PATTERN = /permission|auth|denied|unauthenticated|unauthorized/i` (line 26), the indicator renders a "Sign out and back in" button below the error text. Calls `useAuth().signOut()`.

### 6.5 Invariants (Verified)

1. **Engine doesn't know about the user identity directly.** It uses `auth.currentUser` only via the adapter, only on `AuthError`.
2. **One-shot token refresh per row.** `attempts === 0` gate prevents an infinite refresh loop on a row that's perma-stuck due to actual auth revocation.
3. **Session cookie sync gates loading** (auth-context.tsx:99-114). Until `syncSessionCookie` resolves, `loading: true` — prevents middleware redirect races.
4. **Claims-drift repair** (auth-context.tsx:139-154) reconciles Firestore profile role vs ID-token role via `repairDrift`. Inferred: this fires on each profile snapshot, not just sign-in.

### 6.6 Edge cases NOT handled (Verified + Inferred)

- **`refreshAuthToken` calls `getIdToken(true)` but doesn't re-sync the session cookie.** If the failure was caused by a stale `__session` cookie (not a stale ID token), the refresh succeeds, the retry fails again (server still sees stale cookie), and the row dead-letters. The user then sees the "Sign out and back in" affordance. Verified by reading both init.ts:133-137 and the session-cookie usage in auth-context.tsx — the cookie is refreshed only on visibilitychange or claims-update events (auth-context.tsx:200-232).
- **Engine boot timing.** `bootEngineOnce` runs in a `useEffect` (line 215) — it fires after first paint. If `applyEdit` is called BEFORE `SyncEngineBoot` mounts, the outbox accepts the write but no engine is alive to drain it until boot completes. Inferred: small window, but flagged because the lazy-hydration cascade in `SetlistGridHydrator` could fire before `SyncEngineBoot`. Open: verify mount order.
- **Sign-out doesn't shut the engine down.** `shutdownSyncEngine()` (init.ts:201-212) exists but isn't called from `AuthProvider.signOut`. Sign-out reloads the page (auth-context.tsx:312), so the module-level `booted` flag resets on the fresh page. Inferred safe, but if the reload were ever removed, the engine would keep pumping with stale auth.

---

## 7. Service worker

### 7.1 Files involved (Verified)

- `src/app/sw.ts` (Verified, full read — 23 lines):
  ```ts
  const serwist = new Serwist({
    precacheEntries: self.__SW_MANIFEST,
    skipWaiting: true,
    clientsClaim: true,
    navigationPreload: true,
    runtimeCaching: defaultCache,
  });
  serwist.addEventListeners();
  ```
- `next.config.ts` — wires `@serwist/next` (referenced in PREEXISTING-ISSUES B.4 type errors; not read directly here).
- `src/lib/firebase.ts:150-155` — the controllerchange reload (already covered in §5.2).

### 7.2 What it caches (Verified)

- `precacheEntries: self.__SW_MANIFEST` — the build-time-injected manifest from `@serwist/next`. Contains the Next.js static assets / chunks / pages bundle.
- `runtimeCaching: defaultCache` — Serwist's default cache rules. **Not inspected directly** (Open — would need to read the Serwist source or docs).

### 7.3 Update behavior (Verified)

- `skipWaiting: true` — new SW activates immediately on install (no "waiting" state).
- `clientsClaim: true` — new SW takes control of all open tabs immediately upon activation. This is what fires `controllerchange`.
- `navigationPreload: true` — parallel network fetch alongside SW boot; speeds up first-page nav under SW.

### 7.4 Controllerchange behavior under in-flight outbox writes

Already covered in §5.2:
- Hard reload at 3s.
- In-flight `commitOutboxRow` aborted by unload.
- After reload, `engine.start()` resets `'sending'` rows back to `'pending'`.
- Risk: spurious VersionMismatch if the original write actually landed.

### 7.5 Invariants (Verified)

1. **`skipWaiting` + `clientsClaim` together guarantee an immediate update cascade** — the user cannot "stay on the old version" past the next page load.
2. **The 3-second timeout is not coordinated with the engine** — no `engine.notifyFromDb` check before reload.

### 7.6 Edge cases NOT handled

- **In-flight commits during reload** (already noted in §5.2 / PREEXISTING-ISSUES C.5).
- **The user can't decline the reload.** No toast, no deferred-on-idle option. Mid-edit reload is jarring.
- **Multiple tabs each fire `controllerchange` independently** — every open tab reloads at 3s. Inferred: harmless because reload is per-tab and Dexie state is per-origin, but it can look alarming.

---

## Cross-cutting findings

### Contradictions surfaced

1. **`_shutdownRecoveryScheduled` is documented as a 5-second debounce but is actually a one-shot per tab session.** firebase.ts:162-173. Already in PREEXISTING-ISSUES C.1; verified.

2. **The reconciliation modal advertises "Remote changes detected" but is used for any `failed` outbox row, including dead-letter from transient errors and auth failures.** ReconciliationProvider.tsx:177 + 383. The modal renders an empty diff in those cases (`diffKeys.length === 0` → "Row reordered or deleted") which is misleading copy.

3. **PREEXISTING-ISSUES C.4 claims `setlist-firebase.subscribeToSetlist` is vestigial.** This is incorrect at HEAD — `src/hooks/use-add-to-setlist.ts:167` uses it as part of the undo flow. Verified by grep. **Do not delete.**

4. **`useSyncStatus.lastSyncAt` is only set when transitioning to `'idle'`** (store.ts:31). The `SyncIndicator` tooltip reads `lastSyncAt` to show "Saved just now" (SyncIndicator.tsx:124-128). But the label is hardcoded "Saved" with no time inline. PREEXISTING-ISSUES C.7 wants the time surfaced inline; verified.

5. **`isMobile` in `SetlistGrid.tsx:925` has no remaining reader.** Verified by grep on the file — the variable is declared but not used after Bug 3 removed the mobile-anchor `ChartBindPopover` block. PREEXISTING-ISSUES C.2.

### Patterns / invariants that span multiple flows

- **The "outbox-pending guard" appears in three places**: snapshot-listener.ts:146-159 (cross-device read), SetlistGridHydrator.tsx:100-107 (server-priming), and engine.ts:212 (per-doc serial drain). All three implement the same semantics: "if the engine has work in flight for this docId, don't clobber the local row from a different code path." This is a load-bearing invariant of the design — the substrate guarantees that local edits are never silently overwritten by server data while they're unresolved. Any change that weakens any one of these three guards risks reintroducing the v5h-01-02 / Bug 2 class of issues.

- **Tombstones are written/cleared in FOUR places**: write.ts:113 (set clears), write.ts:146-151 (delete writes), engine.ts:276-279 (successful delete commit clears), snapshot-listener.ts:261 (remote remove clears). Hydrator and snapshot-listener handlers READ tombstones but don't write/clear. **Inferred load-bearing invariant**: the tombstone lifecycle is symmetric — every code path that creates one also has a counterpart that clears it. Any new path that writes tombstones must add a corresponding clear path.

- **Server data flows directly into `db.put` / `db.delete`, NEVER through `applyEdit`** (snapshot-listener.ts:1-6, SetlistGridHydrator.tsx:71-73). The exception is the lazy-hydration fan-out and trackCount reconciler, which intentionally re-enqueue outbox rows because they represent app-driven migrations equivalent to user intent. **Any new server-data ingestion must follow the direct-write pattern** or the outbox will pingpong.

- **The engine's `pump()` is driven by online events, lock-availability, and `scheduleNextPump` timer chains — NOT by outbox writes.** Verified absence of `engine.pump()` / `engine.notifyEditCommitted()` calls from `applyEdit`. The reliance on continuous pumping during active editing is the only thing that keeps fresh writes flowing in practice. See §1.8 latent-bug note.

### Surprises

- **`applyEdit` is called both inside the cleanup-tx context (write.ts) AND from the hydrator's fan-out / trackCount reconciler.** The hydrator's `useEffect`-driven `applyEdit` calls are perfectly legal but mean the lazy-hydration cascade isn't an idempotent reseed — it actually enqueues real outbox rows that go to Firestore. The `withoutUndo: true` flag is the only signal that this is "system intent."

- **`commitOutboxRow` does an EXTRA `getDoc` round-trip on every `set` and `update`** to capture the resolved server timestamp (init.ts:55, 94). One write becomes two round-trips at the Firestore level. This is intentional (init.ts:51-53 comment) but represents a non-trivial cost for high-rate editing.

- **`scheduleNextPump` early-returns when the outbox has no `'pending'` rows** (engine.ts:524). This is correct in isolation but combines badly with the absence of an `applyEdit`-side nudge — see the latent-bug note in §1.8. Worth a Phase C cluster.

- **`AlertDialog` is used for both DeleteConfirm and Reconciliation** — and ReconciliationProvider uses `<AlertDialogCancel>` which by Radix semantics is the "safe" outcome. But here, "Cancel" means "leave my edit pending in `failed`, don't resolve it." That's not the user's mental model of "Cancel" on a Radix AlertDialog. Inferred UX gap.

---

## Worked answer: "user edits offline; comes online while another tab has also edited the same track"

(This is the success-criterion question from the brief.)

1. **Tab A goes offline.** Engine catches `navigator.online === false` via the online listener and dispatches `NETWORK_OFFLINE` → state `'offline'`.
2. **Tab A edits the track.** `applyEdit('update', tracks, docId, {key:'F'}, expectedUpdatedAt: T0)` runs: Dexie tx writes the merged track + outbox row + (no tombstone change). useLiveQuery rerenders SetlistGrid with the new key. SyncIndicator still shows "Offline — 1 queued" because state is sticky-offline.
3. **Meanwhile, Tab B (different device or different tab) is online and edits the same track.** `applyEdit('update', tracks, docId, {key:'G'}, expectedUpdatedAt: T0)` runs on Tab B. Engine pumps, adapter.commitOutboxRow runs `runTransaction`. Remote `updatedAt` is `T0` → precondition passes. Tx commits, server now has `key:'G'` at `updatedAt: T1`. Engine writeback updates Tab B's local row to `{key:'G', updatedAt: T1}`. Outbox row deleted.
4. **Tab A comes back online.** `online` event → engine `dispatch({type: 'NETWORK_ONLINE'})` → state transitions out of `'offline'`. Pump fires.
5. **Tab A's snapshot-listener (which has been running, but Firestore caches all deliveries while offline) flushes Tab B's edit.** `handleTracks` for the modified track. Outbox check: there IS a pending row for this docId (Tab A's update from step 2). **The outbox-pending guard fires → skip the delivery.** Outcome breadcrumb `'guard-skipped-pending'`.
6. **Tab A's engine then drains the outbox row.** Adapter.commitOutboxRow runs `runTransaction`. Remote `updatedAt` is `T1` (set by Tab B). Tab A's row has `expectedUpdatedAt: T0`. Precondition fails → throws `VersionMismatchError`.
7. **Engine `handleAdapterError`**: outbox row → `{status:'failed', lastError:'expected updatedAt=T0, remote=T1'}`. Dispatch `DRAIN_VERSION_MISMATCH` → state `'conflict'`. Drain stops.
8. **`useSyncStatus` pushes `state='conflict'`.** `ReconciliationProvider` sees `hasConflict === true` and a failed row → modal opens. `adapter.readDoc('tracks', docId)` fetches remote `{key:'G', updatedAt: T1}`. Modal renders:
   - Title: track title (read from local Dexie).
   - Diff: `Key` row showing "Your version: F / Their version: G".
   - Per-row radios, default `'theirs'`.
9. **User picks "Keep mine" + "Resolve all and save".** `handleResolveAll` calls `engine.resolveConflict(localId, 'mine', {newExpectedUpdatedAt: T1})`. Engine: outbox row → `{status:'pending', attempts:0, expectedUpdatedAt: T1, scheduledFor:now}`. Dispatch `CONFLICT_RESOLVED` → state `'dirty'`. `await pump()`.
10. **Pump retries**. Adapter sees remote `updatedAt: T1`, precondition matches, tx commits with `key:'F'`. Server now has `key:'F'` at `updatedAt: T2`. Engine writeback updates Tab A's local row to `{key:'F', updatedAt: T2}`. Outbox row deleted. State `'idle'`.
11. **Tab B's snapshot-listener flushes Tab A's write.** Outbox-pending check (no rows). Tombstone check (no tombstone). LWW: Tab B's local `updatedAt: T1` < delivery `T2`. `db.tracks.put({key:'F', updatedAt: T2})`. Tab B's SetlistGrid rerenders showing `F`.

End state: both tabs converged on `key: 'F'` at `updatedAt: T2`. Outbox empty. Tombstones empty. No silent overwrites; the user explicitly chose.

If the user had picked **"Take theirs"** instead at step 9, the outbox row would be deleted (engine.ts:547), state → `'dirty'` → `'idle'` on next pump (no work). Tab A's local row is **left at `key: 'F'`** — but the next snapshot delivery from Firestore would fire (now no pending outbox row to gate it) and LWW would replace the local row with `{key:'G', updatedAt: T1}`. **Convergence relies on the snapshot-listener firing post-resolution** — there's a brief window where Tab A's UI shows the abandoned `F` until the listener delivers `G`. Inferred minor UX gap; flagged.

---

## Verification footer

**Files cited and verified at HEAD `9fb45b5a` as of 2026-05-12:**

Full reads:
- `src/lib/local/write.ts` (1-215)
- `src/lib/local/schema.ts` (1-99)
- `src/lib/local/types.ts` (1-188)
- `src/lib/sync/engine.ts` (1-579)
- `src/lib/sync/state-machine.ts` (1-91)
- `src/lib/sync/snapshot-listener.ts` (1-387)
- `src/lib/sync/firestore-adapter.ts` (1-91)
- `src/lib/sync/init.ts` (1-223)
- `src/lib/sync/store.ts` (1-47)
- `src/lib/sync/cross-tab-lock.ts` (1-213)
- `src/lib/sync/cleanup.ts` (1-124)
- `src/lib/firebase.ts` (1-176)
- `src/lib/auth-context.tsx` (1-347)
- `src/components/setlist/grid/SetlistGridHydrator.tsx` (1-357)
- `src/components/setlist/grid/ReconciliationProvider.tsx` (1-569)
- `src/components/setlist/grid/SyncIndicator.tsx` (1-264)
- `src/app/(main)/setlists/[id]/page.tsx` (1-132)
- `src/app/sw.ts` (1-23)

Partial reads (cited lines verified):
- `src/components/setlist/grid/SetlistGrid.tsx` (1-120, 700-920, 920-1120 — applyEdit call sites + useLiveQuery)
- `src/lib/setlist-firebase.ts` (170-200 — subscribeToSetlist + updateSetlist)

Git history consulted:
- `git rev-parse HEAD` → `9fb45b5a185b13e134d23a764aa1b01dc1e9972a`
- `git log --oneline` (recent 20 commits)
- `git log --oneline -- src/lib/sync/engine.ts`
- `git log --oneline -- src/lib/firebase.ts`
- `git log --oneline -- src/lib/local/write.ts src/lib/local/schema.ts src/lib/local/types.ts`
- `git show --stat a680fb3b` (auto-resolve hotfix that was later removed by Bug 2 fix `763b2b6b`)

Grep results material to the doc:
- `applyEdit` callers — 24 files, breakdown in §1.1.
- `engine.pump` / `notifyEditCommitted` callers outside tests — only `cleanup.ts:113`. See §1.5.
- `subscribeToSetlist` callers — `src/hooks/use-add-to-setlist.ts:167` (refutes PREEXISTING-ISSUES C.4).
- `recordEdit` calls — `applyEdit:172`, `engine.ts:329, 381, 492`, `snapshot-listener.ts:324`. Source identifiers match `EditLogSource` union.

**Claims unverified at writing time (Open — to resolve before Phase E):**

1. **Where is `<SyncEngineBoot />` mounted in the React tree?** Not searched. Affects engine-boot timing relative to first `applyEdit` (§6.6).
2. **What is `serwist`'s `defaultCache` ruleset?** Not inspected (§7.2). Affects what runtime requests are served from cache during deployment cycles.
3. **Callers of `recoverFromFirestoreShutdown`** (§5.3). Need to enumerate.
4. **`setlist-firebase.ts`'s `serializeSetlist`** and whether it includes top-level tracks (§3.6 first bullet). Affects whether server-priming has the full state on first open.
5. **`src/lib/session-cookie.ts` and `src/lib/drift-repair.ts`** — referenced by `auth-context.tsx` but not read. Affects the auth-flow trace's session-cookie semantics (§6.5).
6. **`engine.ts` latent: does the engine actually fail to drain an idle-then-edit case in practice?** §1.8 first bullet. Needs a small reproduction test (or a careful re-read of every code path that calls `pump()` — including any global timer the engine might have that I missed).
7. **`SetlistGrid.tsx` reads 121-700 and 1120-end** were not done (the file is 1730 lines). The call sites of `applyEdit` I confirmed by grep, but I did not read the surrounding handler bodies; the consumer-side mechanics (BulkSet, drag-end reorder, ChartCell binding) are abbreviated. Affects the catalog of distinct edit shapes that go through the engine.
8. **`@serwist/next` config in `next.config.ts`** not read. PREEXISTING-ISSUES B.4 cites type errors here; affects build/SW behavior.

These do not invalidate any §1-§7 architectural claim that is marked **Verified**; they're the boundary between "I read it" and "I haven't."
