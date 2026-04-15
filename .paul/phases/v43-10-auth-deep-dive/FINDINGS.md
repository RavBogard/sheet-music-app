# FINDINGS — v4.3 P10 Auth Deep Dive (Wave 1)

**Date:** 2026-04-15
**Input:** WAVE-1A (sign-in flow), WAVE-1B (gate inventory), WAVE-1C (lifecycle), WAVE-1D (git history)
**Current suite state:** 1262/1262 green; `48914b4` proxy hotfix live on origin/master.

---

## TL;DR — What actually broke today, why, and what to do

1. **The immediate lockout (`/setlists` → `/login` loop)** was caused by a deployment-ordering failure: the proxy gate restored in `9ef5ea0` assumed `SESSION_ROLE_SECRET` was live on Vercel. It wasn't. For ~28 minutes every user hit `hasVerifiedCompanion=false` → `!role || pending` → redirect to `/` → loop.
2. **The `48914b4` hotfix** (only enforce the redirect when the companion cookie verifies) neutralizes that class of failure. The companion cookie becomes an *opt-in strictness lever*, not a trap door.
3. **But the deeper pattern is architectural.** Three layers of staleness (ID token → Firebase `__session` cookie → Firestore role) with lazy, subscription-driven repair. Every "hotfix" treats a symptom of that staleness. The signed companion cookie shipped in 09-02 is the right direction but arrived with three frailties: silent env-var dependency, fire-and-forget drift repair, no explicit refresh on cold-load.
4. **Most likely remaining failure mode today (not yet confirmed):** a race where the first link-click after sign-in precedes the `Set-Cookie` landing. Browser navigates, proxy sees no `__session`, bounces to `/login`. User clicks Google, popup auto-resolves, race repeats.

**Recommended next phase:** P10 — Auth reliability hardening (not a rewrite). Five targeted plans described in §7.

---

## 1. System map (cross-wave synthesis)

### 1.1 Cookies / tokens — authoritative source + lag budget

| Artifact | Source of truth | Written by | Stale window | Repair mechanism |
|---|---|---|---|---|
| `users/{uid}.role` (Firestore) | **Authoritative** | `/api/admin/set-role` | 0 | — |
| `token.role` (ID token custom claim) | Mirror of Firestore | `setCustomUserClaims` from set-role + sync-claims | Up to 1 hour (token TTL) | `getIdToken(true)` |
| `__session` cookie role | Mirror of ID token at mint time | `/api/auth/session` (Firebase Admin) | Up to 14 days | `syncSessionCookie` (daily on visibilitychange) |
| `__session_role` companion cookie | Mirror of Firestore at mint time | `/api/auth/session` + `/api/auth/refresh-session` | Up to 14 days | `refresh-session` (drift-handler driven) |
| `claimsUpdatedAt` | Firestore | set-role + sync-claims | 0 | Listener in auth-context |

### 1.2 Gate layers (outer → inner)

1. **Proxy** (`src/proxy.ts`) — `!session → /login`; optionally `!role || pending → /` when companion verified; `leader-only → /unauthorized` for `/admin`,`/manage`.
2. **SSR page gates** — `getServerUser()` checks, `redirect()` to `/setlists` or `/login`.
3. **Firestore rules** — authoritative data gate (currently relaxed to `isSignedIn()` for setlists — commit `0b10ecf`, intentional stopgap).
4. **API routes** — `createApiHandler` with `requireAuth` / `role` options; Bearer ID token on Authorization header.
5. **Client UI** — `useAuth()` boolean flags; non-security.

### 1.3 Drift repair path (auth-context drift block)

```
Firestore listener fires with profile
  └─ if claimsUpdatedAt changed OR claim≠profile.role:
       1. POST /api/auth/sync-claims           (fire-and-forget)
       2. getIdToken(true)                     (fire-and-forget)
       3. POST /api/auth/session               (syncSessionCookie, retry x2)
       4. POST /api/auth/refresh-session       (fire-and-forget)
```

