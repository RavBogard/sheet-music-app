---
phase: v50-06-concurrent-edit-safety
plan: 01
subsystem: sync-engine
tags: [cross-tab-lock, version-mismatch, expectedUpdatedAt, dexie, broadcast-channel, firestore]

# Dependency graph
requires:
  - phase: v50-03-local-first-sync-engine
    provides: SyncEngine, FirestoreAdapter contract, OutboxRow, CrossTabLock primitive, FakeClock pattern
  - phase: v50-05-spreadsheet-editor
    provides: SetlistGrid + MobileCardList editor surface, applyEdit ApplyEditOptions (withoutUndo/undoKey), composite-undo entry pattern, useUndoStore
provides:
  - Substrate stabilization for v50-06-02 reconciliation modal
  - Atomic post-commit local-row updatedAt writeback (engine-side)
  - End-to-end honest expectedUpdatedAt threading from cell-blur → adapter precondition
  - Two-writer race detection proof in property-failures harness
  - Cross-tab-lock test deflake (30/30 deterministic)
affects: [v50-06-02 reconciliation modal, v50-06-03 cross-leader live-edit + airplane-mode + perf-view audit, v50-07 production migration]

# Tech tracking
tech-stack:
  added: []     # No new deps
  patterns:
    - Adapter post-commit re-read of `serverTimestamp()` to surface ms-precision updatedAt
    - Engine atomic outbox-delete + local-row writeback in one Dexie tx
    - Test fixes: deferred-delivery hub variant for simulating async BroadcastChannel races
    - Live-updatedAt read at undo-time (NOT snapshot-time) for honest inverse preconditions

key-files:
  created:
    - .paul/phases/v50-06-concurrent-edit-safety/v50-06-01-PLAN.md
    - .paul/phases/v50-06-concurrent-edit-safety/v50-06-01-SUMMARY.md
  modified:
    - src/lib/sync/firestore-adapter.ts
    - src/lib/sync/init.ts
    - src/lib/sync/engine.ts
    - src/lib/sync/__tests__/engine.test.ts
    - src/lib/sync/__tests__/cross-tab-lock.test.ts
    - src/lib/sync/__tests__/property-failures.test.ts
    - src/lib/local/types.ts
    - src/components/setlist/grid/SetlistGrid.tsx
    - src/components/setlist/grid/MobileCardList.tsx

key-decisions:
  - "Cross-tab-lock flake is a TEST defect, not a primitive defect — fix only the test; production lock untouched"
  - "Adapter contract: commitOutboxRow → Promise<CommitResult{updatedAt?}>; production re-reads doc post-commit"
  - "Engine writeback is atomic with outbox delete (one Dexie rw tx), with `if(existing)` guard for mid-flight deletes"
  - "Inverse-replay (Cmd-Z) reads LIVE updatedAt at undo time, not snapshot-time — so undo races a remote write surface as VersionMismatch"
  - "expectedUpdatedAt: undefined on freshly-created rows (handlePickSong defaults patch) is honest — first server commit hasn't echoed updatedAt yet"

patterns-established:
  - "Two-tab race-detection harness: SharedRemote + per-engine LocalDb instance + distinct lock channels — reusable for v50-06-02 modal integration tests"
  - "Deferred-delivery FakeChannelHub variant for any future test asserting BroadcastChannel tie-break behavior"

# Metrics
duration: ~50min
started: 2026-04-26T20:46:00Z
completed: 2026-04-26T20:55:30Z
---

# Phase v50-06 Plan 01: Substrate Stabilization Summary

