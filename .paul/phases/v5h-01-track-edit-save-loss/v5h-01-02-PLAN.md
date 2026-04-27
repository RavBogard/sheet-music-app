---
phase: v5h-01-track-edit-save-loss
plan: 02
type: execute
wave: 1
depends_on: ["01"]
files_modified:
  - firestore.rules
  - src/components/setlist/grid/SetlistGridHydrator.tsx
  - src/components/setlist/grid/__tests__/SetlistGridHydrator.test.tsx
  - src/lib/sync/snapshot-listener.ts
  - src/lib/sync/__tests__/property-failures.test.ts
  - src/lib/sync/__tests__/snapshot-listener.test.ts
autonomous: false
---

<objective>
## Goal

Ship the actual fix for the v5.0 track-edit save-loss surfaced by Daniel's UAT. Three coupled fixes shipped as a single hotfix per the v5h-01-01 SUMMARY decision (E + F + B):

- **E (PRIMARY):** Add `match /tracks/{trackId}` and `match /songs/{songId}` rules to `firestore.rules`, deploy via Firebase CLI, ship a recovery snippet for Daniel to clear his stuck outbox.
- **F (SECONDARY silent-loss closure):** Add an outbox-pending guard around `SetlistGridHydrator`'s `db.tracks.put` priming, mirroring the listener's outbox-pending guard at `snapshot-listener.ts:197`. Stops the silent re-priming clobber that was overwriting Daniel's stuck-pending edits on every re-mount.
- **B (TERTIARY defense):** 2-line LWW guard fix at `snapshot-listener.ts:174` + `:215` against undefined `local.updatedAt`. Flip the AC-1 reproduction test from `it.fails` → `it` as a regression lock.

After this plan ships and is deployed, Daniel re-runs UAT scenario 1 against prod; key edits should drain to Firestore + persist across navigation.

## Purpose

v5.0 milestone close is BLOCKED on this fix. The v5.0 "bulletproof" claim is hollow until cell edits land at the server reliably. Without E, every track save in production silently fails (writes to the new `tracks/{id}` collection are denied by Firestore default-deny). Without F, future stuck-pending outbox rows (from any cause — network failure, conflict, etc.) are silently overwritten by the Hydrator's re-priming on re-mount. Without B, an independent race that leaves local rows with undefined `updatedAt` would still trip the listener clobber path the v5h-01-01 harness reproduces.

## Output

- Updated `firestore.rules` with two new match blocks (tracks + songs) deployed to Firebase production.
- Updated `SetlistGridHydrator.tsx` with outbox-pending guard around `db.tracks.put` priming + matching tests.
- Updated `snapshot-listener.ts` with strict-equality LWW guard + matching test changes (flip AC-1 marker; update v5h-01-01 describe-block comment).
- Recovery instructions for Daniel (one-shot DevTools console snippet) inline in this plan's HUMAN-VERIFY checkpoint and in the SUMMARY.
- v5h-01-02-SUMMARY.md documenting what shipped + commits + verification results + readiness for v5h-01-03 postmortem.

</objective>

<context>
## Project Context
@.paul/PROJECT.md
@.paul/ROADMAP.md
@.paul/STATE.md

## Prior Work (depends on v5h-01-01 outputs)
@.paul/phases/v5h-01-track-edit-save-loss/v5h-01-01-SUMMARY.md
@.paul/postmortems/v50-07-save-loss-investigation.md

## Source files in scope
@firestore.rules
@src/components/setlist/grid/SetlistGridHydrator.tsx
@src/components/setlist/grid/__tests__/SetlistGridHydrator.test.tsx
@src/lib/sync/snapshot-listener.ts
@src/lib/sync/__tests__/snapshot-listener.test.ts
@src/lib/sync/__tests__/property-failures.test.ts

## Reference: existing setlists rules (firestore.rules:80-104)

```
match /setlists/{setlistId} {
  allow read: if isMember() || isOwner(resource);
  allow create: if isSignedIn() && request.resource.data.ownerId == request.auth.uid;
  allow update: if (isOwner(resource) || isBandLeader() || isAdmin())
                && (isAdmin() || request.resource.data.ownerId == resource.data.ownerId);
  allow delete: if isOwner(resource) || isBandLeader() || isAdmin();
}
```

The new `tracks/{trackId}` and `songs/{songId}` rules mirror this pattern but **drop the ownerId check** since neither collection carries ownerId — they are band-leader/admin-managed catalog data, not user-authored content. Authenticated members get read; band-leader/admin get write.

## Reference: outbox-pending guard pattern (snapshot-listener.ts:139-152, 197-204)

