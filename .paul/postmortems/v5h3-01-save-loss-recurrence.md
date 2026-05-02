# Postmortem — v5h3 Save-Loss Recurrence (Phantom VersionMismatch)

**Date:** 2026-05-02
**Author:** Rabbi Daniel + PAUL session
**Severity:** P0 (data corruption symptom: phantom reconciliation modal mid-edit on single-user iPad; affected user count: 1 — Daniel; band not yet onboarded)
**Status:** RESOLVED
**Phase:** v5h3-01 (4 plans: v5h3-01-01 research+diagnose, v5h3-01-02 auto-capture instrumentation, v5h3-01-03 H-SL-7 fix, v5h3-01-04 this postmortem)
**Final commit:** `36e9fa1` · **Suite:** 1528 → 1560 · **Production data corruption:** 0 confirmed

Companion artifacts: [v5h3-01-01-SUMMARY](../phases/v5h3-01-save-loss-recurrence/v5h3-01-01-SUMMARY.md) · [v5h3-01-02-SUMMARY](../phases/v5h3-01-save-loss-recurrence/v5h3-01-02-SUMMARY.md) · [v5h3-01-03-SUMMARY](../phases/v5h3-01-save-loss-recurrence/v5h3-01-03-SUMMARY.md) · [v5h3-01-save-loss-recurrence-investigation.md](v5h3-01-save-loss-recurrence-investigation.md) · parent postmortem [v5h-01-save-loss.md](v5h-01-save-loss.md)

---

## TL;DR

v50-06-02's reconciliation modal ("Keep mine / Take theirs") was firing for SINGLE-USER rapid same-doc edits on Daniel's iPad. Root cause: engine writeback updated the entity row's server-stamped `updatedAt` but did NOT thread the new `updatedAt` into pending outbox rows for the same `(collection, docId)`. Rapid same-doc Edit-2 (queued before Edit-1's writeback completed) carried a STALE `expectedUpdatedAt`; the Firestore transaction precondition failed; engine raised `VersionMismatchError`; FSM transitioned to `conflict`; the modal opened. v50-06-02's contract was correct under sane threading; threading itself was the unaudited substrate-level bug. v5h3-01-01 code-scan ruled out 3 of 6 hypotheses (H-SL-2/3/4 definitive); 3 stayed open (H-SL-1/5/6) pending production evidence; HUMAN-ACTION DEFERRED per Daniel ("I've already refreshed" + "continue autonomously"). v5h3-01-02 shipped Round-2 Option B auto-capture instrumentation (Sentry breadcrumbs at 5 hot write paths + IndexedDB `edit_log` + upload-on-mount). **Mid-instrumentation-build, Daniel reported the reconciliation-modal symptom.** That single sentence ("Keep mine / Take theirs... EVEN THOUGH I AM THE ONLY ONE") pivoted diagnosis from "6 hypotheses, wait for next recurrence" → "H-SL-7 HIGH confidence, ship the fix today." v5h3-01-03 shipped the fix at `36e9fa1`: engine writeback now threads server `updatedAt` into pending outbox rows for the same doc, atomic with existing writeback; v50-06-02 reconciliation contract preserved (AC-3 explicit test using `FailNthCallAdapter` for genuine multi-writer). The kitchen-sink fast-check harness (v50-07-04) didn't catch H-SL-7 for the same reason it didn't catch v5h-01: in-memory zero-latency adapters never produced rapid-same-doc-edit-with-stale-`expectedUpdatedAt` sequences. The harness-fidelity gap from v5h-01 §5 action item #2 is now twice-implicated; this postmortem escalates it from "opportunistic" → "binding gate" before the next data-flow phase ships (codified in PROJECT.md by Task 2 of this plan).

---

## Timeline

