# A — Write path and multi-writer consistency (setlists + tracks)

Read-only investigation, 2026-11-03. Lens: every writer of `setlists/{id}` and `tracks/{id}`, how
each one handles concurrency, and why the Nov 6 setlist (`77d140d9-…`) ended up with server orders
0–9, 11–13, 16–19, 21, 23, 24. Line numbers are against `master` at the time of writing.

## 0. Summary

There are three writer families with incompatible consistency models:

| Writer | Unit of write | Atomic over | Concurrency control | Bumps `version`? |
|---|---|---|---|---|
| Browser editor (Dexie outbox → client SDK) | one row, one field-patch | one doc | `expectedUpdatedAt` per row (optional; creates have none) | **no** |
| MCP (`server-tracks-write.ts`, tools) | whole setlist op | setlist doc + every touched row (Admin tx) | `lastSeenVersion` on setlist/track (optional) | yes, setlist + rows |
| Perform live reorder (`/api/setlist/reorder`) | whole order | setlist + every row (Admin tx) | setlist `version`, exact-permutation check | yes |

The browser turns one user action (drag, duplicate, insert) into N independent row writes that commit
one at a time, with a per-document barrier and no setlist-level barrier, version or atomicity. The
server writers do whole-setlist transactions gated on a version that the browser never bumps.
Each side's guard is blind to the other's writes, or misfires on them. The incident is what you get
when the two models run at the same time. It is structural, not a one-off bug.

## 1. Inventory of writers

### 1a. Browser editor (local-first outbox)
- **Entry:** `applyEdit` `src/lib/local/write.ts:97-258`. Each call does one Dexie tx: the entity
  `put`/`delete`, one outbox row and a tombstone (`:131-186`), then nudges the engine (`:222`).
- **Callers that fan out one user action into N applyEdits** (all `Promise.all`, each its own
  outbox row, no group id):
  - Drag reorder desktop `SetlistGrid.tsx:1452-1505`, mobile `MobileCardList.tsx:240-262`. Orders
    come from `computeReorderUpdates` `SetlistGrid.tsx:944-962`: **the index in the LOCAL list**.
    That list includes rows that never reached the server, and ghost rows the server has already
    removed.
  - Duplicate row `SetlistGrid.tsx:1297-1370`: N `+1` cascade updates, then one `set`. The clone is
    `{...source}`, so it also copies `version`/`lastModified*` from the source row.
  - Bulk delete `:1232-1270`, undo/redo composites `:917-928`.
  - Perform Live Director insert `src/lib/live-director.ts:114-191`: N bumps without
    `expectedUpdatedAt` (pure LWW), then `set`, then a seed `update`.
  - Lazy-hydration fan-out `SetlistGridHydrator.tsx:312-347`: a `set` (full replace) of every SSR
    row whenever `initialSetlist.hydrated !== true`, then a setlist update gated on the SSR
    `updatedAt`. MCP/template/clone creates stamp `hydrated:true`
    (`mcp/tools/setlist-write.ts:246`, `templates.ts:1178`, `clone-setlist.ts:263`,
    `setlist-write.ts:164`). Any other creator re-runs this on every editor mount and overwrites
    server rows with a stale SSR copy, `version` field included.
  - Add-at-end: `handlePickSong`/`handleCreateFreeText`/`handleAddTrackOfType` `:1512-1610` use
    `order = rows.length` (local count).
- **Engine:** `src/lib/sync/engine.ts`.
  - Per-doc ordering: only the oldest row per `(collection, docId)` drains, and a doc with a
    `failed`/`sending` row is blocked (`:207-223`). **No per-setlist barrier.** Rows of one drag
    drain independently, in sequence (`:241-348`), one network round trip each. Receivers see every
    intermediate order (the ~300 ms bursts in STATE.md).
  - Errors (`:360-542`): VersionMismatch → `failed` (terminal, needs the modal); RemoteDocMissing →
    `failed` (terminal); Auth → one refresh + retry, then `failed`; Network → back to pending;
    anything else (including Firestore `invalid-argument`, `failed-precondition` and
    `resource-exhausted`) → 5 backoff attempts (0.5–8 s, ~15 s total), then `failed` (dead letter).
  - After a commit it writes the server `updatedAt` back and re-stamps pending rows that carry a
    precondition (`:272-331`, fix e6b91fb0).
  - The AuthError retry success path (`:455-458`) deletes the outbox row **without** the updatedAt
    writeback, so the next edit of that row carries a stale precondition.
