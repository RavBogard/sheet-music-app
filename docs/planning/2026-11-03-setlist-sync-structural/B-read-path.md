# B — Read/receive path: how a device's view of a setlist is built and kept current

Read-only investigation, 2026-11-03, against `master` @ 4cd2d8a9. Every claim cites file:line.
Confidence notes are explicit where something is inferred rather than run.

## 0. The one finding that explains most of the incident

**The live tracks listener is refused by the rules for every signed-in user except the platform
owner, and has been since 2026-10-13.**

- The listener's query is `tracks where setlistId == X`, with no orgId filter
  (`src/lib/sync/snapshot-listener.ts:124-127` test path, `:176-179` production path).
- The `list` rule on `/tracks` is `signedIn() && atLeast(listOrg(), 'pe')` (`firestore.rules:290`),
  where `listOrg()` is `resource.data.orgId` (`firestore.rules:50`) and `atLeast` is
  `po() || rank(code(t)) >= rank(c)` (`firestore.rules:23`). A query that does not constrain
  `orgId` cannot satisfy a rule that reads `resource.data.orgId`, so Firestore refuses it.
  Only `po()` short-circuits without looking at the document.
- Commit caacfb34 (2026-10-13, "Any signed-in person could read every tenant's setlists and
  tracks") introduced that rule and says "the three readers scope by tenant". It changed
  `client-tracks.ts:109-113` and `track-count-sync.ts:85-86`. It **did not touch
  `snapshot-listener.ts`** (`git log -- src/lib/sync/snapshot-listener.ts` last commit is d7c7ec7f,
  2026-09-24).
- The rules tests cover a signed-in member running `orgId + setlistId`
  (`src/lib/__tests__/firestore-rules-get-vs-list.emulator.test.ts:195-206`) and a signed-OUT
  caller running `setlistId` alone (`:130-142`). **No test runs the listener's exact query as a
  signed-in non-po member.** The test file even states the rule: "a setlistId on its own names a
  tenant the rule cannot see" (`:191-193`).
- The error goes to `logger.warn` and Sentry (`snapshot-listener.ts:423-430`). A query listener
  that is refused is terminated by the SDK and never retried, so the subscription is silently
  dead for the rest of the page's life.

Consequence: Daniel (po) receives live track changes. David (crc `bl`), every musician, and every
band iPad signed in as a member receive **no** live track rows, in the editor
(`SetlistGridHydrator.tsx:288-293`) and in Perform (`use-setlist-performance.ts:176-191`). The
setlist *doc* listener still works because it is a `get`, which is public
(`firestore.rules:205`).

Confidence: high from the rules semantics plus the test file's own statement. **Confirm with one
emulator assertion**: `authenticatedContext('u', { m: { crc: 'bl' } })` →
`onSnapshot(query(tracks, where('setlistId','==',S)))` must fail. If it does, this is the
headline.

## 1. Ways a device shows rows that differ from the server and do not heal by themselves

| # | Mechanism | Where | Heals on more snapshots? | Heals on reload? |
|---|---|---|---|---|
| 1 | Listener refused (non-po signed in), see §0 | `snapshot-listener.ts:176-179`, `firestore.rules:290` | No: no snapshots arrive | Editor: partly (#3). Perform: no, if Dexie already has rows (#2) |
| 2 | **Dexie wins over SSR in Perform, and Perform never writes the SSR frame into Dexie.** `plannedTracks = liveTracks.length > 0 ? liveTracks : SSR` | `use-setlist-performance.ts:287-292`; Dexie read `:196-205` | No | **No.** A fresh SSR frame is fetched and discarded whenever Dexie has even one row for this setlist. Dexie is filled only by the listener (dead, #1) or by an earlier editor visit (hydrator). So David's phone, once he opened the editor, shows that editor-time copy in Perform indefinitely |
| 3 | Hydrator and listener never prune. Neither deletes a local row whose id is absent from the server set. A `removed` change is the only delete path (`snapshot-listener.ts:316-326`), and it arrives only while a listener is attached at the moment of the delete. A reattached listener's first snapshot reports only `added` for current docs. The hydrator only puts (`SetlistGridHydrator.tsx:222-255`) | as cited | No | No. Ghost rows survive every reload until IDB is wiped |
| 4 | **Ghost creates.** A create that dead-letters (`engine.ts:499-503`, or auth `:466-482`) leaves its Dexie row. If the user discards it (`cleanup.ts:32-50`), only the outbox row goes and the Dexie row stays. No server doc exists, so no `removed` ever comes. Matches the lead's evidence: the order gaps at 10, 14, 15, 20 and 22 are rows that exist only in Daniel's browser | `cleanup.ts:42-47` | No | No (#3) |
| 5 | **Any outbox row, including terminal `failed`, blocks all receipt for that doc.** | listener `snapshot-listener.ts:203-216, 244-245, 303-314`; hydrator `SetlistGridHydrator.tsx:141-148, 183-187, 223` | No | No: the hydrator applies the same skip. Lasts until a human retries or discards |
| 6 | **"Take theirs" does not take theirs.** `resolveConflict('theirs')` only deletes the outbox row (`engine.ts:585-586`). The provider writes nothing remote into Dexie (`ReconciliationProvider.tsx:384-404`). The local row keeps the rejected edit and its old `updatedAt`. The remote version was already delivered, and skipped as `guard-skipped-pending`, so it is not delivered again. The hydrator comment claiming the listener "closes the 'theirs' staleness gap automatically" (`SetlistGridHydrator.tsx:273-275`) holds only after a listener reattaches, and only for po | as cited | No | Editor reload: yes for po (listener first snapshot, LWW). Perform/non-po: no |
| 7 | `updatedAt === undefined` locally makes the listener prefer local forever | `snapshot-listener.ts:264, 350-356` | No, unless a commit writeback fills it | Editor hydrator treats undefined as 0 and heals (`SetlistGridHydrator.tsx:243`); the listener does not |
| 8 | Tombstones block resurrection with no expiry or server check: a delete that failed or was discarded hides a row that still exists on the server | `snapshot-listener.ts:251-255, 333-343`; hydrator `:136-148, 192-208` | No | No |
| 9 | **Signed-in devices get no "updated since load" strip.** `setlistUpdatedSinceLoad = !user && …` | `use-setlist-performance.ts:297-298`; strip `SetlistPerformClient.tsx:392, 817-833` | — | A non-po signed-in Perform device with an empty Dexie shows the SSR frame with no live rows and no strip. Reload heals it, but nothing tells the musician to reload |
| 10 | **The strip is blind to browser editor edits even for signed-out devices.** It compares setlist `version` when both sides carry one (`setlist-freshness.ts` `setlistMovedPast`). Browser outbox track writes never touch the setlist's `version` or `updatedAt`: the `set`/`update` commit stamps only the track (`init.ts:125-128, 186-189`), and the derived-count `updateDoc` writes only `trackCount/songCount/fileIds` (`track-count-sync.ts:91-95`). Only MCP and the reorder endpoint bump `version` (`server-tracks-write.ts:433-443`) | as cited | — | A signed-out iPad sees the strip for MCP edits but never for Daniel's browser edits |
| 11 | Signed-out devices: no live rows by design (`use-setlist-performance.ts:176-178`); the SSR frame is frozen at load; refetch happens only when the SSR frame was empty (`:251-285`) | as cited | No | Yes |
| 12 | Service worker: `perform-shell-sw.js` is NetworkFirst for `/perform` HTML and falls back to cache only on network failure (`public/perform-shell-sw.js:141-172`). It does not cache `/api/setlists/*/tracks`. `public/sw.js` is a tombstone. **Not a meaningful staleness source online**; offline it serves the last good HTML, which is correct behaviour | as cited | — | — |
| 13 | Multi-tab: Firestore uses `persistentSingleTabManager` (`src/lib/firebase.ts:165-181`). A second tab's SDK falls back to memory, so no stale IDB. Dexie is shared across tabs and writes propagate through liveQuery. One tab holds the drain lock (`cross-tab-lock.ts`). On iOS a backgrounded leader tab can be frozen, so its outbox stalls and every tab's `hasPendingOutboxRow` blocks receipt for those docs (#5). Low frequency, same mechanism | as cited | — | — |
| 14 | iOS Safari IDB eviction (ITP, about 7 days unvisited for non-home-screen sites) wipes Dexie, including the outbox, so unsaved edits are lost silently. Ironically this is the only thing that heals #3 and #4 | `schema.ts:22` (single DB `crc-local`) | — | — |
| 15 | Cross-tenant: `client-tracks.ts:109-124` carries the orgId and falls back to the public API when refused. The listener (#1) has neither the filter nor the fallback. A CRC-signed-in device opening a BL setlist (or the reverse) is also refused, and with the orgId filter it would still be refused. It needs the API fallback | as cited | — | — |

Other Dexie readers with the same staleness: `SetlistDrawer.tsx:250-254` and
`use-dexie-tracks-for-setlists.ts:36-38`.

## 2. Why a receiver "jumps around"

1. **Per-row deliveries of a multi-row edit.** The editor renumbers with N independent `applyEdit`
   updates (`SetlistGrid.tsx` ~1240-1250 and the duplicate cascade ~1300-1325), drained one row per
   commit. Each commit is a `runTransaction` plus a re-read (`init.ts:158-209`), about 300 ms
   apart. Every intermediate permutation, including duplicate `order` values mid-burst, is a
   real server state that a live receiver renders. The reorder endpoint does this correctly: one
   transaction for all rows plus a version bump (`server-tracks-write.ts:433-443`).
2. **Tie-break during the burst.** Mid-burst, two rows share an `order`, and which one is first
   depends on the tie-break. The grid uses order-then-id (`SetlistGrid.tsx:1008-1024`); Perform
   uses `.sortBy('order')` (`use-setlist-performance.ts:200-202`). Dexie returns index order
   (`setlistId`, then primary key) and the JS sort is stable, so Perform is order-then-id in
   effect; the drawer is the same (`SetlistDrawer.tsx:252-254`). Two rows briefly tie and swap by
   id, then swap back when the next renumber lands. The visible effect is a row hopping past a
   neighbour and returning. Sorting is not the root cause; the non-atomic write is.
3. **Move highlight per intermediate order.** `useMovedRowHighlight` fires for every order change
   with the same id set (`use-moved-row-highlight.ts:50-70`), so each of the N intermediate
   snapshots re-highlights a different set of rows for 2 s.
4. **Hold logic** holds a pure reorder only while a finger is down, plus 300 ms
   (`SetlistPerformClient.tsx:156-199`), then releases the latest order. That is fine, but a row
   arriving or leaving releases at once (`:189-193`), and so does a ghost-row difference.
5. **Mixed sources.** A receiver whose listener is alive applies some rows and skips others
   (pending, failed, stale, tombstoned; #5-#8). It renders a hybrid that is neither its own intent
   nor the server's, and the next delivery reshuffles it.
6. On Daniel's side, his own ghost rows (#4) occupy order slots. When the server has gaps (10, 14,
   15, 20, 22) and a receiver has none, the same logical position maps to different rows.

## 3. Does the editor suffer the same staleness? The mutual-overwrite loop

Yes. The editor reads Dexie only (`SetlistGrid.tsx:1008`). It primes Dexie from SSR once per
mount with LWW and no prune (`SetlistGridHydrator.tsx:105-266`), then relies on the same listener
(`:288-293`).

**Asymmetry in this incident:**

- Daniel (po) has a live listener. His view contains David's committed changes plus his own ghost
  creates and failed rows, which are pinned by #4 and #5.
- David (bl) has a dead listener. His view is the server as of his last editor load, plus his own
  pending rows.

**The loop, traced:**

1. David's phone renders his stale list and he moves a row. The grid computes new `order` values
   for every affected row **from his stale full list** and enqueues one `update` per row, each
   with `expectedUpdatedAt = his local row.updatedAt`.
2. Per row, at the server (`init.ts:159-189`):
   - Rows Daniel touched since David's load fail with `VersionMismatchError` and are marked
     `failed`. That stops the drain (`engine.ts:415-422`), pins David's local value
     (#5), and David sees a conflict or "saving".
   - Rows Daniel did not touch pass the precondition and **land**, carrying order numbers computed
     against a list that no longer exists. The precondition guards a row; the invariant being
     broken (a permutation of 0..N-1) belongs to the list, and nothing guards the list for browser
     writes. The list-level guard, setlist `version`, is never bumped or checked by the outbox.
3. Daniel's live listener applies David's landed rows. Daniel's grid now has duplicates or
   inversions. Daniel fixes it by dragging, which produces N more per-row updates computed from
   his list, ghost rows included. Some of those collide with David's earlier landings (mismatch,
   `failed`, pinned on Daniel's side); others land.
4. David never receives any of it (dead listener). His next action is again computed from the
   stale list, and the cycle repeats. Each side is "right" by its own Dexie, and each lands a
   partial renumber that the other side does not (David) or cannot fully (Daniel, pinned rows)
   absorb.
5. **Unguarded overwrite paths that make it worse:**
   - `set` ops have no precondition at all (`setDoc` full overwrite, `init.ts:113-128`). That
     covers duplicate-row clones, adds, and the lazy-hydration fan-out (`SetlistGridHydrator.tsx:311-333`),
     which re-`set`s every row from the SSR copy when `hydrated !== true`.
   - "Keep mine" re-arms with `newExpectedUpdatedAt = remote.updatedAt`
     (`ReconciliationProvider.tsx:398-399`, `engine.ts:587-594`), which is an explicit overwrite
     built on a stale neighbourhood.
   - The Perform live-reorder endpoint is gated on `lastSeenVersion` (`setlist-write.ts:1336-1341`;
     `server-tracks-write.ts:~380-400`). Browser editor edits never bump `version` (#10), so a
     stale device whose row *set* still matches passes the gate and rewrites **every** row's order
     atomically. That is a full overwrite of someone else's browser reorder. The endpoint refuses
     only when the id set differs (`server-tracks-write.ts:409-431`), which a ghost row on the
     caller's side triggers. That is why reorders "fail" from Daniel's device.

So there is a loop. It is not a tight ping-pong, because David's view never updates. It is a
ratchet: each actor's stale-list renumbers land partially on the server, and the only party who
could see them is pinned by his own unresolved rows.

## 4. The invariant, and architectures that guarantee it

**Invariant (proposed):** *Within T seconds of being online (T ≈ 5), every device's rendered list
for a setlist equals the server's list at some recent version V, with this device's own
unacknowledged edits applied over it. Each such edit is visibly marked as unsaved. A rejected edit
is visibly marked as rejected and stops masking the server row. Nothing else differs, and no
receiver ever renders a list state the server never held.*

Corollaries: no ghost rows; `failed` does not pin a row silently; every writer moves the list
version; a multi-row change is a single server state.

### Option A: repair the current shape (smallest; about one PR plus emulator tests)

1. Add the orgId filter to the listener (setlist orgId from Dexie or SSR, else `data-org`), and
   fall back to polling `/api/setlists/{id}/tracks` on refusal or when signed out (cross-tenant,
   anonymous). Add the emulator assertion from §0 for the exact listener query, for `bl`, `mu`, `me`
   and `pe`.
2. Treat each non-`fromCache` tracks snapshot (and the SSR frame, and each API poll) as the full
   server set for that setlist. In one Dexie transaction, put newer rows, **delete local rows
   absent from the set** unless they have a `pending` or `sending` outbox row, and clear stale
   tombstones. Do the same in the hydrator and in Perform (Perform should prime Dexie from SSR
   exactly like the hydrator, instead of "Dexie wins if non-empty").
3. `failed`, discard and "take theirs" all **rebase**: write the current server doc into Dexie
   (or delete it locally if the server has none) as they drop the outbox row. Render rows with an
   outbox row with a visible unsaved or failed mark.
4. Make every list-shaped edit (move, renumber, duplicate cascade, insert) a single server write:
   route it through the reorder endpoint, or a batched transaction that bumps `version`. Have the
   outbox's track commits bump setlist `version` too, so the strip and `lastSeenVersion` see browser edits.
5. Show the "updated" strip for signed-in devices whose listener is not live.

Cost: moderate, touching the listener, hydrator, Perform hook, engine resolve paths and the grid's
reorder. Risk: pruning must never drop a just-created row before its first commit lands; the
pending/sending exemption handles that.

### Option B: server snapshot plus local overlay (the robust shape; about two to three PRs)

Render = the last server snapshot of the list (whole list, versioned), plus an overlay of this
device's pending ops. Dexie stores only (a) the last server snapshot per setlist, for offline,
and (b) the op queue. It never stores a merged "local truth". All writes, editor included, go
through one server endpoint (the MCP/reorder transaction family) with `lastSeenVersion`. That
endpoint bumps `version` and either applies the change or returns the current list, and the
client then rebases or drops the op and marks it. Receivers swap whole versions, so there are no
intermediate orders, no ghosts and no pinning. This collapses three writer paths into one
concurrency model. Cost: the grid's applyEdit and outbox path is rewritten, and offline editing
becomes queued ops that may be rejected, which suits a band app. It removes most of the guard
code in §1.

### Option C: convergence watchdog (a cheap safety net; a few days; complements A or B)

Every 15–30 s while online and visible, plus on `visibilitychange`, fetch a cheap list fingerprint:
setlist `version` plus a hash of `(id, order, updatedAt)` from the public tracks endpoint. If
Dexie minus own pending rows differs, hard-reset Dexie for that setlist to the server rows, record
a Sentry event naming the divergence class, and mark own failed rows. This works for signed-out,
cross-tenant and dead-listener devices alike, and it would have caught §0 within a minute in
production. It does not fix the jumpiness (§2), which needs A.4 or B.

**Recommendation:** A.1 and C now (A.1 is a one-line query change plus a test, and it restores
live rows for every non-po device). Then A.2–A.4, or go straight to B if Daniel wants editor
writes unified with the MCP and reorder transaction model.
