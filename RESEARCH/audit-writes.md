# Audit — Writes

Scope: every WRITE path that mutates `setlists/{S}.tracks[]` (embedded array on
the setlist doc) and/or `tracks/{id}` (top-level collection with `setlistId`
field). Git HEAD = `4ee6e70`.

Two indirection layers exist:
- **Sync-engine path** (local-first): `applyEdit` writes a Dexie row + outbox
  row inside one Dexie tx. Engine drains the outbox via
  `ProductionFirestoreAdapter.commitOutboxRow` → Firestore. Engine writes only
  touch the top-level collection identified by `OutboxRow.collection`. Engine
  stamps `updatedAt: serverTimestamp()` on every `set`/`update` commit
  (init.ts:81-91, init.ts:127-129).
- **Direct-Firestore path** (legacy): callers in `setlist-firebase.ts` and
  every Admin SDK API route use `addDoc` / `updateDoc` / `setDoc` /
  `deleteDoc` / `runTransaction` directly. These bypass `applyEdit` entirely
  — no outbox row, no Dexie mirror, no engine writeback.

Direct-path writers touch ONLY `setlists/{S}` (embedded array + scalar fields).
None of them write to the top-level `tracks/{id}` collection.
Engine-path writers (via `applyEdit({ collection: 'tracks' | 'setlists' })`)
touch ONLY the top-level `tracks/{id}` collection (and `setlists/{S}` scalar
fields like `hydrated` / `trackCount`). None of them maintain the embedded
`tracks[]` array.

`use-add-to-setlist.ts` is the only writer that touches BOTH sources (after
commit `4ee6e70`).

---

## Embedded-array writers (`setlists/{S}.tracks[]`)

### W1. `src/lib/setlist-firebase.ts:142-176` — `createSetlistService(...).createSetlist`
- **Trigger**: New setlist creation. Called from
  `src/hooks/use-add-to-setlist.ts:320` (`createNewSetlist`) and
  `src/hooks/use-creation-wizard.ts:209` (wizard create flow, template/scratch
  branch) and `src/hooks/use-setlist-dashboard.ts:252,275,301`
  (dashboard "create from template", blank-create fallback,
  `handleCreateFromTemplate`).
- **Op**: `addDoc` (client SDK)
- **Target**: NEW `setlists/{auto-id}` doc carrying the initial embedded
  `tracks: cleanTracks` array. Does NOT touch `tracks/{id}`.
- **Payload shape**: `{ name, date: serverTimestamp(), updatedAt:
  serverTimestamp(), tracks: cleanTracks, trackCount: tracks.length, ownerId,
  ownerName, ...additionalData }` (line 146-161). `cleanTracks` =
  `stripUndefinedDeep(tracks)` (line 145).
- **Stamps updatedAt?**: Yes on `setlists/{S}` (line 155 — explicit
  `serverTimestamp()`). No `tracks/{id}` doc is created.
- **Concurrency**: None. `addDoc` is fire-and-forget; no precondition (doc
  is new).
- **Side effects**: Writes `trackCount: tracks.length` (line 157). Writes
  audit row `logSetlistChange(docRef.id, 'created', ...)` (line 162). On
  failure, captures `captureSyncFailure` (line 167) and re-throws.
- **Bypass**: Bypasses `applyEdit` — direct Firestore client SDK.

### W2. `src/lib/setlist-firebase.ts:194-212` — `createSetlistService(...).updateSetlist`
- **Trigger**: Used by `useAddToSetlist.addToSetlist`
  (use-add-to-setlist.ts:180), `useAddToSetlist.addDirectlyToSetlist`
  (use-add-to-setlist.ts:276), and the toast-undo callback
  (use-add-to-setlist.ts:231). Each call passes a fresh `tracks: [...]` array
  to overwrite the embedded array. This is the primary embedded-array
  mutator outside `createSetlist`.
- **Op**: `runTransaction` → `tx.update(ref, {...patch, updatedAt:
  serverTimestamp()})` via `updateSetlistWithVersion`
  (setlist-firebase.ts:45-61).
- **Target**: `setlists/{id}` partial update. When `data.tracks` is in the
  patch, the entire embedded `tracks[]` array is replaced. Does NOT touch
  `tracks/{id}`.
- **Payload shape**: `stripUndefinedDeep(data)` minus any caller-supplied
  `updatedAt` (line 198). Callers typically pass `{ tracks: updatedTracks,
  trackCount: updatedTracks.length }`.
- **Stamps updatedAt?**: Yes on `setlists/{S}` (the helper appends
  `updatedAt: serverTimestamp()`, line 59).
- **Concurrency**: `expectedUpdatedAt` precondition checked inside the
  transaction (line 56-58) — throws `StaleWriteError(remoteUpdatedAt)` on
  mismatch. `null` skips the check.
- **Side effects**: Calls `logSetlistChange(id, action, ...)` post-tx
  (line 205) with `action='tracks_updated'` when `data.tracks` is set.
  Trackcount snapshot included in audit when tracks present.
- **Bypass**: Bypasses `applyEdit`. Direct Firestore client SDK via
  `runTransaction`.

### W3. `src/lib/setlist-firebase.ts:261-281` — `createSetlistService(...).duplicateSetlist`
- **Trigger**: `useSetlistDashboard.handleDuplicate` → calls
  `setlistService.duplicateSetlist(...)` (use-setlist-dashboard.ts:150).
- **Op**: `addDoc`
- **Target**: NEW `setlists/{auto-id}` doc with copy of source's embedded
  `tracks[]` (each track gets a new `id` via `crypto.randomUUID()`, line
  266-269). Does NOT touch `tracks/{id}`.
