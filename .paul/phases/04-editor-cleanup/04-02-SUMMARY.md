---
phase: 04-editor-cleanup
plan: 02
subsystem: api, pdf
tags: [abort-controller, timeout, fetch, pdf-viewer]

requires: []

provides:
  - apiFetch default 30s timeout with caller-signal merging
  - PDFViewer AbortController + 60s timeout + unmount/URL-change abort
affects: All 41 apiFetch callers inherit the new default; PDFViewer stops hanging on flaky venue networks

tech-stack:
  added: []
  patterns:
    - "apiFetch-style wrappers merge caller + internal abort signals through a single internal controller"
    - "Effect-owned AbortController is the abort primitive for all component-level fetches"

key-files:
  created:
    - src/lib/__tests__/api-client.test.ts
  modified:
    - src/lib/api-client.ts
    - src/components/music/PDFViewer.tsx

key-decisions:
  - "Default apiFetch timeout = 30s; opt-out via `timeout: 0`"
  - "Default PDFViewer fetch timeout = 60s (PDFs are large, some venue networks are slow)"
  - "Retry uses a bust-counter that re-triggers the effect, giving each attempt a fresh AbortController"

patterns-established:
  - "Effect-owned AbortController with a matching setTimeout is the pattern for any component-level network call"
  - "Swallow AbortError in catch branches — aborts are expected, not errors"

duration: ~20min
started: 2026-04-14T08:45:00Z
completed: 2026-04-14T08:55:00Z
---

# Phase 04 Plan 02: apiFetch Timeout/Abort + PDFViewer Abort Summary

**`apiFetch` now arms a default 30-second timeout-abort (opt-out via `timeout: 0`) and merges caller-supplied signals through a single internal `AbortController`. `PDFViewer` owns an `AbortController` that aborts on unmount, URL change, or 60-second timeout.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~20min |
| Tasks | 2 auto (autonomous — no checkpoint) |
| Files modified | 3 |
| Tests added | 5 |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: apiFetch default timeout + abort behaviour | Pass | 5 tests cover happy path, 30s timeout, `timeout: 0` opt-out, caller-signal merge, and auth/Content-Type preservation. |
| AC-2: PDFViewer aborts on unmount and URL change | Pass | Effect-owned AbortController aborts in its cleanup; 60s timer aborts on hang; AbortError swallowed in catch. TS clean. Existing music-component tests green. |

## Accomplishments

- All 41 apiFetch call sites inherit a 30s timeout for free — zero migration.
- PDFViewer stops "Loading…" forever on hung venue networks; retry uses a bust counter that reissues a fresh controller+timer.
- Full suite 1147/1147; TypeScript clean.
- Confirmed the useSafeFirestoreSync memoization backlog item is already complete (all 5 non-test callers use `useMemo`) — skipped and documented in PLAN.

## Task Commits

Single atomic commit.

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/lib/api-client.ts` | Modified | New `timeout` option; internal AbortController merges with caller signal |
| `src/lib/__tests__/api-client.test.ts` | Created | 5 tests pinning timeout/abort/auth behaviour |
| `src/components/music/PDFViewer.tsx` | Modified | Effect-owned AbortController; 60s timer; retry via bust-counter |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| 30s default for apiFetch | Long enough for print/email jobs; short enough to surface real hangs | Generous but finite |
| 60s default for PDFViewer | PDFs are large; venue networks vary widely | Longer than apiFetch but still bounded |
| Bust-counter for retry | Keeps abort + retry lifecycles through a single useEffect — no duplicate cleanup paths | Clean single source of truth for controller ownership |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | Minor — test mock needed to reject-on-abort to exit the awaited promise |
| Scope additions | 0 | — |
| Deferred | 0 | — |

**Total impact:** Plan executed as written.

### Auto-fixed Issues

**1. [Test] Initial timeout test hung because mock never rejected on abort**
- **Found during:** Task 1 verification
- **Issue:** First-pass `fetchMock.mockImplementationOnce(() => new Promise(() => {}))` never resolves OR rejects, so `await promise` hung past the 5s vitest testTimeout.
- **Fix:** Mock now listens to the injected signal's `abort` event and rejects with an AbortError, mirroring the native fetch contract.
- **Files:** `src/lib/__tests__/api-client.test.ts`
- **Verification:** 5/5 tests green.

### Deferred Items

None. Broader Phase 4 backlog (modal consolidation, toast hygiene, AlertDialog migrations, INSTRUMENTS unification, z-index tokens) is staged for subsequent plans.

## Issues Encountered

None worth recording beyond the auto-fix above.

## Next Phase Readiness

**Ready:**
- Modal-consolidation plan can safely introduce new apiFetch callers without worrying about hang scenarios.
- Error-toast sweep (future plan) benefits from AbortError being identifiable — silent-catch paths can distinguish "real" errors from abort-on-unmount.

**Concerns:**
- If a legitimately-streaming API route is added later, it MUST pass `timeout: 0`. No such route exists today.

**Blockers:**
- None.

**Skill audit:** No skills required for this plan (pure internal hardening).

---
*Phase: 04-editor-cleanup, Plan: 02*
*Completed: 2026-04-14*
