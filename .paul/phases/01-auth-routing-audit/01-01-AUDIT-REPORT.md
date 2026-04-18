# Auth & Routing Regression Audit Report

**Phase:** 01 — Auth & Routing Regression Audit
**Date:** 2026-03-11
**Scope:** Three known regressions in login, routing, and avatars

---

## Issue 1: Monitor Page Redirects to Homepage After Fresh Login

### Severity: CRITICAL

### Root Cause: Async Fire-and-Forget Session Cookie Creation

The session cookie (`__session`) is created **asynchronously without await** in `auth-context.tsx:97-103`. When a user completes login, the middleware may process the next navigation request before the cookie exists.

### Timeline of Failure

```
1. User clicks "Sign in with Google"
2. signInWithPopup() completes → Firebase Auth SDK updates in-memory state
3. onAuthStateChanged fires (auth-context.tsx:90)
4. setUser(currentUser) called (line 94) → React re-renders
5. Login page detects user → router.replace("/") (login/page.tsx:30)
6. MEANWHILE: getIdToken(true) starts (line 97) — NOT awaited
7. Navigation to "/" triggers middleware
8. Middleware reads request.cookies.get('__session') (middleware.ts:31) → undefined!
9. "/" is public, so no redirect... but user then navigates to /monitor
10. Middleware: no __session + /monitor is not public → redirect to /login (line 53-56)
11. Session POST completes 50-200ms later (too late)
```

### Affected Code

| File | Lines | Issue |
|------|-------|-------|
| `src/lib/auth-context.tsx` | 97-103 | `getIdToken().then(fetch(...))` — fire-and-forget, no await |
| `src/lib/auth-context.tsx` | 102 | `.catch(() => {})` swallows session creation errors silently |
| `src/middleware.ts` | 53-56 | Redirects to `/login` immediately if no `__session` cookie |
| `src/app/login/page.tsx` | 30 | Redirects to `"/"` on auth — but middleware redirects logged-in `/login` visitors to `"/setlists"` (line 61) |

### Redirect Target Inconsistency

Two different post-login redirect targets exist:
- **Login page** (line 30): `router.replace("/")` — sends to homepage
- **Middleware** (line 59-62): redirects `/login` with session to `/setlists`

When the session cookie doesn't exist yet (the race condition), the login page redirect fires first (client-side), sending to `/`. If the user then navigates to `/monitor`, middleware blocks them.

### Why It's Intermittent

- **Fast networks:** Session POST completes before user clicks anything → works
- **Slow networks:** Session POST in-flight when user navigates → fails
- **Mobile:** Redirect fallback adds extra latency → more likely to fail

---

## Issue 2: Login Flow Popup/Redirect Cascade Feels Buggy

### Severity: HIGH

### Root Cause: Silent Popup Failure with No User Feedback

The login flow tries `signInWithPopup` first, catches specific errors, and silently falls back to `signInWithRedirect`. The user sees "Opening Google..." but gets no feedback about what's happening.

### Flow Analysis

```
signIn() [auth-context.tsx:161-178]
  └─ await signInWithPopup(auth, googleProvider)
       ├─ SUCCESS → popup opens, user signs in, onAuthStateChanged fires
       └─ CATCH (line 164-177):
           ├─ auth/popup-blocked → signInWithRedirect (silent)
           ├─ auth/popup-closed-by-user → signInWithRedirect (silent)
           ├─ auth/cancelled-popup-request → signInWithRedirect (silent)
           └─ other errors → logger.error only (no user feedback)
```

### Affected Code

| File | Lines | Issue |
|------|-------|-------|
| `src/lib/auth-context.tsx` | 161-178 | Popup-to-redirect fallback with no UI feedback |
| `src/lib/auth-context.tsx` | 86-88 | `getRedirectResult(auth).catch()` — result not used, error swallowed |
| `src/app/login/page.tsx` | 91 | Button text says "Opening Google..." even when redirect is happening |
| `src/app/login/page.tsx` | 36-43 | `signingIn` state set false in `finally` — but redirect navigates away, so `finally` may not run |

### Problems

1. **No platform detection:** Mobile browsers almost always block popups. Every mobile login attempt fails once silently before working.

2. **Button text misleading:** Shows "Opening Google..." when popup is attempted. When fallback to redirect fires, user sees the page navigate away with no explanation.

3. **getRedirectResult not properly handled (line 86-88):**
   ```javascript
   getRedirectResult(auth).catch((err) => {
       logger.warn("Redirect sign-in result:", err)
   })
   ```
   - Not awaited
   - Success result not processed (relies on onAuthStateChanged instead)
   - Error only logged, not shown to user