| Date | Event |
|------|-------|
| 2026-04-27 | v5h-01 phase ✅ COMPLETE (4 plans). v5.0-hotfix milestone closed pending UAT. v5h-01-04 postmortem published; Action Item #2 (kitchen-sink remediation: Firebase emulator + RTL editor↔perf-view test pair) framed as "Owner: Rabbi Daniel. Target: opportunistic during v5.1 OR before next major cutover." |
| 2026-04-27 → 2026-05-02 | v5.1 (4 phases) + v5.2 (5 phases) ship. Daniel-loop UAT discipline codified in v51-04 + PROJECT.md §UAT Discipline. Five weeks elapse without harness-fidelity remediation; no cutover-shaped phase intervened so the deferral never came due. |
| 2026-05-02 morning | Daniel iPad UAT during v53-01 synthesis surfaces save-loss recurrence symptom on a fresh setlist ("some edits saved, some didn't"). v5.3 milestone is rescoped to insert a v5h3-01 hotfix BEFORE v53-02..04 (rescope decisions in STATE.md). |
| 2026-05-02 | v5h3-01-01 PLAN: research + reproduce + diagnose. HUMAN-ACTION checkpoint (iPad inspection: IndexedDB outbox + Web Inspector console + Network tab + Sentry filter) DEFERRED per Daniel ("I've already refreshed" + "continue autonomously"). Code-scan only path. |
| 2026-05-02 | v5h3-01-01 APPLY: 6-hypothesis code-scan. H-SL-2 (sticky-memory writes-songs-not-tracks), H-SL-3 (`clearFailedOutboxRows` mid-FSM race), H-SL-4 (`config/defaults` pump-capacity contention) RULED OUT definitively by code path. H-SL-1 (TextCell single-tap-to-edit blur/commit race), H-SL-5 (auth-claim staleness redux), H-SL-6 (different bug entirely) STILL OPEN. Anti-pattern audit PASSES — all 12 v5h-01 fixes intact (rules + LWW guards + outbox-pending guard + writeback atomicity + Sentry capture). Round-2 decision checkpoint: Daniel selects Option B (auto-capture instrumentation only). v5h3-01-01 LOOP COMPLETE. Investigation written to `.paul/postmortems/v5h3-01-save-loss-recurrence-investigation.md`. |
| 2026-05-02 | v5h3-01-02 PLAN: auto-capture instrumentation (Sentry breadcrumbs at 5 hot sites + IndexedDB `edit_log` table + upload-on-mount). autonomous=true, type=execute. Dispatched to dan-executor agent. |
| 2026-05-02 | v5h3-01-02 APPLY in progress; **Daniel reports MID-EXECUTION via UAT message:** *"I'm in the middle of making setlists right now and having the terrible bugs around saving. it seems to be related to the 'keep mine' vs 'take theirs' things.... EVEN THOUGH I AM THE ONLY ONE USING THE SETLIST OR EDITING IT. Super terrible bug. this has to get fixed."* That single sentence is high-signal: the v50-06-02 reconciliation modal only fires on `VersionMismatchError`; single-user context = phantom conflict. NEW H-SL-7 enters the hypothesis matrix at HIGH confidence (expectedUpdatedAt threading stale across rapid same-doc edits); H-SL-8 enters at MEDIUM-HIGH (snapshot-listener delivery bumps local.updatedAt between edit-prep and edit-commit). Investigation doc updated with NEW EVIDENCE section + re-ranked matrix. |
| 2026-05-02 | v5h3-01-02 lands at `1d8d94c` (29 new tests; +313/-9 source LOC; 4 created files + 7 modified). Pushed `origin master`. Vercel auto-deploys instrumentation. |
| 2026-05-02 | v5h3-01-03 PLAN written WHILE v5h3-01-02 deploy propagates. Engine writeback now threads expectedUpdatedAt into pending outbox rows for same doc, atomic with existing writeback, `status === 'pending'` filter, same-`collection`+same-`docId` filter. AC-3 explicit test for v50-06-02 reconciliation contract preservation (FailNthCallAdapter throws VersionMismatchError on Nth call → outbox row failed → state='conflict' → contract intact). |
| 2026-05-02 | v5h3-01-03 APPLY: dispatched to dan-executor. 28 source LOC + 387 test LOC; commit `36e9fa1` lands first try; Suite 1557 → 1560. Pushed `origin master`. v50-06-02 contract preserved (AC-3 test). |
| 2026-05-02 | v5h3-01-03 LOOP COMPLETE. Phase v5h3-01 at 75% (3 of 4 plans). Daniel resumes editing post-Vercel-deploy; phantom reconciliation modal stops firing for single-user rapid same-doc edits. |
| 2026-05-02 (this plan) | v5h3-01-04 postmortem + harness-fidelity gate codification. Time-to-resolution: ~3h end-to-end on 2026-05-02 from initial morning UAT signal to deployed `36e9fa1`; ~5h including instrumentation + this postmortem. |