- **Adapter:** `ProductionFirestoreAdapter.commitOutboxRow` `src/lib/sync/init.ts:109-271`.
  - `set` = `setDoc` full replace + `serverTimestamp()` (`:125-128`). No transaction, no
    precondition, does not bump `version`. Then `reconcileSetlistTrackCount` (`:135-146`).
  - `update` = `runTransaction` read + precondition check + `tx.update` (`:157-193`). It bumps
    `updatedAt` and **not** `version`. A missing doc gives `RemoteDocMissingError` (`:161-169`).
  - `delete` = `getDoc` + `deleteDoc`, **unconditional**: the `expectedUpdatedAt` the grid passes
    (`SetlistGrid.tsx:1184-1189`) is ignored (`:215-242`).
- **Side write:** `reconcileSetlistTrackCount` `src/lib/sync/track-count-sync.ts:61-103` recounts
  the server's tracks and `updateDoc`s the setlist (`trackCount`, `songCount`, `fileIds`) without
  `updatedAt` or `version`. Failures are swallowed. Its "race safety" claim (`:58-59`, serial
  outbox under a cross-tab lock) holds for one browser only. With MCP or a second device writing,
  it can write a count that is already stale.
- **Setlist doc from the browser:** `SetlistMetaEditSheet.tsx:205` (`update`, precondition), the
  hydrator `hydrated:true` (`:339-347`). Nothing in the browser bumps setlist `version`.
- **bind-row:** `/api/liturgy/bind-row` `route.ts:61-90` fires straight after a title applyEdit
  (`SetlistGrid.tsx:795-803`), before the outbox has drained. For a new row the server doc does not
  exist yet (404). The Admin `trackRef.update` does not bump `updatedAt`, so it is invisible to the
  browser's guards and listener (the listener keys on `updatedAt`).

### 1b. MCP (server, Admin SDK)
- `addTrack` `server-tracks-write.ts:253-353`: one tx reads the setlist and **all** tracks, sorts
  by order then id, inserts, and **renumbers every row whose order changes** (`:329-339`), each with
  `version+1` and a new `updatedAt`. It also bumps the setlist `version`/`updatedAt` (`:342-348`).
  No version gate on add.
- `reorderTracks` `:360-449`: setlist-version gate (optional) plus an exact-permutation check
  (`:401-424`). Rewrites every row's `order`.
- `updateTrack` (`:538-…`, position moves renumber at `:868`), `bulkUpdateTracks` (`:1042`, all
  or nothing on stale), `bulkAddTracks` (`:1639`), `removeTrack` (`:2013`, compacts at `:2111`),
  `propose-changes` commit (`tools/propose-changes.ts:417-674`).
- Every structural MCP op **compacts**: it reassigns 0..n-1 across the whole list and bumps
  `updatedAt` on every row it moves.

### 1c. Perform live reorder
- Client `live-reorder-client.ts:16-64` → `POST /api/setlist/reorder`
  `src/app/api/setlist/reorder/route.ts` → `reorderSetlist` (MCP setlist-write) → `reorderTracks`
  with `lastSeenVersion`. A stale version gives a 409 with the server order, and the client
  re-applies the intended move (`live-reorder.ts` `reapplyMove`/`rebaseOnServerOrder`;
  `SetlistPerformClient.tsx:417-520`). **This is the only writer whose conflict handling is
  intent-based. It is the model to copy.**

## 2. Q1 — interleavings that break

Notation: B = browser editor, M = MCP, P = Perform reorder.

1. **Half-applied reorder (B alone, or B+B).** A drag of k rows is k outbox rows that commit
   independently (`engine.ts:241`). Readers see k intermediate states. If any one row goes `failed`
   (conflict, dead letter, missing doc), the other k−1 are already on the server. There is no
   rollback and no group, and the undo entry is local only. → **gaps or duplicate `order`.**
2. **Orders computed over rows the server does not have (B).** `computeReorderUpdates` assigns
   `order = local index` (`SetlistGrid.tsx:956-961`). If the local list has rows that never landed
   (failed or pending creates), or ghosts (deleted on the server but still in Dexie, since nothing
   prunes them: STATE.md, `snapshot-listener.ts` only deletes on a `removed` delivery), the
   siblings are renumbered around phantom slots. The siblings commit, and the phantom's own `order`
   update either sits behind its failed `set` (per-doc barrier) or fails with RemoteDocMissing
   (`init.ts:161-169`). → **exactly the incident signature: gaps at the phantom indices, with the
   renumbers around them saved.**
