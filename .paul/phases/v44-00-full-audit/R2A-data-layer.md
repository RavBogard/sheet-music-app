# R2A — Data-layer audit (re-derived 2026-04-15)

**Scope:** Firestore write races, denormalization drift, state-machine correctness, query/index coverage, transaction scope, fire-and-forget correctness, rules/code drift.
**Method:** Full read of server routes under `src/app/api/**`, lib modules in `src/lib/` that touch Firestore (Admin + client SDK), and the client-side scheduling/setlist hooks. Cross-referenced against `firestore.rules` and `firestore.indexes.json`.

## Findings

### DL-001: assign — setlist.musicians merge lives outside the per-assignment transaction
**Severity:** P0
**Category:** race
**File(s):** `src/app/api/scheduling/assign/route.ts:72-106, 198-215`
**Observation:** Each musician's `scheduling_assignments` create runs in its own `runTransaction` at L73-106. Then, *after* the for-loop completes, a separate `runTransaction` at L202-212 reads `setlists/{id}.musicians` and writes back a merged array with `assignedUids`. The two transactions are unrelated — nothing couples "an assignment exists" to "the musician is in setlist.musicians".
**Risk:** If `/assign` races with `/unassign` or `/respond decline` for the same setlist, the assign's `mergeNewMusicians` can read a `musicians` array that already reflects a decline/unassign, then write back a version that re-adds the just-removed musician (or vice versa). Stranded denormalized entries survive indefinitely — schedule page shows "assigned" musicians who have no active assignment doc.
**Fix shape:** Fold the setlist.musicians merge into the per-assignment transaction (read setlist doc + assignment in the same tx, update both atomically). Or, rebuild `musicians`/`assignedUids` from the canonical `scheduling_assignments` collection on read, eliminating the denormalization entirely.
**Blocks Phase 1?:** yes

