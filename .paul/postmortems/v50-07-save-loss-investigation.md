# Investigation — v50-07 post-UAT save-loss

**Captured:** 2026-04-27
**Plan:** v5h-01-01 — Reproduce + diagnose track-edit save-loss
**Source page:** /setlists/kQNvssixRlHQRB6gtWqt (production, master branch)
**Capture method:** Chrome DevTools → Application → IndexedDB → `crc-local`

---

## TL;DR

**The original handoff hypothesis was wrong.** This is not an engine writeback race or a snapshot-listener LWW underflow. It is a **Firestore security rules deployment bug**: the v50-05 cutover started writing top-level `tracks/{id}` and `songs/{id}` documents, but `firestore.rules` was never updated to permit writes to those collections. Firestore default-denies every write. The user's experience ("key disappears after navigate-away") is a downstream effect of every track save being rejected by Firebase + the per-doc drain ordering invariant blocking subsequent edits + SetlistGridHydrator re-priming local Dexie from the legacy embedded `setlists/{id}.tracks[]` array on every re-mount.

The bug is loud (engine surfaces `permission-denied` → AuthError → outbox row marked `failed` → engine state `conflict` → ReconciliationProvider opens) but the user-visible message ("detected changes from somewhere else") doesn't communicate the actual problem.

## Evidence

### Outbox state — 50+ rows for setlist `kQNvssixRlHQRB6gtWqt`

Composition observed in `crc-local`/`outbox`:

- ~30 `failed` `op:'set'` rows for `tracks/{uuid}` — all with `lastError: "Auth failure on tracks/{uuid}: permission-denied"`. These are the lazy-hydration cascade fan-out from v50-07-03 (SetlistGridHydrator re-priming legacy embedded tracks into the top-level collection).
- 1 `failed` `op:'set'` for `tracks/68cd0d23-...` at localId 53 (the original Modeh Ani add).
- 2 `pending` `op:'update'` rows for `tracks/68cd0d23-...` at localIds 94 and 141 — these are the user's actual key edits, **never drained** because per-doc drain ordering (v50-03) blocks them behind the failed `set` row at localId 53.
- 1 `pending` `op:'set'` for `tracks/68cd0d23-...` at localId 100 — likely produced by a Hydrator re-fire after the failed cascade left `setlists.hydrated:true` unwritten.
- ~20 more `failed` and `pending` rows in the same shape. New rows continue to land on every page mount.

### Sample rows verified

**localId 53** (original add of Modeh Ani):
```
{
  status: 'failed',
  op: 'set',
  collection: 'tracks',
  docId: '68cd0d23-0668-45ed-880f-526d4cabcf5c',
  expectedUpdatedAt: undefined,
  lastError: "Auth failure on tracks/68cd0d23-0668-45ed-880f-526d4cabcf5c: permission-denied",
  attempts: 1,
  payload: {
    id: '68cd0d23-0668-45ed-880f-526d4cabcf5c',
    title: 'Modeh ani - Klepper',
    fileId: '1t7fPtGbxIVUUaskwynvKjMYactKDbvGq',
    fileName: 'Modeh ani - Klepper.pdf',
    type: 'song',
    ...
  }
}
```

**localId 95** (lazy-hydration cascade row from re-mount):
```
{
  status: 'failed',
  op: 'set',
  collection: 'tracks',
  docId: '5661497c-0337-414c-bb50-04e47f573a90',
  expectedUpdatedAt: undefined,
  lastError: "Auth failure on tracks/5661497c-0337-414c-bb50-04e47f573a90: permission-denied",
  attempts: 1,
  payload: {
    id: '5661497c-0337-414c-bb50-04e47f573a90',
    title: 'Pre Service',
    type: 'header',
    setlistId: 'kQNvssixRlHQRB6gtWqt',
    order: 0,
    ...
  }
}
```

Both rows hit the same error. Sample is 2 of 30+; pattern is universal.

### firestore.rules audit

`grep` for `match.*(tracks|songs|setlists)` in `firestore.rules`:

```
51:      match /setlists/{docId} {
83:    match /setlists/{setlistId} {
186:    match /setlists/{setlistId}/history/{entryId} {
199:    match /setlists/{setlistId}/emailEvents/{eventId} {
```

**No `match /tracks/{trackId}`. No `match /songs/{songId}`.** Firestore default-denies any path without an explicit match rule.

### Code path that drives the failure

