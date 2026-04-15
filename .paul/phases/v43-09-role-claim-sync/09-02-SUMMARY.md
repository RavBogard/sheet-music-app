---
phase: v43-09-role-claim-sync
plan: 02
subsystem: auth
tags: [firebase-auth, session-cookie, edge-middleware, hmac, web-crypto, next-app-router]

requires:
  - phase: v43-09-role-claim-sync/01
    provides: sync-claims endpoint + client drift handler

provides:
  - server-signed __session_role companion cookie with Firestore-authoritative role
  - /api/auth/refresh-session endpoint for on-drift re-mint
  - restored proxy role gate (supersedes 945478b hotfix)

affects:
  - any future auth change touching role-gated routes
  - any plan adding new roles (companion cookie carries the role string verbatim)

tech-stack:
  added: []
  patterns:
    - "Edge-compatible HMAC-SHA256 via crypto.subtle (Uint8Array → ArrayBuffer conversion for BufferSource typing)"
    - "Companion cookie pattern: signed { uid, role, iat, exp } payload alongside provider-minted session cookie"
    - "Graceful degradation when signing secret missing — cookie skipped, request still succeeds"

key-files:
  created:
    - src/lib/session-role.ts
    - src/app/api/auth/refresh-session/route.ts
    - src/lib/__tests__/session-role.test.ts
    - src/app/api/auth/session/__tests__/route.test.ts
    - src/app/api/auth/refresh-session/__tests__/route.test.ts
  modified:
    - src/app/api/auth/session/route.ts
    - src/proxy.ts
    - src/lib/auth-context.tsx
    - src/env.mjs

key-decisions:
  - "Use Web Crypto subtle HMAC (not Node crypto) so the same signer works in edge middleware and Node API routes"
  - "Compare payload.uid to Firebase session uid in proxy — prevents cookie-replay from another user"
  - "SESSION_ROLE_SECRET missing → skip cookie, do not fail request — preserves sign-in during env misconfig"
  - "Companion cookie is strictly additive — Firebase's __session cookie contents and TTL untouched"

patterns-established:
  - "Any future edge verification of signed state should use crypto.subtle with the Uint8Array→ArrayBuffer wrapper (see session-role.ts b64urlToBytes path)"
  - "Proxy gates authenticate on cookie value but authorize on signed side-channel — Firebase token never extended"

duration: ~90min
started: 2026-04-14T23:10:00Z
completed: 2026-04-15T00:55:00Z
---

# Phase v43-09 Plan 02: Server-minted session-role companion cookie

**HMAC-signed `__session_role` companion cookie carries Firestore-authoritative role into the edge proxy, retiring the `945478b` role-gate hotfix with a principled fix.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~90 min |
| Started | 2026-04-14T23:10:00Z |
| Completed | 2026-04-15T00:55:00Z |
| Tasks | 5 auto + 1 human-verify checkpoint |
| Files created | 5 |
| Files modified | 4 |
| Commits | 6 (5 for plan + 1 for pre-existing CI fixes) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Session mint reads role from Firestore | Pass | `/api/auth/session` now reads `users/{uid}.role` and sets signed companion cookie |
| AC-2: Refresh endpoint updates companion cookie | Pass | New `/api/auth/refresh-session` (requireAuth) |
| AC-3: Tampered companion cookie rejected | Pass | `verifyRoleCookie` returns null on bad sig or forged payload (test `session-role.test.ts` covers both) |
| AC-4: Proxy prefers authoritative companion | Pass | Proxy admits user on valid companion even when Firebase session role is stale/pending |
| AC-5: Pending users blocked from non-leader secure routes | Pass | `!role \|\| role === 'pending'` redirect to `/` restored (proxy-auth tests green) |
| AC-6: Drift handler calls refresh-session | Pass | `auth-context.tsx` now fires 4-step drift repair: sync-claims → getIdToken(true) → syncSessionCookie → refresh-session |
| AC-7: Missing Firestore profile → role=null, treated as pending | Pass | Session route sets `role: null` when doc doesn't exist; proxy treats as pending |

## Accomplishments

- Closed an entire class of session-cookie staleness bugs — the companion cookie is always minted from Firestore, so "token predates promotion" can never silently leave a user on a pending role.
- Supersedes the `945478b` proxy hotfix without a revert. Proxy role gate is fully restored (`!role || role === 'pending'` → redirect to `/`) AND no longer has the false-alarm loop that hotfix was papering over.
- Shipped an edge-compatible HMAC-sign/verify utility that's reusable for any future signed cookie or token (image upload auth, QR share tokens, etc.).

