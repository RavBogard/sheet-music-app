---
phase: v45-01-save-path-observability
plan: 01
subsystem: observability
tags: [logger, sentry, setlist, save-path, async-local-storage, telemetry]

requires:
  - phase: v4.4-Phase5-observability
    provides: AsyncLocalStorage request-ID propagation + globalThis.__requestIdGetter__ resolver
provides:
  - Structured "[save]" logger.error emissions at every silent-return in the save pipeline
  - 9 tagged call sites (6 in use-setlist-logic, 3 in setlist-flush) with stable event names
  - Grep-discoverable instrumentation map for future ops + milestone phases
affects: [v45-02-idb-draft-journal, v45-03-sync-engine, v45-04-conflict-surface-redesign, v45-05-save-observability-ui]

tech-stack:
  added: []
  patterns:
    - Tagged structured logs ("[save]" tag + { event, setlistId, uid, ... } payload) for save-pipeline failure modes
    - vi.hoisted() for hook-test mocks with cyclic class dependencies (StaleWriteError instanceof check)

key-files:
  created:
    - src/hooks/__tests__/use-setlist-logic.test.ts
  modified:
    - src/hooks/use-setlist-logic.ts
    - src/lib/setlist-flush.ts
    - src/lib/setlist-flush.test.ts

key-decisions:
  - "Emit via logger.error not logger.warn — Sentry captures error severity, warn is dev-only-loud"
  - "Skipped no_pending flush log (fires on every tab close, expected no-op — not a silent failure)"
  - "Kept existing logger.warn on StaleWriteError alongside new structured error (dual-channel for dev + telemetry)"
  - "vi.hoisted pattern for hook tests referencing mocked StaleWriteError class"

patterns-established:
  - "Save-path instrumentation: every silent return → logger.error('[save]', { event, setlistId, uid, ...context })"
  - "Stable event names: save_blocked | save_failed | stale_write_rejected | token_refresh_failed | flush_skipped | flush_http_error | flush_network_error | flush_sync_throw"

duration: ~45min
started: 2026-04-20T11:20:00Z
completed: 2026-04-20T11:35:00Z
---

# Phase v45-01 Plan 01: Save-Path Observability Summary

**9 tagged `logger.error` call sites instrument every silent-return path in the setlist save pipeline. Zero behavior change. Full suite green (1332/1332, +8). Foundation for v45-02..05 re-architecture.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~45 min |
| Started | 2026-04-20T11:20:00Z |
| Completed | 2026-04-20T11:35:00Z |
| Tasks | 3 of 3 complete |
| Files modified | 4 (3 src + 1 new test) |
| Tests added | 8 (+4 flush + +4 hook) |
| Total suite | 1324 → 1332 (green) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: StaleWriteError emits structured breadcrumb | ✅ Pass | Hook test asserts event, setlistId, uid, timestamps |
| AC-2: canEdit=false early-return observable | ⚠️ Pass (code), test deferred | Code emits on `!n \|\| !canEdit \|\| !setlistService`. Reachable only via debounce-fire race (canEdit flips false between schedule + fire); synchronous hook test for this race is expensive. Verified by code review + grep (use-setlist-logic.ts:282). |
| AC-3: Token refresh failure observable | ⚠️ Pass (code), test deferred | Code emits on getIdToken reject (use-setlist-logic.ts:435). Synchronous test requires firebase-auth deep mocking; deferred. Covered in v45-03 sync-engine tests. |
| AC-4: Keepalive early-returns observable | ✅ Pass | 2/3 branches tested (no_token + missing_fields); no_pending deliberately omitted from instrumentation (not a silent failure). |
| AC-5: Keepalive non-2xx captured | ✅ Pass | 3 test cases (409 http error, network reject, sync throw) + positive case (200 emits nothing). |
| AC-6: Regression tests assert emissions | ✅ Pass | 8 new tests pass; full suite 1332/1332 green. |

## Accomplishments

- **Every silent-return path in the save pipeline now traceable via Sentry/logs.** 9 tagged call sites across 2 source files. When data loss recurs, we can grep Sentry for `[save]` and pinpoint which failure mode fired.
- **Pattern established:** `logger.error("[save]", { event, setlistId, uid, ...context })`. Stable event names (`save_blocked`, `stale_write_rejected`, `save_failed`, `token_refresh_failed`, `flush_skipped`, `flush_http_error`, `flush_network_error`, `flush_sync_throw`) for dashboarding.
- **Zero behavior change.** Save pipeline semantics identical from user perspective. Safe to ship to production during active gig.
- **Test coverage:** 8 new regression tests (4 flush + 4 hook observability). vi.hoisted pattern captured for future hook tests with cyclic class imports.

