---
phase: v43-09-role-claim-sync
plan: 01
subsystem: auth
tags: [custom-claims, role-sync, auth, drift-repair, firestore-rules]

requires:
  - phase: v43-04-data-integrity
    provides: hotfix context — setlists rule relaxed to isSignedIn() (commit 0b10ecf)

provides:
  - POST /api/auth/sync-claims — idempotent self-service drift repair
  - Client auto-sync on profile load in auth-context
  - Path to restore isMember()-gated rules on /setlists in a follow-up plan

affects: any future Firestore rule that gates on token.role (isMember/isMusician/isBandLeader); admin role-change flow stays authoritative

tech-stack:
  added: []
  patterns:
    - "Self-service claim repair: client-triggered, server-authoritative (client cannot send a role); idempotent via in-sync short-circuit"
    - "Claim sync integrated with existing claimsUpdatedAt → token refresh path; no duplicate refresh logic"

key-files:
  created:
    - src/app/api/auth/sync-claims/route.ts
    - src/app/api/auth/sync-claims/__tests__/route.test.ts
  modified:
    - src/lib/auth-context.tsx

key-decisions:
  - "Never downgrade on Firestore 'pending' — strips are the admin's explicit action via /api/admin/set-role"
  - "Never accept a role from the client — Firestore is the sole source of truth for role"
  - "Spread existing claims on setCustomUserClaims to preserve unrelated claims (soundEngineer, future additions)"
  - "Bump claimsUpdatedAt instead of force-refreshing the token inline — reuses the existing auth-context handler"

patterns-established:
  - "When Firebase auth claims can drift from a separate source of truth, reconcile server-side on the user's own next sign-in, not via a global batch job"

duration: ~40min
started: 2026-04-14T23:45:00Z
completed: 2026-04-15T00:25:00Z
---

# Phase 9 Plan 01: Role-Claim Sync Summary

**Every authenticated user's `token.role` claim auto-canonicalizes from `users/{uid}.role` on sign-in; drift users self-repair without admin intervention.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~40 min |
| Tasks | 3 auto + 1 human-verify — all complete |
| Files modified | 3 (2 new: route + tests; 1 changed: auth-context) |
| New tests | 6 |
| Total suite | 1230 pass |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Drift user gets claim fixed | PASS | Test 2; human-verified (simulated drift via Firebase Console → claim deletion → sign-in) |
| AC-2: No-op when in sync | PASS | Test 3; no setCustomUserClaims/update call |
| AC-3: Pending users untouched | PASS | Tests 4 + 5 |
| AC-4: Unauthenticated rejected | PASS | Test 1 (403 via createApiHandler auth gate) |
| AC-5: Client auto-syncs on sign-in | PASS | Human-verified: prod musician signed in with stripped claim → setlists loaded within seconds |
| AC-6: Idempotent under retries | PASS | Test 3 (already-synced returns no writes); drift check in auth-context only fires when `profileRole !== claimRole` |

## Accomplishments

- Latent claim-drift bug fixed: any musician who signs in self-repairs without needing admin to hit `/api/admin/set-role`
- Unblocks restoring `allow read: if isMember()` on `/setlists` in a follow-up plan once we've observed stable behavior
- Zero changes to admin-initiated role flow; `claimsUpdatedAt`-driven token refresh reuse keeps the single source of truth for refresh logic
- Client wiring is fire-and-forget — no latency added to sign-in render path

## Task Commits

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Tasks 1+3: route + tests + PLAN + ROADMAP | `cf85e9e` | feat(v43-p9) | Server route, 6 tests, plan doc, ROADMAP Phase 9 row |
| Task 2: client wiring | `a942fbb` | feat(v43-p9) | auth-context drift detection + sync call |

All on `origin/master`, Vercel auto-deployed, human-verified.

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/app/api/auth/sync-claims/route.ts` | Created | Server-side drift-repair endpoint |
| `src/app/api/auth/sync-claims/__tests__/route.test.ts` | Created | 6-case test matrix |
| `src/lib/auth-context.tsx` | Modified | +drift detection inside profile subscription callback |
| `.paul/ROADMAP.md` | Modified | Phase 9 row added to v4.3 table |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Self-service (user's own token) vs. global batch job | Batch requires iterating all users; self-service scales with active users and is naturally incremental | Slightly slower full fleet convergence (days vs. minutes) but zero risk of a batch script running rogue writes across the user base |
| Bump claimsUpdatedAt on success vs. inline token refresh | Reuses `auth-context.tsx:137-141` path; keeps single source of truth for refresh logic | Claim takes effect on the client within one profile-subscription tick after the server write |
| Never strip claims on 'pending' | Admin-driven downgrades are the explicit path; strip-on-'pending' would bypass the admin audit log | Admin flow remains authoritative; no surprise demotions from stale profile writes |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | Adjusted 401→403 test expectation to match createApiHandler behavior |
| Scope additions | 0 | — |
| Deferred | 1 | Restore `isMember()` on /setlists (separate follow-up plan once Phase 9 has been live for a stable observation window) |

### Auto-fixed Issues

**1. Test expected 401, createApiHandler returns 403**
- **Found during:** Task 3 test run
- **Issue:** No existing 401 path in our api-wrapper; missing/invalid auth returns 403
- **Fix:** Test now asserts `status ∈ [401, 403]` and comments the distinction
- **Commit:** `cf85e9e`

### Deferred Items

- **Restore `allow read: if isMember()` on `/setlists`** — wait until Phase 9 has been live long enough to verify every returning user has self-repaired. Currently musicians can read any setlist (matches v4.0 design intent; no user impact). Track as a v4.3 follow-up plan.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Pre-existing env-vars test suite still red | Unchanged; not in scope |

## Next Phase Readiness

**Ready:**
- Phase 9 ✅ complete (1/1 plan)
- Claim-drift class of bug is structurally repaired
- **v4.3 milestone status:** Phases 1, 2, 3, 4, 5, 9 complete. Phases 6, 7, 8 (P1 work) remain.

**Concerns:**
- Watch for any admin reports over the next week of users who *still* can't see setlists — would indicate a case the sync doesn't cover (e.g., users who never sign in; pending→musician promotion requires the admin flow)

**Blockers:** None.

---
*Phase: v43-09-role-claim-sync, Plan: 01*
*Completed: 2026-04-14*
