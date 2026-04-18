# FINDINGS v2 — Wave 2 synthesis + final P10 plan slate

**Date:** 2026-04-15
**Input:** WAVE-2A (proxy wiring + landing), WAVE-2B (race trace), WAVE-2C (env/config hygiene), WAVE-2D (multi-device + QR)
**Prior:** `FINDINGS.md` (Wave 1 synthesis)

---

## TL;DR — What we now know for certain

1. **Proxy is correctly wired** (Next.js 16 `src/proxy.ts` convention, compiled to `.next/server/middleware.js`). Not a wiring bug.
2. **Landing at `/` is a dead-end, not a loop** — OnboardingCard renders for pending users with no redirect. So the user's reported `/setlists → /login → /login` symptom is NOT landing on `/`. It's a direct `/setlists ↔ /login` bounce.
3. **The cold-load race IS real and reproducible** (Wave 2B). ~125ms window where `profileReady=true` (Firestore cache, 1–5ms) but `sessionReady=false` (session POST, ~130ms). If the user clicks a link during that window, the proxy sees no `__session` cookie → bounces to `/login`. Fixable with one line.
4. **Loop-breaker is disarmed** (Wave 2C): `auth_bounce_count` cookie is set without `path`, so each path sets its own cookie, counter never accumulates, `>3 bounces → /auth-error` fallback never fires. Users stay stuck instead of landing on the designed escape hatch.
5. **Env-var fragility is systemic** (Wave 2C): `SESSION_ROLE_SECRET`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `CRON_SECRET` are all declared `.optional()` in `env.mjs` but are required at runtime. Silent degrade + partial 200 responses are the result.
6. **Multi-device state is fine** (Wave 2D). Not a source of the current incidents. Cross-tab sign-out is a minor UX polish, not a root cause.
7. **QR sign-in is just an alt UX for the same auth primitives** (Wave 2D). No architectural win to steal; same staleness surface.

---

## 1. Confirmed root causes (ranked by incident contribution)

### RC-1 — Env optionality + deploy ordering *(primary cause of today's 28-min lockout)*
- `env.mjs` marks `SESSION_ROLE_SECRET` optional. Code in `src/lib/session-role.ts:72–76` returns `null` silently when it's missing.
- `src/app/api/auth/session/route.ts:75–83` skips the companion cookie set when signer returns null — but still returns 200.
- Result: proxy sees no companion cookie → falls through to fallback (or, pre-48914b4, to the aggressive redirect). No visible symptom in logs.
- **Same pattern applies to `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `CRON_SECRET`.**

### RC-2 — Cold-load race between sign-in cookie POST and first navigation *(primary cause of the current `/setlists ↔ /login` symptom)*
**Timeline (confirmed against code, Wave 2B):**
```
t=255ms  signInWithPopup resolves → onAuthStateChanged fires
t=256ms  setLoading(true), syncSessionCookie() POST starts (NOT awaited)
t=260ms  subscribeToUserProfile's first snapshot arrives from Firestore cache
         → profileReady = true (but setLoading(false) gated on sessionReady)
t=300ms  user clicks /setlists link (nav is enabled; no full-screen blocker)
t=301ms  browser hits /setlists → proxy sees no __session cookie yet
         → redirect to /login
