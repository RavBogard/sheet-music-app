---
phase: v44-01-data-atomicity
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/api/scheduling/assign/route.ts
  - src/app/api/scheduling/unassign/route.ts
  - src/app/api/scheduling/respond/route.ts
  - src/app/api/scheduling/__tests__/atomicity.test.ts
autonomous: true
---

<objective>
## Goal
Make every mutation of `scheduling_assignments` and its parent `setlists/{id}.musicians` / `assignedUids` atomic. No more split-transaction read-modify-write on the setlist's denormalized musicians array. While in these handlers, close the two adjacent state-machine gaps that let invalid transitions through.

## Purpose
Closes four P0/P1 findings from R2A:

- **DL-001 (P0)** — `assign`'s setlist-musicians merge runs in a separate transaction from the per-musician assignment create. Concurrent assign ↔ unassign/decline can leave the denormalized array drifted from the assignments collection.
- **DL-002 (P0)** — `respond`'s decline path updates `setlists/{id}.musicians` outside the status transaction via a naked read-filter-write. Two concurrent declines clobber each other; `assignedUids` also forgotten.
- **DL-003 (P0)** — `unassign` has the same split-tx pattern; also maintains `assignedUids` inconsistently with `respond`.
- **DL-012 (P1)** — concurrent assigns for the same musician with differing instruments drift between the assignment doc (one instrument) and the setlist's denormalized musicians[] (the other). Subsumed by rebuilding the merge from the authoritative assignments snapshot.

Plus two state-machine guards in the same files that the user has instructed me to fix while I'm there:

- **DL-013 (P2)** — `assign`'s dedup check ignores status; re-inviting a `declined` or `cancelled` musician silently no-ops.
- **DL-014 (P2)** — `unassign` has no status guard; a leader cancel after a musician decline overwrites `declined` with `cancelled` and loses `declineReason`.

## Output
- Single-transaction mutation of assignment + setlist doc in all three handlers.
- `assign`'s setlist-musicians merge reconstructs `musicians[]` + `assignedUids[]` from the canonical `scheduling_assignments` snapshot read inside the same transaction (fixing DL-012 by construction).
- `assign` allows re-invitation of a previously declined/cancelled musician: creates a fresh assignment doc when the existing one is terminal.
- `unassign` rejects transitions from `declined` / `cancelled` / non-active states with a distinct error; preserves `declineReason`.
- Regression test suite encoding the atomicity and state-machine invariants.
</objective>

<context>
## Project Context
@.paul/PROJECT.md
@.paul/ROADMAP.md
@.paul/STATE.md
@.paul/phases/v44-00-full-audit/SUMMARY.md
@.paul/phases/v44-00-full-audit/R2A-data-layer.md

## Source Files
@src/app/api/scheduling/assign/route.ts
@src/app/api/scheduling/unassign/route.ts
@src/app/api/scheduling/respond/route.ts
@src/lib/scheduling-merge.ts
</context>

<skills>
## Required Skills (from SPECIAL-FLOWS.md)

No frontend work in this plan. `/ui-ux-pro-max` is not required.

| Skill | Priority | When to Invoke | Loaded? |
|-------|----------|----------------|---------|
| (none) | — | — | — |
</skills>

<acceptance_criteria>

## AC-1: Assign mutates assignment + setlist atomically from canonical source
```gherkin
Given setlist S has an existing assignment for musician A (status=confirmed)
  And musician A is in setlists/S.musicians
When a band leader POSTs /api/scheduling/assign with musicians [A, B]
Then within a Firestore runTransaction for each new musician:
  - scheduling_assignments doc is created for B (one per musician)
  - B is added to setlists/S.musicians with the passed instrument
  - A is NOT duplicated
  - assignedUids is rebuilt from the scheduling_assignments snapshot read inside that same transaction, not from the request payload
And the new denormalized state exactly matches the scheduling_assignments collection.
```

## AC-2: Decline is atomic across assignment + setlist
```gherkin
Given a pending assignment exists for musician M on setlist S
  And M is in setlists/S.musicians and setlists/S.assignedUids
When M posts /api/scheduling/respond { action: 'decline' } and it commits
Then within a single runTransaction:
  - scheduling_assignments/{id}.status = 'declined'
  - setlists/{S}.musicians no longer contains M (keyed by uid)
  - setlists/{S}.assignedUids no longer contains M.uid
  - respondedAt is set via FieldValue.serverTimestamp()
And no reader can observe {status: 'declined'} while musicians[] still contains M.
```

