# Phase 12 Research: Auth & Routing Deep Dive & Fixes

**Objective**: Research how to implement Phase 12: Auth & Routing Deep Dive & Fixes. Answer: "What do I need to know to PLAN this phase well?"

## 1. Upload Permissions (AUTH-07)
**Goal**: Allow all musicians, admins, and band leaders to upload sheet music, eliminating 403 Forbidden errors.

**Current State & Required Changes**:
*   **Backend (`src/app/api/library/upload/route.ts`)**: 
    *   Currently, the endpoint enforces a strict check against Firestore: `!userDoc.exists || !userDoc.data()?.canUpload`.
    *   **Fix**: The endpoint uses `createApiHandler`, which populates `ctx.auth` with user roles via `src/lib/api-auth.ts`. `ctx.auth` provides `isAdmin`, `isBandLeader`, and `isMusician` booleans. The check should be updated to: allow if `ctx.auth.isAdmin || ctx.auth.isBandLeader || ctx.auth.isMusician`, and only fallback to querying Firestore for the `canUpload` flag if all are false.
*   **Frontend (`src/lib/auth-context.tsx`)**:
    *   Currently, the client-side context defines `canUpload = isAdmin || isBandLeader || !!profile?.canUpload`.
    *   **Fix**: Update this derived state to include `isMusician`: `canUpload = isAdmin || isBandLeader || isMusician || !!profile?.canUpload`.

## 2. Redirect Cache Busting & Loop Prevention
**Goal**: Stop infinite redirect loops between `/login` and protected routes (e.g., `/setlists`), disable caching, and provide a fallback UI.

**Current State & Required Changes**:
*   **Middleware (`src/proxy.ts`)**:
    *   Currently handles routing based on the `__session` cookie presence and role claims. Redirects are sent via `NextResponse.redirect(new URL(...))`.
    *   **Fix (Cache Busting)**: Browsers can aggressively cache HTTP 307/308 redirects. We must append `Cache-Control: no-store, must-revalidate, max-age=0` headers to the `NextResponse.redirect` objects returned for auth boundaries (especially `/login` -> `/setlists` and vice-versa).
*   **Loop Fallback & Logging**:
    *   Because the decision states "Use standard HTTP no-store headers rather than aggressive query params", we should track redirect bouncing using a short-lived cookie (e.g., `auth_bounce_count`) managed entirely within `src/proxy.ts`. 
    *   If a user bounces between `/login` and a protected route more than ~3 times in a few seconds, `src/proxy.ts` should log the anomaly (`logger.error`) and redirect them to a static fallback page (e.g., `/auth-error` or a specific hash) that breaks the loop and displays the "Refresh Session" button (which will clear local state/cookies and call `/api/logout`).

## 3. Auth & Routing Flow Documentation (AUTH-04)
**Goal**: Document the overall authentication state flow securely and clearly.

**Required Action**:
*   Create a new markdown guide at `.planning/codebase/AUTH-ROUTING-FLOW.md` (utilizing Claude's discretion for format).
*   **Structure should include**:
    1.  **Authentication Lifecycle**: How tokens are generated on the client, passed to the server, and verified via `next-firebase-auth-edge` into the `__session` cookie.
    2.  **Edge Middleware (`src/proxy.ts`)**: How the public boundary works, how pending users are restricted, and the role of cache headers.
    3.  **API Security (`src/lib/api-auth.ts`)**: The role hierarchy (`admin > band_leader > musician > member > pending`) and how `createApiHandler` secures endpoints.
    4.  **Client-Side State (`auth-context.tsx`)**: How `useAuth()` surfaces verified claims and the `canUpload` capability to the UI.
    5.  **Troubleshooting**: Documenting the redirect loop fallback mechanism.

## Summary for Planning
To plan this phase effectively, the sub-tasks should be:
1. Update `src/lib/auth-context.tsx` and `src/app/api/library/upload/route.ts` to natively authorize musicians, admins, and band leaders to upload.
2. Update `src/proxy.ts` to inject `no-store` Cache-Control headers on all auth redirects.
3. Implement a cookie-based redirect bounce tracker in `src/proxy.ts` that safely routes stuck users to a fallback page.
4. Create the fallback UI page (e.g., `/auth-error` or `/auth/refresh`) with a "Refresh Session" button.
5. Author the comprehensive `AUTH-ROUTING-FLOW.md` document.

## Validation Architecture

To empirically test and validate these changes, the following steps must be performed:

1.  **Role-Based Upload Permissions:**
    *   **Privileged Users:** Log in as test users with the roles `musician`, `band_leader`, and `admin`. Verify that the upload UI is accessible and that uploading a valid file succeeds without a `403 Forbidden` error.
    *   **Unprivileged Users:** Log in as a test user with the `member` or `pending` role. Verify the upload UI is hidden. Using a tool like Postman or cURL, send an authenticated POST request directly to `/api/library/upload`. Verify that the server rejects it with a `403 Forbidden` and the specific message "Upload permission required."
2.  **Redirect Loop Prevention & Caching:**
    *   **Simulate Redirect Loops:** Force a misconfiguration or artificially induce a redirect loop between `/login` and a protected route (e.g., by temporarily forcing a failure in auth validation on a specific route after login). Verify that the system detects the loop (e.g., via bounce tracking) and safely diverts the user to the fallback error page.
    *   **Cache-Busting Headers:** Use browser DevTools (Network tab) or `curl -I` to inspect the HTTP responses for authentication-related redirects (e.g. from `/login` to `/setlists`). Verify that the responses contain `Cache-Control: no-store, must-revalidate, max-age=0` to ensure browsers do not cache the redirect.
    *   **Fallback UI Recovery:** On the fallback page, click the "Refresh Session" button. Verify it calls the necessary logout endpoints, clears cookies/local state, and returns the user to a clean `/login` state.