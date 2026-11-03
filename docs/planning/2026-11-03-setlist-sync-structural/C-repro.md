# C — empirical reproduction of the 2026-11-03 two-author failures

Branch `investigate/sync-repro`. No production data was touched. Everything ran against the
Firestore and Auth emulators (project `demo-sync-repro`) with the real `firestore.rules`.

## Harness

`src/lib/sync/__tests__/two-author-harness.ts` builds independent "devices" in one vitest process.
Each device gets its own module graph (`vi.resetModules` + `vi.doMock`), which gives it:

- its own Dexie database (fake-indexeddb);
- the real `SyncEngine` and the real `ProductionFirestoreAdapter`, booted through the real
  `<SyncEngineBoot/>`, and its own sync store (the indicator state);
- the real snapshot listener with the production lazy subscriber. This is the same
  `where('setlistId','==',…)` query the editor and Perform run;
- its own modular Web SDK, signed in through the Auth emulator with a custom token carrying the
  persona's claims.

Only three things are stubbed:
- `@/lib/firebase`, which hands the device's Firestore and Auth to the real code;
- the cross-tab lock. Two devices in one jsdom would otherwise share a BroadcastChannel and act
  like two tabs of one browser;
- Sentry capture, which is recorded instead of sent.

The harness drives the same `applyEdit` sequences the grid sends. The drag is `computeReorderUpdates`
followed by N parallel per-row order patches, each carrying that row's local `updatedAt`. That is
`SetlistGrid.handleDragEnd` and `MobileCardList.handleDragEnd`. It also sends add-at-end
(`handlePickSong`) and Duplicate (`handleContextDuplicate`: +1 bumps, then `set` of the clone).
The MCP writer is the real `addTrack` from `src/lib/mcp/server-tracks-write.ts` (Admin SDK).

The reload frame replicates `SetlistGridHydrator`'s priming. It uses the same skip rules: skip a doc
with an outbox row, skip a tombstoned doc, skip a row that isn't newer. It doesn't render the
component.

Personas: Daniel is `{ po: true, m: { crc: 'ad' } }`, the browser editor. David is
`{ m: { crc: 'bl' } }`, the phone. Two authors editing "at once" is modelled deterministically: one
device's `applyEdit` calls are queued while its engine is paused (a real in-flight outbox), the
other author's write lands, and then the paused engine drains.

Tests: `src/lib/sync/__tests__/two-author-repro.emulator.test.ts`, 16 tests, about 34 s, green
twice in a row. Each class has a `mechanism` test that pins today's behaviour and its outcome
codes, and an `it.fails` `wanted` test that states the correct behaviour. The `wanted` test fails
today, so CI stays green. When a fix makes it pass, remove the `.fails`.

Run:
`npx firebase emulators:exec --project demo-sync-repro --only firestore,auth "npx vitest run --config vitest.emulator.config.ts src/lib/sync/__tests__/two-author-repro.emulator.test.ts"`

## Results

| Class | Reproduced | Scenario |
|---|---|---|
| (a) creates never reach server, neighbours' renumbers do | **yes** (2 ways) | a1, a2 |
| (b) "saving" never clears | **yes** | b (also seen in a2) |
| (c) second device never shows edits, even after reload | **yes** (2 causes) | c |
| (d) receivers see intermediate orders | **yes** | d |
| (e) lost updates / duplicate orders on concurrent reorder or insert | **yes** | e, e/MCP |

### (c) A second device never shows the other author's edits

Steps:
1. Daniel retitles t01. David's listener never delivers it.
2. Daniel drags t04 to the top.
3. David drags t05 to the top. He never saw Daniel's move.
4. David reloads.

Outcome:
- David's tracks listener is refused at subscribe time:
  `permission-denied: Property orgId is undefined on object. for 'list' @ L290`. Sentry captures
  `snapshot-listener/tracks-subscribe`.
