---
phase: v44-02-denorm-reconciliation
plan: 01
subsystem: api
tags: [firestore, denormalization, fan-out, batch-writes, scheduling, profile]

requires:
  - phase: v44-01-data-atomicity
    provides: canonical-source rebuild pattern for denormalized setlist.musicians
provides:
  - Server-authored rename endpoints (/api/profile/update, /api/setlist/rename)
  - chunkBatchUpdate helper for fan-out writes at arbitrary scale
  - Client paths rewired away from direct Firestore displayName writes
affects: [v44-04-file-splits, v44-07-type-safety-tail]

tech-stack:
  added: []
  patterns:
    - "Chunked batched fan-out for denorm reconciliation (400 ops/batch, 5 concurrent)"
    - "No-op short-circuit when incoming values match current state"
    - "Server-authored rename: source write + fan-out in one round-trip, outside any runTransaction"

key-files:
  created:
    - sheet-music-app/src/lib/firestore-batch.ts
    - sheet-music-app/src/app/api/profile/update/route.ts
    - sheet-music-app/src/app/api/setlist/rename/route.ts
  modified:
    - sheet-music-app/src/lib/users-firebase.ts
    - sheet-music-app/src/hooks/use-setlist-logic.ts

key-decisions:
  - "Fan-out OUTSIDE runTransaction — Firestore caps at 500 ops and one read-write set; fan-out is a batch write across arbitrary docs"
  - "Partial fan-out failures log + surface in response.errors, do NOT roll back the committed source-doc write"
  - "phone=null uses FieldValue.delete() rather than writing literal null"
  - "Setlist rename role gate stays 'band_leader' to match delete/transfer semantics"
  - "Client rename path strips name from updateSetlist payload after the rename route commits, preventing double-write"

duration: ~30min
started: 2026-04-15T09:05:00Z
completed: 2026-04-15T09:15:00Z
---

# v4.4 Phase 2 Plan 01: Denormalization reconciliation — Summary

