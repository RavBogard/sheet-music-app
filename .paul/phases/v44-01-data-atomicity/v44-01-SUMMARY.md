---
phase: v44-01-data-atomicity
plan: 01
subsystem: api
tags: [firestore, transactions, scheduling, denormalization, atomicity]

requires:
  - phase: v44-00-full-audit
    provides: R2A data-layer findings DL-001/002/003/012/013/014
provides:
  - Atomic single-tx mutation of scheduling assignments + parent setlist musicians[] / assignedUids
  - Canonical-source rebuild of denormalized setlist.musicians from scheduling_assignments query inside assign tx
  - State-machine guard on unassign (rejects terminal-status transitions)
  - Re-invite-after-decline support in assign
  - Atomicity regression test harness (ref-tagged transaction mock pattern)
affects: [v44-02-denorm-reconciliation, v44-03-client-async-safety, v44-07-type-safety-tail]

tech-stack:
  added: []
  patterns:
    - "Single-runTransaction-per-mutation pattern for assignment + denormalized parent doc"
    - "Canonical-source denorm rebuild (read authoritative collection inside tx)"
    - "Ref-tagged mock objects for routing transaction.get/update by collection in tests"

key-files:
  created:
    - sheet-music-app/src/app/api/scheduling/__tests__/atomicity.test.ts
    - sheet-music-app/.paul/phases/v44-00-full-audit/R2A-data-layer.md
  modified:
    - sheet-music-app/src/app/api/scheduling/assign/route.ts
    - sheet-music-app/src/app/api/scheduling/unassign/route.ts
    - sheet-music-app/src/app/api/scheduling/respond/route.ts
    - sheet-music-app/src/__tests__/mock-firebase-admin.ts

key-decisions:
  - "Notification cascade kept post-commit (not in tx) — side-effect, not invariant-critical, would bloat contention"
  - "users/{uid} preference reads kept post-commit (DL-005 scope)"
  - "scheduling-merge.ts left in place (deprecation belongs to DL-011 array-shape phase)"
  - "Skipped musicians in assign now surface in response.errors instead of silent continue"
  - "Pre-existing @ts-ignore lint error fixed per no-skip-preexisting directive"

patterns-established:
  - "Atomic-pair pattern: any handler mutating an assignment doc MUST mutate the parent setlist's denormalized musicians/assignedUids in the same runTransaction"
  - "Canonical rebuild: when denormalized state needs reconstruction, read the authoritative source inside the tx — never rebuild from request payload"

duration: ~75min
started: 2026-04-15T08:08:00Z
completed: 2026-04-15T08:30:00Z
---

# v4.4 Phase 1 Plan 01: Data-layer atomicity — Summary

**Single-transaction mutation of scheduling assignments + parent setlist denormalized arrays; canonical-source rebuild eliminates the split-tx race that allowed musicians[] to drift from the assignments collection.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~75min |
| Started | 2026-04-15T08:08Z |
| Completed | 2026-04-15T08:30Z |
| Tasks | 4 of 4 completed |
| Files modified | 6 (incl. shared mock + 1 preexisting lint fix) |
| Files created | 2 |
| Net new tests | +10 atomicity cases (1280 total, all green) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Assign mutates assignment + setlist atomically from canonical source | Pass | `assign_adds_musicians_and_rebuilds_denorm_from_canonical_source` proves canonical instrument wins over payload |
| AC-2: Decline atomic across both docs | Pass | `decline_atomic_single_tx` asserts both writes in one tx commit |
| AC-3: Unassign atomic across both docs | Pass | `unassign_atomic_single_tx` asserts both writes in one tx commit |
| AC-4: Concurrent assign + decline + unassign yield consistent denorm | Pass | `concurrent_assign_decline_consistent_final_state` + `concurrent_unassigns_do_not_clobber` (replay-based assertions modeling tx-retry semantics) |
| AC-5: Re-invite after decline/cancel creates fresh assignment | Pass | `assign_allows_reinvite_after_decline` + `assign_skips_already_active_with_error` |
| AC-6: Unassign rejects invalid transitions, preserves declineReason | Pass | `unassign_rejects_terminal_transition` returns 400, no notifications fired |
| AC-7: Notifications only on commit, never on tx throw | Pass | Notification cascade is post-commit by construction; assertions in terminal-transition test confirm zero email/SMS/push fired |

## Accomplishments

