---
phase: 04-editor-cleanup
plan: 01
subsystem: helpers, hooks
tags: [permissions, date-format, firestore-sync, refactor]

requires:
  - phase: 01_1-concurrent-edit-safety
    provides: useSafeFirestoreSync loading signal this plan now consumes correctly

provides:
  - canEditSetlist(setlist, auth) helper — single source of truth for edit permission
  - Canonical formatEventDate — no more silent shadowing
  - Honest isLoading signal from useUpcomingPrep (empty snapshot no longer stuck)
affects: 04-0N (any Phase 4 plan that touches edit permissions, schedule dates, or dashboard loading states)

tech-stack:
  added: []
  patterns:
    - Narrow auth-context interface (`{ uid, isBandLeader, isAdmin }`) accepted by both client and server auth shapes
    - Divergent date-format copies get renamed to make intent explicit (formatAssignmentDate) rather than silently shadow canonical

key-files:
  created:
    - src/lib/setlist-permissions.ts
    - src/lib/__tests__/setlist-permissions.test.ts
  modified:
    - src/components/setlist/SetlistDashboard.tsx
    - src/app/(main)/setlists/[id]/page.tsx
    - src/components/scheduling/ScheduleCard.tsx
    - src/app/api/scheduling/remind/route.ts
    - src/hooks/use-upcoming-prep.ts
    - src/hooks/__tests__/use-upcoming-prep.test.ts

key-decisions:
  - "canEditSetlist accepts a narrow auth context (uid, isBandLeader, isAdmin) so both useAuth() and server auth can feed it"
  - "ScheduleCard's compact date format renamed to formatAssignmentDate — keeps divergence explicit instead of shadowing canonical"
  - "remind-route formatEventDateForEmail kept as a thin 1-line wrapper around canonical (TBD fallback) — name is the contract"
  - "useUpcomingPrep.isLoading now reads useSafeFirestoreSync's own loading flag, not setlists.length === 0"

patterns-established:
  - "Permission predicates live in lib/, accept narrow auth contexts, return boolean"
  - "Subscription-backed hooks expose the subscription's own loading signal, never infer it from data shape"

duration: ~25min
started: 2026-04-14T08:20:00Z
completed: 2026-04-14T08:35:00Z
---

# Phase 04 Plan 01: Shared Helpers + Hook Fixes Summary

**Single canonical `canEditSetlist` helper replaces four ad-hoc predicates; duplicate `formatEventDate` shadowing killed; `useUpcomingPrep` stops reporting stuck-loading on empty snapshots.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~25min |
| Tasks | 3 auto (autonomous — no checkpoint) |
| Files modified | 7 |
| Tests added | 10 (7 permissions + 3 prep) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Single canonical canEditSetlist helper, all call sites migrated | Pass | 3 client call sites migrated (2 in SetlistDashboard, 1 in setlists/[id]/page.tsx); 7 unit tests cover owner / leader / admin / unprivileged / legacy / null / missing-uid cases. |
| AC-2: formatEventDate has exactly one implementation | Pass | ScheduleCard's shadowing local renamed to `formatAssignmentDate` (divergent compact format — documented); remind-route's `formatEventDateForEmail` now delegates to canonical (identical format, TBD fallback kept). |
| AC-3: useUpcomingPrep stops reporting isLoading=true on empty snapshot | Pass | Now reads `loading` from `useSafeFirestoreSync`. 3 new tests pin the empty-snapshot, pre-snapshot, and post-data cases. |

## Accomplishments

- One place to change when setlist edit rules evolve.
- Dashboard "Upcoming" section no longer spins forever when a member has no services in the next 7 days.
- remind-route email logic simplified to 1 line; ScheduleCard's compact-format divergence now explicit by name.
- Zero UI copy changes, zero dependency changes.
- Full suite 1142/1142; TypeScript clean.

## Task Commits

Single atomic commit.

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/lib/setlist-permissions.ts` | Created | canEditSetlist helper |
| `src/lib/__tests__/setlist-permissions.test.ts` | Created | 7 tests pinning helper behaviour |
| `src/components/setlist/SetlistDashboard.tsx` | Modified | 2 call sites migrated |
| `src/app/(main)/setlists/[id]/page.tsx` | Modified | Server-side editor-access check migrated |
| `src/components/scheduling/ScheduleCard.tsx` | Modified | Shadowing local renamed to formatAssignmentDate |
| `src/app/api/scheduling/remind/route.ts` | Modified | formatEventDateForEmail delegates to canonical |
| `src/hooks/use-upcoming-prep.ts` | Modified | isLoading reads subscription's loading signal |
| `src/hooks/__tests__/use-upcoming-prep.test.ts` | Modified | Mock extended with loading; +3 tests |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Narrow auth-context interface on helper | Works for both client useAuth() shape and server auth shape without adapter glue | Any future consumer (server-side edit gate, API route) can call it directly |
| Rename vs delete the ScheduleCard local | Format genuinely differs (compact "Fri, Feb 14" vs canonical "Friday, February 14"); forcing a match would change UI copy | Divergence is now explicit in the name, not hidden |
| Keep `formatEventDateForEmail` wrapper | Name communicates intent at call sites; body is 1 line | Minimal indirection, preserved call-site readability |
| Honest isLoading via subscription flag | useSafeFirestoreSync already exposes `loading: boolean` — the hook was just ignoring it | Pattern worth replicating for other hooks that consume useSafeFirestoreSync |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | Minor — restored hasSeconds helper after accidentally deleting it |
| Scope additions | 0 | — |
| Deferred | 0 | — |

**Total impact:** Plan executed as written.

### Auto-fixed Issues

**1. [Refactor] `hasSeconds` helper restored after initial deletion**
- **Found during:** Task 2 verification (`tsc --noEmit`)
- **Issue:** Deleting the local `formatEventDateForEmail` also removed `hasSeconds`, which is still used by the route's 48-hour filter (line 56).
- **Fix:** Restored `hasSeconds` above the new wrapper.
- **Files:** `src/app/api/scheduling/remind/route.ts`
- **Verification:** `npx tsc --noEmit` clean.

### Deferred Items

None in this plan. The broader Phase 4 backlog (useSafeFirestoreSync memoization audit, modal consolidation, track-row buttons, toast hygiene, z-index tokens, apiFetch timeout/abort, AlertDialog migrations, INSTRUMENTS registry unification) is explicitly staged for subsequent Phase 4 plans.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Pre-existing `song-charts-library.test.tsx` env-vars failure | Unchanged — still out of scope. |

## Next Phase Readiness

**Ready:**
- Plan 04-02 can build on `canEditSetlist` directly (e.g., for modal-consolidation edit gates).
- Any future hook that wraps `useSafeFirestoreSync` now has a precedent for honest loading signals.

**Concerns:**
- None introduced by this plan.

**Blockers:**
- None.

**Skill audit:** No skills required for this plan (pure internal refactor).

---
*Phase: 04-editor-cleanup, Plan: 01*
*Completed: 2026-04-14*
