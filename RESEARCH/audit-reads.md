# Audit — Reads (track-data consumers)

**Scope:** every production code path that READS track data and uses the result. Repo HEAD `4ee6e70` (master). Two storage locations exist:

- **Embedded**: `setlists/{S}.tracks: SetlistTrack[]` — the legacy v4.x array still live on every setlist doc.
- **Top-level**: `tracks/{id}` collection with `setlistId` field — the v50-05+ schema, written by the sync engine.
- **Dexie mirror**: `getDb().tracks` — IndexedDB table that holds top-level rows for the active editor/perform-view session.

Writes are out of scope (sibling agent).

---

## Embedded-array readers (`setlists/{S}.tracks[]`)

### R1. SSR `initialTracks` fallback — editor page
- **File**: `src/app/(main)/setlists/[id]/page.tsx`
- **Lines**: 129-161 (`db.collection("setlists").doc(id).get()` → `serialized` → `buildLocalTracks(id, …, serialized.tracks)` at line 157-161)
- **Source**: embedded `setlists/{S}.tracks[]` via `serialized.tracks` (Admin SDK `db.collection("setlists").doc(id).get()`).
- **Trigger**: every SSR render of `/setlists/[id]` when `serialized.hydrated !== true` (line 155 branch).
- **Query shape**: single doc by id.
- **Used for**: `initialTracks: LocalTrack[]` handed to `SetlistGridHydrator` → primes Dexie → editor grid renders from it.
- **Sort/order**: as-stored, no explicit sort; each track's `order` is `t.order ?? index` (line 52).
- **Tolerance for stale**: low on the embedded-vs-top-level edge case — if a setlist became hydrated since the last embedded-array maintenance write, embedded array can be stale. By design this branch only fires for `hydrated !== true` setlists, but the cascade-race could still surface stale data on an unhydrated setlist whose engine writes have started.
- **Tombstone aware?**: no — but the hydrator (R-Dexie1) applies the tombstone guard before bulkPut, so deleted-and-tombstoned tracks won't actually land in Dexie.