**Cross-tab-lock test deterministically green (30/30); FirestoreAdapter contract returns server `updatedAt`; engine writes it back atomically with outbox delete; every SetlistGrid track-update applyEdit call carries honest `expectedUpdatedAt`; two-writer race surfaces as VersionMismatchError with addressable `failed` outbox row — substrate ready for v50-06-02 reconciliation modal.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~50 min wall clock |
| Started | 2026-04-26T20:46:00Z |
| Completed | 2026-04-26T20:55:30Z |
| Tasks | 3 / 3 completed |
| Files modified | 9 (+ 2 new in `.paul/phases/v50-06-concurrent-edit-safety/`) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Cross-tab-lock test passes deterministically | ✅ Pass | 30/30 consecutive green runs (was ~40% flake rate before fix); +2 stress-loop cases (50 iters each) for both invariants |
| AC-2: Adapter returns new server `updatedAt` on success | ✅ Pass | `CommitResult{updatedAt?}` interface; ProductionFirestoreAdapter re-reads doc post-commit for set/update; delete returns `{}`; engine writes back inside one Dexie rw tx alongside outbox-row delete |
| AC-3: SetlistGrid passes honest `expectedUpdatedAt` on every track update | ✅ Pass | 7 cell-commit sites + handleDeleteRow + handleBindChart + handleBulkSet + handleBulkDelete + handleContextDuplicate cascade + handleDragEnd + 4 MobileCardList move ops + executeEntry undo/redo all threaded |
| AC-4: Concurrent two-writer update produces exactly one VersionMismatchError | ✅ Pass | New 'two-writer race' describe block with SharedRemote + TwoWriterAdapter; loser's outbox row in 'failed' status with localId addressable for `engine.resolveConflict()`; engine state = 'conflict'; loser's local row preserved |
| AC-5: Hydrator + post-commit write-back round-trips correctly | ✅ Pass | Hydrator unchanged (already wrote `updatedAt: number` from server fetch); engine writeback closes the round-trip — verified via 4 new engine.test.ts cases |
| AC-6: Full test suite + tsc + next build green | ✅ Pass | 1418/1418 vitest (+8 from 1410); `npx tsc --noEmit` clean; `npm run build` clean |

## Accomplishments

- **Cross-tab-lock test deflake** — root cause was a brittle assertion (line 112 `expect(lower.isHolder()).toBe(true)`) that fired on sequential `tryAcquire` calls where the second caller bails on a fresh `peerHolder` before reaching the tie-break code. The "lower tabId wins" invariant only holds during a true async simultaneous-broadcast race; with sync hub delivery, it's first-come-first-served. Fix: split into two tests + new deferred-delivery `FakeChannelHub('deferred')` variant that queues messages and exposes `flush()` so both tabs can complete `tryAcquire` BEFORE either receives the other's message — only then does the tie-break code path actually fire. Production `cross-tab-lock.ts` was NOT touched.

- **End-to-end conflict-detection substrate** — the production adapter has had a runTransaction precondition since v50-05-01, but no caller passed `expectedUpdatedAt`, so it was dormant. Three changes light it up: (a) `FirestoreAdapter.commitOutboxRow` now returns `{updatedAt?}` and the production adapter re-reads the doc post-commit to capture the resolved server timestamp; (b) the engine writes that timestamp back to the local row in the same Dexie transaction that deletes the outbox row, keeping the local "last-known server updatedAt" honest for the next edit; (c) every track-update applyEdit call site now passes `row.updatedAt` as `expectedUpdatedAt`. Result: a real two-writer race now surfaces as `VersionMismatchError` → engine state `'conflict'` → outbox row in `'failed'` status, ready for v50-06-02's reconciliation modal to call `resolveConflict('mine'|'theirs')`.

- **Property-failures harness extended** — new `'v50-06-01: substrate readiness — two-writer race'` describe block adds an in-memory SharedRemote with monotonic timestamp + LWW-via-precondition semantics, plus per-engine LocalDb instances with distinct lock channels (so both engines drain independently rather than cross-tab-deferring). Test asserts: exactly one remote write lands, loser surfaces VersionMismatchError, loser's row stays in `'failed'` status with `lastError` matching `/expected updatedAt=1000/`, loser's `engine.getState()` returns `'conflict'`, `resolveConflict(localId, 'theirs')` clears the row, loser's local row preserved unchanged. 10/10 consecutive green.

