---
phase: v5h-01-track-edit-save-loss
plan: 01
type: research
wave: 1
depends_on: []
files_modified:
  - src/lib/sync/__tests__/property-failures.test.ts
  - .paul/postmortems/v50-07-save-loss-investigation.md
autonomous: false
---

<objective>
## Goal

Reproduce Daniel's UAT track-edit save-loss in a deterministic test harness, capture production state with DevTools to confirm which of three hypotheses is the actual root cause, and decide between three fix shapes (A/B/C) for v5h-01-02 to ship.

The bug, in Daniel's words: brand-new setlist (no legacy embedded tracks); none of the songs have a key; edit "Modeh Ani" key to E; sync indicator shows "Saved"; navigate to any other view; navigate back; song still listed but key field is blank. Path "P" (real save-loss), not "Q" (orphaned setlist).

## Purpose

v5.0 milestone close is BLOCKED on this fix. Without it, the bulletproof claim is hollow — the very pattern v5.0 was rebuilt to make safe (edit a cell, see "Saved", trust it) silently loses data. v50-07-04's "harness-only" decision (Task 0) sized the kitchen-sink fast-check to in-memory zero-latency adapters; it never modeled Firestore's initial-cache-then-fresh `onSnapshot` delivery, which is where the race lives. This plan adds the missing fidelity, captures real-world evidence, and locks the fix path before code changes.

## Output

- New describe block in `src/lib/sync/__tests__/property-failures.test.ts` that deterministically reproduces the save-loss with a `CachedThenFreshSubscriber` modeling Firestore's two-stage delivery semantics (the test SHOULD fail at first run if hypothesis B is correct).
- Production state capture in `.paul/postmortems/v50-07-save-loss-investigation.md` from Daniel + DevTools (BEFORE clearing browser data).
- Decision-checkpoint resolution: fix shape A / B / C documented at end of this plan's SUMMARY for v5h-01-02 to consume.

</objective>

<context>
## Project Context
@.paul/PROJECT.md
@.paul/ROADMAP.md
@.paul/STATE.md

## Bug Bridge (archived handoff)
@.paul/handoffs/archive/HANDOFF-2026-04-27-post-uat-v5h-and-v51.md

## Source files in scope (READ to design, do not modify in this plan)
@src/lib/sync/snapshot-listener.ts
@src/lib/sync/engine.ts
@src/lib/sync/init.ts
@src/lib/sync/firestore-adapter.ts
@src/lib/sync/__tests__/property-failures.test.ts

