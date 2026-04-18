# PAUL Handoff

**Date:** 2026-03-11
**Status:** Paused — auth fix deployed, needs testing

---

## READ THIS FIRST

**Project:** Sheet Music App (CentralReform.live)
**Core value:** Musicians can instantly access setlists, transpose charts, and control monitor mixes — live on any device, no paper or prep needed.

---

## Current State

**Milestone:** v2.5 Bugsweep & Test Coverage (paused)
**Urgent work:** Mobile login fix — deployed, needs verification

**Loop Position:**
```
PLAN ──▶ APPLY ──▶ UNIFY
  ✓        ○        ○     [v2.5 Phase 1 plan created, not applied — paused for login fix]
```

---

## What Was Done This Session

- Diagnosed mobile login redirect loop (affects ALL users, not just new ones)
- Root cause: `signInWithRedirect` causes `onAuthStateChanged` to fire with `null` first (before redirect result processed), setting `loading=false`. Second fire with user finds loading already false → login page navigates to `/setlists` before session cookie exists → middleware bounces back to `/login`
- Fix applied in `src/lib/auth-context.tsx`:
  1. Added `setLoading(true)` when `onAuthStateChanged` fires with a user — prevents premature navigation
  2. Increased session cookie sync timeout from 5s → 8s for slow mobile networks
  3. Added retry (1 attempt) for cookie sync failures with force token refresh on retry
- Committed: `0d108a4` — pushed to master, deploying to Vercel

---

## What Needs Testing

**CRITICAL — Test after Vercel deploy completes:**
1. Mobile login (iPhone/Android): Sign in with Google → should reach dashboard
2. Desktop login: Sign in with Google → should reach dashboard
3. New user login (if possible): Should reach pending approval screen
4. Existing user login: Should reach setlists page
5. Sign out → sign back in: Should work without loops

---

## What's Still Concerning

**Issues NOT yet addressed (investigate next session):**
- Session cookie sync can still fail silently (returns false) — user gets stuck on loading spinner instead of redirect loop (better but not ideal). Should show error UI.
- New user race: `subscribeToUserProfile` fires with `null` before `ensureUserProfile` creates the doc. Not a login blocker but means brief null profile state.
- No mechanism to detect "stuck loading" and offer retry to user
- The 5-minute token age check in `/api/auth/session` (line 39) could reject valid tokens if there's server/client clock skew

**Longer term:**
- Consider adding a loading timeout with user-facing retry button
- Consider awaiting `getRedirectResult` before registering `onAuthStateChanged` to eliminate the brief login-button flash during redirect flow

---

## What's Next

**Immediate:** Test the deployed fix on mobile and desktop
**If fix works:** Return to v2.5 Phase 1 — `/paul:apply` for type safety fixes
**If fix doesn't work:** Deeper investigation needed — check Vercel function logs for `/api/auth/session` errors

---

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/auth-context.tsx` | Core auth — the fix is here |
| `src/app/api/auth/session/route.ts` | Session cookie minting |
| `src/middleware.ts` | Route guard checking `__session` cookie |
| `.paul/phases/01-type-safety-fixes/01-01-PLAN.md` | v2.5 Phase 1 plan (ready to apply) |

---

## Resume Instructions

1. Test login on mobile first
2. If working: `/paul:resume` to continue v2.5
3. If broken: investigate `/api/auth/session` logs on Vercel

---

*Handoff created: 2026-03-11*
*Git: 0d108a4 on master*
