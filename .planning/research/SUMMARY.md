# Project Research Summary

**Project:** Auth & Access Audit (CentralReform.live)
**Domain:** Next.js 16 + Firebase Auth v11 (RBAC Audit)
**Researched:** 2026-03-14
**Confidence:** HIGH

## Executive Summary

The "Auth & Access Audit" for CentralReform.live focuses on hardening the authentication and role-based access control (RBAC) systems of a worship music platform. Built on Next.js 16 and Firebase v11, the project aims to eliminate persistent session bugs and permission leaks that allow unauthorized users to see sensitive UI elements like "Edit" buttons or monitor controls. The core value lies in providing a tailored experience where musicians see only relevant tools, while the public can access marked songs frictionless via token-based links.

The recommended approach leverages Next.js 16's `proxy.ts` for server-side session management and Firebase Custom Claims for O(1) RBAC verification. This architecture eliminates "layout flashes" and ensures that security is enforced at both the UI and data layers (React Server Components and Server Actions). Key risks include "stale cookie" desyncs and role propagation lag, which will be mitigated through synchronized token refresh patterns and forced client-side hydration.

## Key Findings

### Recommended Stack

The stack is centered around Next.js 16 and Firebase v11 to provide a modern, server-centric authentication flow. The use of `proxy.ts` (replacing legacy middleware) allows for full Node.js SDK access at the edge for robust session handling.

**Core technologies:**
- **Next.js 16.x**: Framework — Standard for RSC; uses `proxy.ts` for robust auth handling.
- **Firebase Auth v11.x**: Identity Provider — Supports Custom Claims for O(1) server-side RBAC.
- **Firebase Admin SDK v13.x**: Server Auth — Essential for verifying session cookies and managing claims.
- **next-firebase-auth-edge 2.x**: Auth Handshake — Syncs Firebase client state with HTTP-only cookies.
- **React 19.x**: UI Library — Introduces `use cache` for role-based scoping and data leak prevention.

### Expected Features

The feature set balances standard platform requirements with unique differentiators for the worship music domain.

**Must have (table stakes):**
- **Tiered RBAC** — Distinct views for Admins, Band Leaders, Musicians, and Tech Crew.
- **Setlist Management** — Core utility supporting reordering and song keys.
- **Mobile-First Viewer** — High-performance "Performance Mode" for stage use.
- **Google OAuth Hardening** — Frictionless but secure onboarding for volunteers.

**Should have (competitive):**
- **Frictionless Public Links** — Instant access for guests without login (unique differentiator).
- **X32 Monitor Bridge** — Integrated monitor mix controls based on user-to-bus mapping.
- **AI Transposition** — Gemini-powered chord shifting for complex formatting.

**Defer (v2+):**
- **Offline Mode PWA** — Complex caching for no-internet scenarios.
- **Automated CCLI Reporting** — Legal compliance automation.

### Architecture Approach

A multi-layered RBAC system that enforces security at the Edge, on the Server (RSC), and in the Data Access Layer (DAL).

**Major components:**
1. **Proxy/Middleware** — Route-level guarding and session cookie synchronization at the Edge.
2. **Data Access Layer (DAL)** — Centralized auth logic using React `cache()` to prevent permission bleed.
3. **Custom Claims** — Stateless, secure role storage within the Firebase JWT for high performance.
4. **Server Components (RSC)** — Component-level filtering to hide privileged UI before it reaches the client.

### Critical Pitfalls

1. **The "Stale Cookie" Desync** — Client-side tokens refresh but server cookies remain stale. Avoid by syncing `onIdTokenChanged` via `POST`.
2. **Custom Claim Propagation Lag** — 1-hour delay in role updates. Avoid by forcing `getIdToken(true)` on the client.
3. **Next.js Router Cache Leak** — Old UI segments visible after account switching. Avoid using `router.refresh()` on logout.
4. **Static Rendering Authorization Leak** — Protected pages accidentally cached as static. Avoid by calling `cookies()` to force Dynamic Rendering.

## Implications for Roadmap

### Phase 1: Foundation & Session Hardening
**Rationale:** Establishes the secure "proxy" pattern and fixes the most reported "stale session" bugs that plague the current implementation.
**Delivers:** Robust login/logout flows, cookie-syncing middleware, and the initial Data Access Layer (DAL).
**Addresses:** AUTH-AUDIT-01, AUTH-ROBUST.
**Avoids:** Pitfall 1 (Stale Cookie) and Pitfall 3 (Router Cache Leak).

### Phase 2: Strict RBAC & UI Filtering
**Rationale:** Implements the core "Edit" and "Monitor" visibility logic using the hardened session foundation.
**Delivers:** Custom Claims integration, role-based component filtering (RSC), and Server Action protection (Logic Lock).
**Addresses:** RBAC-01, RBAC-02, UI-UX-01.
**Avoids:** Pitfall 2 (Claim Lag), Pitfall 4 (Static Leak), and Pitfall 5 (Action Bypass).

### Phase 3: Public Access & Frictionless Links
**Rationale:** Extends the auth system to handle token-based, unauthenticated access safely for community members.
**Delivers:** Public song flags, secure token-based link generation, and a dedicated guest viewer mode.
**Addresses:** PUBLIC-01.

### Phase Ordering Rationale
- **Dependency:** Session hardening must come first because all subsequent RBAC checks rely on a reliable, synchronized session cookie.
- **Grouping:** RBAC and UI filtering are grouped because they both utilize the same Custom Claims and RSC patterns.
- **Risk Mitigation:** By addressing session desyncs early, we eliminate the most frequent source of user complaints before moving to more complex role logic.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (X32 Integration):** Hardware bus mapping requires validation of network security when exposed via RBAC.
- **Phase 3 (Public Links):** Token expiration and revocation strategies for guest links need specific implementation patterns.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Auth Hardening):** Next.js 16 `proxy.ts` and `next-firebase-auth-edge` have established patterns.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Next.js 16 and Firebase v11 patterns are well-documented and standard for 2026. |
| Features | HIGH | Domain requirements are stable and clearly defined from previous iterations. |
| Architecture | HIGH | Standard RSC and DAL patterns provide a clear path forward. |
| Pitfalls | HIGH | Identified pitfalls match known App Router and Firebase behaviors. |

**Overall confidence:** HIGH

### Gaps to Address

- **X32 Network Bridge:** Need to ensure the hardware bridge doesn't bypass app-level RBAC (requires "Double-Lock" validation).
- **Session Lifetimes:** Fine-tuning the balance between security (short sessions) and volunteer UX (frictionless access).

## Sources

### Primary (HIGH confidence)
- `next-firebase-auth-edge` — Middleware patterns verified.
- Firebase Admin SDK Documentation — Session cookie management and Custom Claims.
- Next.js 16 "What's New" — `proxy.ts` and `use cache` documentation.

### Secondary (MEDIUM confidence)
- US Copyright Law Section 110 — Guidelines for religious service exemptions regarding public links.

---
*Research completed: 2026-03-14*
*Ready for roadmap: yes*
