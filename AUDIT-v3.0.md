# Auth & Access Audit Report (v3.0)

**Date**: 2026-03-13
**Focus**: Authentication Reliability, Role-Based Access Control (RBAC), and Public Access Routing.

## Executive Summary
An exhaustive audit of the authentication flow, Next.js routing, and client-side state management was conducted to identify the root causes of the reported bugs (stale sessions, login loops, leaked UI components, and public access friction).

---

## 1. Public Access Routing Flaw (The Friction Bug)
**The Problem**: Unauthenticated users are struggling to access public setlists because the routing logic contradicts itself.
**The Root Cause**:
*   `src/app/(main)/setlists/[id]/page.tsx` contains specific logic to allow unauthenticated users to view a setlist if it has a `?public=true` parameter.
*   *However*, `src/proxy.ts` (the Next.js middleware) strictly guards the entire `/setlists/*` path. If an unauthenticated user clicks a link to `/setlists/123?public=true`, `proxy.ts` intercepts the request at the edge and immediately redirects them to `/login` *before the page can even load to check the public flag*.
*   The actual "Performance Mode" lives at `/perform/setlist/[id]`, which *is* allowed by `proxy.ts`, but if users are being sent links to the editor route, they hit a wall.

## 2. The "Stale Session" & Login Loop (The Sync Bug)
**The Problem**: Users sometimes appear logged out despite logging in, or get stuck in a redirect loop between `/login` and the dashboard.
**The Root Cause**:
*   **Split Brain Architecture**: The app relies on the Firebase Client SDK (in the browser) as the source of truth, but Next.js Server Components require a `__session` cookie.
*   **The Race Condition**: `src/lib/auth-context.tsx` uses a custom `syncSessionCookie` function. When a user logs in (especially via mobile redirect), the client SDK recognizes the user, but the server cookie hasn't been minted yet. The user navigates to `/setlists`, `proxy.ts` sees no cookie and bounces them back to `/login`.
*   **Mobile Redirect Failures**: `signInWithRedirect` is highly unreliable on modern iOS Safari due to aggressive Intelligent Tracking Prevention (ITP) blocking third-party cookies across the `firebaseapp.com` and your app's domain.

## 3. UI Visibility Leaks (The Permissions Bug)
**The Problem**: Unprivileged musicians sometimes see options like "Edit Setlist", "Duplicate", or "Monitor Controls" that they shouldn't have access to.
**The Root Cause**:
*   **Client-Side Hydration**: Permissions (`isLeader`, `isMusician`, `isAdmin`) are derived in `src/lib/auth-context.tsx` and evaluated on the client-side.
*   When a page first loads (SSR), the server might render default UI states, and then a fraction of a second later, the client-side React code "hydrates" and hides the buttons. If the auth state is delayed or errors out, these buttons remain visible (though clicking them usually fails because the backend rules block the action).

---

## Proposed Remediation Plan

Based on these specific findings, here is the proposed step-by-step plan to make the system bulletproof.

### Step 1: Fix the Public Access & Routing Boundary
*   **Action**: Consolidate the "Public" vs "Private" boundaries. We will ensure that the "Share" button generates links exclusively to `/perform/setlist/[id]` (which is already whitelisted in `proxy.ts`).
*   **Action**: Remove the broken `?public=true` logic from the Setlist Editor (`/setlists/[id]`). The editor route should strictly be for authorized editors. Unauthenticated users should *never* touch the editor component, even in a read-only state.

### Step 2: Session Hardening & Mobile Login
*   **Action**: Standardize the entire app to use `signInWithPopup`. We will remove `signInWithRedirect` entirely to bypass iOS Safari's third-party cookie blocking.
*   **Action**: Implement a "Hard Logout" function. Currently, logging out doesn't clear the Next.js Client Router Cache. We will add a `window.location.reload()` to the logout flow so that hitting the "Back" button cannot resurrect old UI states.
*   **Action**: (Optional but Recommended) Refactor the cookie sync to use `next-firebase-auth-edge` to automate the minting and refreshing of cookies, eliminating the race condition.

### Step 3: Server-Side UI Gating
*   **Action**: Audit the top-level Server Components (like `DashboardClient.tsx` and `SetlistDashboard.tsx`). Instead of hiding buttons via client-side CSS/React (`if (isLeader) return <Button>`), we will pass the server-verified role directly to the components so the HTML for the button is *never sent over the network* to an unauthorized user.
