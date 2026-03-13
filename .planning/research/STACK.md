# Stack Research: Auth & Access Control

**Domain:** Next.js 16 + Firebase Auth v11 (RBAC Audit)
**Researched:** 2026-03-14
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **Next.js** | 16.x | Framework | Standard for RSC (React Server Components). The 2026 standard replaces `middleware.ts` with `proxy.ts` (Node.js runtime by default) for robust auth handling. |
| **Firebase Auth** | v11.x | Identity Provider | Gold standard for managed auth. Supports Custom Claims for O(1) RBAC verification on the server. |
| **Firebase Admin SDK** | v13.x | Server Auth | Essential for verifying session cookies and managing custom claims (roles) in a secure Node.js environment. |
| **React** | 19.x | UI Library | Introduces `use cache` and `cacheTag` for role-based caching, and `experimental_taintObjectReference` to prevent data leaks. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **next-firebase-auth-edge** | 2.x | Auth Handshake | The 2026 community standard for syncing Firebase client state with server-side HTTP-only cookies and automatic token rotation. |
| **jose** | latest | JWT Verification | Used by edge/proxy layers to verify Firebase JWTs without the overhead of the full Admin SDK where performance is critical. |
| **zod** | 3.x | Schema Validation | Use for validating custom claims and session data shapes in the Data Access Layer (DAL). |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| **Firebase CLI** | Security Rules | Use for local testing of Firestore/Storage rules to ensure they match server-side RBAC logic. |
| **Sentry/LogRocket** | Session Monitoring | Essential for debugging "stale session" edge cases and "already signed in" UI bugs. |

## Installation

```bash
# Core
npm install firebase firebase-admin next-firebase-auth-edge jose

# Supporting
npm install zod

# Dev dependencies
npm install -D firebase-tools
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| **Firebase Custom Claims** | **Firestore User Docs** | Use when you have >1000 bytes of permission data or need to revoke permissions instantly (Claims require a token refresh). |
| **`proxy.ts` (Next.js 16)** | **`middleware.ts` (Legacy)** | Only if staying on Next.js 15 or older; however, `proxy.ts` is required for full Node.js SDK access at the edge. |
| **HTTP-only Cookies** | **LocalStorage** | Never. LocalStorage is incompatible with Server Components and leads to "Auth Flashes." |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **Client-side only Auth** | Causes "Layout Flashes" and is bypassable. | Server-side Session Cookies. |
| **Raw JWTs in state** | Vulnerable to XSS. | Secure, HTTP-only Cookies. |
| **`useEffect` for Auth guards** | Delayed protection; page content renders before check. | `proxy.ts` or Server Component guards. |

## "Bulletproof" Patterns for 2026

### 1. The Proxy Refresh Pattern (Fixes Stale Sessions)
To prevent "stale session" bugs where a user is logged in on the client but the server-side cookie is expired, use `proxy.ts` to automatically refresh tokens.

**Implementation:**
- Store both `ID Token` and `Refresh Token` in cookies.
- In `proxy.ts`, if the ID Token is expired, use the Refresh Token to fetch a new one server-to-server.
- Update the response cookies in the same request. This ensures the user never sees an "Unauthorized" error while their session is technically valid.

### 2. The Data Access Layer (DAL) (Fixes Permission Bleed)
Centralize all auth checks in a single `verifySession` function using React's `cache` to prevent multiple token verifications per request.

```typescript
// lib/auth/dal.ts
import { cache } from 'react';
import { cookies } from 'next/headers';
import { getTokens } from 'next-firebase-auth-edge';

export const verifySession = cache(async () => {
  const tokens = await getTokens(await cookies(), { /* config */ });
  if (!tokens) return null;
  return { uid: tokens.decodedToken.uid, role: tokens.decodedToken.role };
});
```

### 3. Role-Based Cache Scoping (Fixes Cache Leaks)
Next.js 16's `use cache` directive must be scoped to the user's role to prevent an "Admin" view from being served to a "Musician" from the global cache.

```typescript
async function DashboardData({ role }: { role: string }) {
  'use cache';
  cacheTag(`dashboard-${role}`);
  // ... fetch data
}
```

### 4. Client-to-Server Sync (Fixes "Already Signed In" Bugs)
Use a global listener to keep the server cookie in sync with the client-side Firebase Auth state.

```typescript
// components/AuthProvider.tsx
onIdTokenChanged(auth, async (user) => {
  if (user) {
    const idToken = await user.getIdToken();
    await fetch('/api/login', { method: 'POST', body: JSON.stringify({ idToken }) });
  } else {
    await fetch('/api/logout', { method: 'POST' });
  }
});
```

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `firebase@11.x` | `firebase-admin@13.x` | Standard v11/v13 pairing for 2026. |
| `next@16.x` | `react@19.x` | Required for `proxy.ts` and `use cache`. |
| `next-firebase-auth-edge@2.x` | `next@16.x` | Ensure using the latest v2 for Next.js 16 support. |

## Sources

- `next-firebase-auth-edge` — Middleware patterns verified (HIGH)
- `firebase-admin` docs — Session cookie management (HIGH)
- Next.js 16 "What's New" — `proxy.ts` and `use cache` patterns (MEDIUM/HIGH)

---
*Stack research for: sheet-music-app (Auth & Access Audit)*
*Researched: 2026-03-14*