4. **signingIn state race:** When `signInWithRedirect` fires, the page navigates to Google. When user returns, the login page re-mounts with `signingIn = false`. If auth state hasn't resolved yet, user sees the "Sign in" button again and may click it again, creating duplicate attempts.

### Why It Feels Buggy

- Desktop: Popup opens, works fine (most of the time)
- Mobile: Popup blocked → silent redirect → user sees page navigate away → returns to app → auth resolves → works
- iOS Safari: Popup + COOP issues → always falls back to redirect
- The 1-2 second delay between click and redirect (popup attempt + failure + redirect initiation) feels unresponsive

---

## Issue 3: Avatars Not Displaying Consistently

### Severity: MEDIUM

### Root Cause: Inconsistent Avatar Patterns — 4 Different Implementations

### Avatar Implementation Catalog

| Component | File | Pattern | Error Handling | Fallback | Works? |
|-----------|------|---------|----------------|----------|--------|
| DesktopHeader | `src/components/nav/DesktopHeader.tsx:170-175` | Raw `<img>` + `onError` DOM manipulation | `nextElementSibling?.classList.remove('hidden')` | `<UserCircle>` icon (hidden by default) | Fragile |
| MobileMenuDrawer | `src/components/nav/MobileMenuDrawer.tsx:99-106` | Raw `<img>` + `onError` DOM manipulation | `nextElementSibling?.classList.remove('hidden')` | `<User>` icon in div (hidden by className) | Fragile |
| Settings Page | `src/app/(main)/settings/page.tsx:116-121` | Ternary `<img>` / fallback div | No onError handler at all | `<User>` icon in div | Broken on 404 |
| UserRow (Admin) | `src/components/admin/UserRow.tsx:162-165` | Radix `<Avatar>` + `<AvatarImage>` + `<AvatarFallback>` | Automatic (Radix handles it) | First letter of displayName | Correct |

### Detailed Failure Analysis

**DesktopHeader (lines 170-175):**
```jsx
{user?.photoURL ? (
    <img src={user.photoURL} alt="Profile" className="w-8 h-8 rounded-full border border-border"
        onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none'
            (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden')
        }}
    />
) : null}
<UserCircle className={user?.photoURL ? "w-6 h-6 hidden" : "w-6 h-6"} />
```
- **DOM coupling:** Assumes `nextElementSibling` is the `<UserCircle>`. If React re-renders or DOM order changes, this breaks silently.
- **Style mutation:** Direct DOM `.style.display = 'none'` fights React's rendering model.
- **Size mismatch:** Image is `w-8 h-8`, fallback icon is `w-6 h-6` — visual jump on error.

**MobileMenuDrawer (lines 99-106):**
```jsx
{user.photoURL ? (
    <img src={user.photoURL} ... onError={(e) => { /* same DOM hack */ }} />
) : null}
<div className={`... ${user.photoURL ? 'hidden' : ''}`}>
    <User className="w-5 h-5 ..." />
</div>
```
- Same DOM manipulation issues as DesktopHeader
- Different fallback icon (`User` vs `UserCircle`)
- Different sizing (`w-10 h-10` vs `w-8 h-8`)

**Settings Page (lines 116-121):**
```jsx
{user?.photoURL ? (
    <img src={user.photoURL} alt="Profile" className="w-14 h-14 ..." />
) : (
    <div className="w-14 h-14 ..."><User .../></div>
)}
```
- **No onError handler at all.** If photoURL exists but image 404s, shows broken image.
- Clean ternary pattern but missing the error case.

### Why Avatars Fail

1. **Google photoURL expiry:** Google profile photo URLs can become invalid (user changes photo, token embedded in URL expires). The URL is truthy but the image 404s.

2. **No CSP issue found:** The middleware doesn't set CSP headers for image sources, so Google image domains aren't blocked. This is NOT the cause.

3. **DOM manipulation anti-pattern:** The `onError` handlers in DesktopHeader and MobileMenuDrawer use imperative DOM manipulation (`style.display`, `classList.remove`) which:
   - Doesn't survive React re-renders (React will reset DOM to match virtual DOM)
   - Depends on sibling element order
   - Creates flash of broken image before error handler fires

4. **Radix Avatar works correctly:** UserRow uses `<Avatar><AvatarImage /><AvatarFallback /></Avatar>` which handles image errors declaratively through Radix's built-in state machine. This is the correct pattern.

---

## Recommended Fixes

### Fix 1: Await Session Cookie Before Completing Login (CRITICAL)

**Resolves:** Issue 1 (Monitor redirect), partially Issue 2 (login timing)

**Files:** `src/lib/auth-context.tsx`