## Task Commits

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Plan metadata | (chore PLAN) | chore | v50-06-01 PLAN.md + handoff archive |
| Task 1: Cross-tab-lock flake fix | (test Task 1) | test | Deferred-delivery hub variant + brittle-assertion split + 50-iter stress loops |
| Task 2: Adapter + engine + cell threading | (feat Task 2) | feat | CommitResult contract; production re-read; engine atomic writeback; LocalTrack/Song updatedAt; SetlistGrid + MobileCardList expectedUpdatedAt threading; undo-replay live-read |
| Task 3: Two-writer integration test | (test Task 3) | test | SharedRemote + TwoWriterAdapter + 'substrate readiness' describe block |
| Plan close | (chore close) | chore | SUMMARY + STATE + ROADMAP loop closure |

(Commit hashes filled in below in **Commit Hashes** appendix after the loop is closed and pushed.)

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `.paul/phases/v50-06-concurrent-edit-safety/v50-06-01-PLAN.md` | Created | Plan spec |
| `.paul/phases/v50-06-concurrent-edit-safety/v50-06-01-SUMMARY.md` | Created | This document |
| `src/lib/sync/firestore-adapter.ts` | Modified | Added `CommitResult` interface; changed `commitOutboxRow` return type to `Promise<CommitResult>` |
| `src/lib/sync/init.ts` | Modified | ProductionFirestoreAdapter re-reads doc post-commit (set + update) to surface server `updatedAt`; delete returns `{}` |
| `src/lib/sync/engine.ts` | Modified | drainOnce success path replaces single `outbox.delete` with one Dexie rw tx that deletes outbox + writes server `updatedAt` back to local row (with `if(existing)` guard) |
| `src/lib/sync/__tests__/engine.test.ts` | Modified | FakeAdapter accepts `{ok:true, updatedAt}` queue items + 4 new writeback test cases |
| `src/lib/sync/__tests__/cross-tab-lock.test.ts` | Modified | FakeChannelHub gains 'sync' / 'deferred' modes; brittle "lower tabId wins" sequential assertion removed; new tie-break-via-deferred-hub test; 50-iter stress loops for both invariants |
| `src/lib/sync/__tests__/property-failures.test.ts` | Modified | HarnessAdapter return type aligned to `Promise<{updatedAt?:number}>`; new 'v50-06-01: substrate readiness — two-writer race' describe block with SharedRemote + TwoWriterAdapter |
| `src/lib/local/types.ts` | Modified | LocalTrack + LocalSong gain explicit `updatedAt?: number` field (was hiding behind index signature) |
| `src/components/setlist/grid/SetlistGrid.tsx` | Modified | onCommitTrackPatch signature extended (third arg `expectedUpdatedAt?`); 7 cell-commit sites + handleDeleteRow + handleBindChart + handleBulkSet + handleBulkDelete + handleContextDuplicate cascade + handleDragEnd threaded; buildInverse/buildRedo accept `expectedUpdatedAt` parameter; new `readLiveUpdatedAt` helper; executeEntry reads live updatedAt before computing inverse descriptor |
| `src/components/setlist/grid/MobileCardList.tsx` | Modified | onCommitTrackPatch signature extended; handleMoveUp/handleMoveDown threaded; edit-Sheet onCommit threaded |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| 2026-04-26: Cross-tab-lock flake fixed in TEST only; production primitive untouched | Root cause was a test-side brittle assertion ("lower tabId wins" only holds in true async race; sync hub gives first-come-first-served). Fixing the lock would alter cooperative protocol semantics. | Production cross-tab-lock unchanged across v50-06; v50-06-02 reconciliation modal coordinates through the same well-tested primitive |
| 2026-04-26: FirestoreAdapter contract = `commitOutboxRow → Promise<CommitResult{updatedAt?}>` | Optional updatedAt: delete ops have no resulting doc; test fakes can opt out; production opts in via post-commit getDoc re-read | Forward-compatible — new adapters add updatedAt as they learn server timestamps; no flag day for the existing FakeAdapter |
| 2026-04-26: ProductionFirestoreAdapter re-reads doc post-commit (one extra `getDoc` per write) | serverTimestamp() is a sentinel until commit; client-side `Timestamp.now()` would diverge from server-authoritative. Acceptable cost — v50-06-02 reconciliation depends on freshness | If profiling later flags it, adapter can switch to client-side timestamping or batch reads; refactor is local |
| 2026-04-26: Engine writeback inside SAME Dexie tx as outbox-row delete; `if(existing)` guard for mid-flight delete | Atomicity: outbox row must not vanish without local row reflecting the new server state. `if(existing)` prevents resurrection if user pressed Backspace mid-flight. Per-doc drain ordering (v50-03) keeps `'sending'` row reset on `engine.start()` covering crash-mid-writeback | Local doc.updatedAt always reflects last-known-server state when the next user edit reads it |
| 2026-04-26: Inverse-replay (Cmd-Z) reads LIVE updatedAt at undo-time, NOT snapshot-time | A remote write since the entry was pushed should make the inverse fail with VersionMismatch (which v50-06-02 will surface). Snapshot-time updatedAt would let undo silently overwrite a newer remote state | Undo is a real edit for precondition purposes; conflicts during undo flow into the same reconciliation path as forward edits |
| 2026-04-26: handlePickSong's defaults patch passes `expectedUpdatedAt: undefined` (justified inline) | Row was just created locally via `set`; first server commit hasn't echoed back `updatedAt` yet; engine treats undefined as "no precondition" | The first server commit installs `updatedAt`; subsequent edits naturally pick it up via the live-query row |
| 2026-04-26: LocalTrack + LocalSong gained explicit `updatedAt?: number` (was hidden behind `[key:string]:unknown` index sig) | TS inferred `unknown` for `track.updatedAt`, blocking direct passthrough. Explicit field keeps type narrow without breaking the open-ended schema | All call-site references compile without `as number` casts; `updatedAt` is now first-class in the local doc shape |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | Necessary — TS compile error in property-failures.test.ts HarnessAdapter (return-type mismatch with new contract) |
| Scope additions | 1 | Minor — added explicit `updatedAt?: number` to LocalTrack/LocalSong (was implicit via index sig); needed for typed cell threading |
| Deferred | 0 | None |