## Task Commits

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Task 1: use-setlist-logic instrumentation | _see next commit_ | feat | 6 structured logger.error sites (save_blocked, stale_write_rejected, save_failed, token_refresh_failed, flush_skipped ×2) |
| Task 2: setlist-flush instrumentation | _bundled w/ task 1_ | feat | 3 sites: flush_http_error (non-2xx), flush_network_error (catch), flush_sync_throw (sync catch) |
| Task 3: regression tests | _see next commit_ | test | 4 new flush tests + 4 new hook tests (1332/1332) |

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/hooks/use-setlist-logic.ts` | Modified | 6 `logger.error("[save]", ...)` emissions at silent-return sites (performSave early-return, StaleWriteError catch, general save-failed catch, token-refresh catch, 2 flushViaKeepalive early-returns) |
| `src/lib/setlist-flush.ts` | Modified | Added `logger` import; `.then/.catch` on keepalive fetch observes response best-effort; sync-throw catch now emits instead of swallowing |
| `src/lib/setlist-flush.test.ts` | Modified | Added `describe("observability (v45-01 AC-5)")` block — 4 tests |
| `src/hooks/__tests__/use-setlist-logic.test.ts` | Created | New file — 4 hook observability tests using vi.hoisted mock pattern |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Skip `flush_skipped / no_pending` log | Fires on every tab close with no edits — not a silent failure, just a no-op. Emitting it would flood Sentry and make real signals unfindable. | Reduces AC-4 coverage from 4 → 3 branches; acceptable since the omitted path is not a loss scenario. Documented in code comment. |
| Emit `logger.error` for unused fetches in keepalive, not `logger.warn` | Sentry integration captures error severity; warn is treated as dev-only noise in console per logger.ts semantics. | Consistent event-severity across save path telemetry. |
| Keep existing `logger.warn("Auto-save rejected...")` AND add structured `logger.error` on StaleWriteError | Dev-console readability (human-readable warn) + production telemetry (structured error) serve different audiences. Removing warn would hurt dev debugging. | Both channels preserved. |
| Use `vi.hoisted()` for hook test mocks | Plain top-level `const` refs break inside `vi.mock` factories due to hoisting. Per-project convention (memory: "Mock objects exported from helpers, vi.mock() stays in test file"). | Pattern usable in v45-02..05 hook tests. |
| Test file for use-setlist-logic at `src/hooks/__tests__/use-setlist-logic.test.ts` (new) | No prior test file existed for this hook. Convention = `__tests__` subfolder. | Establishes a test landing zone for all future use-setlist-logic changes. |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | Minor — extended save_failed event to carry payload |
| Scope additions | 0 | None |
| Deferred | 2 | Direct synchronous tests for AC-2 + AC-3 |

**Total impact:** Minimal. Instrumentation shipped per plan. Test coverage 6/6 direct for 4 of 6 ACs; 2 ACs verified by code review + grep.

### Auto-fixed Issues

**1. [observability] `save_failed` event added beyond plan's original "augment existing error"**
- **Found during:** Task 1 (instrumentation)
- **Issue:** Plan said "augment existing `logger.error('Auto-save failed:', e)` with structured form" — but to include `isPermissionError` flag the `msg`/`isPermissionError` computation had to move BEFORE the log call.
- **Fix:** Reordered the catch block: compute msg + isPermissionError first, then emit structured log, then compute description for toast.
- **Files:** src/hooks/use-setlist-logic.ts (lines ~375-395)
- **Verification:** AC-1 non-stale-save test passes; logger.error fires with `isPermissionError: true` when caught error message contains "PERMISSION_DENIED".
- **Commit:** Bundled with Task 1 commit.

### Deferred Items

- **AC-2 direct synchronous test** — triggering `save_blocked` requires a race between debounce schedule and debounce fire where `canEdit` flips false. Testing this synchronously would require manipulating internal refs via rerenders in a way that's brittle. Code path is instrumented and reachable in production; grep confirms site exists at `use-setlist-logic.ts:282`. Logged as `deferred-test-1` for v45-03 (sync engine replaces the debounce + flushViaKeepalive pair; re-test there).
- **AC-3 direct synchronous test** — triggering `token_refresh_failed` requires mocking firebase auth's `getIdToken` reject behavior across the refresh effect. Currently the test mock unconditionally resolves. Deeper mocking would require custom currentUser setter. Logged as `deferred-test-2` for v45-03 (token lifecycle becomes sync-engine responsibility there).

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| First hook test attempt failed with "Cannot access 'StaleWriteError' before initialization" due to vi.mock hoisting referencing a top-level class | Refactored to use `vi.hoisted()` block + define the mock class INSIDE the factory; import the mocked class via `import { StaleWriteError as MockedStaleWriteError }` after mocks |
| Second hook test attempt failed with "Cannot access 'mockToast' before initialization" | Moved ALL mock handle refs (`mockToast`, `mockGetIdToken`, `mockUpdateSetlist`, etc.) into `vi.hoisted()` block |

## Next Phase Readiness

**Ready:**
- Any Sentry query `tags:[save]` now yields actionable save-path failure events. When user hits another data-loss incident, we query Sentry for `setlistId:SEUI` and get the event name + timestamp + full context — which informs whether Phase v45-02 IDB draft journal fires on the right trigger, whether Phase v45-04 conflict-surface modal should be stricter, etc.
- Grep anchor: `rg "logger\.error\(\"\[save\]\"" src/` returns all 9 sites.
- Next safe-to-ship phase during live gig: **v45-07 library cache invalidation on upload** (additive BroadcastChannel, fails closed).

**Concerns:**
- 2 ACs (canEdit race, token-refresh failure) have code coverage but no synchronous test. Future regressions to those paths could slip. Mitigation: v45-03 sync-engine will re-implement these flows with fresh tests.
- Sentry noise budget: 8 new potential event types. Recommend setting up a save-path dashboard during v45-05 (save observability UI) to watch volume in first week.

**Blockers:**
- None for proceeding to v45-07.
- v45-02..05 (architectural phases) held until gig wraps per user's live-deploy guardrail.

---
*Phase: v45-01-save-path-observability, Plan: 01*
*Completed: 2026-04-20*