t=387ms  session POST response lands with Set-Cookie: __session=... (headers applied)
t=388ms  client receives 200 → sessionReady = true → setLoading(false)
t=389ms  /login page's useEffect fires → router.replace('/setlists')
t=390ms  navigation to /setlists succeeds (cookie now present)
```
- In the best case, step 389–390 self-heals. But if the user *keeps clicking* the Google button on /login (which they do, because the page looks non-responsive), each click re-triggers `signInWithPopup` → re-triggers `onAuthStateChanged` → re-triggers the race. Apparent infinite loop from the user's perspective.

### RC-3 — Disarmed loop-breaker: `auth_bounce_count` cookie missing `path="/"` *(amplifies every other loop class)*
- `src/proxy.ts:79` — `response.cookies.set('auth_bounce_count', ..., { maxAge: 10 })` — no `path` set.
- Browsers default to "current path" when `path` is absent, meaning a bounce from `/setlists → /login` sets `auth_bounce_count` with path=`/setlists` (or `/login`, depending on redirect semantics). The next request to a different path doesn't read it.
- Therefore the `>3 bounces → /auth-error` escape valve **cannot trigger in practice**. Every infinite-loop report is the user stuck forever rather than landing on /auth-error.

### RC-4 — Drift-repair chain is fire-and-forget
- `src/lib/auth-context.tsx:160–196` — four sequential steps (sync-claims, getIdToken(true), syncSessionCookie, refresh-session) with no awaits between them at the outer level, no retry, no terminal surfacing.
- On any transient failure, user sits on stale state until the next Firestore listener event, which may never come without user action.

### RC-5 — No cold-load refresh of `__session`
- `__session` only refreshes on `visibilitychange` (auth-context.tsx:244–264). If a user returns after 14d and lands on a gated route cold, the proxy sees expired/absent cookie → `/login`, and they have to manually re-sign-in even though Firebase client auth is still valid.

### RC-6 — `initAdmin()` return value unchecked at call sites
- `src/lib/firebase-admin.ts:15` returns `false` when creds missing, but `/api/auth/session:37`, `/api/auth/refresh-session:29`, etc. call `initAdmin()` without checking — they then call `getAuth()` which throws → 500.
- Same class of silent failure as RC-1.

### RC-7 — Firestore rule still relaxed to `isSignedIn()` *(debt from 0b10ecf)*
- Not a current-incident contributor. Tracked as debt.

### RC-8 — Small hygiene
- Push token not cleared on sign-out.
- Undeclared env vars (`RESEND_WEBHOOK_SECRET`, etc.) read via raw `process.env`.
- Build version may fall back to `package.json` stale value in Vercel shallow clones.

---

## 2. Revised P10 plan slate (ordered by impact on user's current pain)

### **P10-01 — Disarm the foot-guns** *(XS, ships first)*
**Fixes:** RC-1, RC-3, RC-6
1. `src/env.mjs`: move `SESSION_ROLE_SECRET`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `CRON_SECRET` to required schema in production (keep optional in test); declare the missing ones (`RESEND_WEBHOOK_SECRET`, etc.).
2. `src/proxy.ts:79`: add `path: '/'` to the `auth_bounce_count` cookie set so the loop-breaker actually arms.
3. `src/lib/firebase-admin.ts`: audit every call site of `initAdmin()`; if it returns false, `apiError('Server not ready', 500, 'FIREBASE_NOT_INITIALIZED')` before touching `getAuth()`. Currently most sites ignore the return.
4. `src/lib/session-role.ts:72–76`: change `logger.warn` to `logger.error` AND elevate to `throw` in production (NODE_ENV==='production'). Fail fast beats silent degrade.

Adds `docs/DEPLOY-CHECKLIST.md` codifying: set secret → `vercel env ls` → redeploy, not the other way around.

**Why first:** These are mechanical, low-risk, and retire four of the eight confirmed root causes. Together they would have prevented today's incident class entirely.

### **P10-02 — Kill the cold-load race** *(S)*
**Fixes:** RC-2, RC-5
1. In `src/lib/auth-context.tsx`, **await `syncSessionCookie` before dropping `loading=false`** (currently the `.then` only flips `sessionReady`). This keeps the app loader visible until the cookie is actually set — no click can escape.
2. After the session POST resolves successfully, call `router.refresh()` so middleware re-evaluates with the fresh cookie. Cheap; one line.
3. On cold load: if the client Firebase SDK has a user but no fresh session cookie detection heuristic (e.g., last-refresh-timestamp in localStorage >13 days), fire a `syncSessionCookie` on mount regardless of `visibilitychange`.
4. Add a minimum-duration full-screen loader during sign-in so the user can't click before the cookie lands. (Small UX win; prevents clicking.)

**Why second:** This is the fix for the symptom you're hitting *right now*. Not shipping first because it depends on P10-01's env hardening to avoid reintroducing the no-secret silent failure.

### **P10-03 — Drift repair becomes reliable + visible** *(S)*
**Fixes:** RC-4
1. Rewrite the drift chain in `auth-context.tsx:160–196` as an awaited sequence with 3× exponential backoff per step.
2. Log each step with `[drift]` tag to `logger` so Vercel function logs are usable.
3. Expose a `driftStatus` flag on the auth context; render a subtle banner if drift is terminal-stuck.
4. Unit tests covering: transient sync-claims 500, transient refresh-session 500, both succeed on retry.

### **P10-04 — Restore `isMember()` rule on setlists read** *(S)*
**Fixes:** RC-7
1. Revert the permissive setlists read rule from commit `0b10ecf` with a new rule: `isMember() || isOwner()`.
2. Regression test via Firestore emulator: pending user can't read `/setlists/*`, can read own `/users/{uid}`.
3. Gates on P10-02 shipping first (so the companion cookie pipeline is guaranteed healthy before tightening the data gate).

### **P10-05 — Production E2E auth smoke via Playwright** *(M)*
**Fixes:** the root "we only find regressions when the user reports them" meta-issue.
1. Headless browser script: fresh Chromium profile → sign in as known approved musician → land on `/setlists` → assert rendered within 5s.
2. Scripted flow: admin-API promotes a pending user → sign in → land on `/setlists` without manual intervention.
3. GitHub Action triggered on every production deploy; failing run rolls back via Vercel API.

### **P10-06 — Cross-tab sign-out (OPTIONAL)** *(XS polish)*
`BroadcastChannel('auth-signout')` wired to auth-context. One evening's work. Not a safety issue; UX polish.

---

## 3. Sequenced ship order

```
P10-01 (XS)  ───▶  P10-02 (S)  ───▶  P10-03 (S)  ───▶  P10-04 (S)
                         │
                         └───▶  P10-05 (M)  runs in parallel after P10-02
                         
P10-06 (optional)  — any time
```

**P10-01 + P10-02 together kill today's pain class.** Ship them tonight/tomorrow. P10-03/04/05 are the hardening pass that closes the rest of the audit findings.

---

## 4. Things explicitly OUT of scope for P10

- Replacing Firebase Auth with a different provider. Not the problem.
- Replacing the session-cookie pattern with JWT-in-localStorage. Worse security.
- Monorepo restructure. Irrelevant.
- Rewriting the proxy in a different edge runtime. Works fine.
- Any change that touches live-performance / setlist code paths. Isolated to auth surface.

---

## 5. Verification path before declaring the phase complete

1. User hard-refreshes, clears cookies, signs in, clicks `/setlists` immediately. No bounce.
2. User signs in from laptop B, then laptop A's session cookie expires — laptop A lands on `/login` cleanly on cold load (no spinner hang).
3. Admin promotes a pending user — they sign in cold, reach `/setlists` on first navigation (no manual page refresh needed).
4. Manually remove `SESSION_ROLE_SECRET` in preview env → deploy fails at startup, not at runtime (proves P10-01 fail-fast works).
5. Deliberately trigger 5 bounces in a row → user lands on `/auth-error` (proves P10-01 cookie-path fix armed the escape hatch).
6. Playwright smoke passes for both approved and freshly-promoted user flows.

---

## 6. Confidence assessment

| Root cause | Confidence it's real | Confidence the proposed fix kills it |
|---|---|---|
| RC-1 env optionality | **High** (today's incident) | **High** (fail-fast standard) |
| RC-2 cold-load race | **High** (timing proven in 2B) | **High** (await + router.refresh) |
| RC-3 bounce-count path | **High** (cookie spec behavior) | **High** (one-line fix) |
| RC-4 fire-and-forget drift | **High** (visible in source) | **High** (awaited + retries + tests) |
| RC-5 no cold-load session refresh | **High** (visibilitychange-only) | **Medium** (depends on correct heuristic) |
| RC-6 initAdmin unchecked | **High** (visible in source) | **High** (guarded return paths) |
| RC-7 relaxed setlist rule | **High** (commit 0b10ecf present) | **High** (tighten + test) |

---

*Wave 2 synthesis complete. Ready to plan P10-01 when user confirms direction.*
