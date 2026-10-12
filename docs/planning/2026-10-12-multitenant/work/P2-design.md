# P2 design — Membership and roles (multi-tenant phase 2)

Designer: Claude Code (Opus 5.5), 2026-10-12, read-only survey of branch `claude/multitenant-2026-10-12` (HEAD `7f09c2ed`).
Subagents: Opus and Sonnet only (R-0919-audit-9). Repeat this line in any sub-order you write.

Binding inputs: `HANDOFF-CODE-MULTITENANT-2026-10-12.md` §Phase 2 and §Do not; `RULINGS-MULTITENANT-2026-10-12.md` (ruling 5 supersedes analyst B's David mapping: **David = admin of `crc` and `brotherslazaroff`; every other current admin = admin of `crc` only; Daniel = sole platform owner `po`**); `work/B-auth-roles-mcp-domains.md`; P0/P1 returns.

Already true in production (not re-done here): every tenant-owned top-level doc carries `orgId` (manifest `manifests/stamp-orgid-2026-10-12T18-24-12-450Z.json`); every `library/**` Storage object carries `metadata.orgId` (`manifests/stamp-storage-orgid-2026-10-12T18-26-47-475Z.json`); P0 restricted self-writes on `users/{uid}`.

Naming used below. Tenant A = `crc`, tenant B = `brotherslazaroff`. Role codes in claims: `ad` admin, `bl` band_leader, `mu` musician, `me` member, `pe` pending. Rank: ad 4, bl 3, mu 2, me 1, pe 0, none −1. "≥bl in T" means rank ≥ 3 in tenant T, or `po`.

---

## 1. Query inventory (browser SDK)

Method: every file under `src/` importing `firebase/firestore` (static or `await import`), excluding tests (40 files), every `getDoc/getDocs/onSnapshot/query/collectionGroup/getDocFromCache` call. There is **no `collectionGroup`** use in the browser. Roles: "any" = every signed-in role that reaches the surface.

### 1.1 Inventory by collection

| # | Collection / path | file:line | Filters / orderBy | Who runs it | Constrains orgId? |
|---|---|---|---|---|---|
| S1 | `setlists/{id}` get (listener) | `src/lib/setlist-firebase.ts:242` (`subscribeToSetlist`) | by id | any, incl. signed out | n/a (get) |
| S2 | `setlists/{id}` get (listener) | `src/hooks/use-setlist-performance.ts:133` → `useSafeFirestoreSync` | by id | any, incl. signed out (Perform) | n/a |
| S3 | `setlists/{id}` get | `src/lib/sync/snapshot-listener.ts:109`, `:159` | by id | editors | n/a |
| S4 | `setlists/{id}` get | `src/lib/sync/init.ts:106,149,164,221` (post-write re-read, `readDoc`) | by id | editors | n/a |
| S5 | `setlists/{id}` get | `src/lib/setlist-firebase.ts:420-421` (`findLastMatchingService`, default pointer) | by id | ≥me (wizard) | n/a |
| S6 | `setlists` list | `src/lib/setlist-firebase.ts:313-314` (`subscribeToAllSetlists`) | `orgId ==`, `orderBy date desc`, `limit 50` | any (dashboard) | **yes** |
| S7 | `setlists` list | `src/lib/setlist-firebase.ts:440-442` (`findLastMatchingService` fallback) | `orderBy date desc`, `limit 20` | ≥me (wizard) | **no** |
| S8 | `setlists` list | `src/components/nav/MobileTabBar.tsx:127-133` | `eventDate >= now`, `orderBy eventDate`, `limit 1` | any (Perform tab) | **no** |
| S9 | `setlists` list | `src/hooks/use-upcoming-prep.ts:94-99` | `eventDate` range, `orderBy eventDate`, `limit 5` | ≥me | **no** |
| S10 | `setlists` list | `src/lib/scheduling-firebase.ts:118-124` (`subscribeToUpcomingSetlists`, schedule page) | `eventDate >= today`, `orderBy eventDate` | any on /schedule | **no** |
| S11 | `setlists` list | `src/components/admin/TemplatesSection.tsx:49-54` | `orderBy date desc`, `limit 10` | ≥bl (/manage) | **no** |
| T1 | `tracks` list | `src/lib/client-tracks.ts:96-100` | `setlistId ==` | signed-in (signed-out goes to `/api/setlists/{id}/tracks`) | no |
| T2 | `tracks` list (listener) | `src/lib/sync/snapshot-listener.ts:124`, `:176` | `setlistId ==` | editors / Perform signed-in | no |
| T3 | `tracks` list | `src/lib/sync/track-count-sync.ts:53-58` | `setlistId ==` | editors | no |
| T4 | `tracks` list | `src/lib/performance/tonight-client.ts:178`, `:181` (`fetchMomentFileIds`) | `momentId ==` / `liturgyRef.unitId in`, `limit 500` | ≥bl (Tonight swap sheet) | no (results intersected with own library) |
| T5 | `tracks/{id}` get | `src/lib/sync/init.ts:106,149,164,221` | by id | editors | n/a |
| G1 | `songs` list (listener) | `src/lib/songs/subscribe.ts:77` | `orgId ==` | editors (picker) | **yes** |
| G2 | `songs` list | `src/lib/songs/prime.ts:39` | none (whole collection) | dead in production (`SetlistGridHydrator.tsx:85` voids it) | no |
| G3 | `songs/{id}` get | `src/lib/sync/init.ts:221` (`readDoc`) | by id | editors | n/a |
| R1 | `recordings` list | `src/lib/recordings/recordings-client.ts:34-40` | `orgId ==`, `songId ==`, `orderBy createdAt desc` | ≥me | **yes** |
| SA1 | `scheduling_assignments` list | `src/lib/scheduling-firebase.ts:28-35` (`subscribeToMyAssignments`) | `musicianUid == me`, `status in`, `orderBy assignedAt` | any | via `musicianUid` (own rows) |
| SA2 | `scheduling_assignments` list | `src/lib/scheduling-firebase.ts:56-62` (`subscribeToSetlistAssignments`) | `setlistId ==`, `status in` | **no callers** (dead) | no |
| SA3 | `scheduling_assignments` list | `src/lib/scheduling-firebase.ts:89-95` (`subscribeToAllUpcomingAssignments`; callers `src/app/(main)/schedule/page.tsx:42`, `src/hooks/use-calendar-data.ts:57`) | `status in`, `orderBy assignedAt desc`; org filtered **in memory** | ≥bl | **no** — today this query is refused by the rules for every non-admin band leader (the rule reads `orgId`; the query does not constrain it) and the callback gets `[]` |
| TK1 | `tasks` list (listener) | `src/components/dashboard/TaskCards.tsx:32-40` | `assigneeId == me`, `status ==`, `orderBy createdAt` | any | via `assigneeId` |
| TM1 | `templates/{key}` get | `src/lib/template-firebase.ts:86` (`getCustomTemplate`) | by id `keyFor(org,key)` | ≥bl (wizard, template editor) | n/a (doc may not exist) |
| TM2 | `templates` list (listener) | `src/lib/template-firebase.ts:164-171` (`useCustomTemplates`) | crc: **whole collection**; others: `documentId()` range `org__…` | any using wizard | **no** |
| AL1 | `auditLogs` list (listener) | `src/components/admin/people/AccessAuditLog.tsx:34-37` → `useSafeFirestoreSync` | `orderBy timestamp desc`, `limit 20` | admin | **no** (rows carry no `orgId`) |
| U1 | `users/{me}` get/listener | `src/lib/users-firebase.ts:20` (`ensureUserProfile`), `:73-81` (`subscribeToUserProfile`) | self | any | n/a |
| U2 | `users/{me}` listener | `src/lib/musician-profile.ts:31` (callers pass `user.uid`: `MusicianProfileSettings.tsx:24`, `use-musician-transposition.ts:55`, `use-setlist-performance.ts:305`) | self | any | n/a |
| U3 | `users` list (listener) | `src/lib/users-firebase.ts:116-118` (`subscribeToAllUsers`; callers `src/components/admin/PeopleSection.tsx:32`, `src/components/monitor/BusAssignmentPanel.tsx:37`) | `orderBy createdAt desc` | ≥bl (People), sound-engineer panel | no — **all users of all tenants** |
| U4 | `users` list (listener) | `src/lib/musician-profile.ts:108-109` (`subscribeToAllMusicianProfiles`; caller `src/components/setlist/PrintModal.tsx:105`) | `role in [...]` | anyone opening Print (only ≥bl succeed today) | no |
| U5 | `users` list | `src/lib/notification-store.ts:217-221` (`getActiveMemberUids`; only caller `notifySetlistPublished`, which has **no callers**) | `role in [...]` | dead | no |
| UN1 | `users/{me}/notifications` list | `src/lib/notification-store.ts:55-61`, `:110-114` | `orderBy createdAt`, `read == false` | any | n/a (self path) |
| UP1 | `users/{me}/songPreferences/*` | `src/lib/song-preferences.ts:51-53`; `src/components/performance/RehearsalToolbar.tsx:70`; `src/hooks/use-upcoming-prep.ts:139-149` | self | any | n/a |
| UP2 | `users/{me}/preferences/*` | `src/app/(main)/monitor/MonitorClient.tsx:63`; `src/components/monitor/QuickMonitorPanel.tsx:74`; `src/hooks/use-upcoming-prep.ts:66-68` | self | any | n/a |
| M1 | `memberships` | — | — | none today | — |
| C1 | `config/congregation` / `config/congregation__{org}` listener | `src/lib/congregation-store.ts:145-146` | by id (`congregationDocId(org)`) | any | n/a |
| C2 | `config/defaults` get | `src/lib/setlist-firebase.ts:373-374` (`getDefaultForServiceType`) | by id — **one doc shared by all tenants** | ≥me (wizard) | n/a |
| C3 | `config/monitor` get / listener | `MonitorClient.tsx:72`; `SoundSystemSection.tsx:50,156`; `DefaultChannelPicker.tsx:33`; `use-monitor-access.ts:52`; `use-monitor-connection.ts:71` | by id | anyone whose nav mounts the mixer hooks | n/a |
| ML1 | `monitor-live/state` listener | `src/lib/firestore-monitor-client.ts:137-138` | by id | mixer users | n/a |
| ML2 | `monitor-live/commands/acks/{id}` listener | `src/lib/firestore-monitor-client.ts:413-414` | by id (own command) | mixer users | n/a |
| P1 | `setlists/{id}/performance/overrides` listener | `src/lib/performance/tonight-client.ts:116-117` | by id | signed-in Perform | n/a |
| H1 | `setlists/{id}/history` list | `src/lib/setlist-audit.ts:96-98` (caller `SetlistHistoryPanel.tsx:77`) | `orderBy timestamp desc`, `limit` | today only admins succeed | path-scoped |
| LS1 | `library_signals/latest` listener | `src/hooks/use-library.ts:86` | by id | any | n/a |
| GA1 | `system/globalAlert` listener | `src/lib/alert-store.ts:36-37` | by id | any | n/a |
| SR1 | `sync_runs` list | `src/components/admin/LibraryDataSection.tsx:82-87` | `orderBy startedAt desc`, `limit 1` | admin | n/a — **no rule exists; denied today and after** (leave; log as pre-existing) |

No browser code reads `contacts`, `setlistTemplates`, `scheduling_history`, `musician_availability`, `live_sessions`, `songUsage`, `bond_flags`, `proposal_stages`, `emailEvents`, `performedDeviations` (write-only), `library_index`, `publicSetlists`, `digitized_charts`, `aiConfig`, or any ops collection. Those rules are defence in depth only.

### 1.2 Per-collection rule and query verdict

| Collection | Proposed list / get rule (full text in §4) | Every existing query satisfies it? | Queries that must change |
|---|---|---|---|
| `setlists` | get `true`; list `signedIn()` (R-0919-audit-2, unchanged) | yes | **S7, S8, S9, S10, S11** pass the rule but leak other tenants' setlists into this tenant's UI. Add `where('orgId','==',org)` (org from `useOrg()`; `findLastMatchingService` takes `org` param from `use-creation-wizard.ts:150`). S7/S11 use existing index `(orgId, date desc)`; S8/S9/S10 need new index `(orgId ASC, eventDate ASC)`. |
| `tracks` | get `true`; list `signedIn()` (mirrors setlists; Perform listeners query by `setlistId` and must keep working for any signed-in viewer of a link) | yes | none required. T4 optional (`where('orgId','==',org)` adds nothing the library intersection doesn't). |
| `songs` | get+list `atLeast(orgId,'me')` | G1 yes; G3 yes (own tenant rows) | **G2**: delete `defaultFirestoreAdapter` body or add `where('orgId','==',org)`; it is dead (test seam). |
| `recordings` | `atLeast(orgId,'me')` | R1 yes | none |
| `scheduling_assignments` | `musicianUid == me || atLeast(orgId,'bl')` | SA1 yes | **SA3**: add `where('orgId','==',org)` (index `(orgId, status, assignedAt desc)` already exists); drop the in-memory filter. This *fixes* the empty view non-admin band leaders get today (log as a decision). **SA2**: delete (dead). |
| `tasks` | `assigneeId == me || atLeast(orgId,'me')` | TK1 yes | none |
| `templates` | get: `atLeast(orgId ?? tenant-from-id,'me')`, tolerant of a missing doc; list: `atLeast(resource.data.orgId,'me')` | **TM2 no** (id-range / whole-collection query cannot be proven against an id-derived tenant) | **TM2**: `query(collection(db,'templates'), where('orgId','==',org))` for every tenant (keep `selectOrgOverrides` for key mapping). Precondition: every `templates` doc carries `orgId` (stamp from id prefix; bare id → `crc`) — §6 step "extras". TM1 unchanged. |
| `auditLogs` | `po() || atLeast(orgId,'ad')` | **AL1 no** | **AL1**: `where('orgId','==',org)` + new index `(orgId ASC, timestamp DESC)`. Precondition: stamp existing rows `orgId:'crc'` (§6 extras); every server writer stamps `orgId` (§2). |
| `users` | get self or `po`; list `po` only | **U3, U4 no** (cross-user) | **U3/U4 move to `GET /api/tenant/people`** (§5). Callers: `PeopleSection.tsx:32`, `BusAssignmentPanel.tsx:37`, `PrintModal.tsx:105`. **U5**: delete `getActiveMemberUids` and `notifySetlistPublished` (no callers; Publish is retired). |
| `users/{me}/…` | self | yes | none. Notifications **create** becomes server-only (client `notifyRoleChanged` → set-role route writes it). |
| `memberships` | get own (even if absent) or ≥bl in its tenant; list own or ≥bl | new | new client read: `memberships/{org}__{uid}` listener in `auth-context.tsx` (§3.6). |
| `config/defaults` | per-tenant doc `defaults` (crc) / `defaults__{org}`; read ≥me, write ≥ad | C2 reads the shared doc | **C2 + `setDefaultForServiceType` (`setlist-firebase.ts:392`)**: use `doc(db,'config', org === 'crc' ? 'defaults' : 'defaults__'+org)`. CRC unchanged; BL stops reading CRC's pointers. Caller `use-setlist-dashboard.ts:257` passes `org`. |
| `config/congregation*` | read signed-in (unchanged); write ≥ad in its tenant | C1 yes | none |
| `config/monitor`, `monitor-live/*` | mixer tenant (`crc`) gates, §4 | C3/ML1/ML2 yes for CRC mixer users | none (BL-only users already get no mixer; a denied read degrades to "no access") |
| `setlists/{id}/history` | read ≥ad in setlist's tenant; create ≥me | H1 yes (path-scoped) | The client's `logSetlistChange(id,'deleted')` (after `/api/setlist/delete`) will be refused (parent gone). Move the `deleted` entry into `src/app/api/setlist/delete/route.ts` (Admin SDK, before the delete) and drop the client call. |
| `setlists/{id}/performance/overrides` | get signed-in (unchanged); write ≥bl in setlist tenant | P1 yes | none |
| `library_signals`, `system/globalAlert`, `orgs` | signed-in / signed-in / public | yes | none |

---

## 2. Writer inventory (tenant-owned documents)

Why it matters even for Admin SDK writers (which bypass rules): (a) client list queries now carry `where('orgId','==',org)` and list rules read `orgId`, so an unstamped row vanishes from its tenant; (b) "missing means crc" silently files a BL row under CRC. Rule for every fix: the tenant comes from the parent row, the token (`orgFrom(extra)`), or the host (`x-org-id`) — never from a request body.

### 2.1 Browser writers

| Collection | file:line | Stamps orgId? | Fix |
|---|---|---|---|
| `setlists` create | `src/lib/setlist-firebase.ts:204` `createSetlist` | yes (`hostOrgId()` :220) | — |
| `setlists` create | `setlist-firebase.ts:356` `duplicateSetlist` | yes (`rowOrg(source.orgId)` :352) | — |
| `setlists` create | `setlist-firebase.ts:504` `cloneSetlist` | yes (:500) | — |
| `setlists` create | `setlist-firebase.ts:557` `saveAsTemplate` | **no** | add `orgId: rowOrg(source.orgId)` to `templateData` (:543). Without it the new rules refuse the create. |
| `tracks` create (all through `applyEdit` → outbox → `src/lib/sync/init.ts:81` `setDoc`) | callers: `setlist-firebase.ts:180-195` (`seedTopLevelTracks`), `SetlistGrid.tsx:821,836` (undo/redo restore), `:1298` (duplicate row — copies source, may carry orgId), `:1494`, `:1541`, `:1565`; `SetlistGridHydrator.tsx:334`; `use-add-to-setlist.ts:148,202,270`; `MobileCardList.tsx:124`; `src/lib/live-director.ts` | **no** (only by accident when copying a server row) | One chokepoint, two layers: (1) `src/lib/local/write.ts` `applyEdit`, `op:'set'`, `collection:'tracks'`, `doc.orgId` absent → `orgId = rowOrg((await db.setlists.get(doc.setlistId))?.orgId)` before the Dexie transaction (keeps Dexie and Firestore equal); (2) `src/lib/sync/init.ts` `commitOutboxRow` `'set'` on `tracks` with no `payload.orgId` (rows queued by a pre-P2 bundle) → read `setlists/{setlistId}` (public get) and stamp `rowOrg(orgId)`. Rules additionally tolerate unstamped creates (§4.1 `trackOrg`) until step 5. |
| `songs` update | `src/lib/songs/defaults.ts:89` (sticky defaults via `applyEdit` update) | n/a (update keeps the field) | — |
| `templates` set | `src/lib/template-firebase.ts:109` `saveCustomTemplate` | yes (`orgId: org`) | — |
| `config/defaults` set | `setlist-firebase.ts:392` `setDefaultForServiceType` | single shared doc | per-tenant id (`defaults` for crc, `defaults__{org}` otherwise); `org` passed from `use-setlist-dashboard.ts:257` |
| `setlists/{id}/performance/overrides`, `performedDeviations` | `src/lib/performance/tonight-client.ts:138-144` | n/a (subcollection; parent's tenant via rules) | — |
| `setlists/{id}/history` | `src/lib/setlist-audit.ts:81` `logSetlistChange` | n/a (subcollection) | move the `'deleted'` entry server-side (§1.2) |
| `users/{uid}/notifications` (other users) | `src/lib/notification-store.ts:141` `createNotification`, `:166` `broadcastNotification` | n/a | delete client writers; set-role route writes the role-change notification |
| `config/monitor` | `SoundSystemSection.tsx:157-158`, `BusAssignmentPanel.tsx:73`, `DefaultChannelPicker.tsx:66` | n/a (mixer, crc) | — |
| `monitor-live/commands/pending` | `src/lib/firestore-monitor-client.ts:370` | n/a (mixer) | — |
| `system/globalAlert` | `src/lib/alert-store.ts:67` `setAlert` | n/a | no UI caller; rules make it po-only |
| `users/{me}` | `users-firebase.ts:58` (create), `:41`, `:189`; `musician-profile.ts:17`; `OnboardingCard.tsx:55`; `push-notifications.ts:71,90`; `scheduling-firebase.ts:206` | n/a | `users-firebase.ts:51-53` stops writing `role`/`orgIds` (§5.2) |

### 2.2 Server writers (Admin SDK) — exhaustive survey of creates and create-capable upserts

Stamp correctly today: `setlists` via `src/lib/setlist-write.ts:188` (`input.orgId ?? 'crc'`) from MCP `setlist-write.ts:255,280`, `clone-setlist.ts:343`, `templates.ts:1063`, `performed.ts` (clone); `tracks` via `setlist-write.ts:212`, `server-tracks-write.ts:315` and `:1877` (parent setlist org), `clone-setlist.ts:369`, `templates.ts:1093`, `performed.ts:369`; `recordings` `api/recordings/upload/route.ts:122` (host org); `contacts` `contacts.ts:185`; `setlistTemplates` `templates.ts:411,802`; `scheduling_assignments` `scheduling/assignment-service.ts:224` (parent setlist); `upload_batches` `intake/batch-store.ts:89`; `songs` mirrors `sync-engine.ts:307`, `chart-heal.ts:188`, `api/library/archive/route.ts:56`, `api/library/rename/route.ts:107`; `mcp_write_receipts` everywhere. No server create exists for `scheduling_history`, `musician_availability`, `live_sessions`, `tasks`, `publicSetlists`, `digitized_charts`, `templates`.

Gaps (each is a Lane 2 or Lane 3 fix, owned by the lane that owns the file — §9):

| # | Collection | file:line | Today | Fix (tenant source in scope) |
|---|---|---|---|---|
| W1 | `tracks` | `src/lib/mcp/tools/propose-changes.ts:594` (`commit_staged_changes` add; payload built at `:839` `buildNewTrackPayload`) | no orgId | `orgId: rowOrg(setlistData.orgId)` (`setlistData` in the transaction; org already checked at `:441`) |
| W2 | `proposal_stages` | `propose-changes.ts:266` | no orgId | `orgId: org` (param at `:166`) |
| W3 | `bond_flags` | `src/lib/mcp/tools/bond-corrections.ts:127` `flagBond(uid,args)` (registered `index.ts:1957`) | no orgId, **no tenant check** | add `org` param (`orgFrom(extra)`); refuse when the track's `rowOrg(orgId) !== org` (same `setlist_not_found` envelope as `loadEditableSetlist`); stamp `orgId: org` |
| W4 | `songUsage` + `songUsage/*/events` | `src/lib/song-usage.ts:52`, `:63` (callers `api/setlist/notify-band/route.ts:149`, `mcp/tools/setlist-publish.ts:942`) | no orgId | add `orgId` param = the setlist's `rowOrg(orgId)` (both callers hold the setlist); stamp summary (merge) and event. Key collision across tenants sharing a fileId is a phase 5 concern (log). |
| W5 | `library_index` + `songs` | `src/lib/library-upload.ts:680-682` `processChartUpload` (`input.orgId ?? 'crc'`; no caller passes it; MCP wrappers fix later with non-atomic `stampOrg`, `library-upload-session.ts:576` only conditionally) | crc then restamp | every caller passes `orgId`: MCP `library-upload.ts:201,654,1098`, `library-upload-session.ts:530`, `authored-chart.ts:351`, `intake/import-batch-job.ts:202` (`batch.orgId`) → pass `org`; `api/library/upload/route.ts:79` → host org; `setlist-import-execute.ts:209` → host org (threaded from the route); Drive inbox/poller `drive-sync/inbox.ts:238`, `poller.ts:845` → explicit `'crc'` (the Drive inbox is CRC's; phase 6 makes it config). Keep `stampOrg` as a no-op guard. Make `input.orgId` **required** in the type. |
| W6 | `library_index` | `src/lib/sync-engine.ts:278` `syncLibraryIndex` (new Drive rows, merge) | no orgId | explicit `orgId: 'crc'` on new rows (admin Drive sync of CRC's folder) |
| W7 | `setlists` + `tracks` | `setlist-write.ts:188` callers `src/lib/setlist-import/commit.ts:90` (`/api/setlists/import/commit-document`) and `src/lib/setlist-import-execute.ts:288` (`/api/setlists/import/execute`) | default crc | pass `orgId: coerceOrgId(ctx.req.headers.get('x-org-id'))`; make `input.orgId` required in `createSetlistServerSide` |
| W8 | `songs` stubs | `mcp/tools/library-verify.ts:408`, `reconcile-library.ts:818` (orphan-mark `set(...,{merge:true})` on possibly missing docs) | stub without orgId | stamp `orgId: rowOrg(indexRow.orgId)` (library-verify has the row; reconcile: read it or skip missing docs) |
| W9 | `library_index` stubs | `api/library/chord-cache/route.ts:237,265`, `api/library/detect-key/route.ts:38`, `reconcile-library.ts:808`, `bond-corrections.ts:460,470` (`from` row) | merge-upsert may create a stub | switch to `update()` guarded by existence (no stub rows) |
| W10 | `auditLogs` | `api/admin/delete-user/route.ts:42`, `api/admin/set-role/route.ts:57`, `src/lib/library/safely-delete-library-object.ts:160` | no orgId | stamp `orgId`: set-role → target tenant; delete-user → caller's host tenant; library delete → the row's `orgId`. All new writers through `setMembership` stamp it. |
| W11 | Storage `library/**` | `src/lib/firebase-storage.ts:116` `uploadToStorage(fileId, buffer, mime)` | no `metadata.orgId` | signature `uploadToStorage(fileId, buffer, mime, orgId)` writing `metadata.metadata.orgId`; callers: `library-upload.ts:353,385,555` (`input.orgId`), `chart-heal.ts:95` (`rowData.orgId`), `drive-sync/poller.ts:459` (`row.orgId`), `mcp/tools/reconcile-library.ts:456` (read the row), `sync-engine.ts:376` (`'crc'`). |
| W12 | not in the P2 list | `upload_sessions` (`library-upload-session.ts:283,680`), `bond_corrections` (`bond-corrections.ts:445`), `titleContextHints` (`~:503`) | no orgId | stamp `orgId: org` where in scope (cheap; keeps phase 5 honest). Rules keep them server-only/po. |

Subcollections (`setlists/*/history|emailEvents`, `users/*/notifications`, `library_index/*/chordData`) inherit the parent's tenant and need no field.

---

## 3. Role reads and the per-tenant replacement

### 3.1 Model

**Membership record** `memberships/{tenantId}__{uid}` (server writes only):

```ts
interface Membership {
  uid: string
  tenantId: OrgId
  role: "admin" | "band_leader" | "musician" | "member" | "pending" | "denied"
  soundEngineer: boolean
  addedBy: string            // actor uid | "migration" | "self-join" | "test-account"
  addedAt: Timestamp
  updatedBy?: string
  updatedAt?: Timestamp
  requestedAt?: Timestamp    // set by /api/auth/join
}
```
`denied` replaces today's "set role to denied" (`PeopleSection` deny button); it keeps the request from reappearing on every sign-in. It carries no claim.

**Platform owner**: `platform/owners {uids: string[]}` (server only, seeded with Daniel `93Xn3DbS0bSNb8zmfzLyfOMX1A13`). `config/admins` (dead, wrong uid) and `SUPER_ADMIN_UID` (`src/lib/api-auth.ts:36-38,107`) fold into it: delete the env read; if the env value is set and differs from Daniel's uid, the migration plan reports it.

**Migration marker**: `users/{uid}.membershipsMigratedAt` (server-written; added to nothing self-writable).

**Overrides**: `platform/membershipMigration {overrides: {[uid]: {[tenant]: role}}, seededAt}` — ruling 5's David entry (`HTks9a8YRiVCQ5lVipUJcBsWjnB3: {brotherslazaroff: 'admin'}`) lives here as data, not code.

### 3.2 Claims

One function rebuilds all custom claims from memberships, on every membership change:

```
{ po?: true,
  m:  { [tenant]: 'ad'|'bl'|'mu'|'me'|'pe' },     // denied omitted
  se?: [tenant, ...],                                 // soundEngineer && role ∈ {admin,band_leader,musician,member}
  // legacy, written through the changeover:
  role: highest non-denied role (absent if none),
  orgIds: tenants whose role ∉ {pending, denied} (omitted when empty),
  soundEngineer: se.length > 0,
  ...every other existing key preserved (admin_test, etc.) }
```
Size: ~20 bytes per tenant; `rebuildClaims` throws (and the caller surfaces a 500) when `JSON.stringify(claims).length > 900`. After `setCustomUserClaims` it writes `users/{uid}` `{claimsUpdatedAt, role, orgIds, soundEngineer}` (legacy mirrors so unconverted readers stay correct) — `claimsUpdatedAt` makes the client force-refresh (`auth-context.tsx:143-158`, already wired). On **removal** (membership deleted) it also calls `revokeRefreshTokens(uid)`. Note: Firebase revocation is account-wide — a dual member removed from B is signed out of A too and signs back in (logged decision).

### 3.3 New server modules (one API)

`src/lib/org/access.ts` (`import "server-only"`):
```ts
export type TenantRole = "admin" | "band_leader" | "musician" | "member" | "pending" | "denied"
export const membershipId = (orgId: OrgId, uid: string) => `${orgId}__${uid}`
export interface TenantAccess {
  uid: string; orgId: OrgId
  role: TenantRole | null          // membership role; null = no membership
  effectiveRole: TenantRole | null // "admin" when po, else role
  soundEngineer: boolean
  canUpload: boolean               // users/{uid}.canUpload (stays global in P2)
  po: boolean
  source: "membership" | "legacy" | "none"
}
export async function getTenantAccess(uid: string, orgId: OrgId, opts?: { db?: Firestore }): Promise<TenantAccess>
export function hasTenantRole(a: TenantAccess, min: Exclude<TenantRole, "denied">): boolean   // po → true; denied/null → false
export async function readTenantRole(db: Firestore, uid: string, orgId: OrgId): Promise<string | undefined> // effectiveRole ?? undefined — drop-in for readUserRole
export async function isPlatformOwner(uid: string, db?: Firestore): Promise<boolean>               // platform/owners, 60 s memo
export async function listTenantMembers(orgId: OrgId, opts?: { roles?: TenantRole[] }): Promise<Array<Membership & { profile: Record<string, unknown> | null }>>
```
Behaviour of `getTenantAccess`: 2 reads (membership doc, users doc; owners memoised). **Transition fallback**: membership missing **and** `users/{uid}.membershipsMigratedAt` absent → `source:'legacy'`, `role = users/{uid}.role` (exactly what `readUserRole` returns today, tenant-blind — parity), `soundEngineer = users.soundEngineer`. Membership missing and migrated → `role:null`. No cross-request cache (removal must be immediate for server routes and MCP).

`src/lib/org/claims.ts`: `ROLE_CODE`, `buildClaims(prev, memberships, po)` (pure, unit-tested), `rebuildClaims(uid, {revoke?}) → {claims, bytes, changed}`.

`src/lib/org/memberships-write.ts`:
```ts
export async function setMembership(a: { orgId: OrgId; uid: string; role: TenantRole | null; soundEngineer?: boolean;
  actorUid: string; reason: "set-role"|"join"|"migration"|"sound-engineer"|"remove"|"test-account" }):
  Promise<{ before: Membership | null; after: Membership | null; claims: Record<string, unknown> }>
export async function ensureMembershipsMigrated(uid: string, opts?: { dryRun?: boolean }): Promise<MigrationPlanEntry>
```
`setMembership` = `ensureMembershipsMigrated(uid)` → transaction (upsert/delete membership + `auditLogs` row `{action, orgId, targetUserId, previousRole, newRole, actorUid, actorEmail, timestamp}`) → `rebuildClaims(uid, {revoke: role === null && before !== null})`.

`src/lib/org/legacy-membership-map.ts` (pure): `planLegacyMemberships({uid, claims, doc, overrides, owners})` →
- claim `role` absent (never approved, incl. new sign-ups) → **no memberships** (the one-time script handles pre-existing pending users explicitly, §6);
- legacy `admin` → `admin` in `crc` only (ruling 5), plus `overrides[uid]`;
- any other legacy role R → R in each tenant of the claim `orgIds` (missing → `['crc']`), plus overrides;
- `soundEngineer` legacy flag → `soundEngineer:true` on each planned membership whose role ≥ member;
- `po` iff uid ∈ owners.

### 3.4 Every role / membership read today, and its replacement

**Host tenant** for web = `coerceOrgId(headers['x-org-id'])` (set by `src/proxy.ts:161-162`, overwrites client input; also set for `/api/*` since `:180-182` passes `requestHeaders`). **Token tenant** for MCP = `orgFrom(extra)` (`src/lib/mcp/org-context.ts:30`).

| Site | Today | Replacement |
|---|---|---|
| `src/lib/api-auth.ts:104-137` `requireAuth` (feeds `createApiHandler` `{role}` and `ctx.auth.isAdmin/isBandLeader/isMusician` in ~45 routes) | claim `role` + `SUPER_ADMIN_UID` | compute `access = getTenantAccess(uid, hostOrg(req))`; `AuthResult` gains `orgId`, `po`, `access`; `role = access.effectiveRole`; `isAdmin/isBandLeader/isMusician` from it. All routes with `{role:…}` become per-tenant automatically (list: `admin/delete-user:60`, `admin/migrations:28`, `admin/set-role:86`, `admin/set-sound-engineer:58`, `admin/set-upload-permission:57`, `bridge/setup-code:66`, `drive/health:101`, `library/archive:79`, `library/chord-cache:271`, `library/rename:130`, `library/sync:18`, `mcp/oauth/mint-test-token:52`, `profile/update:101`, `push/send:141`, `scheduling/{assign:52,history:95,remind:141,respond:61,suggest:105,suggest-band:139,unassign:47}`, `setlist/delete:148`, `setlist/rename:69`, `setlist/transfer:49`, `setlists/import/*`; inline checks `library/upload:46`, `recordings/upload:52`, `setlist/delete:74`, `setlist/email-packets:45`, `setlist/notify-band:110`, `setlist/rename:33`, `setlist/resend-email:61`, `setlists/notify-updated:37`). `src/lib/http/admin-gate.ts:34` inherits. |
| `src/lib/server-auth.ts:33-61` `getServerUser` (pages `(main)/layout`, `library`, `manage`, `manage/library-review`, `monitor`, `page`, `setlists`, `setlists/[id]`; routes `library/list`, `mcp/oauth/authorize`) | `users/{uid}.role`, `.soundEngineer` | `getTenantAccess(uid, coerceOrgId((await headers()).get('x-org-id')))`; `ServerUser` gains `orgId`, `po`. `library/list/route.ts:41` "all sites" → `su.po`. |
| `src/app/api/auth/session/route.ts:78-97`, `refresh-session/route.ts:39-56` | doc role capped by claim → `__session_role` | sign `getTenantAccess(uid, hostOrg).effectiveRole` (legacy source keeps the P0 `capRoleToClaims` cap). Cookie payload gains `org` (`src/lib/session-role.ts` `signRoleCookie(uid, role, org)`, `verifyRoleCookie → {uid, role, org}`). |
| `src/proxy.ts:262-289` | companion cookie role, else session claim `role` | accept companion only if `verified.org === orgId`; else from session claims: `po → admin`; `m` present → decode `m[orgId]`; else legacy `role` (unchanged path). `/manage` gate = admin/band_leader **in host tenant**. Edge cannot read Firestore — unchanged. |
| `src/app/api/auth/sync-claims/route.ts` | keep/lower role claim; mirror `orgIds` | becomes "rebuild my claims": `ensureMembershipsMigrated(uid)` + `rebuildClaims(uid)`. Cannot raise anything (derived from server-written memberships). Response shape `{synced, role}` kept; `drift-repair.ts:84` unchanged. |
| `src/app/api/admin/set-role/route.ts` | global role + `orgIds` | per-tenant contract in §5. |
| `src/app/api/admin/set-sound-engineer/route.ts:39-55` | `users.soundEngineer` + claim | body `{targetUserId, soundEngineer, tenant?}` (default host); caller ≥bl in tenant (po anywhere); target must have a membership there; `setMembership(... soundEngineer)`. |
| `src/app/api/admin/delete-user/route.ts` | admin deletes any account | allowed for `po`, or tenant admin when **all** of the target's memberships are in the caller's tenant; else 403 `{code:'MULTI_TENANT_USER'}` ("remove from this tenant instead" = set-role `newRole:null`). Audit row gains `orgId`. |
| `src/app/api/admin/set-upload-permission/route.ts` | admin sets `users.canUpload`; `migrate` scans all leaders | caller admin in host tenant **and** target has a membership there (po anywhere); `migrate` branch → po only. |
| `src/app/api/auth/qr/route.ts:186-209` | claim role, else doc role | `getTenantAccess(uid, hostOrg)`; allowed roles unchanged. |
| `src/app/api/auth/test-session/route.ts:138,306`, `admin-test-session/route.ts:256`, `src/lib/mcp/tools/admin-test-session.ts:134` | claim/doc role; sets `{role:'admin', admin_test}` | test admin = `setMembership({orgId: token/host org, role:'admin', reason:'test-account'})` then `rebuildClaims` (never a bare legacy `role` claim — see §3.7). |
| `src/lib/mcp/tools/test-tokens.ts:79-82,280-298` (`loadCallerRole`, `create_test_account`) | doc role; claims `{role, orgIds?}` | caller via `getTenantAccess(callerUid, orgFrom(extra))`; provisioning writes one membership per requested tenant (default token tenant) via `setMembership`. |
| `src/app/api/mcp/tokens/route.ts:39-40`, `mcp/oauth/token/route.ts:107-108` → `resolveMintOrg` (`src/lib/org/membership-server.ts:47-55`) | claim `orgIds` | `resolveMintOrg` reads memberships with role ∉ {pending, denied} (po: host org). Fallback-to-first-tenant behaviour **kept** in P2 (phase 4 removes it). `getUserOrgIds` reads memberships (legacy fallback for unmigrated). |
| `src/lib/reader-music-server.ts:73-80` | claim role + claim/doc `orgIds` | `hasTenantRole(getTenantAccess(uid, orgId),'member')` (ELIGIBLE_ROLES = member+). |
| `src/app/api/cron/admin-consistency/route.ts:136-160` | `config/admins` vs claims | compare `platform/owners` vs `po` claims; each user's memberships vs `m`/`se` claims; report users without `membershipsMigratedAt` or without `m`. |
| `src/app/api/cron/bridge-watch/route.ts:160` | `users where role == admin` | `listTenantMembers('crc', {roles:['admin']})` (bridge tenant). Same recipients after ruling 5. |
| `src/app/api/cron/backup/route.ts:79`, `storage-backup/route.ts:116` | claim `role == admin` | `po` **or** claim `m.crc == 'ad'` (parity for CRC admins; phase 4 may narrow to po). |
| Rate-limit bypass `checkUserRateLimit(uid, tier, {bypass})` (`src/lib/rate-limit.ts:203`) | bypass computed by callers from global role | unchanged signature; callers compute bypass from the tenant role (rows below). |
| `src/lib/mcp/server-tracks-write.ts:113-119` `readUserRole(db, uid)` | doc role | **delete**; replace with `readTenantRole(db, uid, org)`. `assertEditor(db, uid)` → `assertEditor(db, uid, org)`; `loadEditableSetlist` already has `org`. Callers (15 source files): `ai-config.ts:124`, `archive-nonchart-artifacts.ts:160`, `backfill-heal-metadata.ts:103`, `bridge-housekeeping.ts:99`, `bridge-recovery.ts:77,99`, `clone-setlist.ts:176,182`, `congregation-services.ts:78`, `correction-stats.ts:63`, `library-review.ts:88,117`, `performed.ts:184,187`, `roster.ts:229,327,401,537,671,753,882,1086,1090,1297,1300`, `setlist-publish.ts:364,423`, `setlist-write.ts:164,1252,1254,1385`, `templates.ts:125,209,281,381,557,650,726,920`; other `assertEditor` callers: `backfill-track-mimetype.ts:165`, `bond-corrections.ts:92,200,383`, `bridge-health.ts:107`, `contacts.ts:67,113,144,208`, `liturgy-bindings.ts:235`, `monitor-observability.ts:183,308`, `propose-changes.ts:310`, `service-personnel.ts:229`, `template-always-rows.ts:106`. Each handler already has `orgFrom(extra)` in scope or one call away. |
| `src/lib/mcp/tools/uploader-roles.ts:24-33` `loadUploader(db, uid)` and its duplicate `library-upload-session.ts:73-95` | doc role/canUpload | `loadUploader(db, uid, org)` built on `getTenantAccess`; delete the duplicate (import the shared one). Callers: `authored-chart.ts:247`, `batch-intake.ts:270,337,463,697,797,877,985,1031` (+ `:231` admin check), `chart-text-search.ts:123`, `library-upload-session.ts:242,395,462,662,797`, `library-upload.ts:155,520,729,788,808,1015,1081`, `register-chart-inbox.ts:148`, `song-metadata.ts:266`. `isTrustedLeader`, `isUploadAllowed`, `curatedCatalogGate` unchanged (they take the result). |
| Direct `users/{uid}.role` reads in MCP tools (each → `readTenantRole(db, uid, orgFrom(extra))`) | doc role | `ai-spend-summary.ts:68`, `backfill-content-hash.ts:181`, `chart-bond-audit.ts:283,318`, `dump-collection-size.ts:61`, `library-download.ts:68,89,311`, `library-verify.ts:74,109,295`, `library.ts:1757,2598`, `mark-chart-status.ts:162`, `mint-admin-bearer.ts:81`, `reconcile-library.ts:236`, `salvage-chart-bytes.ts:312`, `service-sheet.ts:170`, `setlist-hygiene.ts:65`, `setlist-reader-bearer.ts:86`, `test-delete-storage-object.ts:64-70`, `undo-dedupe.ts:116,488`, `web-vitals-summary.ts:74`. "admin" here means **admin in the token tenant** (parity: every current admin is a crc admin; David also BL). Ops tools that read cross-tenant data stay tenant-admin in P2 (§10 Q2). |
| `src/lib/mcp/server-monitor.ts:34-40` `loadMonitorUser(db, uid)` → `assertMonitorAccess`, `isPrivilegedMonitor`, `canControlBus` (used by `tools/monitor.ts`, `bridge-health.ts`, `monitor-observability.ts`) | doc role + `soundEngineer` | `loadMonitorUser(db, uid)` reads `getTenantAccess(uid, BRIDGE_ORG='crc')` — the **bridge tenant**, not the token tenant (phase 6 adds the flag + token-tenant match). Privileged = admin in crc or se in crc. Parity: David (crc admin) keeps the mixer from a BL token, as today. |
| Roster / people listings reading `users.role` + `users.orgIds` | `roster.ts:164,234-244,337-347,771-777,910,967`; `setlist-publish.ts:239-252,310,955,1008`; `preview-publish.ts:371`; `scheduling/assignment-service.ts:383,545,601,742`; `api/scheduling/suggest/route.ts:28`, `suggest-band/route.ts:47,88`, `calendar-feed/[token]/route.ts:48`; `api/setlist/email-packets/route.ts:51`; `api/setlists/notify-updated/route.ts:55`; `api/admin/set-upload-permission/route.ts:42` | `listTenantMembers(org, {roles})` (membership role shown, not the global one). `calendar-feed` looks a user up by feed token — keep the users query, it is not a roster. Legacy mirrors keep any missed site correct for single-tenant users during the changeover. |
| `src/lib/auth-context.tsx:78-80,160-178` (client) | `deriveRoles(profile.role)`, `profile.soundEngineer`; drift check `claims.role === p.role` | §3.6. |
| Client role displays: `DesktopHeader.tsx:53,216`, `MobileMenuDrawer.tsx:38,123`, `settings/page.tsx:167`, `DashboardClient.tsx:413`, `PeopleSection.tsx:42`, `UserRow.tsx:105,223` | `profile.role`, `user.orgIds` | read `role` from `useAuth()` (tenant role); UserRow per §5. |
| Firestore rules `isAdmin/isBandLeader/isMusician/isMember/isSoundEngineer/callerOrgs` (`firestore.rules:17-100`) and `storage.rules:8-11` | claim `role`, `orgIds`, `config/admins` | §4 `code/atLeast/se/po`. |
| Scripts: `scripts/issue-bl-bearer.mjs` (overwrites David's claim) | — | **delete** (handoff). `scripts/ops/set-role.js` → rewrite to call `setMembership` or delete. `scripts/mint-throwaway-bl-bearer.mjs` must not write claims (verify; P0 note says it doesn't). |

### 3.5 Transition rule (rules accept new claims, fall back to legacy only when `m` is absent)

`code(t)` = `m[t]` when the token has an `m` map; otherwise `legacyCode(t)` = legacy `role` mapped to a code **only if** `t ∈ orgIds` (missing → `['crc']`). Legacy `admin` is **tenant admin of its orgIds tenants, never a bypass** — `config/admins` and every `isAdmin() ||` disappear; only `po` bypasses.

Safe for:
- **Migrated users holding a pre-migration ID token** (≤ 1 h): they get today's role restricted to their claim `orgIds` — never more than today (strictly less: no admin bypass). `claimsUpdatedAt` forces a refresh within seconds of the rebuild for open tabs.
- **Never-approved accounts** (no `role` claim): code `''`, no rights — same as today.
- **Test accounts minted by unconverted code**: none after Lane 2 (every claim writer goes through `rebuildClaims`).

Not safe for: any code path that writes a `role` claim **without** `m` after the migration — it would get that role in `crc` (default orgIds). Mitigations: (1) Lane 2 routes every `setCustomUserClaims` through `rebuildClaims` (grep gate in CI: `setCustomUserClaims` may appear only in `src/lib/org/claims.ts`); (2) `admin-consistency` cron reports any account with `role` and no `m`; (3) step 5 (§8) deletes the fallback once every account carries `m`.

Server side mirrors this per user: membership missing + not migrated → legacy (§3.3).

### 3.6 Client (`src/lib/auth-context.tsx`)

- `const org = useOrg()` (AuthProvider sits inside `OrgProvider`, `src/app/layout.tsx:163` → `client-providers.tsx:26`).
- After `ensureUserProfile`, `POST /api/auth/join` once per (host, uid) per session; if `{created:true}` or `{claimsChanged:true}` → `getIdToken(true)` + `syncSessionCookie`.
- Subscribe `memberships/{org}__{uid}` (rule allows reading one's own id even when absent).
- `tokenClaims = (await user.getIdTokenResult()).claims` (refreshed on `claimsUpdatedAt` change).
- `role` = `claims.po ? 'admin'` : `claims.m ? (membership?.role ?? null)` : `profile.role` (legacy, unchanged behaviour). `isSoundEngineer` = `claims.m ? membership.soundEngineer : profile.soundEngineer`. `null` role = not a member of this tenant → treat as pending (UI already handles pending).
- Context gains `orgId`, `role`, `isPlatformOwner`, `membership`. Drift repair (`:160-178`): compare `claims.m?.[org]` to the membership's role code; on mismatch call `repairDrift` (sync-claims = rebuild).
- `localStorage crc_cached_user.role` stores the tenant role keyed by org.

### 3.7 Claim writers (all must go through `rebuildClaims`)

`src/app/api/admin/set-role/route.ts:76`, `set-sound-engineer/route.ts:48`, `auth/sync-claims/route.ts:119`, `src/lib/mcp/tools/test-tokens.ts:280`, `src/lib/mcp/tools/admin-test-session.ts:134`; scripts `issue-bl-bearer.mjs` (delete), `ops/set-role.js`, `mint-throwaway-bl-bearer.mjs`, archived migrations (leave archived).

---

## 4. Rules text

### 4.1 `firestore.rules` (full proposed file)

```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    // ── Identity (multi-tenant P2) ─────────────────────────────────────────
    // Claims: po (platform owner), m {tenant: ad|bl|mu|me|pe}, se [tenant].
    // Transition: a token without `m` is read through the legacy claims
    // (role + orgIds, missing orgIds = ['crc']). Legacy admin is a tenant admin
    // of its orgIds tenants, never a bypass. Only po bypasses tenant checks.
    function signedIn() { return request.auth != null; }
    function po() { return signedIn() && request.auth.token.get('po', false) == true; }
    function hasM() { return signedIn() && request.auth.token.get('m', null) is map; }
    function legacyOrgs() {
      let o = request.auth.token.get('orgIds', []);
      return (o is list && o.size() > 0) ? o : ['crc'];
    }
    function legacyCode(t) {
      let r = request.auth.token.get('role', '');
      return !(t in legacyOrgs()) ? ''
        : r == 'admin' ? 'ad'
        : r == 'band_leader' ? 'bl'
        : r == 'musician' ? 'mu'
        : r == 'member' ? 'me'
        : r == 'pending' ? 'pe'
        : '';
    }
    function code(t) {
      return !signedIn() || !(t is string) ? ''
        : hasM() ? request.auth.token.m.get(t, '')
        : legacyCode(t);
    }
    function rank(c) {
      return c == 'ad' ? 4 : c == 'bl' ? 3 : c == 'mu' ? 2 : c == 'me' ? 1 : c == 'pe' ? 0 : -1;
    }
    function atLeast(t, c) { return po() || rank(code(t)) >= rank(c); }
    function se(t) {
      return signedIn() && (hasM()
        ? t in request.auth.token.get('se', [])
        : (request.auth.token.get('soundEngineer', false) == true && t in legacyOrgs()));
    }

    // ── Documents ──────────────────────────────────────────────────────────
    // Every tenant-owned doc carries orgId (stamped 2026-10-12). A missing
    // orgId still means crc for reads/updates; creates must stamp it.
    function docOrg() { return resource.data.get('orgId', 'crc'); }
    function newOrg() { return request.resource.data.get('orgId', ''); }
    function newOrgSet() { return newOrg() is string && newOrg().size() > 0; }
    function orgKept() {
      return request.resource.data.get('orgId', null) == resource.data.get('orgId', null);
    }
    function isOwner() {
      return signedIn() && resource.data.get('ownerId', '') == request.auth.uid;
    }
    function setlistOrgOf(setlistId) {
      return get(/databases/$(database)/documents/setlists/$(setlistId)).data.get('orgId', 'crc');
    }
    // tracks: own orgId, else the parent setlist's (unstamped rows from
    // pre-P2 bundles). The conditional is lazy: stamped rows cost no get().
    function trackOrg(d) {
      return ('orgId' in d) ? d.orgId : setlistOrgOf(d.setlistId);
    }
    // templates/{id}: "<tenant>__<key>"; a bare key is crc.
    function templateOrgOfId(id) {
      return id.matches('^[a-z0-9-]+__.+$') ? id.split('__')[0] : 'crc';
    }
    // config/<base> is crc; config/<base>__<tenant> is that tenant.
    function cfgTenant(docId) {
      return docId.matches('^[a-z]+__[a-z0-9-]+$') ? docId.split('__')[1] : 'crc';
    }
    function cfgIs(docId, base) {
      return docId == base || docId.matches('^' + base + '__[a-z0-9-]+$');
    }

    // ── Mixer (CRC-only; phase 6 moves bridgeOrg into tenant config) ───────
    function bridgeOrg() { return 'crc'; }
    function mixerReader()     { return atLeast(bridgeOrg(), 'me') || se(bridgeOrg()); }
    function mixerOperator()   { return atLeast(bridgeOrg(), 'mu') || se(bridgeOrg()); }
    function mixerPrivileged() { return atLeast(bridgeOrg(), 'ad') || (se(bridgeOrg()) && atLeast(bridgeOrg(), 'mu')); }

    // ── USERS (profile only; roster reads go through /api/tenant/people) ───
    function selfProfileFields() {
      return ['email', 'displayName', 'photoURL', 'lastLoginAt',
              'musicianProfile', 'viewedWelcomeModal', 'fcmTokens'];
    }
    function selfEmailOk(data) {
      return !('email' in data)
        || data.email == ''
        || data.email == request.auth.token.get('email', '');
    }
    // role 'pending' and an orgIds subset are still accepted on create so
    // cached pre-P2 bundles can sign up; neither grants anything (rights come
    // from memberships, written by the server only).
    function selfCreateOk(userId) {
      let d = request.resource.data;
      return d.keys().hasOnly(['uid', 'role', 'orgIds', 'createdAt'].concat(selfProfileFields()))
        && d.get('role', 'pending') == 'pending'
        && d.get('uid', userId) == userId
        && (!('orgIds' in d) || (d.orgIds is list && d.orgIds.hasOnly(['crc', 'brotherslazaroff'])))
        && selfEmailOk(d);
    }
    function selfUpdateOk() {
      let changed = request.resource.data.diff(resource.data).affectedKeys();
      return changed.hasOnly(selfProfileFields())
        && (!changed.hasAny(['email']) || selfEmailOk(request.resource.data));
    }
    match /users/{userId} {
      allow get: if signedIn() && (request.auth.uid == userId || po());
      allow list: if po();
      allow create: if signedIn() && request.auth.uid == userId && selfCreateOk(userId);
      allow update: if signedIn() && request.auth.uid == userId && selfUpdateOk();
      allow delete: if signedIn() && request.auth.uid == userId;

      match /setlists/{docId}        { allow read, write: if signedIn() && request.auth.uid == userId; }
      match /songPreferences/{fileId} { allow read, write: if signedIn() && request.auth.uid == userId; }
      match /annotations/{fileId}    { allow read, write: if signedIn() && request.auth.uid == userId; }
      match /preferences/{docId}     { allow read, write: if signedIn() && request.auth.uid == userId; }
      match /notifications/{notifId} {
        allow read: if signedIn() && request.auth.uid == userId;
        allow update: if signedIn() && request.auth.uid == userId
                      && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['read']);
        allow delete: if signedIn() && request.auth.uid == userId;
        allow create: if false; // server writes (set-role, scheduling, …)
      }
    }

    // ── MEMBERSHIPS / PLATFORM / ORGS ──────────────────────────────────────
    match /memberships/{membershipId} {
      // One's own record is readable even before it exists (client listener).
      allow get: if signedIn() && (
        membershipId.matches('^[a-z0-9-]+__' + request.auth.uid + '$')
        || (resource != null && atLeast(resource.data.tenantId, 'bl')));
      allow list: if signedIn() && (
        resource.data.uid == request.auth.uid || atLeast(resource.data.tenantId, 'bl'));
      allow write: if false;
    }
    match /platform/{docId} {
      allow read, write: if false;
    }
    match /orgs/{orgId} {
      allow read: if true;
      allow write: if false;
    }

    // ── SETLISTS ───────────────────────────────────────────────────────────
    // R-0919-audit-2: get public (Perform links), list signed-in. Unchanged.
    match /setlists/{setlistId} {
      allow get: if true;
      allow list: if signedIn();
      allow create: if signedIn()
        && request.resource.data.get('ownerId', '') == request.auth.uid
        && newOrgSet()
        && atLeast(newOrg(), 'me');
      allow update: if signedIn()
        && orgKept()
        && (atLeast(docOrg(), 'bl') || (isOwner() && atLeast(docOrg(), 'me')))
        && (request.resource.data.get('ownerId', null) == resource.data.get('ownerId', null)
            || atLeast(docOrg(), 'ad'));
      allow delete: if signedIn()
        && (atLeast(docOrg(), 'bl') || (isOwner() && atLeast(docOrg(), 'me')));
    }
    match /setlists/{setlistId}/history/{entryId} {
      allow read: if atLeast(setlistOrgOf(setlistId), 'ad');
      allow create: if atLeast(setlistOrgOf(setlistId), 'me');
      allow update, delete: if false;
    }
    function canLeadSetlist(setlistId) {
      return signedIn() && atLeast(setlistOrgOf(setlistId), 'bl');
    }
    function overridesShapeOk() {
      let d = request.resource.data;
      return d.keys().hasOnly(['rows', 'eventDay', 'rev', 'updatedAt', 'updatedBy'])
        && d.keys().hasAll(['rows', 'eventDay', 'rev', 'updatedAt', 'updatedBy'])
        && d.rows is map && d.rows.size() <= 300
        && d.eventDay is string && d.eventDay.matches('^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
        && d.rev is int && d.updatedAt is number
        && d.updatedBy == request.auth.uid;
    }
    match /setlists/{setlistId}/performance/{docId} {
      allow get: if signedIn() && docId == 'overrides';
      allow list: if false;
      allow create: if docId == 'overrides' && canLeadSetlist(setlistId)
                    && overridesShapeOk() && request.resource.data.rev >= 1;
      allow update: if docId == 'overrides' && canLeadSetlist(setlistId)
                    && overridesShapeOk() && request.resource.data.rev == resource.data.rev + 1;
      allow delete: if false;
    }
    match /setlists/{setlistId}/performedDeviations/{eventId} {
      allow read: if canLeadSetlist(setlistId);
      allow create: if canLeadSetlist(setlistId)
                    && request.resource.data.keys().hasOnly(['rowId', 'kind', 'plannedFileId', 'plannedTitle', 'beforeFileId', 'beforeTitle', 'performedFileId', 'performedTitle', 'at', 'by', 'eventDay', 'rev'])
                    && request.resource.data.keys().hasAll(['rowId', 'kind', 'at', 'by', 'eventDay', 'rev'])
                    && request.resource.data.rowId is string
                    && request.resource.data.kind in ['swap', 'undo', 'reset']
                    && request.resource.data.by == request.auth.uid
                    && request.resource.data.at is number
                    && request.resource.data.rev is int
                    && request.resource.data.eventDay is string
                    && getAfter(/databases/$(database)/documents/setlists/$(setlistId)/performance/overrides).data.rev == request.resource.data.rev
                    && getAfter(/databases/$(database)/documents/setlists/$(setlistId)/performance/overrides).data.eventDay == request.resource.data.eventDay;
      allow update, delete: if false;
    }
    match /setlists/{setlistId}/emailEvents/{eventId} {
      allow read: if atLeast(setlistOrgOf(setlistId), 'bl');
      allow write: if false;
    }

    // ── TRACKS ─────────────────────────────────────────────────────────────
    match /tracks/{trackId} {
      allow get: if true;
      allow list: if signedIn();
      allow create: if signedIn()
        && request.resource.data.get('setlistId', '') is string
        && request.resource.data.get('setlistId', '') != ''
        && atLeast(trackOrg(request.resource.data), 'bl')
        && (!('orgId' in request.resource.data)
            || request.resource.data.orgId == setlistOrgOf(request.resource.data.setlistId));
      allow update: if signedIn()
        && atLeast(trackOrg(resource.data), 'bl')
        && (('orgId' in resource.data)
              ? request.resource.data.get('orgId', null) == resource.data.orgId
              : (!('orgId' in request.resource.data)
                  || request.resource.data.orgId == setlistOrgOf(resource.data.setlistId)))
        && (request.resource.data.get('setlistId', '') == resource.data.get('setlistId', '')
            || setlistOrgOf(request.resource.data.setlistId) == trackOrg(resource.data));
      allow delete: if signedIn() && atLeast(trackOrg(resource.data), 'bl');
    }

    // ── CATALOGUE ──────────────────────────────────────────────────────────
    match /songs/{songId} {
      allow read: if atLeast(docOrg(), 'me');
      allow create: if newOrgSet() && atLeast(newOrg(), 'bl');
      allow update: if atLeast(docOrg(), 'bl') && orgKept();
      allow delete: if atLeast(docOrg(), 'bl');
    }
    match /recordings/{recordingId} {
      allow read: if atLeast(docOrg(), 'me');
      allow create: if newOrgSet() && atLeast(newOrg(), 'bl');
      allow update: if atLeast(docOrg(), 'bl') && orgKept();
      allow delete: if atLeast(docOrg(), 'bl');
    }
    match /library_index/{fileId} {
      allow read, write: if false;
      match /chordData/{page} { allow read, write: if false; }
    }
    match /library_signals/{docId} {
      allow read: if signedIn();
      allow write: if false;
    }
    match /digitized_charts/{docId} {
      allow read, write: if false;
    }
    match /songUsage/{fileId} {
      allow read: if atLeast(docOrg(), 'me');
      allow write: if false;
      match /events/{eventId} {
        allow read: if atLeast(get(/databases/$(database)/documents/songUsage/$(fileId)).data.get('orgId', 'crc'), 'me');
        allow write: if false;
      }
    }

    // ── AUTHORING ──────────────────────────────────────────────────────────
    match /contacts/{contactId} {
      allow read: if atLeast(docOrg(), 'bl');
      allow create: if newOrgSet() && atLeast(newOrg(), 'bl');
      allow update: if atLeast(docOrg(), 'bl') && orgKept();
      allow delete: if atLeast(docOrg(), 'bl');
    }
    match /templates/{templateId} {
      allow get: if atLeast(resource == null
                             ? templateOrgOfId(templateId)
                             : resource.data.get('orgId', templateOrgOfId(templateId)), 'me');
      allow list: if atLeast(resource.data.get('orgId', 'crc'), 'me');
      allow create, update: if atLeast(templateOrgOfId(templateId), 'bl')
        && request.resource.data.get('orgId', '') == templateOrgOfId(templateId);
      allow delete: if atLeast(templateOrgOfId(templateId), 'bl');
    }
    match /setlistTemplates/{templateId} {
      allow read: if atLeast(docOrg(), 'bl');
      allow create: if newOrgSet() && atLeast(newOrg(), 'bl');
      allow update: if atLeast(docOrg(), 'bl') && orgKept();
      allow delete: if atLeast(docOrg(), 'bl');
    }
    match /bond_flags/{flagId} {
      allow read: if atLeast(docOrg(), 'bl');
      allow write: if false;
    }
    match /proposal_stages/{stageId} {
      allow read: if atLeast(docOrg(), 'bl');
      allow write: if false;
    }
    match /tasks/{taskId} {
      allow read: if signedIn()
        && (resource.data.get('assigneeId', '') == request.auth.uid || atLeast(docOrg(), 'me'));
      allow write: if false;
    }
    match /live_sessions/{sessionId} {
      allow read: if atLeast(docOrg(), 'me');
      allow create: if signedIn()
        && request.resource.data.get('broadcasterId', '') == request.auth.uid
        && newOrgSet() && atLeast(newOrg(), 'mu');
      allow update: if signedIn()
        && resource.data.get('broadcasterId', '') == request.auth.uid
        && request.resource.data.get('broadcasterId', '') == request.auth.uid
        && orgKept() && atLeast(docOrg(), 'mu');
      allow delete: if signedIn() && resource.data.get('broadcasterId', '') == request.auth.uid;
    }
    match /publicSetlists/{docId} {
      allow get: if true;
      allow list: if po();
      allow write: if false;
    }

    // ── SCHEDULING ─────────────────────────────────────────────────────────
    match /scheduling_assignments/{assignmentId} {
      allow read: if signedIn()
        && (resource.data.get('musicianUid', '') == request.auth.uid || atLeast(docOrg(), 'bl'));
      allow write: if false;
    }
    match /musician_availability/{blockoutId} {
      allow read: if signedIn()
        && (resource.data.get('musicianUid', '') == request.auth.uid || atLeast(docOrg(), 'bl'));
      allow create: if signedIn()
        && request.resource.data.get('musicianUid', '') == request.auth.uid
        && newOrgSet() && atLeast(newOrg(), 'me');
      allow update: if signedIn()
        && resource.data.get('musicianUid', '') == request.auth.uid
        && request.resource.data.get('musicianUid', '') == request.auth.uid
        && orgKept();
      allow delete: if signedIn() && resource.data.get('musicianUid', '') == request.auth.uid;
    }
    match /scheduling_history/{entryId} {
      allow read: if atLeast(docOrg(), 'bl');
      allow write: if false;
    }

    // ── CONFIG ─────────────────────────────────────────────────────────────
    // congregation[__t]: branding, read by every signed-in user (unchanged).
    // defaults[__t]: canonical setlist per service type, per tenant.
    // featured[__t]: unused today; tenant-scoped for completeness.
    // monitor: the CRC mixer. admins: retired (no grant → denied).
    match /config/{docId} {
      allow read: if signedIn() && (
           cfgIs(docId, 'congregation')
        || (cfgIs(docId, 'defaults') && atLeast(cfgTenant(docId), 'me'))
        || (cfgIs(docId, 'featured') && atLeast(cfgTenant(docId), 'me'))
        || (docId == 'monitor' && mixerReader()));
      allow write: if signedIn() && (
           (cfgIs(docId, 'congregation') && atLeast(cfgTenant(docId), 'ad'))
        || (cfgIs(docId, 'defaults') && atLeast(cfgTenant(docId), 'ad'))
        || (cfgIs(docId, 'featured') && atLeast(cfgTenant(docId), 'bl'))
        || (docId == 'monitor' && mixerPrivileged()));
    }
    match /system/globalAlert {
      allow read: if signedIn();
      allow write: if po();
    }

    // ── MIXER ──────────────────────────────────────────────────────────────
    match /monitor-live/state {
      allow read: if mixerReader();
      allow write: if false;
    }
    match /monitor-live/commands/pending/{commandId} {
      allow read: if false;
      allow create: if mixerOperator()
                    && request.resource.data.uid == request.auth.uid
                    && request.resource.data.createdAt is number
                    && request.resource.data.type in [
                        'set_bus_master', 'set_bus_on', 'set_send_level',
                        'set_send_on', 'set_matrix_fader', 'set_matrix_on'
                    ]
                    && (!(request.resource.data.type in ['set_matrix_fader', 'set_matrix_on'])
                        || mixerPrivileged())
                    && request.resource.data.keys().hasOnly([
                        'type', 'uid', 'createdAt',
                        'busIndex', 'channelIndex', 'matrixIndex', 'value'
                    ])
                    && (!('busIndex' in request.resource.data)     || request.resource.data.busIndex is int)
                    && (!('channelIndex' in request.resource.data) || request.resource.data.channelIndex is int)
                    && (!('matrixIndex' in request.resource.data)  || request.resource.data.matrixIndex is int)
                    && (!('value' in request.resource.data)        || request.resource.data.value is number
                                                                     || request.resource.data.value is bool);
      allow update, delete: if false;
    }
    match /monitor-live/commands/acks/{commandId} {
      allow read: if mixerOperator() && resource.data.get('uid', '') == request.auth.uid;
      allow write: if false;
    }

    // ── AUDIT / SERVER-ONLY ────────────────────────────────────────────────
    match /auditLogs/{logId} {
      allow read: if po() || atLeast(resource.data.get('orgId', 'crc'), 'ad');
      allow write: if false;
    }
    match /qr-sessions/{code}            { allow read, write: if false; }
    match /bridge-setup-codes/{code}     { allow read, write: if false; }
    match /bridge-redemptions/{id}       { allow read, write: if false; }
    match /mcpTokens/{tokenId}           { allow read, write: if false; }
    match /mcpOAuthClients/{clientId}    { allow read, write: if false; }
    match /mcpOAuthCodes/{codeHash}      { allow read, write: if false; }
    match /mcpTestUsers/{testUid}        { allow read, write: if false; }
    match /upload_batches/{batchId}      { allow read, write: if false; }
    match /aiEnrichmentCache/{h}         { allow read, write: if false; }
    match /aiEnrichmentRetryQueue/{id}   { allow read, write: if false; }
    match /aiCorrectionSignals/{id}      { allow read, write: if false; }

    // Platform-wide operational records: platform owner only (was isAdmin()).
    match /bond_corrections/{id}         { allow read: if po(); allow write: if false; }
    match /titleContextHints/{hintId}    { allow read: if po(); allow write: if false; }
    match /aiConfig/{configId}           { allow read: if po(); allow write: if false; }
    match /aiCorrectionStats/{statsId}   { allow read: if po(); allow write: if false; }
    match /chart_bond_alerts/{alertId}   { allow read: if po(); allow write: if false; }
    match /webVitalsObservations/{id}    { allow read: if po(); allow write: if false; }
    match /backups/{backupId}            { allow read: if po(); allow write: if false; }
    match /aiSpend/{spendId}             { allow read: if po(); allow write: if false; }
    match /dedupeRuns/{runId}            { allow read: if po(); allow write: if false; }

    // Deny-all fallback.
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

Notes for the rules lane:
- Every former `isAdmin() ||` bypass (`orgCreateOk` :46, `orgUpdateOk` :53, `callerCanWriteExistingOrg` :63, `songOrgReadOk` :75, `orgReadOk` :81, `canLeadSetlist` :499) is gone; `po()` is inside `atLeast`, so **only the platform owner** bypasses.
- `titleContextHints` and the ops collections had no browser reader (grep); tightening them to `po` changes nothing a user sees.
- `config/admins` loses its grant; `admin-consistency` stops reading it (§3.4); delete the doc in §6 extras (manifested).
- Ternary laziness: the emulator suite must include "stamped track write performs no `get()`" (assert via a setlist the caller cannot read — if `setlistOrgOf` ran, the result would differ) so we don't rely on an assumption.
- Rule cost: `setlistOrgOf` is one `get()`; worst case per request (track update with a moved `setlistId`) is 3 distinct gets, under the 10-get limit.

### 4.2 Step-1 additive rules (deployed with the step-1 app, §8)

Before the full rewrite ships, append only these to today's `firestore.rules` (they reference the new helpers, which are added too; nothing existing changes): the identity helpers block (`signedIn` … `se`), the `memberships`, `platform` blocks, and the `defaults__{t}` read/write branch:
```
    match /config/{defaultsDoc} {
      allow read: if signedIn() && defaultsDoc.matches('^defaults__[a-z0-9-]+$')
                  && atLeast(defaultsDoc.split('__')[1], 'me');
      allow write: if defaultsDoc.matches('^defaults__[a-z0-9-]+$')
                   && atLeast(defaultsDoc.split('__')[1], 'ad');
    }
```
(This `config/{x}` match is OR-ed with today's `config/{congregationDoc}` one; both are regex-guarded so `monitor/admins/featured/defaults` are unaffected.)

### 4.3 `storage.rules` (full proposed file)

```
rules_version = '2';

// Chart objects carry their tenant in custom metadata `orgId` (stamped
// 2026-10-12; every library/ writer stamps it from P2 on). An object without
// it is crc — what a missing tenant has always meant. The browser does not
// read Storage today; every chart byte goes through /api/library/file/[id]
// (Admin SDK, unaffected by these rules).
service firebase.storage {
  match /b/{bucket}/o {
    function signedIn() { return request.auth != null; }
    function po() { return signedIn() && request.auth.token.get('po', false) == true; }
    function hasM() { return signedIn() && request.auth.token.get('m', null) is map; }
    function legacyOrgs() {
      let o = request.auth.token.get('orgIds', []);
      return (o is list && o.size() > 0) ? o : ['crc'];
    }
    function legacyCode(t) {
      let r = request.auth.token.get('role', '');
      return !(t in legacyOrgs()) ? ''
        : r == 'admin' ? 'ad' : r == 'band_leader' ? 'bl'
        : r == 'musician' ? 'mu' : r == 'member' ? 'me' : r == 'pending' ? 'pe' : '';
    }
    function code(t) {
      return !signedIn() ? '' : hasM() ? request.auth.token.m.get(t, '') : legacyCode(t);
    }
    function rank(c) {
      return c == 'ad' ? 4 : c == 'bl' ? 3 : c == 'mu' ? 2 : c == 'me' ? 1 : c == 'pe' ? 0 : -1;
    }
    function atLeast(t, c) { return po() || rank(code(t)) >= rank(c); }
    function objectOrg() {
      return (resource.metadata != null
              && resource.metadata.get('orgId', '') is string
              && resource.metadata.get('orgId', '') != '')
        ? resource.metadata.orgId : 'crc';
    }

    match /library/{allPaths=**} {
      allow read: if atLeast(objectOrg(), 'me');
      allow write: if false;
    }
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```
Objects lacking metadata: read as `crc` (see the rule). Belt and braces: after the step-1 writer fix (§2) deploys, re-run `scripts/ops/multitenant/stamp-storage-orgid.ts` (dry run → apply; it skips stamped objects) to catch objects written between today's stamp and the writer fix; record the manifest.

---

## 5. Sign-up, join, People UI, set-role

### 5.1 `POST /api/auth/join` (new: `src/app/api/auth/join/route.ts`)

- `createApiHandler`, auth required (Firebase ID token), no role; `checkRateLimit(req,'api')`.
- Tenant = `coerceOrgId(req.headers.get('x-org-id'))` (phase 3 turns unknown hosts into "no such site"). Body ignored (no tenant or role input accepted).
- Steps: `ensureMembershipsMigrated(uid)`; if `memberships/{t}__{uid}` exists (any role, incl. `denied`) → no-op; else `setMembership({orgId:t, uid, role:'pending', actorUid: uid, reason:'join'})` (sets `requestedAt`, audit `MEMBERSHIP_REQUESTED` with `orgId`).
- Response `200 {tenant, role, created: boolean, claimsChanged: boolean}`.
- Idempotent; never changes an existing membership; never touches another tenant. A CRC member signing in at BL's address gets a BL pending request and nothing else (standing default).

### 5.2 `src/lib/users-firebase.ts`

- `ensureUserProfile` (`:15-60`): new docs write only `uid, email, displayName, photoURL, createdAt, lastLoginAt` — **no `role`, no `orgIds`** (`:51-53` removed). Existing-doc branch unchanged.
- `userProfileConverter` (`src/types/schemas.ts:46`): `role` optional, default `'pending'` when absent.
- Remove `subscribeToAllUsers` (`:111-125`); add `fetchTenantPeople(): Promise<TenantPerson[]>` (GET `/api/tenant/people`).
- `updateUserRole(targetUid, newRole, opts?: {tenant?, soundEngineer?})` → POST `/api/admin/set-role` with `{targetUserId, newRole, tenant}`; drop `orgIds`.
- `src/lib/musician-profile.ts:102-127` `subscribeToAllMusicianProfiles` → `fetchTenantMusicianProfiles()` built on the same route (filters members with `musicianProfile.instrument`).
- `src/lib/notification-store.ts`: delete `getActiveMemberUids`, `notifySetlistPublished`, `broadcastNotification` (no callers after Publish), and `notifyRoleChanged` client write (server does it).

### 5.3 `GET /api/tenant/people` (new: `src/app/api/tenant/people/route.ts`)

- Auth: ≥ band_leader in host tenant (`createApiHandler({role:'band_leader'})` — per-tenant via §3.4); po may pass `?tenant=`.
- Returns `{tenant, people: [{uid, displayName, email, photoURL, role, soundEngineer, canUpload, musicianProfile, createdAt, lastLoginAt, addedAt, requestedAt}], pendingCount}` from `listTenantMembers(tenant)`; `denied` included (People shows a "Denied" filter today).
- Callers: `PeopleSection.tsx` (replaces `subscribeToAllUsers`; refetch after every action and every 30 s while visible), `BusAssignmentPanel.tsx:37` (filter admin/band_leader/musician; mixer tenant = crc → call with host org; on BL host the panel is not reachable), `PrintModal.tsx:105` (musicians get `[]` exactly as today because the route refuses below band_leader — keep that behaviour; the modal already tolerates an empty list).

### 5.4 Pending requests and UserRow

- `PeopleSection`: pending count + "Requests" filter = `role === 'pending'`; each request row has **Approve as…** (role select, default `member`) and **Decline** (sets `denied`). Bulk actions keep working (they call set-role per uid with `tenant`).
- `UserRow.tsx:46-75,211-260`: delete `MEMBERSHIP_TO_ORGIDS`, `membershipFromOrgIds` and the crc/bl/both select. The role select is the **role in the host tenant**; options capped at the caller's tenant role (existing `assignableRoles` logic); a "Remove from {tenant name}" action calls set-role with `newRole: null` (confirmation dialog, reuses the existing confirm pattern). Sound-engineer toggle passes `tenant`.
- Copy: reuse existing labels (`ROLE_LABELS`) and tenant `name` from `useOrgConfig()`; no new wording beyond "Remove from {name}" and "Requests" — both follow existing patterns (`Deny access` / filter chips).

### 5.5 `POST /api/admin/set-role` (per tenant)

```ts
body: {
  targetUserId: string
  newRole: 'admin'|'band_leader'|'musician'|'member'|'pending'|'denied'|null   // null = remove from tenant
  tenant?: OrgId            // default = host (x-org-id)
  orgIds?: string[]         // accepted and IGNORED (cached pre-P2 People pages); response carries orgIdsIgnored:true
}
```
- Auth: `po`, or **admin in `tenant`** (tenant admins act only in their own tenant).
- Refusals: caller changing their own membership (unless po) → 400 `SELF_CHANGE`; demoting/removing the last admin of a tenant (unless po) → 409 `LAST_ADMIN`; unknown tenant → 400.
- Effect: `setMembership(...)`; legacy mirrors via `rebuildClaims`; audit `ROLE_CHANGE` with `orgId`; server writes `users/{target}/notifications` "role changed" (replaces client `notifyRoleChanged`); removal revokes refresh tokens.
- Response: `{success, tenant, role, claimsUpdated, orgIdsIgnored?}`.

---

## 6. Migration of people

### 6.1 What I need from the lead's production read (exact output)

Run `scripts/ops/multitenant/migrate-memberships.ts --plan` (read-only; written by Lane 2) — or an equivalent read — and give back `manifests/membership-plan-<ts>.json` plus this table:

| uid | email | test? | disabled | users doc? | claim `role` | claim `orgIds` | claim `soundEngineer` | doc `role` | doc `orgIds` | doc `canUpload` | planned memberships (tenant:role[:se]) | po | planned claims bytes | flags |

Flags to compute: `doc_role≠claim`, `doc_orgIds≠claim`, `pending_default_both` (doc orgIds `[crc,brotherslazaroff]`, no claim), `ruling5_admin_crc_only`, `override_applied`, `auth_without_doc`, `doc_without_auth`, `se_on_member_or_pending`.

Plus these globals:
1. All accounts with claim `role: admin` (expect the six from P0), and `config/admins.uids`.
2. `SUPER_ADMIN_UID` value from Vercel production env (is it Daniel's `…1A13`?).
3. `config/monitor.busAssignments`: every uid assigned a bus, with its role → decides §10 Q7.
4. `templates`: ids of docs **without** `orgId` (to stamp from the id prefix).
5. `config/defaults` contents, with each pointed-at setlist's `orgId` (BL pointers move to `defaults__brotherslazaroff`).
6. `auditLogs`: count, count already carrying `orgId`.
7. `memberships` and `platform` collections: confirm empty.

### 6.2 Algorithm (`scripts/ops/multitenant/migrate-memberships.ts`)

1. `--seed` (before step 1 deploy, §8): write `platform/owners {uids:['93Xn3DbS0bSNb8zmfzLyfOMX1A13']}` and `platform/membershipMigration {overrides: {'HTks9a8YRiVCQ5lVipUJcBsWjnB3': {brotherslazaroff:'admin'}}, seededAt}`. Manifest records prior absence.
2. `--plan`: for every Auth user ∪ users doc: `planLegacyMemberships` (§3.3) **plus** the explicit pending rule for the one-time run: an account with no `role` claim and doc role `pending` (or absent) gets `pending` in each tenant of doc `orgIds ∪ claim orgIds` (default-both sign-ups stay visible in both People lists, as today when People listed everyone); doc role `denied` → `denied` there. Ruling 5: claim admin → `crc:admin` only; David override adds `brotherslazaroff:admin`; Daniel → `crc:admin` + `po`. Everyone else at their current role in each claim `orgIds` tenant.
3. `--apply`: writes the manifest **first** (`manifests/migrate-memberships-<ts>.json`: per user `before {claims, doc: {role, orgIds, soundEngineer, canUpload, claimsUpdatedAt, membershipsMigratedAt}}`, `after {membershipIds[], claims}`), then per user: create memberships (`addedBy:'migration'`), `rebuildClaims` (old `role`/`orgIds`/`soundEngineer` claims **kept**, derived), set `membershipsMigratedAt`. **No refresh-token revocation** (nobody is removed). Idempotent: migrated users are skipped.
4. `--undo <manifest> [--apply]`: delete exactly the listed memberships (only if unchanged since: `addedBy == 'migration'` and role equal), restore `before.claims` verbatim via `setCustomUserClaims`, restore the doc fields, delete `membershipsMigratedAt`. Valid while the step-3 rules are not live, or after rolling them back (§8).
5. Verify: every Auth user has `membershipsMigratedAt`; every non-denied membership appears in `m`; the return lists every account changed (uid, email, before → after).

### 6.3 Extras (same manifest/undo pattern, `scripts/ops/multitenant/stamp-p2-extras.ts --only <parts>`; `templates,auditLogs` run in step 0, `defaults,admins` in step 2 — §8)

- `templates/*` without `orgId` → `orgId` from id prefix (bare → `crc`).
- `auditLogs/*` without `orgId` → `crc` (every row predates BL admin roles being tenant-scoped; logged decision).
- `config/defaults` keys pointing at BL setlists → copy to `config/defaults__brotherslazaroff` and remove from the crc doc (manifest stores both docs' before state).
- Delete `config/admins` (manifest stores its content).

---

## 7. Emulator persona suite

### 7.1 Setup changes

- `firebase.json` → `"emulators": { "firestore": {"port": 8080}, "auth": {"port": 9099}, "storage": {"port": 9199}, "ui": {...}, "singleProjectMode": true }`.
- `package.json` `test:emulator` → `firebase emulators:exec --only firestore,auth,storage "vitest run --config vitest.emulator.config.ts"`.
- `initializeTestEnvironment({ projectId, firestore: {rules: readFileSync('firestore.rules','utf8')}, storage: {rules: readFileSync('storage.rules','utf8')} })` (host/port from `FIREBASE_STORAGE_EMULATOR_HOST`, set by emulators:exec). Seed Storage objects with `withSecurityRulesDisabled(ctx => ctx.storage().ref('library/x.pdf').put(bytes, {customMetadata: {orgId}}))`.

### 7.2 Layout

```
src/test/rules/personas.ts                       // env factory, persona → claims, fixture seeding (A=crc, B=brotherslazaroff)
src/test/rules/p2-cross-tenant.emulator.test.ts  // every attack in handoff §Phase 2 / analysis §4 → assertFails
src/test/rules/p2-must-work.emulator.test.ts     // CRC + BL role matrix → assertSucceeds (parity)
src/test/rules/p2-transition.emulator.test.ts    // old-claims-only personas
src/test/rules/p2-mixer.emulator.test.ts
src/test/rules/p2-storage.emulator.test.ts
src/lib/org/__tests__/claims.test.ts             // buildClaims pure, byte limit
src/lib/org/__tests__/legacy-membership-map.test.ts  // ruling 5, pending rule, overrides
src/lib/org/__tests__/memberships.emulator.test.ts   // setMembership, ensureMembershipsMigrated, rebuildClaims, revoke on removal
src/app/api/auth/join/__tests__/join.emulator.test.ts
src/app/api/admin/set-role/__tests__/set-role-tenant.emulator.test.ts
src/app/api/tenant/people/__tests__/people.emulator.test.ts
```
Existing rules tests to update (they assume the global-admin bypass or `role` claims): `src/lib/__tests__/{contacts-rules,firestore-rules-backups,firestore-rules-get-vs-list,firestore-rules-monitor,firestore-rules-upload-batches,firestore-rules-users-self-role}.emulator.test.ts`, `src/lib/org/__tests__/firestore-rules-orgscope.emulator.test.ts`, `src/lib/performance/__tests__/firestore-rules-tonight.emulator.test.ts`, `src/lib/recordings/__tests__/firestore-rules-recordings.emulator.test.ts`, `src/lib/songs/__tests__/firestore-rules-{songs-tenant,tracks}.emulator.test.ts`. Keep their intent; "admin exempt" assertions become "po exempt; tenant admin not".

### 7.3 Personas (claims)

| Persona | Claims |
|---|---|
| `po` | `{po:true, m:{crc:'ad'}}` |
| `aAdmin` / `aBL` / `aMu` / `aMe` / `aPe` | `{m:{crc:'ad'|'bl'|'mu'|'me'|'pe'}}` |
| `aMuSE` | `{m:{crc:'mu'}, se:['crc']}` |
| `bBL` | `{m:{brotherslazaroff:'bl'}}` |
| `bSE` | `{m:{brotherslazaroff:'mu'}, se:['brotherslazaroff']}` |
| `dual` | `{m:{crc:'bl', brotherslazaroff:'ad'}}` |
| `signedOut` | unauthenticated |
| `oldBL` | `{role:'band_leader'}` (no orgIds → crc) |
| `oldAdminBoth` | `{role:'admin', orgIds:['crc','brotherslazaroff'], soundEngineer:true}` |
| `oldPending` | `{}` |

Fixtures (seeded rules-disabled): per tenant a setlist (+history entry, overrides doc, emailEvent), 2 tracks (one unstamped on an A setlist, one unstamped on a B setlist), song, recording, contact, `templates/{key}` and `templates/brotherslazaroff__{key}`, setlistTemplate, assignment (one with `musicianUid = aMu`), history, availability, live session, task (assignee aMu), bond flag, stage, songUsage + event, auditLog per tenant, membership docs for every persona, `config/defaults` + `defaults__brotherslazaroff`, `config/monitor`, `monitor-live/state`, an ack for aMu, mcpTokens, mcpOAuthCodes, `platform/owners`, Storage `library/a.pdf {orgId:crc}`, `library/b.pdf {orgId:brotherslazaroff}`, `library/legacy.pdf` (no metadata).

### 7.4 Cases — must fail

- aMe: get/list B's songs, recordings, contacts, templates (B-prefixed id and `where orgId==B`), setlistTemplates, assignments, history, availability, live sessions, bond flags, stages, songUsage(+events), tasks, auditLogs; get `setlists/{B}/history`, `performedDeviations`, `emailEvents`; read `library/b.pdf`; read any `mcpTokens`, `mcpOAuthCodes`, `platform/*`, B's membership; list memberships of B.
- aBL: create setlist stamped B / unstamped; update A setlist `orgId`→B; update/delete B's setlist, track (stamped and unstamped), song, template, contact, setlistTemplate; create a track with `orgId:A` on a B setlist; move an A track to a B setlist; write overrides / deviations on a B setlist; write `config/defaults__brotherslazaroff`; create a mixer command as **bBL** or **bSE** (B people cannot command the CRC bridge); bSE write `config/monitor`.
- aAdmin: create/update/delete any membership (A or B); write `platform/owners`; write `orgs/*`; write `config/congregation__brotherslazaroff`; read B's auditLogs; write `system/globalAlert`; read `aiConfig`/`dedupeRuns` (po only now).
- Anyone (incl. aAdmin): write `role`, `orgIds`, `m`, `po`, `soundEngineer`, `membershipsMigratedAt` into own user doc; create own membership; list `users`; get another user's doc; create a notification for another user.
- dual: as B admin, anything A-admin-only in A (history read on an A setlist, `config/defaults` write, A auditLogs read, change A setlist `ownerId`).
- oldAdminBoth: anything po-only (platform, ops collections, other tenant beyond its orgIds); oldBL: anything in B.
- signedOut: list setlists/tracks/anything; read Storage; get a template, song, membership.
- aPe: create a setlist; read A songs; enqueue a mixer command.

### 7.5 Cases — must still work (CRC and BL parity)

- signedOut: get one setlist and one track by id (both tenants).
- aMe/aMu/aBL/aAdmin and bBL in their own tenant: list setlists (signed-in), `where orgId==own` setlists, tracks by `setlistId` (including another tenant's setlist — Perform link), songs `where orgId==own`, recordings `where orgId==own, songId==`, own assignments, tasks by assignee, templates `where orgId==own` and get by key (existing and **missing** doc), `config/congregation[__t]`, `config/defaults[__t]` read, own membership get (existing and missing), `library_signals/latest`, `system/globalAlert`, overrides get.
- aMe: create own setlist (`orgId:A`, ownerId self), update/delete it; cannot touch tracks (parity: members could not before).
- aBL: create/update/delete tracks (stamped; unstamped with parent tenant A; restamp unstamped → A), update songs, overrides create + rev+1 update + deviation in same commit (existing tonight test).
- aAdmin: `config/defaults` write; auditLogs `where orgId==A` list; setlist history read; change a setlist `ownerId`.
- aMu (bus owner) / aMuSE: read `config/monitor` and `monitor-live/state`, create a bus command, read own ack; aMuSE: matrix command, write `config/monitor`; aAdmin: matrix command.
- po: everything above in both tenants, `aiConfig` read, `users` list.
- Transition: oldBL behaves as aBL in A; oldAdminBoth behaves as admin in A and B (not po); oldPending gets nothing.
- Storage: aMe reads `library/a.pdf` and `library/legacy.pdf`; bBL reads `library/b.pdf`; po reads all.
- Outside rules (route tests, existing): `/api/library/file/[id]` signed out and `/api/setlists/{id}/tracks` signed out unchanged.

---

## 8. Deploy order (CRC and BL never break between steps)

| Step | What ships | Compatible with | Rollback |
|---|---|---|---|
| 0 | Fresh Firestore export (`gs://crcmusiccharts-backups/multitenant-p2-pre-<ts>`); deploy new indexes: setlists `(orgId ASC, eventDate ASC)`, auditLogs `(orgId ASC, timestamp DESC)` (memberships queries are equality-only and need none); wait READY. `migrate-memberships --seed` (platform docs). `stamp-p2-extras --apply --only templates,auditLogs` (adds a field old code ignores). | everything (additive) | indexes are inert; platform docs unread by old code; extras `--undo` |
| 1 | **App (Lanes 2-4 merged) + step-1 additive rules (§4.2).** Memberships written by set-role/join/sound-engineer/test accounts (each first runs `ensureMembershipsMigrated`), both claim shapes written, server reads via `getTenantAccess` with legacy fallback, client reads membership when the token has `m`, writer fixes (§2), orgId-filtered queries (§1.2), defaults per tenant (crc doc unchanged), people route. Old rules still enforce. | old rules: every new query passes them (orgId-constrained queries are provable under `orgReadOk`; users reads moved server-side; Admin SDK routes bypass) | Vercel instant rollback to the previous deployment; the additive rules can stay (unread). Memberships/claims written meanwhile are inert under old code. |
| 2 | `migrate-memberships --plan` → review → `--apply`; `stamp-p2-extras --apply --only defaults,admins` (BL pointers to `defaults__brotherslazaroff`, delete `config/admins`); re-run `stamp-storage-orgid` and `stamp-orgid` (tracks) for stragglers. | old rules ignore `m`; legacy claims kept, so nothing changes for users | `--undo <manifest> --apply` for each script (exact restore). |
| 3 | **Full `firestore.rules` + `storage.rules`** (§4). Same deploy hour: BL probe (`scripts/dev/e2e-bl-tenant-probe.mjs`, must equal baseline 19/19 and counts), throwaway accounts per CRC/BL role through the browser (dashboard, setlist edit, Perform, schedule, People, library, mixer for CRC), production cross-tenant probe. | step-1 app | `git show <pre-P2>:firestore.rules > /tmp/r && firebase deploy --only firestore:rules,storage --project crcmusiccharts` with the previous files (≈1 min). App needs no rollback (it was built for both). |
| 4 | Monitor 24 h: `admin-consistency` cron report (accounts without `m`, claim/membership drift), Sentry permission-denied counts by collection. | — | as step 3 |
| 5 (end of P2, or deferred to P9) | Remove the `hasM()` fallback from both rules files and the unmigrated fallback from `getTenantAccess`; stop writing legacy `role/orgIds/soundEngineer` claims and users mirrors only after every reader is converted (grep gate). | all accounts carry `m` | re-deploy step-3 rules / revert commit |

Order inside step 1 matters: the step-1 rules must be live **before** the app, or the client's membership listener errors (harmless: it falls back to legacy while the token has no `m`, which is everyone until step 2).

---

## 9. Lane split

All lanes branch from `claude/multitenant-2026-10-12`, each in its own worktree with its own git identity (`coder-N`). Subagents Opus or Sonnet only.

**Lane 1 — Rules and persona suite.** Files: `firestore.rules`, `storage.rules`, `firebase.json`, `package.json` (`test:emulator` only), `firestore.indexes.json`, `src/test/rules/**`, the 11 existing `*rules*.emulator.test.ts` files listed in §7.2. Deliverables: §4.1, §4.2 (as `docs/planning/2026-10-12-multitenant/work/firestore.step1-additive.rules` for the lead to apply), §4.3, §7. Acceptance: `npm run test:emulator` green with every §7.4 case failing and every §7.5 case passing; a mutation check (temporarily re-adding an `isAdmin() ||` bypass makes ≥1 cross-tenant test fail). No app code.

**Lane 2 — Identity core (server).** Files: `src/lib/org/access.ts`, `claims.ts`, `memberships-write.ts`, `legacy-membership-map.ts`, `membership-server.ts`, `src/lib/api-auth.ts`, `src/lib/server-auth.ts`, `src/lib/session-role.ts`, `src/proxy.ts`, `src/app/api/auth/{session,refresh-session,sync-claims,join,qr,test-session,admin-test-session}/**`, `src/app/api/admin/{set-role,set-sound-engineer,delete-user,set-upload-permission}/**`, `src/app/api/tenant/people/**`, `src/app/api/mcp/{tokens,oauth/token}/route.ts`, `src/app/api/cron/{admin-consistency,bridge-watch,backup,storage-backup}/route.ts`, `src/app/api/setlist/delete/route.ts` (history entry), `src/lib/reader-music-server.ts`, `src/types/schemas.ts` (role optional), `scripts/ops/multitenant/{migrate-memberships,stamp-p2-extras}.ts`, delete `scripts/issue-bl-bearer.mjs`, rewrite/delete `scripts/ops/set-role.js`. **First commit: the `access.ts`/`claims.ts`/`memberships-write.ts` signatures in §3.3 exactly** (Lanes 3-4 code against them). Acceptance: unit + emulator tests for `buildClaims` (byte limit), ruling-5 map (David crc+BL admin; Karen/Drew×2/crcmusic crc-only admin; Daniel po), `ensureMembershipsMigrated` idempotent, set-role per tenant (tenant admin refused in other tenant; last-admin; self-change; removal revokes), join (host only, idempotent, denied stays denied), people route (≥bl in host only), session cookie carries org and proxy ignores a cookie from another org; `migrate-memberships --plan/--apply/--undo` round-trip on the emulator restore leaves claims byte-identical; grep gate: `setCustomUserClaims` only in `src/lib/org/claims.ts` (+ scripts/.archive).

**Lane 3 — MCP and server role reads.** Files: `src/lib/mcp/server-tracks-write.ts`, `src/lib/mcp/server-monitor.ts`, `src/lib/mcp/org-context.ts` (`accessFrom(extra)`), `src/lib/mcp/tools/**` (all sites in §3.4 rows "readUserRole", "loadUploader", "Direct users/{uid}.role", roster listings), `src/lib/scheduling/assignment-service.ts`, `src/app/api/scheduling/{suggest,suggest-band}/route.ts`, `src/app/api/setlist/email-packets/route.ts`, `src/app/api/setlists/notify-updated/route.ts`; and every server writer fix W1–W9, W11, W12 (§2.2) with its files: `src/lib/{library-upload,firebase-storage,chart-heal,sync-engine,setlist-write,song-usage,setlist-import-execute}.ts`, `src/lib/setlist-import/commit.ts`, `src/lib/drive-sync/{inbox,poller}.ts`, `src/lib/intake/import-batch-job.ts`, `src/lib/library/safely-delete-library-object.ts` (W10 part), `src/app/api/library/{upload,chord-cache,detect-key}/route.ts`, `src/app/api/setlists/import/{execute,commit-document}/route.ts`, `src/app/api/setlist/notify-band/route.ts`. Depends on Lane 2's first commit. Acceptance: `readUserRole` gone (grep); every MCP role decision uses the token tenant; new tests: BL-token caller who is crc-only admin is refused write tools on BL; dual member (crc band_leader + BL admin) gets admin-only tools only with a BL token; mixer tools use crc membership (David's BL token keeps mixer); roster tools list tenant members with tenant roles; one test per W1–W12 gap asserting the created doc (or Storage object metadata) carries the right `orgId`, including a BL-token `commit_staged_changes` add and a BL-token `flag_bond` on a CRC track (refused); `processChartUpload` without `orgId` is a type error; existing MCP suites green; BL probe 19/19 against the emulator restore.

**Lane 4 — Browser.** Files: `src/lib/auth-context.tsx`, `src/lib/users-firebase.ts`, `src/lib/musician-profile.ts`, `src/lib/notification-store.ts`, `src/components/admin/{PeopleSection,UserRow}.tsx`, `src/components/admin/people/AccessAuditLog.tsx`, `src/components/admin/TemplatesSection.tsx`, `src/components/monitor/BusAssignmentPanel.tsx`, `src/components/setlist/PrintModal.tsx`, `src/components/nav/{MobileTabBar,DesktopHeader,MobileMenuDrawer}.tsx`, `src/app/(main)/{DashboardClient.tsx,settings/page.tsx}`, `src/hooks/{use-upcoming-prep,use-setlist-dashboard,use-creation-wizard}.ts`, `src/lib/{scheduling-firebase,setlist-firebase,template-firebase,setlist-audit}.ts`, `src/lib/songs/prime.ts`, `src/lib/local/write.ts` and/or `src/lib/sync/init.ts` (track `orgId` stamping), `src/lib/sync/snapshot-listener.ts` (none expected). Uses `/ui-ux-pro-max` for the People changes (standing rule). Depends on Lane 2 route contracts (§5). Acceptance: every query in §1.2's "must change" column changed; unit tests for the client transition (`m` present → membership role; absent → profile role; po → admin); People renders requests/approve/decline/remove with mocked route; track created via grid/add-to-setlist/duplicate/seed carries parent `orgId`; `saveAsTemplate` stamps `orgId`; defaults use per-tenant doc; `npm test`, `tsc`, `SKIP_ENV_VALIDATION=1 npx next build --webpack` green; golden HTTP capture unchanged for signed-out surfaces.

**Merge order:** Lane 2 → Lane 3 → Lane 4 → Lane 1 (rules last; Lane 1 works in parallel from day one against §4 and the persona claims, and rebases its must-work fixtures if Lane 4 changes a query shape). Gate before step 1: all four merged, full `npm test` + `npm run test:emulator` + `tsc` + build green on the merge.

---

## 10. Open questions (defaults stated; none blocks)

1. **Unstamped track creates** (pre-P2 cached bundles): accepted when the caller is ≥bl in the parent setlist's tenant (rules `trackOrg`), until step 5. Default: yes.
2. **Ops/global-data tools** (backups, `library/sync`, `drive/health`, `admin/migrations`, ai-spend, web-vitals, dedupe, dump sizes, test tokens): "admin" = admin of the host/token tenant in P2 (parity: every current admin is a crc admin). Narrowing to `po` is phase 4. Default: parity now.
3. **`canUpload`** stays a global users-doc flag; a tenant admin may set it only for members of their tenant. Default: yes; per-tenant flag later if needed.
4. **Pre-existing pending accounts**: pending in doc `orgIds ∪` claim `orgIds` (keeps today's visibility in both People lists). Default: yes.
5. **Mixer commands by `member` role**: the handoff says "at least musician"; today members with a bus can enqueue. Default: musician (handoff), **unless** the §6.1 read shows a member holding a bus — then keep `me` for commands and log it.
6. **Cross-tenant leaks fixed by orgId filters** (BL gigs in CRC's next-gig tab, BL wizard reading CRC's default pointers, non-admin band leaders' empty schedule view now filled): these are visible corrections, not new features. Default: ship and log in the return.
7. **Removal timing**: Firestore rules see a removed member's old `m` for ≤ 1 h (ID token lifetime); server routes and MCP are immediate; refresh-token revocation signs the person out of every tenant. Default: accept.
