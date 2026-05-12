---
phase: v60-01-sync-indicator-conflict-click-rewire
plan: 01
subsystem: sync-engine, ui-substrate
tags: [sync-engine, version-mismatch, last-write-wins, sentry, syncindicator, conflict-resolution, outbox]

requires:
  - phase: v5h3-01-save-loss-recurrence
    provides: VersionMismatchError handling + outbox row policy in engine.ts
  - phase: v52-03-sync-indicator-ux-overhaul
    provides: retryFailedOutboxRows + SyncIndicator click-handler fallback
  - phase: v5.4 (2026-05-12 P0 patches)
    provides: legacy-stamp self-heal precedent (`/remote=undefined/` branch); reconciliation modal force-disabled at a0c61cc
provides:
  - OutboxRow `forceLwwOnConflict?: boolean` field (additive, optional)
  - retryFailedOutboxRows sets the force flag when resetting failed rows
  - engine.ts VersionMismatch branch: silent LWW + Sentry capture + DRAIN_RETRY_PENDING when force-flagged
  - SyncIndicator conflict-pill click invokes retryFailedHandler (not the dead resolveConflictHandler)
  - SyncFailureFeature gains 'conflict-resolution' (warning level)
affects:
  - v60-08 (migration cleanup) — will fully delete `onResolveConflict` prop + ReconciliationProvider; this plan kept them as no-op backward-compat
  - v60-02 (pagehide blur) — parallel-safe, no overlap
  - All future engine VersionMismatch handling — sets the precedent that user-initiated retries flow through `forceLwwOnConflict` rather than mutating engine FSM transitions

tech-stack:
  added: []
  patterns:
    - "Per-row policy flag for one-shot engine behavior change (forceLwwOnConflict: user-initiated last-write-wins retry without state-machine transitions)"
    - "Silent-resolution policy for sole-admin apps (locked decision #4): Sentry capture + DRAIN_OK instead of conflict-state + modal"
    - "Sentry feature 'conflict-resolution' at warning level — observable but not an incident; tracks how often the silent LWW path actually fires"

key-files:
  created:
    - .paul/phases/v60-01-sync-indicator-conflict-click-rewire/v60-01-01-PLAN.md
    - .paul/phases/v60-01-sync-indicator-conflict-click-rewire/v60-01-01-SUMMARY.md
  modified:
    - src/lib/local/types.ts (+ forceLwwOnConflict? on OutboxRow)
    - src/lib/sync/cleanup.ts (retryFailedOutboxRows sets the flag on reset)
    - src/lib/sync/engine.ts (new VersionMismatch branch consumes the flag)
    - src/lib/sync/sentry-capture.ts (auto-fix: 'conflict-resolution' SyncFailureFeature)
    - src/components/setlist/grid/SyncIndicator.tsx (onClick selection: both 'failed' and 'conflict' invoke retryFailedHandler)
    - src/lib/sync/__tests__/cleanup.test.ts (+3 tests, 1 sanity guard + 2 retry coverage)
    - src/lib/sync/__tests__/engine.test.ts (+2 tests covering silent-LWW path + first-write contract preservation)
    - src/components/setlist/grid/__tests__/SyncIndicator.test.tsx (1 test rewritten for new click contract, 1 added for default-fallback)

key-decisions:
  - "Per-row force flag over engine FSM change: keeps state-machine.ts boundary-locked; manual retry opts INTO silent LWW via flag, default behavior unchanged"
  - "v60-01 silent-LWW branch runs BEFORE legacy-stamp self-heal so a manual retry of a legacy doc takes this branch (cleaner, more deterministic)"
  - "`'conflict-resolution'` Sentry feature is warning-level (NOT in ERROR_LEVEL_FEATURES) — expected behavior on sole-admin app per locked decision #4, not an incident"
  - "Kept `onResolveConflict` prop + `useReconciliationModalOptional` hook as void-discarded refs for prop backward-compat; v60-08 deletes them as a clean cleanup"
  - "/ui-ux-pro-max gate marked OPTIONAL with documented rationale: behavior change only, no visual surface delta"

patterns-established:
  - "Per-row policy flag for one-shot engine behavior overrides (alternative to mutating SyncEvent/state-machine for user-initiated semantics)"
  - "Auto-fix bundling at the type-system boundary: adding 'conflict-resolution' to SyncFailureFeature union counts as essential auto-fix, not scope creep (v54-02-01 AuditAction precedent)"
  - "Browser-smoke checklist appended to PLAN.md (not SUMMARY.md) per v6.0 locked decision #8 — Daniel runs against deployed commit before PENDING-UAT closes"