- Daniel's listener, as `po`, has no error.
- Control: David running the same query plus `where('orgId','==','crc')` succeeds.
- David's step-3 renumbers of t00–t04 all fail with
  `engine-drain:version-mismatch ×5 ("expected updatedAt=…, remote=…")`.
- After the reload, the server has `t04@0 t05@0 t00@1 …` and David has `t05@0 … t04@5`.

**Mechanism 1: the listener query has no tenant filter.** `snapshot-listener.ts` queries `tracks`
by `setlistId` only. Since phase 9, `firestore.rules` L290 allows `list` only when
`atLeast(listOrg(),'pe')`, and the query prover can't prove `resource.data.orgId` without an
`orgId` filter. Any non-`po` user is denied, which covers every band leader, musician and Perform
iPad. Only the platform owner's listener works. The listener logs the error and stays dead for the
page's lifetime. The setlist-doc listener (`get`, public) still works, so the page looks connected.
`track-count-sync.ts` and the rules tests already carry the `orgId` filter; the listener was missed.

**Mechanism 2: reload doesn't heal.** The hydrator and the listener both skip any doc with any
outbox row, and `failed` rows are terminal. A device that edited blind collects `failed` rows, and
those docs stay frozen at the local value across reloads. Nothing prunes local rows absent from the
server.

### (a) Rows created locally never reach the server, while their neighbours' renumbers do

**a1: Duplicate of a row whose local copy has a cleared field.**

Steps:
1. Daniel clears BPM on t02. The commit patch is `{bpm: undefined}`, from the grid's BpmCell and
   from `MobileRowCard.commitBpm`.
2. He duplicates t02.

Outcome: the server has orders `0,1,2,4,5,6,7,8` with no `dup`. Daniel's screen shows `dup@3`.
- The outbox holds `dup: set: failed, attempts 5:
  "Function setDoc() called with invalid data. Unsupported field value: undefined"`.
- The outbox also holds the BPM update itself: `failed, "Transaction.update() called with invalid
  data"`.
- Edit-log codes: `engine-drain:transient-error ×10`, `engine-drain:dead-letter ×2`,
  `engine-drain:success ×5` (the +1 bumps).

