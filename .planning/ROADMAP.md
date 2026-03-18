# Project Roadmap: Architecture Refinement & UX Polish

This roadmap continues the work from the Bulletproof Auth refactor, focusing on edge-case UX, performance, and rigorous design standards.

## Completed Phases
- [x] Phase 1: Consolidate Performance Engines
- [x] Phase 2: Session Hardening & Hard Logout
- [x] Phase 3: The Public Routing Boundary
- [x] Phase 4: Server-Side UI Gating
- [x] Phase 5: API Endpoint Standardization
- [x] Phase 6: Finish Server-Side Gating (Edge Cases)
- [x] Phase 7: Dashboard UX Consolidation (Public Hero Cards)
- [x] Phase 8: PDF Worker & Caching Optimization
- [x] Phase 10: Recursive UI/UX Pro Max Audit
- [x] Phase 11: Editor & Performance Navigation Polish

## Upcoming Phases

- [ ] **Phase 9: Real-Time State Management (Zustand/RTDB)** - (Cancelled - Not needed)
- [ ] Phase 12: Auth & Routing Deep Dive & Fixes
- [ ] **Phase 13: UI Gating & Flash Prevention**
- [ ] **Phase 14: Schedule & Dashboard Optimization**
- [ ] **Phase 16: PDF Processing & Metadata Pipeline**
- [ ] **Phase 17: Library Collection UI Segregation**

### Phase Details

#### Phase 12: Auth & Routing Deep Dive & Fixes
- **Requirements:** AUTH-04, AUTH-07
- **Success Criteria:**
  - Routing logic and authentication state flow are fully documented and stable.
  - Admins can successfully upload files to the library without encountering 403 Forbidden errors.
  - Authentication state transitions occur without unexpected connection drops.

#### Phase 13: UI Gating & Flash Prevention
- **Requirements:** AUTH-05, AUTH-06
- **Success Criteria:**
  - Musicians do not see administrative action buttons such as 'Clone Setlist' or 'Duplicate'.
  - Protected pages render instantly with appropriate role-based UI, exhibiting zero layout shifts or auth flashes.
  - Unauthorized users are properly gated via server-side rendering.

#### Phase 14: Schedule & Dashboard Optimization
- **Requirements:** DATA-01, DATA-02
- **Success Criteria:**
  - Unauthenticated and pending users immediately see the hero card on the dashboard.
  - The schedule page displays a straightforward, chronological list of upcoming public setlists.
  - Schedule queries are optimized and decoupled from heavy assignment data.

#### Phase 16: PDF Processing & Metadata Pipeline
- **Requirements:** DATA-03, DATA-04, DATA-05, DATA-06
- **Success Criteria:**
  - Local script successfully strips the first page from a batch of raw PDFs.
  - Script correctly extracts Title and Author from the filenames using Regex, formatting them to title case.
  - Cleaned PDFs are uploaded to Firebase Storage and corresponding populated records are created in Firestore with a `collection` identifier.

#### Phase 17: Library Collection UI Segregation
- **Requirements:** UI-04, UI-05, UI-06, ARCH-04
- **Success Criteria:**
  - Firestore `Song` schema formally typing supports a `collection` field.
  - The Library UI visually distinguishes core from supplemental charts via distinct color badges.
  - Users can filter search results by collection.
  - Manual upload dialogue requires the user to select a destination collection.

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 6. Finish Server-Side Gating | 1/1 | Completed | 2026-03-13 |
| 7. Dashboard UX Consolidation | 1/1 | Completed | 2026-03-13 |
| 8. PDF Worker & Caching | 1/1 | Completed | 2026-03-13 |
| 9. Real-Time State Management | 0/1 | Cancelled | 2026-03-13 |
| 10. Recursive UI/UX Audit | 1/1 | Completed | 2026-03-13 |
| 11. Editor & Navigation Polish | 1/1 | Completed | 2026-03-13 |
| 12. Auth & Routing Fixes | 0/1 | Pending | — |
| 13. UI Gating & Flash Prevention | 0/1 | Pending | — |
| 14. Schedule & Dashboard Opt. | 0/1 | Pending | — |
| 16. PDF Processing Pipeline | 0/1 | Pending | — |
| 17. Library Collection UI | 0/1 | Pending | — |
### Phase 18: MuseScore file import and MusicXML conversion

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 17
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 18 to break down)

### Phase 19: Native transposition for MusicXML and structured score files

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 18
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 19 to break down)