**Change:** Make the session cookie POST part of the critical auth path. Two approaches:

**Option A (Preferred): Await session sync in onAuthStateChanged**
- In `auth-context.tsx:96-103`, change the fire-and-forget `.then()` to `await`
- Only call `setLoading(false)` AFTER session cookie is confirmed set
- Add timeout (3s) so a failed session POST doesn't block the UI forever
- Add error state/retry if session creation fails

**Option B: Client-side session-ready gate**
- After `signIn()` resolves, poll for `__session` cookie existence before navigating
- Less clean but doesn't change the auth provider structure

### Fix 2: Platform-Aware Login with User Feedback (HIGH)

**Resolves:** Issue 2 (login cascade)

**Files:** `src/lib/auth-context.tsx`, `src/app/login/page.tsx`

**Changes:**
1. **auth-context.tsx:161-178** — Detect mobile/iOS upfront:
   - If mobile browser detected, skip popup attempt, go straight to `signInWithRedirect`
   - Eliminates the silent failure + fallback delay on mobile

2. **auth-context.tsx:86-88** — Properly handle `getRedirectResult`:
   - Await the result
   - If user returned from redirect, show loading state until auth resolves

3. **login/page.tsx:91** — Update button text:
   - "Signing in..." (generic) instead of "Opening Google..."
   - Add a "Redirecting to Google..." state when redirect is used

4. **login/page.tsx:30** — Fix redirect target:
   - Change `router.replace("/")` to `router.replace("/setlists")` to match middleware behavior
   - OR change middleware line 61 to redirect to `"/"` — pick one canonical dashboard route

### Fix 3: Standardize on Radix Avatar Everywhere (MEDIUM)

**Resolves:** Issue 3 (avatars)

**Files:** `src/components/nav/DesktopHeader.tsx`, `src/components/nav/MobileMenuDrawer.tsx`, `src/app/(main)/settings/page.tsx`

**Changes:**
1. **DesktopHeader.tsx:170-175** — Replace manual `<img>` + onError with:
   ```jsx
   <Avatar className="h-8 w-8 border border-border">
       <AvatarImage src={user.photoURL ?? undefined} />
       <AvatarFallback><UserCircle className="w-5 h-5" /></AvatarFallback>
   </Avatar>
   ```

2. **MobileMenuDrawer.tsx:99-106** — Same pattern:
   ```jsx
   <Avatar className="h-10 w-10 border border-border">
       <AvatarImage src={user.photoURL ?? undefined} />
       <AvatarFallback>
           <User className="w-5 h-5 text-muted-foreground" />
       </AvatarFallback>
   </Avatar>
   ```

3. **Settings page:116-121** — Replace ternary with:
   ```jsx
   <Avatar className="h-14 w-14 border border-border">
       <AvatarImage src={user.photoURL ?? undefined} />
       <AvatarFallback>
           <User className="w-7 h-7 text-muted-foreground" />
       </AvatarFallback>
   </Avatar>
   ```

This eliminates all DOM manipulation, handles errors declaratively, and matches the working UserRow pattern.

---

## Suggested Phase 2 Plan Ordering

| Order | Fix | Severity | Effort | Dependencies |
|-------|-----|----------|--------|-------------|
| 1 | Fix 1: Session cookie await | Critical | Medium | None — core auth fix |
| 2 | Fix 2: Platform-aware login | High | Medium | Benefits from Fix 1 (session timing) |
| 3 | Fix 3: Radix Avatar standardization | Medium | Low | Independent — can be parallel |

**Recommendation:** Fix 1 and Fix 3 can be separate plans (different subsystems). Fix 2 depends on Fix 1's session timing changes. Consider:
- **Plan 01:** Session cookie + login flow (Fixes 1 + 2)
- **Plan 02:** Avatar standardization (Fix 3) — could be parallel

---

## Additional Observations

### Middleware Security Note
`middleware.ts:5-18` decodes JWT payload via base64 without cryptographic verification. This is acceptable for middleware (fast, Edge Runtime compatible) since the actual verification happens in `server-auth.ts:36` via `verifySessionCookie(cookie, true)` for server components and API routes. Middleware only does coarse routing decisions.

### Session Cookie Refresh Gap
The session cookie is created once at login and lives 14 days. There's no periodic refresh mechanism in `auth-context.tsx`. If the session cookie expires while the user has the app open (tab open for 14+ days), they'll get silently redirected on next navigation. The Firebase Auth SDK refreshes ID tokens automatically, but the `__session` cookie is only set on initial auth state change, not on token refresh.

This is a low-priority concern but worth noting for Phase 2 planning.

---

*Audit completed: 2026-03-11*
*No source code was modified during this audit.*
