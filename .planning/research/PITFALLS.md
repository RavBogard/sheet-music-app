# Pitfalls Research

**Domain:** Next.js Role-based Authorization, Redirects, and Data Fetching
**Researched:** 2026-03-13
**Confidence:** HIGH

## Critical Pitfalls

### Pitfall 1: Client-Side Only Authorization (UI Leaks & Flashing)

**What goes wrong:**
Unauthorized users (e.g., musicians or pending users) briefly see restricted UI elements (like "Duplicate Setlist" or "Clone for next week") before the client-side React code hydrates and hides them, or worse, they can trigger the underlying action if the API isn't secured.

**Why it happens:**
Developers rely exclusively on client-side state (e.g., `if (user.role === 'admin')`) to hide UI components without applying equivalent checks at the server level (Next.js Server Components) or the API/mutation level.

**How to avoid:**
Apply `getServerUser` natively in Next.js Server Components (like `/manage/page.tsx` and `/monitor/page.tsx`) to physically prevent the rendering and delivery of unauthorized HTML to the client. Always pair UI gating with strict backend API validation.

**Warning signs:**
- Client-side tab flashing during initial page load.
- Users report seeing buttons they cannot click.
- Network tab shows unauthorized UI components in the initial HTML payload.

**Phase to address:**
Milestone v1.1 Gating

---

### Pitfall 2: Infinite Redirect Loops (Auth Bouncing)

**What goes wrong:**
Valid users (like band leaders) are incorrectly and repeatedly redirected to the Google login screen when trying to access protected routes, creating a broken, looping experience.

**Why it happens:**
Conflicting routing logic between Next.js Middleware, client-side route guards (e.g., `useEffect` redirects), and server-side checks. Often caused by treating "loading auth state" as "unauthenticated", prompting a premature redirect before the user's role is fully resolved.

**How to avoid:**
Centralize route protection in Next.js Middleware. Ensure that "unauthenticated" and "pending/loading" are treated as distinct states. For unauthenticated/pending users on the dashboard, render the `<NextServiceCard>` hero immediately rather than forcing a redirect.

**Warning signs:**
- Browser console warnings about `ERR_TOO_MANY_REDIRECTS`.
- Blank screens with flickering URLs.
- High bounce rates on the authentication callback route.

**Phase to address:**
Milestone v1.1 Gating

---

### Pitfall 3: Accidental Over-Fetching on Public Views

**What goes wrong:**
The public schedule page becomes incredibly slow or hits database read limits because it attempts to fetch and resolve granular data (like musician assignments and individual user profiles) for every upcoming setlist.

**Why it happens:**
Developers reuse existing, complex database queries (built for the Admin/Manage view) for the public schedule view to save time, inadvertently pulling unnecessary relational data.

**How to avoid:**
Create a dedicated, shallow query for the schedule page that strictly lists upcoming public setlists and their associated dates. Explicitly exclude musician assignments and inner details from this fetch.

**Warning signs:**
- Noticeable UI lag or long TTFB (Time to First Byte) on the `/schedule` route.
- Firestore/Database read spikes correlating with schedule page visits.

**Phase to address:**
Milestone v1.1 Gating

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Reusing Admin queries for public views | Saves writing a new database query | Cripples performance; exposes internal data to the client | Never for production public routes |
| Client-side route blocking | Faster to implement than Middleware | Causes layout shifts, UI flashes, and security vulnerabilities | MVP only; never for sensitive data |
| Hardcoding role checks (`role === 'admin'`) | Quick implementation for single roles | Unmaintainable when adding new roles (e.g., 'band_leader', 'musician') | Never; use capability-based checks |

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Firebase Auth | Relying on the client SDK to determine route access | Use Firebase Admin SDK / session cookies in Middleware/Server Components |
| WebSockets | Initializing the connection before verifying user roles | Verify role via `getServerUser` in `/monitor/page.tsx` before mounting the socket client |
| Google OAuth | Not handling the "pending" state during token exchange | Show deterministic loading UI or public fallback (e.g., `<NextServiceCard>`) |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Fetching full setlists for schedule | Slow schedule page load times | Create a projection/shallow query for schedule data | > 50 setlists |
| Synchronous PDF loading | UI freezes when clicking a song | Implement background pre-fetching for the next 2 songs | > 5 songs per setlist |
| Real-time state in Firestore | High costs, latency in updates | Transition ephemeral `LiveState` to RTDB or Zustand | > 10 concurrent users |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Client-gated WebSocket initialization | Unauthorized users connecting to live performance streams | Server-side role validation before socket handshake |
| Sending full musician profiles to unauthenticated schedule | PII exposure | Strict database query scoping for public schedule routes |
| Action buttons hidden by CSS only | Malicious users triggering unauthorized mutations via API | Secure the API endpoint and use Server Components |

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Flashing unauthorized UI | Confusion and feeling of a "broken" site | Server-side rendering with `getServerUser` |
| Bouncing unauthenticated users | Frustration, high drop-off | Show immediate public value (e.g., `<NextServiceCard>`) |
| Waiting for PDFs during performance | Awkward pauses during live sets | Background pre-fetching |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Role-based UI:** Often missing API security — verify the endpoint rejects unauthorized requests.
- [ ] **Auth Redirects:** Often missing edge cases — verify behavior for "pending" users and expired sessions.
- [ ] **Schedule Page:** Often missing optimized queries — verify the network tab to ensure no musician data is being fetched.
- [ ] **Dashboard Hero:** Often missing instant render — verify unauthenticated users see the `<NextServiceCard>` without any layout shift.

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| UI Leak (Security) | HIGH | Immediately patch the API to reject unauthorized requests, then fix the UI rendering. |
| Redirect Loop | HIGH | Revert to a stable routing configuration; isolate auth checks to a single source of truth. |
| Over-fetching | MEDIUM | Deploy an emergency shallow query and update the frontend to use it. |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Client-Side Only Authorization | Milestone v1.1 Gating | Audit initial HTML payload for unauthorized elements; test API endpoints. |
| Infinite Redirect Loops | Milestone v1.1 Gating | Simulate login flows for all roles; monitor browser console for redirects. |
| Accidental Over-Fetching | Milestone v1.1 Gating | Profile database queries on the `/schedule` route. |

## Sources

- CentralReform.live PROJECT.md Context
- Next.js App Router Documentation (Server Components & Middleware)
- Known issues from Milestone v1.1 Gating requirements

---
*Pitfalls research for: Next.js Role-based Authorization, Redirects, and Data Fetching*
*Researched: 2026-03-13*
