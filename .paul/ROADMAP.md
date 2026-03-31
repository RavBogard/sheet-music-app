# Roadmap: sheet-music-app (CentralReform.live)

## Current Milestone
**v3.1 Post-v3.0 Bugsweep & Hardening**
Status: In Progress
Phases: 5 of 5 complete
Status: Complete

| Phase | Name | Plans | Status | Completed |
|-------|------|-------|--------|-----------|
| 1 | Critical Security & Data Integrity | 2/2 | Complete | 2026-03-31 |
| 2 | Memory Leaks, Type Safety & Failing Tests | 1/1 | Complete | 2026-03-31 |
| 3 | Error Handling & v3.0 Hardening | 2/2 | Complete | 2026-03-31 |
| 4 | UX Safety & Confirmation Dialogs | 1/1 | Complete | 2026-03-31 |
| 5 | Test Coverage & Performance | 1/1 | Complete | 2026-03-31 |

### Phase 1: Critical Security & Data Integrity

Focus: P0 security vulnerabilities — unauthenticated session DELETE endpoint, timing attacks on cron auth (3 routes), scheduling race conditions (assign/unassign/respond), npm audit fix + Next.js upgrade, Firestore rules hardening (config/admins lockdown, missing collection rules, system collection).

### Phase 2: Memory Leaks, Type Safety & Failing Tests

Focus: Runtime stability — Firestore listener memory leaks (alert-store, congregation-store), add liveState to Setlist type, fix `useSafeFirestoreSync<any>` generics, eliminate production `as any` casts, fix 3 failing tests, fix ESLint errors in use-song-groups.ts.

### Phase 3: Error Handling & v3.0 Hardening

Focus: Silent failure elimination — incomplete newTrack in swap, stale tracks array race, missing null checks, swap error handling, onSnapshot error callbacks, empty catch blocks, console.error → logger migration.

### Phase 4: UX Safety & Confirmation Dialogs

Focus: Destructive action protection — SwipeToDelete confirmation, role change confirmation, template editor unsaved changes warning, scheduling-reminder maxDuration, notification error handling, auth-context async guard, pending detections cleanup.

### Phase 5: Test Coverage & Performance

Focus: Quality hardening — v3.0 test coverage (swap hooks, components, API routes), lazy-load PrintModal/jsPDF, code-split ChatPanel, ChatPanel error boundary.

## Previous Milestone
**v3.0 Live Setlist Sync**
Status: Complete
Completed: 2026-03-30

## Previous Milestone (prior)
**v2.6 Deprecation Cleanup, Tech Debt & Setlist UX**
Status: Complete
Completed: 2026-03-12

## Previous Milestone (prior)
**v2.5 Bugsweep & Test Coverage**
Status: Complete
Completed: 2026-03-12

## Completed Milestones

<details>
<summary>v2.5 Bugsweep & Test Coverage - 2026-03-12 (19 phases, 30 plans)</summary>

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| 1 | Type Safety Fixes | 1/1 | 2026-03-11 |
| 2 | Silent Failure & Error Handling | 1/1 | 2026-03-11 |
| 3 | Test Infrastructure & Flaky Fix | 1/1 | 2026-03-11 |
| 4 | Data Layer Tests | 2/2 | 2026-03-11 |
| 5 | API Route Tests | 3/3 | 2026-03-11 |
| 6 | Hook Tests | 3/3 | 2026-03-11 |
| 6.1 | SW Removal & Firestore Recovery | 2/2 | 2026-03-11 |
| 7 | Remove Annotation Feature | 1/1 | 2026-03-11 |
| 8 | Performance UX Fixes | 1/1 | 2026-03-12 |
| 8.1 | Setlist Access Bug Fixes | 1/1 | 2026-03-11 |
| 9 | Print View & Sticky Keys | 1/1 | 2026-03-12 |
| 10 | Public Setlist Access | 1/1 | 2026-03-12 |
| 10.1 | Mobile Action Bar Redesign | 1/1 | 2026-03-12 |
| 11 | Component Tests | 2/2 | 2026-03-12 |
| 12 | AI & Integration Tests | 2/2 | 2026-03-12 |
| 13 | Tablet Performance UX | 1/1 | 2026-03-12 |
| 14 | Bug Fixes & Race Conditions | 1/1 | 2026-03-12 |
| 15 | Setlist-Only Print Option | 1/1 | 2026-03-12 |
| 16 | Design Token Cleanup & Accessibility | 1/1 | 2026-03-12 |
| 17 | iPad Safe Areas & Spacing | 1/1 | 2026-03-12 |
| 18 | Backend Hardening | 1/1 | 2026-03-12 |
| 19 | Final Audit & Clean Sweep | 1/1 | 2026-03-12 |

Archive: `.paul/milestones/v2.5-ROADMAP.md`

</details>

<details>
<summary>v2.0 Schedule & Workflow Fixes - 2026-03-11 (3 phases, 3 plans)</summary>

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| 1 | Schedule Visibility Fix | 1/1 | 2026-03-11 |
| 2 | Gig Packet Modal Layout Fix | 1/1 | 2026-03-11 |
| 3 | Print PDF Layout Fixes | 1/1 | 2026-03-11 |

</details>

<details>
<summary>v1.9 Auth Stability & Deferred Cleanup - 2026-03-11 (5 phases, 4 plans)</summary>

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| 1 | Auth & Routing Regression Audit | 1/1 | 2026-03-11 |
| 2 | Auth Flow Rebuild | 1/1 | 2026-03-11 |
| 3 | Avatar System Fix | 1/1 | 2026-03-11 |
| 4 | ~~Bridge Credentials Security~~ | 0 | Skipped |
| 5 | Deferred Cleanup Batch | 1/1 | 2026-03-11 |

</details>

<details>
<summary>v1.8 Mobile UX Overhaul - 2026-03-11 (3 phases, 3 plans)</summary>

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| 1 | Mobile Navigation Redesign | 1/1 | 2026-03-11 |
| 2 | Setlist Mobile Responsive Layout | 1/1 | 2026-03-11 |
| 3 | Schedule Page Redesign | 1/1 | 2026-03-11 |

Archive: `.paul/milestones/v1.8-ROADMAP.md`

</details>


<details>
<summary>v1.7 Critical Bug Fixes - 2026-03-11 (5 phases, 5 plans)</summary>

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| 1 | Mobile Sign-In Fix | 1/1 | 2026-03-11 |
| 2 | Quick Fixes (Avatar, Changelog) | 1/1 | 2026-03-11 |
| 3 | Print Pipeline & Gig Packet Overhaul | 1/1 | 2026-03-11 |
| 4 | Key Signature Position | 1/1 | 2026-03-11 |
| 5 | Monitor Buses Investigation | 1/1 | 2026-03-11 |

Archive: `.paul/milestones/v1.7-ROADMAP.md`

</details>

<details>
<summary>v1.6 Stability & Regression Audit - 2026-03-11 (4 phases, 4 plans)</summary>

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| 1 | Auth & CSP Hardening | 1/1 | 2026-03-11 |
| 2 | Firebase-Only File Serving | 1/1 | 2026-03-11 |
| 3 | Performance View Overhaul | 1/1 | 2026-03-11 |
| 4 | Regression Sweep & Deferred Fixes | 1/1 | 2026-03-11 |

Archive: `.paul/milestones/v1.6-ROADMAP.md`

</details>


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
*Last updated: 2026-03-12 (Phase 1 complete)*