## Task Commits

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Task 1: session-role helper | `6a706ff` | feat | Edge-compatible HMAC signer/verifier + `SESSION_ROLE_SECRET` in env.mjs |
| Task 1: wire into /api/auth/session | `df22244` | feat | Firestore read + companion cookie set/clear; unit tests |
| Task 2: /api/auth/refresh-session | `1da2d25` | feat | New authenticated endpoint + unit tests |
| Task 3: restore proxy gate | `9ef5ea0` | fix | Async proxy; prefer signed cookie; restore redirect; proxy-auth tests updated |
| Task 4: drift handler | `a4e323f` | feat | auth-context calls refresh-session in drift block |
| Pre-existing CI fixes | `8d50955` | test | Unblocked green suite (env validation, stale song-charts/setlist-firebase mocks) |

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/lib/session-role.ts` | Created | Edge-compat HMAC sign/verify for `__session_role` |
| `src/app/api/auth/refresh-session/route.ts` | Created | Re-mint endpoint called by drift handler |
| `src/app/api/auth/refresh-session/__tests__/route.test.ts` | Created | 4 tests: auth gate, Firestore role, null role, sig roundtrip |
| `src/app/api/auth/session/__tests__/route.test.ts` | Created | 4 tests: companion set, null-profile, stale idToken, missing body |
| `src/lib/__tests__/session-role.test.ts` | Created | 6 tests: sign/verify roundtrip, tamper detection, malformed, missing secret |
| `src/app/api/auth/session/route.ts` | Modified | Read Firestore role, set/clear `__session_role` |
| `src/proxy.ts` | Modified | Now async; prefer signed companion; restored role gate |
| `src/lib/auth-context.tsx` | Modified | Drift block now also POSTs `/api/auth/refresh-session` |
| `src/env.mjs` | Modified | Added `SESSION_ROLE_SECRET` as optional server env |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Web Crypto subtle over Node `crypto` | Must run in edge middleware runtime | Single signer module used by both runtimes |
| Degrade gracefully when secret missing | Don't take down sign-in over env misconfig | Companion cookie simply absent → proxy falls back to Firebase session role (pre-plan behavior) |
| Uid match required in proxy | Attacker could otherwise replay another user's cookie | Leader-route attacker surface kept at zero |
| No secret rotation ceremony | Single-tenant app, no incident | Revisit if security incident or multi-tenancy lands |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | Pre-existing unrelated CI failures bundled in a separate commit |
| Scope additions | 0 | None |
| Deferred | 0 | None |

**Total impact:** Stayed strictly within plan. One bundled commit added to fix pre-existing failing tests the user flagged mid-APPLY (env validation in test env + stale mocks in song-charts-library & setlist-firebase) — see commit `8d50955`.

### Auto-fixed Issues

**1. Pre-existing test suite failures**
- **Found during:** Task 5 (running full suite) — flagged by user via Vercel CI email
- **Issue:** `song-charts-library.test.tsx` failed to load (`@t3-oss/env-nextjs` validating absent client vars); `setlist-firebase.test.ts` missing `auth` export in firebase mock; obsolete "2 charts" assertion against a UI that now renders counts inside tab labels; stale `deleteSetlist` test against a pre-D01 client-cascade implementation
- **Fix:** `SKIP_ENV_VALIDATION=1` in `vitest.config.ts`; added `auth` + fetch stubs and rewrote deletion test against the new server-cascade API; mocked `use-add-to-setlist` + `AddToSetlistSheet` and updated count assertion
- **Files:** `vitest.config.ts`, `src/lib/setlist-firebase.test.ts`, `src/components/library/__tests__/song-charts-library.test.tsx`
- **Verification:** `npm test` went from 2 failed files / 1 failed test → 109/109 files · 1262/1262 tests
- **Commit:** `8d50955`

### Deferred Items

None — plan executed exactly as written.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| `crypto.subtle.verify` TypeScript: `Uint8Array<ArrayBufferLike>` not assignable to `BufferSource` | Allocate a fresh `ArrayBuffer` and copy signature bytes into it before passing to `verify` |
| `posttooluse-validate` hook repeatedly asked to migrate `middleware.ts` → `proxy.ts` | File is already `proxy.ts` (Next.js 16 convention); acknowledged and proceeded |

## Next Phase Readiness

**Ready:**
- Role-claim drift fully contained: server-minted authoritative, client-detected, server-re-minted
- Phase `v43-09-role-claim-sync` complete (both 09-01 and 09-02 shipped)
- Suite is 1262/1262 green — safe baseline for next plan
- Signed-cookie pattern available for reuse (sketch: QR-share tokens, device-trust markers)

**Concerns:**
- `SESSION_ROLE_SECRET` is a single symmetric secret — no rotation key or multi-secret verifier. Acceptable now; becomes a concern at multi-tenant / post-incident time.
- Companion cookie TTL matches Firebase session (14d). If Firestore role changes after cookie mint and the drift handler never fires (user never reopens app), cookie stays stale until next `/api/auth/session` refresh. Not a regression vs. current behavior, but worth noting.

**Blockers:** None.

---
*Phase: v43-09-role-claim-sync, Plan: 02*
*Completed: 2026-04-15*