- **Payload shape**: `{ name: "${name} (Copy)", date: serverTimestamp(),
  tracks: [...remapped ids], trackCount, ownerId, ownerName, copiedFrom }`.
  Note: NO `updatedAt` stamp.
- **Stamps updatedAt?**: NO `updatedAt` field is stamped on the new
  setlist. Diverges from `createSetlist`/`cloneSetlist` which both stamp it
  explicitly. `tracks/{id}` not written.
- **Concurrency**: None (new doc).
- **Side effects**: None beyond the doc creation. No audit log entry.
- **Bypass**: Bypasses `applyEdit`.

### W4. `src/lib/setlist-firebase.ts:381-421` — `createSetlistService(...).cloneSetlist`
- **Trigger**: Wizard clone branch (`use-creation-wizard.ts:185`,
  `service.cloneSetlist(cloneSource, eventDate)`). Also reached via
  `cloneForNextWeek` (W5).
- **Op**: `addDoc`
- **Target**: NEW `setlists/{auto-id}` doc with copy of source's embedded
  `tracks[]` (each track gets a new `id`, line 394-397). Does NOT touch
  `tracks/{id}`.
- **Payload shape**: `{ name, date: Timestamp.fromDate(targetDate),
  eventDate: Timestamp.fromDate(targetDate), updatedAt: serverTimestamp(),
  tracks: [...remapped ids], trackCount, ownerId, ownerName, musicians,
  assignedUids, rabbi?, clonedFrom }`.
- **Stamps updatedAt?**: YES on the new `setlists/{S}` (line 393 — explicit
  `serverTimestamp()`, called out in the comment as a v51-h01 fix to close
  the lazy-hydration race).
- **Concurrency**: None (new doc).
- **Side effects**: `logSetlistChange(docRef.id, 'cloned', ...)` (line
  408). On failure, `captureSyncFailure` with `feature:'write-atomicity',
  site:'cloneSetlist'`.
- **Bypass**: Bypasses `applyEdit`.

### W5. `src/lib/setlist-firebase.ts:426-433` — `createSetlistService(...).cloneForNextWeek`
- **Trigger**: `EmptyState`'s "Make next week's" CTA →
  `useSetlistDashboard.handleCloneForNextWeek` →
  `setlistService.cloneForNextWeek(setlist)`
  (use-setlist-dashboard.ts:164).
- **Op**: delegates to `this.cloneSetlist(...)` (W4).
- **Target**: NEW `setlists/{auto-id}`. Same as W4.
- **Payload shape**: same as W4 with `targetDate = sourceDate + 7d`.
- **Stamps updatedAt?**: YES (inherited from W4).
- **Concurrency**: None.
- **Side effects**: same as W4.
- **Bypass**: Bypasses `applyEdit`.

### W6. `src/lib/setlist-firebase.ts:436-459` — `createSetlistService(...).saveAsTemplate`
- **Trigger**: `useSetlistDashboard.handleSaveAsTemplate` →
  `setlistService.saveAsTemplate(setlist)` (use-setlist-dashboard.ts:177).
- **Op**: `addDoc`
- **Target**: NEW `setlists/{auto-id}` doc with `isTemplate: true,
  templateType: 'other'`. Copy of source's embedded `tracks[]` with remapped
  ids. Does NOT touch `tracks/{id}`.
- **Payload shape**: `{ name, date: serverTimestamp(), tracks: [...remapped
  ids], trackCount, isTemplate: true, templateType: 'other', ownerId,
  ownerName }`. NO `updatedAt` stamp.
- **Stamps updatedAt?**: NO `updatedAt` stamp. Same gap as `duplicateSetlist`.
- **Concurrency**: None (new doc).
- **Side effects**: `logSetlistChange(docRef.id, 'saved_as_template', ...)`
  (line 453).
- **Bypass**: Bypasses `applyEdit`.

### W7. `src/app/api/setlists/import/execute/route.ts:130-144` — POST `/api/setlists/import/execute`
- **Trigger**: Setlist import flow ("Import setlist" UI → parse → execute).
  `band_leader` role required.
- **Op**: Admin SDK `db.collection('setlists').doc(setlistId).set(payload)`
  (line 144).
- **Target**: NEW `setlists/{crypto.randomUUID()}` doc with embedded
  `tracks: resolvedTracks` array (line 138). Each track gets `id:
  crypto.randomUUID()`. Does NOT touch `tracks/{id}`.
- **Payload shape**: `{ id: setlistId, name: setName, date: nowStr,
  eventDate: nowStr, updatedAt: nowStr, tracks: resolvedTracks, trackCount,
  ownerId, ownerName }` where each track is `{ id, type: 'header'|'song',
  title, key?, leadMusician?, referenceLink?, fileId?, fileName? }`.
- **Stamps updatedAt?**: Sets `updatedAt: nowStr` (ISO string) — NOT a
  Firestore Timestamp; the engine's `expectedUpdatedAt.toMillis()` path
  expects a Timestamp, so this string value will not round-trip cleanly
  through the precondition (init.ts:118 reads `remote.updatedAt?.toMillis`).
- **Concurrency**: None (new doc). Setlist id is generated server-side.
- **Side effects**: Also writes new `library_index/{newLibraryId}` docs for
  uploaded charts (line 111) and uploads PDFs to Storage. Not in
  setlist/tracks scope.
- **Bypass**: Server-side Admin SDK — there is no `applyEdit` path on the
  server, by design.

### W8. `src/app/api/setlist/publish/route.ts:103-116` — POST `/api/setlist/publish`
- **Trigger**: Publish setlist action (toolbar button). Owner or
  `band_leader` role.
