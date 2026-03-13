# Architecture Research: Multi-Layered RBAC in Next.js 16

**Domain:** Authentication & Access Control (Next.js App Router + Firebase)
**Researched:** 2026-03-14
**Confidence:** HIGH

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    User Browser (Client)                     │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐        │
│  │Firebase │  │ Auth    │  │ Zustand │  │ UI      │        │
│  │ SDK     │  │ Context │  │ Stores  │  │ Filter  │        │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘        │
│       │            │            │            │              │
├───────┼────────────┼────────────┼────────────┼──────────────┤
│       │            ▼            ▼            ▼              │
│       │       ┌───────────────────────────────────────┐     │
│       │       │       Next.js App Router (Server)     │     │
│       │       └───────────────────────────────────────┘     │
│       │            │            │            │              │
├───────┼────────────┼────────────┼────────────┼──────────────┤
│       ▼            ▼            ▼            ▼              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
│  │ Firebase │  │ Session  │  │ Firestore│  │ Custom   │     │
│  │ Auth     │  │ Cookies  │  │ DB       │  │ Claims   │     │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘     │
└─────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **Middleware** | Route-level guarding | Next.js Edge Runtime checking Session Cookies |
| **Server Components** | Data-level auth & UI filtering | Async components calling `getServerUser()` |
| **Auth Context** | Client-side session state | React Context hydrated with server-side seed |
| **Custom Claims** | Secure role storage | Firebase Auth Token claims (role, soundEngineer) |
| **DAL (Data Access)**| Centralized auth logic | Shared `lib/dal.ts` with React `cache()` |

## Recommended Project Structure

```
src/
├── app/
│   ├── (auth)/             # Auth-protected route groups
│   ├── api/auth/session/   # Session cookie minting/revocation
│   └── layout.tsx          # Root layout (seeds Auth Context)
├── lib/
│   ├── dal.ts              # Data Access Layer (Server-side auth)
│   ├── server-auth.ts      # Session cookie verification
│   ├── roles.ts            # Role hierarchy and derivation
│   └── auth-context.tsx    # Hydrated Client Auth Context
├── middleware.ts           # Global route guard
└── firestore.rules         # Database-level security (last line of defense)
```

### Structure Rationale

- **lib/dal.ts:** Centralizes authorization logic. Prevents "permission bleed" by ensuring every data fetch or server action re-verifies roles using cached server-side state.
- **middleware.ts:** Handles redirects for unauthenticated users at the Edge, preventing the "flash of unauthorized content" before the page even begins to render.
- **(auth) Route Group:** Simplifies layout-based protection where large sections of the app share the same access requirements.

## Architectural Patterns

### Pattern 1: Server-Seeded Hydration (Flash Prevention)

**What:** Passing the authenticated user state from the Root Layout (Server) to the Auth Provider (Client) as a prop.
**When to use:** Always in Next.js App Router to eliminate the "loading..." flicker during Firebase SDK initialization.
**Trade-offs:** Requires serializing the user object (removing non-POJOs like Timestamps).

**Example:**
```typescript
// src/app/layout.tsx
export default async function RootLayout({ children }) {
  const user = await getServerUser(); // Verifies session cookie
  return (
    <AuthProvider initialUser={user}>
      {children}
    </AuthProvider>
  );
}
```

### Pattern 2: Claims-Trusted Verification

**What:** Trusting the `role` stored in the Custom Claims of the session cookie instead of looking up the User Profile in Firestore on every request.
**When to use:** For high-performance SSR and Middleware checks.
**Trade-offs:** Requires a mechanism to force-refresh tokens when roles change.

**Example:**
```typescript
// src/lib/server-auth.ts
export async function getServerUser() {
  const session = await cookies().get("__session")?.value;
  const decoded = await admin.auth().verifySessionCookie(session);
  // Trust the claim directly — no Firestore lookup needed!
  return { uid: decoded.uid, role: decoded.role }; 
}
```

### Pattern 3: Component-Level Filtering (RSC)

**What:** Only rendering and sending the components a user is allowed to see.
**When to use:** To hide privileged UI (like "Edit" buttons) from unauthorized users without client-side logic.

## Data Flow

### Request Flow (Authenticated)

```
[Browser Request]
    ↓
[Middleware] (Verifies Cookie)
    ↓
[Root Layout] (getServerUser() → Seed Prop)
    ↓
[Page Component] (verifyRole() → Fetch Data)
    ↓
[Hydrated UI] (Instant visibility, no flicker)
```

### Key Data Flows

1. **Session Minting:** Client `signInWithPopup` → `/api/auth/session` (POST) → Server `createSessionCookie` → `httpOnly` Cookie set.
2. **Role Sync:** Admin updates Firestore `role` → Trigger Cloud Function → `setCustomUserClaims` → Client `getIdToken(true)` on next visit.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-1k users | Standard Firebase Admin SDK + Middleware is sufficient. |
| 1k-100k users | Move role checks to Custom Claims to avoid Firestore read limits. |
| 100k+ users | Consider splitting session cookie (if claims > 4KB) and using Redis for session revocation lists. |

## Anti-Patterns

### Anti-Pattern 1: Client-Only Auth Guarding

**What people do:** Using `useEffect` and `router.push` in a Client Component to protect a route.
**Why it's wrong:** Causes "Layout Flash" where users see protected UI for 500ms before being redirected.
**Do this instead:** Use `middleware.ts` or `redirect()` inside a Server Component.

### Anti-Pattern 2: Redundant Firestore Lookups

**What people do:** Fetching the `users/{id}` document on every server request to check a role.
**Why it's wrong:** Increases latency (50-200ms) and Firestore costs.
**Do this instead:** Store the role in Custom Claims and trust the signed JWT.

## Sources

- [Next.js Authentication Docs](https://nextjs.org/docs/app/building-your-application/authentication)
- [Firebase Session Cookie Guide](https://firebase.google.com/docs/auth/admin/manage-cookies)
- [Iron Session / JWT Patterns 2025](https://github.com/vvo/iron-session)
- [Clerk/WorkOS Best Practices for RSC RBAC](https://workos.com/blog/nextjs-authentication-patterns)

---
*Architecture research for: sheet-music-app (Auth & Access Audit)*
*Researched: 2026-03-14*