```ts
async function hasPendingOutboxRow(
    db: LocalDb,
    collection: LocalCollection,
    docId: string,
): Promise<boolean> {
    const found = await db.outbox
        .filter((r) => r.collection === collection && r.docId === docId)
        .first()
    return found !== undefined
}
```

The listener uses this guard before each `db.tracks.put` to skip live deliveries for docIds with in-flight local edits. F replicates the same pattern in SetlistGridHydrator's hydrate() priming loop.

## Reference: AC-1 regression-lock target (property-failures.test.ts)

```ts
it.fails(
    'AC-1: cached snapshot delivery clobbers local edit when engine writeback skipped (EXPECTED FAILURE on master pre-fix)',
    ...
)
```

After the listener guard ships in B, this flips to `it(...)` and the same body passes — locking the bug closed.

## Smoking-gun observations carried from v5h-01-01

- `snapshot-listener.ts:174` (setlists branch) and `:215` (tracks branch) — `(local.updatedAt ?? 0) >= change.updatedAt` underflows to `0 >= ts` when local has no updatedAt → falls open → put → clobber.
- `SetlistGridHydrator.tsx:62-93` (hydrate function) — primes `db.tracks.put(initialServerData)` on mount with the same LWW underflow shape; ALSO has no outbox-pending guard at all, so any pending edit is overwritten unconditionally if `(local.updatedAt ?? 0) < (initial.updatedAt ?? 0)`.
- Production root cause: `firestore.rules` has no match block for `tracks/{trackId}` or `songs/{songId}` → default-deny → every track save returns `permission-denied` → engine surfaces as AuthError → outbox row marked `failed` → per-doc drain ordering blocks all subsequent edits to that docId. Daniel's `crc-local`/`outbox` has 50+ stuck rows for setlist `kQNvssixRlHQRB6gtWqt`.

## Recovery for Daniel (used in HUMAN-VERIFY)

DevTools console snippet (paste into the Sources / Console panel on `centralreform.live` after rules deploy):

```js
(async () => {
  const Dexie = (await import('https://cdn.skypack.dev/dexie@4')).Dexie
  const db = new Dexie('crc-local')
  // Open the DB without specifying schema — read-only access
  // We don't need to know the version since we're just deleting from outbox.
  await db.open()
  const failed = await db.table('outbox').where('status').equals('failed').toArray()
  console.log(`Found ${failed.length} failed outbox rows. Deleting...`)
  for (const r of failed) await db.table('outbox').delete(r.localId)
  console.log('Done. Refresh the page.')
})()
```

Alternative (simpler, in case the import fails): manual DevTools → Application → IndexedDB → `crc-local` → `outbox` → right-click each `failed` row → Delete. Tedious for 50+ rows but reliable.

</context>

<skills>
## Required Skills (from SPECIAL-FLOWS.md)

| Skill | Priority | When to Invoke | Loaded? |
|-------|----------|----------------|---------|
| (none) | — | This plan touches firestore.rules + Hydrator data-layer + snapshot-listener guard. No UI surface modified. Same precedent as v50-06-01 + v50-07-04 + v5h-01-01. | N/A |

`/ui-ux-pro-max` is NOT required for this plan.

</skills>

<acceptance_criteria>

## AC-1: Firestore rules permit band-leader/admin writes to tracks + songs

```gherkin
Given a band_leader or admin user signed in to production
And `firestore.rules` updated with `match /tracks/{trackId}` and `match /songs/{songId}` blocks deployed via Firebase CLI
When the user issues `setDoc(doc(db, 'tracks', '<uuid>'), {id, setlistId, title, ...})` from the app
Then the write succeeds (no `permission-denied` error)
And subsequent `getDoc` returns the written payload
And read of `tracks/{trackId}` is permitted for any signed-in member (mirrors setlists read scope)
```

## AC-2: SetlistGridHydrator skips priming for docIds with pending outbox rows

```gherkin
Given a setlist with one track t1 has been opened locally
And the user has applyEdit'd a key change on t1 (outbox row in 'pending' or 'failed' status)
And SetlistGridHydrator re-mounts (page navigation back to the setlist)
And initialServerData carries a t1 row with the OLD payload (pre-edit, no key)
When the hydrate() effect runs
Then `db.tracks.put` is NOT called for t1 (the local row's user edit is preserved)
And `db.setlists.put` is NOT called for setlistId if any outbox row exists for that setlistId
And the priming for OTHER tracks (no outbox row) proceeds normally
```

## AC-3: Snapshot listener LWW guard skips delivery when local.updatedAt is undefined

