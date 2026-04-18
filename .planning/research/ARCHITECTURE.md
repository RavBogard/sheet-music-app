# Architecture Research

**Domain:** Authentication, Routing, and Data Fetching
**Researched:** 2026-03-13
**Confidence:** HIGH

## Standard Architecture

### System Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                       Edge / Proxy Layer                     │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐    │
│  │                    src/proxy.ts                     │    │
│  │    (Basic path prefix and role claim validation)    │    │
│  └─────────────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────────────┤
│                    Server Component Layer                    │
├─────────────────────────────────────────────────────────────┤
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐ │
│  │ ManagePage     │  │ MonitorPage    │  │ DashboardPage  │ │
│  │ (Role checks)  │  │ (Config checks)│  │ (Greeting SSR) │ │
│  └───────┬────────┘  └───────┬────────┘  └───────┬────────┘ │
│          │                   │                   │          │
├──────────┴───────────────────┴───────────────────┴──────────┤
│                    Client Component Layer                    │
├─────────────────────────────────────────────────────────────┤
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐ │
│  │ ManageClient   │  │ MonitorClient  │  │ DashboardClient│ │
│  └────────────────┘  └────────────────┘  └────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| `src/proxy.ts` | Early interception of unauthorized users and role-based path blocking. | `NextRequest` middleware checking `__session` JWT claims. |
| Server Pages (`page.tsx`) | Deep role verification, fetching DB configs to gate access, SSR data loading. | `getServerUser()` to retrieve user context, `redirect()` or conditional rendering. |
| Client Pages (`*Client.tsx`) | Rendering interactive UI, optimistic updates, and real-time listeners. | Context hooks like `useAuth()`, Firestore real-time subscriptions. |

## Recommended Project Structure

```text
src/
├── app/
│   ├── (main)/
│   │   ├── manage/page.tsx      # Server-side auth gating for Admin/Leader
│   │   ├── monitor/page.tsx     # Server-side auth & config gating for Monitor
│   │   └── schedule/page.tsx    # Simplified server/client schedule view
│   └── login/page.tsx           # Handled securely via proxy.ts redirects
├── components/
│   ├── dashboard/               # Unauthenticated/pending user components (e.g. NextServiceCard)
│   └── setlist/                 # Client UI gating (e.g. hiding clone/duplicate from musicians)
└── lib/
    ├── server-auth.ts           # Shared SSR user validation logic
    └── setlist-firebase.ts      # Fetching logic for schedule page
```

### Structure Rationale

- **Server-side gating in `page.tsx`:** Moving role checks to the server eliminates client-side UI flashing (SEC-04, SEC-05), resolving UX friction before any JS loads.
- **`proxy.ts` for routing edge cases:** Provides an instantaneous fallback to prevent users from reaching secure paths without any session, saving server processing time.

## Architectural Patterns

### Pattern 1: Server-Side UI Gating

**What:** Validating user roles inside Next.js App Router Server Components before rendering the client shell.
**When to use:** For high-security routes (Admin, Monitor) where rendering unauthorized client components is a security risk or causes layout shifts.
**Trade-offs:** Adds slight initial latency (TTFB) to fetch user context but guarantees no layout flash.

**Example:**
```typescript
export default async function MonitorPage() {
    const user = await getServerUser()
    if (!user) redirect("/login")
    
    // Complex logic that isn't possible in proxy.ts
    const hasAccess = await checkMonitorConfig(user.uid)
    if (!hasAccess) return <UnauthorizedMessage />
    
    return <MonitorClient />
}
```

### Pattern 2: Edge Middleware Path Blocking

**What:** Using `src/proxy.ts` to decode JWTs from cookies and perform basic path gating (e.g., pending users cannot access `/manage`).
**When to use:** Broad, application-wide routing rules based on decoded claims.
**Trade-offs:** Must be lightweight. Cannot fetch from external databases (like Firestore) at the edge reliably.

### Pattern 3: Optimistic Client-Side Action Hiding

**What:** Hiding unauthorized actions (e.g., Duplicate, Clone) from unprivileged users directly in the UI.
**When to use:** For granular permissions within shared pages (e.g., `SetlistDashboard`).
**Trade-offs:** The backend still needs to secure the actual endpoints.

## Data Flow

### Request Flow (Auth Gating)

```text
[User Navigation]
    ↓
[proxy.ts (Edge)] → Blocks non-logged in users -> /login
    ↓ (If allowed)
[Server Page] → Calls `getServerUser()`. Validates `isBandLeader` or `isAdmin`.
    ↓
[Client Page] → Renders specific UI. Hides "Duplicate" if user is musician.
```

### Key Data Flows

1. **Dashboard Unauthenticated Flow:** `proxy.ts` allows `/` -> `DashboardPage` fetches server greeting -> `DashboardClient` subscribes to public setlists instantly (no auth required) -> renders `NextServiceCard`.
2. **Simplified Schedule Fetching:** `SchedulePage` subscribes *only* to upcoming public setlists instead of complex cross-referencing with musician assignments.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-1k users | Current model is optimal. Firestore real-time listeners are efficient. |
| 1k-100k users | Shift more data fetching to SSR rather than client-side subscriptions for the Schedule page to reduce Firestore read costs. |

### Scaling Priorities

1. **First bottleneck:** Firestore reads for `SchedulePage` if users constantly refresh.
2. **Second bottleneck:** Heavy client-side JS bundles for auth validation logic. Moving to server components eliminates this.

## Anti-Patterns

### Anti-Pattern 1: Client-Side Redirect Flashes

**What people do:** Load the page, check `useAuth()`, then use `router.push('/login')` inside a `useEffect`.
**Why it's wrong:** The user briefly sees the secure UI before being redirected.
**Do this instead:** Use `proxy.ts` or `redirect()` inside the Next.js Server Component (e.g., `getServerUser()`).

### Anti-Pattern 2: Over-fetching Schedule Data

**What people do:** Fetching all setlists and all musician assignments just to display dates on the `SchedulePage`.
**Why it's wrong:** High latency and unnecessary Firestore reads when the goal is simply listing upcoming public setlists.
**Do this instead:** Subscribe strictly to public setlists (`subscribeToUpcomingSetlists`) and drop assignment cross-referencing.

## Integration Points

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `proxy.ts` ↔ JWT Session | Cookie decoding | Must remain lightweight. Rely on JWT claims (`role`). |
| Server Page ↔ `server-auth.ts` | Direct function call | Uses Firebase Admin SDK. Cache user requests to prevent redundant lookups. |
| Client UI ↔ User Roles | React Context (`useAuth`) | Ensure `isBandLeader` flag correctly gates UI buttons (Clone/Duplicate). |

## Build Order

1. **Schedule Simplification:** Update `src/app/(main)/schedule/page.tsx` to remove assignment logic and directly list upcoming public setlists.
2. **Musician UI Gating:** Update `src/components/setlist/SetlistDashboard.tsx` and `SetlistEditorV2` to strictly hide "Duplicate" and "Clone for Next Week" actions unless `user.isBandLeader || user.isAdmin`.
3. **Verify Dashboard Hero:** Ensure `DashboardClient.tsx` accurately renders `NextServiceCard` for unauthenticated/pending users immediately on load.
4. **Audit Redirects:** Ensure `proxy.ts` strictly maps to the requirements (pending users blocked everywhere except `/`, admin redirects correctly handled).

---
*Architecture research for: Project Research — Architecture for role-based authorization fixes, redirect fixes, and schedule page updates.*
*Researched: 2026-03-13*