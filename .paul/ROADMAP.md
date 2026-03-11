# Roadmap: sheet-music-app (CentralReform.live)

## Current Milestone
**v1.5 Codebase & UI/UX Hardening**
Status: In Progress
Phases: 4 of 6 complete

| Phase | Name | Plans | Status | Completed |
|-------|------|-------|--------|-----------|
| 1 | Critical Bug Fixes | 1/1 | Complete | 2026-03-10 |
| 2 | Security & API Consistency | 4/4 | Complete | 2026-03-10 |
| 3 | Architecture Cleanup | 3/3 | Complete | 2026-03-10 |
| 4 | Quality & Deps | 1/1 | Complete | 2026-03-10 |
| 5 | UI/UX Polish | TBD | Not started | - |
| 6 | Performance & Monitoring | TBD | Not started | - |

### Phase 1: Critical Bug Fixes

Focus: Stop active data loss and resource leaks
- AI slot leak in use-smart-transposer.ts (early returns bypass releaseAiSlot)
- clearSaveTimer() wiring into component cleanup (annotations lost on unmount)
- Race condition in use-musician-transposition.ts (stale state after await)
- initAdmin() return value checks (silent failures on missing credentials)
- JSON.parse/stringify sanitization in setlist-firebase.ts (replace with Zod/explicit filtering)

### Phase 2: Security & API Consistency

Focus: Fix vulnerabilities and unify route patterns
- npm audit fix (fast-xml-parser, ajv CVEs)
- Security headers: CSP, HSTS, Permissions-Policy
- QR code expiry enforcement at redemption
- Error message sanitization (no internal details leaked)
- Bridge credentials redesign (eliminate raw private key exposure)
- Migrate 23 withAuth routes to createApiHandler
- Fix HTTP status codes (201 for creation, 202 for async)
- Add missing CORS headers on public endpoints

### Phase 3: Architecture Cleanup

Focus: Restructure before testing/measuring
- Split SetlistEditorV2.tsx (708 LOC) into sub-components
- Split MusicianPicker.tsx (824 LOC) into sub-components
- Split SongChartsLibrary.tsx (473 LOC) into sub-components
- Split TransposerMenu.tsx (411 LOC) into sub-components
- Split useMusicStore into focused stores (playback, AI, performance, chordEdit)
- Remove dead code: SetlistDrawerLegacy, PerformanceBottomBar

### Phase 4: Quality & Deps

Focus: Fix test environment and dependencies before adding new tests
- Vitest environment fix (node → jsdom)
- Dependency updates (pdfjs-dist, jsdom, @types/node)
- Font subsetting (Poppins weights ~50KB savings)
- Re-enable ESLint exhaustive-deps rule
- Document all required Firestore composite indexes

### Phase 5: UI/UX Polish

Focus: Accessibility and tablet experience
- Tablet landscape breakpoint (PDF left / toolbar right at 1024px)
- prefers-reduced-motion support for all animations
- Modal focus trapping (WCAG 2.4.3)
- Replace hard-coded blue colors in LibraryFileRow with brand palette
- Ghost button hover states (increase from 5% to 10-15% opacity)
- Zoom level indicator in PDFViewer
- Skip-to-main-content link for keyboard navigation

### Phase 6: Performance & Monitoring

Focus: Measure the final, clean codebase
- Bundle analyzer setup (@next/bundle-analyzer)
- Sentry client-side integration + Web Vitals tracking
- Offline write queue (IndexedDB WAL + sync-on-reconnect for annotations)
- Component test coverage for critical paths (SetlistEditor, PerformanceToolbar)

## Completed Milestones

<details>
<summary>v1.4 Fixes & Library Management - 2026-03-10 (5 phases, 5 plans)</summary>

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| 1 | Library Management | 1/1 | 2026-03-10 |
| 2 | Setlist & Editor Fixes | 1/1 | 2026-03-10 |
| 3 | Print Gig Packet Fixes | 1/1 | 2026-03-10 |
| 4 | PDF Health Scanner | 1/1 | 2026-03-10 |
| 5 | Backend Analysis & Bug Scan | 1/1 | 2026-03-10 |