---

## Root Cause

**Engine writeback did not thread server-stamped `updatedAt` into other pending outbox rows for the same `(collection, docId)`.** Rapid same-doc edits queued sequentially captured stale `expectedUpdatedAt` values; the Firestore transaction precondition failed on Edit-2; the engine surfaced `VersionMismatchError`, the FSM transitioned to `conflict`, and the v50-06-02 reconciliation modal opened in single-user context.

### The threading path

1. **Editor cell-commit:** `DropdownCell.commit` / `TextCell.commit` fires `onCommit(draft)` → grid handler invokes `applyEdit('update', 'tracks', { docId, patch, expectedUpdatedAt: row.updatedAt })`. `row.updatedAt` is the value from `useLiveQuery` at render time — i.e., the local Dexie state at the moment React last re-rendered.

2. **applyEdit:** writes Dexie outbox row with the captured `expectedUpdatedAt` and queues for engine drain (synchronous within the Dexie tx — outbox row is durable before the call returns).

3. **Engine drain (`engine.ts:199-298`):** `drainOnce` reads pending outbox rows in per-doc order, calls adapter `commitOutboxRow({ row, expectedUpdatedAt })`. Production Firestore adapter wraps in `runTransaction`: precondition `tx.get(docRef).data().updatedAt === expectedUpdatedAt`; on success, bumps `updatedAt` with `serverTimestamp()` and writes patch fields.

4. **Engine writeback (`engine.ts:259-282`):** on success, opens `db.transaction('rw', db.outbox, db[collection], ...)` → deletes the just-drained outbox row + puts the entity row with the new server-stamped `updatedAt`. Atomic.

### The gap (H-SL-7)

The writeback updated the entity row but did NOT update OTHER pending outbox rows for the same `(collection, docId)`. If the user made a rapid second edit on the same row before Edit-1's writeback completed (or before `useLiveQuery` re-rendered with the new `updatedAt`), Edit-2's outbox row carried Edit-1's stale `expectedUpdatedAt` (whatever was last visible to React state at edit time).

### Failure mode

