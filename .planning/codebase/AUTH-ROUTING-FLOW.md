# Authentication & Routing Flow

This document details how authentication, authorization, and routing work across the entire stack—from the `__session` cookie up to the React Context.

## 1. Token Lifecycle

Authentication in Central Reform Congregation's Sheet Music App relies on Firebase Auth and `next-firebase-auth-edge` for seamless SSR (Server-Side Rendering) access.

1.  **Sign-in**: Client authenticates using Firebase Auth (`signInWithPopup(auth, googleProvider)`).
2.  **Session Cookie Generation**: Once the client resolves an ID token, `syncSessionCookie(user)` fires an HTTP POST to `/api/auth/session` containing the token.
3.  **Cookie Setup**: `next-firebase-auth-edge` verifies the token using Firebase Admin credentials and serializes it into a secure, HTTP-only `__session` cookie.
4.  **Refresh Flow**: To prevent the 14-day max-age timeout, `auth-context.tsx` tracks visibility changes and silently re-syncs the token if the user has been active returning after >1 day.

## 2. Edge Middleware (`src/proxy.ts`)

The Next.js Edge Middleware acts as the primary gatekeeper before Next.js even begins rendering a page or evaluating a layout. 

*   **Public Routes**: Explicit paths like `/login`, `/`, `/perform`, `/qr`, and `/live` are allowed to bypass without a session cookie.
*   **Redirect Loops & Caching**: Vercel/Next.js edge caching can agressively cache `307 Temporary Redirect` responses. To combat this, `src/proxy.ts` implements a `createNoCacheRedirect()` helper that injects `Cache-Control: no-store, must-revalidate, max-age=0` to ensure redirects always hit the server.
*   **Loop Detection Fallback**: The middleware calculates "bounces" using an `auth_bounce_count` cookie (expiring in 10s). If a user hits an auth boundary redirect >3 times, they are permanently shifted to the `/auth-error` fallback UI which halts the loop and provides a "Refresh Session" button (which maps to `/api/logout`).

## 3. UI and Client State (`auth-context.tsx`)

The frontend derives all permission visual states entirely from React Context.

*   `deriveRoles(profile?.role)` centralizes the logic to determine `isAdmin`, `isBandLeader`, `isMusician`, and `isMember`.
*   The `canUpload` boolean is a derived aggregate. It resolves to `true` if the user is an **admin**, **band leader**, **musician**, OR if they have the specific `canUpload: true` override flag enabled on their Firestore `users/{uid}` document.
*   `useMemo` strictly caches the provided values to prevent cascading re-renders across the PDF viewers and heavy DOM nodes.

## 4. API Security (`src/lib/api-auth.ts`)

API Endpoints enforce security independent of the middleware, utilizing a Higher Order Function wrapper.

*   **`createApiHandler`**: Wraps backend routes. It decrypts the `__session` cookie natively. 
*   **`ctx.auth`**: The handler exposes `ctx.auth` which not only contains the UID and email, but pre-resolves the user's role string into accessible booleans (`ctx.auth.isAdmin`, `ctx.auth.isMusician`, etc.).
*   **Endpoint-Level Checks**: (e.g., `/api/library/upload/route.ts`) The endpoint natively evaluates `isPrivilegedRole = isAdmin || isBandLeader || isMusician`. If false, only then does it spend a Firestore read to query the user's explicit profile configuration.
