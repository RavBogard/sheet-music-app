# D — What else shares the setlist failure modes

Read-only scan, 2026-11-03, against `master` @ 4cd2d8a9. It builds on A (write path) and B (read
path) and does not repeat them. The question: which other surfaces fail the way setlists do and
belong in the same redesign? The redesign: server transactions gated on the setlist version,
server truth plus visibly-pending own edits, and pruning.

The mechanism being tested for, in three parts:
- **(a) Drift.** A writer changes a row without moving the stamp that receivers compare
  (`updatedAt` for the Dexie listener, `version` for the strip and `lastSeenVersion`).
- **(b) Freeze.** A local outbox row, `failed` included, pins a doc so it no longer takes server
  deliveries.
- **(c) Ghost.** A Dexie row the server lacks is never pruned.

An item is IN only if it fails by one of these. Everything else is LATER.

Severity: **live** = harms someone today; **latent** = needs a plausible concurrent edit;
**cosmetic** = wrong UI, no wrong data.

---

## 1. Local-first users: Dexie tables, outbox writers, Dexie readers

Dexie has three entity tables (`schema.ts:14-21`; `LocalCollection = 'setlists' | 'tracks' |
'songs'`, `types.ts:4`). Every outbox entry goes through `applyEdit` (`write.ts:97`) and one
global engine.

### Ranked by harm (band on iPads first, then Daniel's authoring)

**1. Track page numbers (`liturgyRef`/`momentId`) written server-side with no `updatedAt` or
`version` bump. Live harm now. Drift. IN.**
- Writers:
  - `PUT /api/liturgy/bind-row`: `trackRef.update({liturgyRef, momentId})`
    (`src/app/api/liturgy/bind-row/route.ts:87-90`), fired from the grid after every title edit.
  - MCP `propose_liturgy_bindings` commit (`src/lib/mcp/tools/liturgy-bindings.ts:361-366`,
    `:384-386`).
  - MCP `update_setlist` with a book change: re-resolves and rewrites `liturgyRef` on every row
    (`src/lib/mcp/tools/setlist-write.ts:515-523`), or clears every row's page (`:490`).
- A Dexie device's track listener drops a delivery whose `updatedAt` is not newer than the local
  copy (`snapshot-listener.ts:350-358`, `guard-skipped-stale`). These writes leave `updatedAt` as
  it was, so **every signed-in iPad and editor that already holds the row keeps the old page, or
  no page, until IDB is wiped**. This holds even with the orgId hotfix in place. With no `version`
  bump, the Perform strip and MCP `lastSeenVersion` are blind to these writes too.
- A later browser `set` (duplicate, undo, hydrator fan-out) or a stale-copy update writes the old
  `liturgyRef` back.
- Band harm: the band calls pages from these numbers. This is the worst adjacent item.
- The right model already exists: `backfill-track-mimetype.ts:310-318` stamps
  `updatedAt + version: increment(1)`.
- Redesign requirement: **every server write to `tracks/*` or `setlists/*` goes through one helper
  that bumps `updatedAt` and row `version`, and bumps setlist `version` in the same batch or
  transaction.** Add a guard test that greps for `.collection("tracks").doc(...).update(` outside
  that helper.

**2. Perform-side outbox writes on band iPads, with no saving or failed signal in Perform. Live
(latent trigger). Freeze. IN.**
- `src/lib/live-director.ts`:
  - `changeTrackKey` (`:36-43`): no `expectedUpdatedAt`.
  - `swapTrackChart` (`:56-89`): fileId/title/key/bpm, no precondition.
  - `insertTrack` (`:114-191`): structural, already in A.
- `SmartScoreViewer.tsx:503-508` **writes a key automatically** whenever a band_leader opens a
  MusicXML row with an empty key. The user does nothing to trigger it.
- Perform mounts no `SyncIndicator` and no `ReconciliationProvider`. Its only write feedback covers
  live reorder (`SetlistPerformClient.tsx:474-483`, `:904`).
