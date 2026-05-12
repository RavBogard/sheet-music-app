# Audit — Sync mechanics

**Scope.** Runtime mechanics of state machine, engine drain loop, production Firestore adapter, snapshot listener, SetlistGridHydrator, service-worker reload coordination, outbox lifecycle, and edit-log breadcrumb. Read-only; HEAD = `4ee6e70`.

---

## State machine

File: `src/lib/sync/state-machine.ts`

### States (line 6-12)

`'idle' | 'dirty' | 'saving' | 'conflict' | 'failed' | 'offline'`

### Events (line 14-24)

`EDIT_COMMITTED`, `DRAIN_STARTED`, `DRAIN_OK`, `DRAIN_VERSION_MISMATCH`, `DRAIN_RETRY_PENDING`, `DRAIN_BUDGET_EXHAUSTED`, `DRAIN_AUTH_FAILED`, `NETWORK_OFFLINE`, `NETWORK_ONLINE`, `CONFLICT_RESOLVED`.

### Transition table

The pure `transition(state, event)` function (lines 27–70). Two preempt rules sit before the switch:

- **Universal preempt:** `NETWORK_OFFLINE` from any state → `'offline'` (line 29).
- **Sticky offline:** while `state === 'offline'`, only `NETWORK_ONLINE` exits, and it goes to `'dirty'` (line 31-34). All other events are ignored.

After those preempts, the switch (per current state on x, event on y; "—" means no transition / current state retained):

| From \ Event           | EDIT_COMMITTED | DRAIN_STARTED | DRAIN_OK | DRAIN_VERSION_MISMATCH | DRAIN_RETRY_PENDING | DRAIN_BUDGET_EXHAUSTED | DRAIN_AUTH_FAILED | NETWORK_ONLINE | CONFLICT_RESOLVED |
| ---------------------- | -------------- | ------------- | -------- | ---------------------- | ------------------- | ---------------------- | ----------------- | -------------- | ----------------- |
| `idle`                 | `dirty`        | `saving`      | `idle`   | `conflict`             | `saving`            | `failed`               | `failed`          | `idle`         | `dirty`           |
| `dirty`                | `dirty`        | `saving`      | `idle`   | `conflict`             | `saving`            | `failed`               | `failed`          | `dirty`        | `dirty`           |
| `saving`               | `dirty`        | `saving`      | `idle`   | `conflict`             | `saving`            | `failed`               | `failed`          | `saving`       | `dirty`           |
| `conflict`             | **`conflict`** | `saving`      | `idle`   | `conflict`             | `saving`            | `failed`               | `failed`          | `conflict`     | `dirty`           |
| `failed`               | **`failed`**   | `saving`      | `idle`   | `conflict`             | `saving`            | `failed`               | `failed`          | `failed`       | `dirty`           |
| `offline`              | —              | —             | —        | —                      | —                   | —                      | —                 | `dirty`        | —                 |

**Sticky branches:**
- `failed`/`conflict` swallow `EDIT_COMMITTED` and stay (line 40). New edits while in these states do NOT advance to `dirty` — the indicator stays loud until the user resolves the outstanding row.

### "Forced" states

- **`conflict` is reached only by `DRAIN_VERSION_MISMATCH`** (line 49). `DRAIN_VERSION_MISMATCH` is emitted exclusively from `engine.handleAdapterError` (`engine.ts:414`) when the adapter throws `VersionMismatchError` AND the self-heal branch did NOT fire (i.e., either the error message lacks `remote=undefined` OR `row.attempts !== 0`).
- **`failed` is reached by `DRAIN_BUDGET_EXHAUSTED` or `DRAIN_AUTH_FAILED`** (lines 56-58). Dispatched from `engine.handleAdapterError` for `RemoteDocMissingError`, `AuthError`, and `TransientError` after `MAX_ATTEMPTS` (5).

### Path back to `idle`

The **only** path is `DRAIN_OK` (line 46-47). `DRAIN_OK` is dispatched in two places in `engine.drainOnce`:

1. Line 233-234 — `dueRows.length === 0 && (await db.outbox.count()) === 0`.
2. Line 343-345 — end of drain loop, `remaining = await db.outbox.count(); if (remaining === 0)`.

So **`remaining === 0` is the only path to `'idle'`**. `'conflict'` and `'failed'` do NOT auto-clear when the offending row disappears — they only clear via `DRAIN_OK` (i.e., the next pump finds an empty outbox), via `CONFLICT_RESOLVED` (`engine.resolveConflict` calls `dispatch({ type: 'CONFLICT_RESOLVED' })` at line 575, returning to `'dirty'`), or via `NETWORK_OFFLINE` (always wins).

### `deriveStateFromOutbox` (line 74-90)

