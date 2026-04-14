---
phase: v43-04-data-integrity
plan: 01
subsystem: data-integrity
tags: [firestore, runtransaction, scheduling, race-condition, musicians]

requires:
  - phase: v43-01-recursive-research
    provides: D03 finding (scheduling/assign denormalization race)
provides:
  - mergeNewMusicians helper (pure, unit-tested)
  - transactional musicians-sync in /api/scheduling/assign
affects: [future v4.3 D01 cascade-delete, v4.3 D02 schema strictness]

tech-stack:
  added: []
  patterns:
    - "Read-then-write on a denormalized field must go through runTransaction (Firestore handles optimistic concurrency + retry)"
    - "Extract pure merge/compute helpers to src/lib/* so they can be unit-tested without the Firestore mock"

key-files:
  created:
    - src/lib/scheduling-merge.ts
    - src/app/api/scheduling/__tests__/assign-race.test.ts
  modified:
    - src/app/api/scheduling/assign/route.ts
    - src/__tests__/mock-firebase-admin.ts
    - src/app/api/scheduling/__tests__/assign.test.ts
    - src/__tests__/assignment-auth.test.ts

key-decisions:
  - "Keep per-musician scheduling_assignments creation OUTSIDE the transaction — those are independent writes with per-row error tracking already"
  - "Transaction mock returns merged shape ({empty, docs, exists, data}) so both dedup-query path and setlist-doc path work under one mock"

patterns-established:
  - "Helper-in-lib + pure-function test (following route-export rule)"

duration: ~35min
started: 2026-04-14T12:45:00Z
completed: 2026-04-14T13:00:00Z
---

# v4.3 P4 Plan 01: scheduling/assign Musicians-Sync Race Summary

**Closed audit finding D03: the `setlist.musicians` + `assignedUids` denormalization sync in `POST /api/scheduling/assign` now runs inside `db.runTransaction`, so concurrent assigns can't both merge against the same stale baseline and silently drop each other's writes.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~35 min |
| Tasks | 2 of 2 completed |
| Files modified | 4 (1 prod + 3 test plumbing) |
| Files created | 2 (helper + test) |
| Commits | 2 atomic + push to origin/master |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Sync step uses runTransaction | Pass | `tx.get(setlistRef)` + `tx.update(setlistRef, data)` |
| AC-2: No musician loss under concurrency | Pass (unit) | Simulated-race test verifies sequential replay preserves both additions; Firestore's optimistic concurrency + retry guarantees this for real writes |
| AC-3: Idempotent for duplicate adds | Pass | `changed: false` branch returns without tx.update |
| AC-4: Quality gates | Pass | tsc clean; 1182/1182 tests (only pre-existing env-vars failure untouched); `next build` green |

## Task Commits

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| T1: Transactional musicians sync + helper | `5b42494` | feat | runTransaction wrap + mergeNewMusicians + global mock update |
| T2: Regression tests + mock+assert updates | `3b1384a` | test | 8 new unit tests + 2 existing tests migrated to 2-arg tx.update signature |

Pushed to `origin/master`; Vercel auto-deploying.

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/lib/scheduling-merge.ts` | Created | `mergeNewMusicians` pure helper |
| `src/app/api/scheduling/__tests__/assign-race.test.ts` | Created | 8 regression tests |
| `src/app/api/scheduling/assign/route.ts` | Modified | Read+write inside runTransaction |
| `src/__tests__/mock-firebase-admin.ts` | Modified | `tx.get` returns `mockDoc` (was empty-collection shape) |
| `src/app/api/scheduling/__tests__/assign.test.ts` | Modified | Local tx mock returns merged shape; assertion updated to 2-arg tx.update form |
| `src/__tests__/assignment-auth.test.ts` | Modified | Find-call predicate reads args[1] (data), not args[0] (ref) |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Keep assignment-create loop outside tx | Per-musician writes already have per-row error tracking; wrapping them too would coarsen failure reporting and risk tx retries firing side-effect notifications (FCM push, email) multiple times | Failure isolation preserved |
| Global tx mock returns merged shape | Two test files hit different tx.get patterns (query vs docRef); merged shape satisfies both without per-test overrides | Simpler test plumbing |
| Migrate existing tests' assertions instead of preserving 1-arg form | `tx.update(ref, data)` is the correct Admin-SDK transaction signature; forcing the old 1-arg form would require a more elaborate wrapper that obscures intent | Tests now accurately reflect production call shape |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | Mock plumbing updates (global + local) — unavoidable side effect of the tx refactor |
| Scope additions | 1 | Updated 2 existing tests to match new call signature |
| Deferred | 0 | — |

**Total impact:** Zero AC deviation. The test-file updates were mandatory — the refactor changed the Firestore write call shape, and the existing tests asserted the old shape. This is the correct kind of test churn (tests following real contract changes), not test-tuning to hide regressions.

## Skill Audit

Plan declared `/ui-ux-pro-max` not required (backend-only). Confirmed: no frontend changes. No gap.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Global mock transaction.get returned `{empty, docs}` shape — broke new doc-shape reads | Changed to return `mockDoc` (which exposes `exists` + `data()`) |
| Local assign.test.ts mock had its own `runTransaction`; the dedup-check tx expected `{empty, docs}` while my new sync expected doc shape | Merged both shapes into one return value |
| Vitest false-positive skill-injection flagged `await new Promise(r => setTimeout(...))` in test files as "long-running serverless handler" | Ignored — test files, not handlers |

## Next Phase Readiness

**Ready:**
- Pattern established: future read-then-write on denormalized Firestore fields goes through `runTransaction`
- Mock scaffolding now supports doc-shape transactional reads across test files

**Concerns:**
- Still pending in Phase 4: **D01** orphan cascade on setlist delete; **D02** `.passthrough()` schema bypass. Both are separate plans.
- Firestore transaction retry count is not capped in our code — defaults to 5 retries. If the setlist is write-heavy (many concurrent assigns), we could see rare 500s after retry exhaustion. Accept for now; band has ≤2 band leaders assigning at once.

**Blockers:** None

**Next plan (recommended):**
`04-02` for D01 (setlist delete cascade — new Admin API endpoint that batch-deletes scheduling_assignments + notifications + scheduling_history on setlist deletion) OR `04-03` for D02 (`.passthrough()` → `.strict()` across track/musician schemas). D01 is larger scope; D02 is faster but needs a caller-compatibility sweep.

---
*Phase: v43-04-data-integrity, Plan: 01*
*Completed: 2026-04-14*