### DL-002: respond/decline — setlist.musicians removal is a separate read-modify-write outside the status transaction
**Severity:** P0
**Category:** race
**File(s):** `src/app/api/scheduling/respond/route.ts:29-57, 99-112`
**Observation:** The status transition `pending → declined` commits in the tx at L30-57. Then at L100-108 a plain `setlistRef.get()` followed by `setlistRef.update({ musicians: filtered })` runs outside any transaction. The read-filter-write sequence has no concurrency control.
**Risk:** Concurrent declines from two musicians (or a decline racing an assign's `mergeNewMusicians`) will both read the same baseline `musicians` array, each filter out their own uid, and the later writer clobbers the earlier writer's removal — the earlier-declining musician stays in the array. Also missing `assignedUids` update (the assign path maintains both; this path only touches `musicians`).
**Fix shape:** Move the musicians-array mutation into the same transaction as the status flip. Use `FieldValue.arrayRemove` on a uniquely keyed shape, or re-derive the array from `scheduling_assignments` in the same tx.
**Blocks Phase 1?:** yes

### DL-003: unassign — same split-transaction pattern, also drops assignedUids on mismatched path
**Severity:** P0
**Category:** race
**File(s):** `src/app/api/scheduling/unassign/route.ts:31-44, 134-148`
**Observation:** Assignment is flipped to `cancelled` inside a runTransaction (L31-44). Outside the tx (L135-145), a non-transactional read of `setlists/{id}`, local filter, and `update({ musicians, assignedUids })` runs. Same race window as DL-002.
**Risk:** Parallel unassigns on the same setlist can each observe the pre-filter array, each drop only their own musician, and the late writer restores the other's musician. `assignedUids` drifts from the cancelled assignment's real state.
**Fix shape:** Same as DL-002 — fold the setlist doc mutation into the status-flip transaction or derive from assignments collection.
**Blocks Phase 1?:** yes

### DL-004: assign — fire-and-forget notifiedVia writes can be lost on tx retry
**Severity:** P1
**Category:** fire-and-forget
**File(s):** `src/app/api/scheduling/assign/route.ts:119-191`
**Observation:** The outer for-loop awaits the assignment-create transaction (L73-106), then kicks off email/SMS/push/in-app notifications. Each success path does `.update({ notifiedVia: FieldValue.arrayUnion(...) })` with a `.catch(log)` — no retry, no durable queue. The in-app block (L166-183) awaits the notification-create write and then awaits the `notifiedVia` update, but still swallows failures.
**Risk:** `notifiedVia` can reflect only a subset of channels that actually delivered. Re-publish or reminder logic that keys off `notifiedVia` to avoid double-sending will either re-spam or under-notify. The tx-retry hazard is smaller here (the outer transaction commits before we touch `notifiedVia`), but email/SMS webhooks don't feed `notifiedVia` back either — so the field is structurally a best-effort log, not a reliable source of truth.
**Fix shape:** Either treat `notifiedVia` as advisory (document it, don't build idempotency on top), or persist per-channel delivery state via an Inngest/queue step with retries. At minimum, coalesce the arrayUnion calls into a single update at the end of each musician iteration.
**Blocks Phase 1?:** no

### DL-005: assign — fetching musician preference doc per iteration inside the loop
**Severity:** P2
**Category:** scope
**File(s):** `src/app/api/scheduling/assign/route.ts:112-114, 166-191`
**Observation:** For each musician, the loop does `db.collection('users').doc(musician.uid).get()` to read `notificationPreferences`. This is N+1 and sits in the hot path of a bulk assign.
**Risk:** Bulk-assigning a full band (~12 musicians) fires 12 sequential `users/{uid}` reads plus 12 email + 12 SMS + 12 push + 12 notification writes. Latency scales linearly. Compare with `cron/scheduling-reminder` which batches via `db.getAll(...refs)`.
**Fix shape:** Batch the `users/{uid}` reads with `db.getAll(...refs)` before the loop, or use the userDataMap pattern from publish/route.ts.
**Blocks Phase 1?:** no

### DL-006: publish — no precondition on setlistRef.update, races with editor flushes
**Severity:** P1
**Category:** precondition
**File(s):** `src/app/api/setlist/publish/route.ts:97-116`
**Observation:** The route reads `setlistRef` at L70, then `setlistRef.update` at L103 or L111 with no transaction and no `expectedUpdatedAt`. The code comment (L91-96) explicitly accepts this: "Intentionally skips the concurrent-edit precondition used by updateSetlist — publish is a user-initiated action that bumps a snapshot + notification state; it's OK if it races with a recent edit". Meanwhile `setlist-firebase.ts#updateSetlistWithVersion` and `setlist/flush/route.ts` do enforce the `updatedAt` precondition.
**Risk:** A publish click racing an in-editor autosave can produce `publishedSnapshot` that reflects a pre-save `tracks` array while `updatedAt` jumps past the editor's lastSeen. Editor sees stale-write banner next save; recipients got an email with a snapshot that doesn't match the final setlist. Not a data-loss bug, but a correctness/UX inconsistency.
**Fix shape:** Wrap the publish read + snapshot-write in a transaction; re-read `tracks` inside the tx so the snapshot is coherent with the new `publishedAt`. Optionally accept `expectedUpdatedAtMs` from the client to surface a 409 like flush does.
**Blocks Phase 1?:** no (documented-as-intentional, move to later phase)

### DL-007: set-role — Auth claims update lives outside the Firestore transaction
**Severity:** P1
**Category:** state-machine
**File(s):** `src/app/api/admin/set-role/route.ts:29-56`
**Observation:** Firestore transaction updates `users/{uid}.role` and writes an auditLog (L29-49). Auth `setCustomUserClaims` runs after the tx (L52-55), caught-and-logged only. If the Auth call fails, Firestore says the user is an admin but the token claim stays on the old role.
**Risk:** Firestore rules accept `token.role == 'admin'` OR `config/admins.uids` membership, so normal admin drift is soft-caught. For `band_leader` promotions, though, there's no config/admins fallback — a silent claim failure leaves the user with Firestore role=band_leader but no token claim, so server API routes (which check `ctx.auth.isBandLeader` derived from claim) will deny them. The `cron/admin-consistency` route is read-only and only checks admin uids, not band_leader.
**Fix shape:** On claim-write failure, either roll back the Firestore role write (compensating write + audit log entry) or mark the user doc with `claimsDrift: true` and let `sync-claims` reconcile on next sign-in. Document in the audit log when Auth failed.
**Blocks Phase 1?:** no

### DL-008: set-sound-engineer — no audit log, no Firestore rollback on claim failure
**Severity:** P1
**Category:** state-machine
**File(s):** `src/app/api/admin/set-sound-engineer/route.ts:41-54`
**Observation:** `db.collection("users").doc(...).update({ soundEngineer })` runs, then `setCustomUserClaims` runs with only a `logger.warn` on failure. No transaction, no audit log (unlike set-role). Firestore field and custom claim can diverge silently. `isSoundEngineer()` in firestore.rules checks only the claim.
**Risk:** A failed claim update leaves Firestore saying user is a sound engineer, but rules deny them the sound-engineer-only writes (`config/monitor`). User sees inconsistent UI (toggle looks on) but can't perform actions.
**Fix shape:** Mirror set-role's shape — transactional Firestore + audit, then claim. Add an audit log entry for every toggle.
**Blocks Phase 1?:** no

### DL-009: delete-user — batch delete + Auth delete ordering allows orphan sessions
**Severity:** P2
**Category:** state-machine
**File(s):** `src/app/api/admin/delete-user/route.ts:33-56`
**Observation:** Order is: revoke refresh tokens → Firestore batch (delete user doc + audit log) → Auth deleteUser (best-effort, warn on failure). No cascade: assignments, notifications, blockout dates, fcmTokens-bearing user subcollections, owned setlists all survive.
**Risk:** Deleted user's setlists still list them as `ownerId`, scheduling_assignments still reference them as `assignedBy`/`musicianUid`, notifications subcollection is not recursively deleted. If Auth.deleteUser fails (warned-and-continue), the account still exists in Firebase Auth with no Firestore profile — sign-in succeeds but most rules fail because `users/{uid}` doesn't exist.
**Fix shape:** Auth.deleteUser should come first (so revoked tokens + deleted Auth entry means no further session work), then cascade Firestore like `setlist/delete` does (recursiveDelete on users/{uid}, batch-delete scheduling_assignments where musicianUid == uid, reassign or tombstone setlists owned by the user).
**Blocks Phase 1?:** no

### DL-010: denormalized musicianName/setlistName never reconciled on source rename
**Severity:** P1
**Category:** drift
**File(s):** `src/app/api/scheduling/assign/route.ts:85-101` (writer); `src/app/api/scheduling/respond/route.ts:88` (reader); `src/app/api/scheduling/remind/route.ts:73-111` (reader); `src/app/api/cron/scheduling-reminder/route.ts:108-145` (reader); `src/app/api/scheduling/calendar-feed/[token]/route.ts:59-100` (reader)
**Observation:** `scheduling_assignments` doc stores `musicianName`, `musicianEmail`, `musicianPhone`, `setlistName`, `assignedByName` at create time. No fan-out exists when `users/{uid}.displayName`, `users/{uid}.email`, `users/{uid}.musicianProfile.phone`, or `setlists/{id}.name` changes. `unassign/route.ts:56-65` has a partial fix — it re-reads displayName before emailing — but the stored value on the doc is not updated, and every other reader (respond notification body, remind emails, cron/scheduling-reminder, calendar feed, history analytics at history/route.ts:38-48) reads the stale denormalized copy.
**Risk:** A musician who renames themselves will see their old name in reminder emails, SMS, in-app notifications, and calendar feed summaries. A band leader who renames a setlist will see the old name in all existing pending-assignment reminders. `/api/scheduling/history` analytics groups by `musicianName` and will display wrong name for renamed users. Calendar feed's `SUMMARY:` line on existing events uses the stale `setlistName`.
**Fix shape:** Either (a) fan out renames via a server route/cron that updates all `scheduling_assignments` with matching `musicianUid` / `setlistId`, or (b) drop `musicianName`/`setlistName` from the denormalized copy and always resolve via a joined read. (a) is cheaper at read time; (b) is correct-by-construction but costs more per read. Given weekly cadence, (a) fired from the user/setlist update path is probably right.
**Blocks Phase 1?:** no

### DL-011: setlist.musicians array has no unique key for arrayUnion/arrayRemove — forces read-modify-write
**Severity:** P1
**Category:** array-hazard
**File(s):** `src/lib/scheduling-merge.ts:9-47`; `src/app/api/scheduling/unassign/route.ts:139`; `src/app/api/scheduling/respond/route.ts:105`
**Observation:** `SetlistMusician` is `{uid?, name, email, instrument?}`. Dedup by `uid` happens in JS via `mergeNewMusicians`. Removal happens via `filter(m => m.uid !== X)` then full-array overwrite. `FieldValue.arrayUnion/arrayRemove` cannot be used because elements are objects with mutable fields (name, instrument) — Firestore compares by deep-equality.
**Risk:** Every mutation is a read-modify-write, which is why DL-001/002/003 need transactions in the first place. Any write that forgets the transaction (respond/decline, unassign) races. Also: a guest musician with no `uid` (nullable in the schema) cannot be deduplicated — duplicates accumulate.
**Fix shape:** Either normalize to `assignedUids: string[]` only (which already exists) and resolve names at read time from the assignments collection, or change the array to a map keyed by uid. Guest entries (no uid) need a synthetic id.
**Blocks Phase 1?:** no (follow-on structural fix after DL-001/002/003)

### DL-012: concurrent assigns for same musician — transaction only guards scheduling_assignments, not setlist.musicians
**Severity:** P1
**Category:** race
**File(s):** `src/app/api/scheduling/assign/route.ts:73-106, 200-215`
**Observation:** The per-musician assignment tx (L73-106) correctly prevents duplicate assignments via `existing.empty` check. Two concurrent `/assign` calls for a band that overlaps (say, both include Alice) will correctly create one assignment. BUT the trailing setlist-musicians merge tx (L202-212) processes each request's full `musicians` payload. Both will attempt to add Alice to `setlist.musicians`. The merge is idempotent on uid, so Alice only appears once — good. However, if request A includes Alice with instrument "Guitar" and request B includes Alice with instrument "Vocals", the late-committing request's instrument sticks on the setlist doc, while the assignment doc (created by whichever request won L81 `existing.empty`) can have the other instrument. Denormalized instrument drifts.
**Risk:** Low-probability in the weekly-cadence workflow, but real. User sees "Alice — Vocals" on the setlist page and "Alice — Guitar" on the schedule page.
**Fix shape:** The merge tx should respect the authoritative `scheduling_assignments` snapshot, not the incoming `musicians[]` payload. Read assignments for this setlist inside the tx, reconstruct `musicians[]` from that.
**Blocks Phase 1?:** yes (fixing DL-001 correctly subsumes this)

### DL-013: respond/decline — no guard against re-assigning the already-declined musician later
**Severity:** P2
**Category:** state-machine
**File(s):** `src/app/api/scheduling/respond/route.ts:43-46`; `src/app/api/scheduling/assign/route.ts:73-83`
**Observation:** The status guard `data.status !== 'pending'` (L43) prevents double-respond. But the assign transaction's dedup check (L74-82) only looks for ANY existing assignment for (setlistId, musicianUid), regardless of status. That means: musician declines → assignment is `declined` → band leader re-assigns → `existing.empty === false` → new assignment is silently skipped (`return null`, `continue` at L108). The leader's intent to re-invite after a decline is dropped with no error surfaced.
**Risk:** Leaders assume a re-add works; it silently no-ops. The only recovery is to manually unassign (flip to cancelled) first, then reassign — but the UI doesn't expose that flow for already-declined assignments.
**Fix shape:** Either treat `declined`/`cancelled` as re-assignable in the existing-check (filter to active statuses), or surface a distinct response so the UI can prompt "Alice previously declined — re-invite?" explicitly. Add a test in `scheduling/__tests__/assign.test.ts`.
**Blocks Phase 1?:** no

### DL-014: unassign — no status guard; can "cancel" an already-declined or already-cancelled assignment
**Severity:** P2
**Category:** state-machine
**File(s):** `src/app/api/scheduling/unassign/route.ts:31-44`
**Observation:** The transaction unconditionally writes `status: 'cancelled'` regardless of current status (L39-42). No check for `data.status === 'pending' || 'confirmed'`.
**Risk:** A musician decline at T0 followed by a band leader's cancel click at T1 will overwrite `status: 'declined'` with `status: 'cancelled'`, losing the decline signal and any `declineReason`. Subsequent emails/SMS/push at L88-132 fire as if this were a pending-→-cancelled flip, re-spamming the musician about a cancellation of a service they already declined.
**Fix shape:** Add `if (data.status !== 'pending' && data.status !== 'confirmed') throw new Error('INVALID_TRANSITION')` inside the tx. Preserve `declineReason` / don't fire cancellation notifications if the previous state was `declined`.
**Blocks Phase 1?:** no

### DL-015: calendar-feed — status:in query with eventDate not indexed, will scale-fail
**Severity:** P2
**Category:** query
**File(s):** `src/app/api/scheduling/calendar-feed/[token]/route.ts:46-49`
**Observation:** Query is `where('musicianUid', '==', uid).where('status', 'in', ['confirmed', 'pending']).get()` — no orderBy, no limit. The existing composite index at firestore.indexes.json (L47-57) is `musicianUid ASC, status ASC`, which matches. No eventDate ordering means all historical assignments for this musician flow into the iCal. Similarly `scheduling-firebase.ts:21-42 subscribeToMyAssignments` adds `orderBy('assignedAt', 'desc')` which requires a 3-field composite index (musicianUid, status, assignedAt) — **that index is missing from firestore.indexes.json**.
**Risk:** Client-side `subscribeToMyAssignments` will log a PERMISSION_DENIED-like "index required" error the first time a musician has >0 pending/confirmed assignments and a status:in clause expands the query. Calendar feed grows unbounded over time (all-time history).
**Fix shape:** Add `(musicianUid, status, assignedAt DESC)` composite index. For calendar feed, add an `eventDate >=` filter (and corresponding index) to bound to upcoming + recent past only.
**Blocks Phase 1?:** no

### DL-016: suggest-band — status='confirmed' + orderBy(assignedAt) index missing
**Severity:** P2
**Category:** query
**File(s):** `src/app/api/scheduling/suggest-band/route.ts:40-44`
**Observation:** Query is `.where('status', '==', 'confirmed').orderBy('assignedAt', 'desc').limit(200)`. firestore.indexes.json has `(status ASC, eventDate ASC)` and `(musicianUid ASC, status ASC)` but no `(status ASC, assignedAt DESC)` composite.
**Risk:** Query fails on first production use with a Firestore "requires an index" error, 500s the route. Band-suggest feature is broken until the index is deployed.
**Fix shape:** Add the composite. Run `firebase deploy --only firestore:indexes` and verify with an admin SDK query.
**Blocks Phase 1?:** no

### DL-017: remind/cron-reminder — pending query without eventDate bound pulls all pending, client-filters by date
**Severity:** P2
**Category:** query
**File(s):** `src/app/api/scheduling/remind/route.ts:28-63`; `src/app/api/cron/scheduling-reminder/route.ts:38-92`
**Observation:** Both routes run `where('status','==','pending').get()` with no eventDate bound, then JS-filter to the 48-hour window. As the collection grows (52 weeks × ~12 musicians = 600+/year), every cron tick reads the full pending set.
**Risk:** Read-cost inflates linearly; at some point hit the 1MB response cap; lastRemindedAt throttling (L88-92 cron) works but depends on reading every pending assignment ever created.
**Fix shape:** Use the existing `(status, eventDate)` composite index: `where('status','==','pending').where('eventDate','>=', now).where('eventDate','<=', now+48h)`. Note `eventDate` is currently stored as a string in some paths and Timestamp in others (see DL-020) — fix that first.
**Blocks Phase 1?:** no

### DL-018: scheduling-firebase client — subscribeToUpcomingSetlists uses inequality without index
**Severity:** P2
**Category:** query
**File(s):** `src/lib/scheduling-firebase.ts:97-119`
**Observation:** `.where('eventDate','>=', Timestamp.fromDate(now)).orderBy('eventDate','asc')` on the setlists collection. No composite needed (single-field inequality), but eventDate is stored as a string in legacy paths (`setlist/flush/route.ts:98`, `use-setlist-logic.ts:34-41` stores ISO strings; scheduling-firebase queries with Timestamp). Strings and Timestamps don't compare.
**Risk:** Setlists whose `eventDate` was written as an ISO string (flush path, import path) don't match the `Timestamp.fromDate(now)` inequality — they are invisible to the schedule page's upcoming list.
**Fix shape:** Normalize `eventDate` storage to Timestamp (a one-shot migration via `api/admin/migrations`), and enforce the shape in flush-schema.ts / setlist-firebase.ts writes.
**Blocks Phase 1?:** no (but pairs with DL-020)

### DL-019: transfer-setlist — no transaction, no precondition, racing publishes/flushes lose the transfer
**Severity:** P2
**Category:** precondition
**File(s):** `src/app/api/setlist/transfer/route.ts:37-42`
**Observation:** `setlistRef.update({ ownerId, ownerName, transferredAt, previousOwnerId })` runs naked — no tx, no read-before-write except the exists check at L18. firestore.rules allow ownerId changes only by admin (L98-99 of rules), so the rule gate is fine, but there's no coordination with concurrent editor saves which may be rewriting other fields.
**Risk:** Transfer racing a flush write: flush's transaction reads pre-transfer data (ownerId check passes because the caller was the old owner), transfer commits, flush commits and blasts `updatedAt` forward. Low impact, but the editor's `isOwner` check in flush (L77-78) may now fail on their NEXT save while they're still typing — surprising UX.
**Fix shape:** Put the transfer inside a runTransaction; bump `updatedAt` so open editors see the stale-write banner and reload. Also update/denormalize `ownerName` on all outstanding `scheduling_assignments.assignedBy==oldUid` (or don't denormalize it in the first place — see DL-010).
**Blocks Phase 1?:** no

### DL-020: eventDate shape drift — string vs Timestamp vs {seconds} scattered across writers
**Severity:** P1
**Category:** drift
**File(s):** `src/hooks/use-setlist-logic.ts:34-41` (ISO string with Central Time offset); `src/app/api/setlist/flush/route.ts:98` (string pass-through); `src/lib/setlist-firebase.ts:237-238` (Timestamp.fromDate on clone); `src/app/api/setlists/import/execute/route.ts:136` (ISO string); `src/lib/scheduling-firebase.ts:105` (Timestamp.fromDate on read-query); consumers: `src/lib/firestore-helpers.ts:12-21 toDate` (handles 5 shapes)
**Observation:** Writers disagree. Clone uses Timestamp, flush/editor/import use ISO string. Readers use `toDate()` which is permissive. Queries like DL-018 and `cron/scheduling-reminder:74-79` attempt to branch on shape. There is no schema enforcement.
**Risk:** Range queries miss string-shaped docs (DL-018). Comparisons in cron (`a.eventDate?.seconds`) silently skip string-typed docs, meaning ISO-string setlists never get reminders triggered from cron. Consumers that trust `toDate()` work; queries that don't go through toDate() fail silently.
**Fix shape:** Pick one (Timestamp). Run a one-shot migration; enforce in flush-schema.ts. Update `setlistConverter` to coerce on read.
**Blocks Phase 1?:** no (but should pair with the Phase-1 atomicity work — eventDate feeds assignment denormalization)

### DL-021: publish — song-usage recording and history audit are fire-and-forget with no retry
**Severity:** P2
**Category:** fire-and-forget
**File(s):** `src/app/api/setlist/publish/route.ts:123-128, 278-290, 304-319`
**Observation:** `recordSongUsage` (L124), audit history write (L279-290), and per-message emailEvents batch (L306-319) are all `.catch(log)` fire-and-forget. If they fail, publish returns success 200 with misleading counts.
**Risk:** Song-usage analytics gaps; missing audit trail entries; untracked email deliveries (webhook updates can't find the emailEvents doc if the initial batch.commit failed).
**Fix shape:** Either `await` them and return partial-success to the client, or enqueue via Inngest with retries. For the emailEvents write specifically, it's the webhook's lookup key — losing it breaks delivery tracking.
**Blocks Phase 1?:** no

### DL-022: firestore.rules — notifications create allows any admin/band_leader to write to any user's notifications subcollection
**Severity:** P2
**Category:** rules-drift
**File(s):** `firestore.rules:71-77`
**Observation:** Rule is `allow create: if isSignedIn() && (isAdmin() || isBandLeader())` on `/users/{userId}/notifications/{notifId}`. No check that the created doc has any specific shape, no check that `type` is in an allowlist, no body-size cap.
**Risk:** A compromised band_leader can spam arbitrary notification docs to any user's inbox. The server routes are always the intended writer (they use Admin SDK which bypasses rules); client-side write access is only a safety net for `notification-store.ts` broadcasting. Given `notifySetlistUpdated` moved server-side (notify-updated/route.ts), the client-create permission is now unused-but-open.
**Fix shape:** Tighten to `allow create: if false` (server-only via Admin SDK). Verify `notification-store.ts` has no remaining client-create call sites.
**Blocks Phase 1?:** no

### DL-023: firestore.rules — setlist update rule allows band_leader to edit any setlist, bypassing owner intent
**Severity:** P2
**Category:** rules-drift
**File(s):** `firestore.rules:96-99`
**Observation:** `allow update: if (isOwner(resource) || isBandLeader() || isAdmin())`. Any band_leader can silently edit any setlist from the client. The server `setlist/flush` route (L77-80) enforces `isOwner || isBandLeader`, matching this. `setlist/delete` (L72-76) is stricter server-side (isOwner || isAdmin), but the rules allow band_leader delete.
**Risk:** Rules are more permissive than the server's own delete policy — a rogue band_leader can client-side delete any setlist if they bypass the API. Less a bug than a defense-in-depth gap, but explicit in user's requirements ("don't skip preexisting issues").
**Fix shape:** Align rules with server — `allow delete: if isOwner(resource) || isAdmin()`.
**Blocks Phase 1?:** no

### DL-024: generateCalendarFeedToken — client-side direct Firestore write with no validation
**Severity:** P2
**Category:** client-mutation
**File(s):** `src/lib/scheduling-firebase.ts:181-194`
**Observation:** Writes `musicianProfile.calendarFeedToken` directly from the browser via `updateDoc`. firestore.rules allow self-writes on `users/{uid}`, so it works, but there's no server validation: a user could write any value they want, including shadowing another user's feed token (predictable collision) or overwriting it to a zero-length string.
**Risk:** Self-DoS (user breaks their own iCal feed), or cross-user token collision if two users happen to write the same token (extremely unlikely with 24 random bytes, but structurally possible because nothing enforces uniqueness across the users collection). Bigger issue: there's no audit of when a feed token was regenerated — no `lastRotatedAt`.
**Fix shape:** Route this through an API endpoint that enforces 24-byte randomness server-side and records `calendarFeedTokenRotatedAt`. Consider hashing the stored token so a DB read doesn't expose the live credential.
**Blocks Phase 1?:** no

### DL-025: chat route — BUILD_TEMPLATE writes templates/{key} with no rate limit, no size cap, no schema check
**Severity:** P2
**Category:** client-mutation
**File(s):** `src/app/api/chat/route.ts:280-315`
**Observation:** The LLM-generated `BUILD_TEMPLATE` payload writes directly to `templates/{templateKey}` with whatever `slots: Record<string, unknown>[]` the model produced. Only `label`, `queries`, `type`, `fileId`, etc. are explicitly copied, but there's no Zod/max-length/max-count validation on any field and no cap on slots.length.
**Risk:** A prompt-injected LLM response could write a 10000-item template, or overwrite a canonical templateKey (e.g., `erev_shabbat`) with junk. firestore.rules `templates/{id}` allow `isBandLeader()` writes, so it permission-checks, but the route is running with the caller's auth and blindly trusts Gemini's output.
**Fix shape:** Add a Zod schema for `slots` with max 200 items, string length caps. Probably also reject overwrites of built-in template keys, require a user confirmation round-trip.
**Blocks Phase 1?:** no

### DL-026: nudge-admin — mutates users doc directly with no atomicity, re-writes unbounded
**Severity:** P2
**Category:** state-machine
**File(s):** `src/app/api/nudge-admin/route.ts:15-18`
**Observation:** Sets `lastNudgeAt: new Date().toISOString()` and `nudgedAdmin: true` on every call. No throttle (apart from generic rate limit), no lifecycle — once `nudgedAdmin` is true, it never resets.
**Risk:** Minor data hygiene — the flag becomes permanently "true" with no admin action to clear it. Not a correctness bug but hints at a missing state machine (pending → nudged → acknowledged).
**Fix shape:** Add a `nudgeCount` counter, `lastAcknowledgedAt`, and admin-side UI to clear the flag when they respond.
**Blocks Phase 1?:** no

### DL-027: library-index direct Admin writes with no `updatedAt` precondition race concurrent renames
**Severity:** P2
**Category:** precondition
**File(s):** `src/app/api/library/rename/route.ts:45-48`; `src/app/api/library/archive/route.ts:45-50`
**Observation:** Both routes do exists-check + unconditional `update()`. Concurrent rename + archive from two tabs can interleave — the later writer clobbers the earlier's field without seeing it.
**Risk:** Low-probability (library admin is a small surface). A concurrent archive+rename could produce `status: 'archived'` with the new displayName, or `status: 'active'` with the old name, depending on order.
**Fix shape:** Wrap in runTransaction with an `updatedAt` check, or switch to a `lastModifiedAt` sentinel. Not worth a dedicated phase but worth noting.
**Blocks Phase 1?:** no

### DL-028: push/send cleanup reads every target user's doc again for stale token filtering
**Severity:** P2
**Category:** scope
**File(s):** `src/app/api/push/send/route.ts:113-133`
**Observation:** After sendEachForMulticast, if any stale tokens are found, the route re-reads `users/{uid}` for EVERY target uid (even ones with no stale tokens) to filter and arrayRemove. This is N+1 after we already did a batched `db.getAll` at L50-52.
**Risk:** Bulk publish with 50 recipients and one stale token causes 50 sequential user-doc reads + up to 50 arrayRemove writes. The arrayRemove per-user also isn't concurrency-safe — if a user adds a new token concurrently, the arrayRemove is safe (only removes matching entries), but the extra read is wasted.
**Fix shape:** Skip the read loop; do a single batched `db.getAll` for only the uids whose tokens appear in `staleTokens`, then `FieldValue.arrayRemove(...)` in one batch commit.
**Blocks Phase 1?:** no

## Summary by severity

- **P0:** 3 findings (IDs: DL-001, DL-002, DL-003)
- **P1:** 7 findings (IDs: DL-004, DL-006, DL-007, DL-008, DL-010, DL-011, DL-012, DL-020) — (8 listed; DL-012 & DL-020 P1)
- **P2:** 18 findings (IDs: DL-005, DL-013, DL-014, DL-015, DL-016, DL-017, DL-018, DL-019, DL-021, DL-022, DL-023, DL-024, DL-025, DL-026, DL-027, DL-028, DL-009)

(Total: 28 findings.)

## Phase 1 scope (atomicity) — findings that must be fixed

- **DL-001:** Fold setlist.musicians merge into assign transaction
- **DL-002:** Fold setlist.musicians removal into respond/decline transaction
- **DL-003:** Fold setlist.musicians removal into unassign transaction
- **DL-012:** Subsumed by DL-001 fix if merge is reconstructed from scheduling_assignments snapshot

## Out-of-phase-1 (informational, for later phases)

- **DL-004:** notifiedVia durability — Phase 3 (notification reliability)
- **DL-005:** N+1 user-doc reads in assign loop — Phase 2 (performance)
- **DL-006:** publish precondition — Phase 2 (concurrency hardening)
- **DL-007 / DL-008:** claims/Firestore transactionality — Phase 3 (auth hardening)
- **DL-009:** delete-user cascade — Phase 3 (data lifecycle)
- **DL-010:** musicianName/setlistName fan-out on rename — Phase 2 (denormalization reconciliation)
- **DL-011:** setlist.musicians array shape — Phase 2 (schema normalization)
- **DL-013 / DL-014:** assignment state-machine guards — Phase 2 (state machine)
- **DL-015 / DL-016:** missing composite indexes — Phase 2 (query hardening)
- **DL-017:** reminder queries unbounded — Phase 2
- **DL-018 / DL-020:** eventDate shape normalization + migration — Phase 2
- **DL-019:** transfer atomicity — Phase 2
- **DL-021:** publish fire-and-forget durability — Phase 3
- **DL-022 / DL-023:** firestore.rules tightening — Phase 3 (security polish)
- **DL-024:** calendar feed token via API — Phase 3
- **DL-025:** BUILD_TEMPLATE validation — Phase 3 (AI safety)
- **DL-026:** nudge-admin state machine — later
- **DL-027:** library-index preconditions — later
- **DL-028:** push/send cleanup N+1 — Phase 2 (performance)
