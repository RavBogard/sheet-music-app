---
phase: v43-04-data-integrity
plan: 03
subsystem: data-integrity
tags: [d01, cascade-delete, admin-sdk, firestore-indexes, setlist]

requires:
  - phase: v43-01-recursive-research
    provides: D01 finding (setlist delete leaves orphan assignments/notifications/subcollections)

provides:
  - POST /api/setlist/delete — server-side cascading delete (band_leader gated)
  - notifications.entityId collectionGroup index (fieldOverride)
  - Hard-delete semantics for setlist + all dependents
  - Rewired client deleteSetlist() (signature preserved)

affects: future scheduling/notification logic — the entityId convention is now load-bearing for cascade

tech-stack:
  added: []
  patterns:
    - "Per-phase try/catch cascade: each cleanup step isolates failures into response errors[] without halting the chain"
    - "recursiveDelete as parent+subcollection sweeper after flat-collection cleanups"
    - "500-doc WriteBatch chunking loop for arbitrary-size flat-collection deletes"

key-files:
  created:
    - src/app/api/setlist/delete/route.ts
    - src/app/api/setlist/delete/__tests__/route.test.ts
    - .paul/phases/v43-04-data-integrity/04-03-AUDIT.md
  modified:
    - src/lib/setlist-firebase.ts
    - firestore.indexes.json
    - src/app/api/bridge/__tests__/setup-code.test.ts  (pre-existing TS inference fix)

key-decisions:
  - "AC-6 path (a) — notifications cascade via collectionGroup('notifications').where('entityId','==',id). entityId convention is reliable for setlist-rooted notifications; assignment-rooted notifications correctly remain untouched."
  - "Retry-safe cascade order: dependents first, recursiveDelete(parent) last. Idempotent — re-running on same id is a no-op."
  - "Hard delete only; no soft-delete/tombstones (matches existing semantics)."

patterns-established:
  - "Cascading deletes for root entities should use server-side Admin SDK with per-phase error isolation, not client-batch best-effort"

duration: ~60min
started: 2026-04-14T22:40:00Z
completed: 2026-04-14T23:40:00Z
---

# Phase 4 Plan 03: D01 Cascade Delete Summary

**Setlist deletion now cascades server-side through assignments, tasks, setlist-rooted notifications, and all subcollections. Last v4.3 P0 closed — 10/10.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~60 min |
| Tasks | 4 auto + 1 human-verify — all complete |
| Files modified | 6 (3 new: route + tests + audit; 3 changed) |
| New tests | 6 |
| Total suite | 1225 pass |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Authorized cascade removes setlist + dependents | PASS | Happy-path test asserts counts; human-verified on prod |
| AC-2: Non-band-leader → 403 | PASS | Test 1 |
| AC-3: Unknown setlistId → 404 | PASS | Test 3 |
| AC-4: Partial-failure tolerance | PASS | Test 5 (recursiveDelete throws → 200 + errors[]) |
| AC-5: Client call-site unchanged | PASS | `deleteSetlist(id)` signature identical; grep confirms no call-site changes |
| AC-6: Notifications cascade (path a) | PASS | collectionGroup query; index deployed |

## Accomplishments

- **D01 closed → 10/10 v4.3 P0s resolved**
- Cascade is idempotent + retry-safe; per-phase errors don't halt the chain
- Firestore index for `notifications.entityId` (COLLECTION + COLLECTION_GROUP) live on prod
- Firestore rules `bridge-redemptions` rule from 03-02 also pushed to prod during this phase
- Zero UI changes required — existing toast/error handlers surface API errors identically

## Task Commits

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Task 1: Plan + audit | `4f1480a` | docs | PLAN 04-03 + AUDIT.md (orphan surface, AC-6 decision) |
| Tasks 2-3 + index + misc | `012bcbd` | fix(d01) | Route, client rewire, collectionGroup index, TS cleanup |
| Task 4: tests | (folded into `012bcbd`) | test(d01) | 6-case matrix |

All on `origin/master`. Vercel auto-deployed. Firestore rules + indexes deployed via `firebase deploy`.

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/app/api/setlist/delete/route.ts` | Created | Admin SDK cascading delete |
| `src/app/api/setlist/delete/__tests__/route.test.ts` | Created | 6-case test matrix |
| `.paul/phases/v43-04-data-integrity/04-03-AUDIT.md` | Created | Orphan surface + AC-6 decision |
| `src/lib/setlist-firebase.ts` | Modified | `deleteSetlist()` now calls the route |
| `firestore.indexes.json` | Modified | +fieldOverride for `notifications.entityId` at COLLECTION + COLLECTION_GROUP |
| `src/app/api/bridge/__tests__/setup-code.test.ts` | Modified | TS inference fixes (afterAll import, mock type annotations) |

## Decisions Made

See AUDIT.md §AC-6. Short form: cascade notifications via `collectionGroup('notifications').where('entityId','==',id)` because the entityId convention is consistent enough across setlist-rooted notifications and assignment-rooted notifications correctly remain out of scope.

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | Pre-existing TS inference issues in `setup-code.test.ts` |
| Scope additions | 1 | Firestore rules deployment during 03-02 (operational follow-up from prior plan) |
| Deferred | 0 | — |

### Auto-fixed Issues

**1. TS inference errors in setup-code.test.ts**
- **Found during:** Task 3 typecheck
- **Issue:** Untyped `vi.fn` spreads + missing `afterAll` import; hadn't surfaced in the previous session but tsc flagged them during this plan
- **Fix:** Imported `afterAll`, typed the `runTransactionMock` and `alertSpy` explicitly, simplified arg forwarding
- **Commit:** `012bcbd`

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Pre-existing env-vars test suite still red | Unchanged; not in scope for this plan |
| Build artifacts (package.json, build-info.json) dirtied by `next build` | Will be committed with the state/SUMMARY pass |

## Operational Follow-up

- **Done in this plan:** `firebase deploy --only firestore:rules` + `--only firestore:indexes` (both rules from 03-02 and indexes from 04-03 now live)
- **Nothing else operational pending.**

## Next Phase Readiness

**Ready:**
- v4.3 Phase 4 now ✅ complete (3/3 plans: D02, D03, D01)
- v4.3 Phase 1, 3, 4, 5 complete. Remaining phases: 2 (Security Triage — S01, S03 already closed in earlier work), 6, 7, 8 (all P1-class work per ROADMAP)
- **10/10 v4.3 P0s closed** — the band-onboarding blocker set is cleared

**Concerns:** None on D01.

**Blockers:** None.

---
*Phase: v43-04-data-integrity, Plan: 03*
*Completed: 2026-04-14*
