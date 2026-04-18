---
phase: v44-02-denorm-reconciliation
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/api/profile/update/route.ts
  - src/app/api/setlist/rename/route.ts
  - src/lib/users-firebase.ts
  - src/hooks/use-setlist-logic.ts
  - src/app/api/profile/update/__tests__/update.test.ts
  - src/app/api/setlist/rename/__tests__/rename.test.ts
autonomous: true
---

<objective>
## Goal
Close the denormalization-drift gap surfaced by R2A DL-010: every reader of `scheduling_assignments.{musicianName, musicianPhone, setlistName, assignedByName}` today reads a copy frozen at assignment-create time. When the user renames themselves or a band leader renames a setlist, those copies go stale — reminder emails, SMS, in-app notifications, calendar feeds, and history analytics all show wrong names until the assignment is terminal.

Ship server-side fan-out on every rename so the denormalized copies stay in sync with the source of truth.

## Purpose
Closes v4.4 R2A **DL-010 (P1)** — the highest-severity drift finding in the audit. Also closes a minor adjacent gap: `musicianPhone` drift, which is in the same shape but was not separately numbered.

DL-019 (transfer atomicity) partially overlaps because setlist-rename shares the `ownerName` fan-out concern after a transfer. Not in scope for this plan — transfer stays as Phase 2/5 work; the renames that matter operationally are displayName and setlist.name.

Per user directive "don't skip preexisting bugs": while wiring the server route for user rename, the existing client-side `updateUserDisplayName` in `users-firebase.ts` writes directly to Firestore with no fan-out, no validation, no audit trail. That direct write becomes the server route under this plan.

## Output
- `POST /api/profile/update` — authenticated self-update of `displayName` and `phone` with atomic batched fan-out across `scheduling_assignments` where `musicianUid == uid` or `assignedBy == uid`.
- `POST /api/setlist/rename` — authenticated (`isOwner || isBandLeader || isAdmin`) rename of a setlist with batched fan-out across `scheduling_assignments` where `setlistId == id`.
- `updateUserDisplayName` in `src/lib/users-firebase.ts` re-pointed to the new API route.
- `use-setlist-logic.ts` detects name-only changes and calls the new rename route (name stripped from the generic `updateSetlist` payload only when changed; non-name saves unchanged).
- Regression tests that fail if the fan-out stops running or mis-targets docs.
</objective>

<context>
## Project Context
@.paul/PROJECT.md
@.paul/ROADMAP.md
@.paul/STATE.md
@.paul/phases/v44-00-full-audit/R2A-data-layer.md
@.paul/phases/v44-01-data-atomicity/v44-01-SUMMARY.md

## Source Files
@src/app/api/scheduling/assign/route.ts
@src/app/api/scheduling/unassign/route.ts
@src/lib/users-firebase.ts
@src/hooks/use-setlist-logic.ts
@src/lib/api-wrapper.ts
</context>

<skills>
## Required Skills (from SPECIAL-FLOWS.md)

Client wiring in `use-setlist-logic.ts` and `settings/page.tsx` is mechanical (swapping a call target), not UI/UX design. `/ui-ux-pro-max` NOT required for this plan.

| Skill | Priority | When to Invoke | Loaded? |
|-------|----------|----------------|---------|
| (none) | — | — | — |
</skills>

<acceptance_criteria>

## AC-1: Profile update fans out to scheduling_assignments
```gherkin
Given musician M has 3 scheduling_assignments where musicianUid == M.uid
  (mix of pending, confirmed, declined, cancelled statuses)
When M POSTs /api/profile/update { displayName: "New Name", phone: "+15551234" }
Then users/{M}.displayName = "New Name"
  And users/{M}.musicianProfile.phone = "+15551234"
  And ALL 3 scheduling_assignments docs have musicianName = "New Name" and musicianPhone = "+15551234"
  (including terminal-status docs — historical/reminder paths still read the denormalized fields)
```

## AC-2: Profile update fans out to assigned-by-name
```gherkin
Given band leader L has 2 scheduling_assignments where assignedBy == L.uid
When L POSTs /api/profile/update { displayName: "Rabbi New Name" }
Then scheduling_assignments where assignedBy == L.uid have assignedByName = "Rabbi New Name"
And scheduling_assignments for OTHER leaders are unchanged.
```