### R2. Library "Add to setlist" duplicate-check + base for `updatedTracks`
- **File**: `src/hooks/use-add-to-setlist.ts`
- **Lines**: 150-154 (`setlist.tracks.filter(t => t.fileId).map(...)`), 172 (`[...setlist.tracks, ...newTracks]`), 190 (`setlist.tracks.length` for `startOrder`), 255-259 + 273 + 283 (same in `addDirectlyToSetlist`).
- **Source**: embedded `setlists/{S}.tracks[]` — `setlist` object comes from `setlistService.subscribeToAllSetlists` (R5) via the `allSetlists` state.
- **Trigger**: user opens the Library "Add to setlist" sheet and picks a target setlist, or calls `addDirectlyToSetlist`.
- **Query shape**: in-memory access on a live-subscribed Setlist object.
- **Used for**: (a) duplicate-fileId detection ("already in this setlist"), (b) computing the new `updatedTracks` array that gets written back via `setlistService.updateSetlist` (writes both embedded array AND, since `c9e92a5`/`4ee6e70`, mirrors per-track into top-level via `mirrorTracksToTopLevel`/applyEdit), (c) computing `startOrder` for the top-level mirror.
- **Sort/order**: embedded-array implicit order.
- **Tolerance for stale**: HIGH RISK. After lazy-hydration, the embedded array is no longer authoritative — `setlist.tracks` here only reflects deletions/reorders that the v51-h01 reconciler happened to write back to it (most engine paths DON'T). The duplicate-check therefore underreports (says "not a duplicate" when the top-level row exists), and the rebuild-from-base-array can resurrect deleted tracks because the embedded array still contains them. This is the leak Daniel reported (BUG-4).
- **Tombstone aware?**: no.

### R3. Setlist publish — track-list snapshot, song-count, song-names
- **File**: `src/app/api/setlist/publish/route.ts`
- **Lines**: 85-90 (`setlist.tracks || []`, `hasSongs` check), 97-100 (`songTracks` → `publishedSnapshot`), 119-128 (`recordSongUsage(...tracks)` passes the array on), 232 (`songNames` for email body).
- **Source**: embedded `setlists/{S}.tracks[]` (Admin SDK).
- **Trigger**: POST `/api/setlist/publish` — user clicks Publish in the editor.
- **Query shape**: single doc by id (`db.collection('setlists').doc(setlistId).get()` line 70-76).
- **Used for**:
  - validation gate: "must have at least one song with a linked chart" (line 86-89);
  - `publishedSnapshot` field written back onto the setlist (line 98-100, then 104/111) — this is what change-detection compares against on future publishes;
  - `songNames` used in publish-email body (line 232);
  - `recordSongUsage(setlistId, …, tracks)` — fire-and-forget telemetry that writes per-song usage docs.
- **Sort/order**: embedded-array implicit order.
- **Tolerance for stale**: HIGH — publish hardcodes the embedded array into a persisted snapshot AND into the email. If hydrated and the embedded array hasn't caught up, the snapshot is wrong (wrong songs notified, wrong fileIds in publishedSnapshot, "wrong songs" in the email).
- **Tombstone aware?**: no.

### R4. Personal print packet
- **File**: `src/app/api/setlist/print/personal/route.ts`
- **Lines**: 30-34 (`db.collection('setlists').doc(setlistId).get()`), 49 (`(setlist.tracks || []) as SetlistTrack[]`), 54-68 (`.map(t => { ... fileId: t.fileId ... })`).
- **Source**: embedded `setlists/{S}.tracks[]` (Admin SDK).
- **Trigger**: GET `/api/setlist/print/personal?setlistId=…` — hit when the band member clicks "Personal packet" link in the publish email or in-app.
- **Query shape**: single doc by id.
- **Used for**: building `PrintRequest.tracks[]` → `generatePrintPdf` → the actual PDF the musician sees. fileId, key, notes, leadMusician, type, performer, estimatedMinutes, description, transposition, preferFlats, capoFret are all sourced here.
- **Sort/order**: embedded-array implicit order = print order.
- **Tolerance for stale**: VERY LOW — this is the artifact the musician actually plays from. Stale embedded array = wrong PDF (missing songs, deleted-but-resurrected songs, wrong key, etc.) — this is the leak that prompted the audit.
- **Tombstone aware?**: no.

### R5. Public print packet
- **File**: `src/app/api/setlist/print/public/route.ts`
- **Lines**: 38-43 (`db.collection('setlists').doc(setlistId).get()`), 51 (`(setlist.tracks || []) as SetlistTrack[]`), 55-67 (`.map(...)`).
- **Source**: embedded `setlists/{S}.tracks[]` (Admin SDK).
- **Trigger**: GET `/api/setlist/print/public?setlistId=…` — public/unauthenticated downloader on a published setlist.
- **Query shape**: single doc by id; rejects if `!setlist.publishedAt`.
- **Used for**: identical to R4 minus the per-musician transposition layer — produces the concert-pitch PDF.
- **Sort/order**: embedded-array implicit order.
- **Tolerance for stale**: VERY LOW — same risk as R4.
- **Tombstone aware?**: no.

### R6. Email-packets-fanout — song list in the email body
- **File**: `src/app/api/setlist/email-packets/route.ts`
- **Lines**: 33-37 (`db.collection('setlists').doc(setlistId).get()`), 61-67 (`(setlist.tracks || []).filter(...).map(...)`).
- **Source**: embedded `setlists/{S}.tracks[]` (Admin SDK).
- **Trigger**: POST `/api/setlist/email-packets` — band-leader triggers a per-musician personal-packet email.
- **Query shape**: single doc by id.
- **Used for**: `songs: [{ title, key }]` rendered in `sendSetlistEmail` body (line 78-87). Does NOT affect the PDF — each musician's actual PDF is generated lazily by R4 when they click the link.
- **Sort/order**: embedded-array implicit order.
- **Tolerance for stale**: LOW — email body lists the wrong song titles.
- **Tombstone aware?**: no.

### R7. Resend-email
- **File**: `src/app/api/setlist/resend-email/route.ts`
- **Lines**: 48-50 (`db.collection('setlists').doc(setlistId).get()`), 118-119 (`const tracks = setlist.tracks || []` → `songNames`).
- **Source**: embedded `setlists/{S}.tracks[]` (Admin SDK).
- **Trigger**: POST `/api/setlist/resend-email` — band leader/admin retries a failed publish-email round.
- **Query shape**: single doc by id.
- **Used for**: `songNames` in the publish-email body.
- **Sort/order**: embedded-array implicit order.
- **Tolerance for stale**: LOW — same as R6.
- **Tombstone aware?**: no.

### R8. Scheduling assign — new-song detection
- **File**: `src/app/api/scheduling/assign/route.ts`
- **Lines**: 47-57 (`db.collection('setlists').doc(setlistId).get()` → `setlistTracks = (setlistDoc.data()?.tracks ?? []).map(...)`), passes to `detectNewSongs(db, musicianUid, setlistTracks)`.
- **Source**: embedded `setlists/{S}.tracks[]` (Admin SDK).
- **Trigger**: POST `/api/scheduling/assign` per musician — runs once before the per-musician transaction loop.
- **Query shape**: single doc by id.
- **Used for**: `setlistTracks` passed to `detectNewSongs` (R10), which enriches each assignment's notification email/SMS with "new songs" the musician hasn't played before.
- **Sort/order**: implicit, but order doesn't matter — `detectNewSongs` operates as a set.
- **Tolerance for stale**: MEDIUM — wrong "new songs" callout in the assignment email; non-fatal but misleading.
- **Tombstone aware?**: no.

### R9. New-song detector — historical setlist track scan
- **File**: `src/lib/new-song-detector.ts`
- **Lines**: 60-71 (`db.collection('setlists').doc(id).get()` → `const tracks: TrackRef[] = snap.data()?.tracks ?? []`).
- **Source**: embedded `setlists/{S}.tracks[]` (Admin SDK) for each historical setlist returned by the musician's scheduling history.
- **Trigger**: called by R8 (`scheduling/assign`). Iterates up to 50 historical setlist ids in chunks of 10.
- **Query shape**: N×getDoc by id, chunked.
- **Used for**: building `seenFileIds: Set<string>` to subtract from the current setlist's fileIds.
- **Sort/order**: irrelevant (set membership).
- **Tolerance for stale**: MEDIUM — old setlists' embedded arrays should be stable post-fact; new setlists in flight could already have writes that the embedded array missed (musician falsely tagged "first time playing X" when they have actually played the hydrated copy).
- **Tombstone aware?**: no.

### R10. Print-Modal-derived export (perform view)
- **File**: `src/app/perform/setlist/[id]/page.tsx`
- **Lines**: 31-44 (`tracks` from `useSetlistPerformance`), passed at 158/171/172/196.
- **Source**: TRANSITIVE through `useSetlistPerformance` (R-Dexie3). For unhydrated setlists, falls through to embedded `setlistData?.tracks` (R-Dexie3 line 129); for hydrated, Dexie.
- **Trigger**: render of `/perform/setlist/[id]`.
- **Used for**: `SetlistView` render, `PDFOverlay`, offline-indicator fileIds, `PrintModal` (which then POSTs the array body-attached to `/api/setlist/print` — see R-passthru1).
- **Sort/order**: Dexie path is `sortBy('order')`; embedded fallback is implicit.
- **Tolerance for stale**: see R-Dexie3.
- **Tombstone aware?**: Dexie is naturally tombstone-correct (deletes propagate via outbox); embedded fallback is not.

### R11. Importer parse — library matching only (no setlist track read)
- **File**: `src/app/api/setlists/import/parse/route.ts`
- **Lines**: 152-164.
- **Source**: `library_index` collection, NOT setlist tracks.
- **NOTE**: included for completeness only — this route reads no track data; it parses an external CSV and matches against library. The execute route (`/api/setlists/import/execute/route.ts`) is a write-only path.

### R12. Setlist matrix — eventDate window scan
- **File**: `src/app/api/setlists/matrix/route.ts`
- **Lines**: 62-76 (`db.collection('setlists').where('date', '>=', startDate).where('date', '<=', endDate).get()` returns whole docs including embedded `tracks`), 112-121 (`setlist.tracks.find(t => …)`).
- **Source**: embedded `setlists/{S}.tracks[]` (Admin SDK), bulk via date-range query.
- **Trigger**: GET `/api/setlists/matrix?type=…` — admin matrix UI.
- **Query shape**: `where('date', '>=' start).where('date', '<=' end)` (8-week window).
- **Used for**: matching tracks against liturgical-template slots by title for the matrix grid view.
- **Sort/order**: client-side scan (`.find`), order doesn't matter.
- **Tolerance for stale**: MEDIUM — matrix shows wrong "what's at this slot" for hydrated setlists whose embedded array drifted.
- **Tombstone aware?**: no.

### R13. Admin Templates — recent-setlist picker for import
- **File**: `src/components/admin/TemplatesSection.tsx`
- **Lines**: 43-58 (client SDK `query(collection(db, "setlists"), orderBy("date", "desc"), limit(10))` → `tracks: data.tracks || []`), 69 (`convertSetlistToTemplate(setlist.tracks)`).
- **Source**: embedded `setlists/{S}.tracks[]` (client SDK, one-shot `getDocs`).
- **Trigger**: admin clicks "Import slots from a setlist" in `/manage/templates`.
- **Query shape**: 10 most-recent setlists by date.
- **Used for**: converting picked setlist's tracks → `TemplateSlot[]` for the template editor.
- **Sort/order**: embedded-array implicit (each setlist).
- **Tolerance for stale**: MEDIUM — admin builds the template from a stale snapshot. Unstyled admin path; out-of-scope per project memory.
- **Tombstone aware?**: no.

### R14. SSR dashboard initial render — all 50 setlists with embedded tracks
- **File**: `src/lib/server-setlists.ts` (`getAllSetlists`, lines 58-74) consumed by `src/app/(main)/setlists/page.tsx` (line 8).
- **Lines**: server-setlists.ts:63-69 (`db.collection("setlists").orderBy("date", "desc").limit(50).get()` → `serializeSetlist(d.id, d.data())` returns whole doc including `tracks`); page.tsx:13 (`initialSetlists={allSetlists as any}`).
- **Source**: embedded `setlists/{S}.tracks[]` (Admin SDK, bulk).
- **Trigger**: every SSR of `/setlists`.
- **Query shape**: orderBy date desc, limit 50.
- **Used for**: hands embedded tracks into `useSetlistDashboard` (R15) as `initialSetlists` so the dashboard cards render with track-derived signals (song count, offline-ready, search-tracks-by-title) BEFORE the client-side `subscribeToAllSetlists` resolves.
- **Sort/order**: setlists by date desc; embedded tracks in implicit order within each setlist.
- **Tolerance for stale**: LOW-MEDIUM — first paint of every dashboard card before the live sub fires.
- **Tombstone aware?**: no.

### R15. Dashboard search-by-track-title + downloadable derived list
- **File**: `src/hooks/use-setlist-dashboard.ts`
- **Lines**: 322-323 (`if (setlist.tracks && setlist.tracks.length > 0)` → `downloadSetlist(setlist.tracks)`), 346 (`s.tracks?.some(t => t.title?.toLowerCase().includes(q))` in `displayedSetlists` memo).
- **Source**: embedded `setlists/{S}.tracks[]` via the `setlists` state populated by R-Sub1 (live) seeded by R14 (SSR).
- **Trigger**: (a) user types in dashboard search box; (b) user clicks per-card "Download for offline" button.
- **Used for**: substring search across all tracks' titles in all setlists; offline-cache fileIds list.
- **Sort/order**: irrelevant (search) / preserves order (download).
- **Tolerance for stale**: LOW — search misses tracks whose embedded copy is stale (user types a song title that was added to a hydrated setlist via top-level only → no hit).
- **Tombstone aware?**: no.

### R16. Upcoming-prep — viewed-state per fileId
- **File**: `src/hooks/use-upcoming-prep.ts`
- **Lines**: 102-107 (`for (const t of (s.tracks || []))` — collect fileIds across setlists), 147 (`(s.tracks || []).filter(t => t.fileId && t.type !== 'header')` — enriched track list per setlist).
- **Source**: embedded `setlists/{S}.tracks[]` returned by client SDK `query(collection(db,'setlists').where('eventDate','>=',now).where(... <= nextWeek))` via `useSafeFirestoreSync` (line 76-85).
- **Trigger**: dashboard render (HeroCard, UpcomingTimeline) for the next-7-days window.
- **Used for**: building the user's prep progress bar (viewed/total fileIds), per-track checkmarks (`viewedFileIds: Set<string>`).
- **Sort/order**: irrelevant.
- **Tolerance for stale**: LOW — prep bar shows wrong "X of Y viewed" counts when embedded array missed top-level adds/removes.
- **Tombstone aware?**: no.

### R17. HeroCard — offline-ready check + count
- **File**: `src/components/dashboard/HeroCard.tsx`
- **Lines**: 52-55 (`(setlist.tracks || []).filter(t => t.fileId).map(t => t.fileId!)`), 93 (`setlist.tracks?.length || 0`).
- **Source**: embedded `setlists/{S}.tracks[]` via the Setlist prop from R16's parent (UpcomingTimeline → HeroCard) or dashboard subscription.
- **Trigger**: render of dashboard hero zone.
- **Used for**: `isFileCached(id)` per-fileId scan to render the "all-cached/partial/none" badge; `trackCount` for the "N songs" label.
- **Sort/order**: irrelevant.
- **Tolerance for stale**: LOW — wrong cached-badge state, wrong song count.
- **Tombstone aware?**: no.

### R18. UpcomingSetlistCard — offline status per card
- **File**: `src/components/setlist/SetlistCards.tsx`
- **Lines**: 65-71 (`(setlist.tracks || []).map(t => t.fileId).filter(Boolean) as string[]` → `isFileCached` scan).
- **Source**: embedded `setlists/{S}.tracks[]` via the Setlist prop from `useSetlistDashboard` → dashboard list.
- **Trigger**: render of each setlist card in the upcoming list.
- **Used for**: per-card offline-readiness badge ("full/partial/none").
- **Sort/order**: irrelevant.
- **Tolerance for stale**: LOW.
- **Tombstone aware?**: no.

### R19. NextServiceCard — song count
- **File**: `src/components/home/NextServiceCard.tsx`
- **Lines**: 54-56 (`(setlist.tracks || []).filter(t => !t.type || t.type === "song").length`).
- **Source**: embedded — Setlist prop coming from dashboard sub.
- **Trigger**: home-screen render of next-service card.
- **Used for**: "{N} songs" label.
- **Tolerance for stale**: LOW.
- **Tombstone aware?**: no.

### R20. UpcomingTimeline — per-row track filter
- **File**: `src/components/dashboard/UpcomingTimeline.tsx`
- **Lines**: 154 (`(setlist.tracks || []).filter(t => t.type !== 'header')`).
- **Source**: embedded — Setlist prop from dashboard sub.
- **Trigger**: dashboard upcoming-timeline render.
- **Used for**: per-row track count derivation for the timeline pills.
- **Tolerance for stale**: LOW.
- **Tombstone aware?**: no.

### R21. CompactSetlistRow — song count
- **File**: `src/components/dashboard/CompactSetlistRow.tsx`
- **Lines**: 45 (`{setlist.tracks?.length || 0} songs`).
- **Source**: embedded.
- **Trigger**: row render.
- **Used for**: "N songs" label.
- **Tolerance for stale**: LOW.
- **Tombstone aware?**: no.

### R22. PrepRecommendations — fileIds per upcoming setlist
- **File**: `src/components/dashboard/PrepRecommendations.tsx`
- **Lines**: 20 (`(item.setlist.tracks || []).filter(t => t.fileId && t.type !== 'header')`).
- **Source**: embedded — Setlist prop from R16 (`useUpcomingPrep`).
- **Trigger**: dashboard prep-recommendations render.
- **Used for**: "songs to prep" list across the next-7-day window.
- **Tolerance for stale**: LOW-MEDIUM — wrong recommended songs.
- **Tombstone aware?**: no.

### R23. SetlistDrawer — public-setlist picker → playback queue
- **File**: `src/components/performance/SetlistDrawer.tsx`
- **Lines**: 117-132 (`createSetlistService(...).subscribeToAllSetlists` populates `publicSetlists`), 135-156 (`if (!setlist.tracks || setlist.tracks.length === 0) return; const queue = setlist.tracks.filter(t => t.fileId).map(...)`).
- **Source**: embedded `setlists/{S}.tracks[]` via the subscribe; lines 32-57 also process `currentSection.tracks` in-memory but that's not the same field — it's a local `tracks: [...]` accumulator inside the section grouping (NOT a track-data read).
- **Trigger**: user opens the setlist drawer in the perform shell; `showPublicPicker` branch fires on empty playback queue.
- **Used for**: building the music-store playback queue (fileId, type, audioFileId, bpm, transposition, key) when the user taps a setlist in the public picker.
- **Sort/order**: embedded-array implicit order = play order.
- **Tolerance for stale**: HIGH — wrong songs queued, wrong key/bpm/transposition. This is a live-performance surface.
- **Tombstone aware?**: no.

### R24. PublicSetlistListing — song count per setlist
- **File**: `src/components/performance/PublicSetlistListing.tsx`
- **Lines**: 18-25 (`subscribeToAllSetlists` with null user), 65-69 (`(setlist.tracks || []).filter(t => !t.type || t.type === "song").length`).
- **Source**: embedded `setlists/{S}.tracks[]` via subscribe (client SDK, unauthenticated session).
- **Trigger**: render of `/perform` for public visitors.
- **Used for**: "{N} songs" label per setlist card.
- **Tolerance for stale**: LOW.
- **Tombstone aware?**: no.

### R25. Creation wizard — clone-source track count
- **File**: `src/hooks/use-creation-wizard.ts`
- **Lines**: 186 (`const trackCount = cloneSource.tracks?.length ?? 0` for the toast).
- **Source**: embedded — `cloneSource: Setlist` prop, ultimately from dashboard sub.
- **Trigger**: user confirms a clone in the creation wizard.
- **Used for**: success-toast message ("Cloned from X — N tracks").
- **NOTE**: the actual clone is done inside `setlistService.cloneSetlist` which itself reads `source.tracks` to build the new setlist — that's a write-precursor read, NOT a separate fetch. The clone path is OUT OF SCOPE per "no writes" but worth flagging that the clone re-shapes the embedded array.
- **Tolerance for stale**: LOW (toast) / HIGH (the clone itself — see write-side audit).
- **Tombstone aware?**: no.

### R26. SetlistHistoryPanel — restore tracks from snapshot
- **File**: `src/components/setlist/SetlistHistoryPanel.tsx`
- **Lines**: 75-77 (`getSetlistHistory(setlistId, 30)` — reads `setlists/{id}/history` sub-collection where each entry has `trackSnapshot: Array<{title, fileId?, key?, type?}>`).
- **Source**: NEITHER embedded nor top-level — `trackSnapshot` field on history entries written by `logSetlistChange` (`src/lib/setlist-audit.ts:71-77`) at write-time. `logSetlistChange` is called from `setlistService.updateSetlist` with `data.tracks` (R-write side).
- **Trigger**: user opens the history panel on a setlist editor.
- **Used for**: showing diff between consecutive snapshots; calling `onRestore(snapshot)` to restore old track list.
- **Sort/order**: per-entry array order.
- **Tolerance for stale**: deliberately stale (it's a snapshot). But: if `updateSetlist` is no longer the only write path post-migration (the engine writes top-level without going through it), the history subcollection has UNDERCOUNTED snapshots — drift between what the editor actually committed and what history can restore.
- **Tombstone aware?**: no.

---

## Top-level readers (`tracks/{id}`)

### R27. SSR `initialTracks` for hydrated setlists — `fetchTopLevelTracks`
- **File**: `src/app/(main)/setlists/[id]/page.tsx`
- **Lines**: 65-97 (`db.collection("tracks").where("setlistId","==", setlistId).get()` → map to `LocalTrack[]` → `rows.sort((a,b) => a.order - b.order)`), called from line 156.
- **Source**: top-level `tracks/{id}` (Admin SDK, query).
- **Trigger**: every SSR of `/setlists/[id]` when `serialized.hydrated === true` (line 155 branch). Added in commit `c9e92a5`.
- **Query shape**: `where('setlistId', '==', setlistId)`, no composite index, no server-side sort.
- **Used for**: `initialTracks: LocalTrack[]` → handed to `SetlistGridHydrator` → primes Dexie → editor grid.
- **Sort/order**: client-sorted by `order` field after fetch.
- **Tolerance for stale**: LOW — this is the SoT branch for hydrated setlists. Risk is the inverse of R1: if the top-level collection has missing rows (e.g., an `applyEdit` outbox row stuck in `failed`), the editor first-paint loses that row.
- **Tombstone aware?**: no — but the hydrator's bulkPut path (R-Dexie1) re-applies the tombstone guard, so deleted-then-tombstoned tracks are filtered before they reach Dexie.

### R28. Cross-device snapshot listener — track subscription
- **File**: `src/lib/sync/snapshot-listener.ts`
- **Lines**: 119-143 (`query(fsCollection(firestoreDb, 'tracks'), where('setlistId', '==', setlistId))` → `onSnapshot` with `docChanges()` callback).
- **Source**: top-level `tracks/{id}` (client SDK, live subscription).
- **Trigger**: mounted by:
  - `SetlistGridHydrator` after Dexie priming finishes (`SetlistGridHydrator.tsx:199-203`, gated on `hydration === 'done'`);
  - `useSetlistPerformance` after auth resolves (`use-setlist-performance.ts:92-106`, skipped for public sessions).
- **Query shape**: `where('setlistId', '==', setlistId)`. Returns per-track add/modify/remove changes via `docChanges()`.
- **Used for**: writing deliveries into Dexie via `db.tracks.put` / `db.tracks.delete` (handleTracks `snapshot-listener.ts:225-318`), with LWW + outbox-pending + tombstone guards. THIS is what makes the editor/perform-view live-update after the initial SSR/priming snapshot.
- **Sort/order**: per-change; order is preserved as a per-row `order` field on each track doc.
- **Tolerance for stale**: this IS the freshness mechanism for top-level — its absence/error is where staleness comes from.
- **Tombstone aware?**: yes — both pre-tx tombstone check (line 273-283) and post-removed tombstone clear (line 261).

---

## Local-Dexie readers (`getDb().tracks`)

These read from the IndexedDB mirror of the top-level `tracks/{id}` collection. The mirror is populated by:
- R-Dexie-init: `SetlistGridHydrator` initial priming from `initialTracks` (which itself is sourced from R1 or R27)
- R28 snapshot-listener deliveries
- engine writeback after applyEdit commits (`src/lib/sync/engine.ts:272-309`)

### R-Dexie1. Editor grid — live row list
- **File**: `src/components/setlist/grid/SetlistGrid.tsx`
- **Lines**: 946-953 (`useLiveQuery(() => getDb().tracks.where('setlistId').equals(setlistId).sortBy('order'), [setlistId]) as LocalTrack[] | undefined`).
- **Source**: Dexie (mirror of top-level `tracks/{id}`).
- **Trigger**: editor mount + any Dexie write touching the `tracks` table.
- **Query shape**: `where('setlistId').equals(setlistId).sortBy('order')`.
- **Used for**: THE primary row list for the editor — TanStack-table-style render, selection state, all edit operations.
- **Sort/order**: server-side absent; Dexie applies `sortBy('order')` client-side via the secondary index.
- **Tolerance for stale**: medium-low — Dexie has the latest delivered state, but is only as fresh as the snapshot-listener delivery + engine writeback.
- **Tombstone aware?**: yes — deletes flow through outbox → engine commits → Dexie row is removed.

### R-Dexie2. Editor grid — undo entry "newDoc" snapshots
- **File**: `src/components/setlist/grid/SetlistGrid.tsx`
- **Lines**: 1192-1200 (bulk-set), 1320-1328 (duplicate cascade), 1469-1477 (reorder).
- **File**: `src/components/setlist/grid/MobileCardList.tsx` lines 134-140 (mobile reorder).
- **Source**: Dexie (`db.tracks.get(id)` per row).
- **Trigger**: after each applyEdit batch resolves, before pushing the undo entry.
- **Used for**: capturing `newDoc` for each undo entry's per-row diff (so undo can revert by re-putting `prevDoc`).
- **Sort/order**: irrelevant.
- **Tolerance for stale**: deliberately a post-write read — must reflect the just-applied change.
- **Tombstone aware?**: not directly relevant (undo entries).

### R-Dexie3. Perform-view tracks (dual-read)
- **File**: `src/hooks/use-setlist-performance.ts`
- **Lines**: 111-120 (`useLiveQuery(() => getDb().tracks.where("setlistId").equals(setlistId).sortBy("order"))`), 125-130 (memo combining Dexie + embedded fallback).
- **Source**: Dexie (primary). Falls back to `setlistData?.tracks` (embedded) when `setlistData?.hydrated !== true` AND Dexie is empty.
- **Trigger**: `/perform/setlist/[id]` mount.
- **Used for**: `tracks: SetlistTrack[]` returned by the hook → consumed by `SetlistView`, `PDFOverlay`, `PrintModal`, offline-indicator, song-count headers.
- **Sort/order**: Dexie path: `sortBy('order')`. Embedded fallback: implicit array order.
- **Tolerance for stale**: depends on which branch fires — Dexie branch is fresh-via-listener; embedded branch is R1-style stale.
- **Tombstone aware?**: Dexie branch yes; embedded branch no.

### R-Dexie4. SetlistGridHydrator — pre-bulkPut local-row read
- **File**: `src/components/setlist/grid/SetlistGridHydrator.tsx`
- **Lines**: 157-161 (`db.tracks.where('setlistId').equals(setlistId).toArray()` → `localById: Map<string, LocalTrack>`).
- **Source**: Dexie.
- **Trigger**: every hydration cycle (`hydrate()` effect, line 69-189).
- **Used for**: LWW comparison — only put the server row if local is missing or older.
- **Sort/order**: irrelevant.
- **Tolerance for stale**: deliberately a current-state read inside a transaction.
- **Tombstone aware?**: separate tombstone-query (line 138-154) runs in same tx.

### R-Dexie5. SetlistGridHydrator — live trackCount reconciler
- **File**: `src/components/setlist/grid/SetlistGridHydrator.tsx`
- **Lines**: 335-342 (`useLiveQuery(() => getDb().tracks.where('setlistId').equals(setlistId).count(), [setlistId])`).
- **Source**: Dexie.
- **Trigger**: every Dexie write to the `tracks` table for this setlist.
- **Used for**: drives the 800ms-debounced `setlist.trackCount` patch (`applyEdit('update','setlists', {trackCount})`) — this is the v54-01-03 "dashboard says 0 songs" fix.
- **Sort/order**: count only.
- **Tolerance for stale**: tolerant — the debounce naturally absorbs short staleness windows.
- **Tombstone aware?**: yes (Dexie deletes drop the count).

### R-Dexie6. MobileCardList — drag-reorder pre-snapshot
- **File**: `src/components/setlist/grid/MobileCardList.tsx`
- **Lines**: 113-116 (`tracks.find(...)` is on the props, not a DB read), 134-140 (`db.tracks.get(id)` post-write for undo, same pattern as R-Dexie2).
- **Source**: prop `tracks: LocalTrack[]` comes from `SetlistGrid` which passes the `rows` array from R-Dexie1.
- **NOTE**: no NEW track read; downstream of R-Dexie1.

### R-Dexie7. ReconciliationProvider — failed-row title lookup
- **File**: `src/components/setlist/grid/ReconciliationProvider.tsx`
- **Lines**: 339-352 (`db[r.collection].get(r.docId)` where `r.collection` ∈ {tracks, setlists, songs}).
- **Source**: Dexie (`db.tracks.get(docId)`) when the failed outbox row's collection is `tracks`.
- **Trigger**: ReconciliationProvider modal opens (failed outbox rows exist).
- **Used for**: display-only — render the failed row's title in the conflict-resolution modal.
- **Sort/order**: irrelevant.
- **Tolerance for stale**: display-only.
- **Tombstone aware?**: not relevant.

---

## Indirect/transitive readers (passthrough — flagged for completeness)

### R-passthru1. `/api/setlist/print` — receives tracks in the body
- **File**: `src/app/api/setlist/print/route.ts`
- **Lines**: 22-24 (`body as PrintRequest` → `generatePrintPdf(body)`).
- **Source**: HTTP request body — the CALLER (the in-browser `PrintModal`, sourced from R-Dexie3 / R10) sends the tracks array. The route does NOT re-read.
- **NOTE**: this is the "client decides what to print" path. Whatever the client sees becomes the PDF. The source-of-truth question is therefore deferred to whoever populated the client's tracks state — which is R-Dexie3 in production.

### R-passthru2. `PrintModal` / `SetlistView` / `PDFOverlay` / `TrackPrintOptionsList`
- **Files**:
  - `src/components/setlist/PrintModal.tsx` (tracks: SetlistTrack[] prop)
  - `src/components/performance/SetlistView.tsx` (tracks: SetlistTrack[] prop)
  - `src/components/performance/PDFOverlay.tsx` (tracks: SetlistTrack[] prop)
  - `src/components/setlist/TrackPrintOptionsList.tsx` (tracks: SetlistTrack[] prop)
- **NOTE**: all four consume `tracks` purely via props. No DB read. Source-of-truth deferred to the parent (`/perform/setlist/[id]`'s `useSetlistPerformance` → R-Dexie3, or the editor — but the editor doesn't currently mount any of these).

### R-passthru3. `useBatchSelection`
- **File**: `src/hooks/use-batch-selection.ts:6-50`
- **NOTE**: receives tracks as a parameter; no DB read.

### R-passthru4. `recordSongUsage` (called by publish, R3)
- **File**: `src/lib/song-usage.ts:35-40`
- **NOTE**: receives tracks parameter from R3 caller; no separate fetch.

### R-passthru5. `detectNewSongs` (called by R8)
- **File**: `src/lib/new-song-detector.ts`
- **NOTE**: receives `currentTracks` parameter; performs its own historical setlist fetches (counted as R9).

---

## Subscription-level readers (the upstream sources feeding many consumers above)

### R-Sub1. `subscribeToAllSetlists` — primary client subscription
- **File**: `src/lib/setlist-firebase.ts`
- **Lines**: 237-258 (`onSnapshot(query(collection(db, 'setlists').withConverter(setlistConverter), orderBy("date","desc"), limit(50)))`).
- **Source**: embedded — each Setlist doc carries `tracks: SetlistTrack[]` field (via converter).
- **Consumers**:
  - `useSetlistDashboard` (R15)
  - `useAddToSetlist` (R2)
  - `DashboardClient` (line 109)
  - `SetlistDrawer` (R23)
  - `PublicSetlistListing` (R24)
- **Query shape**: orderBy date desc, limit 50.
- **Used for**: every UI that lists setlists. Every one of them then accesses `.tracks` on those Setlist objects for various derived signals (count, fileIds, search-by-title, queue building).
- **Sort/order**: server-ordered by date desc; tracks within each are implicit-order.
- **Tolerance for stale**: this is a real-time sub, so freshness ≈ Firestore freshness. BUT — what each consumer sees as `.tracks` IS the embedded array, with all the staleness it carries post-hydration.
- **Tombstone aware?**: no.

### R-Sub2. `subscribeToSetlist` — single-doc subscription
- **File**: `src/lib/setlist-firebase.ts:178-189`.
- **Source**: embedded (single setlists/{id} doc via converter).
- **Consumers**:
  - `useAddToSetlist` undo branch (`use-add-to-setlist.ts:218-228`) — reads `current?.tracks ?? []` to filter out the just-added trackIds.
- **Trigger**: undo of an Add-to-setlist toast.
- **Tolerance for stale**: MEDIUM — undo of an add to a hydrated setlist will be reading the stale embedded array; the filter still works (it just removes added ids), but the resulting `filteredTracks` array (which is then written BACK to the embedded array) is incomplete vs the top-level reality.

### R-Sub3. `subscribeToUpcomingSetlists` (scheduling-firebase)
- **File**: `src/lib/scheduling-firebase.ts:97-120`.
- **Source**: setlists docs, BUT the callback only projects `{id, name, eventDate}` — `tracks` is NOT read out (line 110-114). NOT a track reader.

### R-Sub4. `useSafeFirestoreSync<Setlist[]>(q)` in `useUpcomingPrep`
- **File**: `src/hooks/use-upcoming-prep.ts:76-93`.
- **Source**: same shape as R-Sub1 — Setlist docs with embedded `tracks`. Feeds R16 / R17 / R22.

### R-Sub5. `useSafeFirestoreSync<Setlist>(setlistRef)` in `useSetlistPerformance`
- **File**: `src/hooks/use-setlist-performance.ts:81-86`.
- **Source**: embedded single-doc Setlist. Used by R-Dexie3 for the hydrated-flag check and the embedded fallback.

---

## Test-file readers (separated per scope rules)

The following files read track data in test fixtures or assertions; they are NOT production readers:

- `src/components/setlist/grid/__tests__/SetlistGrid.*.test.tsx` (many — Dexie `db.tracks.bulkPut`, `toArray`, etc.)
- `src/components/setlist/grid/__tests__/SetlistGridHydrator.test.tsx`
- `src/components/setlist/grid/__tests__/MobileCardList.test.tsx`
- `src/components/setlist/grid/__tests__/ReconciliationProvider.test.tsx`
- `src/hooks/__tests__/use-setlist-performance.test.ts`
- `src/hooks/__tests__/use-add-to-setlist.test.ts`
- `src/hooks/__tests__/use-creation-wizard.test.ts`
- `src/lib/sync/__tests__/snapshot-listener.test.ts`
- `src/lib/sync/__tests__/engine.test.ts`
- `src/lib/sync/__tests__/property-failures.test.ts`
- `src/lib/sync/__tests__/cleanup.test.ts`
- `src/lib/sync/__tests__/edit-log.test.ts`
- `src/lib/sync/__tests__/edit-log-upload.test.ts`
- `src/lib/sync/__tests__/state-machine.test.ts`
- `src/lib/sync/__tests__/sentry-capture.test.ts`
- `src/lib/local/__tests__/write.test.ts`, `schema.test.ts`, `undo-store.test.ts`
- `src/lib/setlist-firebase.test.ts`
- `src/lib/print-pipeline.test.ts`
- `src/lib/__tests__/scheduling-firebase.test.ts`
- `src/lib/__tests__/server-auth.test.ts`
- `src/lib/__tests__/server-setlists.test.ts`
- `src/app/api/setlist/delete/__tests__/route.test.ts`
- `src/app/api/setlist/rename/__tests__/rename.test.ts`
- `src/app/api/scheduling/__tests__/*.test.ts`
- `src/components/performance/__tests__/public-view.test.tsx`

---

## Cross-reference: which readers see which source?

### Setlist-level subscriptions/fetches that EXPOSE the embedded `tracks[]` field downstream

| Reader | Source mechanism | Embedded `tracks[]` exposed downstream |
|---|---|---|
| R1 SSR editor (unhydrated branch) | Admin `setlists/{id}.get()` | yes — feeds editor's first paint |
| R3 publish | Admin `setlists/{id}.get()` | yes — feeds publishedSnapshot + emails + recordSongUsage |
| R4 print/personal | Admin `setlists/{id}.get()` | yes — feeds PDF |
| R5 print/public | Admin `setlists/{id}.get()` | yes — feeds PDF |
| R6 email-packets | Admin `setlists/{id}.get()` | yes — feeds email body |
| R7 resend-email | Admin `setlists/{id}.get()` | yes — feeds email body |
| R8 scheduling/assign | Admin `setlists/{id}.get()` | yes — feeds new-song detection |
| R9 new-song-detector | Admin `setlists/{id}.get()` (historical) | yes — feeds seenFileIds set |
| R12 matrix | Admin `setlists where date` | yes — feeds matrix grid |
| R13 admin templates | Client `query setlists orderBy date limit 10` | yes — feeds template-slot import |
| R14 SSR dashboard | Admin `getAllSetlists` | yes — feeds initialSetlists for all dashboard cards |
| R-Sub1 `subscribeToAllSetlists` | Client `onSnapshot collection setlists limit 50` | yes — feeds dashboard, drawer, add-to-setlist, public listing |
| R-Sub2 `subscribeToSetlist` | Client `onSnapshot setlists/{id}` | yes — undo path in use-add-to-setlist |
| R-Sub4 `useUpcomingPrep` query | Client `onSnapshot setlists where eventDate` | yes — feeds HeroCard/UpcomingTimeline/PrepRecommendations |
| R-Sub5 `useSetlistPerformance` `setlistRef` sub | Client `onSnapshot setlists/{id}` | yes — feeds perform-view's embedded fallback (R-Dexie3) |

### Top-level `tracks/{id}` readers — total of TWO in production

| Reader | Source mechanism |
|---|---|
| R27 SSR editor (hydrated branch) | Admin `db.collection("tracks").where("setlistId","==", id).get()` |
| R28 snapshot-listener | Client `onSnapshot query(tracks where setlistId == X)` |

Everything else reading "top-level data" reads it through Dexie (R-Dexie1, R-Dexie3, R-Dexie4, R-Dexie5, R-Dexie7), where it arrived via R28 or the engine's writeback after applyEdit.

---

## Verification footer

### Files opened directly
- `src/lib/setlist-firebase.ts` (full)
- `src/app/(main)/setlists/[id]/page.tsx` (full)
- `src/app/perform/setlist/[id]/page.tsx` (full)
- `src/hooks/use-setlist-performance.ts` (full)
- `src/components/setlist/grid/SetlistGridHydrator.tsx` (full)
- `src/components/setlist/grid/SetlistGrid.tsx` (lines around 940-1500)
- `src/lib/print-pipeline.ts` (full)
- `src/app/api/setlist/print/route.ts` (full)
- `src/app/api/setlist/print/personal/route.ts` (full)
- `src/app/api/setlist/print/public/route.ts` (full)
- `src/app/api/setlist/print/prepare/route.ts` (full)
- `src/app/api/setlist/publish/route.ts` (full)
- `src/app/api/setlist/email-packets/route.ts` (full)
- `src/app/api/setlist/resend-email/route.ts` (full)
- `src/app/api/setlist/rename/route.ts` (full)
- `src/app/api/setlist/delete/route.ts` (header-only)
- `src/app/api/setlists/import/parse/route.ts` (full)
- `src/app/api/setlists/import/execute/route.ts` (full)
- `src/app/api/setlists/matrix/route.ts` (full)
- `src/app/api/scheduling/assign/route.ts` (full)
- `src/lib/new-song-detector.ts` (full)
- `src/lib/scheduling-firebase.ts` (full)
- `src/lib/snapshot-listener.ts` — actually `src/lib/sync/snapshot-listener.ts` (full)
- `src/lib/server-auth.ts` (around `serializeSetlist`)
- `src/lib/server-setlists.ts` (full)
- `src/lib/sync/engine.ts` (lines 250-310)
- `src/lib/setlist-audit.ts` (full)
- `src/hooks/use-add-to-setlist.ts` (full)
- `src/hooks/use-setlist-dashboard.ts` (full)
- `src/hooks/use-upcoming-prep.ts` (full)
- `src/hooks/use-creation-wizard.ts` (clone path)
- `src/hooks/use-batch-selection.ts` (full)
- `src/components/admin/TemplatesSection.tsx` (first 90 lines)
- `src/components/performance/SetlistDrawer.tsx` (full)
- `src/components/performance/PublicSetlistListing.tsx` (full)
- `src/components/setlist/SetlistCards.tsx` (UpcomingSetlistCard region)
- `src/components/setlist/SetlistHistoryPanel.tsx` (header)
- `src/components/dashboard/HeroCard.tsx` (around lines 40-95)
- `src/components/setlist/grid/MobileCardList.tsx` (lines 1-160)
- `src/components/setlist/grid/AddRowPlaceholder.tsx` (around line 45)
- `src/components/setlist/grid/ReconciliationProvider.tsx` (lines 200-360)
- `src/app/(main)/setlists/page.tsx` (full)
- `src/app/(main)/DashboardClient.tsx` (around line 100)

### Greps run (patterns)
- `\.tracks\b` (across `src/`)
- `["']tracks["']`
- `db\.tracks|getDb\(\)\.tracks`
- `useLiveQuery`
- `subscribeToSetlist|subscribeToAllSetlists|getSetlist|subscribeToOwn`
- `serialized\.tracks|initialTracks|data\.tracks|setlist\.tracks`
- `collection\(.*['"]tracks['"]\)|collection\(.*tracks\)`
- `collection\(\s*db\s*,\s*['"]tracks['"]|db\.collection\(['"]tracks['"]\)|fsCollection.*['"]tracks['"]`
- `tracks|setlistTracks|setlistDoc` in api/scheduling, api/setlist subtrees
- `getUpcomingSetlists|getRecentSetlists|getAllSetlists` consumer search

### Directly confirmed (read code + line-pinned)
- All R1–R28 entries, all R-Dexie1–R-Dexie7 entries, and all R-Sub1–R-Sub5 entries are confirmed against the cited file:line ranges at HEAD `4ee6e70`.

### Inferred (not directly observed in this pass)
- That `setlistConverter` in `@/types/schemas` preserves the embedded `tracks: SetlistTrack[]` array verbatim on read. (Confirmed by behavior of all downstream consumers; not by reading the converter file directly.)
- That `useSafeFirestoreSync<Setlist[]>` and `useSafeFirestoreSync<Setlist>` preserve the embedded array in their returned `data`. (Confirmed by use sites; not by reading the hook directly.)
- That `c9e92a5` introduced R27 (`fetchTopLevelTracks` SSR top-level read) is asserted in the commit history hint; I read the current code at HEAD, which contains the dual branch as expected.
- The functions/ directory referenced in the brief does NOT exist at HEAD — no Cloud Functions surface to audit.