```gherkin
Given a local Dexie row exists with `updatedAt: undefined` (e.g., engine writeback skipped because adapter returned undefined)
And no outbox row is pending for that docId
And the snapshot listener delivers a remote payload with a real `updatedAt: <ts>`
When the listener's tracks-branch guard runs
Then the put is SKIPPED (preserve local under uncertainty — symmetric for setlists branch)
And the AC-1 test in property-failures.test.ts (renamed from `it.fails(...)` to `it(...)`) passes — local key='E' is preserved across cached delivery
```

## AC-4: Daniel recovers his outbox + re-runs UAT scenario 1 successfully (HUMAN-VERIFY)

```gherkin
Given firestore.rules deployed to production
And Daniel cleared his `crc-local`/outbox failed rows via the DevTools snippet (or manual delete)
When Daniel performs UAT scenario 1: open or create a setlist + edit "Modeh Ani" key to E
Then the sync indicator transitions to "Saved" (NOT failed-retry)
And ReconciliationProvider does NOT auto-open
And Daniel navigates to any other view + back
And the row for Modeh Ani still has key='E' visible in the editor
And `db.tracks.get(<modeh-ani-id>).key === 'E'` (verified via DevTools)
And `tracks/{modeh-ani-id}` exists in production Firestore with `key === 'E'`
```

## AC-5: Suite green + tsc + build clean

```gherkin
Given all three fixes (E + F + B) are landed
When `npx vitest run` and `npx tsc --noEmit` and `npm run build` are run
Then vitest suite is fully green (1476 → ~1480 with new Hydrator outbox-pending tests; AC-1 from v5h-01-01 flipped from `it.fails` to `it` and passing)
And tsc --noEmit reports no errors
And `npm run build` completes successfully
```

</acceptance_criteria>

<tasks>

<task type="checkpoint:decision" gate="blocking">
  <decision>Are we shipping all three (E + F + B) in one plan, or should B be split out as a follow-up?</decision>
  <context>