- **Op**: Admin SDK `setlistRef.update({...})` — fire-once on initial
  publish (line 103-108) OR `setlistRef.update({...})` re-publish (line
  111-115).
- **Target**: `setlists/{setlistId}` partial update — adds `publishedAt`,
  `publishedSnapshot`, `lastNotifiedAt`, `updatedAt`. Does NOT modify
  embedded `tracks[]` or `tracks/{id}`.
- **Payload shape (initial)**: `{ publishedAt:
  FieldValue.serverTimestamp(), publishedSnapshot, lastNotifiedAt:
  FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }`.
  `publishedSnapshot` = `songTracks.map({ title, key, fileId })` — a
  lightweight clone of song-typed embedded tracks (line 97-100). This is a
  READ of the embedded `tracks[]` but a write only to scalar fields.
- **Stamps updatedAt?**: YES on `setlists/{S}` (`updatedAt:
  FieldValue.serverTimestamp()`, line 107 / line 114). Comment at line
  91-96 calls out that the publish intentionally bypasses the
  `expectedUpdatedAt` precondition.
- **Concurrency**: None — intentional. Comment line 91-96 explains that
  publish accepts the race with concurrent edits because it snapshots
  whatever embedded `tracks[]` is on the doc at the moment.
- **Side effects**: Writes `users/{uid}/notifications/{auto}` docs in
  batches (line 140-149), `setlists/{id}/history/{auto}` audit row (line
  279-290), `setlists/{id}/emailEvents/{messageId}` rows (line 308-318),
  `revalidatePath(...)` Next.js cache busts (line 322-325). None of these
  touch the embedded `tracks[]` or `tracks/{id}`.
- **Bypass**: Admin SDK on the server.
- **Embedded-array nuance**: Listed here because the route reads
  `setlist.tracks` to compute `publishedSnapshot` (line 85) and `hasSongs`
  (line 86). If a setlist is lazy-hydrated (top-level `tracks/{id}` is
  source of truth, see SSR fetcher fix in `app/(main)/setlists/[id]/page.tsx`
  comment at line 58-65), `setlist.tracks` here is stale — but the publish
  route does NOT read the top-level collection. Cross-source drift risk:
  publishedSnapshot can omit additions made via the editor path after
  hydration.

### W9. `src/app/api/setlist/rename/route.ts:42-45` — POST `/api/setlist/rename`
- **Trigger**: Rename setlist action. Owner / `band_leader` / admin.
- **Op**: Admin SDK `setlistRef.update({ name, updatedAt: serverTimestamp()
  })`.
- **Target**: `setlists/{setlistId}` — `name` + `updatedAt`. Does NOT touch
  `tracks[]` or `tracks/{id}`.
- **Payload shape**: `{ name, updatedAt: FieldValue.serverTimestamp() }`.
- **Stamps updatedAt?**: YES on `setlists/{S}`.
- **Concurrency**: None.
- **Side effects**: Batch-updates `scheduling_assignments/*` docs where
  `setlistId == id` with `{ setlistName: name }` via `chunkBatchUpdate`
  (line 56). Out of scope for tracks audit.
- **Bypass**: Admin SDK.

### W10. `src/app/api/setlist/transfer/route.ts:37-42` — POST `/api/setlist/transfer`
- **Trigger**: Admin transfer-of-ownership action. Admin role only.
- **Op**: Admin SDK `setlistRef.update({ ownerId, ownerName,
  transferredAt, previousOwnerId })`.
- **Target**: `setlists/{setlistId}` — ownership scalar fields. Does NOT
  touch `tracks[]` or `tracks/{id}`.
- **Payload shape**: `{ ownerId, ownerName, transferredAt:
  new Date().toISOString(), previousOwnerId }`.
- **Stamps updatedAt?**: NO. The transfer route does not bump `updatedAt`
  — this is a gap if the setlist is open in another tab using the
  `expectedUpdatedAt` precondition (would still match local; transfer
  silently flies under the radar).
- **Concurrency**: None.
- **Side effects**: None server-side beyond the doc update.
- **Bypass**: Admin SDK.

### W11. `src/app/api/setlist/delete/route.ts:114` — POST `/api/setlist/delete`
- **Trigger**: User deletes a setlist from the dashboard. Routed via
  `setlistService.deleteSetlist(id)` (setlist-firebase.ts:221, an
  `apiFetch`) → this route. Owner or admin.
- **Op**: Admin SDK `db.recursiveDelete(setlistRef)` (line 114). Also four
  preceding `batchDeleteByField` cascades:
  - `scheduling_assignments` where `setlistId == id` (line 85)
  - `tasks` where `setlistId == id` (line 94)
  - `notifications` collectionGroup where `entityId == id` (line 103)
  - `recursiveDelete(setlistRef)` (line 114) — removes the setlist doc +
    its subcollections (history, emailEvents).
- **Target**: Deletes the `setlists/{setlistId}` doc (which carries
  the embedded `tracks[]` array). Does NOT delete any
  `tracks/{id}` docs in the top-level collection — the route never queries
  the top-level `tracks` collection. Orphaning risk: after this route runs,
  `tracks/{id}` docs with `setlistId == deletedId` stay in Firestore
  forever.