## Code-scan diagnostics already done (do NOT redo)
- Cell commit path is wired correctly: `DropdownCell.onSelect` → `commit(value)` → `onCommitTrackPatch` → `applyEdit('update','tracks',{key:newKey}, expectedUpdatedAt: row.updatedAt)`.
- `applyEdit('update','tracks',...)` does `db.tracks.put(merged)` synchronously inside the txn — local Dexie row carries `key=E` immediately, regardless of drain.
- `useLiveQuery` query is correct: `db.tracks.where('setlistId').equals(setlistId).sortBy('order')`.
- No production code clears Dexie tracks (only `resetDbForTests` exists, test-only).
- Hydrator priming SKIPS for `initialTracks.length === 0` (which is Daniel's case — fresh setlist; legacy embedded `tracks[]` array is never populated by v5.0).
- ProductionFirestoreAdapter (`init.ts:39-146`) for `update` ops: `runTransaction` with `expectedUpdatedAt` precondition + `tx.update` (partial merge) + `serverTimestamp()`, then a separate `getDoc(ref)` to re-read the resolved server timestamp.
- Lazy-hydration cascade (v50-07-03) ruled out — Daniel's flow is on a fresh setlist with no legacy embedded tracks.

## Smoking-gun observation from snapshot-listener.ts:212-225

```ts
// added / modified
const local = await db.tracks.get(change.docId)
if (
    local &&
    (local.updatedAt ?? 0) >= change.updatedAt
) {
    continue // LWW skip
}
const next: LocalTrack = {
    ...(change.data as LocalTrack),
    id: change.docId,
    updatedAt: change.updatedAt,
} as LocalTrack
await db.tracks.put(next)
```

If `local.updatedAt` is `undefined` after the engine writeback, then `(undefined ?? 0) >= change.updatedAt` → `0 >= ts1` → false → fall-through → `db.tracks.put(next)` → local row clobbered with cached pre-edit Firestore data (cached delivery has no key).

## Smoking-gun observation from engine.ts:262-281

```ts
await this.db.transaction(
    'rw',
    this.db.outbox,
    this.db[row.collection],
    async () => {
        await this.db.outbox.delete(row.localId!)
        if (
            result.updatedAt !== undefined &&
            row.op !== 'delete'
        ) {
            const existing = await this.db[row.collection].get(row.docId)
            if (existing) {
                await this.db[row.collection].put({
                    ...existing,
                    updatedAt: result.updatedAt,
                } as never)
            }
        }
    },
)
```

If `result.updatedAt === undefined` (e.g., adapter's getDoc readback hits Firestore's local cache before serverTimestamp() resolves), the engine SKIPS writeback. Local row's `updatedAt` is never updated. Combined with the listener's underflow guard, the next inbound delivery clobbers the user's edit.

## Three ranked hypotheses (all converge on the same fix surface)

1. **Snapshot-listener LWW guard underflow** (most likely). Engine writeback raced or didn't fire → local has `updatedAt=undefined` → listener delivers cached pre-edit Firestore state (updatedAt=ts1) → guard fails open → put → clobber. Indicator already showed "Saved" because outbox drained successfully — it just didn't write back.
2. **Engine writeback never fires for the user's update.** Adapter `commitOutboxRow` returned `{updatedAt: undefined}` because getDoc readback raced serverTimestamp resolution. Same downstream failure mode as #1.
3. **`serverTimestamp()` resolves AFTER the getDoc re-read.** Sentinel timing → `updatedAt` written to local Dexie is `undefined` → same downstream failure mode as #1 and #2.

</context>

<skills>
## Required Skills (from SPECIAL-FLOWS.md)

| Skill | Priority | When to Invoke | Loaded? |
|-------|----------|----------------|---------|
| (none) | — | This plan touches engine + harness + investigation only; no UI surface. Same precedent as v50-06-01 + v50-07-02 + v50-07-04 + v50-07-05. | N/A |

`/ui-ux-pro-max` is NOT required for this plan.

</skills>

<acceptance_criteria>

## AC-1: Reproduction harness fails on master, passes the assertion shape we want post-fix

```gherkin
Given a fresh `crc-sync` Dexie database with no setlist or tracks
And a SharedRemote initialized with one setlist `s1` (no tracks)
And a CachedThenFreshSubscriber that delivers initial cached state synchronously on subscribe and fresh deliveries asynchronously on remote mutations
And the engine drained, idle, online
When applyEdit('set','tracks',{id:'t1', setlistId:'s1', songId:'song1', title:'Modeh Ani'}) commits and drains successfully
And the engine's writeback resolves with `result.updatedAt === undefined` (adapter readback raced the serverTimestamp resolution — modeled by HarnessAdapter returning `{}` for this op)
And applyEdit('update','tracks',{key:'E'}, expectedUpdatedAt: <whatever local has>) commits and drains successfully
And the writeback for that update also resolves with `result.updatedAt === undefined` (modeled the same way)
And page-navigation is simulated by clearing the local Dexie tracks store, re-priming via the Hydrator pattern with `initialTracks=[]`, and mounting startSnapshotListener with the CachedThenFreshSubscriber holding the PRE-edit cached Firestore state
Then the assertion `db.tracks.get('t1').then(t => expect(t?.key).toBe('E'))` SHOULD FAIL on master (current snapshot-listener LWW underflow clobbers the edit)
And the test name documents the exact failure mode: "v5h-01-01: cached snapshot delivery clobbers local edit when engine writeback skipped"
```

## AC-2: Fidelity-gap counter-test passes on master

```gherkin
Given the same harness setup but with HarnessAdapter returning a real ms timestamp on writeback
When the same applyEdit + drain sequence runs
And the snapshot listener mounts with CachedThenFreshSubscriber
Then `db.tracks.get('t1').then(t => expect(t?.key).toBe('E'))` PASSES
And this proves the bug is gated on adapter-returned undefined updatedAt (not a general listener bug)
```

This counter-test scopes the bug to the conjunction of engine-undefined-writeback AND listener-undefined-underflow, ruling out unrelated listener regressions.

## AC-3: HUMAN-ACTION production state capture documents observed Dexie shape

```gherkin
Given Daniel has the affected setlist still in his browser (NOT cleared)
When he opens it with Chrome DevTools, opens Application → IndexedDB → crc-sync → tracks store
And he edits "Modeh Ani" key to E
And he reads off the row for the affected track BEFORE navigating away (capture screenshot of: id, key, updatedAt, setlistId)
And he navigates to any other view
And he comes back, opens the same DevTools view, reads off the row again (capture screenshot)
And he checks Sentry for events tagged `feature:dead-letter` OR `feature:snapshot-listener` in the timestamp window of the bug
Then `.paul/postmortems/v50-07-save-loss-investigation.md` exists with:
  - Two screenshots (before / after navigation)
  - Observed updatedAt values (or "undefined" if absent)
  - Sentry event count with feature tag
  - Datestamp + setlist ID + track ID
  - Clear classification: "matches hypothesis #N because [reason]"
```

## AC-4: Decision-checkpoint resolves to fix shape A, B, or C

```gherkin
Given AC-1 (harness reproducibility) and AC-3 (production capture) are met
When the captured evidence is reviewed against the three hypotheses
Then exactly one of the three fix shapes is selected:
  - A: writeback never fired → make engine writeback unconditional + verified via test harness (don't gate writeback on `result.updatedAt !== undefined`; require adapter to return a usable timestamp)
  - B: listener LWW guard underflow → change snapshot-listener.ts:215 from `(local.updatedAt ?? 0) >= change.updatedAt` to `local.updatedAt !== undefined && local.updatedAt >= change.updatedAt` (skip listener delivery when local has no updatedAt — preserve user edit; symmetric change for setlists branch line 174)
  - C: serverTimestamp didn't resolve → switch the production adapter writeback timestamp to client-side `Date.now()` consistent with how local Dexie tracks `updatedAt` (server timestamp adds asymmetry the LWW comparison trips on)
Or: a combination is documented (e.g., "B is the proximate fix; A is the root-level defense; v5h-01-02 ships both"). Decision goes into v5h-01-01-SUMMARY.md "Decision Resolution" section for v5h-01-02 to consume.
```

</acceptance_criteria>

<tasks>

<task type="auto">
  <name>Task 1: Build CachedThenFreshSubscriber + reproduction harness in property-failures.test.ts</name>
  <files>src/lib/sync/__tests__/property-failures.test.ts</files>
  <action>
Add a new describe block at the end of the file: `v5h-01-01: track-edit save-loss reproduction (cached-then-fresh listener delivery)`.

Build a `CachedThenFreshSubscriber` class implementing `SnapshotSubscriber` (the existing test-seam in `src/lib/sync/snapshot-listener.ts`):
  - Holds a snapshot of "the server state as of subscribe time" (initial cached delivery)
  - On `subscribeSetlist` / `subscribeTracks`: synchronously fires `onNext` / `onChanges` with the cached state (mirrors Firestore SDK behavior — initial cache delivery is sync-ish on subscribe)
  - Exposes `pushFreshDelivery(setlistData?, trackChanges?)` for tests to manually trigger a "fresh from server" delivery later
  - The KEY distortion: the cached state is captured at construction time and frozen; subsequent SharedRemote mutations DO NOT propagate to subscribed listeners until `pushFreshDelivery` fires. This models the cache-vs-fresh staleness window where Firestore can deliver cached pre-edit data after a successful local commit.

Then write the AC-1 reproduction test:
  1. Build a `HarnessAdapter` variant (or reuse an existing one with a flag) that returns `{}` (no `updatedAt`) on `commitOutboxRow` for `set` and `update` ops — modeling the adapter readback racing serverTimestamp resolution.
  2. Initialize SharedRemote with one setlist doc `s1` (no tracks).
  3. Boot SyncEngine + FakeClock + lock; engine.start() then engine drained.
  4. applyEdit('set','tracks',{id:'t1', setlistId:'s1', songId:'song1', title:'Modeh Ani'}) — no key.
  5. Drain via `pump`; assert `t1` in Dexie has `key === undefined` (not yet edited) and `updatedAt === undefined` (writeback skipped — that's the modeled race).
  6. Capture SharedRemote's pre-edit state for the listener (this is what cached delivery will replay).
  7. applyEdit('update','tracks',{key:'E'}, expectedUpdatedAt: <whatever>) — note: with undefined local updatedAt, the precondition is undefined, which means "no precondition" in the production adapter; for test purposes use the harness adapter so this branch doesn't matter — focus is on listener clobber.
  8. Drain; assert local row has `key === 'E'` post-applyEdit (synchronous Dexie put inside applyEdit txn) BUT `updatedAt === undefined` (writeback skipped again).
  9. Simulate page-nav: clear `db.tracks` (mimics fresh-mount Hydrator with `initialTracks=[]`).
  10. Construct CachedThenFreshSubscriber capturing the PRE-edit SharedRemote state from step 6.
  11. Mount `startSnapshotListener({ setlistId:'s1', db, subscriber })` — initial cached delivery fires sync-ish.
  12. Wait one microtask tick.
  13. Assertion (AC-1): `expect((await db.tracks.get('t1'))?.key).toBe('E')` — SHOULD FAIL on master (clobbered by listener); document the failure with `// EXPECTED FAILURE on master per hypothesis B; passes after listener LWW guard fix`.

Then write the AC-2 counter-test: same harness but HarnessAdapter returns a real `{updatedAt: clock.now()}` on every commit. Engine writeback lands. Local row carries proper updatedAt. Listener LWW guard skips correctly. Assertion passes — proves the bug is the conjunction of "adapter returned undefined" AND "listener underflows undefined", not a general listener regression.

Mark the AC-1 test with `it.fails(...)` (vitest's expected-failure marker) so CI is green on master pre-fix and so v5h-01-02's fix landing flips it to passing without regressions elsewhere. If `it.fails` is unavailable in this vitest version, use `it.todo` with a comment, or `it.skip` with a TODO referencing v5h-01-02; do not assert green on a known broken path.

Reuse the existing harness primitives: `SharedRemote`, `OfflineToggleAdapter` shape, `setupSyncEngine` helpers, FakeClock — DO NOT rebuild from scratch. If a primitive needs a small extension, lift it to module scope and document the lift, mirroring the v50-07-04 OfflineToggleAdapter precedent.

Avoid:
- Real Firestore. This plan is harness-only fidelity work.
- Modifying production code in this plan. Boundaries lock production sources.
- Adding new dependencies.
  </action>
  <verify>
`npm run test -- src/lib/sync/__tests__/property-failures.test.ts` shows the new describe block; AC-1 test marked as expected-failure (or skip-with-TODO); AC-2 counter-test passes; full suite count increases by exactly the new tests; tsc clean (`npx tsc --noEmit`); next build clean (`npm run build`).
  </verify>
  <done>AC-1 + AC-2 satisfied. Reproduction is deterministic; counter-test scopes the bug.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <what-built>
A reproduction harness that points the diagnosis at the listener-LWW-underflow + engine-skipped-writeback conjunction. To distinguish hypothesis B (listener) from C (serverTimestamp resolution) from A (writeback miss), we need real production evidence from Daniel's affected setlist before the bug evidence is lost.
  </what-built>
  <how-to-verify>
**⚠️ CRITICAL: Daniel must NOT clear browser data on the affected setlist before completing this capture, or the bug evidence is lost.**

Daniel performs the following with Chrome DevTools open on the affected setlist:

1. Open the affected setlist in Chrome.
2. Open DevTools → Application → IndexedDB → `crc-sync` → `tracks` store.
3. Locate the "Modeh Ani" track row. Screenshot showing: `id`, `key`, `updatedAt`, `setlistId`, `songId`, `title`. (If still showing `key:'E'` from the original edit, that's evidence — the local Dexie write landed; the question is what happens on next mount.)
4. Edit the key to E (or any non-blank value if E is somehow already there). Wait until sync indicator shows "Saved".
5. BEFORE navigating: re-screenshot the same row. Note the `updatedAt` value — is it `undefined`, `null`, or a number?
6. Open DevTools → Application → IndexedDB → `crc-sync` → `outbox` store. Screenshot any rows present (should be empty if drained).
7. Navigate to any other view (e.g., the home or library page).
8. Navigate back to the same setlist.
9. Re-screenshot the tracks store row for "Modeh Ani". Compare `key` and `updatedAt` against step 5.
10. Open Sentry dashboard, filter to events from this session's time window with tags `feature:dead-letter` OR `feature:snapshot-listener`. Screenshot the result (or note "0 events").

Document all of the above in `.paul/postmortems/v50-07-save-loss-investigation.md` with:
  - Datestamp of capture
  - Setlist ID + track ID
  - Pre-nav `key` + `updatedAt` (verbatim)
  - Post-nav `key` + `updatedAt` (verbatim)
  - Outbox state at each step
  - Sentry event count + relevant payloads
  - Daniel's text classification: "matches hypothesis #N because [reason]"
  - Screenshots inline or linked

Once `.paul/postmortems/v50-07-save-loss-investigation.md` is committed, type "captured" to proceed to Task 3 root-cause confirmation.
  </how-to-verify>
  <resume-signal>Type "captured" once `.paul/postmortems/v50-07-save-loss-investigation.md` is committed with the production state evidence, or "blocked" with a reason if the capture cannot be performed.</resume-signal>
</task>

<task type="checkpoint:decision" gate="blocking">
  <decision>Which fix shape (A / B / C / combination) does v5h-01-02 ship?</decision>
  <context>
With Task 1 (harness reproducibility) and Task 2 (production state capture) in hand, evidence should clearly indicate which hypothesis is the actual root cause. The three options below converge on overlapping but distinct fix surfaces; the captured evidence determines which is the proximate fix vs. defense-in-depth.

The cost analysis matters: B is the smallest change (one line in snapshot-listener.ts; symmetric setlists/tracks branches → two lines), A is medium (engine writeback contract change; adapter contract tightening), C is largest (production adapter Firestore write semantics change; affects every commit in the system, not just this bug).
  </context>
  <options>
    <option id="option-a">
      <name>A — Engine writeback unconditional + adapter contract tightening</name>
      <pros>
- Defense in depth — fixes the root cause (engine should never leave local with stale updatedAt after a successful commit).
- Future-proofs against unrelated adapter races (any future adapter that returns `{}` on success won't silently lose data).
- Surfaces adapter bugs early (if production adapter can't return updatedAt, that's a contract violation worth knowing about).
      </pros>
      <cons>
- Contract change touches every adapter implementation (Production + Harness + KitchenSink + TwoWriter + OfflineToggle + FakeAdapter — 6 sites).
- Doesn't address the listener underflow — a future code path that legitimately has undefined updatedAt could still trip the same clobber.
- Larger blast radius for a hotfix.
      </cons>
    </option>
    <option id="option-b">
      <name>B — Listener LWW guard against undefined local.updatedAt</name>
      <pros>
- Smallest change: 2 lines in snapshot-listener.ts (setlists branch line 174 + tracks branch line 215).
- Targets the exact clobber site in evidence.
- Defense-correct semantics: "if we don't know our local timestamp, prefer the local edit over a remote that might be staler than our local commit" — preserves user intent under uncertainty.
- Quickest hotfix path.
      </pros>
      <cons>
- Doesn't fix the engine-skipped-writeback root cause (local row stays without updatedAt indefinitely; future deliveries are still skipped on the safe side).
- A new race could surface if some other code path legitimately writes Dexie tracks with undefined updatedAt and we want fresh remote data to overwrite it (no such code path exists today, but the symmetry is worth noting).
      </cons>
    </option>
    <option id="option-c">
      <name>C — Switch production adapter writeback timestamp to client-side Date.now()</name>
      <pros>
- Eliminates the serverTimestamp-vs-getDoc race entirely — no more readback to resolve a sentinel.
- Saves one network round-trip per commit (getDoc post-commit goes away).
- Local Dexie updatedAt and Firestore updatedAt become symmetric (both are client-side ms numbers).
      </pros>
      <cons>
- Changes the entire write path's timestamp semantics — large blast radius for a hotfix.
- Loses server-side ordering authority — clients with skewed clocks can write "future" updatedAt values that override fresher edits.
- Doesn't fix the listener underflow — same clobber path is still present if any future code path leaves updatedAt undefined.
- v50-06-02's expectedUpdatedAt precondition contract changes meaning (now compares two client-side timestamps from possibly-different clocks).
      </cons>
    </option>
    <option id="option-d">
      <name>D — Combination: B as proximate fix + A as defense-in-depth (recommended pre-evidence)</name>
      <pros>
- B is a 2-line surgical fix that closes the observed clobber path.
- A makes the engine contract explicit and prevents a future adapter regression from silently re-introducing the same bug.
- Splits the fix surface: B is required for the bug; A is required for the postmortem's "this won't happen again" claim.
      </pros>
      <cons>
- v5h-01-02 grows from "small fix" to "small fix + adapter contract tightening" — slight scope creep.
- If evidence shows the engine writeback DID land and only the listener clobbered (pure hypothesis B), A is overkill.
      </cons>
    </option>
  </options>
  <resume-signal>Type "select option-X" (option-a, option-b, option-c, or option-d) with a one-line rationale tying the choice to the captured evidence. The selection will be recorded in v5h-01-01-SUMMARY.md "Decision Resolution" for v5h-01-02 to consume.</resume-signal>
</task>

</tasks>

<boundaries>

## DO NOT CHANGE

- `src/lib/sync/snapshot-listener.ts` — production listener; the actual fix lands in v5h-01-02 only.
- `src/lib/sync/engine.ts` — production engine; writeback contract changes (if any) land in v5h-01-02 only.
- `src/lib/sync/init.ts` (ProductionFirestoreAdapter) — production adapter; serverTimestamp / Date.now switch (if option C) lands in v5h-01-02 only.
- `src/lib/sync/firestore-adapter.ts` (CommitResult, FirestoreAdapter interface) — interface contract changes (if any) land in v5h-01-02 only.
- `src/lib/sync/sentry-capture.ts` — observability is stable; no changes here.
- v50-07-05 UAT-PLAN.md / SHIP-CHECKLIST.md / lazy-hydration / dual-read perf-view / Dexie schema — all locked.

## SCOPE LIMITS

- This plan is RESEARCH ONLY. No production code changes. The fix lands in v5h-01-02.
- The reproduction harness extends `property-failures.test.ts` only — no new test file.
- The HUMAN-ACTION capture is documentary only. No code-side instrumentation is added in response to it (Sentry is already wired from v50-07-05; if Daniel sees zero events for `feature:snapshot-listener` despite the bug, that itself is a finding for v5h-01-03 postmortem).
- The decision-checkpoint outputs a fix-shape selection only. No fix-shape pre-implementation in this plan.
- Out-of-scope: the v5.1 UX overhaul (separate milestone), legacy `setlists/{id}.tracks[]` cleanup (deferred per v50-07 SUMMARY), songs/* + songId backfill (deferred per v50-07).

</boundaries>

<verification>

Before declaring this plan complete:

- [ ] `npm run test -- src/lib/sync/__tests__/property-failures.test.ts` shows new describe block with AC-1 (expected-failure) + AC-2 (counter-test passes); full suite count increases by exactly the new tests.
- [ ] `npx tsc --noEmit` clean.
- [ ] `npm run build` clean.
- [ ] `.paul/postmortems/v50-07-save-loss-investigation.md` committed with Daniel's screenshots + classification.
- [ ] Decision-checkpoint resolved with one of A/B/C/D selected and rationale tied to captured evidence.
- [ ] v5h-01-01-SUMMARY.md created with: harness summary, captured evidence summary, decision resolution, hand-off notes for v5h-01-02 (which fix shape, which lines/files to touch, which assertion in AC-1 will flip from expected-failure to passing post-fix).

</verification>

<success_criteria>

- All 4 ACs satisfied.
- All verification checks pass.
- Suite green on master (AC-1 marked as expected-failure or skip-with-TODO; not a red CI signal).
- Decision recorded in SUMMARY.md so v5h-01-02 starts with zero ambiguity about which fix to ship.
- HUMAN-ACTION capture preserved in `.paul/postmortems/` for v5h-01-03 postmortem to cite.

</success_criteria>

<output>

After completion, create `.paul/phases/v5h-01-track-edit-save-loss/v5h-01-01-SUMMARY.md` with sections:

1. **Reproduction harness** — what was added, where, suite count delta.
2. **Production state capture** — link to `.paul/postmortems/v50-07-save-loss-investigation.md`; key finding (which hypothesis matches).
3. **Decision Resolution** — A / B / C / D selected; rationale; specific files + lines v5h-01-02 will touch; specific assertion in AC-1 that will flip from expected-failure to passing.
4. **Lessons for v5h-01-03 postmortem** — anything surfaced about why kitchen-sink (v50-07-04) missed this (initial-cache-then-fresh listener fidelity gap; harness-only decision didn't model adapter readback races; etc.).
5. **Boundary log** — confirmation that no production source files were modified.

</output>