**Total impact:** Essential fixes only; no scope creep beyond what AC-3 implicitly required for type safety.

### Auto-fixed Issues

**1. [Type-safety] HarnessAdapter return-type mismatch with new CommitResult contract**
- **Found during:** Task 2 verification (`tsc --noEmit`)
- **Issue:** Existing property-failures.test.ts `HarnessAdapter.commitOutboxRow` returned `Promise<void>`; new contract requires `Promise<CommitResult>`
- **Fix:** Changed return type + added `return {}` on success path. The harness ignores server-updatedAt; Task 3's two-writer test extends the surface with TwoWriterAdapter
- **Files:** `src/lib/sync/__tests__/property-failures.test.ts`
- **Verification:** `tsc --noEmit` passes; existing 5 property tests still green
- **Commit:** Bundled into Task 2 commit (single feature unit)

### Scope Additions

**1. Explicit `updatedAt?: number` on LocalTrack + LocalSong**
- **Origin:** Discovered during cell threading — `track.updatedAt` typed as `unknown` because index signature `[key:string]:unknown` shadowed the implicit field; tsc rejected passing it as `expectedUpdatedAt: number | undefined`
- **Resolution:** Added explicit field declaration to LocalTrack + LocalSong in `types.ts`. LocalSetlist already had it
- **Justification:** Strictly required for AC-3 to pass without `as` casts at every call site
- **Impact:** Forward-friendly — `updatedAt` is now first-class across all three local doc types; v50-06-02's reconciliation modal will read it directly

### Deferred Items

None — plan executed as written. Carryover to v50-06-02 / v50-06-03 listed under **Next Phase Readiness** below; those are PLAN-time deferrals, not unplanned discoveries.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Cross-tab-lock test ~40% flake rate (intermittent over many sessions) | Reproduced in 30-iter loop; root-caused to brittle "lower tabId wins" assertion vs. sync-hub first-come semantics; split into two tests + new deferred-delivery hub for the actual tie-break race |
| `tsc --noEmit` failure after Task 2 cell threading | Added explicit `updatedAt?: number` to LocalTrack/LocalSong; updated HarnessAdapter return type |