**Mechanism:**
- `applyEdit` merges `undefined` values into the Dexie row.
- The Web SDK runs without `ignoreUndefinedProperties`, so any payload carrying such a field
  (update, Duplicate's `{...source}`, undo restores) throws `invalid-argument`.
- The adapter maps that to `TransientError`, retries 5 times (about 7.5 s) and dead-letters it.
- The engine only orders writes per doc. The clone's `set` failing doesn't stop the other docs'
  bumps, so the server gets the renumber without the row.

**a2: A row removed on the server survives in the editor.**

Steps:
1. Daniel has an edit queued on t04.
2. Another writer deletes t04. This is the same shape as an MCP `remove_track`.
3. Daniel drags t07 to the second slot.

Outcome:
- The listener's `removed` delivery is skipped (`guard-skipped-pending`).
- The queued update fails with `engine-drain:remote-doc-missing`, which is terminal, so t04 stays on
  Daniel's screen.
- Daniel's renumber lands around t04. The server has `… t03@4 t05@6 …`, a gap at 5, and that slot
  belongs to a row that exists only in his browser.
- The new t04 renumber sits `pending` behind its `failed` sibling forever.

This matches the incident's "gaps where browser-only rows sit" without any create failing. The live
incident's gaps (10, 14, 15, 20, 22) fit either a1 or a2. Daniel's outbox would tell which.

**Not reproduced:** a plain add-at-end `set` failing. It landed in every scenario, including under
concurrent MCP writes.

### (e) Lost updates and duplicate orders

**e (drag vs drag).**

Steps:
1. Daniel drags t08 to slot 1. This writes t08 and t01–t07; his engine is still busy.
2. David drags t02 to slot 6. This writes t03–t06 and t02, and his commits land first.

Outcome:
- Server: `t00@0 t08@1 t01@2 t03@2 t04@3 t05@4 t06@5 t02@6 t07@8 t09@9`. Order 2 appears twice and
  order 7 is missing.
- Daniel's outbox: t02–t06 `failed` with `version-mismatch ×5`. t08, t01 and t07 landed.
- Daniel's screen still shows his own intended order, and no screen matches the server.

**e/MCP.**

Steps:
1. Daniel adds `new` at the end. It syncs.
2. He drags `new` to slot 5 while his engine is busy.
3. MCP `add_track` at position 3 renumbers every row (`updatedAt` bumped).

Outcome:
- Every one of Daniel's renumbers fails `version-mismatch ×6`.
- The server keeps MCP's order with `new@11`. Daniel's screen shows `new@5 t04@5`.
- State: `conflict`, 6 failed rows.

**Mechanism:**
- A reorder is N independent single-row writes, each with a per-row `expectedUpdatedAt`
  precondition, and there is no setlist-level transaction or version.
- Rows the other author touched fail and the rest land, so the result is half of each move.
- MCP renumbers every row on each insert, so any editor write in flight conflicts on every row.
- The failed rows then block the listener for those docs (`guard-skipped-pending`), so the losing
  screen never converges.

### (b) "Saving" never clears

Steps: the same as e. Afterwards nothing is in flight. All 5 remaining outbox rows are `failed`.

Outcome: transitions `dirty/8 conflict/6 … conflict/6 saving/5`. The store shows `saving` at the
end and still shows `saving` 3 s later. No timer is armed.

**Mechanism (`engine.ts` + `state-machine.ts`):**
- Any pump that finds a drainable row dispatches `DRAIN_STARTED`, which moves the state to `saving`
  and overwrites `conflict` or `failed`.
- `DRAIN_OK` is dispatched only when the outbox count is 0.
- With failed rows present the count never reaches 0, and `scheduleNextPump` arms no timer for
  failed or blocked rows. The state sticks at `saving` until a conflict is resolved by hand.

The same thing shows in a2: `failed` followed by `saving`.

### (d) Receivers see intermediate orders

Steps: David drags t09 to the top. That is 10 single-row writes. Daniel's device watches.

Outcome:
- Daniel's Dexie (what the grid renders) passed through 11 distinct order sequences. 9 of them had
  two rows on one order, for example `t00:0,t09:0,…` and then `t09:0,t00:1,t01:1,…`.
- Listener codes: `snapshot-listener:applied ×10`.

**Mechanism:**
- The engine commits one row per adapter call, serially (`drainOnce`).
- Each commit is a separate Firestore write, so the listener delivers each one as its own snapshot.
- The receiver renders every intermediate state, sorted by order and then id, and tied rows swap as
  each write lands.

On the phone and in Perform this "jumping" is visible only for `po` receivers today, because of
(c).

## Root causes, in short

1. **The listener query has no `orgId` filter**, so every non-`po` user's listener is denied. This
   is (c), and it makes (e) worse: blind editors write against stale stamps.
2. **A reorder is N independent row writes** with per-row preconditions and no atomic batch. This
   causes (d) and the partial, duplicated or gapped orders in (e) and a2.
3. **Failed outbox rows are terminal and absorbing.** The doc is frozen against the listener and
   against reload, later edits queue behind them forever, and local rows the server removed are
   never pruned. This causes (c-2), (a2) and the divergence in (e).
4. **`DRAIN_STARTED` overwrites `conflict`/`failed`**, and `DRAIN_OK` needs an empty outbox. This
   causes (b).
5. **`undefined` field values reach the Web SDK** (no `ignoreUndefinedProperties`; `{bpm: undefined}`
   patches merge into Dexie and are copied by Duplicate). Writes dead-letter as "transient", while
   neighbouring rows commit. This causes (a1).

No fixes were attempted.