- Three P0 scheduling races (DL-001/002/003) closed by single-runTransaction redesign of assign / unassign / respond handlers.
- Two state-machine gaps (DL-013 re-invite silent no-op, DL-014 unassign clobbering decline) fixed in the same files per the no-skip-preexisting directive.
- Canonical-source denorm rebuild eliminates DL-012 (concurrent-assign instrument drift) by construction.
- 10-case atomicity regression suite uses ref-tagged transaction mocks to assert single-tx commits — pattern reusable for future Phase-2 atomicity work.
- R2A-data-layer.md re-derived from full codebase scan; 28 findings documented and routed to the appropriate v4.4 phases.
- Pre-existing @ts-ignore lint error fixed.
- Existing 50 scheduling tests + 1 cross-route auth test updated to match new atomic semantics.

## Task Commits

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Task 1: Atomic unassign + state-machine guard | `5e9ca1e` | fix | Single-tx assignment + setlist mutation; INVALID_TRANSITION guard |
| Task 2: Atomic decline in respond | `b6e8e29` | fix | Decline path folds setlist mutation into status tx; assignedUids maintained |
| Task 3: Atomic assign with canonical rebuild | `5ca54c4` | fix | Per-musician tx reads active assignments + setlist; rebuilds denorm canonically; allows re-invite |
| Task 4: Atomicity regression suite | `47d4729` | test | 10 cases; ref-tagged transaction mock harness |
| Pre-existing lint fix | `cf912cc` | chore | `@ts-ignore` → `@ts-expect-error` |
| R2A audit re-derivation | `7276dc1` | docs | 28 findings documented; phase routing |

Plan + state metadata: TBD in subsequent commit alongside this SUMMARY.

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `sheet-music-app/src/app/api/scheduling/assign/route.ts` | Modified | Per-musician runTransaction reads active-assignments + setlist; rebuilds denorm canonically; allows re-invite after terminal status |
| `sheet-music-app/src/app/api/scheduling/unassign/route.ts` | Modified | Single tx covers status flip + setlist musicians/assignedUids removal; INVALID_TRANSITION guard |
| `sheet-music-app/src/app/api/scheduling/respond/route.ts` | Modified | Decline path's setlist mutation moved into the existing status tx |
| `sheet-music-app/src/app/api/scheduling/__tests__/atomicity.test.ts` | Created | 10 regression cases for the new invariants |
| `sheet-music-app/src/app/api/scheduling/__tests__/assign.test.ts` | Modified | Dedup test seeds active doc with musicianUid; asserts response.errors |
| `sheet-music-app/src/app/api/scheduling/__tests__/unassign.test.ts` | Modified | Ref-tagged transaction mock; status seeded; setlist update assertion uses (ref, data) shape |
| `sheet-music-app/src/app/api/scheduling/__tests__/respond.test.ts` | Modified | Same ref-tagged mock pattern; assignedUids assertion |
| `sheet-music-app/src/__tests__/mock-firebase-admin.ts` | Modified | Shared transaction.get returns union snapshot shape (DocumentSnapshot + QuerySnapshot); .where() chain made fully chainable |
| `sheet-music-app/src/__tests__/assignment-auth.test.ts` | Modified | Seeds active assignment doc so canonical rebuild preserves musician-1 |
| `sheet-music-app/scripts/audit-touch-targets.ts` | Modified | Pre-existing lint fix: `@ts-ignore` → `@ts-expect-error` |
| `sheet-music-app/.paul/phases/v44-00-full-audit/R2A-data-layer.md` | Created | Re-derived audit, 28 findings |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Notification cascade stays post-commit | Side-effect, not invariant-critical; including it in the tx would bloat contention and pull users/{uid} reads into the hot path | DL-005 perf finding remains for a later phase; DL-004 notifiedVia durability remains for Phase 3 |
| `scheduling-merge.ts` kept in place (no longer called from assign route) | Deprecation belongs to DL-011 array-shape phase; removing it now would touch tests and add scope creep | Module is dead code in the assign route but `assign-race.test.ts` still exercises the helper unit-level — those tests stay valid |
| Skipped musicians surface in response.errors instead of silent continue | The old `continue` masked a real UX bug where re-inviting after decline silently no-op'd; explicit error string lets the client UI show "already assigned" | Client UI may need a small adjustment to display response.errors entries — not blocking, but documenting for v44-03 client-async-safety phase |
| Pre-existing `@ts-ignore` lint error fixed | User directive: no skipping preexisting bugs | Lint output is now genuinely clean; future phase verifications will catch new issues without false-positive noise |
| R2A-data-layer.md re-derived from scratch | Original synthesis lost; planning Phase 1 properly required real findings, not the SUMMARY paraphrase | 28 findings documented and routed; v4.4 Phases 2-7 now have a reference document for their scope |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 2 | Essential — neither was scope creep |
| Scope additions | 2 | Both pre-approved by user directive ("don't skip preexisting bugs") |
| Deferred | 0 | None — plan executed |

