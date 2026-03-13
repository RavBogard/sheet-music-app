# CentralReform.live: Architecture Refinement & UX Polish

## What This Is
A continuation of the Bulletproof Auth project. Having secured the foundation (Phases 1-5), this project focuses on edge-case UX friction, performance optimization, and rigorous UI/UX standards compliance based on the `ui-ux-pro-max` guidelines.

## Core Value
Frictionless, instant access for all users (especially unauthenticated and pending users), blazing fast PDF loading, and zero UI layout shifts or authorization flashes.

## Requirements

### Active
- [ ] **UX-01 (Dashboard)**: Ensure unauthenticated and pending users see the `<NextServiceCard>` hero immediately on the dashboard.
- [ ] **SEC-04 (Monitor Gating)**: Apply `getServerUser` to `/monitor/page.tsx` to prevent unauthorized WebSocket initialization.
- [ ] **SEC-05 (Manage Gating)**: Apply `getServerUser` to `/manage/page.tsx` to prevent client-side tab flashing for Admin vs. Band Leader views.
- [ ] **PERF-01 (PDF Cache)**: Implement background pre-fetching for the next 2 songs in a setlist to eliminate loading times during live performance.
- [ ] **ARCH-04 (Real-time State)**: Transition ephemeral `LiveState` from Firestore to a faster, cheaper real-time layer (e.g., RTDB or Zustand enhancements).
- [ ] **QA-01 (UI/UX Audit)**: Perform a recursive audit against the `ui-ux-pro-max` guidelines (contrast, cursor states, SVG icons, touch targets).

---
*Last updated: 2026-03-13 after completion of Auth Refactor (Phases 1-5)*