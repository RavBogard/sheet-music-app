# Collab Pivot — Y.js Integration Design

**Phase D deliverable.** Research only — no source changes. Verified against HEAD
`9fb45b5a185b13e134d23a764aa1b01dc1e9972a`.

## Locked decisions (recap)

These are inputs to this document, not topics for re-litigation:

- **Library:** self-hosted Y.js (MIT, mature). Not Liveblocks.
- **Migration:** one-shot, ASAP. The user is effectively the sole active
  editor; bulk conversion is acceptable. No lazy / gradual hydration code
  path.
- **Offline-first:** non-negotiable. Must match or exceed the existing
  outbox engine: survive tab-close, force-quit, 24h-offline, multi-tab.
- **Presence:** deferred to v2. Awareness/cursors come later via the
  `y-protocols/awareness` channel (cheap to add; not on the v1 critical
  path).

---

## D.1 — Why Y.js (sanity check)

**Defense.** Verified at the docs and ecosystem level:

- Y.js is the most battle-tested JS CRDT library; used by Notion-clones,
  Evernote, JupyterLab Real-Time-Collab, AFFiNE. MIT, no SaaS coupling.
  *(Source: https://github.com/yjs/yjs — Verified)*
- Y.js's design is "pluggable network/persistence." `y-indexeddb` is the
  reference offline persister; multiple Firestore providers exist
  (`@gmcfall/yjs-firestore-provider`, `y-fire`) demonstrating the pattern
  is well-trodden but **not standardized** — there is no first-party Y.js
  Firestore adapter. *(Inferred — both community packages exist; neither
  is in the `yjs` org)*
- The two community providers' designs converge: persist Y.js binary
  updates as Firestore docs, batch on a debounce, compact periodically.
  We will design our own thin adapter rather than depend on either —
  `@gmcfall/yjs-firestore-provider` has very low maintenance activity,
  `y-fire` couples Firestore with WebRTC which we don't want for v1.

**Reasons to push back (and why we don't).**

- **CRDT-tax on payload size.** Every Y.Doc carries its operation history
  (or a state vector + delta) which is larger than today's plain
  Firestore docs. Mitigated by compaction (see D.3). Open: we should
  measure on a real setlist (say 50 tracks, 2 months of edits) before
  committing.
- **Y.js doesn't natively model "intent" deletes the way our tombstones
  do across persistence layers.** Within a single Y.Doc, deleting a Y.Map
  entry IS a first-class CRDT op — no ambiguity, no resurrection. Across
  doc-lifetime boundaries (e.g., garbage-collecting old setlists) we
  still need a tombstone-equivalent at the doc-set level. *(Open —
  designed in D.6.)*
- **No real-time relay.** Firestore-only means latency = a Firestore
  write round-trip per debounce window (~300–800ms typical, more on
  slow connections). For "Google-Docs-like" real-time feel we'd want a
  y-websocket relay later. v1 accepts the Firestore-relay latency.

**Verdict:** the locked choice holds. Proceed.

---

## D.2 — Data model audit

Read from `src/lib/local/types.ts` (Verified at HEAD) and `src/types/models.ts`
(Verified). Note: there are TWO shapes — `LocalSetlist`/`LocalTrack` (IDB,
flat row model) and `Setlist`/`SetlistTrack` (legacy embedded-tracks
Firestore model). The system is mid-migration from embedded → top-level
tracks (`v50-07-03 hybrid lazy hydration`, see `LocalSetlist.hydrated`).
**The pivot moots this migration** — the Y.Doc per setlist owns track
order natively; we drop the legacy embedded shape outright as part of D.4.

### Setlist fields → Y.Doc representation

Anchor: `LocalSetlist` (`src/lib/local/types.ts:6-17`), `Setlist`
(`src/types/models.ts:67-90`).

| Field | Type | Current merge | Proposed Y.js shape | Rationale / edge cases |
|---|---|---|---|---|
| `id` | string | immutable | top-level Y.Doc identity (not stored in CRDT) | the docId is the join key; lives outside the CRDT body |
| `name` | string | LWW (full-row) | `Y.Text` | user types a title; concurrent typing should merge char-by-char. Cheap. |
| `date` / `eventDate` | timestamp | LWW | atomic field on root `Y.Map`, LWW-Register semantics (Y.Map values are LWW-Register by clock; this is fine — date isn't co-edited) | edge: two devices changing event date simultaneously — last write wins, acceptable |
| `updatedAt` | number | server-stamped | **drop from CRDT body**; derive from latest applied update's logical clock or store as a denormalized atomic for legacy listing screens | the LWW precondition system goes away (D.6) |
| `ownerId` | string | atomic | atomic on root Y.Map | rarely changes; LWW fine |
| `ownerName`, `rabbi` | string | atomic | atomic on root Y.Map | rarely concurrent; LWW fine |
| `serviceNotes` | string | LWW (full-row) | `Y.Text` | likely co-edited prose; wants char merge |
| `musicians[]` | array of `SetlistMusician` | LWW (full-row) | `Y.Array<Y.Map>` | items have identity (email); reorder is rare; add/remove is set-like. Y.Array gives concurrent add/remove without lost items. |
| `templateType`, `isTemplate` | enum/bool | atomic | atomic on root Y.Map | LWW fine |
| `transferredAt`, `previousOwnerId` | atomic | LWW | atomic on root Y.Map | one-shot writes |
| `assignedUids[]` | string[] | LWW | `Y.Array<string>` | concurrent assignment writes should merge as set-union; Y.Array preserves additions from both sides |
| `hydrated` | bool | atomic | **delete** — legacy migration marker, mooted by D.4 | — |
| `tracks` | embedded array (legacy) OR top-level docs (post-hydration) | LWW per-row + outbox per-row | **`Y.Array<Y.Map>`** as `setlistDoc.getArray('tracks')` | single source of truth post-pivot. Order is the array index; concurrent insert/delete/move are CRDT-native. |

### Track fields → Y.Map inside `tracks` Y.Array

Anchor: `LocalTrack` (`src/lib/local/types.ts:19-36`), `SetlistTrack`
(`src/types/models.ts:36-57`).

Each track is a `Y.Map` inside the setlist's `tracks: Y.Array<Y.Map>`.
Track `id` is the Y.Map's own `id` field (string) — but **position is the
Y.Array index**, not the legacy numeric `order` field.

| Field | Type | Current merge | Proposed Y.js shape | Rationale / edge cases |
|---|---|---|---|---|
| `id` | string | immutable | atomic on Y.Map | stable identity across moves |
| `setlistId` | string | immutable | **drop** — parent Y.Doc IS the setlist; redundant | — |
| `order` | number | LWW per-row | **drop** — Y.Array index replaces it | concurrent reorder is Y.Array's job (intent: move item X before item Y) |
| `title` | string | LWW (full-row) | `Y.Text` | user-typed; wants char merge during co-edit |
| `key` | string | LWW | atomic | concurrent picks of different keys → LWW; acceptable |
| `bpm` | number | LWW | atomic | LWW fine |
| `tune`, `notes` | string | LWW | `Y.Text` for `notes` (longer prose); atomic for `tune` | `notes` is the most likely co-edit hotspot; `tune` is a short tag |
| `leadMusician` | string | LWW | atomic | LWW fine |
| `type` | enum | LWW | atomic | LWW fine |
| `duration`, `estimatedMinutes` | string/number | LWW | atomic | LWW fine |
| `transposition` | number | LWW | atomic | per-track integer; LWW fine |
| `fileId`, `fileName` | string | LWW | atomic | binding is an "either it's bound or it's not" choice; concurrent binds → LWW |
| `audioFileId`, `audioFileName` | string | LWW | atomic | same |
| `referenceLink` | string | LWW | atomic | one URL; LWW fine |
| `description`, `performer` | string | LWW | `Y.Text` for `description` (responsive-reading body); atomic for `performer` | `description` is the long-prose field for liturgy items |
| `songId` | string | LWW | atomic | binding |
| `pageNumber` | number | LWW | atomic | LWW fine |
| `updatedAt` | number | server-stamped | **drop** — Y.js owns version | — |

### Cross-cutting edge cases

1. **Delete-vs-edit on same track.** Y.js semantics: if A deletes the
   Y.Map from the array while B edits a Y.Text inside the same Y.Map,
   the delete wins (the array op subsumes the inner edits). This matches
   user intent: deletion is final. *(Source: Y.js docs — Y.Array
   ops; Verified-via-docs)*
2. **Reorder concurrency.** Y.Array uses an RGA-like algorithm: two
   concurrent moves both apply, with consistent eventual order across
   replicas. Worst case is "interleaving" of bulk-insert ops, which is
   not a concern here (users insert one row at a time). *(Inferred from
   Y.js Y.Array semantics)*
3. **Songs library** (`LocalSong`, `src/lib/local/types.ts:52-63`) is a
   separate per-user write-mostly table. **Out of scope for v1 collab
   pivot** — keep songs on the existing LWW+outbox path. Songs don't
   collaborate; one user owns their own song-defaults.
4. **Edit log** (`LocalEditLog`, `src/lib/local/types.ts:166-187`) is
   instrumentation only — stays as-is. Its breadcrumbs will need new
   source values (`yjs-apply`, `yjs-flush`) but the table itself
   survives.

---

## D.3 — Network adapter design

### Y.Doc topology

**One root Y.Doc per setlist.** Not per-track. Rationale:

- Y.js sub-documents exist but add complexity; per-track doesn't buy us
  anything because every track edit already shares the parent setlist
  context (reorder, add, delete).
- Per-setlist Y.Doc bounds the doc size. A setlist is at most ~50 tracks;
  the doc history will be small.
- Setlists are independent — no cross-setlist concurrent edits to merge.

### Persistence layers

Three tiers, each with a clear role:

1. **In-memory `Y.Doc`** — authoritative live state. Edits mutate it
   synchronously; UI reads via Y.js observers (replacing today's
   `useLiveQuery(db.tracks...)`).
2. **`y-indexeddb`** — local durability. Every Y.js update is persisted
   to IndexedDB **synchronously on apply** (within the
   microtask). Also handles cross-tab sync via BroadcastChannel
   automatically. *(Source: https://docs.yjs.dev/ecosystem/database-provider/y-indexeddb
   — Verified)*
3. **Firestore custom adapter (`y-firestore-adapter`, our own)** —
   durability + cross-device sync. Pushes Y.js binary updates to
   Firestore; subscribes to remote updates and applies them locally.

### Firestore wire format

The right shape based on Firestore's pricing and limits:

```
/yjs_setlists/{setlistId}                       // doc
  state:        bytes (Y.encodeStateAsUpdate snapshot, base64)
  stateVector:  bytes (Y.encodeStateVector, base64)
  snapshotAt:   serverTimestamp
  ownerId:      string                          // for security rules
  schemaVersion: number                         // for future upgrades

/yjs_setlists/{setlistId}/updates/{autoId}      // subcollection
  update:       bytes (raw Y.js update, base64)
  clientId:     string                          // for ack / dedupe
  createdAt:    serverTimestamp
```

**Why subcollection-of-updates + snapshot on the parent:**

- Firestore single-doc writes are atomic and cheap; appending a Y.js
  update is one `addDoc` call to the subcollection.
- The parent doc holds the most recent compacted snapshot + state
  vector, so cold-start clients can:
  1. Read the parent (one round trip).
  2. Apply the snapshot to a fresh Y.Doc.
  3. Read updates created after `snapshotAt` (server-filtered query).
  4. Apply them.
- Avoids the alternative "single Firestore doc with `updates: array`"
  pattern: arrays in Firestore have a 1MB doc-size ceiling, and array
  appends cost a full doc rewrite. Subcollection grows unbounded with
  cheap appends. *(Verified via Firestore docs: 1 MiB per-doc limit.)*

### Real-time fan-out

`onSnapshot()` on the `updates/` subcollection (filtered by
`createdAt > lastSeenAt`) gives us cross-device push delivery for free.
Same primitive as today's `snapshot-listener.ts:119-143`. Each delivered
update goes straight to `Y.applyUpdate(doc, update)`.

**Echo suppression.** Y.js updates carry a `clientID`. When our local
write hits Firestore and then the snapshot listener delivers it back,
we tag updates with our own `clientID` so we can skip already-applied
updates. (Y.applyUpdate is idempotent against already-applied state
vectors anyway, but skipping avoids the work and the re-render.)

### Batching, debounce, latency

Local edit → IDB persist: synchronous (within microtask).
Local edit → Firestore visible: ~300–800ms (debounce 250ms + write 200–500ms).

The community providers (`@gmcfall/yjs-firestore-provider`) merge updates
into a composite blob and flush every 20 ops or 600ms. We adopt the
same pattern with a 250ms debounce + 50-op cap. *(Source: Yjs Community
discussion — @gmcfall provider design notes; Verified)*

**Echo latency (single-device round trip):** local → Firestore →
snapshot → re-apply = ~600ms. Not visible to the user (their UI already
reflects the local mutation).

**Fan-out latency (other device receives):** Firestore-side latency
~250–800ms for `onSnapshot` fan-out under normal conditions.
*(Inferred from Firestore docs; the existing `snapshot-listener.ts`
ships with the same characteristic.)*

### Compaction

The updates subcollection grows monotonically. Compaction runs server-
side on a schedule OR client-side opportunistically (when a leader-tab
notices the subcollection has > N updates):

1. Read all updates with `createdAt > parent.snapshotAt`.
2. Apply them to a Y.Doc seeded from the current snapshot.
3. In one `writeBatch`:
   - Update the parent: `state = encodeStateAsUpdate(doc)`,
     `stateVector = encodeStateVector(doc)`,
     `snapshotAt = serverTimestamp`.
   - Delete all updates with `createdAt < newSnapshotAt`.
4. New clients now bootstrap from the smaller snapshot.

**Threshold.** Compact when subcollection > 100 docs OR > 7 days since
last compaction, whichever first. Concrete numbers chosen for an
expected per-user write volume of <50 edits/day on the busiest setlist.

**Race-safety.** Compaction in a Firestore `runTransaction` so a
mid-compact arriving update either lands before the transaction
snapshot (gets absorbed) or after (gets a `createdAt > newSnapshotAt`).
*(Inferred — needs a small test harness in implementation phase.)*

### APIs we use

- `firebase/firestore` `doc`, `collection`, `addDoc`, `onSnapshot`,
  `writeBatch`, `runTransaction`, `query`, `where`, `orderBy`.
- `yjs`: `Y.Doc`, `Y.applyUpdate`, `Y.encodeStateAsUpdate`,
  `Y.encodeStateVector`, `Y.encodeStateAsUpdateV2`. The V2 encoder is
  ~30% smaller; recommended for Firestore-stored payloads.
  *(Source: https://docs.yjs.dev/api/encoding-and-decoding; Verified)*
- `y-indexeddb`: `IndexeddbPersistence`. Handles BroadcastChannel
  cross-tab sync automatically. *(Verified)*

---

## D.4 — One-shot migration mechanics

### Location

`scripts/migrate-to-yjs.ts` — a standalone Node script using the Firebase
Admin SDK. NOT a Next.js route (avoids accidental browser-context
limits; Admin SDK has full read of all setlists; no client-side
auth-rule surface area).

### Algorithm

```
For each setlist S in /setlists:
  If S.schemaVersion === 'yjs-v1':
    skip (already migrated)
  Read tracks for S:
    if S.hydrated:
      read /tracks where setlistId == S.id
    else:
      use S.tracks[] embedded array
  Construct Y.Doc D:
    root = D.getMap('root')
    root.set('name', new Y.Text().insert(0, S.name))
    root.set('serviceNotes', new Y.Text().insert(0, S.serviceNotes ?? ''))
    root.set('ownerId', S.ownerId)
    root.set('eventDate', S.eventDate)
    root.set('rabbi', S.rabbi)
    root.set('templateType', S.templateType)
    root.set('isTemplate', S.isTemplate)
    root.set('musicians', toYArray(S.musicians))
    root.set('assignedUids', toYArray(S.assignedUids))
    tracks = D.getArray('tracks')
    for t in sortBy(rawTracks, order):
      m = new Y.Map()
      m.set('id', t.id)
      m.set('title', new Y.Text().insert(0, t.title ?? ''))
      m.set('notes', new Y.Text().insert(0, t.notes ?? ''))
      m.set('description', new Y.Text().insert(0, t.description ?? ''))
      m.set(<atomic-field>, t.<atomic-field>)  // for each
      tracks.push([m])
  state = Y.encodeStateAsUpdateV2(D)
  stateVector = Y.encodeStateVectorV2(D)
  In a Firestore batch:
    Write /yjs_setlists/{S.id} with { state, stateVector, snapshotAt, ownerId, schemaVersion: 'yjs-v1' }
    Mark /setlists/{S.id} with { migratedToYjs: true, migratedAt: serverTimestamp }
```

### Idempotency

The `if (S.schemaVersion === 'yjs-v1')` guard on the source side (and
the existence-of-`/yjs_setlists/{id}` check on the destination side)
makes reruns safe. Marking the source doc `migratedToYjs: true` lets
post-migration code paths read the marker rather than racing the
new collection.

### Verification

Post-run checks (also in the script, gated behind `--verify`):

1. Count parity: `count(/setlists) === count(/yjs_setlists)`.
2. Per-setlist: load the new Y.Doc, walk it, compare every field
   against the source. Log diffs to `migration-report.json`.
3. Spot-check N=10 random setlists by hydrating both old and new shapes
   in a node script and `deepEqual`-comparing the normalized JSON.

### Rollback

Source `/setlists` and `/tracks` collections are **never deleted** by
this script. Rollback = flip a feature flag (`useYjsForSetlists: false`)
in Remote Config or a `meta/flags` doc; the app reads from the legacy
collections again. We keep the legacy data live for at least 30 days
post-cutover. After that, a separate cleanup script archives them
to a `legacy_setlists/` collection (still readable for audit) before
deletion.

### What we DON'T migrate

- Songs (`/songs` per-user — out of scope, see D.2).
- Setlist permissions (`assignedUids` is copied; security rules are
  re-applied on the new `/yjs_setlists` collection — needs Rules
  rewrite, scoped in D.6 risk register).

---

## D.5 — Offline-first preservation

Goal: every guarantee the current outbox engine provides must hold post-
pivot. Mapping each guarantee:

### G1: User edits offline → reload → edits still there

- **Today:** `applyEdit` writes the entity + an outbox row in one Dexie
  tx (`src/lib/local/write.ts:98-153`, Verified). On reload, `useLiveQuery`
  reads the Dexie row; the outbox row will drain when online.
- **Post-pivot:** Each edit applies to the `Y.Doc` synchronously. The
  `IndexeddbPersistence` adapter writes the resulting update to IDB
  in the same microtask via Y.js's update observer. On reload, the
  IDB persister rehydrates the Y.Doc before the UI mounts; UI sees
  the edits. *(Source: https://docs.yjs.dev/ecosystem/database-provider/y-indexeddb
  — Verified)*
- **Verdict:** equivalent.

### G2: Edit offline → force-quit → reopen 24h later → reconnect → updates flush

- **Today:** outbox rows are persistent in Dexie. On next mount,
  `SyncEngine.start()` orphans-sweep + pump (`engine.ts:105-147`, Verified).
- **Post-pivot:** IDB-persisted updates load → Y.Doc is fully resurrected.
  The Firestore adapter computes the diff between local state vector and
  remote state vector (one read of `/yjs_setlists/{id}.stateVector`),
  encodes the unsent updates as a single update, writes to the
  subcollection. Same durability surface, simpler diffing.
- **Verdict:** equivalent, with fewer moving parts (no per-edit outbox
  rows to drain in order — just one diff write).

### G3: Multi-tab editing the same setlist on the same device

- **Today:** `CrossTabLock` BroadcastChannel-based single-leader for the
  engine pump (`src/lib/sync/cross-tab-lock.ts`, Verified). Only one tab
  pushes to Firestore.
- **Post-pivot:** `y-indexeddb` automatically syncs Y.Doc state between
  tabs via BroadcastChannel — both tabs see each other's edits in real
  time even before they reach Firestore. *(Verified — y-indexeddb README
  explicitly documents this behavior.)*
- **Multi-tab Firestore push:** without coordination, both tabs could
  push updates simultaneously. Y.js makes this safe (updates are
  commutative — order of arrival doesn't matter for correctness), but
  it's wasteful (2× the Firestore writes). **Recommendation:** keep
  `CrossTabLock`. Only the leader tab runs the Firestore push path.
  Non-leader tabs still update their local Y.Doc and y-indexeddb
  observers replicate to the leader's tab, which then pushes.
- **Verdict:** equivalent + simpler within-device coordination. Cross-
  tab lock survives for the Firestore-push role only.

### G4: Sync state machine simplifies

- **Today:** `idle | dirty | saving | conflict | failed | offline`
  (`src/lib/sync/state-machine.ts:6-13`, Verified).
- **Post-pivot:** `synced | unsynced | offline`. No conflict state
  because Y.js merges automatically. No failed state because Y.js
  updates can't get rejected for a precondition mismatch (no
  preconditions). `unsynced` means "we have local updates not yet
  acked by Firestore."
- **Verdict:** simpler. UI surface: SyncIndicator drops the action
  buttons (no "Failed — retry", no reconciliation modal trigger).

---

## D.6 — Engine pivot scope

This is the hard part. Verified against `src/lib/sync/` at HEAD.

### What gets retired (deleted)

| File | LoC (approx) | Retire? | Why |
|---|---|---|---|
| `src/lib/sync/engine.ts` | 578 | **Delete** | The outbox-pump is replaced by Y.js's own update observer + Firestore adapter. No per-row state machine; no `'sending'` rows; no backoff loop. |
| `src/lib/sync/cleanup.ts` | 124 | **Delete** | No failed outbox rows exist. No `retryFailedOutboxRows` / `discardFailedOutboxRows` needed. |
| `src/lib/sync/snapshot-listener.ts` | 387 | **Delete** | Replaced by `onSnapshot` inside the new Y.js Firestore adapter, dramatically simpler (no tombstone guard, no LWW guard, no outbox-pending guard — all moot). |
| `src/lib/sync/firestore-adapter.ts` | 91 | **Delete** | Adapter interface served the outbox; no equivalent needed. New Y.js adapter has a different shape. |
| `ReconciliationProvider.tsx` (referenced in PREEXISTING-ISSUES) | — | **Delete** | No `VersionMismatchError`, no modal. |

### What gets dramatically simplified

| File | Current role | Post-pivot role |
|---|---|---|
| `src/lib/sync/state-machine.ts` | 6-state FSM | 3-state FSM (`synced \| unsynced \| offline`). Smaller pure function, easier tests. |
| `src/lib/local/write.ts` | `applyEdit` writes entity + outbox + tombstone in one Dexie tx (Verified at `:98-153`) | Replaced by `applyEdit` that mutates the Y.Doc. y-indexeddb handles persistence. The undo-snapshot logic (`:78-90, :181-214`) survives — undo is independent of CRDT semantics (undo = restore prevDoc) and Y.js has its own `UndoManager` we should adopt. |
| `src/lib/sync/edit-log.ts` | Breadcrumb table | Survives unchanged. Source values gain `'yjs-apply'` / `'yjs-flush'`. |
| `src/lib/sync/init.ts` | Engine bootstrap | Becomes Y.Doc + adapter bootstrap per open setlist. |
| `src/lib/sync/cross-tab-lock.ts` | Single-leader for outbox pump | Single-leader for Firestore push role (see G3 in D.5). Kept. |

### What gets replaced (new modules)

- `src/lib/yjs/setlist-doc.ts` — factory: given a `setlistId`, return a
  `{ doc: Y.Doc, ready: Promise<void>, destroy: () => void }`. Wires
  `IndexeddbPersistence` and the Firestore adapter.
- `src/lib/yjs/firestore-adapter.ts` — push/pull updates; debounce;
  echo-suppress by clientID; trigger compaction when threshold crossed.
- `src/lib/yjs/compactor.ts` — runs the snapshot-replace-updates
  transaction described in D.3.
- `src/lib/yjs/hooks/useSetlistDoc.ts` + `useTracks.ts` — React hooks
  replacing today's `useLiveQuery` callsites. Subscribe to Y.Doc
  observers; expose plain JS data for components.

### The big question: does the outbox itself survive?

**No.** The current outbox solves "what if I edit while offline?" by
queueing patches as discrete operations. Y.js solves the same problem
differently: edits ARE the operations (Y.js binary updates), and they
live in IndexedDB via `y-indexeddb` until the Firestore adapter flushes
them. The two are not stackable — both are durability layers for
unsynced local mutations. One must own durability, and Y.js's update
log is the more powerful representation (because it supports CRDT
merge, which the outbox patches cannot).

**However:** we should add a thin "unflushed updates" buffer at the
adapter level. Not for durability (y-indexeddb already handles that)
but for **batching**: the adapter accumulates Y.js updates from the
doc observer, debounces 250ms, and flushes the merged update as one
Firestore write. This is what `@gmcfall/yjs-firestore-provider` does.

So: **outbox-as-durability**: deleted. **Outbox-as-batch-buffer**: re-
emerges in a new shape inside `yjs/firestore-adapter.ts`, as an
in-memory `Uint8Array[]` flushed on debounce. No Dexie table needed.

### Tombstones

`src/lib/local/types.ts:106-114` and `:65-114` — Tombstones exist
because the outbox can lose a delete (auto-resolve / dead-letter / user-
discard) and the snapshot listener would otherwise resurrect the row.

**Post-pivot:** within a Y.Doc, deletes are first-class CRDT ops; no
resurrection is possible. **Across setlists** (deleting an entire
setlist), we still need a tombstone-equivalent — the parent collection
listener could "resurrect" a setlist doc. Options:

1. Mark `/yjs_setlists/{id}` with `deleted: true` rather than physically
   deleting it; clients filter on the flag (soft delete).
2. Keep a `/yjs_tombstones/{setlistId}` lightweight collection.
3. Use Firestore security rules to prevent re-creation by the same
   owner. (Out of scope.)

**Recommendation:** option 1. Soft-deletes are cheap and natural in
Firestore; they integrate with the existing audit-trail pattern.

### Net engine LoC change

Approximate (Verified by file `wc -l`):

- **Deleted:** engine.ts (578) + snapshot-listener.ts (387) + cleanup.ts
  (124) + firestore-adapter.ts (91) + ReconciliationProvider (~300) =
  ~1,480 LoC.
- **Added:** new yjs/ module ~600 LoC + simplified state-machine ~30
  LoC + simplified write.ts ~100 LoC = ~730 LoC.
- **Net:** ~750 fewer LoC in the sync substrate. (Inferred — actual
  numbers will depend on implementation discipline.)

---

## D.7 — Interaction map: PREEXISTING-ISSUES post-pivot

Walking `PREEXISTING-ISSUES-2026-05-12.md` (Verified at HEAD).

### Section A (test failures)

- **A.1, A.2, A.3** — *Survives.* Test harness gaps are independent of
  the sync architecture. Need fixing regardless.

### Section B (TypeScript debt)

- **B.1 jest-axe types** — *Survives.*
- **B.2 implicit any in test files** — *Survives.*
- **B.3 @tanstack/react-table** — *Survives.*
- **B.4 service worker types** — *Survives.*

### Section C (code smells)

- **C.1 `_shutdownRecoveryScheduled` mislabel** — *Survives.* Firebase
  IDB recovery is orthogonal to sync.
- **C.2 dead `isMobile`** — *Survives.* UI cleanup.
- **C.3 ChartBindPopover possibly dead** — *Survives.*
- **C.4 `subscribeToSetlist` vestigial** — *Reshapes.* The legacy
  service subscription becomes definitively dead post-pivot (the new
  path is the Y.js Firestore adapter). Confirms removal.
- **C.5 hardcoded 3s SW reload** — *Reshapes.* The "wait for engine
  drain" recommendation becomes "wait for adapter's pending-flush queue
  to drain" — same intent, different primitive.
- **C.6 auto IDB-wipe destroys outbox?** — *Moots* the outbox question;
  *Reshapes* into "auto-wipe destroys y-indexeddb?". Same risk class:
  the recovery handler must whitelist the Y.js persistence DB names
  the same way it should whitelist `crc-local` today.
- **C.7 "Saved · just now" not implemented** — *Reshapes.* SyncIndicator
  states simplify (synced/unsynced/offline). The "just now" relative
  time is still a valid UX feature on the synced state.
- **C.8 silent auto-resolution** — *Moots.* No reconciliation flow.
- **C.9 'mine'-default contradiction** — *Moots.* No reconciliation.
- **C.10 disabled vs aria-disabled** — *Survives.* Cosmetic.

### Section D (architectural)

- **D.1 no tombstone TTL prune** — *Moots.* Tombstone table goes away
  (see D.6).
- **D.2 `clearFailedOutboxRows` deprecated alias** — *Moots.* Entire
  cleanup module goes away.
- **D.3 cross-device conflicts now require user click** — *Moots.* The
  whole problem space disappears.
- **D.4 dirty vs saving indistinguishable** — *Moots.* Two-state UI is
  unambiguous.
- **D.5 long-press 500ms** — *Survives.* UX-only.

### Section E (manual verification checklist)

The checklist's items 4 (delete + offline + reload survives) and 5–9
(conflict modal flows) need to be REWRITTEN post-pivot. The "delete +
offline + reload" test is still valid as a Y.js durability check.
Conflict-modal items are deleted from the checklist entirely.

### Section G (open architectural questions)

- **G.1 tombstone TTL** — moot.
- **G.2 modal deferral** — moot.
- **G.3 ChartBindPopover migration** — survives, independent.
- **G.4 clearFirestoreIndexedDB destroys outbox?** — reshapes (see C.6).
- **G.5 `_shutdownRecoveryScheduled` semantics** — survives.

### Summary

- **Moots:** C.8, C.9, D.1, D.2, D.3, D.4, G.1, G.2 — entire conflict /
  outbox-failure / LWW-state-machine surface.
- **Reshapes:** C.4, C.5, C.6, C.7, G.4 — same problem area, fix
  changes shape.
- **Survives:** everything in A, B, C.1-C.3, C.10, D.5, G.3, G.5 —
  unchanged.

This is the dependency analysis Phase A flagged: the pivot legitimately
eliminates ~8 of the ~25 enumerated issues. The fix plan should
sequence those last so they aren't fixed-then-deleted.

---

## D.8 — Risk register

### Performance: Y.Doc history growth

- **Risk:** without compaction, the updates subcollection grows
  unbounded; cold-start reads become slow.
- **Mitigation:** scheduled compaction (D.3). Compact at 100 updates or
  7 days.
- **Open:** measure on real load. Need a benchmark with 1000 simulated
  edits before confirming the threshold.

### Firestore cost

- **Risk:** today's design batches text edits into a debounced full-row
  patch (~1 write/2s during typing). Y.js updates are smaller but more
  frequent; if naive, this could 10x the write volume.
- **Mitigation:** adapter-level 250ms debounce + 50-op cap mirrors the
  community providers' tuning. Net cost should be similar to current,
  within 2x.
- **Open:** need a Firebase Console cost-projection run after the
  benchmark.

### One-shot migration risk

- **Risk:** bulk script writes wrong data; rolling back means replaying
  a month of edits.
- **Mitigation:** dry-run mode that writes to `/yjs_setlists_staging/`
  and runs the verification pass before flipping the feature flag.
  Legacy collections preserved for 30 days post-cutover (D.4).
- **Open:** decide whether to gate the cutover on a specific time
  window (e.g., the user not actively editing).

### Multi-tab race on the Firestore adapter

- **Risk:** `y-firestore-adapter` is not as battle-tested as
  `y-websocket`. Two tabs racing the adapter could double-push.
- **Mitigation:** the existing `CrossTabLock` (D.5 G3) gates the
  Firestore push path to a single tab. Local Y.Doc mutations flow via
  y-indexeddb's BroadcastChannel to all tabs.
- **Open:** harness test for this — two tabs editing same setlist, kill
  leader, verify follower takes over within 5s lease window.

### Browser compatibility

- **Risk:** Y.js encodes ops with binary `Uint8Array`; depends on
  stable Array iteration + structured-clone semantics for
  BroadcastChannel transport.
- **Verified:** Y.js targets ES2015+; supports all evergreen browsers
  and recent Safari. Project's iPad floor (per ARCHITECTURE.md §1.1)
  is Safari 14+; Y.js + y-indexeddb works there. *(Source:
  https://github.com/yjs/yjs README; Verified)*

### Firestore Security Rules surface change

- **Risk:** new `/yjs_setlists` collection needs rules rewrite. Current
  rules for `/setlists` enforce `ownerId == request.auth.uid ||
  request.auth.uid in resource.data.assignedUids`. Y.js updates
  subcollection needs `allow create: ownerId/assignedUids` and
  `allow delete: ownerId only` (for compaction).
- **Open:** the rules update is non-trivial; needs its own design pass.

### Awareness deferral cost

- **Risk:** if we defer presence to v2, the v1 adapter must be
  forward-compatible.
- **Mitigation:** the `awareness` protocol is independent of the doc
  sync protocol. Adding it later is purely additive — no schema change,
  no adapter rewrite. *(Source: y-protocols/awareness docs; Verified)*

---

## D.9 — Recommended sequencing

Five phases. Each ships behind a feature flag (`useYjsForSetlists`)
and can be reverted by flipping the flag.

### Phase 1 — Yjs primitives + benchmark (1 week)

- Add `yjs`, `y-indexeddb` deps.
- Build `src/lib/yjs/setlist-doc.ts` skeleton (no Firestore yet).
- Build a Node-side benchmark script: simulate 1000 edits on a 50-track
  setlist; measure resulting doc size pre/post compaction and write
  count.
- **Exit criterion:** benchmark numbers in hand; doc-size envelope
  confirmed acceptable.

### Phase 2 — Firestore adapter (1–2 weeks)

- Build `src/lib/yjs/firestore-adapter.ts` (push/pull, echo suppress,
  debounce).
- Build `src/lib/yjs/compactor.ts`.
- Write security rules for `/yjs_setlists/*`.
- Unit tests for adapter: cold start, mid-session join, compaction
  race, multi-tab leader handoff.
- **Exit criterion:** two-device co-edit demo working in dev.

### Phase 3 — Migration script + dry run (1 week)

- Build `scripts/migrate-to-yjs.ts` with `--dry-run` and `--verify`.
- Run dry-run on production data (writes to `/yjs_setlists_staging/`).
- Verification pass clean.
- **Exit criterion:** verification report shows 0 diffs.

### Phase 4 — UI cutover (2 weeks)

- Replace `useLiveQuery(db.tracks…)` callsites with `useTracks()` (new
  Y.Doc-backed hook).
- Replace `applyEdit` callsites with Y.Doc mutations.
- Delete `ReconciliationProvider` and modal.
- Simplify `SyncIndicator` to 3 states.
- Adopt Y.js `UndoManager` (replacing `undo-store.ts` snapshot model).
- **Exit criterion:** UAT pass on the checklist from PREEXISTING-
  ISSUES section E, rewritten for the new model.

### Phase 5 — Cutover + cleanup (1 week)

- Run real migration: `scripts/migrate-to-yjs.ts` (no dry-run).
- Flip `useYjsForSetlists` flag to `true`.
- Monitor for 7 days.
- Delete `engine.ts`, `snapshot-listener.ts`, `cleanup.ts`,
  `firestore-adapter.ts`, tombstones table (schema bump in Dexie),
  outbox table (schema bump).
- After 30 days: archive legacy `/setlists` to `legacy_setlists/`.

**Total estimate:** ~6–7 weeks of focused engineering. Independent
shipping is possible at each phase boundary — Phase 1 lands without
user impact; Phase 2 ships behind a hidden flag; Phase 3 is read-only;
Phase 4 is the user-visible cutover; Phase 5 is cleanup.

---

## Verification footer

Files cited and verified at HEAD `9fb45b5a185b13e134d23a764aa1b01dc1e9972a`:

- `src/lib/local/types.ts` (full file, 188 lines)
- `src/lib/local/schema.ts` (full file, 99 lines)
- `src/lib/local/write.ts` (full file, 216 lines)
- `src/lib/sync/engine.ts` (full file, 578 lines)
- `src/lib/sync/state-machine.ts` (full file, 91 lines)
- `src/lib/sync/snapshot-listener.ts` (full file, 386 lines)
- `src/lib/sync/firestore-adapter.ts` (full file, 91 lines)
- `src/lib/sync/cross-tab-lock.ts` (full file, 213 lines)
- `src/lib/sync/cleanup.ts` (full file, 124 lines)
- `src/types/models.ts` (full file, 188 lines)
- `PREEXISTING-ISSUES-2026-05-12.md` (full file, 166 lines)
- `RESEARCH-PLAN-2026-05-12.md` (full file, 347 lines)

External sources cited:

- [Y.js — main repo](https://github.com/yjs/yjs)
- [y-indexeddb provider docs](https://docs.yjs.dev/ecosystem/database-provider/y-indexeddb)
- [Y.js encoding API (V2 updates)](https://docs.yjs.dev/api/encoding-and-decoding)
- [@gmcfall/yjs-firestore-provider (community)](https://www.npmjs.com/package/@gmcfall/yjs-firestore-provider)
- [y-fire (community Firestore + WebRTC provider)](https://github.com/podraven/y-fire)
- [Yjs Community — persistence guidance](https://discuss.yjs.dev/t/guidance-on-persistence-storage-and-working-with-databases/994)
- [Yjs Community — best practice multi-tab sync](https://discuss.yjs.dev/t/best-practice-to-sync-across-tabs-windows/903)
- Firestore docs (1 MiB per-doc limit; `runTransaction`, `writeBatch`,
  `onSnapshot` semantics) — referenced but not URL-cited individually.

Claims unverified at writing time (must be resolved before Phase E /
implementation):

- **Concrete latency numbers** (300–800ms Firestore round-trip, 600ms
  echo) are inferred from typical Firestore behavior, not measured on
  this project's deployment. Phase 1 benchmark must produce real
  numbers.
- **Y.Doc size growth** (50 tracks × 2 months edits) needs a benchmark.
  The "doc size acceptable" claim in D.8 is not measured.
- **Compaction transaction race-safety** — the `runTransaction`-based
  compaction is correct in theory; needs a test harness in Phase 2.
- **Multi-tab y-firestore-adapter behavior under leader churn** —
  open (D.8). Needs a Phase 2 test.
- **Firebase Security Rules rewrite** — the new rules for
  `/yjs_setlists/{id}/updates/*` need a careful design pass; not
  drafted here.
- **Songs / awareness scoping** — songs out of scope is recommended,
  not locked. User should confirm.
- The "~750 fewer LoC" net change in D.6 is approximate; real number
  depends on implementation choices.
