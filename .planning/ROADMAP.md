# Project Roadmap: Architecture Refinement & UX Polish

This roadmap continues the work from the Bulletproof Auth refactor, focusing on edge-case UX, performance, and rigorous design standards.

## Completed Phases
- [x] Phase 1: Consolidate Performance Engines
- [x] Phase 2: Session Hardening & Hard Logout
- [x] Phase 3: The Public Routing Boundary
- [x] Phase 4: Server-Side UI Gating
- [x] Phase 5: API Endpoint Standardization

## Upcoming Phases

- [ ] **Phase 6: Finish Server-Side Gating (Edge Cases)** - Apply `getServerUser` to the `/monitor` and `/manage` routes to prevent client-side flashes and unauthorized WebSocket connections.
- [ ] **Phase 7: Dashboard UX Consolidation (Public Hero Cards)** - Break the `<NextServiceCard>` out of the `isMember` gate so all users, including guests, have instant access to upcoming services.
- [ ] **Phase 8: PDF Worker & Caching Optimization** - Implement aggressive background pre-fetching for the next 2 songs in a setlist.
- [ ] **Phase 9: Real-Time State Management (Zustand/RTDB)** - Move high-frequency live-session tracking off of Firestore writes.
- [ ] **Phase 10: Recursive UI/UX Pro Max Audit** - A final, exhaustive sweep against the `ui-ux-pro-max` guidelines to guarantee perfect contrast, interaction states, and accessibility across all 7 user personas.

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 6. Finish Server-Side Gating | 0/1 | Not started | - |
| 7. Dashboard UX Consolidation | 0/1 | Not started | - |
| 8. PDF Worker & Caching | 0/1 | Not started | - |
| 9. Real-Time State Management | 0/1 | Not started | - |
| 10. Recursive UI/UX Audit | 0/1 | Not started | - |