3. **Lost update, B vs M.** M `addTrack`/`removeTrack` compacts and bumps `updatedAt` on every
   moved row. B's queued order and cell updates carry the pre-M `updatedAt` and fail
   VersionMismatch (`init.ts:182-188`) → `failed` → that doc is blocked. B's updates without a
   precondition (Live Director bumps `live-director.ts:131-138`; new-row seeds) **silently
   overwrite** M's compaction. One drag can produce some of each.
4. **M and P cannot see B.** B never bumps `version`, so an M `reorder_setlist`/`update_track`
   with `lastSeenVersion`, or a P reorder, passes its gate even though B changed rows in between.
   The gate only orders writers that bump `version`. P's exact-permutation check rejects outright
   while B has an unlanded create or a ghost in P's list (`server-tracks-write.ts:401-424`).
5. **Interleaved compaction.** B is mid-burst (rows 3..9 renumbered, 10..15 still queued) when M
   adds a row. M reads the half-renumbered set, sorts by order then id (duplicates are possible
   mid-burst) and compacts. Then B's remaining rows land with indices computed against the
   pre-M list. → **duplicate orders, or a row moving to the wrong place**, with no conflict raised
   (or a conflict only on rows whose preconditions happened to be set).
6. **B `set` regresses a row.** A full-replace `setDoc` (undo of a delete, the duplicate clone,
   the lazy-hydration fan-out) writes a stale snapshot over newer server fields, `version`
   included, with no precondition (`init.ts:125-128`). Undo of a delete restores the old `order`
   into a list that has since been compacted.
7. **Rows created locally but never on the server.** Any terminal failure of a `set` leaves the
   Dexie row (visible to the author only). Every later edit of it queues behind the failed row.
   The snapshot listener skips that doc while any outbox row exists (`snapshot-listener.ts:301-312`),
   so the author's view never converges.
8. **Permanent "Saving".** See §2a.
9. **The other author sees nothing live.** The production tracks listener queries
   `where('setlistId','==',id)` with **no `orgId` filter** (`snapshot-listener.ts:176-179`). Since
   caacfb34 (2026-10-13, phase 9) `tracks` list requires `atLeast(listOrg(),'pe')`
   (`firestore.rules:293`). A rule cannot prove that from a setlistId filter, so the query is
   denied for every non-`po` account. The error is only warn-logged and sent to Sentry
   (`snapshot-listener.ts:418-428`). The commit said "the three readers scope by tenant", and this
   was a fourth. **David (band_leader) gets no live track updates in the editor. Daniel (if
   `po`) does.** This matches "David did not see Daniel's edits". It also means David's Dexie never
   prunes or refreshes, which feeds interleavings 2–5 from his side.

### 2a. Where "saving" comes from and when it never ends
- The indicator reads `useSyncStatus.state` (`SyncIndicator.tsx`). The store is set only by
  `engine.notify` (`store.ts`).
- The FSM (`state-machine.ts:27-70`): `DRAIN_STARTED` → `saving`, and **only `DRAIN_OK` leaves it**.
  `DRAIN_OK` fires only when `outbox.count() === 0` (`engine.ts:232-235`, `:351-354`).
- So once **any** row anywhere in the outbox is `failed` (any setlist; the engine is global), the
  next edit's drain moves state `failed/conflict → saving` (`DRAIN_STARTED` beats the earlier state),
  the drain succeeds, `count` is still ≥ 1, and **`saving` spins forever**. It also hides the
  conflict: the modal opens only when `state === 'conflict'` (`ReconciliationProvider.tsx:244`).
  The user is left with a spinner, no modal, and a blocked doc.
- A second spin source: a tab that does not hold the cross-tab lock never drains or notifies.
  `pump` returns at `engine.ts:183` with no `notify`, and the lock holder never releases after
  draining (`cross-tab-lock.ts` `release` is only called on shutdown). An editor tab behind another
  tab of the same browser shows whatever state it last had.

### 2b. Which match the incident
- **Gaps 10/14/15/20/22 with the neighbours saved** = interleaving 2 (plus 1). It needs 5 rows in
  Daniel's local list that the server lacks. Two indistinguishable-from-code causes, which the
  outbox `lastError` tells apart:
  (a) **failed creates**: `set` dead-lettered or auth-failed; the following `order` update is
  blocked behind it;
  (b) **ghost rows**: deleted or compacted away on the server, still in Dexie; their `order` update
  fails with "This setlist isn't on the server…" (RemoteDocMissing).
- **Permanent "saving"** = §2a, triggered by the very failures in (a) or (b).
- **David's list jumping** = interleaving 1 (k serial commits are visible) on whichever surface he
  had: Perform refetch, or the editor on reload.