Used **only on `engine.start()`** (line 125) to recover state after a process restart. Precedence: `failed > sending > pending > empty` → `failed`, `saving`, `dirty`, `idle`. Note this can recover `failed` but NOT `conflict` — a restart while in conflict comes back as `failed` (since the failed outbox row's status is `'failed'`, not a separate `'conflict'` row status). The visible label after restart is `"Failed — retry"` even though pre-restart it was `"Conflict — review"`.

### UI surface mapping

`src/components/setlist/grid/SyncIndicator.tsx:37-84` (the `VISUALS` table). `SyncState → label`:

| State      | Label                                       | Icon            | Color                    |
| ---------- | ------------------------------------------- | --------------- | ------------------------ |
| `idle`     | `Saved`                                     | `Check`         | emerald-500              |
| `dirty`    | `Editing…`                                  | `CircleDashed`  | muted-foreground         |
| `saving`   | `Saving…`                                   | `Loader2`       | indigo-400, spin         |
| `conflict` | `Conflict — review`                         | `AlertTriangle` | red-500                  |
| `failed`   | `Failed — retry`                            | `XCircle`       | red-500                  |
| `offline`  | `Offline` or `Offline — {queued} queued`    | `CloudOff`      | amber-500                |

Failed-only inline error pill (line 173-178) shows `lastError` truncated to 120 chars under the pill. Sign-out affordance appears under that if `lastError` matches `/permission|auth|denied|unauthenticated|unauthorized/i` (line 26, 231).

Action `onClick` (line 162-164): in `'conflict'` it calls `resolveConflictHandler` (which falls back to `useReconciliationModalOptional().openModal`); in `'failed'` it calls `retryFailedOutboxRows` (line 154-156). All other states render a `<span role="status">`, no click.

---

## Engine drain

File: `src/lib/sync/engine.ts`

### Constants

- `BACKOFF_MS = [500, 1000, 2000, 4000, 8000]` (line 30)
- `MAX_ATTEMPTS = 5` (line 31)
- `PUMP_SENTINEL_MS = 30_000` (line 32) — upper bound on next-pump delay so the engine wakes up at least every 30s when at least one pending row exists.

### Pump scheduling

`SyncEngine.pump()` (line 172):
- Re-entrancy guard: if `this.draining`, set `wantsRedrain=true` and return (line 174-177). This is the coalescing path — multiple concurrent edits that nudge the engine while a drain is in flight collapse to one re-pump.
- Online check: if offline, dispatch `NETWORK_OFFLINE`, refresh store, return (line 178-182).
- Cross-tab leader check: `lock.tryAcquire()` — if a peer tab holds the lock, return without dispatching anything (line 183). The peer's `lock-released` will fire `availableCb` here (line 137) and re-enter `pump()`.
- Drain, then in the `finally`: refresh store, if `wantsRedrain` immediately re-pump, else call `scheduleNextPump()`.

`scheduleNextPump()` (line 533-555):
- Cancel any existing timer.
- Find soonest `scheduledFor` among `status='pending'` rows.
- If none → return (no timer scheduled). **This is the silent-pump path** — without an external nudge (`notifyEditCommitted`, online/offline event, lock-available), the engine sleeps indefinitely.
- Delay = `clamp(soonest - now, 0, PUMP_SENTINEL_MS)`.

### `notifyEditCommitted()` (line 579-582)

Dispatches `EDIT_COMMITTED` (which usually moves `idle → dirty`) then awaits `this.pump()`. Called fire-and-forget from `applyEdit` at `local/write.ts:190`:

```ts
void getSyncEngine()?.notifyEditCommitted()
```

This is the **T1.2 wake-up fix**. Pre-T1.2, after the engine drained to idle and the user typed a new cell, the outbox row was added but no event ran the pump — `scheduleNextPump` had no pending rows at that moment (or had already returned). Now every applyEdit explicitly wakes the engine.

### Per-doc serialization (`drainOnce`, line 200-237)

```ts
const allRows = await this.db.outbox.toArray()   // line 207
const oldestPerDoc = new Map<string, OutboxRow>()
const blockedDocs = new Set<string>()
for (const r of allRows) {
    const k = `${r.collection}/${r.docId}`
    if (r.status === 'failed' || r.status === 'sending') {
        blockedDocs.add(k); continue
    }
    const cur = oldestPerDoc.get(k)
    if (!cur || (r.localId ?? 0) < (cur.localId ?? 0)) oldestPerDoc.set(k, r)
}
const dueRows = Array.from(oldestPerDoc.entries())
    .filter(([k, r]) => !blockedDocs.has(k) && r.scheduledFor <= now)
    .map(([, r]) => r)
dueRows.sort((a,b) => a.scheduledFor - b.scheduledFor || (a.localId ?? 0) - (b.localId ?? 0))
```

- A doc key is `${collection}/${docId}`.
- A doc is **blocked** if it has ANY row with status `'failed'` or `'sending'`. Blocked means: none of its pending rows are eligible to drain this pass.
- Among unblocked docs, only the **oldest pending row** (lowest `localId`) is selected. So row N+1 for a given doc cannot leapfrog row N — even if N enters backoff and N+1's `scheduledFor <= now`, N+1 won't drain until N is no longer in the outbox.

A doc unblocks when:
- A `'sending'` row finishes (deleted on success in the writeback tx, or status flipped to `'failed'`/`'pending'` in `handleAdapterError`).
- A `'failed'` row is removed via `discardFailedOutboxRows` or transitioned to `'pending'` via `retryFailedOutboxRows` / `engine.resolveConflict`.

### `drainOnce` flow (per-row, line 241-339)

For each due row:
1. Recheck `started` and `isOnline` (lines 242-246). If offline mid-loop, dispatch `NETWORK_OFFLINE` and return.
2. Mark row `status='sending'` (line 248).
3. `result = await adapter.commitOutboxRow(row)`. On success:
   - Open Dexie rw tx over `outbox` + `db[row.collection]` (line 272).
   - Delete the outbox row (line 277).
   - If `result.updatedAt !== undefined && op !== 'delete'`:
     - **Thread the new updatedAt into other PENDING same-doc outbox rows** (lines 294-309). Filters `status='pending'` only; in-flight/failed rows are untouched. This is the v5h3-01-03 fix preventing phantom VersionMismatch on rapid back-to-back edits.
     - Read existing entity row and `put({ ...existing, updatedAt: result.updatedAt })` (lines 310-318). Guard: if the entity row was deleted mid-flight, skip the writeback (so we don't resurrect).
   - Fire-and-forget `recordEdit({ outcome: 'success', source: 'engine-drain' })` (line 326-334).
4. On throw → `handleAdapterError(row, err)`. If it returns `'stop-drain'` the loop exits early.

After the loop (line 343-345): `remaining = await db.outbox.count(); if (remaining === 0) dispatch({ type: 'DRAIN_OK' })`.

### `handleAdapterError` (line 352-531)

Entry-of-handler: capture `lastError`, fire `recordEdit` breadcrumb keyed by error class (`version-mismatch`, `auth-error`, `network-error`, `remote-doc-missing`, `transient-error`, `unknown-error`; line 366-386).

Per typed error class:

**`VersionMismatchError`** (line 388-416):
- **Self-heal branch** (line 400-409): if `/remote=undefined/.test(lastError) && row.attempts === 0`, clear `expectedUpdatedAt`, set `attempts=1`, `scheduledFor=now`, `lastError=undefined`, dispatch `DRAIN_RETRY_PENDING` (which keeps state at `'saving'`), return `'continue'`. The next drain will succeed because the retried row passes a "no precondition" update which writes `serverTimestamp()` to remote.
- **Otherwise:** mark row `status='failed'`, store `lastError`, dispatch `DRAIN_VERSION_MISMATCH` (state → `'conflict'`), return `'stop-drain'`.

**`RemoteDocMissingError`** (line 418-436):
- Terminal — no retry. Mark `status='failed'`, capture to Sentry (`feature='write-atomicity'`, `site='remote-doc-missing'`), dispatch `DRAIN_BUDGET_EXHAUSTED` (state → `'failed'`), return `'stop-drain'`.

**`AuthError`** (line 438-474):
- On `attempts === 0`: try `adapter.refreshAuthToken()`, then immediately retry `commitOutboxRow({...row, attempts: 1})` in-loop. On success, delete the outbox row and `continue`. On second-attempt failure, mark `'failed'`, dispatch `DRAIN_AUTH_FAILED`.
- If refresh itself throws, fall through to the `attempts > 0` path: mark `'failed'`, dispatch `DRAIN_AUTH_FAILED`, return `'stop-drain'`.

**`NetworkError`** (line 476-484):
- Restore `status='pending'` (so the row drains on resume), dispatch `NETWORK_OFFLINE`, return `'stop-drain'`. Note: the only state→offline trigger from inside drain.

**`TransientError` / unknown** (line 486-531):
- `nextAttempts = row.attempts + 1`. If `nextAttempts >= MAX_ATTEMPTS (5)`: mark `'failed'`, capture to Sentry (`feature='dead-letter'`), emit dead-letter breadcrumb, dispatch `DRAIN_BUDGET_EXHAUSTED`, `stop-drain`.
- Else: backoff at `BACKOFF_MS[nextAttempts - 1]` (so attempt 1 → 500ms, …, attempt 5 → 8000ms). Update row to `pending`, new `scheduledFor`, store `lastError`, dispatch `DRAIN_RETRY_PENDING`, return `'continue'`.

### Cross-tab lock (`src/lib/sync/cross-tab-lock.ts`)

`new CrossTabLock('crc-sync')` — BroadcastChannel-based single-leader lock; lease = 5000ms, heartbeat = 2500ms (lease/2), stale-check = 1250ms (lease/4).
- `tryAcquire()` (line 74): holder fast-path returns true; if a peer heartbeat is fresh (`now - peerHolder.ts < leaseMs`), return false. Else claim, broadcast `lock-acquired`, start heartbeat.
- `onMessage` handles tie-breaks: on receiving a competing `lock-acquired` while already holder, lower `tabId` wins; higher yields and fires `lostCb`.
- `onAvailable(cb)` (line 112-115) — registered by engine at `engine.ts:137` with `cb = () => { if (started) void this.pump() }`. Starts the stale-check ticker which fires `availableCb` once a peer's heartbeat ages past `leaseMs`.
- `onLost(cb)` (line 108) — engine registers `() => { this.draining = false }`. After losing the lock the engine drops the drain flag so a future pump can re-enter. Note it does NOT undo in-flight Dexie writes — if a `sending` row was mid-tx in this tab when the lock was lost, the writeback still lands locally; the cross-tab leader is purely advisory for who fires the adapter.

With two tabs open: only the leader drains. The follower's `notifyEditCommitted` still enqueues outbox rows (the lock only gates `drainOnce`, not Dexie writes), but its own `pump()` returns at line 183 (`tryAcquire` returns false). When the leader's tab closes / heartbeat ages out, the follower's `stale-check` fires `availableCb` → re-pumps.

---

## Production Firestore adapter

File: `src/lib/sync/init.ts:74-191`

### `commitOutboxRow` per op

**`set`** (line 78-93):
- `ref = doc(firestoreDb, row.collection, row.docId)`.
- `setDoc(ref, { ...row.payload, updatedAt: serverTimestamp() })`. **No precondition** — `set` is unconditional overwrite.
- Re-read with `getDoc(ref)` to capture the resolved server timestamp.
- Return `{ updatedAt: ms }`.

**`update`** (line 94-136):
- `ref = doc(firestoreDb, row.collection, row.docId)`.
- `runTransaction`:
  - `snap = await tx.get(ref)`.
  - **If `!snap.exists()`**: throw `RemoteDocMissingError("This setlist isn't on the server (was deleted or never synced). Refresh your library.")`. v51-h01: this is a terminal error.
  - `remoteMs = remote.updatedAt?.toMillis()` (undefined if no field).
  - `preconditionError = checkUpdatePrecondition(row.expectedUpdatedAt, remoteMs)`.
  - If non-null → throw `VersionMismatchError(preconditionError)`.
  - Else `tx.update(ref, { ...row.payload, updatedAt: serverTimestamp() })`.
- Re-read for `updatedAt`. Return `{ updatedAt: ms }`.

**`delete`** (line 137-140):
- `deleteDoc(doc(firestoreDb, row.collection, row.docId))`. Unconditional. Return `{}` (no `updatedAt`).

### `checkUpdatePrecondition` (T1.3 helper, line 65-72)

```ts
export function checkUpdatePrecondition(
    expectedUpdatedAt: number | undefined,
    remoteMs: number | undefined,
): string | null {
    if (expectedUpdatedAt === undefined) return null
    if (remoteMs === expectedUpdatedAt) return null
    return `expected updatedAt=${expectedUpdatedAt}, remote=${remoteMs ?? 'undefined'}`
}
```

Semantics:
- No local expectation (`expectedUpdatedAt === undefined`) → pass. Matches "first commit" / pre-stamped row case.
- Exact match → pass.
- Anything else (including `remoteMs === undefined && expectedUpdatedAt !== undefined`) → fail with message embedding `remote=undefined` when remote stamp is missing. **This is the message the engine's self-heal branch matches against (`/remote=undefined/`) — T1.3 produced the marker the b0e7033 self-heal consumes.**

### Error classification (line 142-167)

After the inner switch throws, the outer try/catch:
- Pass-throughs: `VersionMismatchError`, `RemoteDocMissingError`, `TransientError`.
- Legacy `err.name === 'StaleWriteError'` → re-throw as `VersionMismatchError`.
- Firestore code `unauthenticated`/`permission-denied` → `AuthError`.
- Firestore code `unavailable`/`deadline-exceeded`/`cancelled` → `NetworkError`.
- Default → `TransientError(err.message)`. **Anything not on the allow-list becomes transient and gets up-to-5 backoff retries before dead-letter.** This includes generic JS errors thrown inside `runTransaction`.

### `whenEngineIdle()` (T2.4, line 255-281)

Returns `'idle' | 'timeout'` (never rejects). Reads from the `useSyncStatus` Zustand store, not from the engine directly:

```ts
const isIdle = (s) => s.state === 'idle' && s.queued === 0
```

- Synchronous fast-path: if current store snapshot is idle, resolve `'idle'` immediately.
- Else subscribe to `useSyncStatus`; resolve `'idle'` on first store update that satisfies `isIdle`. Start a `setTimeout(timeoutMs)` (default 10_000ms) that resolves `'timeout'`. First settler wins; the unsubscriber + clearTimeout fire in `finish()`.

Used only by the SW `controllerchange` listener in `firebase.ts:157-176`.

### `getSyncEngine()` singleton and boot

- `bootEngineOnce()` (line 198-223): server-side bails (`typeof window === 'undefined'`). Sets `booted=true` (fast guard); creates `CrossTabLock('crc-sync')`, `ProductionFirestoreAdapter`, and `SyncEngine`. Wires `wireSyncEngineToStore(engine)` to surface engine state into Zustand. Calls `void engine.start()` (fire-and-forget). Triggers `uploadRecentEditLog()` once per mount.
- `SyncEngineBoot()` (line 296-304): a `<>null<>` component that calls `bootEngineOnce()` in `useEffect`. Mounted somewhere in the layout tree (search shows it lives where the editor route hosts client effects).
- `getSyncEngine()` returns the singleton or `null` if unbooted.
- `getSyncAdapter()` returns the adapter singleton — used only by `ReconciliationProvider` for the `readDoc` one-shot.

---

## Snapshot listener

File: `src/lib/sync/snapshot-listener.ts`

### Subscriptions

`startSnapshotListener(opts)` mounts two subscriptions via `makeFirestoreSubscriber(firestoreDb)`:

- **Setlist:** `onSnapshot(doc(firestoreDb, 'setlists', setlistId))` (line 104-118). Single doc.
- **Tracks:** `onSnapshot(query(collection(firestoreDb, 'tracks'), where('setlistId', '==', setlistId)))` (line 119-143). Returns `docChanges()` per delivery, mapped to `{ type, docId, data, updatedAt }`. `type` is `'added' | 'modified' | 'removed'`. For `'removed'` deliveries, `updatedAt = 0` (line 130).

Mounted by `SetlistGridHydrator` only after Dexie hydration completes (`hydration === 'done'`; SetlistGridHydrator.tsx:199-203). Returns a stop function that flips `cancelled = true` and calls both unsub functions. Errors do NOT throw out — they're logged via `logger.warn` and captured via `captureSyncFailure`.

### `timestampToMs(value)` (line 94-98)

```ts
function timestampToMs(value: unknown): number {
    if (value instanceof Timestamp) return value.toMillis()
    if (typeof value === 'number') return value
    return 0
}
```

**Missing or pending `updatedAt` → returns `0`.** This is load-bearing for the stale-write guard (see below): a legacy doc with no `updatedAt` field arrives with `change.updatedAt === 0`.

### `handleSetlist` (line 175-223)

Inside one `rw` tx on `setlists + outbox + tombstones`:
1. `hasPendingOutboxRow('setlists', setlistId)` — if true, skip entirely.
2. Tombstone check: `db.tombstones.get(['setlists', setlistId])` — if set, skip (don't resurrect intentionally-deleted setlists).
3. LWW guard:
   ```ts
   if (local) {
       if (local.updatedAt === undefined) return
       if (local.updatedAt >= delivery.updatedAt) return
   }
   ```
   When local has no resolved `updatedAt` (engine writeback hasn't finished), **prefer local** — refuse to put. v5h-01-02 fix (B).
4. `db.setlists.put({ ...delivery.data, id: setlistId, updatedAt: delivery.updatedAt })`.

### `handleTracks` (line 225-341)

Per change, inside one `rw` tx on `tracks + outbox + tombstones`:

1. **Outbox-pending guard** — if `hasPendingOutboxRow('tracks', change.docId)` (any row in `pending`/`sending`/`failed`), record outcome `'guard-skipped-pending'`, skip both put and delete.
2. **`removed` deliveries:** delete local row if present; **clear tombstone** at `['tracks', docId]` (line 261). Record `'remove-applied'`.
3. **`added`/`modified` deliveries:**
   - Tombstone check at `['tracks', docId]` → if set, record `'guard-skipped-tombstoned'`, skip.
   - LWW guard:
     ```ts
     if (local) {
         if (local.updatedAt === undefined) {
             outcomes.push({ docId, outcome: 'guard-skipped-undefined' })
             continue
         }
         if (local.updatedAt >= change.updatedAt) {
             outcomes.push({ docId, outcome: 'guard-skipped-stale', localUpdatedAt: local.updatedAt })
             continue
         }
     }
     ```
   - Else `db.tracks.put({ ...change.data, id: docId, updatedAt: change.updatedAt })`.

Edit-log breadcrumbs are flushed OUTSIDE the tx (lines 322-332) to avoid nested Dexie tx.

### Tombstone interaction summary

- **Cleared** in `'removed'` handler (line 261).
- **Skips writes** on `added`/`modified` if a tombstone exists for that docId.
- The engine's `drainOnce` writeback path does NOT clear tombstones on delete-commit success anymore (per the comment block at engine.ts:261-271, locked in by commit `6cd2c4e`). Only the snapshot-listener clears tombstones (on actual remote-delete delivery) and `applyEdit('set')` (defensive clear in write.ts:114).

### Stale-write guard with `local.updatedAt === 0`

If both `local.updatedAt` is a real `0` (legacy never-stamped doc that the hydrator already wrote with `0`) and `change.updatedAt === 0` (delivery from a doc without `updatedAt` field), then `0 >= 0` → true → skip (`'guard-skipped-stale'`). So a legacy delivery never overwrites an existing legacy local.

If local is absent but delivery is `0`, then no `local` exists, the guard skips both branches, and `db.tracks.put` with `updatedAt: 0` runs. Subsequent deliveries of the same legacy `0` also hit `0 >= 0` skip path.

---

## Hydrator

File: `src/components/setlist/grid/SetlistGridHydrator.tsx`

### Initial hydrate effect (line 69-189)

One Dexie rw tx over `setlists + tracks + outbox + tombstones`:

1. **Setlist branch (line 105-121):**
   - Skip if there's a setlist outbox row.
   - Skip if tombstoned.
   - Else if `!localSetlist || (localSetlist.updatedAt ?? 0) < (initialSetlist.updatedAt ?? 0)` → `db.setlists.put(initialSetlist)`.
2. **Tracks branch (line 123-178):**
   - If `initialTracks.length === 0` → return.
   - Pre-fetch all `tracks`-collection outbox `docId`s into `trackOutboxIds`.
   - Pre-fetch tombstones via compound index `[collection+docId]` matching `initialTracks` ids.
   - Pre-fetch local tracks for this setlist.
   - For each `t` in `initialTracks`: skip if in `trackOutboxIds`, skip if tombstoned, else if local is missing OR `local.updatedAt ?? 0 < t.updatedAt ?? 0` → push to `toPut`.
   - `db.tracks.bulkPut(toPut)`.

After tx: `setHydration('done')`.

**Guarantees:**
- A pending/sending/failed outbox row for a docId fully shields it from server priming.
- A tombstone fully shields a docId from resurrection.
- Server-newer data wins. Ties (`local.updatedAt === t.updatedAt`) skip the put — server is treated as not-newer-enough.

**Can interfere with the hydrator:**
- Snapshot listener mounting before hydrate finishes — guarded against by `useEffect` at line 199-203 keying off `hydration === 'done'`.
- Lazy-hydration cascade firing before the hydrate tx commits — guarded by same `hydration === 'done'` gate.

### Lazy-hydration cascade (line 221-295)

Gates (any false → skip):
- `hydration === 'done'`
- `initialSetlist.hydrated !== true`
- `initialTracks.length > 0`
- `!fanoutStartedRef.current` (one-shot per mount)

Sets `fanoutStartedRef.current = true` and runs `fanOut()`:

```ts
await Promise.all(initialTracks.map((t) =>
    applyEdit({ op: 'set', collection: 'tracks', doc: { ...t } }, { withoutUndo: true })
))
await applyEdit(
    {
        op: 'update', collection: 'setlists', docId: setlistId,
        patch: { hydrated: true, trackCount: initialTracks.length },
        expectedUpdatedAt: initialSetlist.updatedAt,
    },
    { withoutUndo: true },
)
lastWrittenCountRef.current = initialTracks.length
```

**P0 fix at commit `5601726`:** `trackCount` is folded into the same setlist update that flips `hydrated:true`. Previously the trackCount reconciler fired separately on its 800ms debounce, racing the hydrated:true write and bumping `setlists/{S}.updatedAt` past `initialSetlist.updatedAt` → precondition failure → setlist row went `'failed'` → modal opened.

Error handling: warn-log + Sentry capture (`feature='lazy-hydration'`). The setlist stays unhydrated and the cascade re-fires on the next mount (because `fanoutStartedRef` is mount-scoped).

### Library priming (line 311-316)

One-shot per mount once `hydration === 'done'`. Calls `primeSongsLibrary()` (best-effort; helper swallows errors). `primedRef` ensures fire-once.

### trackCount reconciler (line 335-370)

Live query: `db.tracks.where('setlistId').equals(setlistId).count()` (Dexie `useLiveQuery`).

Effect runs whenever `liveTrackCount` changes. Gates:
- `hydration === 'done'`
- `liveTrackCount !== undefined` (live query loaded)
- `liveTrackCount !== currentStored` where `currentStored = lastWrittenCountRef.current ?? initialSetlist.trackCount`.

If all gates pass, `setTimeout(800)` then re-check `liveTrackCount === lastWrittenCountRef.current` (raced writes) and if still different, fire `applyEdit({ op: 'update', collection: 'setlists', docId: setlistId, patch: { trackCount } })`. On resolve set `lastWrittenCountRef.current = liveTrackCount`. On reject, warn-log only.

**`lastWrittenCountRef` is seeded by the cascade** (line 271) so the reconciler's first comparison after a successful cascade doesn't re-fire for the count the cascade just wrote.

**Important: this update does NOT pass `expectedUpdatedAt`.** It's an unconditional update (or, more precisely, conditional only on the row not having been deleted on the server — `RemoteDocMissingError` still fires).

---

## Service-worker reload coordination

File: `src/lib/firebase.ts` and `src/app/sw.ts`.

### `controllerchange` listener (firebase.ts:156-176)

```ts
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        logger.info('[FirestoreRecovery] Service worker updated — waiting for sync drain before reload')
        void (async () => {
            try {
                const { whenEngineIdle } = await import('./sync/init')
                const outcome = await whenEngineIdle(10_000)
                if (outcome === 'timeout') {
                    logger.warn('[FirestoreRecovery] Sync drain timed out at 10s — reloading anyway')
                } else {
                    logger.info('[FirestoreRecovery] Sync drained — reloading')
                }
            } catch (err) {
                logger.warn('[FirestoreRecovery] whenEngineIdle failed — reloading anyway', err)
            }
            window.location.reload()
        })()
    })
}
```

Fires once when a new service worker takes control. Awaits `whenEngineIdle(10_000)` (10-second hard timeout). Either way (idle or timeout), then `window.location.reload()`.

### `recoverFromFirestoreShutdown` (firebase.ts:196-205)

```ts
let _shutdownRecoveryAttempted = false
export function recoverFromFirestoreShutdown(err: unknown): void {
    if (typeof window === 'undefined') return
    const msg = String((err as Error)?.message || err || '')
    if (!msg.toLowerCase().includes('shutting down')) return
    if (_shutdownRecoveryAttempted) return
    _shutdownRecoveryAttempted = true
    logger.warn('[FirestoreRecovery] Firestore shut down — reloading in 1.5s')
    setTimeout(() => window.location.reload(), 1500)
}
```

One-shot per session; flag is never reset (deliberately — see T2.3 doc block). Triggered by Firestore listener error callbacks that include "shutting down" in the message. After the first attempt, subsequent matching errors are no-ops.

### Unhandled-rejection auto-recovery (firebase.ts:122-141)

Session-scoped flag `firestore-idb-recovery-attempted` in `sessionStorage`. On any window `unhandledrejection` whose message includes `INTERNAL ASSERTION FAILED` or `Unexpected state`:
- Set the flag, await `clearFirestoreIndexedDB()`, `window.location.reload()`.
- The flag is cleared on `window.load` so a clean load resets the latch.

### Service-worker behavior (`src/app/sw.ts`)

Serwist config (T2.2 simplification):
```ts
const serwist = new Serwist({
    precacheEntries: self.__SW_MANIFEST,
    skipWaiting: true,
    clientsClaim: true,
    runtimeCaching: defaultCache,
});
```

`navigationPreload` was dropped in commit `8075c14` to silence install-phase errors. `skipWaiting + clientsClaim` means a new SW activates and claims all clients immediately, firing `controllerchange` for every open tab.

### Mid-edit reload behavior (the load-bearing trace)

**Scenario: user is typing in a `TextCell` (no blur yet, so no `applyEdit` → no outbox row yet) and the SW updates.**

1. New SW activates → `controllerchange` fires.
2. Handler calls `whenEngineIdle(10_000)`. The engine reads `useSyncStatus.getState()`:
   - **In-progress text in a `<textarea>`/`<input>` is React local component state only** (see TextCell.tsx:80 — `onCommit(draft)` only fires inside the `commit()` function called from `onBlur` line 143, Enter, or arrow-keys). It is NOT in Dexie, NOT in the outbox.
   - Therefore `useSyncStatus.state` could be `'idle'` with `queued = 0` if the user's previous edits already drained. `whenEngineIdle` resolves synchronously to `'idle'` (init.ts:264-267).
   - Or it could be `'dirty'`/`'saving'` if other rows are draining; the await blocks until those finish (or 10s timeout).
3. Either way → `window.location.reload()`.
4. The reload destroys the in-memory React state, INCLUDING the unblurred draft.

**The user's in-progress unblurred text is lost.** `whenEngineIdle` cannot protect what was never committed; it only ensures already-blurred edits finish flushing. The TextCell has no mechanism (e.g., a `beforeunload` blur trigger) that would force the draft into Dexie before reload.

(There's also no `beforeunload` confirmation prompt for unsaved drafts — search of the editor tree shows no such handler in the cell path.)

---

## Outbox lifecycle

### Schema (`src/lib/local/schema.ts:28, 72`)

```
outbox: '++localId, status, scheduledFor, [status+scheduledFor]'
```

Auto-inc `localId` (number), indexed `status` and `scheduledFor`, compound `[status+scheduledFor]`.

### Row shape (`types.ts:69-81`)

```ts
interface OutboxRow {
    localId?: number
    status: 'pending' | 'sending' | 'failed'
    scheduledFor: number
    op: 'set' | 'update' | 'delete'
    collection: 'setlists' | 'tracks' | 'songs'
    docId: string
    payload: Record<string, unknown>
    expectedUpdatedAt?: number
    attempts: number
    lastError?: string
    createdAt: number
}
```

### Boot path — `'sending'` reset (engine.ts:111-121)

```ts
const orphaned = await this.db.outbox.where('status').equals('sending').toArray()
for (const row of orphaned) {
    await this.db.outbox.update(row.localId!, {
        status: 'pending',
        scheduledFor: this.clock.now(),
    })
}
```

Runs once at the start of `engine.start()`. Any row left in `'sending'` from a force-quit / crash / hard reload mid-`drainOnce` is reset to `'pending'` with `scheduledFor=now`. Without this reset, the per-doc serialization in `drainOnce` would treat `'sending'` as held forever and never drain any later row for the same doc.

### `cleanup.ts` helpers

- `discardFailedOutboxRows({db?})` (line 32-50): removes every row with `status='failed'`. Pending/sending rows preserved. Does NOT nudge the engine — caller is expected to let the pump observe.
- `retryFailedOutboxRows({db?, pump?})` (line 69-108): for every failed row, set `status='pending'`, `attempts=0`, `scheduledFor=now`, `lastError=undefined`. After the loop, if any were retried, call `pump` (defaults to `getSyncEngine()?.pump()`).

`SyncIndicator`'s "Failed — retry" pill (`SyncIndicator.tsx:154-157`) calls `retryFailedOutboxRows()` by default. **The label and the action match — it truly retries; it does not discard.** No explicit discard affordance is currently wired into the indicator.

---

## Edit-log breadcrumb (`src/lib/sync/edit-log.ts`)

Append-only Dexie table `edit_log` (`schema.ts:59, 74`, primary key `++id`, index `ts`). Capped at 500 rows (`EDIT_LOG_MAX_ROWS`).

Recorded from five sites: `text-cell`, `dropdown-cell`, `apply-edit`, `engine-drain` (per row, both success and per error class), `snapshot-listener` (per change). No user-typed content — only stable ids, opcodes, outcome strings, and field names.

On mount: `init.ts:214` fires `uploadRecentEditLog()` once — flushes the most-recent ~50 rows to Sentry as breadcrumbs, then deletes the drained range. Fire-and-forget.

Useful as a debug aid for save-loss recurrences: the breadcrumb sequence per `docId` shows applyEdit → engine-drain success/error → snapshot-listener echo guard outcome, all on a single timeline.

---

## TraceA: edit a cell, commit succeeds

User edits a cell value and blurs:

1. `TextCell.commit()` runs (`cells/TextCell.tsx:78-87`), calling `onCommit(draft)`.
2. `onCommit` is wired to `commitTrackPatchImpl` via `meta.onCommitTrackPatch` (`SetlistGrid.tsx:1381`). `commitTrackPatchImpl(docId, patch, expectedUpdatedAt)` at `SetlistGrid.tsx:722-745` calls:
   ```ts
   await applyEdit({ op: 'update', collection: 'tracks', docId, patch, expectedUpdatedAt },
       { undoKey: `tracks:${docId}:${fields}` })
   ```
3. `applyEdit` (`local/write.ts:66-226`) opens a Dexie rw tx over `tracks + outbox + tombstones`:
   - Reads `existing = db.tracks.get(docId)` (line 119). If missing → `WriteAtomicityError`.
   - `db.tracks.put({...existing, ...patch, id: docId})` (line 130).
   - `db.outbox.add(buildOutboxRow(edit, {...patch}, now))` — row shape: `status='pending'`, `scheduledFor=now`, `op='update'`, `expectedUpdatedAt`, `attempts=0` (line 131-133).
   - Tombstones table is included for atomicity but no write happens on `update`.
4. After commit: fire-and-forget `recordEdit({source:'apply-edit', op:'update', payloadKeys})` (line 173-180).
5. Fire-and-forget `getSyncEngine()?.notifyEditCommitted()` (line 190) → `engine.dispatch({type:'EDIT_COMMITTED'})` (state `idle→dirty`, or sticks at `failed`/`conflict`) → `engine.pump()` (engine.ts:579-582).
6. `pump()`:
   - Not draining → proceed.
   - Online → proceed.
   - `lock.tryAcquire()` → true (single tab).
   - `drainOnce()` (engine.ts:200): snapshot of outbox; our row's docId not blocked, `scheduledFor <= now` → selected as due.
   - Dispatch `DRAIN_STARTED` → state `'saving'`. Store updates → `SyncIndicator` shows "Saving…".
   - Loop iteration: set row `status='sending'` (line 248).
   - `adapter.commitOutboxRow(row)` (`init.ts:75`): `update` branch (line 94):
     - `runTransaction`: `snap = tx.get(ref)`; exists, `remoteMs === expectedUpdatedAt` → precondition passes. `tx.update(ref, { ...patch, updatedAt: serverTimestamp() })`.
     - Re-read `getDoc(ref)` → `ms = data.updatedAt.toMillis()`. Returns `{ updatedAt: ms }`.
   - Engine writeback tx (engine.ts:272-323):
     - `db.outbox.delete(localId)`.
     - For any other pending same-doc outbox rows: set their `expectedUpdatedAt = ms` (line 294-309).
     - `existing = db.tracks.get(docId)`; if present, `db.tracks.put({ ...existing, updatedAt: ms })` (line 310-318).
   - `recordEdit({outcome:'success', source:'engine-drain'})` (line 326-334).
7. End of loop: `remaining = db.outbox.count()`. If `0` → dispatch `DRAIN_OK` (engine.ts:343-345) → state `'idle'`, `lastSyncAt = Date.now()` (store.ts:31).
8. `pump()` `finally` block: `notifyFromDb` refreshes store → `SyncIndicator` shows "Saved" (with `lastSyncAt` tooltip).
9. Snapshot listener echo: Firestore fires `modified` for `tracks/{docId}` with `updatedAt = ms`. `handleTracks`:
   - `hasPendingOutboxRow('tracks', docId)` → false (the writeback tx deleted the row).
   - No tombstone.
   - `local = db.tracks.get(docId)` → `local.updatedAt = ms` (just written by the engine).
   - `local.updatedAt >= change.updatedAt` (equal) → `'guard-skipped-stale'`, skip. Local row is untouched. Edit-log breadcrumb fires post-tx.

---

## TraceB: edit a cell, remote `tracks/{id}` has no `updatedAt` field

Pre-condition: a legacy doc exists in Firestore without `updatedAt`. Locally `db.tracks.get(docId).updatedAt` could be any of:
(a) 0 (hydrator wrote with `timestampToMs` → 0),
(b) some real value (if a snapshot delivery once stamped it),
(c) undefined.

**Common case (a): `local.updatedAt === 0`, user edits cell.**

1. `applyEdit({op:'update', expectedUpdatedAt: 0, ...})` — `expectedUpdatedAt` is read from `row.original.updatedAt` (commitTrackPatchImpl path).
2. Outbox row inserted with `expectedUpdatedAt: 0`, `attempts: 0`. `applyEdit → notifyEditCommitted → pump → drainOnce`.
3. Adapter `update` branch: `tx.get(ref)` → `remote.updatedAt = undefined` (no field). `remoteMs = undefined`. `checkUpdatePrecondition(0, undefined)` → returns `"expected updatedAt=0, remote=undefined"`. Throws `VersionMismatchError("expected updatedAt=0, remote=undefined")`.
4. `handleAdapterError` (engine.ts:388):
   - `VersionMismatchError` branch entered.
   - `/remote=undefined/.test(lastError)` → true; `row.attempts === 0` → true.
   - Self-heal (line 400-409): update outbox row to `{ expectedUpdatedAt: undefined, attempts: 1, scheduledFor: now, lastError: undefined }`. Dispatch `DRAIN_RETRY_PENDING` → state stays `'saving'`. Return `'continue'`.
5. Loop continues with the next row (none for this doc — it's the only one). End of loop: `remaining = 1` (the same row still pending), no `DRAIN_OK`. `wantsRedrain` is false. `scheduleNextPump` picks `soonest = now`, delay=0, fires `pump()` ASAP.
6. Next pump → `drainOnce` selects the same row (now `pending`, `scheduledFor <= now`). Status flips to `'sending'`. Adapter `update`: `tx.get(ref)` → still missing `updatedAt`. `checkUpdatePrecondition(undefined, undefined)` → returns `null` (first short-circuit at line 69). **`tx.update(ref, { ...payload, updatedAt: serverTimestamp() })` runs unconditionally.** Server now has a real `updatedAt`.
7. Re-read returns `ms = <server ts>`. Engine writeback tx deletes outbox row, writes `db.tracks.put({...existing, updatedAt: ms})`.
8. `remaining === 0` → `DRAIN_OK` → state `'idle'`. The user sees "Saving…" briefly then "Saved". **No error pill.** State never visited `'conflict'` or `'failed'` because the dispatched event was `DRAIN_RETRY_PENDING`, not `DRAIN_VERSION_MISMATCH`.

The whole self-heal cost is two adapter round-trips on the legacy doc. Subsequent edits use the now-stamped `updatedAt` and never trip the precondition.

---

## TraceC: edit a cell, real two-writer conflict — what still drives `'conflict'` with the modal disabled

Pre-condition: `local.updatedAt = X`, remote `updatedAt = Y` where `X !== Y` and `Y !== undefined` (so the self-heal pattern doesn't fire). User commits an edit.

1. `applyEdit({op:'update', expectedUpdatedAt: X, ...})` → outbox row with `expectedUpdatedAt: X, attempts: 0`.
2. Pump → drain → adapter `update`:
   - `tx.get(ref)` → `remote.updatedAt.toMillis() = Y`.
   - `checkUpdatePrecondition(X, Y)` → `"expected updatedAt=${X}, remote=${Y}"`. Throws `VersionMismatchError`.
3. `handleAdapterError` (engine.ts:388):
   - `VersionMismatchError` branch.
   - Self-heal check: `/remote=undefined/.test("expected updatedAt=${X}, remote=${Y}")` → **false** (because `${Y}` is a number, not the literal `undefined`). Self-heal not taken.
   - Falls through to lines 410-415:
     ```ts
     await this.db.outbox.update(localId, { status: 'failed', lastError })
     this.dispatch({ type: 'DRAIN_VERSION_MISMATCH' })
     return 'stop-drain'
     ```
4. **`DRAIN_VERSION_MISMATCH` → state `'conflict'`** (state-machine.ts:49-50). Store update → `SyncIndicator` shows `"Conflict — review"` with red `AlertTriangle`.
5. The outbox row is now `status='failed'` with `lastError = "expected updatedAt=${X}, remote=${Y}"`.

### What the reconciliation modal does (or doesn't)

In `ReconciliationProvider.tsx`:
- `failedOutboxRows` live-queries every `failed` row (line 202-207).
- `conflictRows` filters to those whose `classifyOutboxError(lastError) === 'version-mismatch'` (line 226-232) — matched by `/expected updatedAt=/` regex (line 162).
- **Line 242: `const hasConflict = false`** — the modal is hardcoded off.
- `const open = hasConflict && dismissedKey !== idSetKey` → always `false` (line 292). The `<AlertDialog>` is rendered but `open={false}` (line 438).
- `SyncIndicator`'s conflict click path: `onResolveConflict ?? reconciliation?.openModal`. `openModal` sets `dismissedKey = null` (line 366-368). With `hasConflict = false`, this is a no-op for visibility — `open` stays `false`.

### So what still puts the indicator into `'conflict'`?

**The FSM itself.** `'conflict'` is a function of `engine.dispatch({type:'DRAIN_VERSION_MISMATCH'})`, which fires whenever:
- The adapter throws `VersionMismatchError`, AND
- The self-heal branch's preconditions are not met (`row.attempts !== 0` OR `lastError` doesn't include `remote=undefined`).

The "modal disabled" change is purely a UI mute. It does not change the engine's state transitions. Any real two-writer race (or any case where `remote.updatedAt` is a number that differs from `expectedUpdatedAt`) will still:
1. Throw `VersionMismatchError` from the adapter.
2. Bypass the self-heal (only triggers on undefined remote).
3. Dispatch `DRAIN_VERSION_MISMATCH` → state goes to `'conflict'` → `SyncIndicator` shows `"Conflict — review"`.

And **`'conflict'` is sticky** until either:
- `DRAIN_OK` fires (requires `remaining === 0` — which requires the failed row to be removed or transitioned away from `'failed'`). The failed row sits there until the user clicks the SyncIndicator pill.
- `engine.resolveConflict(localId, choice)` is called (would dispatch `CONFLICT_RESOLVED` → `'dirty'`). With the modal disabled, only `discardFailedOutboxRows` / `retryFailedOutboxRows` (via the indicator's `'failed'` path) can act on the row — **but the indicator's click handler when `state==='conflict'` is `resolveConflictHandler`, which falls back to `reconciliation.openModal`** (`SyncIndicator.tsx:144, 163-164`). With the modal disabled, clicking does NOTHING visible. The conflict pill cannot be cleared from the UI without DevTools.
- A subsequent successful drain that exhausts the outbox. But the failed row is blocked (line 212: `failed` ⇒ `blockedDocs`), so a later edit to the same doc cannot drain — it sits behind the failed one. Edits to OTHER docs CAN drain, and once they do `DRAIN_OK` fires only if `remaining === 0`. The failed row is still in the outbox → `remaining > 0` → no `DRAIN_OK` → state stays `'conflict'`.

**Net effect with the modal disabled:** a real two-writer conflict leaves the indicator stuck at `"Conflict — review"`, the click does nothing, the failed row blocks any further edit to that doc from draining, and edits to OTHER docs flow but never advance the indicator out of `'conflict'`. This is the behavior the user reported — the modal "being disabled" doesn't prevent the FSM from entering `'conflict'`; it only prevents the UI affordance that would let them escape it.

(Note: clicking the indicator in `'failed'` state would call `retryFailedOutboxRows` which resets the row to pending with `attempts=0` — but that path is gated on `state === 'failed'`, not `'conflict'` (`SyncIndicator.tsx:162-164`). The two states are visually similar but get different click handlers.)

---

## TraceD: SW reload mid-edit

User is typing a cell value, no blur or commit yet.

1. New SW is installed in the background (Serwist precaches `__SW_MANIFEST` and calls `skipWaiting` per `sw.ts:33`). On activation, `clientsClaim` (sw.ts:34) takes control of all open clients.
2. The new SW's claim fires `controllerchange` on `navigator.serviceWorker` in the page.
3. `firebase.ts:157` listener fires. Logs "waiting for sync drain before reload". Calls `await whenEngineIdle(10_000)`.
4. `whenEngineIdle` reads `useSyncStatus.getState()`:
   - `state` is whatever the engine last reported — likely `'idle'` if there were no in-flight edits, or `'saving'`/`'dirty'`/`'offline'`/`'failed'`/`'conflict'` otherwise.
   - `queued` = `db.outbox.count()` at last store push.
   - **The unblurred TextCell draft is React local state only — it is NOT in Dexie and NOT in the outbox.** `useSyncStatus` has zero visibility into it.
5. If currently `'idle'` with `queued === 0`: resolves synchronously (init.ts:264). If not: subscribe + 10s timer; race.
6. Once resolved (either outcome), `window.location.reload()` fires.
7. Reload destroys the React tree, including the draft state in `<textarea>`/`<input>`. The new page mounts fresh: hydrator runs, snapshot listener subscribes, but the typed-but-unblurred text is gone.

**Yes, the in-progress text is lost.** `whenEngineIdle` only protects what's already in the outbox. The cell has no `beforeunload`-driven blur, no auto-flush on `pagehide`, no `localStorage` draft snapshot. The closest defense in the current code is the SW's 10s wait, but it gates only on committed work.

---

## Verification footer

- **Files opened:**
  - `src/lib/sync/state-machine.ts`
  - `src/lib/sync/engine.ts`
  - `src/lib/sync/init.ts`
  - `src/lib/sync/snapshot-listener.ts`
  - `src/lib/sync/firestore-adapter.ts`
  - `src/lib/sync/cross-tab-lock.ts`
  - `src/lib/sync/store.ts`
  - `src/lib/sync/cleanup.ts`
  - `src/lib/sync/edit-log.ts`
  - `src/lib/firebase.ts`
  - `src/app/sw.ts`
  - `src/lib/local/types.ts`
  - `src/lib/local/schema.ts`
  - `src/lib/local/write.ts`
  - `src/components/setlist/grid/SetlistGridHydrator.tsx`
  - `src/components/setlist/grid/SyncIndicator.tsx`
  - `src/components/setlist/grid/ReconciliationProvider.tsx`
  - `src/components/setlist/grid/SetlistGrid.tsx` (excerpted around `commitTrackPatchImpl`)
  - `src/components/setlist/grid/cells/TextCell.tsx` (excerpted around `commit`/`onBlur`)
- **Greps run with patterns:**
  - `commitTrackPatch|notifyEditCommitted`
  - `onBlur|blur|onCommit` in `src/components/setlist/grid`
  - file listing under `src/lib/sync/`
- **Confirmed directly:**
  - All transition rows in the state-machine table — by reading the pure `transition()` function.
  - The self-heal regex `/remote=undefined/` matches T1.3's exact precondition-error format (`init.ts:71`).
  - `'conflict'` is reached only via `DRAIN_VERSION_MISMATCH` (engine.ts:414); `'idle'` is reached only via `DRAIN_OK` (state-machine.ts:46-47); `DRAIN_OK` is gated on `remaining === 0` (engine.ts:343-345).
  - Modal `open` is hardcoded false via `hasConflict = false` (`ReconciliationProvider.tsx:242`).
  - `SyncIndicator`'s click handler at `state==='conflict'` calls `resolveConflictHandler` (`SyncIndicator.tsx:163-164`), which falls back to the now-no-op `openModal`.
  - `retryFailedOutboxRows` is the default for `state==='failed'` (`SyncIndicator.tsx:154-157`), not `'conflict'`.
  - Per-doc serialization treats `'failed'` as `blockedDocs` (`engine.ts:212`).
  - `'sending'` reset runs only at `engine.start()` (`engine.ts:111-121`).
  - SW config in `sw.ts`: `skipWaiting: true, clientsClaim: true`, `navigationPreload` dropped.
  - `controllerchange` handler imports `whenEngineIdle` dynamically and calls it with 10_000ms timeout (`firebase.ts:163-164`).
  - `whenEngineIdle` reads the Zustand store, not the engine, and resolves on `state==='idle' && queued===0` (`init.ts:255-281`).
  - TextCell's `commit()` only runs from `onBlur`, Enter, or arrow-key handlers (`TextCell.tsx:78-143`); no `beforeunload` or visibility-change flush.
  - Lazy-hydration cascade now writes `trackCount` in the same setlist update as `hydrated:true` (commit `5601726`; `SetlistGridHydrator.tsx:255-271`).
  - Engine writeback no longer clears tombstones on delete-commit success (commit `6cd2c4e`; engine.ts:261-271 comment block — there is no `tombstones.delete` in the writeback tx).
  - Snapshot-listener still clears tombstones on `'removed'` deliveries (`snapshot-listener.ts:261`).
- **Inferred (not verified by running):**
  - That `<SyncEngineBoot/>` is mounted somewhere up-tree of the editor (the singleton `bootEngineOnce` requires it). Not searched for the mount site; based on init.ts:296-304 structure.
  - That a user mid-typing has not yet blurred — relies on TextCell's read of `commit` being only on blur / Enter / arrow keys. If a parent re-render unmounts the cell mid-edit, `onCommit` is not called (no unmount-time commit logic was found).
  - That React local state of a `<textarea>` is destroyed by `window.location.reload()`. Standard browser behavior; not exercised in code.