## AC-3: Unassign is atomic across assignment + setlist
```gherkin
Given a pending or confirmed assignment exists for musician M on setlist S
When a band leader posts /api/scheduling/unassign { assignmentId } and it commits
Then within a single runTransaction:
  - scheduling_assignments/{id}.status = 'cancelled'
  - setlists/{S}.musicians drops M
  - setlists/{S}.assignedUids drops M.uid
And the cancellation notifications fire only AFTER the transaction commits.
```

## AC-4: Concurrent assign + decline + unassign yield consistent denormalized state
```gherkin
Given setlist S and musicians [M1, M2]
When /assign[M1, M2], /respond decline for M1, and /unassign for a pre-existing M3 all fire in parallel
Then the final state has exactly:
  - musicians[] = [M2, (any pre-existing non-M3 confirmed entries)]
  - assignedUids = musicians[].uid
  - scheduling_assignments matches: one confirmed/pending for M2, one declined for M1, one cancelled for M3
And no request's denormalization write silently overwrites another's.
```

## AC-5: Re-inviting a declined or cancelled musician creates a fresh assignment
```gherkin
Given musician M previously declined or was cancelled from setlist S
When a band leader posts /api/scheduling/assign with musicians containing M
Then a new scheduling_assignments doc is created for (S, M) with status='pending' (or 'confirmed' if core tier)
And the prior terminal-status doc is left untouched (kept for history)
And M reappears in setlists/S.musicians
And the response reports M in `assigned` count (not silently skipped).
```

## AC-6: Unassign rejects invalid transitions and preserves decline metadata
```gherkin
Given an assignment currently has status 'declined' or 'cancelled'
When a band leader posts /api/scheduling/unassign { assignmentId }
Then the server returns 400 with an INVALID_TRANSITION-shaped error
And the assignment doc is unchanged (status, declineReason, respondedAt intact)
And no cancellation notifications are sent.
```

## AC-7: Notification cascade unchanged, only fires on successful commit
```gherkin
Given any of the three transactions above
When the transaction throws (e.g. contention retry exhausted, precondition failure)
Then no email, SMS, FCM, or in-app notification fires for that operation
And when it commits, notifications fire exactly once per enabled channel.
```

</acceptance_criteria>

<tasks>

<task type="auto">
  <name>Task 1: Atomic unassign with state-machine guard</name>
  <files>src/app/api/scheduling/unassign/route.ts</files>
  <action>
    Rewrite the transaction at L31-44 to cover both docs:
    - tx.get(assignmentRef) — existing
    - tx.get(setlistRef) where setlistRef = db.collection('setlists').doc(data.setlistId) — new
    - Inside the tx, after NOT_FOUND check:
      - Add status guard: if data.status !== 'pending' && data.status !== 'confirmed' throw new Error('INVALID_TRANSITION:' + data.status)
      - tx.update(assignmentRef, { status: 'cancelled', respondedAt: FieldValue.serverTimestamp() })
      - If setlistDoc.exists: read setlists/{S}.musicians, filter out data.musicianUid, tx.update(setlistRef, { musicians: filtered, assignedUids: filtered.map(m => m.uid).filter(Boolean) })
    - Return `data` from the tx for downstream notifications.
    Extend the catch block to handle INVALID_TRANSITION — return 400 with { error: 'Cannot cancel', currentStatus } mirroring respond's ALREADY_{status} shape.

    Keep the `freshName` re-read (L56-65) OUTSIDE the transaction — it's read-only and would bloat contention.
    Keep all notification side-effects OUTSIDE the transaction (unchanged).
    Remove the legacy `setlistRef.update(...)` block at L134-148 — it is now redundant.

    Avoid: reading users/{uid} inside the transaction (contention); changing notification fire-and-forget semantics (separate phase — DL-004); rewriting scheduling-merge.ts (DL-011 is separate).
  </action>
  <verify>
    - `grep -n "setlistRef.update\|setlistRef\\.update" src/app/api/scheduling/unassign/route.ts` — only matches inside the runTransaction callback.
    - `npx vitest run src/app/api/scheduling/__tests__/atomicity.test.ts -t unassign` — passes new unassign + invalid-transition tests.
    - `npx tsc --noEmit` clean for that file.
  </verify>
  <done>AC-3, AC-6, AC-7 satisfied for the unassign path.</done>