- **David not seeing Daniel's edits** = interleaving 9.
- **"Weird things saved or didn't"** = interleavings 3 and 5 (MCP add at 18:09:25 compacted and
  re-stamped every moved row; Daniel's later bursts at 18:15/18:20/18:26 were a mix of
  precondition-failed and precondition-free rows).
- Evidence to pull: Daniel's Dexie `outbox` rows (`status`, `op`, `lastError`, `attempts`); Sentry
  `feature: dead-letter`, `site: remote-doc-missing`, `site: tracks-subscribe` events for this
  setlist id and David's uid.

## 3. Q2 — why a create can fail while sibling updates succeed

- **Different code paths.** A create is `setDoc` (write pipeline, acked by the server, no
  precondition). An update is `runTransaction` (`init.ts:113-128` vs `:157-193`). Their failure
  classes differ. A create's only rules gates are `setlistId` non-empty, `bl` on the stamped
  tenant, and `orgId == setlistOrgOf(setlistId)` (`firestore.rules:294-299`). An update checks
  `trackOrg(resource.data)`. A create whose `orgId` stamp disagrees with the parent's stored orgId
  (stamp from a stale Dexie parent via `withTrackOrg` `write.ts:67-84`, `rowOrg` default) is denied
  as permission-denied → AuthError → `failed` (`engine.ts:449-485`), while updates of existing rows
  pass. Firestore `invalid-argument` (an `undefined` field anywhere in a `set` payload;
  `ignoreUndefinedProperties` is not set in `src/lib/firebase.ts:165-176`) becomes a generic
  TransientError → 5 attempts → dead letter. The current grid create payloads do not include
  `undefined`, but the duplicate and undo paths spread arbitrary Dexie rows (`{...source}`,
  `{...prevDoc}`), so nothing enforces this.
- **The barrier is per doc, not per setlist** (`engine.ts:207-223`). A failed create blocks only its
  own doc (its later order and seed updates). Siblings are different docs and keep draining. Nothing
  says "these k rows are one action".
- **trackCount side write** is swallowed (`track-count-sync.ts:97-102`), so it cannot fail a create.
  It is not the cause. It can write a stale count across devices.
- **Ghost alternative** (not a create at all): RemoteDocMissing on the order update of a row the
  server no longer has. Terminal, no retry (`engine.ts:429-447`).
- I cannot tell from code alone which of these hit Daniel's five rows. The outbox `lastError`
  string tells them apart directly.

## 4. Q3 — is it structural? Yes

The model: the client computes the setlist order from its own copy, writes it as N independent
row patches with optional per-row LWW guards, and has no setlist-level version or atomicity. It
competes with server writers that use whole-setlist transactions and versions the client never
bumps. Every fix below patched a symptom of that mismatch.

**History.** This clone is shallow (`--is-shallow-repository` = true), so `git log -- src/lib/sync
src/lib/local` shows only 6 commits, back to 2026-09-24. Two of them are fixes in this exact area:
e6b91fb0 (2026-10-30, false "Remote changes detected": the precondition re-stamp was wrong and the
counts moved to the server), and caacfb34 (2026-10-13), which *introduced* interleaving 9. Comment
archaeology in `src/lib/sync/*`, `src/lib/local/*`, `SetlistGrid.tsx`, `SetlistGridHydrator.tsx`
and `ReconciliationProvider.tsx` shows **~45 distinct fix or phase markers**. The patches to the
consistency model:

| Marker | What it patched |
|---|---|
| T1.2 (2026-05-12) | pump never woke after an edit (`write.ts:214-222`) |
| T1.3 (2026-05-12) | precondition skipped when the remote had no stamp (`init.ts:43-74`) |
| P0 legacy-stamp self-heal (2026-05-12) | VersionMismatch on unstamped docs (`engine.ts:396-417`) |
| Bug 2 fix (2026-05-12) ×6 | deleted rows resurrected by hydrator/listener → tombstones |
| Resurrection fix (2026-05-12) | tombstones kept forever (`engine.ts:261-271`) |
| T1.4, T2.4 (2026-05-12) | conflict labelling; reload mid-flush |
| v5h-01-02 fix (B)/(F) | listener/hydrator clobbering local edits → outbox and undefined-updatedAt guards |
| v5h3-01-03 fix | phantom VersionMismatch on rapid same-doc edits → re-stamp |
| v51-h01 | phantom docs → RemoteDocMissing terminal |
| v50-07-05 | save-loss bug from a cache-vs-fresh race (memory: harness missed it) |
| v60-13-06 | hydrator re-render clobbering mid-edit text → content hash |
| Cycle-9 Lane B | trackCount drift from client writers |
| e6b91fb0 (2026-10-30) | re-stamp producing false conflicts after MCP writes; client counts removed |
| engine.ts:550-553 | endless pump loop behind a failed row |