v5h-01-01 SUMMARY recorded the decision as E + F + B defense-in-depth. But this plan now has 3 production-touching tasks + a deploy + a HUMAN-VERIFY. If scope feels heavy, splitting B (the 2-line listener fix + AC-1 flip) into a follow-up plan keeps the hotfix tight to E + F (the actual blocking concerns for Daniel's UAT). B is LOAD-BEARING for closing the regression we modeled in v5h-01-01, but it's NOT blocking on Daniel's UAT pass — it's defense for a related bug class that may not be firing in production right now (the listener's outbox-pending guard at line 197 already short-circuits Daniel's failed-row scenario; the LWW underflow only fires when there's no pending outbox row AND local has undefined updatedAt).
  </context>
  <options>
    <option id="all-three">
      <name>Ship E + F + B in this plan</name>
      <pros>
- One commit to track; one deploy to coordinate.
- Closes the regression we wrote a test for (AC-1 flips to passing).
- Matches v5h-01-01 SUMMARY decision.
      </pros>
      <cons>
- 3 distinct subsystems touched (rules + Hydrator + listener); slight increase in change surface for a hotfix.
- If B's flip causes any unexpected regression in the listener test suite, it rolls back the whole hotfix.
      </cons>
    </option>
    <option id="ef-only">
      <name>Ship E + F only; B as follow-up plan v5h-01-03b (or in v5h-01-03 alongside the postmortem)</name>
      <pros>
- Tightest possible hotfix — only the changes Daniel's UAT directly needs.
- B's listener fix can ship after Daniel's UAT validates the rules + Hydrator deploys.
- Slightly lower regression risk on the v5.0-hotfix milestone close.
      </pros>
      <cons>
- AC-1 in property-failures.test.ts stays as `it.fails` longer — the regression test isn't locked yet.
- Adds a third plan to v5.0-hotfix milestone (v5h-01-03 was supposed to be only postmortem).
      </cons>
    </option>
  </options>
  <resume-signal>Select: option-all-three or option-ef-only. If option-ef-only: I'll skip Task 4 + Task 5 (B + AC-1 flip) below and defer them to a new v5h-01-03 plan, with v5h-01-04 becoming the postmortem.</resume-signal>
</task>

<task type="auto">
  <name>Task 1: Add tracks + songs match blocks to firestore.rules and deploy</name>
  <files>firestore.rules</files>
  <action>
Add two new match blocks immediately after the existing `match /setlists/{setlistId}` block ends at line 104. Mirror the setlists rules pattern but drop the ownerId check (tracks + songs don't carry ownerId — band-leader/admin manage catalog).

```
// TRACKS Collection (v5.0 top-level normalized track docs)
// v50-05-02 cutover writes here from SetlistGrid edits + lazy-hydration cascade.
// Tracks belong logically to a setlist (setlistId field); permissions are
// band-leader/admin-managed catalog rather than per-track ownership.
match /tracks/{trackId} {
  // 1. READ: any band member can read; mirrors setlists read scope.
  allow read: if isMember();

  // 2. CREATE: band leader or admin (cascade hydration + new-row inserts).
  allow create: if isSignedIn() && (isBandLeader() || isAdmin());

  // 3. UPDATE: band leader or admin (cell-commit edits land here).
  allow update: if isSignedIn() && (isBandLeader() || isAdmin());

  // 4. DELETE: band leader or admin (delete-row + bulk-delete).
  allow delete: if isSignedIn() && (isBandLeader() || isAdmin());
}

// SONGS Collection (v5.0 first-class song catalog with sticky memory)
// v50-04 promoted songs/{id} to first-class with defaults: { key, lead, bpm }
// + recent[] history (cap 5). v50-05 propagates track edits back via
// propagateTrackEditToSong → applyEdit('update', 'songs', ...).
match /songs/{songId} {
  // 1. READ: any band member can read; library + sticky-memory readback.
  allow read: if isMember();

  // 2. CREATE: band leader or admin (new song catalog entries).
  allow create: if isSignedIn() && (isBandLeader() || isAdmin());

  // 3. UPDATE: band leader or admin (sticky-memory propagation, library edits).
  allow update: if isSignedIn() && (isBandLeader() || isAdmin());

  // 4. DELETE: band leader or admin (library archive operations).
  allow delete: if isSignedIn() && (isBandLeader() || isAdmin());
}
```

After editing the file, deploy via:
```bash
firebase deploy --only firestore:rules
```

Confirm deployment output shows `✔ cloud.firestore: rules file ... compiled successfully` + `✔ Deploy complete`.

Avoid:
- Adding ownerId checks (tracks + songs don't carry ownerId — copying setlists' ownerId pattern would break every write).
- Loosening to `if isSignedIn()` for writes — must require band-leader/admin to match the setlists permission model.
- Touching any other rule block (boundaries protect setlists/tasks/templates/etc.).
  </action>
  <verify>
1. `grep -n "match /tracks\|match /songs" firestore.rules` returns 2 matches (one each).
2. `firebase deploy --only firestore:rules` exits 0 with success message.
3. From the app (or via a quick `firebase firestore:get` smoke check if practical) confirm a write to `tracks/test-id-{timestamp}` succeeds for a band-leader user.
  </verify>
  <done>AC-1 satisfied: production tracks + songs writes no longer hit permission-denied.</done>
</task>

<task type="auto">
  <name>Task 2: Add outbox-pending guard to SetlistGridHydrator hydrate() priming</name>
  <files>src/components/setlist/grid/SetlistGridHydrator.tsx</files>
  <action>
Modify the `hydrate()` function (lines 57-96 in the current file) to skip `db.setlists.put` and `db.tracks.put` for any docId that has a pending outbox row. This mirrors the snapshot-listener.ts:197 outbox-pending guard.

Specifically:

1. Inside the existing `db.transaction('rw', db.setlists, db.tracks, ...)` block, ALSO open `db.outbox` for read access. Change the transaction to: `db.transaction('rw', db.setlists, db.tracks, db.outbox, async () => { ... })`.

2. Before the `db.setlists.put(initialSetlist)` call (around line 69), check the outbox. Use the same shape as snapshot-listener.ts's `hasPendingOutboxRow`:

```ts
const setlistOutboxRow = await db.outbox
    .filter((r) => r.collection === 'setlists' && r.docId === setlistId)
    .first()
if (setlistOutboxRow !== undefined) {
    // Local has a pending edit for this setlist; preserve user intent.
    // Server data will replay via the snapshot listener once the engine
    // resolves (drain success → writeback OR drain failure → user surfaces
    // via ReconciliationProvider).
} else if (
    !localSetlist ||
    (localSetlist.updatedAt ?? 0) < (initialSetlist.updatedAt ?? 0)
) {
    await db.setlists.put(initialSetlist)
}
```

3. Before the `db.tracks.bulkPut(toPut)` call (around line 92), filter `toPut` to exclude any track id with a pending outbox row. Pre-fetch all relevant outbox rows in one scan to avoid N round-trips:

```ts
const trackOutboxIds = new Set<string>()
const trackOutboxRows = await db.outbox
    .filter((r) => r.collection === 'tracks')
    .toArray()
for (const r of trackOutboxRows) trackOutboxIds.add(r.docId)

const toPut: LocalTrack[] = []
for (const t of initialTracks) {
    if (trackOutboxIds.has(t.id)) continue // pending edit; preserve local
    const local = localById.get(t.id)
    if (
        !local ||
        ((local.updatedAt as number | undefined) ?? 0) <
            ((t.updatedAt as number | undefined) ?? 0)
    ) {
        toPut.push(t)
    }
}
if (toPut.length > 0) await db.tracks.bulkPut(toPut)
```

4. Add an inline comment block at the top of `hydrate()` documenting WHY: server data is authoritative ONLY when local has no in-flight edit. Pending outbox rows mean the engine has yet to resolve a local edit — server delivery would clobber user intent. Pattern mirrors snapshot-listener.ts:197.

Avoid:
- Touching the lazy-hydration cascade effect (lines 134-191) — that's a separate concern (out of scope per boundaries; if v5h-01-03 postmortem surfaces a need, route to a follow-up plan).
- Adding dependencies to the hydrate() useEffect's dep array — the existing `[setlistId, initialSetlist, initialTracks]` is correct.
- Changing the LWW underflow at lines 64-68 + 84-88 in the existing code — keep the symbol-for-symbol shape; the outbox-pending guard is a DIFFERENT condition (orthogonal to LWW). The listener's LWW underflow fix (Task 4) is the parallel concern; if option-ef-only was selected, leave the Hydrator's LWW underflow as-is and route to v5h-01-03 fix follow-up.
  </action>
  <verify>
1. `grep -n "trackOutboxIds\|setlistOutboxRow" src/components/setlist/grid/SetlistGridHydrator.tsx` returns the new guard sites.
2. `npx tsc --noEmit` clean.
3. (Test added in Task 3.)
  </verify>
  <done>AC-2 satisfied: priming skips for docIds with pending outbox rows.</done>
</task>

<task type="auto">
  <name>Task 3: Test the SetlistGridHydrator outbox-pending guard</name>
  <files>src/components/setlist/grid/__tests__/SetlistGridHydrator.test.tsx</files>
  <action>
Add 2-3 new test cases to the existing SetlistGridHydrator describe block:

1. **Skip setlist priming when outbox has pending row for the same setlistId.** Setup: pre-seed db.outbox with a `pending` row for `setlists/{setlistId}`. Pre-seed db.setlists with a local row at `updatedAt: 100`. Mount the Hydrator with `initialSetlist.updatedAt: 200`. Assert: after hydration, `db.setlists.get(setlistId).updatedAt === 100` (NOT 200 — local preserved).

2. **Skip track priming for tracks with pending outbox rows.** Setup: 3 initialTracks (t1, t2, t3); pre-seed db.outbox with a `pending` row for `tracks/t2`. Mount the Hydrator. Assert: after hydration, `db.tracks.get('t1')` and `db.tracks.get('t3')` reflect server data; `db.tracks.get('t2')` still has the original local payload (or is missing if local was missing — gate on whether t2 was pre-seeded).

3. **Mixed: track with pending outbox, track without — only the latter is primed.** Setup: t1 pre-seeded locally with stale data + pending outbox row; t2 pre-seeded locally with stale data, no outbox row. Mount Hydrator. Assert: t1 unchanged, t2 updated to server payload.

Reuse the existing test scaffolding (Dexie + fake-indexeddb, the test-seam props for applyEdit / startSnapshotListener already wired). The existing tests in this file establish the pattern; mirror it.

Avoid:
- Booting Firestore in tests; everything stays in Dexie + in-memory.
- Adding new dependencies; vitest + fake-indexeddb already cover this.
  </action>
  <verify>
`npx vitest run src/components/setlist/grid/__tests__/SetlistGridHydrator.test.tsx` shows the new 3 cases passing; suite count for this file increases by 3; tsc clean.
  </verify>
  <done>AC-2 satisfied: outbox-pending guard verified by deterministic tests.</done>
</task>

<task type="auto" depends_on_decision="all-three">
  <name>Task 4: Listener LWW underflow fix at snapshot-listener.ts:174 + :215</name>
  <files>src/lib/sync/snapshot-listener.ts</files>
  <action>
Two-line surgical change protecting against `local.updatedAt === undefined` underflowing the LWW comparison:

**Line 174 (setlists branch, inside `handleSetlist`):**

```ts
// Before:
if ((local?.updatedAt ?? 0) >= delivery.updatedAt) return
// After:
if (local?.updatedAt !== undefined && local.updatedAt >= delivery.updatedAt) return
```

**Line 215-219 (tracks branch, inside `handleTracks` for-loop):**

```ts
// Before:
if (
    local &&
    (local.updatedAt ?? 0) >= change.updatedAt
) {
    continue // LWW skip
}
// After:
if (
    local &&
    local.updatedAt !== undefined &&
    local.updatedAt >= change.updatedAt
) {
    continue // LWW skip
}
```

Update the inline comment at line 11-13 to document the new semantic:

```ts
//   2. LWW guard — only put if remote.updatedAt > local.updatedAt. Stale
//      deliveries (queued before a more recent local commit's writeback)
//      are dropped silently. NOTE: when local.updatedAt is undefined (e.g.,
//      engine writeback skipped because adapter returned `{}`), we PREFER
//      the local row — the alternative ((undefined ?? 0) >= remote) → false
//      → put would silently overwrite a user edit that the engine has yet
//      to resolve. v5h-01-02 fix (B): the guard skips delivery under
//      uncertainty rather than clobbering. (See v5h-01-01 postmortem.)
```

Avoid:
- Touching `hasPendingOutboxRow` or the outbox-pending guard logic — that's a separate concern.
- Reordering the guard relative to the outbox-pending check — keep outbox-pending first (lines 196-204), then LWW guard.
- Changing the setlist branch's missing-doc semantics (lines 169-180) — `if (cancelled || !delivery) return` stays unchanged.
  </action>
  <verify>
1. `grep -n "local?.updatedAt !== undefined\|local.updatedAt !== undefined" src/lib/sync/snapshot-listener.ts` returns 2 matches.
2. `npx tsc --noEmit` clean.
3. `npx vitest run src/lib/sync/__tests__/snapshot-listener.test.ts` — existing snapshot-listener tests still pass (no regression).
  </verify>
  <done>AC-3 partial: listener guards against undefined local.updatedAt; locked by Task 5's regression-test flip.</done>
</task>

<task type="auto" depends_on_decision="all-three">
  <name>Task 5: Flip AC-1 reproduction test from it.fails → it (regression lock)</name>
  <files>src/lib/sync/__tests__/property-failures.test.ts</files>
  <action>
In the `v5h-01-01: track-edit save-loss reproduction` describe block, change the AC-1 test marker from `it.fails(...)` to `it(...)` (the body stays identical). After the listener guard fix in Task 4, the inner assertion `expect((await getDb().tracks.get('t1'))?.key).toBe('E')` should now PASS — local edit preserved across the cached delivery because the guard skips when local.updatedAt is undefined.

Update the test name to drop the `(EXPECTED FAILURE on master pre-fix)` suffix and reflect the regression-lock semantic. Suggested:

```ts
it(
    'AC-1: cached snapshot delivery preserves local edit when engine writeback skipped (regression lock for v5h-01-02 listener fix)',
    async () => { /* ... existing body unchanged ... */ },
    30_000,
)
```

Update the inline comment block above the AC-1 test to remove the "POST-FIX" instruction (since this IS post-fix now) and add a note pointing back to v5h-01-02:

```ts
// AC-1 (regression lock): models Daniel's exact flow (v5h-01-01
// reproduction) against UndefinedWritebackAdapter. Was an expected-
// failure on master pre-fix; now passes after v5h-01-02 listener LWW
// underflow guard at snapshot-listener.ts:174 + :215. Locks the bug:
// any future regression that re-introduces the underflow surfaces as
// a test failure.
```

Avoid:
- Modifying the AC-2 counter-test — it stays as a passing scoping test.
- Modifying the helpers (CachedThenFreshSubscriber, UndefinedWritebackAdapter, TimestampedWritebackAdapter, bootEngine) — they're correct and needed by AC-2 (and any future regression tests).
- Flipping any other `.fails` markers — only the AC-1 in this describe block.
  </action>
  <verify>
1. `grep -n "it.fails" src/lib/sync/__tests__/property-failures.test.ts` returns no matches inside the v5h-01-01 describe block.
2. `npx vitest run src/lib/sync/__tests__/property-failures.test.ts -t "v5h-01-01"` shows AC-1 passing as a regular `it` test (green checkmark, not yellow `it.fails` pass).
3. Full suite delta: tests still 1476 + 3 (from Task 3) = 1479; suite green.
  </verify>
  <done>AC-3 satisfied: regression test locked; v5h-01-01 harness flips to passing post-fix.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
- Firestore rules updated + deployed (Task 1).
- SetlistGridHydrator outbox-pending guard (Tasks 2 + 3).
- Snapshot listener LWW underflow fix + AC-1 regression-lock flip (Tasks 4 + 5; depends on decision option-all-three).

Now Daniel runs UAT scenario 1 against production to confirm the fix lands end-to-end. The recovery snippet for clearing his stuck outbox is documented below.
  </what-built>
  <how-to-verify>
**STEP 0 — Confirm rules deploy succeeded.** Look at the output of `firebase deploy --only firestore:rules` from Task 1. If it shows "Deploy complete" you're good.

**STEP 1 — Clear Daniel's stuck outbox.** Daniel opens centralreform.live in Chrome, opens DevTools → Console, pastes:

```js
(async () => {
  const Dexie = (await import('https://cdn.skypack.dev/dexie@4')).Dexie
  const db = new Dexie('crc-local')
  await db.open()
  const failed = await db.table('outbox').where('status').equals('failed').toArray()
  console.log(`Found ${failed.length} failed outbox rows. Deleting...`)
  for (const r of failed) await db.table('outbox').delete(r.localId)
  console.log('Done. Refresh the page.')
})()
```

If the dynamic import fails: manually delete the failed rows via DevTools → Application → IndexedDB → `crc-local` → `outbox` → right-click each `failed` row → Delete (tedious for 50+ rows but reliable).

After clearing, refresh the page (Cmd-R or F5).

**STEP 2 — Run UAT scenario 1.**
1. Either reuse setlist `kQNvssixRlHQRB6gtWqt` OR create a fresh setlist.
2. Add "Modeh Ani" to it (if not already there).
3. Click the Key cell on Modeh Ani's row → set to E.
4. WAIT for sync indicator to transition. Expected: spinner → "Saved" (green/idle). NOT red `failed-retry`.
5. Verify in DevTools → IndexedDB → `crc-local`:
   - `tracks/{modeh-ani-id}` row has `key: 'E'` AND `updatedAt: <some-number>` (not undefined).
   - `outbox` is empty (or only has rows for OTHER edits, not this one).
6. Navigate to /setlists (or any other view).
7. Navigate back to the setlist.
8. Confirm the Modeh Ani row STILL shows key='E' in the UI.
9. Re-check `crc-local` → `tracks/{modeh-ani-id}` → `key: 'E'` still present.

**STEP 3 — Spot-check Firestore.** From the Firebase console (or via `firebase firestore:get` if you prefer CLI), confirm `tracks/{modeh-ani-id}` exists in production Firestore with `key: 'E'`. (This is the "did the write actually land at the server" check.)

**Pass criteria:** STEPs 1-3 all succeed; sync indicator goes Saved (real this time); key persists across navigation; outbox stays empty post-edit; Firestore `tracks/{id}` row reflects the edit.

**If STEP 2.4 indicator goes to failed-retry instead of Saved:** the rules deploy didn't fully take effect, OR there's a different rule rejecting the write. Check Firestore Console → Rules → confirm the deployed version matches our code. Also check the Sentry dashboard for `feature:dead-letter` events tagged with `permission-denied` — those would indicate continued rule denial.

**If STEP 2.8 shows key gone:** the Hydrator outbox-pending guard isn't engaging. Recheck Task 2 + 3 implementation; AC-2 test should have caught this — re-run `npx vitest run -t "outbox-pending"`.
  </how-to-verify>
  <resume-signal>Type "verified" once UAT scenario 1 passes against production, or describe what failed (which step, what indicator state, what's in tracks store, any Sentry events).</resume-signal>
</task>

</tasks>

<boundaries>

## DO NOT CHANGE

- `src/lib/sync/engine.ts` — engine FSM + drain ordering + writeback contract is stable from v50-06-01. Any changes (e.g., engine writeback unconditional, option A from v5h-01-01) are routed forward to a follow-up plan if real-world patterns demand it.
- `src/lib/sync/firestore-adapter.ts` — adapter interface contract (CommitResult, FirestoreAdapter, RemoteDocSnapshot) stable from v50-06.
- `src/lib/sync/init.ts` — ProductionFirestoreAdapter implementation. The serverTimestamp + getDoc readback race that returns undefined updatedAt under cache-first delivery (option C from v5h-01-01) is NOT addressed in this plan; defense is in place at the listener + Hydrator layer instead. Route to follow-up plan if Sentry surfaces continued undefined-updatedAt writes after this plan ships.
- `src/lib/sync/sentry-capture.ts` — observability is stable; no changes.
- `src/lib/sync/state-machine.ts` — FSM transitions stable.
- `src/lib/sync/cross-tab-lock.ts` — lock primitive stable.
- `src/lib/local/schema.ts` — Dexie schema stable; no version bump needed.
- `src/lib/local/write.ts` — applyEdit contract stable.
- `src/components/setlist/grid/SetlistGridHydrator.tsx` lazy-hydration cascade effect (lines 134-191) — out of scope. The deferred concern from v5h-01-01 (does setlists.hydrated:true land on failed cascade?) is acknowledged but routed to v5h-01-03 postmortem + potential v5h-01-04 follow-up if needed.
- `firestore.rules` rules outside the new tracks + songs blocks (setlists, tasks, templates, config, etc.).

## SCOPE LIMITS

- This plan ships the v5.0-hotfix UAT-blocker fix. It does NOT:
  - Re-architect the lazy-hydration retry semantics (deferred from v5h-01-01).
  - Address the engine writeback skip path (option A from v5h-01-01) — defense in place at listener + Hydrator instead.
  - Address the serverTimestamp resolution race (option C from v5h-01-01) — defense in place at listener + Hydrator instead.
  - Improve the reconciliation modal copy ("detected changes from somewhere else" → clearer copy) — routed to v5.1 UX overhaul per v5h-01-01 SUMMARY.
  - Add boot-time auto-clear of failed outbox rows — Daniel + 0 band members are the only affected users; manual recovery is sufficient.
  - Add Firebase emulator integration to the kitchen-sink harness — routed to v5h-01-03 postmortem lessons.
- Out-of-scope from milestone v5.0-hotfix entirely: v5.1 UX overhaul (separate milestone after v5.0-hotfix ships).

</boundaries>

<verification>

Before declaring this plan complete:

- [ ] `firestore.rules` updated with `match /tracks/{trackId}` + `match /songs/{songId}` blocks (verify via `grep -n "match /tracks\|match /songs" firestore.rules` returning 2 matches).
- [ ] `firebase deploy --only firestore:rules` exits 0 with success message.
- [ ] `SetlistGridHydrator.tsx` hydrate() function has outbox-pending guard for both `setlists` and `tracks` puts (verify via `grep -n "trackOutboxIds\|setlistOutboxRow" src/components/setlist/grid/SetlistGridHydrator.tsx`).
- [ ] (option-all-three only) `snapshot-listener.ts:174 + :215` have strict-equality LWW guard (verify via `grep -n "local?.updatedAt !== undefined\|local.updatedAt !== undefined" src/lib/sync/snapshot-listener.ts` returns 2 matches).
- [ ] (option-all-three only) AC-1 in property-failures.test.ts is `it(...)` not `it.fails(...)` and passes.
- [ ] `npx vitest run` clean (suite green; +3 from Hydrator outbox-pending tests; option-all-three: AC-1 flipped from yellow → green).
- [ ] `npx tsc --noEmit` clean.
- [ ] `npm run build` clean.
- [ ] HUMAN-VERIFY: Daniel's UAT scenario 1 passes against production (key edit lands + persists across navigation; sync indicator goes Saved; Firestore reflects the edit).
- [ ] All commits pushed to `origin master` per project convention (Vercel auto-deploys; rules already deployed via Firebase CLI in Task 1).
- [ ] v5h-01-02-SUMMARY.md created per `<output>` spec.

</verification>

<success_criteria>

- All 5 ACs satisfied.
- All verification checks pass.
- Daniel's UAT scenario 1 confirmed passing against production.
- v5.0-hotfix milestone close BLOCKER cleared (only v5h-01-03 postmortem remains before milestone audit).

</success_criteria>

<output>

After completion, create `.paul/phases/v5h-01-track-edit-save-loss/v5h-01-02-SUMMARY.md` with sections:

1. **What shipped** — files modified + commit hashes + Firebase rules deploy confirmation.
2. **Acceptance Criteria Results** — table of AC-1 through AC-5 with pass/fail + evidence.
3. **Decisions Made** — including resolution of the option-all-three vs option-ef-only checkpoint.
4. **Verification Results** — vitest output (suite count delta), tsc + build outputs, Daniel's UAT screenshots/notes.
5. **Deviations** — any auto-fixes, scope adjustments, deferred concerns.
6. **Boundary log** — confirmation that engine.ts, adapter.ts, init.ts, etc. were untouched.
7. **Hand-off to v5h-01-03** — what the postmortem should cover (kitchen-sink security-rules fidelity gap; cutover-plan rules-audit gate; reconciliation modal copy improvement deferred to v5.1; lazy-hydration retry semantics deferred; etc.).

</output>