**Total impact:** Plan completed as written; the two scope additions (R2A re-derivation, lint fix) were authorized by user directive before APPLY started.

### Auto-fixed Issues

**1. [Test infra] Shared `mock-firebase-admin.ts` transaction.get unable to model query snapshots**
- **Found during:** Task 3 (assign route restructure broke `assignment-auth.test.ts`)
- **Issue:** Shared mock's `transaction.get(ref)` returned a doc-only shape; new assign code calls `transaction.get(activeAssignmentsQuery)` which needs `.docs` / `.empty`.
- **Fix:** Mock's `transaction.get` now returns a union shape (DocumentSnapshot fields + QuerySnapshot fields); `.where()` chain made fully chainable so `.where().where()` works; `assignment-auth.test.ts` seeds an active assignment doc to match the new canonical-rebuild contract.
- **Files:** `src/__tests__/mock-firebase-admin.ts`, `src/__tests__/assignment-auth.test.ts`
- **Verification:** Both files green; full suite 1280/1280
- **Commit:** `5ca54c4` (bundled with Task 3)

**2. [Lint] Pre-existing `@ts-ignore` in scripts/audit-touch-targets.ts**
- **Found during:** Phase 1 verification (`npm run lint`)
- **Issue:** `@ts-ignore` does nothing if the suppressed line has no error; eslint flags it.
- **Fix:** Switched to `@ts-expect-error`.
- **Files:** `scripts/audit-touch-targets.ts:14`
- **Verification:** `npm run lint` — clean.
- **Commit:** `cf912cc`

### Scope Additions

**1. R2A-data-layer.md re-derivation**
- The plan originally referenced `.paul/phases/v44-00-full-audit/R2A-data-layer.md` which turned out to never have been persisted. User directive on first PLAN review: "if you need to remake it, then remake it." Spawned a write-capable subagent to perform a full data-layer scan; produced 28-finding document. Plan was then rewritten to cover the right Phase-1 scope (DL-001/002/003/012 plus opportunistic DL-013/014 in the same files).

**2. State-machine guards (DL-013, DL-014)**
- Originally would have been deferred to a later state-machine phase. User directive: "don't skip over bugs or things that are preexisting just because they're preexisting." Both fixes are 5 lines each and live in the same routes already being touched — folding them in was strictly cheaper than a separate phase later.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Existing `unassign.test.ts` expected old shape `setlistRef.update({...})` (1-arg); my change moves it to `transaction.update(setlistRef, {...})` (2-arg) | Test mock rewritten with ref-tagged objects so `transaction.update(ref, data)` routes by `ref.__kind` to the right spy |
| Existing `respond.test.ts` decline assertion missing `assignedUids` | Updated assertion to verify both fields are written together |
| Vitest schema-validation failures in atomicity tests caused by short test emails (`m1@x` rejected by Zod's email validator) | Fixed all test fixtures to use `@example.com` addresses |
| Pre-existing `package.json` and `src/build-info.json` version bumps from auto-running `update-build-info.js` during `npm run build` | Carried into the pending SUMMARY commit (alongside STATE/ROADMAP updates) |

## Next Phase Readiness

**Ready:**
- v44-02 (denormalization reconciliation, DL-010): the `scheduling_assignments` collection is now the authoritative source of truth for `setlists.musicians[]` per the canonical-rebuild pattern established here. The rename fan-out work in v44-02 will benefit from this clean separation.
- v44-03 (client async safety, DL-011 + UX): the new `response.errors` entries from assign need a small client-side toast/UI update — captured for that phase.
- v44-07 (type safety tail): the new SetlistMusicianEntry type in three files is a minor candidate for hoisting to a shared type module if v44-07 picks up that pattern.
- Atomicity regression test pattern (ref-tagged transaction mock + tx commit log) reusable for future single-tx invariants.

**Concerns:**
- The notification cascade still does N+1 `users/{uid}` reads in the post-commit loop (DL-005). Bulk-assigning 12 musicians is 12 sequential reads. Slated for v44-08 perf phase.
- `scheduling-merge.ts` is now dead code in the assign route but still has unit tests in `assign-race.test.ts`. Removal coordinated with the v44-04 file-splits / DL-011 array-shape phase.
- The mock-firebase-admin.ts change makes `transaction.get` return a union-shape snapshot — any future test relying on the old doc-only shape will see extra `.docs/.empty` properties (additive, not breaking, but worth noting).

**Blockers:** None. Phase 1 is the only Phase-1 plan (single-plan phase per ROADMAP); transition to Phase 2 follows.

---
*Phase: v44-01-data-atomicity, Plan: 01*
*Completed: 2026-04-15*