1. v50-05-02 cutover landed `applyEdit('set', 'tracks', {id, ...})` and `applyEdit('update', 'tracks', {key, ...})` at every cell-commit site in SetlistGrid + SetlistGridHydrator.
2. ProductionFirestoreAdapter (`init.ts:104-108`) maps Firestore error codes:
   ```ts
   if (code === 'unauthenticated' || code === 'permission-denied') {
     throw new AuthError(...)
   }
   ```
3. Engine's `handleAdapterError` for `AuthError` (engine.ts:317-353):
   - First attempt → refresh token + retry once
   - Second failure → mark row `failed`, dispatch `DRAIN_AUTH_FAILED`, stop drain
4. Per-doc drain ordering (engine.ts:198-226) treats the `failed` row as blocking; subsequent rows for the same `(collection, docId)` never drain.
5. v50-07-03 lazy-hydration: on every SetlistGridHydrator mount, if `setlist.hydrated !== true`, fan out N `applyEdit('set', 'tracks', t)` calls + a final `applyEdit('update', 'setlists', {hydrated:true})`. Every fan-out `set` fails. The final `update({hydrated:true})` may or may not land depending on whether `setlists` rules permit it (they do — from line 83 match), but the pre-condition `Promise.all` resolved successfully despite the engine drain failures (because applyEdit succeeds locally; drain failures happen later, asynchronously).

   **Wait — actually, the lazy-hydration code is `await Promise.all(setCalls)` then `applyEdit({hydrated:true})`.** `applyEdit` itself succeeds (local Dexie write + outbox enqueue) regardless of drain outcome. So the `hydrated:true` update DOES enqueue. But it sits behind the failed cascade entries on per-doc ordering... actually no — `hydrated:true` is on the `setlists` collection, not `tracks`, so it's a different docId. So it can drain independently.

   So the LIVE code probably DOES write `setlists.hydrated:true` after a failed cascade. That would explain why we don't see new lazy-hydration cascades on every mount — the setlist gets marked hydrated even when the cascade failed silently. But that's even worse: now the lazy-hydration is a one-shot that never retries.

   Need to read `SetlistGridHydrator.tsx` to confirm. Routed to v5h-01-02 fix planning.

6. Snapshot-listener: when the user's edit's outbox row is stuck at `pending` (blocked behind failed `set`), and Firestore's onSnapshot delivers cached pre-edit state, the listener checks for any pending outbox row for the docId — there IS one (localId 94) — so it skips the put. So the listener is doing the right thing here. The "key gone after navigate-away" symptom is therefore NOT a listener clobber — it's a Hydrator re-priming clobber. SetlistGridHydrator does `db.tracks.put` from `initialServerData` (the embedded legacy array) on mount, bypassing the listener's outbox-pending guard.

   This is the actual silent-clobber path: Hydrator priming + legacy embedded array source overwrites the user's local edit.

### Why was the original handoff hypothesis wrong?

The handoff was drafted before any production state was captured. It reasoned from the smoking-gun observations in `snapshot-listener.ts:215` (LWW underflow) + `engine.ts:264` (writeback skipped on undefined updatedAt) — both real code-level concerns, but neither was firing in production. The actual production behavior is dominated by `permission-denied` errors that the original handoff did not consider because nobody had inspected the Firestore rules during v50-05/v50-07 planning.

### Why did kitchen-sink (v50-07-04) miss this?

The kitchen-sink fast-check property uses `KitchenSinkAdapter`, an in-memory adapter that always permits writes. Firestore security rules are a backend configuration, completely outside the test surface. No test harness in the v50-03/v50-06/v50-07 progression can catch a missing security rule because the adapter is what mocks Firestore. To catch this class of bug we would need:

- A real Firebase emulator wired into the harness (kitchen-sink "real-Firestore lite" mode)
- OR a manual smoke test against staging/production with rules deployed
- OR an explicit security rules audit gate in the cutover plan

Documented for v5h-01-03 postmortem (Plan 03 in v5.0-hotfix milestone).

## Hypothesis classification