Eight fixes on 2026-05-12 alone. The pattern recurs: each guard (tombstone, outbox-pending skip,
undefined-updatedAt skip, re-stamp, self-heal) protects local intent by **refusing server truth**,
and each refusal makes a new way for the two copies to diverge without converging.

## 5. Q4 — candidate target architectures

Constraints for all three: R11-b (only an explicit author action changes order); Overlays reads
track `order` and setlist `tracks[]` through `setlist_reader`, so `order` must keep being written
on each track doc; both tenants share rules and the server writers; Perform on the iPads must keep
working offline from cache.

### A. Server-authoritative setlist ops (recommended)
Every *structural* mutation (add, insert, duplicate, move, delete, bulk) from any surface becomes
one op against the server writers that already exist and are tested (`addTrack`, `reorderTracks`,
`removeTrack`, `bulkAddTracks`, `updateTrack`), run as one Admin transaction gated on the setlist
`version`. Ops are **intent-based** ("move row X to after row Y", "insert after Y"), so on a stale
version the server or client re-applies the intent to the fresh order. Perform live reorder
already does this (`reapplyMove`). The browser keeps an optimistic overlay: pending ops are applied
on top of the last server snapshot, and dropped or rebased when the snapshot arrives. Dexie becomes
a cache that the server snapshot **replaces**, pruning included. Cell edits (title, key, notes) can
stay on the per-row outbox but should go through the server too, or at least bump the row
`version`.
- **Cost:** medium. Add a `POST /api/setlists/{id}/ops` route, rewire about 8 grid/Live Director
  call sites, write an outbox op type that replays intents, and fix the FSM. Server logic largely
  exists.
- **Migration risk:** low to medium. No data migration. The rules can later deny client writes of
  `order` and client track creates. That rules change hits both tenants, so it needs emulator
  tests for both.
- **Tenants:** the server writers are already tenant-scoped (`loadEditableSetlist`/`assertEditor`).
  One writer path means one place to keep tenant-safe.
- **Offline:** structural ops queue as intents and replay on reconnect. Offline structural editing
  stays possible but conflicts resolve by intent, not by a modal.

### B. Single ordering document (whole-order writes)
The order lives in one place: `setlists/{id}.trackOrder: string[]` or `setlists/{id}/meta/order`.
Every move is one doc write with a precondition on its version. Track docs keep a denormalised
`order`, written by the server (a trigger or the same tx) for Overlays, `today.json` and the
service sheet.
- **Cost:** high. Every reader of `order` (Perform, `server-tracks.ts`, `client-tracks.ts`,
  today.json, service sheet, Overlays) needs to agree on one source, and membership (create or
  delete) must be atomic with the order array, so creates still need a transaction.
- **Migration risk:** high. Backfill the order array from current rows (duplicates and gaps exist
  in prod), and two sources of truth exist until the switch.
- **Tenants:** the new doc needs rules for both tenants. Overlays contract unchanged only if the
  denormalised `order` stays exact.

### C. Keep the client writer, make it transactional (minimum structural change)
The outbox unit becomes a **user action** (a group of row patches), committed with a client
`runTransaction` that reads the setlist and all its tracks, checks that the action's id set matches
the server (the permutation check, as in `reorderTracks`), checks the setlist `version`, and writes
all rows plus `version+1` atomically. The barrier moves to per-setlist. The FSM is fixed (failed
stays failed, and saving clears when nothing is pending). The listener query gets an `orgId` filter
and the snapshot prunes Dexie.
- **Cost:** low to medium. Mostly engine, adapter and FSM work, and grid callers pass a group id.
- **Migration risk:** medium. A client transaction that reads every track per action is heavier on
  iPads and fails offline (it queues). Two writer implementations, client and server, must keep the
  same ordering rules forever. That duplication is what produced e6b91fb0.
- **Tenants:** client track reads in the tx need the orgId-filtered query (the rules require it).
  The rules can require `version` increments on track writes.

**Recommendation:** A. It removes the second consistency model instead of reconciling it, it reuses
code that is already transactional and versioned, and Perform already proves the intent-replay
pattern on the band's iPads. Independent of the choice, three defects should be fixed first because
they make every model look broken:
1. `orgId` on the listener query (`snapshot-listener.ts:176-179`).
2. FSM: `saving` must not override `failed`/`conflict`, and "done" must mean no *pending* rows, not
   `count === 0` (`state-machine.ts:43-47`, `engine.ts:232-235`).
3. Prune Dexie rows absent from a server snapshot.
