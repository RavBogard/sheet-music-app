---
phase: v45-01-save-path-observability
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/hooks/use-setlist-logic.ts
  - src/lib/setlist-flush.ts
  - src/hooks/__tests__/use-setlist-logic.test.ts
  - src/lib/__tests__/setlist-flush.test.ts
autonomous: true
---

<objective>
## Goal
Instrument every silent-return path in the setlist save pipeline with a tagged `logger.error` call carrying structured context (setlistId, uid, reason, relevant state). No behavior change; pure observability.

## Purpose
Data loss on setlist **SEUI** during 2026-04-20 gig proved the save path can lose edits without leaving a trace. Root-cause analysis found ≥5 silent-return branches that swallow failures. Before we re-architect the save path (Phases v45-02..05), we need server-side evidence of which branch fires in the wild — both to validate the re-architect and to prove the current regression is caught post-fix.

This is the foundation phase: every subsequent architectural change gets measured against the telemetry this phase emits.

## Output
- 5 `logger.error` call sites added to `src/hooks/use-setlist-logic.ts` (currently silent returns / swallowed catches)
- 1 keepalive-response capture added to `src/lib/setlist-flush.ts` with best-effort non-2xx logging
- Regression tests asserting each tagged emission fires under its trigger condition
- Zero behavior change — save pipeline semantics identical
</objective>

<context>
## Project Context
@.paul/PROJECT.md
@.paul/ROADMAP.md
@.paul/STATE.md

## Root-cause analysis (from /paul:discuss-milestone 2026-04-20)
Five silent-return paths identified in the save pipeline:
1. `use-setlist-logic.ts:281` — `performSave` early-returns on `!n || !canEdit || !setlistService`
2. `use-setlist-logic.ts:351-358` — `StaleWriteError` catch: `logger.warn` only, no structured context
3. `use-setlist-logic.ts:437-465` — `flushViaKeepalive`: 3 early-return branches, all silent (no setlistId, no reason)
4. `use-setlist-logic.ts:413` — token-refresh catch: `/* keep previous token */` fully silent
5. `setlist-flush.ts:32-49` — keepalive fetch response ignored; synchronous throw silenced

## Source Files
@src/hooks/use-setlist-logic.ts
@src/lib/setlist-flush.ts
@src/lib/logger.ts
@src/app/api/setlist/flush/route.ts
</context>

<skills>
## Required Skills (from SPECIAL-FLOWS.md)

No frontend UI work in this phase — `/ui-ux-pro-max` not required.

| Skill | Priority | When to Invoke | Loaded? |
|-------|----------|----------------|---------|
| (none) | — | — | — |

</skills>

<acceptance_criteria>

## AC-1: StaleWriteError emits structured breadcrumb
```gherkin
Given the setlist auto-save path catches a StaleWriteError
When the catch branch runs
Then logger.error is called with tag "[save]" and an object payload containing
  { event: "stale_write_rejected", setlistId, lastSeenUpdatedAtMs, remoteUpdatedAtMs, uid }
```

## AC-2: canEdit=false early-return is observable
```gherkin
Given performSave runs but canEdit is false (or setlistService/name missing)
When the early-return executes
Then logger.error is called with tag "[save]" and payload
  { event: "save_blocked", setlistId, uid, reason: "canEdit"|"no_name"|"no_service" }
```

## AC-3: Token refresh failure is observable
```gherkin
Given idTokenRef refresh promise rejects (network / auth failure)
When the catch branch silently keeps the stale token
Then logger.error is called with tag "[save]" and payload
  { event: "token_refresh_failed", uid, error: <message> }
```

## AC-4: Keepalive-flush early-returns are observable
```gherkin
Given flushViaKeepalive is triggered during pagehide/beforeunload
When any early-return branch fires (no pending, missing id/name, missing token, !canEdit)
Then logger.error is called with tag "[save]" and payload
  { event: "flush_skipped", setlistId?, reason: "no_pending"|"missing_fields"|"no_token"|"no_canEdit" }
```

## AC-5: Keepalive fetch non-2xx is captured best-effort
```gherkin
Given sendKeepaliveFlush fires a fetch with keepalive:true
When the response resolves with status ≠ 2xx
Then logger.error is called with tag "[save]" and payload
  { event: "flush_http_error", status, setlistId }
And when the browser discards the response (navigation completed), absence is tolerated (best-effort only)
And when the fetch synchronously throws (oversized body), logger.error fires with event "flush_sync_throw"
```

## AC-6: Regression tests assert every emission
```gherkin
Given the new test suites run
When each AC-1..AC-5 trigger condition is simulated
Then vitest asserts logger.error was called with the correct tag + event + setlistId
And the full test suite (npm test) remains green
```

</acceptance_criteria>

<tasks>