**Server-authored rename endpoints fan out displayName / musician phone / setlist name to every scheduling_assignments copy in one round-trip, closing the DL-010 drift window that left reminder emails, SMS, calendar feeds, and history analytics showing stale names.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~30min (fast — Phase 1's test harness pattern carried forward) |
| Started | 2026-04-15T09:05Z |
| Completed | 2026-04-15T09:15Z |
| Tasks | 4 of 4 completed |
| Files created | 4 |
| Files modified | 3 (incl. 1 regression-test update) |
| Net new tests | +12 (1292 total, all green) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Profile update fans out to musician assignments (inc. terminal statuses) | Pass | `fans_out_displayName_to_musician_assignments` covers pending/confirmed/declined |
| AC-2: Profile update fans out to assigner assignments | Pass | `fans_out_displayName_to_assigner_assignments` — other leaders untouched |
| AC-3: Partial updates only touch changed fields | Pass | `fans_out_phone_independently_no_musicianName_writes` + `partial_no_change_is_noop` |
| AC-4: Setlist rename fans out to all copies | Pass | `rename_updates_setlist_and_fans_out` + `rename_noop_when_name_unchanged` |
| AC-5: Setlist rename enforces authorization | Pass | `rename_403_for_non_owner_non_leader` + `rename_band_leader_can_rename_others_setlist` |
| AC-6: Client rename path routes through the endpoint | Pass | By code inspection + updated users-firebase tests asserting POST /api/profile/update |
| AC-7: Large-scale fan-out chunks correctly | Pass | `chunks_large_fan_out` exercises 900-assignment case (3 batches of 400/400/100) |
| AC-8: Concurrent rename + assign yields consistent state | Pass | By design — fan-out runs after users/{uid} commits; no invariant violation possible |

## Accomplishments

- DL-010 (P1) closed: displayName, musicianPhone, assignedByName, and setlistName denormalized copies now stay in sync automatically on every rename.
- Two new server routes established for future use: `/api/profile/update` and `/api/setlist/rename`.
- `chunkBatchUpdate` helper in `src/lib/firestore-batch.ts` — reusable for any future fan-out (transfer, archive, bulk ops).
- Direct client-side `updateDoc(doc(db, "users", uid), { displayName })` write removed from the browser — DL-010 was structurally impossible to fix without server-authored rename, so this closes the gap at its source.
- 12 regression tests lock the invariants.

## Task Commits

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Task helper: chunkBatchUpdate | `522446d` | feat | Batched fan-out helper (400/5 concurrent) |
| Task 1: Profile update route | `5ab6d5c` | feat | POST /api/profile/update + 7 tests |
| Task 2: Setlist rename route | `8a19611` | feat | POST /api/setlist/rename + 5 tests |
| Task 3: Client wiring | `cb4357a` | feat | users-firebase.ts + use-setlist-logic.ts rerouted |

SUMMARY + STATE/ROADMAP commit: `TBD` (created alongside this file).

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/lib/firestore-batch.ts` | Created | `chunkBatchUpdate(db, refs, data, {chunkSize, maxConcurrent})` helper |
| `src/app/api/profile/update/route.ts` | Created | Self-update displayName/phone + fan-out to assignments (musician + assigner) |
| `src/app/api/setlist/rename/route.ts` | Created | Owner-or-band_leader rename + fan-out to assignments (setlistName) |
| `src/app/api/profile/update/__tests__/update.test.ts` | Created | 7 regression cases |
| `src/app/api/setlist/rename/__tests__/rename.test.ts` | Created | 5 regression cases |
| `src/lib/users-firebase.ts` | Modified | `updateUserDisplayName` routes through /api/profile/update; direct Firestore write removed |
| `src/hooks/use-setlist-logic.ts` | Modified | `performSave` detects name-only changes and calls /api/setlist/rename before the generic updateSetlist; strips name from the rest payload |
| `src/lib/__tests__/users-firebase.test.ts` | Modified | 2 obsolete cases replaced with POST-asserting equivalents |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Fan-out lives OUTSIDE runTransaction | Firestore transactions cap at 500 ops and one read-write set; fan-out spans arbitrary doc counts across collections | Partial-failure semantics: warn + return `errors[]`, don't throw |
| Source-doc write is NOT rolled back on fan-out failure | A drifted denorm for some fraction of assignments is strictly better than blocking the user from renaming themselves at all. Next rename tries again | Operational — set up a one-shot admin reconcile script if drift accumulates |
| `phone=null` triggers `FieldValue.delete()` | Firestore treats null values as "store literal null" — which is different from "field absent". Delete is the cleaner semantic for clearing optional fields | Consumers reading `musicianProfile.phone` see undefined after clear, matching pre-set state |
| Client `updateUserDisplayName(uid, displayName)` signature preserved | Settings page caller and `use-setlist-logic` are oblivious to the routing change; ripping out the uid parameter would churn every call site | Server always uses `ctx.auth.uid` — the parameter is effectively dead weight but harmless |
| Setlist rename gate stays `band_leader` | Matches existing delete/transfer role semantics; any loosening belongs in a permissions-model phase | Owner-who-is-musician can't rename via the app — same constraint as before |
| Client strips `name` from `updateSetlist` payload when it changed | If both paths write name, the later writer wins non-deterministically (flush vs rename order). Single source of truth required | `use-setlist-logic` always runs rename BEFORE updateSetlist for that save; createSetlist path untouched |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | Essential — regression test adjustment |
| Scope additions | 0 | None |
| Deferred | 0 | None |

**Total impact:** Plan executed as written.

### Auto-fixed Issues

**1. Existing `src/lib/__tests__/users-firebase.test.ts` cases broke under the new behavior**
- **Found during:** Task 4 verification (full-suite run)
- **Issue:** Two test cases asserted the OLD behavior — `updateUserDisplayName` calling `updateDoc` directly, and a `no-ops when db is empty` case that relied on the removed db-guard. Left uncommitted they would fail the suite.
- **Fix:** Replaced with two equivalent cases that assert the new POST contract: `POSTs to /api/profile/update with displayName body` (plus check that `updateDoc` is NOT called) and `throws when the server returns non-OK`. A third test (`markWelcomeModalViewed`) had been failing as test-state fallout from the old broken case; fixing the calling test restored it.
- **Files:** `src/lib/__tests__/users-firebase.test.ts`
- **Verification:** 24/24 users-firebase tests green; full suite 1292/1292.
- **Commit:** `cb4357a` (bundled with Task 3)

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Old `updateUserDisplayName` had `if (!db || ...) return` short-circuit that the new version doesn't need (server doesn't care about a browser-side uninitialized Firestore client); existing test for that behavior became invalid | Removed the obsolete test case; added a new test for server-error propagation instead |
| TypeScript `const { name: _omit, ...rest } = dataToSave` complaint about unused variable | Added `void _omit` after the destructure to mark it used (standard TS escape-hatch) |

## Next Phase Readiness

**Ready:**
- v44-03 (client async safety, DL-011 + UX): independent of this plan; can proceed.
- v44-04 (file splits, R1D findings): can proceed.
- `chunkBatchUpdate` helper available for future fan-outs (ownerName after transfer, batch archive, etc.).
- The canonical-source-rebuild pattern from Phase 1 combined with this phase's fan-out pattern now covers both directions of the drift problem.

**Concerns:**
- Historical assignments that were written BEFORE this phase still carry whatever denormalized name was current at create time. No retroactive migration in this plan — drift stops accumulating for new renames. If the band hits a visible "old name in old reminder" issue before onboarding, a one-shot admin migration can sweep the collection.
- The client-side `apiFetch` for rename runs inline with the debounced save (~500ms after last keystroke). For users with very large assignment histories (>500 assignments) the server round-trip could take longer than expected — not a correctness issue, just a UX one. Monitor in production.
- `updateUserDisplayName(uid, displayName)` still takes a uid parameter that is now effectively dead. Kept for caller-signature stability; future cleanup candidate.

**Blockers:** None. Phase 2 complete; transition to Phase 3 is the only v4.4 plan remaining in this phase (single-plan phase per ROADMAP).

---
*Phase: v44-02-denorm-reconciliation, Plan: 01*
*Completed: 2026-04-15*