</task>

<task type="auto">
  <name>Task 2: Atomic decline with assignedUids maintenance in respond</name>
  <files>src/app/api/scheduling/respond/route.ts</files>
  <action>
    Extend the runTransaction at L30-57 so the decline path also mutates setlist musicians/assignedUids atomically:
    - After the existing validation (exists, FORBIDDEN check, ALREADY_{status} check):
      - If action === 'decline', tx.get(setlists/{data.setlistId}).
      - Compute filtered = musicians.filter(m => m.uid !== ctx.auth.uid); assignedUids = filtered.map(m => m.uid).filter(Boolean).
      - tx.update(setlistRef, { musicians: filtered, assignedUids }) only if the setlist doc exists.
    - For action === 'accept', leave setlist untouched (musician was added at assign time, no change needed).

    Delete the post-transaction block at L99-112 ("If declined, remove from the setlist's musicians array") entirely — its responsibility moved into the tx.

    Keep the assigner notification at L78-97 OUTSIDE the transaction (side-effect, non-invariant — DL-010/021 handle it separately).

    Avoid: touching the ALREADY_{status} / FORBIDDEN / NOT_FOUND error shapes (clients depend on them); putting the assigner-notification notifRef.add inside the tx.
  </action>
  <verify>
    - `grep -nE "setlistRef\\.(update|get)" src/app/api/scheduling/respond/route.ts` — all matches inside the runTransaction.
    - `npx vitest run src/app/api/scheduling/__tests__/atomicity.test.ts -t decline` — new decline tests pass.
    - `npx tsc --noEmit` clean.
  </verify>
  <done>AC-2, AC-4 (decline half), AC-7 satisfied.</done>
</task>

