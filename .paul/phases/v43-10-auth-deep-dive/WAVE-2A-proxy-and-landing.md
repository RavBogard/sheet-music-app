# WAVE-2A FINDINGS — Proxy Wiring + Landing Page Behavior

**Date:** 2026-04-15  
**Scope:** Verify proxy.ts as active middleware; trace landing page (/) for all user states; identify multi-hop loops.

## Executive Summary

1. **Proxy IS wired as middleware** - CONFIRMED
   - Next.js 16 convention: src/proxy.ts auto-exported as middleware
   - Compiled to .next/server/middleware.js (verified in build)
   - No override in next.config.ts; middleware functions unimpeded

2. **Landing page (/) routes correctly by user state**
   - Unauthenticated: shows Sign In button
   - Pending: shows OnboardingCard ("Your account is being reviewed") - NO REDIRECT
   - Approved: shows OnboardingCard ("You're approved!") - NO REDIRECT
   - Admin/band_leader: shows full dashboard

3. **Pending user is stuck on / (dead-end, not tight loop)**
   - Proxy line 121: only redirects to / if NOT already at /
   - DashboardClient lines 266-275: renders OnboardingCard(role="pending")
   - OnboardingCard lines 114-138: two buttons only - "Set Up My Instrument" or "Nudge Admin"
   - NO CLIENT-SIDE REDIRECT LOGIC
   - Result: pending user stays on / indefinitely until approved or manually navigates

---

## 1. Proxy Confirmation: ACTIVE MIDDLEWARE

### File Location
- **File:** src/proxy.ts (lines 1-153)
- **Export:** export async function proxy(request: NextRequest) (line 31)
- **Config:** export const config with matcher (lines 141-153)

### Matcher Pattern (src/proxy.ts:141-153)
Matches all paths EXCEPT static assets, images, PWA configs, PDF worker, PNG files.
Runs middleware on: /, /login, /setlists, /manage, /admin, /perform/*, /qr/*, /live/*, etc.

### Next.js Configuration
- **File:** next.config.ts (lines 1-84)
- **No middleware override:** no middleware field, no custom runtime setup
- **Verified:** Sentry integration (lines 77-83) wraps config but does not disable middleware

### Package Version
- **Next.js:** ^16.2.1 (package.json:55)
- **Convention:** Next.js 16 standardized middleware as src/proxy.ts by convention

### Build Verification
- .next/server/middleware.js exists (4.3 MB compiled)
- Wave 1 FINDINGS line 116: "npm run build output showed 'f Proxy (Middleware)'"

**Conclusion:** proxy.ts IS the active middleware. CONFIRMED

---

## 2. Proxy Redirect Logic (Full Trace)

### Public Routes (src/proxy.ts:23, 29)
```
const publicExactRoutes = ['/login', '/', '/auth-error']
const publicPrefixes = ['/perform', '/qr', '/live']
```

### Unauthenticated User (src/proxy.ts:83-86)
- No __session + non-public path → /login
- No __session + / (public) → **allowed, no redirect**

### Authenticated at /login (src/proxy.ts:88-91)
- Has __session + at /login → /setlists

### Role-Based Redirect (src/proxy.ts:102-122)
Only redirects to / if:
1. hasVerifiedCompanion === true (server-signed companion cookie verified)
2. !role || role === 'pending'
3. Current path is NOT /

**Key:** If already at /, proxy does NOT redirect again.

### Loop Detection (src/proxy.ts:65-81)
- Tracks auth_bounce_count cookie
- After > 3 bounces in 10 seconds → /auth-error (breaks tight loops)
- Clears on successful page load

---

## 3. Landing Page (/) Rendering

### Server-Side (src/app/(main)/page.tsx:17-39)
- Calls getServerUser() → verifies __session + reads Firestore role
- If no session → null (still renders page)
- If session → reads Firestore users/{uid}.role

### Client-Side Rendering (src/app/(main)/DashboardClient.tsx:37-312)

**Case 1: Unauthenticated** (authUser === null)
- Shows sign-in button, NO redirect
- After successful sign-in: auth-context redirects to /setlists (login/page.tsx:30)

**Case 2: Pending** (role === "pending")
- OnboardingCard called (lines 266-275)
- Rendered (OnboardingCard.tsx:114-138):
  - "Your account is being reviewed"
  - Two buttons: "Set Up My Instrument" or "Nudge Admin"
  - NO CLIENT-SIDE REDIRECT
  - User stays on /

**Case 3: Approved** (role === "musician" AND not yet onboarded)
- OnboardingCard called
- "You're approved!" card
  - Two buttons: "Set Up Instrument" or "Skip"
  - NO redirect logic
  - User stays on /

**Case 4: Already Onboarded** (role === "musician" AND musicianProfile.instrument set)
- OnboardingCard returns null
- Hero card or recent setlists rendered
- No redirect

### Login Page (src/app/login/page.tsx:28-34)
- If user already authenticated at /login → /setlists
- Fires after both sessionReady AND profileReady

---

## 4. Proof: Pending User Dead-End on /

**Assertion:** Pending user lands on / and has zero automatic redirect paths.

**Proof chain:**
1. Proxy src/proxy.ts:120-121: checks if should redirect
2. Proxy line 121: only redirects if NOT at /
3. Pending user at / → proxy allows (pathname === '/')
4. DashboardClient:266-275 renders OnboardingCard
5. OnboardingCard.tsx:42 pickVariant() called
6. pickVariant:31 if (role === "pending") → variant="pending"
7. OnboardingCard:114-138 renders pending UI with buttons only (no redirect)
8. DashboardClient has NO other redirect logic for pending users

**Conclusion:** Pending user stays on / until:
- Admin approves in Firestore → client drift listener fires → user navigates
- User manually navigates
- User closes tab + returns later

**This is a dead-end, NOT a tight loop.** CONFIRMED

---

## 5. File Citations

| File | Lines | Purpose |
|---|---|---|
| src/proxy.ts | 1-153 | Middleware: auth gates, role gates, loop detection |
| src/proxy.ts | 31 | export async function proxy(request: NextRequest) |
| src/proxy.ts | 141-153 | Matcher config |
| src/proxy.ts | 102-122 | Role check + no-role → / |
| src/app/(main)/page.tsx | 17-39 | Server-side: getServerUser() + DashboardClient |
| src/app/(main)/DashboardClient.tsx | 266-275 | OnboardingCard mount |
| src/components/dashboard/OnboardingCard.tsx | 114-138 | Pending card UI |
| src/lib/server-auth.ts | 30-64 | getServerUser() |
| next.config.ts | 1-84 | No middleware override |
| package.json | 55 | Next.js 16.2.1 |

---

## Summary

✓ **Proxy IS active middleware** (Next.js 16 convention, no override)  
✓ **Landing page (/) renders correctly for all user states** (no improper redirects)  
✓ **Pending user is stuck on / (dead-end)** - OnboardingCard has no redirect logic  
✓ **No tight redirect loops** (auth_bounce_count breaks them)  

### Known Issues
- Pending users stuck on / with no progression mechanism
- Cold-load race (RC-4) still possible but not yet observed
- SESSION_ROLE_SECRET deploy coordination needs verification

### Next Steps
1. Confirm SESSION_ROLE_SECRET in production
2. Hard refresh + sign in → verify no bouncing
3. Proceed to P10 planning (from Wave 1 FINDINGS Section 6)

*WAVE-2A complete. Pending users can stay on / indefinitely; no tight loops detected.*