Engine drains Edit-2 → adapter `runTransaction` precondition fails (server's `updatedAt` is now Edit-1's server timestamp; outbox carries Edit-0's value) → `VersionMismatchError` → `engine.ts:309-316` marks the row `failed` with `lastError: "VersionMismatch"` + dispatches `DRAIN_VERSION_MISMATCH` → FSM → `conflict` → `ReconciliationProvider` opens modal. User clicks "Keep mine" → `engine.resolveConflict` reads the current local entity `updatedAt` → re-queues with fresh `newExpectedUpdatedAt` → succeeds. **The edit is preserved (no data loss); the modal IS the user-visible symptom.** Daniel saw the modal as the "terrible bug" — correctly so, since it surfaced as a save-correctness alarm in single-user context where the contract assumes another writer.

### The fix (`36e9fa1`)

v5h3-01-03 added one operation INSIDE the existing writeback transaction. After the entity put + before the tx commits:

```ts
// engine.ts (v5h3-01-03 addition, inside existing writeback tx)
if (result.updatedAt !== undefined && row.op !== 'delete') {
  // (existing) entity writeback
  await this.db[row.collection].put(merged);
  // (new in v5h3-01-03) pending-outbox expectedUpdatedAt threading
  await this.db.outbox
    .where('[collection+docId+status]')
    .equals([row.collection, row.docId, 'pending'])
    .modify({ expectedUpdatedAt: result.updatedAt });
}
```

Folded into the existing `if (result.updatedAt !== undefined && row.op !== 'delete')` gate (equivalent semantics, tighter writeback body). Filters: `status === 'pending'` only (never touch `sending` mid-flight or terminal `failed`); same-`collection` + same-`docId` only (cross-doc rows independent). Atomic with `outbox.delete` + `entity.put` — all three roll back together or commit together.

### Why v50-06-02's contract was correct

`VersionMismatchError` IS the right behavior for genuine concurrent multi-writer scenarios. v50-06-02 assumed sane `expectedUpdatedAt` threading; the threading itself was the unaudited substrate-level bug. v5h3-01-03 narrows VersionMismatch's trigger condition to genuine concurrent writes; the AC-3 explicit test (`FailNthCallAdapter` simulating a concurrent server-side write between two single-user edits) proves genuine-multi-writer scenarios STILL raise `VersionMismatchError` and STILL open the reconciliation modal. The fix does not weaken cross-writer safety.

---

## What Got Shipped

| Commit | Plan | Change |
|--------|------|--------|
| `1d8d94c` | v5h3-01-02 | **Auto-capture instrumentation.** Sentry breadcrumbs at 5 hot write paths: `TextCell.commit`, `DropdownCell.commit`, `applyEdit` success/error, `engine.drainOnce` success / `handleAdapterError` entry / dead-letter, `snapshot-listener` per-change post-tx. Dexie schema bump v2 → v3 (additive `edit_log: '++id, ts'` table only). `recordEdit` writes append-only FIFO-capped 500 rows; oldest evicted in-tx. `uploadRecentEditLog` fire-and-forget after `engine.start()` uploads breadcrumbs to Sentry; `clearUploaded(maxId)` after upload. No-PII discipline (forbidden-keys test enforces). All instrumentation calls `try/catch` + `logger.warn` (fail-soft; v50-07-05 precedent). 4 created files (`edit-log.ts`, `edit-log-upload.ts`, + 2 tests) + 7 modified. +313 / -9 source LOC. +29 tests (1528 → 1557). |
| `36e9fa1` | v5h3-01-03 | **Engine writeback expectedUpdatedAt threading fix (H-SL-7).** `engine.ts` +28 LOC inside existing writeback tx; folded with entity-writeback if-block under `result.updatedAt !== undefined && row.op !== 'delete'`. `property-failures.test.ts` +387 LOC: new "v5h3-01-03: pending-outbox expectedUpdatedAt threading" describe block with 3 cases — (1) rapid-same-doc edits → no VersionMismatch + outbox drains clean (proves fix); (2) genuine multi-writer (FailNthCallAdapter) → VersionMismatch raised + state='conflict' (proves v50-06-02 contract preserved); (3) cross-doc rows untouched (proves filter precision). Suite 1557 → 1560. |

Cross-link: research artifact at [`v5h3-01-save-loss-recurrence-investigation.md`](v5h3-01-save-loss-recurrence-investigation.md) — code-scan verdicts on the 6-hypothesis matrix, anti-pattern audit (12 of 12 v5h-01 fixes intact), mid-execution evidence section adding H-SL-7 (HIGH) + H-SL-8 (MEDIUM-HIGH).

---

## Lessons

### 1. Mid-execution UAT signals are worth pivoting on

Daniel's mid-build UAT message (*"Keep mine / Take theirs... I am the only one using the setlist"*) had MORE diagnostic value than the entire morning's code-scan. The reconciliation modal in single-user context is a HIGH-signal disambiguator: it categorically rules out save-loss-without-attempt (H-SL-1: edit never reaches Dexie), auth-error classes (H-SL-5: AuthError, not VersionMismatchError), and any class that produces silent failure rather than `VersionMismatchError`. It points directly at `expectedUpdatedAt` threading.

**Pattern:** when a UAT message arrives mid-execution, inspect for high-signal disambiguators BEFORE dismissing it as "after current plan ships." For v5h3 specifically, the message arrived ~30min into the v5h3-01-02 instrumentation build and pivoted the entire trajectory: instrumentation still shipped (still useful for FUTURE classes of save-loss the H-SL-7 fix won't cover) but the diagnosis no longer needed to wait for it. The plan-as-written had assumed Round-2 Option B's "deploy + wait for next recurrence" path; Daniel's message turned that into "deploy AND ship the targeted fix today" without losing the instrumentation's future value.

The Daniel-loop UAT discipline (codified v51-04, PROJECT.md §UAT Discipline) made this routing legible: the message wasn't an interruption, it was a checkpoint.

### 2. Daniel-loop UAT discipline validated for the SECOND time today

First validation: **morning UAT during v53-01 synthesis** surfaced the recurrence at all. Without it, v5h3-01 wouldn't have been opened — v53-02..04 would have planned around a hidden P0. Daniel's UAT against real production was the only diagnostic surface that detected the bug; the kitchen-sink harness was 1528/1528 green throughout.

Second validation: **mid-execution UAT pivoted v5h3-01-02 → v5h3-01-03** the same day. Without it, instrumentation would have shipped, then a wait-for-recurrence window would have opened (could be days/weeks; band might onboard during it), and the targeted fix would have landed later under more time pressure with stale plan context.

Both validations reinforce that real-iPad UAT against real production is the irreplaceable diagnostic surface for this app's data-flow class. The harness can prove invariants under its grammar; it cannot prove that the grammar covers the user's actual workflow. The discipline's stated trigger (every fix touching sync engine / Dexie / snapshot-listener / lazy-hydration / perf-view / editor cell-commit / Firestore rules) is correct; what changed today is the cadence — UAT signal can arrive BEFORE the fix is planned, not just after.

### 3. Harness-fidelity gap from v5h-01 §5 action item #2 is now twice-implicated; deferral was wrong

v5h-01-04 (see [v5h-01-save-loss.md](v5h-01-save-loss.md) §5 Action Item #2) framed the kitchen-sink remediation as: *"Owner: Rabbi Daniel. Target: opportunistic during v5.1 OR before next major cutover."* Five weeks passed; v5.1 + v5.2 + v53-01 all shipped without it. v5h3 was NOT a cutover (no new collections; no rules changes); it was a substrate-level threading bug in a path the kitchen-sink harness exercises every CI run. The harness still didn't catch it because the in-memory zero-latency adapter never produced the rapid-same-doc-edit-before-writeback-completes sequence with stale `expectedUpdatedAt`.

**The harness's edit-grammar is the gap, not just the rules layer or the perf-view path.** v5h3-01-03 added 3 regression tests at the existing harness level (still using the in-memory adapter — `CapturingTwoWriterAdapter` and `FailNthCallAdapter` are scope-local wrappers over `SharedRemote`); those tests caught the bug AFTER it surfaced from production but couldn't have caught it BEFORE because the grammar wasn't there to drive it. The remediation needs to expand harness fidelity in two dimensions:

- **Real-Firestore-semantics fidelity (Firebase Local Emulator Suite).** Runs real rules + auth + cache-then-fresh delivery + transaction precondition timing in-process during a subset of property iterations (e.g., 5 of 50 CI iterations). Addresses Gap A (rules layer) + Gap C (cache-vs-fresh races) from v5h-01 §Lessons.2. ~5-10s startup cost; per-suite time budget impact bounded by iteration subset.
- **Cross-view path coverage (thin RTL editor↔perf-view test pair).** Runs the editor cell-commit path AND `useSetlistPerformance` against the same in-memory Firestore + Dexie; asserts cross-view propagation invariant. Addresses Gap B (perf-view path divergence) from v5h-01 §Lessons.2. Cheap; reuses existing test seams (`SetlistGridHydrator`'s `applyEdit` test-seam prop; `use-setlist-performance.ts`'s `subscribe` test-seam prop).

The escalation from "opportunistic" → "binding gate" lives in PROJECT.md §Constraints (codified by Task 2 of this plan). The TL;DR: any future phase that touches data flow ships behind the harness-fidelity work or carries an explicit per-plan waiver under `<boundaries>` SCOPE LIMITS naming the v5.4 ticket. **The third deferral is what we are explicitly preventing.** Two production data-flow incidents in five weeks is the evidence; the gate converts the lesson into a structural enforcement surface.

### 4. Investigation document quality matters when HUMAN-ACTION is deferred

v5h3-01-01's investigation doc (research artifact, not this postmortem — see [`v5h3-01-save-loss-recurrence-investigation.md`](v5h3-01-save-loss-recurrence-investigation.md)) ruled out 3 of 6 hypotheses by code-scan alone, then captured the H-SL-7 hypothesis under "NEW EVIDENCE — 2026-05-02 (mid-instrumentation-build)" when Daniel's UAT message arrived. Without the rigorous code-scan + ruled-out matrix that preceded it, the H-SL-7 jump would have looked like a guess.

With it, the jump was traceable: Daniel's evidence ruled out the open hypotheses (H-SL-1 weakened to LOW because the modal proves the edit DID reach the engine; H-SL-5 ruled out because AuthError is a different code path entirely from `VersionMismatchError`; H-SL-6 "different bug" crystallized into named candidates H-SL-7 + H-SL-8). The matrix structure made the disambiguation auditable. The fix in v5h3-01-03 picked H-SL-7 over H-SL-8 because the v50-06-03 outbox-pending guard already covers the H-SL-8 path under sane conditions, and H-SL-7 explained the selective-failure pattern Daniel reported.

**Pattern:** when HUMAN-ACTION is deferred, the code-scan diagnostic doc IS the investigation surface — its quality determines how fast follow-up evidence can be triaged into a ranked candidate. The doc is a research artifact, separate from this postmortem; preserve both.

---

## Action Items

| # | Action | Owner | Target | Blocking? |
|---|--------|-------|--------|-----------|
| **1 (BINDING)** | Codify "Harness Fidelity Gate" in PROJECT.md §Constraints. Names the work (Firebase Local Emulator Suite integration + thin RTL editor↔perf-view cross-view propagation test). Names the blocking semantics (any future phase touching data flow ships behind harness-fidelity work OR carries explicit per-plan waiver under boundaries SCOPE LIMITS naming the v5.4 ticket). Cross-references v5h-01 §5 action item #2 (original deferral) + this postmortem (re-implication evidence). | Rabbi Daniel | This plan (v5h3-01-04 Task 2) | **YES** — gate is binding once codified. |
| 2 | Open v5.4 milestone with first phase scoped to harness-fidelity remediation: Firebase emulator integration in property-failures harness (covers Gap A + C) + thin RTL editor↔perf-view cross-view propagation test (covers Gap B). | Rabbi Daniel | At v5.3 milestone close (post-band-onboarding UAT cycle) | **GATES** v5.4+ data-flow phases per Action #1. |
| 3 | Daniel weekly worship cycle UAT against deployed fix (`1d8d94c` instrumentation + `36e9fa1` H-SL-7 fix) over 1-2 cycles. Validates phantom reconciliation modal stops firing AND that no DIFFERENT save-loss class surfaces (instrumentation auto-captures any new class via Sentry + IndexedDB `edit_log`). | Rabbi Daniel | Opportunistic during regular weekly use | **GATES** phase v5h3-01 close (treats phase as PENDING-UAT until Daniel signs off). |
| 4 | If instrumentation captures a NEW save-loss class (H-SL-1 TextCell race, H-SL-8 listener-bumps-local race, or unidentified) during the UAT cycle, route to a follow-up plan in v5h3-01 phase per v51-04 rule. | Next `/paul:resume` session that processes the Sentry signal | Conditional on signal | Conditional. |
| 5 | (Cross-reference v5h-01 Action #5: codify 2-3-strikes architectural-rethink rule.) v5h3 did NOT exhibit a 2-3-strike pattern; the fix landed first try because v50-06-02 contract pre-existed and the fix was a substrate-level threading addition rather than a hook patch. v5h-01 Action #5 remains low priority; no escalation from this postmortem. | Rabbi Daniel | When a similar iteration cycle starts to repeat | No. |

---

## Deferred Items

| Item | Reason | Routing |
|------|--------|---------|
| **H-SL-1 — TextCell single-tap-to-edit blur/commit race** | Was NOT this incident's cause (post-evidence weakened to LOW because the modal proves the edit DID reach the engine — a "doesn't reach Dexie" race wouldn't surface VersionMismatch). STILL OPEN as a code-pattern concern. | v5h3-01-02 Sentry breadcrumb instrumentation now in production will catch it if it surfaces; route to follow-up plan in v5h3-01 phase per v51-04 if signal arrives. |
| **H-SL-8 — Snapshot-listener delivery bumps local.updatedAt between edit-prep and edit-commit** | MEDIUM-HIGH confidence at investigation time; NOT addressed by v5h3-01-03 fix. v50-06-03 outbox-pending guard SHOULD prevent it under sane conditions, but specific edge cases remain (listener-before-outbox-write ordering; cross-tab; initial delivery before first edit). | Watched by instrumentation; if surfaces, route to follow-up plan. Could also surface as a related class on real-Firestore harness (Action #2 work) once that lands. |
| **Snapshot-listener mounts in TWO places (editor + perf-view) when both views open simultaneously** | Carried over from v5h-01 deferred items. LWW guards make redundant writes no-ops; network traffic doubled in rare both-views-open case. | Accepted. Could be optimized later by lifting the listener to a layout-level singleton (one subscription per route). Low priority. |
| **Issue 2 — iPad key-picker UI** | Carried over from v5h-01. Distinct from save-loss class. | v5.1 UX overhaul handled most of this via v51-01 picker rework + v51-02 + v52-02 iPad focus + v52-03 SyncIndicator + v52-04 touch affordances. Any residual symptom routes via Daniel-loop UAT. |

---

## Appendix

| Metric | Value |
|--------|-------|
| Affected user count | 1 (Daniel; band not yet in production) |
| Production data corruption (confirmed) | 0 (modal preserved edits via "Keep mine"; user-visible UX symptom only — no lost edits) |
| Time-to-resolution | ~3h from morning UAT signal to deployed fix; ~5h end-to-end including instrumentation + this postmortem |
| Plans shipped | 4 (v5h3-01-01 research, v5h3-01-02 instrumentation, v5h3-01-03 fix, v5h3-01-04 this postmortem) |
| Suite at phase open | 1528/1528 (post-v52-05) |
| Suite at phase close | 1560/1560 (+32 across v5h3-01-02 +29 + v5h3-01-03 +3) |
| LOC delta across the phase | ~+715 source+tests (instrumentation +313/-9 source + test infra in v5h3-01-02; fix +28 source + +387 tests in v5h3-01-03; docs only this plan) |
| Files modified across the phase | `src/lib/sync/{engine.ts, sentry-capture.ts, init.ts, snapshot-listener.ts}`, `src/lib/sync/edit-log.ts` (new), `src/lib/sync/edit-log-upload.ts` (new), `src/lib/sync/__tests__/{property-failures.test.ts, edit-log.test.ts (new), edit-log-upload.test.ts (new)}`, `src/lib/local/{schema.ts, types.ts, write.ts}`, `src/lib/local/__tests__/schema.test.ts`, `src/components/setlist/grid/cells/{TextCell.tsx, DropdownCell.tsx}` |
| Final commits | `1d8d94c` (v5h3-01-02 instrumentation), `36e9fa1` (v5h3-01-03 H-SL-7 fix) |
| Hypothesis matrix at investigation time | 6 starting; 3 ruled out definitively (H-SL-2/3/4); 3 still open (H-SL-1/5/6) → after mid-execution evidence: H-SL-5 ruled out, H-SL-6 crystallized into H-SL-7 (HIGH) + H-SL-8 (MEDIUM-HIGH); fix targeted H-SL-7 only |
| Daniel-loop UAT validations on 2026-05-02 | 2 (morning surfaced recurrence; mid-execution pivoted plan) |

---

*Postmortem closes phase v5h3-01 (4 of 4 plans). Phase status PENDING-UAT until Daniel weekly worship cycle confirms fix holds. Then `/paul:audit-milestone v5.3` after v53-02..04 ship to close v5.3 milestone.*