## AC-3: Partial updates only touch changed fields
```gherkin
Given a user with displayName "A" and musicianProfile.phone "+1234"
When they POST /api/profile/update { displayName: "B" }  (no phone)
Then musicianName on their assignments = "B"
  And musicianPhone is unchanged on all assignments
And vice versa: updating only phone leaves musicianName untouched.
```

## AC-4: Setlist rename fans out
```gherkin
Given setlist S.name = "Old" with 5 scheduling_assignments where setlistId == S
When the owner POSTs /api/setlist/rename { setlistId: S, name: "New" }
Then setlists/{S}.name = "New"
  And ALL 5 scheduling_assignments have setlistName = "New"
  And updatedAt on setlist bumped to FieldValue.serverTimestamp()
```

## AC-5: Setlist rename enforces authorization
```gherkin
Given a non-owner, non-band_leader, non-admin user
When they POST /api/setlist/rename with a setlistId they don't own
Then response status = 403
  And no writes occur.
```

## AC-6: Client rename path routes through the new endpoint
```gherkin
Given a user edits only the setlist name in the editor
When the debounced save fires
Then the API call is POST /api/setlist/rename (not a generic updateSetlist with {name})
  And other-field saves (tracks, rabbi, serviceNotes) continue to use updateSetlist unchanged.
```

## AC-7: Large-scale fan-out handled via chunked batch writes
```gherkin
Given a user with >500 scheduling_assignments (edge case: old account, long history)
When they rename themselves
Then the fan-out completes without hitting Firestore's 500-ops-per-batch limit
  And all assignments end up updated.
```

## AC-8: Concurrent rename + assign yields consistent state
```gherkin
Given an assign tx is in flight (writing a new assignment with old musicianName "A")
When a rename to "B" fires in parallel
Then the final state has either:
  - new assignment with musicianName="A", then immediately updated to "B" by the fan-out, OR
  - new assignment with musicianName="B" (rename ran first, assign used the fresh name on users/{uid} read — though current assign doesn't re-read the user doc for name; this is the acceptable outcome either way)
And there is NO state where the user has displayName="B" but an assignment permanently has musicianName="A".
```

</acceptance_criteria>

<tasks>