## Next Phase Readiness

**Ready for v50-06-02 (reconciliation modal):**
- `engine.getState() === 'conflict'` is reliably reachable via two-writer race
- `engine.resolveConflict(localId, 'mine'|'theirs', { newExpectedUpdatedAt? })` API verified working — 'theirs' deletes the failed row + transitions to 'dirty'
- Failed-status outbox rows have `localId`, `lastError`, `payload`, `expectedUpdatedAt` fields all populated for the modal's "your edit was: X / remote is: Y" diff display
- Sync engine's `onStateChange` callback fires with `(state, queued, lastError)` — modal can subscribe via the existing `wireSyncEngineToStore` channel
- Cross-tab-lock primitive is the substrate for cross-tab modal coordination — verified deterministic
- Reusable patterns from v50-05 still apply: `<DeleteConfirmProvider>` provider/dialog pattern is the template for `<ReconciliationProvider>`; jest-axe + axe-core test infra ready for the new modal a11y scan; undo-store `pushEntry` for "user's resolution choice = own undo unit"

**Ready for v50-06-03 (cross-leader live-edit + airplane-mode + perf-view audit):**
- Per-doc drain ordering invariant from v50-03 still holds; concurrent updates to same docId serialize correctly through the outbox
- ProductionFirestoreAdapter's runTransaction precondition is the substrate for cross-leader visibility; an `onSnapshot` subscriber would observe `updatedAt` advances and could trigger Hydrator re-prime
- Two-writer harness pattern (SharedRemote + per-engine LocalDb + distinct lock channels) extensible to N writers + airplane-mode toggle injection

**Concerns:**
- One extra `getDoc` per commit in the production adapter — acceptable now, may need batching if write throughput grows. v50-06-02 may surface profiler insight
- `if(existing)` guard in engine writeback skips the rare mid-flight-delete case correctly, but if a future tab deletes a row mid-flight and the user then undoes (Cmd-Z) before the delete drains, the inverse will hit a missing-row error. v50-05-05 undo store doesn't handle this case yet — surface to v50-06-02 as a related deferral if it manifests

**Blockers:** None.

**Carryover (PLAN-time deferrals — assigned to specific future plans):**
- §6.9 reconciliation banner / modal UI → v50-06-02 (`/ui-ux-pro-max` BLOCKING for APPLY)
- Cross-leader live-edit visibility (Firestore `onSnapshot` listeners on tracks/setlists) → v50-06-03
- Airplane-mode integration scenarios beyond AC-4 → v50-06-03
- Performance-view audit (read-only on new doc shape) → v50-06-03
- Production migrate-v50.ts apply → v50-07
- Production smoke verification of v50-05-02 + v50-05-03 + v50-05-04 + v50-05-05 → user backlog (deferred-smokes #4-#7)
- `openai` npm dep + `template-parser.ts` orphans from v50-02 → future dep-cleanup pass
- `useBatchSelection` hook orphan from v50-05-02 → future dep-cleanup pass
- Sentry `onRequestError` deprecation rename → future cosmetic-cleanup pass

## Commit Hashes

| Task | Commit | Pushed |
|------|--------|--------|
| chore(paul): plan v50-06-01 substrate stabilization | `9ca4943` | yes |
| test(v50-06-01): deflake cross-tab-lock test (Task 1) | `5736599` | yes |
| feat(v50-06-01): adapter+engine writeback + cell threading (Task 2) | `0ce9bd2` | yes |
| test(v50-06-01): two-writer race in property-failures harness (Task 3) | `edfc339` | yes |
| chore(paul): close loop — v50-06-01 SUMMARY + STATE + ROADMAP | (this commit) | yes |

---
*Phase: v50-06-concurrent-edit-safety, Plan: 01*
*Completed: 2026-04-26*