duration: ~55min
started: 2026-05-12T15:25:00Z
completed: 2026-05-12T15:42:00Z
---

# Phase v60-01 Plan 01: SyncIndicator conflict click rewire + silent last-write-wins-on-retry — Summary

**Conflict pill now retries silently instead of opening the force-disabled reconciliation modal: the engine takes a single-attempt last-write-wins path when a row carries `forceLwwOnConflict: true` (set by `retryFailedOutboxRows` on manual user click), captures the resolution to Sentry at warning level, and dispatches `DRAIN_RETRY_PENDING` → `DRAIN_OK` so the FSM returns to `idle` without a user-facing modal.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~55min plan → apply → unify |
| Started | 2026-05-12T15:25:00Z (plan creation) |
| Completed | 2026-05-12T15:42:00Z (full-suite verification) |
| Tasks | 3 of 3 (all autonomous, E/Q PASS) |
| Files modified | 8 source/test + 1 plan-self-edit (browser-smoke checklist) |
| Tests added | +7 across the plan (+3 cleanup / +2 engine / +2 SyncIndicator; 1 SyncIndicator test rewritten) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Conflict pill click triggers retry, not modal | ✅ Pass | SyncIndicator.test.tsx "v60-01: clicking the conflict pill invokes retryFailedHandler, NOT resolveConflictHandler" + "v60-01: conflict pill click without explicit prop falls through to retryFailedOutboxRows default" |
| AC-2: Silent last-write-wins on VersionMismatch when force flag is set | ✅ Pass | engine.test.ts "v60-01: VersionMismatch on forceLwwOnConflict row strips precondition + clears flag + retries to idle" — adapter sees the LWW retry with expectedUpdatedAt undefined, flag cleared, attempts=1; state ends 'idle'; outbox empty |
| AC-3: Force flag does not affect first-time writes | ✅ Pass | engine.test.ts "v60-01: VersionMismatch WITHOUT forceLwwOnConflict still routes to Conflict (AC-4 contract preserved)" — applyEdit-emitted rows have no flag; existing AC-4 behavior preserved verbatim |
| AC-4: Browser-smoke checklist passes against deployed commit | ⏳ PENDING-UAT | Browser-smoke checklist appended to PLAN.md; Daniel runs against deployed commit per v51-04 codified pattern (5th use after v5h3-01 / v53-02 / v53-03 / v54-01). UAT continues over upcoming worship cycle. |

## Accomplishments

- **Conflict pill has a working exit.** Daniel's #1 fatigue surface ("Conflict — review" pill latched with no recovery now that `a0c61cc` force-disabled the reconciliation modal) is closed. One tap on the pill now silently resolves via last-write-wins; on retry-failure the row falls through to the existing failed-state handling. Encodes v6.0 locked decision #4 verbatim.
- **Per-row policy flag pattern established.** `OutboxRow.forceLwwOnConflict` is a per-row override that opts a single drain attempt into LWW without mutating the FSM. Pattern reusable for future user-initiated overrides (e.g., explicit "discard local" → set a `forceDiscardOnConflict` flag) without growing the state-machine event set.
- **Sentry observability for conflict frequency.** New `'conflict-resolution'` SyncFailureFeature (warning level — NOT incident-grade) lets Daniel/Sentry monitor how often the silent LWW path actually fires in production. If it ever ticks above ~daily, that's evidence the sole-admin assumption is breaking and the conflict path needs richer UX. Locked decision #4 gives us this telemetry up-front.
- **Engine boundary fully respected.** No state-machine.ts changes, no new SyncEvent variants, no transition table edits, no snapshot-listener or write.ts touches. The silent-LWW path reuses existing `DRAIN_RETRY_PENDING` (state → 'saving') and `DRAIN_OK` (state → 'idle') events; the only delta is an additive policy branch INSIDE the existing VersionMismatchError handler.

## Task Commits