<task type="auto">
  <name>Task 1: Create /api/profile/update route with fan-out</name>
  <files>src/app/api/profile/update/route.ts</files>
  <action>
    New route following the createApiHandler pattern (see src/app/api/scheduling/unassign/route.ts for shape).

    Schema (zod):
      displayName: z.string().min(1).max(100).optional()
      phone: z.string().max(30).nullable().optional()  // null = clear
    Refine: at least one field must be present.

    Role gate: any authenticated member (any role). No role-specific gate — it's a self-update.

    Rate limit: checkRateLimit(ctx.req, 'api') — rename is user-initiated, low frequency, shared 'api' tier fine.

    Handler:
    1. Build userDocUpdate object: { displayName? , 'musicianProfile.phone'? } (only fields actually in the body).
       - If phone is null → use FieldValue.delete() so the field is removed cleanly.
    2. Update users/{ctx.auth.uid} (this is a plain update, no tx — the source write is single-doc and atomic by itself).
    3. Build the fan-out work list:
       - If displayName changed: query scheduling_assignments where musicianUid == ctx.auth.uid → update musicianName = displayName.
       - If displayName changed: query scheduling_assignments where assignedBy == ctx.auth.uid → update assignedByName = displayName.
       - If phone key present: query scheduling_assignments where musicianUid == ctx.auth.uid → update musicianPhone.
       Collapse overlaps: both musicianUid queries return the same doc set — collect ids once, merge update payload.
    4. Execute chunked batched writes:
       - Helper `chunkBatchUpdate(db, refs, updatePayload, chunkSize=400)` — 400 leaves headroom for Firestore's 500-op limit (each doc write = 1 op).
       - Parallelize chunks with Promise.all but cap at 5 concurrent batches to avoid Firestore throttle.
    5. Return { success: true, updated: { assignments: N, assigner: M } }.

    Error shapes: `apiError("VALIDATION_ERROR", 400, "VALIDATION_ERROR")` handled by createApiHandler; specific fan-out partial-failure → log and return 207-like result in the body (success:true, errors: [...]) rather than throwing, because the source user doc write is already committed and rolling it back is worse than partial denorm drift.

    Important: do NOT put the fan-out inside a runTransaction — the whole point of the change is fire-off a batched fan-out that works across arbitrary numbers of docs. Transactions cap at 500 ops and one read-write set. This is a legitimate post-commit fan-out.

    Log: logger.info(`[Profile] rename fan-out uid=${ctx.auth.uid} assignments=${N} assigner=${M}`).

    Avoid:
    - Touching Firebase Auth display name (not this plan's concern; unassign already re-reads displayName from Firestore anyway).
    - Modifying email (authentication concern, separate route).
    - Modifying other musicianProfile fields (notificationPreferences, etc.) — out of scope.
  </action>
  <verify>
    - `npx vitest run src/app/api/profile/update/__tests__/update.test.ts` — all new cases pass.
    - `npx tsc --noEmit` clean.
    - `grep -n "runTransaction" src/app/api/profile/update/route.ts` returns zero matches.
  </verify>
  <done>AC-1, AC-2, AC-3, AC-7 satisfied for the profile-update path.</done>
</task>

<task type="auto">
  <name>Task 2: Create /api/setlist/rename route with fan-out</name>
  <files>src/app/api/setlist/rename/route.ts</files>
  <action>
    New route at `src/app/api/setlist/rename/route.ts`.

    Schema:
      setlistId: z.string().min(1)
      name: z.string().min(1).max(200)

    Role gate: create with role: 'band_leader' + in-handler check for (isOwner || isBandLeader || isAdmin) — see src/app/api/setlist/flush/route.ts:77-80 for the pattern.

    Rate limit: checkRateLimit(ctx.req, 'api').

    Handler:
    1. Read setlists/{setlistId}; 404 if not found.
    2. Authorization: if (!isOwner && !ctx.auth.isBandLeader && !ctx.auth.isAdmin) → 403.
       (Owner check: setlist.ownerId === ctx.auth.uid.)
    3. If setlist.name === body.name → no-op, return { success: true, updated: { assignments: 0 } }. No fan-out needed.
    4. Update setlists/{setlistId} with { name, updatedAt: FieldValue.serverTimestamp() }.
    5. Fan out: query scheduling_assignments where setlistId == setlistId → chunkBatchUpdate(refs, { setlistName: name }).
    6. Return { success: true, updated: { assignments: N } }.

    Extract the `chunkBatchUpdate` helper into a shared location so Task 1 + Task 2 can reuse it: `src/lib/firestore-batch.ts` with:
      export async function chunkBatchUpdate(
        db: FirebaseFirestore.Firestore,
        refs: FirebaseFirestore.DocumentReference[],
        data: Record<string, unknown>,
        opts?: { chunkSize?: number; maxConcurrent?: number }
      ): Promise<{ updated: number; errors: Error[] }>

    Avoid:
    - Coupling to updateSetlist's runTransaction path. Rename is a single-field, user-intentional write; no concurrent-edit banner needed.
    - Firing any notifications (publish/notify-updated is a separate flow).
  </action>
  <verify>
    - `npx vitest run src/app/api/setlist/rename/__tests__/rename.test.ts` — new cases pass.
    - `npx tsc --noEmit` clean.
    - `grep -n "chunkBatchUpdate" src/` — referenced from both new routes + the lib file.
  </verify>
  <done>AC-4, AC-5, AC-7 satisfied.</done>
</task>

<task type="auto">
  <name>Task 3: Rewire clients to call the new routes</name>
  <files>src/lib/users-firebase.ts, src/hooks/use-setlist-logic.ts</files>
  <action>
    **users-firebase.ts:**
    - Replace `updateUserDisplayName(uid, displayName)` body with an apiFetch POST to `/api/profile/update` with body `{ displayName }`. Keep the function signature so callers don't change.
    - Import apiFetch from `@/lib/apiFetch` (pattern used by other client → server calls — check neighbors).
    - Remove the direct Firestore `updateDoc(doc(db, "users", uid), { displayName })` call.

    **use-setlist-logic.ts:**
    - Add a ref `lastSavedNameRef` tracking the most recent name that was saved (initialized from initial name prop).
    - In performSave: after computing dataToSave, if `dataToSave.name !== lastSavedNameRef.current` AND `id` exists:
      1. Call apiFetch POST `/api/setlist/rename` with { setlistId: id, name: dataToSave.name }; await.
      2. Update lastSavedNameRef.current = dataToSave.name.
      3. Strip `name` from dataToSave before the updateSetlist call (so the rename isn't double-written — the server already wrote it).
    - If name unchanged, behavior is identical to today.
    - On create (no id yet), no change — createSetlist flow is unaffected (the assignment fan-out has no assignments yet to reconcile).
    - Error handling: if the rename API call fails, surface via the existing toast pattern (reportSaveError or setlist-save-error). Do NOT fall through to the old direct updateSetlist with name — that would silently bypass the fan-out.

    Avoid:
    - Calling both the rename route AND updateSetlist with name in the same save — that's a double-write.
    - Changing the createSetlist path.
    - Touching `setlist/flush/route.ts` (unload flush) — unload saves don't typically include name changes (name is saved by blur/debounce well before unload).
  </action>
  <verify>
    - `grep -n "updateDoc.*users.*displayName" src/lib/users-firebase.ts` — no matches (direct write removed).
    - `grep -n "/api/profile/update\\|/api/setlist/rename" src/lib/ src/hooks/` — exactly one caller each.
    - Existing tests covering settings-page rename still pass (they shouldn't care about implementation).
    - Existing setlist-editor tests still pass.
  </verify>
  <done>AC-6 satisfied; Tasks 1 and 2 are now exercised by real client paths.</done>
</task>

<task type="auto">
  <name>Task 4: Regression test suite for profile/update + setlist/rename</name>
  <files>src/app/api/profile/update/__tests__/update.test.ts, src/app/api/setlist/rename/__tests__/rename.test.ts</files>
  <action>
    Two new test files. Follow the mock pattern established in `src/app/api/scheduling/__tests__/atomicity.test.ts` — ref-tagged doc mocks with chunked batch support.

    **update.test.ts cases (map to ACs):**

    1. `fans_out_displayName_to_musician_assignments` (AC-1 half): seed 3 assignments with musicianUid == uid (mixed statuses). POST displayName change. Assert all 3 have updated musicianName including terminal-status ones.

    2. `fans_out_displayName_to_assigner_assignments` (AC-2): seed 2 assignments with assignedBy == uid. POST displayName. Assert all 2 have updated assignedByName. Seed one OTHER assignment with assignedBy == different uid; assert it's untouched.

    3. `fans_out_phone_independently` (AC-3): POST only {phone}. Assert musicianPhone updated on assignments, musicianName untouched.

    4. `fans_out_both_fields_single_batch` (AC-1, AC-3 combined): POST both displayName AND phone. Assert both fields updated in the same batch (no double-write).

    5. `partial_no_change_is_noop` (AC-3 edge): POST {displayName: "Same As Current"} where users/{uid}.displayName already equals that. Assert no fan-out writes (0 assignment updates). Return success.

    6. `chunks_large_fan_out` (AC-7): mock 900 matching assignments. Assert chunkBatchUpdate was called with 3 batches (400 + 400 + 100). Assert total updated count in response.

    7. `validates_input`: empty body → 400 VALIDATION_ERROR; both fields missing → 400 (refine check).

    **rename.test.ts cases (map to ACs):**

    8. `rename_updates_setlist_and_fans_out` (AC-4): seed setlist + 3 assignments with setlistId. POST rename. Assert setlist.name updated, updatedAt bumped, 3 assignments have setlistName updated.

    9. `rename_noop_when_name_unchanged` (AC-4 edge): POST same name. Assert no writes to setlist or assignments.

    10. `rename_403_for_non_owner_non_leader` (AC-5): mockAuth as 'musician' (no isOwner, no isBandLeader, no isAdmin). Seed a setlist not owned by that uid. POST rename. Assert 403 and no writes.

    11. `rename_band_leader_can_rename_others_setlist` (AC-5 complement): band_leader role, non-owner. Assert 200 and fan-out ran.

    12. `rename_404_for_missing_setlist` (AC-4 edge): setlist doesn't exist. Assert 404.

    Use realistic email formats (`@example.com`) — the Phase 1 tests already landed on this gotcha in zod email validation.
  </action>
  <verify>
    - `npx vitest run src/app/api/profile/update/__tests__ src/app/api/setlist/rename/__tests__` — 12 cases all green.
    - Full suite: `npx vitest run` ≥ prior count + 12.
    - `npx tsc --noEmit` clean.
    - `npm run lint` clean.
    - `npm run build` clean.
  </verify>
  <done>All 8 ACs covered by at least one passing test.</done>
</task>

</tasks>

<boundaries>

## DO NOT CHANGE
- `src/app/api/scheduling/{assign,unassign,respond}/route.ts` — Phase 1 just landed; do not modify.
- `src/app/api/setlist/{flush,publish,transfer,delete}/route.ts` — flush/publish have distinct concerns; transfer is DL-019 (future phase).
- `src/lib/api-wrapper.ts`, `src/lib/rate-limit.ts`, `createApiHandler` contract.
- `src/lib/setlist-firebase.ts#updateSetlist` — still called for all non-name field changes; only the name branch is hoisted out.
- `firestore.rules`, `firestore.indexes.json` — fan-out queries use existing `musicianUid`, `assignedBy`, `setlistId` where-clauses. If any composite index is missing, add it — but verify first, don't speculate.
- Firebase Auth display name (different system, different concerns).

## SCOPE LIMITS
- Email address fan-out NOT in this plan. Email changes are rare and managed at the Auth layer; drift impact is minimal; scope creep.
- `ownerName` fan-out after a transfer — that's DL-019 (transfer atomicity), future plan.
- DL-011 (setlist.musicians array shape refactor) — not in this plan.
- No migration of historical docs with drifted denorm (one-shot admin migration can be added later if needed; this plan stops the bleed for new renames).
- No changes to notification channels (SMS, push, email). They'll pick up the fresh denorm values automatically on their next read.
- No UI changes beyond the wiring swap in `use-setlist-logic.ts` and `users-firebase.ts`.

</boundaries>

<verification>
Before declaring plan complete:
- [ ] `npx vitest run` — full suite green; net count = prior 1280 + 12 = 1292 (±).
- [ ] `npx tsc --noEmit` — clean.
- [ ] `npm run build` in `sheet-music-app/` — clean (catches route.ts export violations).
- [ ] `npm run lint` — clean.
- [ ] Grep confirms direct `updateDoc(doc(db, "users", uid), { displayName })` is gone from `users-firebase.ts`.
- [ ] Grep confirms `/api/setlist/rename` is called from `use-setlist-logic.ts` name-change branch.
- [ ] Grep confirms `chunkBatchUpdate` is in `src/lib/firestore-batch.ts` and used by both new routes.
- [ ] AC-8 invariant held by code-inspection review (no test harness models two Firestore writes in true parallel; eventual consistency is the design).
</verification>

<success_criteria>
- User rename propagates to all of their assignment denormalized fields + assigner fields in one round-trip.
- Setlist rename propagates to all denormalized setlistName copies.
- Fan-out correctly chunks at 400 per batch and handles >500-assignment users.
- Client paths go through the server routes — no more direct Firestore displayName writes from the browser.
- 12 new regression tests lock the invariants in.
- Zero regression in existing 1280 tests.
</success_criteria>

<output>
After completion, create `.paul/phases/v44-02-denorm-reconciliation/v44-02-SUMMARY.md` with:
- Diff summary per file.
- Before/after test count.
- Which DL findings closed (010; adjacent phone drift).
- Any surprises with chunkBatchUpdate helper (placement, naming).
- Commit hashes pushed to origin/master.
</output>
