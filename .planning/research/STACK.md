# Stack Research

**Domain:** Next.js Authorization, Realtime State, and Data Fetching
**Researched:** 2026-03-13
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Next.js App Router & Middleware | 16.1.4 | Route gating and redirect loop prevention | Core framework feature. Middleware allows inspecting cookies before rendering, preventing flashes of unauthorized content and redirect loops. |
| Firebase Admin SDK | 13.6.0 | Server-side token verification | Already in stack. Essential for validating secure HTTP-only cookies in `getServerUser` and Middleware. |
| React Server Components (RSC) | 19.2.3 | Role-based UI gating | Native to Next.js. Allows rendering role-specific UI (e.g., Band Leader controls) on the server, ensuring zero UI layout shifts or authorization flashes. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `server-only` | ^0.0.1 | Prevent server-code leakage | Use in any file that performs server-side auth (like `getServerUser`) to guarantee it cannot be accidentally imported into a Client Component. |
| Firebase Realtime Database (RTDB) | 12.9.0 | Low-latency ephemeral state | For transitioning `LiveState` away from Firestore. RTDB is optimized for high-frequency, ephemeral state sync (like live setlist tracking) and is significantly cheaper/faster than Firestore for this use case. |
| Zustand | 5.0.10 | Client state & optimistic updates | Already in stack. Use to manage local UI state while waiting for RTDB/Firestore updates to prevent UI stutter during role-based actions. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Next.js Bundle Analyzer | Analyze client bundle | Ensure server-side auth logic isn't bloating the client bundle. |
| Firebase Emulator Suite | Local testing of RTDB and Auth | Crucial for safely testing redirect loops and permission rules offline without affecting the production database. |

## Installation

```bash
# Core
# Next.js and Firebase are already installed.

# Supporting (Adding server-only to strictly enforce server boundaries)
npm install server-only
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Firebase RTDB | Upstash Redis | Use Redis (already in stack) if you need ultra-low latency key-value storage without built-in client-side offline persistence. RTDB is preferred for out-of-the-box WebSocket sync. |
| Next.js Middleware | HOCs (Higher Order Components) | Use HOCs only if migrating legacy React apps. For Next.js App Router, Middleware is superior for preventing redirect loops and UI flashes. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Client-side Auth Gating (`useEffect`) | Causes "flashes of unauthorized content", layout shifts, and race conditions leading to redirect loops. | Next.js Middleware for routing, RSCs for UI gating. |
| Heavy ACL Libraries (e.g., `casl`) | Overkill for simple Admin/Band Leader/Musician/Pending roles, adds unnecessary bundle weight. | Simple role properties on the user object validated via `zod`. |
| Firestore for `LiveState` | High cost and higher latency for high-frequency, ephemeral updates (like a live performance monitor). | Firebase Realtime Database (RTDB) or Redis. |

## Stack Patterns by Variant

**If handling page-level access (e.g., `/manage` vs `/monitor`):**
- Use Next.js Middleware
- Because it stops unauthorized requests before the server even begins rendering, preventing redirect loops.

**If conditionally rendering UI elements (e.g., "Clone Setlist" button):**
- Use React Server Components + `getServerUser`
- Because it ensures the unauthorized HTML is never sent to the client, preventing UI flashes and reducing payload size.

**If syncing high-frequency live performance state:**
- Use Firebase Realtime Database (RTDB)
- Because it uses WebSockets for lower latency and is priced by bandwidth rather than document reads/writes, making it ideal for the `Monitor` feature.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `firebase@12.9.0` | `firebase-admin@13.6.0` | Ensure both client and admin SDKs are kept aligned to prevent token validation discrepancies. |
| `next@16.1.4` | `react@19.2.3` | App Router features heavily rely on React 19 concurrent features. |

## Sources

- Next.js Documentation — Verified Middleware and RSC patterns for auth gating.
- Firebase Documentation — Verified RTDB vs Firestore pricing and latency characteristics for ephemeral state.
- Local `package.json` — Verified existing stack versions (Next.js 16.1, React 19, Firebase 12/13).

---
*Stack research for: Next.js Authorization, Realtime State, and Data Fetching*
*Researched: 2026-03-13*
