# Project Research Summary

**Project:** Sheet Music App
**Domain:** Next.js Authorization, Realtime State, and Data Fetching
**Researched:** 2026-03-13
**Confidence:** HIGH

## Executive Summary

The Sheet Music App is a Next.js application requiring robust role-based authorization, seamless redirect handling, and efficient data fetching for both authenticated and public routes. The goal is to provide a frictionless experience where users never see flashes of unauthorized content or get trapped in redirect loops.

The recommended approach relies heavily on Next.js App Router features—specifically, Edge Middleware (`src/proxy.ts`) for early path blocking, and React Server Components (RSC) with `getServerUser` for server-side UI gating. By verifying roles on the server before the client shell renders, we can guarantee zero layout shifts and secure the UI.

The key risks (pitfalls) revolve around legacy patterns: relying on client-side state for authorization (causing UI leaks), conflicting routing logic (causing infinite redirects), and reusing heavy administrative queries for public views (causing performance bottlenecks). Shifting authorization to the server and decoupling the public schedule query are the primary mitigations.

## Key Findings

### Recommended Stack

The stack is centered around Next.js and Firebase, emphasizing server-side validation.

**Core technologies:**
- Next.js App Router & Middleware: Route gating and redirect loop prevention — Core framework feature. Stops unauthorized requests before rendering.
- Firebase Admin SDK: Server-side token verification — Essential for validating secure HTTP-only cookies in `getServerUser` and Middleware.
- React Server Components (RSC): Role-based UI gating — Native to Next.js. Allows rendering role-specific UI on the server, ensuring zero UI layout shifts or authorization flashes.

### Expected Features

**Must have (table stakes):**
- Role-based UI Gating — Users should only see actions they can perform (e.g., Musicians shouldn't see "Clone Setlist").
- Correct Login Redirect Handling — Authenticated users shouldn't be erroneously kicked back to Google login.
- Simplified Schedule Display — A straightforward, chronological list of upcoming services/setlists.
- Frictionless Unauth Access — Unauthenticated users immediately see the `<NextServiceCard>` hero on the dashboard.

**Should have (competitive):**
- Zero UI/Auth Flashes — Users instantly see correct layout without a split-second of unauthorized UI flashing.

**Defer (v2+):**
- Background Pre-fetching — Implement PDF cache for next 2 songs.
- Real-time State Transition — Move ephemeral `LiveState` from Firestore to Realtime Database.
- Complex Schedule Analytics.

### Architecture Approach

The architecture separates routing concerns into distinct layers to optimize performance and security.

**Major components:**
1. `src/proxy.ts` (Edge Middleware) — Early interception of unauthorized users and role-based path blocking.
2. Server Pages (`page.tsx`) — Deep role verification via `getServerUser()`, fetching DB configs to gate access, SSR data loading.
3. Client Pages (`*Client.tsx`) — Rendering interactive UI, optimistic updates, and real-time listeners.

### Critical Pitfalls

1. **Client-Side Only Authorization (UI Leaks & Flashing)** — Avoid by applying `getServerUser` natively in Next.js Server Components to physically prevent the delivery of unauthorized HTML.
2. **Infinite Redirect Loops (Auth Bouncing)** — Avoid by centralizing route protection in Next.js Middleware and rendering public fallbacks instead of forcing redirects for pending states.
3. **Accidental Over-Fetching on Public Views** — Avoid by creating a dedicated, shallow query for the schedule page that strictly lists upcoming public setlists.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Milestone v1.1 Gating (Auth & Routing Fixes)
**Rationale:** Fixes critical bugs affecting current user experience, security, and performance.
**Delivers:** Server-Side UI Gating, Correct Login Redirect Handling, Simplified Schedule Display, Frictionless Dashboard.
**Addresses:** Role-based UI Gating, Correct Login Redirect Handling, Simplified Schedule Display.
**Avoids:** Client-Side Only Authorization, Infinite Redirect Loops, Accidental Over-Fetching.

### Phase 2: Performance Enhancements
**Rationale:** Improves the live performance experience (a core value proposition) once the routing foundation is stable.
**Delivers:** Background pre-fetching for PDFs.
**Uses:** Zustand (Client state & optimistic updates).
**Implements:** Client UI optimization.

### Phase 3: Realtime Infrastructure Optimization
**Rationale:** Reduces costs and latency for live setlist tracking as the user base grows.
**Delivers:** Migration of `LiveState` away from Firestore.
**Uses:** Firebase Realtime Database (RTDB).
**Implements:** Real-time Data Sync Architecture.

### Phase Ordering Rationale

- Phase 1 tackles immediate stability and security. Without proper SSR gating and routing, the application is fundamentally broken for certain roles.
- Phase 2 builds on a stable application to deliver performance enhancements that matter during live usage.
- Phase 3 defers backend infrastructure optimization until after core UX issues are resolved.
- This grouping ensures that the critical pitfalls (broken auth, slow public routes) are addressed immediately.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 3:** Firebase RTDB vs Redis specifics for the exact `LiveState` data structure and migration path.

Phases with standard patterns (skip research-phase):
- **Phase 1:** Well-documented Next.js App Router and Middleware patterns.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Verified with Next.js and Firebase documentation |
| Features | HIGH | Clear mapping to MVP/v1.1 requirements |
| Architecture | HIGH | Standard Next.js server component model |
| Pitfalls | HIGH | Known and observed issues in the current domain |

**Overall confidence:** HIGH

### Gaps to Address

- **Schedule Query Shape:** The exact data structure for the simplified schedule query needs definition during implementation of Phase 1.

## Sources

### Primary (HIGH confidence)
- Next.js Documentation — Server Components & Middleware patterns.
- Firebase Documentation — RTDB vs Firestore pricing and latency.
- Local `package.json` — Verified existing stack versions (Next.js 16.1, React 19, Firebase 12/13).
- `.planning/PROJECT.md` — Core Values and v1.1 Gating requirements.

---
*Research completed: 2026-03-13*
*Ready for roadmap: yes*