<task type="auto">
  <name>Task 1: Instrument use-setlist-logic silent-return paths</name>
  <files>src/hooks/use-setlist-logic.ts</files>
  <action>
    Add five `logger.error` call sites. Every call uses the tag string "[save]" as first arg
    and a structured object as second arg. Do not change any control flow, return values, or
    user-visible behavior.

    1) performSave early-return (around line 281). Before the `return`, emit:
       logger.error("[save]", { event: "save_blocked", setlistId: id, uid,
         reason: !n ? "no_name" : !canEdit ? "canEdit" : "no_service" })

    2) StaleWriteError catch (lines 351-358). Keep the existing logger.warn,
       AND add a logger.error with structured context:
       logger.error("[save]", {
         event: "stale_write_rejected",
         setlistId: latestRef.current.setlistId,
         lastSeenUpdatedAtMs: lastSeenUpdatedAtRef.current?.toMillis() ?? null,
         remoteUpdatedAtMs: e.remoteUpdatedAt?.toMillis() ?? null,
         uid,
       })

    3) General catch in performSave (after StaleWriteError branch, before `toast.error`).
       This path ALREADY calls logger.error — augment its payload to structured form:
       logger.error("[save]", { event: "save_failed", setlistId: latestRef.current.setlistId,
         uid, isPermissionError, message: msg })

    4) Token refresh catch (line 413). Inside `catch`, before the `/* keep previous token */`:
       logger.error("[save]", { event: "token_refresh_failed", uid,
         error: err instanceof Error ? err.message : String(err) })
       The catch clause currently has no `err` binding — add `(err)`.

    5) flushViaKeepalive early-returns (lines 437-465). Add four emission points:
         - `!hasPendingSave.current` → logger.error("[save]", { event: "flush_skipped", reason: "no_pending" })
         - `!id || !n || !canEdit` → logger.error("[save]", { event: "flush_skipped",
             reason: "missing_fields", setlistId: id ?? null, hasName: !!n, canEdit })
         - `!token` → logger.error("[save]", { event: "flush_skipped",
             reason: "no_token", setlistId: id })
       Place each emission immediately before its respective `return`. Do not move the returns.

    Avoid: introducing any promise/await into these paths (keepalive handlers must stay sync);
    avoid importing Sentry directly (logger.error already flows to Sentry via console.error capture);
    avoid changing the existing logger.warn on StaleWriteError — keep it AND add the error.
  </action>
  <verify>
    npx vitest run src/hooks/__tests__/use-setlist-logic.test.ts 2>&amp;1 | tail -20
    (new tests from Task 3 must pass; no existing tests fail)
    npx tsc --noEmit 2>&amp;1 | head -20
    (zero errors)
  </verify>
  <done>AC-1, AC-2, AC-3, AC-4 satisfied — five logger.error call sites emit structured context at each silent-return</done>
</task>