- **Payload shape**: N/A (delete).
- **Stamps updatedAt?**: N/A.
- **Concurrency**: None.
- **Side effects**: Best-effort cascade — failures accumulate into
  `errors[]` and don't halt. Audit log via `logSetlistChange(id,
  'deleted', ...)` happens on the client (setlist-firebase.ts:230) AFTER
  the API call returns OK.
- **Bypass**: Admin SDK.

---

## Top-level writers (`tracks/{id}` collection)

All entries below go through `applyEdit` → outbox → engine →
`ProductionFirestoreAdapter.commitOutboxRow` (init.ts:75-168). Every commit
stamps `updatedAt: serverTimestamp()` on the resulting top-level doc (init.ts
lines 80-83 for set; lines 127-129 for update). For update ops, the engine's
`runTransaction` enforces the `expectedUpdatedAt` precondition via
`checkUpdatePrecondition` (init.ts:65-72, called at init.ts:119).

### W12. `src/components/setlist/grid/SetlistGrid.tsx:1494-1539` — `handlePickSong`
- **Trigger**: User picks a song from `AddBar` (library picker).
- **Op**: `applyEdit({ op:'set', collection:'tracks', doc: {...} })` (line
  1499-1518) + optional follow-up `applyEdit({ op:'update', ... })` (line
  1530-1535) when sticky-memory defaults exist.
- **Target**: Creates NEW `tracks/{newId}` doc. Does NOT touch
  `setlists/{S}.tracks[]`.
- **Payload (set)**: `{ id: newId, setlistId, songId: song.id, fileId:
  song.id, order: rows.length, title: song.title, type: 'song' }`. The
  fileId mirror is the v54-01-02 fix for perform-view clickability.
- **Payload (update, optional)**: `{ key?, leadMusician?, bpm? }` from
  `seedTrackFromSong(song.id)` (sticky-memory).
- **Stamps updatedAt?**: Engine stamps `tracks/{newId}.updatedAt` on
  commit. Engine does NOT stamp `setlists/{S}.updatedAt` — that bump is
  the hydrator's `trackCount` reconciler's responsibility (W22).
- **Concurrency**: Set has no precondition (new doc). Follow-up update
  passes no `expectedUpdatedAt` — comment line 1525-1529 calls out that
  the row was just created locally and the engine writeback will populate
  the stamp.
- **Side effects**: None on `setlists/{S}` directly. The hydrator's
  reconciler (W22) detects the live-count drift and emits a debounced
  `setlists/{S}.trackCount` write.
- **Bypass**: Goes through engine path (applyEdit).

### W13. `src/components/setlist/grid/SetlistGrid.tsx:1541-1558` — `handleCreateFreeText`
- **Trigger**: User commits a free-text track title from `AddBar`.
- **Op**: `applyEdit({ op:'set', collection:'tracks', doc: {...} })`.
- **Target**: NEW `tracks/{newId}`. Does NOT touch `setlists/{S}.tracks[]`.
- **Payload**: `{ id: newId, setlistId, order: rows.length, title,
  type: 'song' }`.
- **Stamps updatedAt?**: Engine stamps `tracks/{newId}.updatedAt`. No
  `setlists/{S}.updatedAt` bump.
- **Concurrency**: None (new doc).
- **Side effects**: Hydrator reconciler picks up the count delta (W22).
- **Bypass**: Engine path.

### W14. `src/components/setlist/grid/SetlistGrid.tsx:1565-1582` — `handleAddTrackOfType`
- **Trigger**: User clicks a non-song chevron tile in `AddBar` (header,
  prayer, reading, sermon, etc).
- **Op**: `applyEdit({ op:'set', collection:'tracks', doc: {...} })`.
- **Target**: NEW `tracks/{newId}`. Does NOT touch `setlists/{S}.tracks[]`.
- **Payload**: `{ id: newId, setlistId, order: rows.length, title: '',
  type }`.
- **Stamps updatedAt?**: Engine stamps `tracks/{newId}.updatedAt`. No
  setlist bump.
- **Concurrency**: None.
- **Side effects**: Hydrator reconciler (W22).
- **Bypass**: Engine path.

### W15. `src/components/setlist/grid/SetlistGrid.tsx:1086-1101` — `handleDeleteRow`
- **Trigger**: Single-row delete (context menu, drag-handle confirm dialog,
  mobile card Delete button).
- **Op**: `applyEdit({ op:'delete', collection:'tracks', docId:
  track.id, expectedUpdatedAt: track.updatedAt })`.
- **Target**: Deletes `tracks/{track.id}`. Does NOT touch
  `setlists/{S}.tracks[]`.
- **Payload**: N/A (delete).
- **Stamps updatedAt?**: N/A (delete; engine commits and returns `{}`,
  init.ts:138-140). No `setlists/{S}.updatedAt` bump.
- **Concurrency**: `expectedUpdatedAt` precondition is enforced inside the
  engine's `runTransaction` for `update` ops; for `delete` the
  `deleteDoc` call (init.ts:138) skips the precondition. So
  `expectedUpdatedAt` is passed but ignored at the Firestore commit step
  for delete ops (verified at init.ts:137-140).
- **Side effects**: Writes a Dexie tombstone in the same tx as the
  applyEdit (write.ts:147-152). Engine does NOT clear the tombstone on
  delete-commit success post-`6cd2c4e` — comment at engine.ts:261-271
  explains this stops the hydrator resurrecting deleted rows from the
  legacy embedded array. Hydrator reconciler (W22) picks up the count
  drop.
- **Bypass**: Engine path.

### W16. `src/components/setlist/grid/SetlistGrid.tsx:1103-1128` — `handleBindChart`
- **Trigger**: User binds a chart to a track (chart-cell popover; centered
  ChartBindDialog from context menu; mobile card).
- **Op**: `applyEdit({ op:'update', collection:'tracks', docId: track.id,
  patch: {...}, expectedUpdatedAt: track.updatedAt })`.
- **Target**: `tracks/{track.id}` partial update.
- **Payload**: `{ songId: sel.songId, fileId: sel.songId, title: sel.title,
  key?, leadMusician?, bpm? }` (defaults merged in from
  `seedTrackFromSong`).
- **Stamps updatedAt?**: Engine stamps `tracks/{id}.updatedAt` on commit.
  No `setlists/{S}.updatedAt` bump.
- **Concurrency**: `expectedUpdatedAt` enforced by engine
  `runTransaction` (init.ts:119).
- **Side effects**: None beyond the patch. No sticky-memory propagation
  here — chart bind is one-way song→track.
- **Bypass**: Engine path.

### W17. `src/components/setlist/grid/SetlistGrid.tsx:1135-1215` — `handleBulkSet`
- **Trigger**: BatchActionBar "Apply" button on a multi-select bulk patch
  (type / key / leadMusician). Note: `BatchActionBar` itself was
  deprecated by the T1.1 fix per comment at SetlistGrid.tsx:1647-1654;
  the handler is still wired but the toolbar is removed. Callsite-dead
  code.
- **Op**: N parallel `applyEdit({ op:'update', collection:'tracks', docId,
  patch, expectedUpdatedAt: t.updatedAt }, { withoutUndo: true })`.
- **Target**: N `tracks/{docId}` partial updates.
- **Payload**: subset of `{ type?, key?, leadMusician? }`.
- **Stamps updatedAt?**: Engine stamps each `tracks/{id}.updatedAt`.
- **Concurrency**: per-row `expectedUpdatedAt`.
- **Side effects**: Sticky-memory propagation
  (`propagateTrackEditToSong`) for each unique songId. Composite undo
  pushed as ONE entry.
- **Bypass**: Engine path.

### W18. `src/components/setlist/grid/SetlistGrid.tsx:1217-1251` — `handleBulkDelete`
- **Trigger**: Bulk-delete from BatchActionBar (also dead per T1.1) OR
  context-menu delete when ≥2 rows are selected (route via
  `handleContextDelete` at line 1358-1370).
- **Op**: N parallel `applyEdit({ op:'delete', collection:'tracks',
  docId, expectedUpdatedAt: t.updatedAt }, { withoutUndo: true })`.
- **Target**: N `tracks/{docId}` deletes.
- **Payload**: N/A.
- **Stamps updatedAt?**: N/A (deletes).
- **Concurrency**: per-row `expectedUpdatedAt` (ignored on delete commit
  step — see W15).
- **Side effects**: Composite undo pushed. Tombstones written per row.
  Selection cleared. Reconciler (W22) detects count drop.
- **Bypass**: Engine path.

### W19. `src/components/setlist/grid/SetlistGrid.tsx:1282-1352` — `handleContextDuplicate`
- **Trigger**: Right-click row → "Duplicate row".
- **Op**: N parallel `applyEdit({ op:'update', ... order bumps,
  expectedUpdatedAt: r.updatedAt })` for rows whose order ≥ newOrder,
  then `applyEdit({ op:'set', collection:'tracks', doc: cloneDoc })` for
  the duplicate.
- **Target**: N `tracks/{id}` updates + 1 new `tracks/{newId}`.
- **Payload (cascade)**: `{ order: r.order + 1 }` per row.
- **Payload (clone)**: `{ ...source, id: newId, order: source.order + 1 }`
  — preserves songId, title, key, bpm, leadMusician, notes, type,
  setlistId.
- **Stamps updatedAt?**: Engine stamps each touched `tracks/{id}`.
  No `setlists/{S}.updatedAt` bump.
- **Concurrency**: per-row `expectedUpdatedAt` on the cascade updates.
  Set has no precondition.
- **Side effects**: Composite undo (one entry: N cascade reverts + 1
  clone delete).
- **Bypass**: Engine path.

### W20. `src/components/setlist/grid/SetlistGrid.tsx:1434-1492` — `handleDragEnd` (desktop SetlistGrid)
- **Trigger**: User drops a row in the desktop @dnd-kit table. (The desktop
  table is currently unmounted per comment at SetlistGrid.tsx:1647-1654 —
  `MobileCardList` is the only render path. Handler is still defined.)
- **Op**: N parallel `applyEdit({ op:'update', collection:'tracks',
  docId, patch: { order }, expectedUpdatedAt: r?.updatedAt }, {
  withoutUndo: true })`.
- **Target**: N `tracks/{docId}` updates (order only).
- **Payload**: `{ order }`.
- **Stamps updatedAt?**: Engine stamps each touched `tracks/{id}`.
  No `setlists/{S}` bump.
- **Concurrency**: per-row `expectedUpdatedAt`.
- **Side effects**: Composite undo (one entry per drag operation).
- **Bypass**: Engine path.

### W21. `src/components/setlist/grid/MobileCardList.tsx:100-153` — `handleDragEnd` (mobile/active path)
- **Trigger**: User drags a card in `MobileCardList` (the active render
  path per the comment in SetlistGrid).
- **Op**: same shape as W20 — N parallel `applyEdit({ op:'update',
  collection:'tracks', docId, patch: { order }, expectedUpdatedAt:
  r?.updatedAt }, { withoutUndo: true })`.
- **Target**: N `tracks/{docId}` updates.
- **Payload**: `{ order }`.
- **Stamps updatedAt?**: Engine stamps each touched `tracks/{id}`. No
  setlist stamp.
- **Concurrency**: per-row `expectedUpdatedAt`.
- **Side effects**: Composite undo pushed.
- **Bypass**: Engine path.

### W22. `src/components/setlist/grid/SetlistGridHydrator.tsx:221-295` — lazy-hydration cascade
- **Trigger**: Mount of `SetlistGridHydrator` when (a) Dexie priming
  finished, (b) `initialSetlist.hydrated !== true`, (c)
  `initialTracks.length > 0`, (d) fire-once ref guard ungated. This is the
  v50-07-03 "Option C Hybrid Lazy Hydration" migration cascade.
- **Op**:
  1. N parallel `applyEdit({ op:'set', collection:'tracks', doc: {...t} }, {
     withoutUndo: true })` — one per `initialTrack`.
  2. Single `applyEdit({ op:'update', collection:'setlists', docId:
     setlistId, patch: { hydrated: true, trackCount: initialTracks.length
     }, expectedUpdatedAt: initialSetlist.updatedAt }, { withoutUndo: true
     })` after the fan-out resolves.
- **Target**: N new `tracks/{t.id}` docs + 1 `setlists/{S}` partial
  update.
- **Payload (tracks)**: `{ ...t }` — passes through whatever shape the SSR
  fetcher built (page.tsx:42-55: `{id, setlistId, order, updatedAt,
  ...legacy fields}`).
- **Payload (setlist update)**: `{ hydrated: true, trackCount:
  initialTracks.length }`. Per `5601726` this is a SINGLE write — the
  earlier version had a separate trackCount reconciler firing on the
  debounce that raced the `hydrated:true` write and bumped the setlist
  past `initialSetlist.updatedAt` between the two writes, triggering
  VersionMismatchError on the cascade's second write.
- **Stamps updatedAt?**: Engine stamps each new `tracks/{id}.updatedAt`
  and the `setlists/{S}.updatedAt`.
- **Concurrency**: Tracks: no precondition (set ops). Setlist update:
  `expectedUpdatedAt: initialSetlist.updatedAt`. If the precondition
  fails, the per-`b0e7033` self-heal retries once with
  `expectedUpdatedAt: undefined`.
- **Side effects**: Sets `hydrated: true` flag on `setlists/{S}` so the
  cascade is idempotent across mounts. Sets `trackCount` to match the
  initial fan-out. Seeds `lastWrittenCountRef.current` to prevent the
  reconciler from firing immediately (line 271). On overall failure,
  warn-logs + captures `feature:'lazy-hydration'` to Sentry.
- **Bypass**: Engine path.

### W23. `src/components/setlist/grid/SetlistGridHydrator.tsx:343-370` — trackCount reconciler
- **Trigger**: `useLiveQuery` on `getDb().tracks.where('setlistId')...count()`
  drifts from `lastWrittenCountRef.current ?? initialSetlist.trackCount`.
  Debounced 800ms. Active after hydration === 'done'.
- **Op**: `applyEdit({ op:'update', collection:'setlists', docId:
  setlistId, patch: { trackCount: liveTrackCount } })`. NO
  `expectedUpdatedAt` passed.
- **Target**: `setlists/{S}` partial update.
- **Payload**: `{ trackCount: liveTrackCount }`.
- **Stamps updatedAt?**: Engine stamps `setlists/{S}.updatedAt` on commit.
- **Concurrency**: NONE — passes no `expectedUpdatedAt`. The post-debounce
  re-check (line 352) only compares against
  `lastWrittenCountRef.current`. Multiple tabs can race here.
- **Side effects**: Updates `lastWrittenCountRef.current` to the value
  just written. This is the single coupling between track CRUD and the
  setlist's denormalized count (per the v54-01-03 design).
- **Bypass**: Engine path.

### W24. `src/hooks/use-add-to-setlist.ts:24-51` — `mirrorTracksToTopLevel` (in `addToSetlist` and `addDirectlyToSetlist`)
- **Trigger**: After `setlistService.updateSetlist(...)` succeeds in
  `addToSetlist` (use-add-to-setlist.ts:189-193) or
  `addDirectlyToSetlist` (use-add-to-setlist.ts:282-286). This is the
  `4ee6e70` P0 fix.
- **Op**: N parallel `applyEdit({ op:'set', collection:'tracks', doc: {...}
  }, { withoutUndo: true })` — one per new track.
- **Target**: N new `tracks/{t.id}` docs. (The embedded array was already
  written in the same flow by W2.)
- **Payload**: `{ id: t.id, setlistId, songId: t.fileId, fileId: t.fileId,
  order: startOrder + i, title: t.title, type: 'song', key?, notes? }`.
- **Stamps updatedAt?**: Engine stamps each `tracks/{id}.updatedAt`. The
  preceding W2 already stamped `setlists/{S}.updatedAt` via
  `updateSetlistWithVersion`.
- **Concurrency**: None (set ops).
- **Side effects**: Wrapped in `try/catch` that `console.warn`s and
  swallows on failure (use-add-to-setlist.ts:191-193 / 284-286), per the
  comment at lines 11-23: "the embedded-array write already toasted
  success; the top-level mirror runs via applyEdit which queues an outbox
  row and drains when the engine pumps."
- **Bypass**: Engine path — but layered on top of a direct-Firestore
  write (W2).

### W25. `src/components/setlist/grid/SetlistGrid.tsx:836-869` — undo/redo `executeEntry`
- **Trigger**: Cmd-Z / Cmd-Shift-Z (or Ctrl variants) hit while
  `SetlistGrid` is focused (handler at SetlistGrid.tsx:978-1028). Pops
  `useUndoStore.getState().popUndo()` or `popRedo()`.
- **Op**: Builds an `EditDescriptor` via `buildInverse` (line 756-787) or
  `buildRedo` (line 789-820) — produces a `set` / `update` / `delete`
  EditDescriptor against `collection: 'tracks'` (or whatever the original
  entry's collection was). Then `applyEdit(desc, { withoutUndo: true })`.
- **Target**: One or more `tracks/{id}` ops (set on delete-undo,
  update on update-undo, delete on set-undo). Composite entries fan out
  N parallel ops.
- **Payload**: Replay of `prevDoc` / `newDoc` captured at original-write
  time.
- **Stamps updatedAt?**: Engine stamps as normal.
- **Concurrency**: `readLiveUpdatedAt` re-reads the LIVE
  `updatedAt` from Dexie at undo-time (line 822-834) and threads it as
  `expectedUpdatedAt`. So undo respects subsequent edits — a stale undo
  surfaces as VersionMismatchError instead of silently overwriting.
- **Side effects**: No reconciler intervention beyond W22's count
  follow-up.
- **Bypass**: Engine path.

---

## Both (writers that touch both sources)

### W26. `src/hooks/use-add-to-setlist.ts:146-242` — `addToSetlist` (composite of W2 + W24)
- **Trigger**: User picks a setlist from the "Add to setlist" sheet
  (library page → multi-select → bottom sheet).
- **Op**: Two phases:
  1. `setlistService.updateSetlist(setlistId, { tracks: updatedTracks,
     trackCount: updatedTracks.length }, expected)` (line 180-183) →
     direct Firestore `runTransaction` with `expectedUpdatedAt`
     precondition. Writes embedded `tracks[]` + `trackCount` +
     `updatedAt` on `setlists/{S}`. This is W2.
  2. `mirrorTracksToTopLevel(setlistId, newTracks, setlist.tracks.length)`
     (line 190) — wrapped in try/catch, awaits, log-warns and swallows on
     failure. Calls W24 → N parallel `applyEdit({ op:'set',
     collection:'tracks', doc: {...} }, { withoutUndo: true })`.
- **Target**: BOTH the embedded `setlists/{S}.tracks[]` AND N new
  `tracks/{t.id}` docs.
- **Payload (embedded)**: full overwrite of `tracks[]` with
  `[...setlist.tracks, ...newTracks]`. Each newTrack carries `{ id,
  title, fileId, fileName, key, notes, type:'song' }`.
- **Payload (top-level mirror)**: per W24 — `{ id, setlistId, songId:
  fileId, fileId, order: startOrder + i, title, type:'song', key?, notes?
  }`.
- **Stamps updatedAt?**: YES on `setlists/{S}` (W2's runTransaction). YES
  on each `tracks/{id}` (engine commit).
- **Concurrency**: `expectedUpdatedAt` on the embedded write (W2's
  `updateSetlistWithVersion`); no precondition on the top-level
  mirror sets. The two phases are NOT atomic — if the mirror fails, the
  embedded array contains tracks that have no corresponding `tracks/{id}`
  doc. The error is swallowed.
- **Side effects**: Audit log `tracks_updated` via `logSetlistChange` (W2
  side effect). Hydrator reconciler (W22) may then fire to bring
  `trackCount` in line with the live top-level count — but if the mirror
  partially failed, `trackCount` from the embedded path was already
  written and now disagrees with the live top-level count. Possible
  flip-flop.
- **Bypass**: Mixed — Phase 1 bypasses applyEdit; Phase 2 uses applyEdit.
  This is the only call site in production that writes BOTH sources by
  design.
- **Undo path**: The toast's Undo action (line 215-235) re-reads
  `setlist.tracks` via a one-shot snapshot subscription, filters out the
  newly-added ids, and calls `setlistService.updateSetlist` (W2 again) to
  overwrite the embedded array. It does NOT call `applyEdit({
  op:'delete', collection:'tracks', ... })` to clean up the top-level
  mirrors — undo only fixes the embedded side. After undo, top-level
  `tracks/{id}` docs for the undone additions remain (orphaned but
  present).

### W27. `src/hooks/use-add-to-setlist.ts:245-301` — `addDirectlyToSetlist`
- **Trigger**: Programmatic add-without-sheet path (currently called from
  drag-and-drop file uploads / library bulk paths — exact callers
  in-codebase unaudited here, but the function is `useCallback`'d on
  `setlistService` and exported alongside `addToSetlist`).
- **Op**: Same two-phase shape as W26. Phase 1 = W2 via
  `setlistService.updateSetlist`; Phase 2 = W24
  (`mirrorTracksToTopLevel`).
- **Target / Payload / Stamps / Concurrency / Side effects / Bypass**:
  identical to W26.
- **Difference from W26**: No undo toast (only `toast.success`, line
  300). Top-level mirror failures are still warn-logged + swallowed.

---

## Test seam writers (NOT in production write path; surfaced for completeness)

These are exported for `__tests__/` only:

- `src/lib/setlist-firebase.ts:436-459` (`saveAsTemplate`) is real but
  only used by production code paths through W6 — listed already.
- `src/lib/setlist-firebase.test.ts` (production-file test seam, NOT a
  writer in production).
- `scripts/migrate-v50.ts` — one-shot Node CLI, writes ONLY to
  `songs/*` + `migration_snapshots/*` + a marker doc. Not a setlist /
  tracks writer.
- `scripts/scrub-livestate.ts` — one-shot Node CLI, writes to
  `setlists/{id}` (clears the deprecated `liveState` field). Not a
  tracks writer; never invoked from production.

---

## Cross-cutting observations (not "writers", just structural facts)

- **Top-level deletes are never cascaded from the API.** The Admin SDK
  `setlist/delete` route (W11) recursively deletes the setlist doc and a
  few sibling collections by `setlistId`, but does NOT query the
  `tracks` collection to delete docs whose `setlistId == deletedId`.
- **The embedded-array writers (W1-W11) never stamp anything on
  `tracks/{id}`.** All keep `tracks[]` self-contained.
- **The engine-path writers (W12-W25) never touch `setlists/{S}.tracks[]`.**
  All keep top-level docs self-contained. The only setlist-doc writes
  they make are to scalar fields (`hydrated`, `trackCount`).
- **The engine stamps `updatedAt: serverTimestamp()` on every set/update
  commit.** Hand-rolled callers do not always do this (W3 and W6 omit it
  on setlist creation; W10 transfer omits it on update).
- **Tombstones are written by `applyEdit({ op:'delete', ... })`** (write.ts:
  147-152) and survive engine drain success (engine.ts:261-271, post
  `6cd2c4e`).
- **`expectedUpdatedAt` is enforced** only at engine `update` ops
  (init.ts:119) and `updateSetlistWithVersion` (setlist-firebase.ts:50-61).
  Engine `delete` (init.ts:137-140) and direct-Firestore `set` /
  `addDoc` / Admin SDK calls all skip it.

---

## Verification footer

### Files opened (Read in full or partial)
- `src/lib/setlist-firebase.ts` (full)
- `src/lib/local/write.ts` (full)
- `src/lib/local/types.ts` (full)
- `src/lib/sync/init.ts` (full)
- `src/lib/sync/engine.ts` (full)
- `src/components/setlist/grid/SetlistGrid.tsx` (full)
- `src/components/setlist/grid/SetlistGridHydrator.tsx` (full)
- `src/components/setlist/grid/MobileCardList.tsx` (full)
- `src/hooks/use-add-to-setlist.ts` (full)
- `src/hooks/use-creation-wizard.ts` (full)
- `src/hooks/use-setlist-dashboard.ts` (240-319 + grep coverage)
- `src/app/api/setlist/delete/route.ts` (full)
- `src/app/api/setlist/publish/route.ts` (full)
- `src/app/api/setlist/rename/route.ts` (full)
- `src/app/api/setlist/transfer/route.ts` (full)
- `src/app/api/setlists/import/execute/route.ts` (full)
- `src/app/api/setlists/notify-updated/route.ts` (full — no tracks writes)
- `src/app/api/setlists/matrix/route.ts` (full — read-only)
- `src/app/(main)/setlists/[id]/page.tsx` (1-100 + grep — read-only)
- `src/components/admin/TemplatesSection.tsx` (grep — read-only)
- `src/components/performance/SetlistDrawer.tsx` (110-145 — read-only)
- `src/app/(main)/DashboardClient.tsx` (grep — read-only)
- `src/components/setlist/wizard/CreationWizard.tsx` (grep — no direct writes)
- `src/lib/template-firebase.ts` (1-80 — not in scope)
- `src/lib/setlist-audit.ts` (1-90 — writes setlists/{S}/history subcoll, not in scope)
- `src/lib/scheduling-firebase.ts` (grep — read-only on setlists)
- `src/lib/sync/snapshot-listener.ts` (grep — local Dexie writes only)
- `src/lib/sync/cleanup.ts` (grep — no Firestore writes)
- `src/lib/songs/defaults.ts` (70-110 — writes songs/* only)
- `src/inngest/functions.ts` (full — writes print_jobs/*)
- `src/app/api/cron/backup/route.ts` (130-190 — read-only counts)
- `src/app/api/admin/migrations/route.ts` (grep — no setlist/tracks writes)
- `scripts/migrate-v50.ts` (200-300 — writes songs/* + migration_snapshots/*)
- `scripts/scrub-livestate.ts` (grep — writes setlists.liveState scalar only)
- `scripts/audit-v50.ts` (grep — read-only)

### Greps run (representative patterns)
- `collection:\s*['\"]tracks['\"]` (applyEdit call sites)
- `collection\(['\"](setlists|tracks)['\"]|doc\(.*['\"](setlists|tracks)['\"]`
- `db\.collection\(['\"](setlists|tracks)['\"]` (Admin SDK)
- `setDoc|updateDoc|addDoc|deleteDoc|writeBatch|runTransaction|arrayUnion|arrayRemove`
- `setlists|tracks` scoped to inngest / scripts / lib / api directories
- `createSetlistService|saveAsTemplate|duplicateSetlist|cloneSetlist|cloneForNextWeek`
- `tracks.*setlistId|setlistId.*tracks`
- `applyEdit` (sticky-memory)

### Confirmed directly (read the call site + verified op shape)
- W1-W11 (every embedded-array writer)
- W12-W25 (every top-level engine writer)
- W26-W27 (the two both-source writers)
- Engine commit shape (init.ts:75-168) — set / update / delete branches
- `applyEdit` Dexie+outbox tx (write.ts:99-154)
- `updateSetlistWithVersion` precondition tx (setlist-firebase.ts:45-61)

### Inferred (not directly observed)
- `addDirectlyToSetlist` (W27) — function exists and is exported, but I
  did not enumerate every external caller; behavior inferred to match
  `addToSetlist` structurally since the function bodies share W24's
  `mirrorTracksToTopLevel` helper.
- The desktop `SetlistGrid.handleDragEnd` (W20) is callsite-dead per the
  comment at SetlistGrid.tsx:1647-1654 — included for completeness but
  not currently reachable from production. `MobileCardList.handleDragEnd`
  (W21) is the active reorder path.
- `BatchActionBar` and the bulk-set / bulk-delete handlers (W17, W18 via
  the toolbar) are callsite-dead per the same comment; W18 is still
  reachable through `handleContextDelete` (SetlistGrid.tsx:1358-1370)
  when the right-clicked row is in a multi-selection of size ≥ 2.