Archive: `.paul/milestones/v1.4-ROADMAP.md`

</details>

<details>
<summary>v1.3.1 Regression Fixes - 2026-03-10 (1 phase, 1 plan)</summary>

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| 1 | Regression Fixes | 1/1 | 2026-03-10 |

Archive: `.paul/milestones/v1.3.1-ROADMAP.md`

</details>

<details>
<summary>v1.3 Bugsweep & Backend Hardening - 2026-03-10 (4 phases, 7 plans)</summary>

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| 1 | Codebase Audit & Recommendations | 1/1 | 2026-03-10 |
| 2 | Critical Fixes (Security & Data Integrity) | 2/2 | 2026-03-10 |
| 3 | Backend Hardening (Error Handling & Consistency) | 2/2 | 2026-03-10 |
| 4 | Frontend Robustness (Hooks, Types, Cleanup) | 2/2 | 2026-03-10 |

Archive: `.paul/milestones/v1.3-ROADMAP.md`

</details>

<details>
<summary>v1.2 Library, Manage & Monitor Overhaul - 2026-03-09 (9 phases, 10 plans)</summary>

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| 23 | Library Archive & Health | 2 | 2026-03-09 |
| 24 | Manage Section Redesign | 1 | 2026-03-09 |
| 25 | Monitor Stability | 1 | 2026-03-09 |
| 26 | Monitor UX Redesign | 1 | 2026-03-09 |
| 27 | Monitor Connection Architecture Overhaul | 1 | 2026-03-09 |
| 28 | Monitor Tab & User List Cleanup | 1 | 2026-03-09 |
| 29 | Templates Section Relocation | 1 | 2026-03-09 |
| 30 | Tasks Route 404 Fix | 1 | 2026-03-09 |
| 31 | PDF Display Fix | 1 | 2026-03-09 |

</details>

<details>
<summary>v1.1 UI/UX Hardening - 2026-03-09 (11 phases, 19 plans)</summary>

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| 12 | Touch & Accessibility Foundations | 2 | 2026-03-09 |
| 13 | Color Contrast & Typography Hierarchy | 2 | 2026-03-09 |
| 14 | Component Consistency | 3 | 2026-03-09 |
| 15 | Loading & Feedback States | 2 | 2026-03-09 |
| 16 | Responsive & Mobile Polish | 2 | 2026-03-09 |
| 17 | Schedule Overhaul | 2 | 2026-03-09 |
| 18 | Homepage & Library UX | 2 | 2026-03-09 |
| 19 | Setlist Search & Intelligence | 2 | 2026-03-09 |
| 20 | Performance Mode Overhaul | 2 | 2026-03-09 |
| 21 | Monitor Stability & Enhancements | 1 | 2026-03-09 |
| 22 | Milestone Gaps & Deferred Items | 1 | 2026-03-09 |

</details>

<details>
<summary>v1.0 Full Launch - 2026-03-08 (5 phases, 12 plans)</summary>

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| 7 | QA & Bug Sweep | 2 | 2026-03-08 |
| 8 | Missing Features Audit | 3 | 2026-03-08 |
| 9 | UI/UX Polish & Usability | 2 | 2026-03-08 |
| 10 | Admin Console Redesign | 4 | 2026-03-08 |
| 11 | Launch Prep | 1 | 2026-03-08 |

</details>

<details>
<summary>v0.1 UI/UX Redesign - 2026-03-08 (6 phases, 12 plans)</summary>

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| 1 | Design Foundation | 2 | 2026-03-08 |
| 2 | Navigation & Layout | 2 | 2026-03-08 |
| 3 | Dashboard & Home | 2 | 2026-03-08 |
| 4 | Setlist & Performance Views | 3 | 2026-03-08 |
| 5 | Library & Monitor Mix | 2 | 2026-03-08 |
| 6 | Polish & Accessibility | 1 | 2026-03-08 |

</details>

---
*Roadmap created: 2026-03-10*
*Last updated: 2026-03-10 (v1.5 milestone created)*