<task type="auto">
  <name>Task 3: Atomic assign — fold setlist-merge into per-musician tx, rebuild denorm from canonical source, allow re-invite</name>
  <files>src/app/api/scheduling/assign/route.ts</files>
  <action>
    Restructure the handler so the per-musician work and the setlist-musicians merge collapse into a single transaction per musician, reading the authoritative `scheduling_assignments` snapshot for that setlist inside the tx and using it as the baseline for `musicians[]` / `assignedUids[]`.

    For each musician in the request:
    - Detect new songs (unchanged — this is a read-only analytics step outside the tx; OK to keep before).
    - runTransaction:
      1. Read all scheduling_assignments for this setlistId where status in ('pending','confirmed') — query snapshot inside the tx. Use a prepared Query object; Firestore Admin SDK supports tx.get(query).
      2. Read setlists/{setlistId}.
      3. Check if this specific musician already has a NON-TERMINAL (pending/confirmed) assignment:
         - If yes → return { skipped: true, reason: 'already_active' }; don't write.
         - If no (including: prior declined/cancelled doc exists, or no doc) → proceed to create a new doc.
           This closes DL-013: declined/cancelled musicians can be re-invited.
      4. tx.set(newAssignmentRef, assignmentData) — same shape as today.
      5. Rebuild musicians[]/assignedUids from the (existing non-terminal assignments snapshot) + (the new assignment we're about to create):
         - Map each active assignment to { uid, name, email, instrument }
         - For the incoming musician, use the instrument/name/email passed in the request (they're the most authoritative — it's what the leader just selected).
         - For existing active assignments, use the stored denormalized fields on those assignment docs (fixing DL-012: authoritative source is the assignments collection, not whatever other concurrent handlers pass).
         - Dedup by uid, preserving guest entries (uid-less entries) from the existing setlist.musicians[] that aren't represented in assignments (library-only guests — keep them).
         - tx.update(setlistRef, { musicians, assignedUids }).
      6. Return the new assignment ref or null if skipped.

    After the transaction returns, run the existing notification cascade unchanged (email, SMS, in-app, FCM).

    Remove the trailing standalone setlist-merge transaction at L198-215 entirely — folded into the per-musician tx.

    Because each musician gets its own tx, a bulk assign of N musicians is N transactions that each see the latest snapshot. No more "read once outside the loop, merge at the end" ambiguity.

    Avoid:
    - Reading users/{uid} inside the tx (DL-005 is a separate performance phase — leave the existing N+1 preference reads alone for now, BUT move them OUT of the assignment tx so they don't bloat contention — do the preference read between tx-commit and notification-send, as it is today).
    - Changing the request schema.
    - Changing the response shape; keep `{ success, assigned, errors }` identical. Map skipped===true musicians into `errors` with a clear "already has active assignment" message so the client UI can surface that (instead of today's silent `continue`).
    - Touching guest (uid-less) entries on setlist.musicians[]: preserve them verbatim.
  </action>
  <verify>
    - `grep -n "runTransaction" src/app/api/scheduling/assign/route.ts` — exactly one runTransaction call site (the per-musician one).
    - `grep -n "db.collection('setlists').doc(setlistId).update\\|mergeNewMusicians" src/app/api/scheduling/assign/route.ts` — no matches (the old merge is gone; scheduling-merge.ts becomes unused in this route — leave it in place for now; its deprecation belongs in Phase 2 if anywhere).
    - `npx vitest run src/app/api/scheduling/__tests__/atomicity.test.ts -t "assign\\|re-invite\\|concurrent"` — all assign/re-invite/concurrency tests pass.
    - `npx tsc --noEmit` clean.
  </verify>
  <done>AC-1, AC-4 (assign half), AC-5, AC-7 satisfied.</done>
</task>

<task type="auto">
  <name>Task 4: Regression test suite — atomicity + state machine</name>
  <files>src/app/api/scheduling/__tests__/atomicity.test.ts</files>
  <action>
    Create a new vitest file following the pattern of existing sibling tests under `src/app/api/scheduling/__tests__/`. Use whatever firebase-admin test harness those files already use (likely an in-memory / mocked firestore — read the neighbors first to match the style). Use `vi.useFakeTimers()` where timestamps matter.

    Required test cases (each one maps to an AC):

    1. **unassign_atomic_single_tx (AC-3, AC-7)**: Seed a pending assignment + setlist.musicians containing the musician. Call the unassign handler. Assert post-conditions: assignment.status === 'cancelled', musicians[] filtered, assignedUids filtered, respondedAt stamped. Also assert only ONE commit was observed on the mocked tx harness.

    2. **unassign_rejects_terminal_transition (AC-6)**: Seed a declined assignment. Call unassign. Expect 400 with INVALID_TRANSITION, assignment.status still 'declined', declineReason preserved. Snapshot: no cancellation email / SMS / push fired.

    3. **decline_atomic_single_tx (AC-2, AC-7)**: Seed pending assignment + setlist.musicians. Call respond({decline}). Assert both docs mutated atomically; assignedUids also filtered.

    4. **accept_does_not_touch_setlist (AC-2 complement)**: Seed pending assignment + setlist.musicians. Call respond({accept}). Assert assignment.status === 'confirmed', setlists/{S}.musicians UNCHANGED.

    5. **assign_adds_musicians_and_rebuilds_denorm (AC-1)**: Seed setlist with one existing confirmed assignment for A. Call assign with [A, B]. Assert: only one new assignment created (for B). setlists/{S}.musicians contains exactly [A, B]. assignedUids same. A is not duplicated. The rebuild uses the assignment docs' stored instrument, not the payload's for A (AC-1 canonical-source clause).

    6. **assign_allows_reinvite_after_decline (AC-5)**: Seed a declined assignment for M. Call assign with [M]. Assert: new assignment doc created with status='pending' (or 'confirmed' if schedulingTier === 'core'). Old declined doc untouched. M reappears in musicians[]. Response.assigned includes M.

    7. **assign_skips_already_active_with_error (complement of AC-5)**: Seed a pending assignment for M. Call assign with [M]. Assert: no new assignment. Response.errors contains a message referencing "already has active assignment" for M.

    8. **concurrent_assign_decline_consistent (AC-4)**: Seed pending assignment for M1 on S. Fire Promise.all([assignHandler with [M2], respondHandler with decline on M1]). Assert final state: musicians[] = [M2], assignedUids = [M2.uid], M1's assignment.status = 'declined'. Run with several orderings (interleave the tx commits via the harness's scheduler if available, otherwise run 10× with randomized timing).

    9. **concurrent_unassign_does_not_clobber (AC-4 variant)**: Seed two pending assignments for M1 and M2 on S, both present in musicians[]. Fire Promise.all([unassign M1, unassign M2]). Assert final: musicians[] empty, both assignments.status='cancelled'. (This is the bug today — splitTX clobbers one of the removals.)

    10. **assign_preserves_guest_entries (AC-1 edge)**: Seed setlists/{S}.musicians with one guest entry (no uid) plus one uid-keyed existing musician. Call assign adding a new uid-keyed musician. Assert the guest entry survives in the final musicians[] array.

    If the existing harness doesn't support multiple concurrent transactions observably (many mocks serialize), document that in a comment and use a property-based assertion on the final state rather than timing.
  </action>
  <verify>
    - `npx vitest run src/app/api/scheduling/__tests__/atomicity.test.ts` — 10 cases, all green.
    - `npx vitest run` — full suite green; net count ≥ prior_count + 10.
    - `npx tsc --noEmit` clean.
    - `npm run lint` clean.
    - `npm run build` clean (catches any route.ts export violations — feedback_nextjs_route_exports).
  </verify>
  <done>All 7 acceptance criteria covered by at least one passing test. Gates plan completion.</done>
</task>

</tasks>

<boundaries>

## DO NOT CHANGE
- `src/lib/email-scheduling.ts`, `src/lib/sms.ts`, `src/lib/push-send.ts` — notification transport.
- `src/lib/scheduling-merge.ts` — becomes unused in assign route but leave the module in place; deprecation belongs in the DL-011 phase (Phase 2).
- `src/lib/firebase-admin.ts`, `src/lib/api-wrapper.ts`, `src/lib/rate-limit.ts` — infrastructure.
- `firestore.rules`, `firestore.indexes.json` — rules/index changes belong to DL-015/016/022/023 phases.
- `src/lib/setlist-firebase.ts` — v4.2 phase 1.1 concurrent-edit infra stays stable.
- `ctx.auth`, `ctx.body`, `createApiHandler` contract.
- `checkRateLimit` placement and 'api' tier — SEC-003/004/005 stays as-is.

## SCOPE LIMITS
- NOT tackling DL-004 (notifiedVia durability), DL-005 (N+1 user reads), DL-010 (rename fan-out), DL-011 (musicians array shape), DL-015-018/020 (query/index hardening), DL-019 (transfer atomicity), DL-022-028 (other routes) — each has its own phase in the milestone.
- No new dependencies.
- No schema migration — existing docs already have the shape we need.
- No API contract change: request schemas, role gates, response shapes identical.
- No client-side changes. SchedulingAssignModal, schedule page UI untouched.
- Guest (uid-less) setlist.musicians entries MUST be preserved verbatim — they represent library-only guests outside the assignment flow.

</boundaries>

<verification>
Before declaring plan complete:
- [ ] `npx vitest run` — full suite green. New atomicity.test.ts contributes 10 cases; total count = prior + 10.
- [ ] `npx tsc --noEmit` — clean.
- [ ] `npm run build` in `sheet-music-app/` — clean (route.ts export rule).
- [ ] `npm run lint` — clean (zero new warnings).
- [ ] Grep confirms zero non-transactional `setlists/*.update()` writes inside the three touched routes' decline/cancel/assign paths.
- [ ] Grep confirms exactly one `runTransaction` per musician in `assign/route.ts`, zero in the old trailing position.
- [ ] All 7 acceptance criteria satisfied with corresponding test case names in atomicity.test.ts.
- [ ] `scheduling-merge.ts` remains importable but is no longer called from `assign/route.ts`.
</verification>

<success_criteria>
- Assign, decline, and unassign all mutate assignment-doc and parent-setlist-doc atomically via a single `runTransaction` per operation.
- Assign's denormalized setlist.musicians and assignedUids are rebuilt from the canonical `scheduling_assignments` snapshot read INSIDE the same transaction — not from the request payload, not from a stale outside read.
- Re-invitation after decline/cancel works (new assignment doc, no silent skip).
- Unassign rejects transitions from terminal states with a clear error.
- 10 new regression tests lock down the invariants so the split-tx pattern cannot regress silently.
- Zero production regressions: notification cascade fires post-commit unchanged; error shapes unchanged; rate-limit tiers unchanged.
</success_criteria>

<output>
After completion, create `.paul/phases/v44-01-data-atomicity/v44-01-SUMMARY.md` with:
- Diff summary per route (lines changed, what moved into tx).
- Before/after test count.
- Which DL findings closed (001, 002, 003, 012, 013, 014) and which remain open for later phases.
- Commit hashes pushed to origin/master.
- Any surprises encountered during APPLY (e.g., harness limitations on concurrent-tx tests).
</output>