- When one of these rows fails (VersionMismatch after an MCP compaction, auth expiry,
  RemoteDocMissing), that doc on that iPad stops taking server deliveries for good (B #5). Nobody
  on the iPad can see it or fix it.
- The auto key-heal also reads `trackKeyRef` from a Dexie copy that may be stale. It writes with
  no precondition and can overwrite a key that MCP `update_track` has just set.
- Redesign: every Perform write becomes a server op (insert, key, swap), or at least shows its
  pending and failed state in Perform. The key-heal becomes a server op that fills an empty key
  only, `if empty`, inside the transaction.

**3. Structural browser callers that A does not list. Latent (authoring, and the band via
gaps). Drift and ghost. IN.**
- `use-add-to-setlist.ts` ("Add to setlist" from the library, upload dialog and scraper):
  - `order = setlist.trackCount + i`, where the count comes from the dashboard's setlist snapshot
    (`:146`, `:154-175`, `addDirectlyToSetlist` `:209`, `:261`).
  - N independent `set`s, then a direct `updateSetlist({hydrated:true}, expected)` (`:180`, `:286`).
  - Undo is N unconditional deletes (`:209-220`).
  - A stale `trackCount` gives duplicate or gapped `order`. This is the incident signature,
    reached from a different screen.
- Browser setlist create, wizard and duplicate (`setlist-firebase.ts:216-245`, `:355-388`; callers
  `use-creation-wizard.ts:231`, `use-setlist-dashboard.ts:212`, `:311`, `use-add-to-setlist.ts:322`):
  - The parent doc is `addDoc`'d directly with `trackCount: N`.
  - Its rows follow as N outbox `set`s (`seedTopLevelTracks`, `:181-205`).
  - A dead-lettered seed leaves a setlist whose count says N while its rows are fewer, with the
    ghost rows visible only on the creator's device.
  - MCP `create_setlist` and `clone_setlist` already do this in one batch (`clone-setlist.ts:384`).
- Derived counts have three writers: client `reconcileSetlistTrackCount`
  (`track-count-sync.ts:61-103`), server `setlist-track-count.ts:95`, and cron
  `recompute-all-setlist-counts`. None of them bumps `updatedAt`, by design. The redesign should
  compute counts inside the op transaction and drop the client reconcile.

**4. Setlist doc metadata written through the outbox, no version. Latent (authoring; the BL
tenant's `gig`). Drift. IN.**
- `SetlistMetaEditSheet.tsx:205-210` sends an `update` with no `expectedUpdatedAt`, which makes it
  pure last-writer-wins.
- The adapter stamps `updatedAt` and not `version` (A §1a).
- `gig` is replaced as a whole map (`:183-194`). It is seeded from the Dexie setlist (`SetlistGrid.tsx:1038`),
  and that copy freezes while an outbox row is pending (`snapshot-listener.ts:243-245`). So a
  Brothers Lazaroff gig edited in the browser can wipe set or target changes that MCP
  `update_setlist` has made (`src/lib/setlist-write.ts:334-335`, which bumps version).
- Other setlist-doc writers that skip `version`:
  - `/api/setlist/rename` (`route.ts:51-54`, `updatedAt` only).
  - `/api/setlist/transfer` (`route.ts:47-51`, neither stamp).
  - Direct `updateSetlistWithVersion` (`setlist-firebase.ts:72-97`), a fourth browser path.
- Redesign: metadata becomes one more op on the same versioned route (it is cheap: one call site),
  and rename/transfer bump `version`.

**5. `songs` defaults through the shared outbox. Latent and low harm, except that it feeds the
global "saving" spinner. Partly IN (FSM only).**
- `defaults.ts:100-105` debounces an `update` that replaces the whole `defaults` map and the
  `recent` array. It builds them from the Dexie copy and sends no precondition.
- MCP `update_song` writes dotted `defaults.key/bpm` and mirrors to `library_index`
  (`song-metadata.ts:184-185`). The browser path writes `songs` only, so the browser can revert an
  MCP default, or `defaults.durationSec`.
- The engine and FSM are global (A §2a), so **one failed songs row is enough to spin the grid's
  "saving" forever on any setlist.**
- IN: the FSM and freshness fix must attribute pending and failed rows to their entity, so a songs
  row never drives a setlist's indicator.
- LATER: moving song defaults to a server op.

**6. Dexie readers that need the snapshot-replaces-cache rule. IN** (B named the first two; the
rest are listed for completeness).
- Perform `use-setlist-performance.ts:196-205, 287-292`; grid `SetlistGrid.tsx:1008`,
  `:1038`.
- Drawer `SetlistDrawer.tsx:250-254`; dashboard upcoming prep through
  `use-dexie-tracks-for-setlists.ts:32-38` → `use-upcoming-prep.ts:175-179` (Dexie wins over the
  Firestore setlist).
- Song pickers `ChartPickerList.tsx:216` and `MobileCardList.tsx:150-155` read Dexie `songs`:
  - The songs listener (`subscribe.ts:122-150`) is server-authoritative. It has no outbox guard
    and no pruning on resubscribe: a song deleted while the device was away stays in the picker.
    That is a ghost, but in a picker, not a setlist. **LATER.**
  - The upload callbacks put unstamped rows (`SongChartsLibrary.tsx:420-425`, `:445-450`).
    **LATER.**
- The Dexie `setlists` row has its own freeze: counts written without `updatedAt` are never
  applied (`snapshot-listener.ts:262-264`). Nothing renders those counts from Dexie today, so
  cosmetic. It is fixed for free once the snapshot replaces the cache.

**Not affected (checked):**
- Perform tonight overrides (`tonight-client.ts:164-180`) run one client `runTransaction` on one
  doc, which is the correct model.
- The mixer has its own ack protocol.
- Song preferences and annotations are per-user docs.
- The chart byte cache (`offline-idb`) holds immutable bytes.

---

## 2. Tenant-scoped client queries (every client `query`/`collection` list)

`collectionGroup` is used by no client code. Rules are from `firestore.rules`. "OK" means a crc
`bl` and a BL member each succeed on their own host.

| # | Query (file:line) | Filter | Rule | Verdict |
|---|---|---|---|---|
| 1 | tracks `setlistId==` (prod `snapshot-listener.ts:176-179`, test path `:124-127`) | **none** | `atLeast(listOrg(),'pe')` `:290` | **DENIED for every non-po user.** Hotfix in flight (`.claude/worktrees/agent-a90e9167…` `fix/tracks-listener-orgid`). Cross-tenant viewers also need the API fallback (B #15). IN |
| 2 | tracks `orgId+setlistId` `client-tracks.ts:109-113` | orgOf(setlist) | same | OK, with API fallback |
| 3 | tracks `orgId+setlistId` `track-count-sync.ts:82-87` | committed row's org | same | OK (and goes away in the redesign) |
| 4 | tracks `orgId+momentId` / `orgId+liturgyRef.unitId in` `tonight-client.ts:185-190` | host org | same | OK |
| 5 | setlists `orgId, date desc, 50` `setlist-firebase.ts:337` | host org | `:215` | OK |
| 6 | setlists `orgId, date desc, 20` `setlist-firebase.ts:467` | host org | same | OK |
| 7 | setlists `orgId+eventDate` `use-upcoming-prep.ts:101-108`, `MobileTabBar.tsx:146-153`, `scheduling-firebase.ts:92-97` | host org | same | OK |
| 8 | setlists `orgId, date desc, 10` `TemplatesSection.tsx:55-61` | host org | same | OK |
| 9 | songs `orgId==` `subscribe.ts:81`, `prime.ts:51-52` | host org | `me` `:336` | OK for me+; `pe` is denied (intended) |
| 10 | library_index `visibleToOrgs array-contains` + `orgId !=` `shared-source.ts:84-89` | host org | `sharedSeesList()` `:354` | OK for non-`pe` |
| 11 | collections `sharedWith`/`assignedTo array-contains` `shared-source.ts:71` | host org | `:190-194` | OK |
| 12 | templates `orgId==` `template-firebase.ts:154` | host org | `me` `:387` | OK |
| 13 | recordings `orgId==` / `orgId+songId` `featured-client.ts:38`, `recordings-client.ts:36-40` | host org | `me` `:343` | OK |
| 14 | auditLogs `orgId==` `AccessAuditLog.tsx:43-48` | host org | `ad` `:556` | OK (admin screen) |
| 15 | scheduling_assignments `musicianUid==` `scheduling-firebase.ts:27-32` | uid branch | `:466` | OK |
| 16 | scheduling_assignments `orgId==` `scheduling-firebase.ts:61-66` | host org | `bl` | OK for bl. Scheduling is retired. LATER |
| 17 | users/{uid}/notifications `notification-store.ts:55-59`, `:110-113`; users/{uid}/songPreferences `use-upcoming-prep.ts:147-149` | path | self | OK |
| 18 | setlists/{id}/history `setlist-audit.ts:97` | path | `ad` `:229` | bl denied; the only consumer, `SetlistHistoryPanel`, is mounted nowhere (dead). LATER |
| 19 | sync_runs `orderBy startedAt` `LibraryDataSection.tsx:90-95` | none | **no rule → catch-all deny, po included** | Admin Data tab "last sync" always blank. Cosmetic. LATER |

Every other client read is a single-doc `get` or `onSnapshot(doc)`.

**Proposed structural guard (one helper plus one emulator test):**
1. **`tenantQuery(db, coll, org, ...constraints)`** in `src/lib/firestore/tenant-query.ts`. It
   always prepends `where('orgId','==',org)`, and `org` is a required `OrgId`, never defaulted.
   Every tenant-collection list in the table goes through it. The array-contains shared queries
   (#10, #11) and the uid/path queries (#15, #17) are exported as named builders from the same
   module.
2. **A static guard** (plain vitest, no emulator). It scans `src/**` minus `app/api`, `lib/mcp`,
   server-only modules and tests, and fails on any `query(collection(` or `collection(db,'<tenant
   collection>')` used for a list outside `tenant-query.ts`. Row 1 would have failed it.
3. **`client-queries-tenancy.emulator.test.ts`.** It imports every exported builder (a registry
   `CLIENT_QUERIES`) and runs each one as both `getDocs` **and** `onSnapshot`. The listener is the
   case that slipped through: today's test runs `getDocs` with a different query
   (`firestore-rules-get-vs-list.emulator.test.ts:195-206`). The personas are crc `bl`, crc `mu`,
   crc `pe`, BL `bl`, BL `mu`, a crc-only member on the BL host, signed out, and `po`. Each pair is
   checked against an expected allow/deny matrix kept beside the registry. Both tenants are
   seeded, and each persona must see zero rows of the other tenant.

---

## 3. Writer uniformity (the same entity, different rules)

| Entity / field | Paths | Divergence | Scope |
|---|---|---|---|
| track `liturgyRef`/`momentId` | grid applyEdit; bind-row route; MCP propose_liturgy_bindings; MCP update_setlist rebook | 3 of the 4 skip `updatedAt`/`version` (§1 #1) | **IN** |
| track `key`/`fileId`/`title` | grid applyEdit (precondition); Live Director (none); SmartScoreViewer auto-heal (none); MCP update_track/swap_chart (versioned, optional gate) | Perform paths are last-writer-wins and invisible | **IN** |
| track membership/order | A's list plus `use-add-to-setlist`, browser create/duplicate seeding, `performed.ts:373-395` (writes a new clone in one batch; harmless) | §1 #3 | **IN** (not performed.ts) |
| setlist meta (`name`, `eventDate`, `gig`, rabbi, type) | outbox (no precondition, no version); direct `updateSetlistWithVersion` (updatedAt); rename route (updatedAt); transfer route (neither); MCP update_setlist (version) | §1 #4 | **IN** |
| setlist derived counts | client reconcile; server recount; cron | three writers, no stamp | **IN** (into the op tx) |
| songs `defaults`/`recent` | browser whole-map outbox; MCP dotted fields plus library_index mirror | browser can revert MCP; only MCP keeps library_index in step | LATER |
| songs/library_index catalogue (title, status, visibility) | library rename/archive routes, drive-sync, visibility-job, library-verify (`library-verify.ts:417-428`), MCP library tools | two-collection mirror written by many server paths; no Dexie freeze (the songs listener is server-wins) | LATER |
| setlist `isTest` | MCP setlist-hygiene `batch.update` (`setlist-hygiene.ts:142-145`) | no stamp; not shown on iPads | LATER |

---

## 4. Freshness signalling: no single source of truth

| Signal | Source | Covers | Gap |
|---|---|---|---|
| Grid `SyncIndicator` (`SyncIndicator.tsx:112-142`) | global engine FSM (`store.ts`) | all outbox rows, every collection and every setlist | spins forever behind any failed row (A §2a); not per setlist; absent from Perform |
| `ReconciliationProvider` modal (`:203-244`) | FSM `conflict` plus failed rows | grid only | hidden by `saving`; "take theirs" does not restore (B #6) |
| Perform "updated since load" strip (`use-setlist-performance.ts:297-298`; `SetlistPerformClient.tsx:392`) | setlist `version` vs SSR | **signed-out only** | blind to browser and liturgy writes (no version bump) and to signed-in devices |
| Perform reorder conflict copy (`SetlistPerformClient.tsx:474-483`, `:904`) | 409 from `/api/setlist/reorder` | live reorder only | other Perform writes have no signal |
| Offline chips: `OfflineIndicator.tsx:18-28`, `PerformanceOfflineIndicator.tsx:29-45`, `DesktopHeader.tsx:119-124` | three separate `navigator.onLine` listeners | connectivity | say nothing about whether the data is current; a dead listener online looks healthy |
| Moved-row highlight (`use-moved-row-highlight.ts:50-70`) | order diff | receivers | fires on every intermediate state (B §2) |
| `setlistLiveStamp` (`use-setlist-performance.ts:303-310`) | setlist version or updatedAt | reload dedupe key | inherits the same blindness |

There is **no** single answer to "is this device current for setlist X, and are its edits saved?".
Listener liveness, last server version seen, per-setlist pending and failed ops and connectivity
are all known, but in different modules, and none of them feeds a shared state. **IN:** one
per-setlist `useSetlistFreshness(id)` → `{serverVersion, lastServerAt, source:
'listener'|'poll'|'ssr', pending, failed, online}`, fed by the snapshot/poll layer and the op
queue. The grid indicator, the Perform strip (signed in or not) and the Perform pending and
failed marks all read it. The three `navigator.onLine` copies collapse into it.

---

## Summary

**IN, ranked:**
1. Unversioned server track writes for page numbers (bind-row, propose_liturgy_bindings,
   update_setlist rebook). They never reach Dexie devices. Live.
2. Perform outbox writes (Live Director key, swap, insert, and the automatic MusicXML key-heal)
   with no pending or failed signal. They freeze rows on band iPads.
3. Structural callers outside the grid: `use-add-to-setlist` (stale `trackCount` order), browser
   create/duplicate/wizard seeding, and the three-writer derived counts.
4. Setlist metadata via the outbox, plus the rename/transfer routes: no version; the BL `gig` map
   is last-writer-wins against MCP.
5. One per-setlist freshness source. The FSM attributes rows per entity, so a songs row cannot
   spin a setlist.
6. Tenant-query guard: the `tenantQuery` helper, the static scan and the persona × query emulator
   matrix run as `onSnapshot`, plus the API fallback for cross-tenant listeners.

**LATER:**
- Songs defaults moved to the server.
- songs/library_index mirror writers.
- Songs listener pruning on resubscribe, and the unstamped upload `songs.put`.
- `sync_runs` without a rule.
- Dead `SetlistHistoryPanel` (ad-only history).
- Retired scheduling queries.
- `isTest` hygiene stamp.

**Housekeeping:** three agent worktrees are live under `.claude/worktrees/`:
`investigate/sync-repro` (the stopped narrow patch, to sweep), `fix/tracks-listener-orgid` (the
hotfix) and one locked one. There is also `wt-perform-settle` beside the repo.