All four are sequentially written but errors on any step do not block the next. If step 1 fails, step 2's token is stale. If step 3 fails, `__session` is stale. There is no terminal retry / surfacing to the user.

---

## 2. Root causes (ranked)

### RC-1 — Deployment coordination: env vars deploy after code (CONFIRMED, today's incident)
`SESSION_ROLE_SECRET` must exist at runtime when session route is first invoked after deploy. Ship-code-then-add-env is the exact failure mode. Fix: add a deploy checklist and a hard startup check in production that fails fast when the code requires a secret.

### RC-2 — Proxy is not actually authoritative and never can be (CONFIRMED, architectural)
The proxy sees only what the client sends. Every "source of truth" it can cite (ID-token claim, companion cookie) is a snapshot that can lag. The 09-02 companion cookie narrowed the gap by server-signing a Firestore read, but:
- it only refreshes when client-side drift detection fires,
- it's absent when `SESSION_ROLE_SECRET` is unset,
- it can be stale for any device that didn't observe the Firestore update (e.g., a second browser).

### RC-3 — Fire-and-forget drift repair (CONFIRMED, WAVE-1A/C)
`auth-context.tsx:160–196` — the four-step repair is sequenced but each step's failure is only logged. There is no retry, no user feedback, no exponential backoff. A transient sync-claims failure means the user sits on stale state until the next subscription fire, which may never come without a navigation.

### RC-4 — Cold-load race: first click precedes cookie mint (SUSPECTED, not yet instrumented)
On sign-in, `syncSessionCookie` kicks off but the user can click a nav link before the POST lands. Next navigation → proxy → no `__session` → `/login`. At `/login` the page's `useAuth` redirect only fires once `!loading && user`, which waits on both sessionReady *and* profileReady. If both resolve while the user is already at `/login`, page redirects to `/setlists`. But if the user re-clicks Google in the meantime, `signInWithPopup` resolves instantly (already signed in), re-entering the same race.

### RC-5 — `__session` only refreshes on `visibilitychange`, never on cold load (CONFIRMED, WAVE-1C)
If a user's 14-day session cookie has expired but the Firebase client SDK still has valid auth, the first page load sees no `__session`, bounces to `/login`, and *never triggers a refresh* until the user interacts with `visibilitychange`. This is a real bug for users returning after long absences.

### RC-6 — Proxy gate previously confused two failure modes (RESOLVED by 48914b4)
The pre-hotfix gate couldn't tell "pending user" from "cookie infrastructure broken." The hotfix gates strictness on `hasVerifiedCompanion`, which is the correct discriminator.

### RC-7 — Firestore rule still relaxed to `isSignedIn()` (KNOWN DEBT, commit 0b10ecf)
Setlist read rule is permissive for pending users. Acceptable today because setlists have no confidential payload, but it's technical debt against the audit posture.

### RC-8 — Push token not cleared on sign-out (MINOR, WAVE-1C)
`crc_push_token` persists. Next sign-in re-registers via the Firestore listener. Benign but not hygienic.

---

## 3. Why the recurring regressions — meta-pattern

The auth system has three "eventually consistent" layers (ID token, session cookie, Firestore) and one "strictly consistent" one (Firestore). Every bug here has been a variant of: "X lagged Y, and the code trusted X to match Y." The 09-02 design names this explicitly (server-mint from Firestore) but still leaves three reliance points on consistency:

- The drift *detector* (client-side subscription) must fire.
- The drift *repair chain* must all succeed without reporting.
- The deployed secret must exist when the code expects it.

**The fix is not another layer.** It's making the existing layer diagnosable, fail-fast, and self-healing.

---

## 4. Known good properties worth preserving

- Firestore rules as final gate (data integrity not dependent on cookie correctness).
- Companion cookie pattern + uid-match check (well-designed).
- `auth_bounce_count` redirect-loop breaker (prevents infinite tight loops, lands on `/auth-error`).
- Session cookie uses Firebase Admin `createSessionCookie` (proper primitive).
- Sign-out does a hard reload (clean slate).

---

## 5. Open questions (Wave 2 candidates)

