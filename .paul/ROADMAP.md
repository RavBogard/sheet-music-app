# Roadmap: sheet-music-app (CentralReform.live)

## Current Milestone
**v1.6 Stability & Regression Audit**
Status: In Progress
Phases: 0 of 4 complete

| Phase | Name | Plans | Status | Completed |
|-------|------|-------|--------|-----------|
| 1 | Auth & CSP Hardening | 1 | Planning | - |
| 2 | Firebase-Only File Serving | TBD | Not started | - |
| 3 | Performance View Overhaul | TBD | Not started | - |
| 4 | Regression Sweep & Deferred Fixes | TBD | Not started | - |

### Phase 1: Auth & CSP Hardening

Focus: Finalize auth fix (signInWithPopup deployed, skipWaiting reverted), comprehensive CSP audit, verify manifest icons with static fallbacks.
Notes: Auth already fixed via hotfix (commit 89572e5). This phase closes remaining loose ends.
Plans: 1 (01-01-PLAN.md created)

### Phase 2: Firebase-Only File Serving

Focus: Firebase Storage becomes the sole source of truth for serving files. Google Drive is intake-only.
Tasks:
- Remove or raise MAX_COPIES_PER_RUN (currently 20) so all files sync in one run
- Verify all library files are copied to Firebase Storage
- Remove Drive fallback from file-fetcher (Storage-only, fail if not found)
- Fix PDF health scanner: bypass rate limiter or use server-side direct Storage check
- Admin sync button UX: show copy progress, warn if files still pending
Skill: Use /ui-ux-pro-max for admin sync UX
Plans: TBD (defined during /paul:plan)

### Phase 3: Performance View Overhaul

Focus: Combined UI regression revert + setlist view redesign. Same components, same concern — make the live performance view right.
Tasks:
- Remove tablet sidebar toolbar (restore bottom toolbar on all viewports)
- Rethink setlist view for live performance — keys prominent next to track names, clear song order, optimized for tablet glanceability
- Verify no other unwanted visual regressions from v1.5
- This is the essential "live visual view" for the band
Skill: Use /ui-ux-pro-max for all design decisions
Plans: TBD (defined during /paul:plan)

### Phase 4: Regression Sweep & Deferred Fixes

Focus: Deep audit + close out deferred items carried since v1.3/v1.5:
- Run full test suite, fix the publish 403→400 test failure (pre-existing since v1.3)
- Complete withAuth → createApiHandler migration (12 remaining routes)
- Wire clearSaveTimer() into consuming components (deferred from v1.3)
- Verify PWA/offline, manifest icons, edge cases
- Investigate build time increase (1.5m → 2.5m) — check if Sentry source maps are the cause
Plans: TBD (defined during /paul:plan)

## Completed Milestones

<details>
<summary>v1.5 Codebase & UI/UX Hardening - 2026-03-10 (6 phases, 11 plans)</summary>

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| 1 | Critical Bug Fixes | 1/1 | 2026-03-10 |
| 2 | Security & API Consistency | 4/4 | 2026-03-10 |
| 3 | Architecture Cleanup | 3/3 | 2026-03-10 |
| 4 | Quality & Deps | 1/1 | 2026-03-10 |
| 5 | UI/UX Polish | 1/1 | 2026-03-10 |
| 6 | Performance & Monitoring | 1/1 | 2026-03-10 |

Archive: `.paul/milestones/v1.5-ROADMAP.md`

</details>

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
*Last updated: 2026-03-10 (v1.6 milestone finalized — 4 phases)*