| Original hypothesis | Evidence in production | Verdict |
|---|---|---|
| A — Engine writeback never fired | Some local rows have `updatedAt: undefined`, but writeback isn't the proximate cause; it's downstream of permission-denied | Secondary concern at most |
| B — Listener LWW underflow | Listener skip-path correctly fires when outbox has a pending row; not the clobber path in production | Not the proximate cause |
| C — `serverTimestamp()` race | Adapter never reaches `serverTimestamp()` because writes are denied before that | Not the proximate cause |
| **E (new) — Missing Firestore rules** | Confirmed: no `match /tracks/{trackId}` or `match /songs/{songId}`; every track set returns `permission-denied`; 30+ failed outbox rows all carry the same error | **PROXIMATE CAUSE** |
| **F (new) — Hydrator re-priming clobbers local edits** | SetlistGridHydrator's `db.put` of `initialServerData` runs unconditionally on each mount; once the cascade fails, the user's local edit on a track is overwritten when the user navigates back (re-mount → re-prime from legacy embedded array) | **CONTRIBUTING SECONDARY CAUSE for the "key gone" symptom** |

## Recovery for the affected user

User's `crc-local` outbox has 50+ stuck rows. Even after rules deploy, the engine will retry these — but the lazy-hydration cascade payloads carry the legacy embedded format (no `songId`, no `key`, just `id`/`title`/`fileId`/`fileName`). Re-running them as `set` ops would lock in the legacy shape and overwrite any subsequent valid edits (none exist yet, but worth flagging).

Recovery options for v5h-01-02:
1. Manual: tell affected users to clear browser data on the app, accepting any unsynced edits as lost (probably 0 unsynced edits today, since nothing has saved successfully since v50-05 cutover).
2. Programmatic: a one-shot script in the engine that, on rules-deploy + first boot, deletes all `failed` outbox rows so the user retries from scratch with the latest local state.
3. Surgical: a "Reset & Retry" button in the ReconciliationProvider that calls `engine.resolveConflict('theirs')` for every failed row in batch.

Option 1 is simplest. Daniel + 0 band members are the only affected users right now, so blast radius is minimal.

## Affected production data — pre-fix state

- Setlist `kQNvssixRlHQRB6gtWqt` (the one Daniel was testing on)
- Likely all setlists Daniel has opened since v50-05-02 deployment date — each open triggers the lazy-hydration cascade, each cascade leaves N failed outbox rows
- `tracks/{id}` and `songs/{id}` collections in production Firestore: completely empty (no writes have ever succeeded)
- All track data in production lives in legacy embedded `setlists/{id}.tracks[]` arrays — no migration has effectively happened despite v50-07-02 + 03 plans

## Sentry observations (deferred)

Daniel hard-refreshed the page mid-investigation, so the in-memory Sentry buffer was wiped before we could check the dashboard. Per v50-07-05 wiring, the engine should be capturing `feature:dead-letter` events on every `DRAIN_BUDGET_EXHAUSTED` transition. The dead-letter capture fires AFTER MAX_ATTEMPTS=5 attempts, but AuthError-on-second-attempt skips the retry loop — so dead-letter capture probably DIDN'T fire for the permission-denied AuthErrors. Alarm coverage gap to confirm and route forward.

The reconciliation modal that Daniel saw firing repeatedly is itself the loudest signal. Indicator state was red `failed-retry` per Daniel's observation.

## Next steps

This evidence inverts the v5h-01 plan structure. The original sequencing assumed the bug was in the engine layer and would be fixed with a 2-line code change in v5h-01-02. The actual fix is a security-rules deploy + a recovery mechanism, with the original A/B/C/D options demoted to defense-in-depth follow-ups (still worth shipping, but not the proximate hotfix).

Updated decision options for Task 3 of v5h-01-01:

- **E (new, recommended)**: Add `match /tracks/{trackId}` and `match /songs/{songId}` rules to `firestore.rules` with band_leader/admin write permissions; deploy via `firebase deploy --only firestore:rules`; ship a one-shot outbox-reset path so affected users (Daniel) can recover.
- **F (defense-in-depth secondary)**: Audit SetlistGridHydrator priming logic so it doesn't clobber local Dexie rows that have a pending outbox edit. Pattern: skip `db.put` of initialServerData if any outbox row exists for that docId (mirrors snapshot-listener's outbox-pending guard).
- **B (defense-in-depth tertiary)**: The listener LWW underflow guard from the original handoff is still a legitimate fix surface for race conditions that could surface AFTER rules are deployed and writes start landing. AC-1 in property-failures.test.ts still reproduces a real bug shape; lock it in.

The v5h-01-02 fix plan should ship E + F as the actual hotfix, with B optionally ridden along.