1. **Is `SESSION_ROLE_SECRET` actually set in Vercel Production right now?** (user says they added it; not yet externally verified)
2. **Are there Vercel function logs showing whether `/api/auth/session` returned 200 during today's failed sign-in?** Would instantly disambiguate RC-4 (race) vs. RC-1 (env var missing at request time).
3. **Does `ensureUserProfile` ever complete fast enough that `profileReady` lands before `sessionReady`?** If profile subscription uses Firestore cache, it may resolve immediately — making `setLoading(false)` depend only on `sessionReady`. This would narrow RC-4.
4. **The Firestore "update time in the future" log in user's console** — is that a symptom or a separate issue? Clock skew? Worth checking server-time calls in session route.
5. **Why does `signOut()` `window.location.reload()` but `signIn()` not?** Asymmetric — could contribute to stale state after sign-in.
6. **Where does `/proxy.ts` get invoked?** (WAVE-1A asked this — Next.js 16 renamed `middleware.ts` → `proxy.ts` by convention. Confirm `next.config.*` isn't overriding or disabling it; verify via `npm run build` output which we already see emits "ƒ Proxy (Middleware)" so it IS wired.)

---

## 6. What I'd do next (recommended phase: P10)

Framed as five small, independent plans so each can ship atomically:

### P10-01 — Fail-fast env validation + deploy order documentation (XS)
- Mark `SESSION_ROLE_SECRET` as *required in production* in `env.mjs` (currently optional).
- Add a startup log when the key is missing in production.
- Document the "add secret → verify via `vercel env ls` → redeploy" checklist in a new `docs/deploy-checklist.md` (or CLAUDE.md).
- **Prevents RC-1 from recurring.**

### P10-02 — Cold-load cookie refresh + post-sign-in reload (S)
- In `auth-context.tsx`, add an initial `syncSessionCookie` check on first mount when `user` exists but no valid session cookie is reachable (we can't read httpOnly cookies, but we can have the API return 401 and trigger refresh).
- After successful sign-in, after `syncSessionCookie` resolves, do a single `router.replace(currentPath)` or `router.refresh()` so the middleware re-evaluates with the fresh cookie.
- Addresses RC-4 and RC-5.

### P10-03 — Drift repair: retries + telemetry + terminal surfacing (S)
- Wrap the four-step drift chain in an awaited sequence with 3x exponential backoff per step.
- Log every step's outcome to `logger` with a consistent tag (`[drift]`) so Vercel logs are diagnosable.
- On terminal failure, set a visible auth-health banner in the UI (optional; behind a flag).
- Addresses RC-3.

### P10-04 — Restore Firestore `isMember()` gate on setlists (S)
- With the companion cookie + drift handler in place, the original `isMember()` rule is safe again.
- Add a regression test that a pending user cannot read `setlists/*` but can read their own `users/{uid}`.
- Closes RC-7 / commit `0b10ecf`.

### P10-05 — E2E auth smoke test via Playwright on production (M)
- Scripted flow: fresh browser → sign in as existing approved musician → `/setlists` → assert rendered.
- Scripted flow: promote pending user via admin API → sign in as them → `/setlists` → assert rendered within 2 navigations.
- Run on every deploy via GitHub Actions.
- Catches every future regression in this class before the user does.

**P10-01 + P10-02 + P10-03 would have individually prevented today's incident; P10-05 would have caught it before prod.**

---

## 7. Verification plan

Before any of P10 ships:
1. User hard-refreshes, clears cookies, signs in. Confirms `48914b4` actually resolves the current lockout.
2. User checks Vercel env vars and confirms `SESSION_ROLE_SECRET` exists in Production.
3. If still broken, open DevTools → Network → filter `/api/auth/session` on sign-in, confirm it returns 200 and `Set-Cookie` headers for both `__session` and `__session_role`. Paste into this investigation as Wave 2 input.

---

*Wave 1 complete. Paused here for user feedback before launching Wave 2 (targeted at gaps in §5) or proceeding to P10 planning.*