<task type="auto">
  <name>Task 2: Capture keepalive flush response in setlist-flush</name>
  <files>src/lib/setlist-flush.ts</files>
  <action>
    Update `sendKeepaliveFlush` to observe the fetch response when the browser keeps it alive.
    Keep the function signature and return type unchanged (void). Keep fire-and-forget semantics.

    Concrete changes:
      - Chain a `.then(res => { if (!res.ok) logger.error(...) })` onto the fetch call.
      - Keep the existing `.catch(() => { /* fire-and-forget */ })` — but widen it to log
        the error with logger.error tagged [save] event "flush_network_error" including
        setlistId.
      - Wrap the sync `fetch(...)` call in its existing try/catch. In the sync catch, emit
        logger.error("[save]", { event: "flush_sync_throw", setlistId: payload.setlistId,
        error: e instanceof Error ? e.message : String(e) }) — replaces the empty comment.

    Import { logger } from "@/lib/logger" at the top of the file (only new import).

    Do NOT:
      - Await the fetch (would block unload)
      - Add retry (that's v45-03 sync engine)
      - Change the payload shape or headers
      - Remove keepalive:true
  </action>
  <verify>
    npx vitest run src/lib/__tests__/setlist-flush.test.ts 2>&amp;1 | tail -20
    npx tsc --noEmit 2>&amp;1 | head -20
  </verify>
  <done>AC-5 satisfied — non-2xx responses emit logger.error with status; sync throw emits flush_sync_throw; network errors emit flush_network_error</done>
</task>

<task type="auto">
  <name>Task 3: Regression tests for every instrumented path</name>
  <files>src/hooks/__tests__/use-setlist-logic.test.ts, src/lib/__tests__/setlist-flush.test.ts</files>
  <action>
    Add test cases covering AC-1..AC-5. Existing tests in these files must continue to pass.

    In use-setlist-logic.test.ts (append new `describe("save observability", ...)` block):
      - Spy on logger.error with vi.spyOn(logger, "error").mockImplementation(() => {})
      - Case A (AC-2): render hook with canEdit=false, trigger save via a tracked state
        change, advance timers past the 1s debounce, assert logger.error called with
        ["[save]", expect.objectContaining({ event: "save_blocked", reason: "canEdit" })]
      - Case B (AC-1): mock setlistService.updateSetlist to throw StaleWriteError,
        trigger save, advance timers, assert logger.error called with
        ["[save]", expect.objectContaining({ event: "stale_write_rejected", setlistId, uid })]
      - Case C (AC-3): mock firebaseAuth.currentUser.getIdToken to reject, remount hook,
        assert logger.error called with
        ["[save]", expect.objectContaining({ event: "token_refresh_failed" })]
      - Case D (AC-4, each variant): drive the editor state so hasPendingSave=true but
        one of {id, name, canEdit, token} is missing, dispatch a pagehide event,
        assert logger.error called once per branch with the expected reason string.

    In setlist-flush.test.ts (append new `describe("observability", ...)` block):
      - Spy on logger.error
      - Case E (AC-5 non-2xx): mock global.fetch to resolve with { ok: false, status: 409 },
        call sendKeepaliveFlush, flush microtasks, assert logger.error called with
        ["[save]", expect.objectContaining({ event: "flush_http_error", status: 409 })]
      - Case F (AC-5 sync throw): mock global.fetch to synchronously throw "QuotaExceeded",
        call sendKeepaliveFlush, assert logger.error called with event "flush_sync_throw"
      - Case G (AC-5 network reject): mock fetch to reject with network error, assert
        logger.error called with event "flush_network_error"

    Use `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync(1100)` for debounce-dependent cases
    (per project convention, see memory: time-dependent tests use vi.useFakeTimers).
    Restore mocks in afterEach.

    Do NOT:
      - Modify other test files
      - Add new test utilities beyond local helpers inside the new describe blocks
      - Increase test suite runtime by >2s
  </action>
  <verify>
    npx vitest run src/hooks/__tests__/use-setlist-logic.test.ts src/lib/__tests__/setlist-flush.test.ts 2>&amp;1 | tail -15
    # Then full suite:
    npm test 2>&amp;1 | tail -10
  </verify>
  <done>AC-6 satisfied — all new tests pass; full suite still green</done>
</task>

</tasks>

<boundaries>

## DO NOT CHANGE
- The save pipeline control flow — every early-return still returns, every catch still catches
- `src/lib/logger.ts` — logger semantics stable; no Sentry import churn
- `src/app/api/setlist/flush/route.ts` — already logs server-side (v4.4 request-ID)
- `src/lib/setlist-firebase.ts` — StaleWriteError class and updateSetlistWithVersion untouched
- `src/components/setlist/v2/SetlistChangedBanner.tsx` — banner UX stays as-is (redesign is v45-04)
- Firestore security rules — untouched

## SCOPE LIMITS
- No IndexedDB / local draft layer (that is Phase v45-02)
- No sync engine / retry / backoff (Phase v45-03)
- No banner redesign, no three-way merge UI (Phase v45-04)
- No top-bar save-state UI change (Phase v45-05)
- No toolbar, no library — those are v45-06 and v45-07
- This plan is pure observability. If implementing reveals a behavior bug, log it as a
  deferred issue in the SUMMARY; do not fix inline.

</boundaries>

<verification>
Before declaring plan complete:
- [ ] `npx tsc --noEmit` — zero errors
- [ ] `npm test` — full suite green
- [ ] `npx next build` — build passes (route.ts export rule compliance per feedback_nextjs_route_exports.md)
- [ ] Manual grep: `rg "logger.error\(\"\[save\]\"" src/` returns ≥6 matches (5 in use-setlist-logic, 3 in setlist-flush)
- [ ] No user-visible change — setlist editor UX identical
- [ ] All AC-1..AC-6 satisfied with linked tests
</verification>

<success_criteria>
- Every silent-return path in the save pipeline emits a tagged `logger.error` with structured context
- Six+ new call sites verifiable by grep
- Regression test coverage for each silent-return, each AC
- Zero behavior change (save pipeline semantics byte-identical from user perspective)
- Zero tsc errors, zero new eslint warnings
- `npx next build` passes
- Full vitest suite green
- SUMMARY.md documents the instrumentation map (which events fire where) for Phase v45-02..05 to reference
</success_criteria>

<output>
After completion, create `.paul/phases/v45-01-save-path-observability/v45-01-SUMMARY.md` with:
- Instrumentation map (event → trigger → context payload)
- Grep command for future ops to find these sites
- Confirmation suite/build results
- Any deferred observations (behavior issues noticed but not fixed per scope limits)
</output>