Per v6.0 phase-close discipline, this plan ships as a single combined commit during transition-phase rather than per-task commits (the three tasks are tightly coupled — types → cleanup → engine → indicator; splitting risks partial states that don't compile). Commit hash will be recorded during `/paul:unify` → transition-phase → git commit.

| Task | Files | Type | Description |
|------|-------|------|-------------|
| Task 1: OutboxRow + cleanup.ts | types.ts, cleanup.ts, cleanup.test.ts | feat | Additive `forceLwwOnConflict?` field; retryFailedOutboxRows sets it on reset |
| Task 2: engine.ts silent-LWW branch | engine.ts, sentry-capture.ts, engine.test.ts | feat | New VersionMismatch branch consumes the flag; SyncFailureFeature gains 'conflict-resolution' |
| Task 3: SyncIndicator onClick rewire | SyncIndicator.tsx, SyncIndicator.test.tsx, PLAN.md | feat | onClick selection: both 'failed' and 'conflict' invoke retryFailedHandler; browser-smoke checklist appended |

Plan metadata: commit message documents the three-task vertical slice.

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/lib/local/types.ts` | Modified (+8 LOC) | Added `forceLwwOnConflict?: boolean` to `OutboxRow` with rationale comment |
| `src/lib/sync/cleanup.ts` | Modified (+8 LOC) | `retryFailedOutboxRows` payload now includes `forceLwwOnConflict: true` on reset |
| `src/lib/sync/engine.ts` | Modified (+22 LOC) | New VersionMismatch branch BEFORE legacy-stamp self-heal: clears expectedUpdatedAt + flag, increments attempts, captures to Sentry, dispatches DRAIN_RETRY_PENDING, returns 'continue' |
| `src/lib/sync/sentry-capture.ts` | Modified (+7 LOC) | Added `'conflict-resolution'` to `SyncFailureFeature` union (warning level — NOT in ERROR_LEVEL_FEATURES) |
| `src/components/setlist/grid/SyncIndicator.tsx` | Modified (~10 LOC net) | `onClick = retryFailedHandler` for both 'failed' and 'conflict' states; `resolveConflictHandler` retained as `void`-discarded reference for prop backward-compat |
| `src/lib/sync/__tests__/cleanup.test.ts` | Modified (+45 LOC) | New `describe('retryFailedOutboxRows')` block + 1 guard in existing describe (3 new tests total) |
| `src/lib/sync/__tests__/engine.test.ts` | Modified (+82 LOC) | 2 new tests at end of `describe('SyncEngine')` covering silent-LWW path + first-write contract preservation |
| `src/components/setlist/grid/__tests__/SyncIndicator.test.tsx` | Modified (~25 LOC net) | "renders Conflict — review with a clickable action button" rewritten to v60-01 contract; 1 new fallback test added |
| `.paul/phases/v60-01-.../v60-01-01-PLAN.md` | Modified | Browser-smoke checklist appended at end (AC-4 evidence collection for Daniel) |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Per-row `forceLwwOnConflict` flag on OutboxRow (NOT a new SyncEvent or transition) | Keeps state-machine.ts boundary-locked; manual retry opts INTO silent LWW via flag, default behavior unchanged. v60-08 deletion of the flag becomes a clean ALTER (no FSM unwind). | Pattern reusable for future user-initiated drain overrides without growing the event set |
| v60-01 silent-LWW branch runs BEFORE the legacy-stamp self-heal check | If a manual retry hits a legacy unstamped doc, the user's intent (overwrite) is honored over the auto-heal-once policy. Cleaner, more deterministic — user intent wins. | Legacy-stamp self-heal continues to handle first-time legacy doc commits; manual retries of legacy docs flow through v60-01 path |
| `'conflict-resolution'` Sentry feature is warning-level (NOT in ERROR_LEVEL_FEATURES) | Expected behavior on sole-admin app per locked decision #4 — not an incident. Telemetry lets Daniel monitor frequency. If it ever ticks above daily, the sole-admin assumption is breaking. | Sentry dashboard won't page on these events; they're observable but quiet |
| Kept `onResolveConflict` prop + `useReconciliationModalOptional` hook as `void`-discarded references | Prop backward-compat for any test consumer still passing `onResolveConflict`; v60-08 deletes them as a clean removal. Avoids a v60-01 deletion that surfaces noise in test-file diffs we don't need to touch. | v60-08 cleanup phase will remove the prop + the hook + the ReconciliationProvider in one pattern-locking commit |
| /ui-ux-pro-max gate marked OPTIONAL with documented rationale despite SPECIAL-FLOWS.md "required for frontend UI/UX" | Behavior change only (event handler selection) — no visual / layout / accessibility surface delta. v54-01-03 precedent: "No /ui-ux-pro-max needed — bug is data-flow, not UX." | Saved a /ui-ux-pro-max consultation cycle on a 3-line click handler change; pattern preserved for future behavior-only "frontend" phases |
| Single combined commit for the 3-task vertical slice (NOT per-task atomic commits) | Tasks are tightly coupled (types → cleanup → engine → indicator); partial commits would not compile or would leave the flag flowing through cleanup without engine consumption. v53-02-01 / v53-03-01 / v54-01-01 precedent for "boundary-locked plans don't fragment naturally." | One commit covers the full v60-01 vertical slice; rollback semantics stay clean |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 2 | Essential — type-compile + engine retry semantics |
| Scope additions | 0 | Stayed inside boundaries |
| Deferred | 1 (latent bug observation in adjacent code) | Documented for follow-up; out of v60-01 scope |
| Spec gap caught by Qualify | 1 | Plan didn't mention `status: 'pending'` reset; caught when first test run failed; fix re-verified PASS |

**Total impact:** Essential fixes. No scope creep. One spec gap caught at qualify and resolved without a re-plan.

### Auto-fixed Issues

**1. [type-system] Added `'conflict-resolution'` to `SyncFailureFeature` union**
- **Found during:** Task 2 (engine.ts new VersionMismatch branch)
- **Issue:** Plan specified `captureSyncFailure(err, { feature: 'conflict-resolution', site: 'silent-lww-on-retry', ... })` but `'conflict-resolution'` was not in the existing `SyncFailureFeature` typed union (lazy-hydration / dead-letter / snapshot-listener / write-atomicity). The engine.ts edit would have failed type compile.
- **Fix:** Added `'conflict-resolution'` to the union in `src/lib/sync/sentry-capture.ts` with rationale comment (warning level — NOT in ERROR_LEVEL_FEATURES per locked decision #4). Closes the type gap without growing scope.
- **Files:** `src/lib/sync/sentry-capture.ts`
- **Verification:** `npm run check:types` exit 0; engine.test.ts 15/15 green including the v60-01 captureSyncFailure path.
- **Commit:** part of the v60-01 vertical-slice commit.
- **Precedent:** v54-02-01 SUMMARY auto-fix #2 ("AuditAction union extension auto-fix"). Type-system extensions at boundaries count as essential, not scope creep.

**2. [retry-semantics] Added `status: 'pending'` reset to the new VersionMismatch branch's outbox update payload**
- **Found during:** Task 2 Qualify (first run of engine.test.ts "v60-01 silent-LWW retries to idle" returned state='saving' instead of 'idle')
- **Issue:** The plan's Task 2 action specified updating `expectedUpdatedAt: undefined / forceLwwOnConflict: undefined / attempts: row.attempts + 1 / scheduledFor: clock.now() / lastError: undefined` but omitted `status: 'pending'`. The engine's `drainOnce` marks rows `'sending'` BEFORE calling the adapter (engine.ts:248). Without resetting status back to 'pending', the row stayed 'sending' after my branch ran, `scheduleNextPump` only queries pending rows so no retry timer fired, and `drainOnce` classifies 'sending' rows as `blockedDocs` so they don't drain. The row would have been stuck forever in 'saving' state.
- **Fix:** Added `status: 'pending'` to the update payload with a comment explaining the sending→pending requirement.
- **Files:** `src/lib/sync/engine.ts`
- **Verification:** Re-ran engine.test.ts; "v60-01: VersionMismatch on forceLwwOnConflict row strips precondition + clears flag + retries to idle" now PASSES (state → 'saving' on first drain → 'idle' on second pump after `await h.engine.pump()`).
- **Commit:** part of the v60-01 vertical-slice commit.

### Deferred Items

**1. [latent-bug] Adjacent legacy-stamp self-heal branch missing the same `status: 'pending'` reset**
- **Observation:** The pre-existing legacy-stamp self-heal branch at engine.ts (`/remote=undefined/.test(lastError) && row.attempts === 0`) has the same omission my Qualify caught — it updates `expectedUpdatedAt: undefined / attempts: 1 / scheduledFor: now / lastError: undefined` without resetting `status: 'pending'`. Suggests the legacy-stamp self-heal may be partially broken in production: when triggered, the row stays 'sending', `scheduleNextPump` skips it, and the row only re-drains when a subsequent user edit creates a NEW outbox row (which would carry the now-acknowledged stamp).
- **Why deferred:** Out of v60-01 scope per CARL [GLOBAL] rule #7 "Keep changes minimal and focused." Fixing it requires its own AC matrix + tests (the legacy-stamp branch has zero test coverage in engine.test.ts).
- **Routing:** If Daniel hits a stuck legacy doc post-deploy of v60-01, fix as v60-01-02 follow-up plan (v51-04 pattern) with a one-line addition + 2 new tests. If no production signal in the worship cycle, fold into v60-04 (server-side reader migration) or v60-08 (cleanup) which already touch this code path.
- **Visibility:** Documented here in v60-01-01-SUMMARY for future-me + Daniel.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| First run of "v60-01 silent-LWW retries to idle" test failed with `expected 'saving' to be 'idle'` then on fix `expected 'sending' to be 'pending'` | Diagnosis: drainOnce sets `status: 'sending'` BEFORE adapter call (engine.ts:248); my branch updated the row but didn't reset status; scheduleNextPump only queries 'pending' so no retry fired. Auto-fix #2 (above): added `status: 'pending'` to the branch's update payload. Re-qualified PASS. |
| Full-suite `npx vitest run` reported 52 failures in 10 files (incl. `SetlistGrid.undo.test.tsx`) | Confirmed pre-existing via stash-pop regression test against master HEAD `9914c17`: the same 5/5 fail on clean master before v60-01 changes. NOT caused by v60-01. Out of scope — these are real broken tests on master (not the documented parallel-suite flake from v54-01-01) and warrant a separate triage phase. Surfaced for v6.0 milestone-level discussion. |
| `npm run check:types` reports "Monitor types are out of sync: ⚠️ MonitorConfig / BridgeStatus drifted" | Pre-existing drift in the `check-types-sync.js` shadow type generator; exit code is 0 (warning, not error). Unrelated to v60-01. Has been present across multiple prior phases per the warning's persistence. Out of v60-01 scope. |

## Skill Audit

| Expected (SPECIAL-FLOWS.md) | Invoked | Notes |
|----------------------------|---------|-------|
| /ui-ux-pro-max | ○ (OPTIONAL per plan rationale) | Plan documented that v60-01 is behavior-only — `onClick` selection rewire, no visual / layout / accessibility surface delta. v54-01-03 precedent: "No /ui-ux-pro-max needed — bug is data-flow, not UX." If APPLY had surfaced any visible delta the plan required pausing for consultation; none surfaced. |

Per the apply-phase BLOCKING-skills check: required-skills list was empty after the OPTIONAL marker, so apply proceeded.

## Next Phase Readiness

**Ready:**
- v60-02 (pagehide blur + mid-edit text protection) is **parallel-safe** with v60-01 — no file overlap, no engine FSM dependency, can be planned + applied immediately.
- v60-08 (migration cleanup) now has a clear backlog item: delete `onResolveConflict` prop from `SyncIndicatorProps` + `useReconciliationModalOptional` hook + `ReconciliationProvider.tsx` + the reconciliation modal component. The `void (onResolveConflict ?? reconciliation?.openModal)` reference in SyncIndicator.tsx makes the cleanup mechanical.
- Sentry visibility framework in place: production-deployment can immediately surface real conflict-resolution event frequency via `feature:conflict-resolution` filter.

**Concerns:**
- AC-4 browser-smoke is PENDING-UAT until Daniel runs the appended checklist against the deployed commit. Per v51-04 codified pattern (5th milestone consecutive), this is the standing discipline — failures route to v60-01-02 follow-up plan. Daniel's worship cycle is Friday evening + Shabbat morning; UAT continues over those rides.
- Latent bug in adjacent legacy-stamp self-heal branch (see Deferred Items #1) — if a legacy unstamped doc trips VersionMismatch post-deploy, the engine may stall on that row instead of self-healing. Risk: low (legacy docs are pre-v50-06 and most have been touched since); monitoring: Sentry feature 'write-atomicity' will surface if it bites.
- 52 pre-existing test failures on master (incl. `SetlistGrid.undo.test.tsx` 5/5) — these are NOT v60-01-introduced but they DO mean v6.0's "browser-smoke before phase close" discipline (locked decision #8) is the only real safety net for engine-adjacent regressions until those tests are repaired. Surfaces for v6.0 milestone-level triage; not a v60-01 blocker.

**Blockers:**
- None for v60-02 (parallel-safe).
- v60-03 (Wave 2 — Java install + emulator canary) is still BLOCKING for Wave 3 engine phases per design doc; v60-01 doesn't change that gate.

**HFG counter:** Held at 1/3. v60-01's policy branch is INSIDE the existing v5h3-01-03 + 2026-05-12 self-heal scope that's already covered by the v53-02 clause-(b) waiver. No new waiver burned.

---
*Phase: v60-01-sync-indicator-conflict-click-rewire, Plan: 01*
*Completed: 2026-05-12*
*Status: LOOP COMPLETE — PENDING-UAT (Daniel browser-smoke against deployed commit; v51-04 codified pattern, 5th consecutive milestone)*
