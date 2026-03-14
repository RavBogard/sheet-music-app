# Feature Research

**Domain:** Authorization Gating, Routing, and Schedule Display
**Researched:** 2026-03-13
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Role-based UI Gating | Users should only see actions they can perform. Musicians shouldn't see admin actions (e.g., clone setlist). | MEDIUM | Requires reliable user context (e.g., `getServerUser` and React context) and conditional UI rendering. Needs server-side validation to prevent unauthorized actions. |
| Correct Login Redirect Handling | Authenticated users (like band leaders) shouldn't be erroneously kicked back to Google login. Unauth users should be prompted contextually. | MEDIUM | Relies on solid middleware or layout wrappers. Edge cases in state hydration or expired tokens often cause these bugs. |
| Simplified Schedule Display | A straightforward list of upcoming services/setlists regardless of complex individual assignments. | LOW | Re-scoping the query to simply list upcoming public setlists by date, decoupling from strict musician assignments for basic viewing. |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Zero UI/Auth Flashes | Aligns with "Core Value". Users instantly see correct layout without a split-second of unauthorized UI flashing. | HIGH | Requires Server-Side Rendering (SSR) checks (e.g., applying `getServerUser` to `/manage/page.tsx`, `/monitor/page.tsx`) before delivering the client bundle. |
| Frictionless Unauth Access | Unauthenticated and pending users immediately see the `<NextServiceCard>` hero on the dashboard without hitting login walls. | LOW | Needs specific routing fallback logic on the dashboard to present public-facing components instead of global redirects. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Fine-grained Permission Models | Allows custom permissions per user instead of roles. | Extreme complexity, hard to audit, overkill for the application's scale. | Stick to simple, well-defined role Enums (Admin, Band Leader, Musician, Pending). |
| Client-side Only Gating | Fast to implement, just hide buttons in React state. | Prone to UI flashes before state hydrates; highly insecure if API routes remain unprotected. | Server-side gating via `getServerUser` combined with protected API endpoints. |
| Musician-centric Complex Schedules | Filtering the schedule based heavily on individual assignments. | Causes confusion if assignments are incomplete or change frequently; leads to blank states. | A simple, chronological list of all upcoming public services. |

## Feature Dependencies

```text
[Zero UI/Auth Flashes]
    └──requires──> [Role-based UI Gating (SSR)]
                       └──requires──> [Robust Auth Context (`getServerUser`)]

[Correct Login Redirect Handling] ──requires──> [Robust Auth Context (`getServerUser`)]

[Simplified Schedule Display] ──enhances──> [Frictionless Unauth Access]

[Client-side Only Gating] ──conflicts──> [Zero UI/Auth Flashes]
```

### Dependency Notes

- **[Zero UI/Auth Flashes] requires [Role-based UI Gating (SSR)]:** You cannot prevent flashes if the client has to render first and then check permissions. It must be gated at the server layout level.
- **[Correct Login Redirect Handling] requires [Robust Auth Context]:** The router needs absolute certainty about the user's logged-in state to avoid bouncing valid users (like band leaders) to the login screen.
- **[Simplified Schedule Display] enhances [Frictionless Unauth Access]:** By making the schedule data fetch simpler and public-by-default, it's easier to serve this data immediately to unauthenticated users.
- **[Client-side Only Gating] conflicts with [Zero UI/Auth Flashes]:** Relying on client state for gating guarantees a layout shift or flash of unauthorized content during hydration.

## MVP Definition

### Launch With (v1.1 Gating Fixes)

Minimum viable product — what's needed to resolve the current bugs.

- [x] **Correct Login Redirects** — Essential to stop band leaders from being kicked out of their sessions.
- [x] **Server-Side UI Gating** — Essential to prevent unauthorized actions (duplicate/clone) from appearing to musicians.
- [x] **Simplified Schedule** — Essential to provide a clear view of upcoming services without assignment-based filtering bugs.
- [x] **Frictionless Dashboard** — Essential to ensure unauth/pending users see the `<NextServiceCard>` immediately.

### Add After Validation (v1.x)

Features to add once core is working.

- [ ] **Background Pre-fetching** — (PERF-01) Implement PDF cache for next 2 songs.
- [ ] **Real-time State Transition** — (ARCH-04) Move ephemeral `LiveState` from Firestore.

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] **Complex Schedule Analytics** — Defer until the basic schedule view is stable.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Correct Login Redirect Handling | HIGH | MEDIUM | P1 |
| Server-Side UI Gating | HIGH | MEDIUM | P1 |
| Simplified Schedule Display | MEDIUM | LOW | P1 |
| Frictionless Unauth Access | HIGH | LOW | P1 |
| Background PDF Pre-fetching | HIGH | HIGH | P2 |
| Real-time State Transition | MEDIUM | HIGH | P2 |

**Priority key:**
- P1: Must have for current milestone (v1.1)
- P2: Should have, subsequent milestone
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Competitor A (Planning Center) | Competitor B (PraiseCharts) | Our Approach |
|---------|--------------------------------|-----------------------------|--------------|
| Schedule Gating | Highly complex, role-based, multi-org. | Mostly paywalled by licensing. | Dead-simple public view of setlists, deep-gating only for administrative mutation actions. |
| UI Rendering | Traditional SPA, some loading spinners. | Mix of server/client. | SSR-first approach with `getServerUser` to guarantee zero layout shifts for role-based features. |

## Sources

- `.planning/PROJECT.md` Core Values and v1.1 Gating requirements
- Known issues regarding Musician UI leaks and Band Leader redirects
