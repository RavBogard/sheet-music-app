# Roadmap: sheet-music-app (CentralReform.live)

## Current Milestone
**v4.4 Deferred Audit Sweep — Architectural Polish**
Status: 🚧 In Progress
Phases: 1 of 8 complete
Goal: Close the architectural debt surfaced by the v4.3 + v4.4 full-project audit (186 findings across 6 parallel agents) that couldn't be patched with targeted diffs. Band onboarding is ~2 weeks out; P0/P1 phases must land before the band touches the app.

| Phase | Name | Plans | Status | Completed |
|-------|------|-------|--------|-----------|
| 0 | Full-project audit (R1+R2, 186 findings, batches 1+2 shipped) | done | ✅ Complete | 2026-04-15 |
| 1 | Data-layer atomicity — scheduling transactions (DL-001/002/003/012/013/014) | 1/1 | ✅ Complete | 2026-04-15 |
| 2 | Denormalization reconciliation — user-rename fan-out (DL-010) | TBD | Not started | - |
| 3 | Client async safety — AbortController sweep (~11 sites from R2B) | TBD | Not started | - |
| 4 | File-size refactor — 5 files >600 LOC | TBD | Not started | - |
| 5 | Observability — request IDs + SSE status (L-001, S-004) | TBD | Not started | - |
| 6 | Modal state hygiene — 4 modals with state-reset bugs | TBD | Not started | - |
| 7 | Type-safety tail — remaining `any`s + UserRole dedup + zod coverage | TBD | Not started | - |
| 8 | Perf tail — useCallback + SearchResults memo | TBD | Not started | - |

Priority: P1=Phase 1/2/3/5 (ship before band onboarding); P2=Phase 4/6/7/8 (ship if small, defer otherwise).

## Previous Milestone
**v4.3 Deep Audit Remediation**
Status: ✅ Complete
Completed: 2026-04-15
Phases: 10 (original 9 + Phase 10 auth deep-dive added mid-cycle)
Goal: Close the P0/P1 gaps surfaced by the v4.3 Phase 1 recursive audit (83 findings) + the role-claim-sync latent bug surfaced during 04-03 rollout before the band onboards.

| Phase | Name | Plans | Status | Completed |
|-------|------|-------|--------|-----------|
| 1 | Recursive Audit (bugs/security/UX/data/perf/dead-code) | 1/1 | ✅ Complete | 2026-04-14 |
| 2 | P0 Security Triage (S01 chat prompt injection, S03 drive-file auth) | 2/2 | ✅ Complete | 2026-04-14 |
| 3 | Bridge Credentials Design (S02 — CRIT-003) | 2/2 | ✅ Complete | 2026-04-14 |
| 4 | P0 Data Integrity (D01 orphan cascade, D02 .passthrough, D03 assign race) | 3/3 | ✅ Complete | 2026-04-14 |
| 5 | P0 Bugs + UX (B01 silent catches, B02 alert-store, U01 touch, U02 keyboard) | 4/4 | ✅ Complete | 2026-04-14 |
| 6 | P1 Security + Bugs (S04 QR role gate, S05 schema wontfix, S06 wontfix, B03 monitor race, B06 swapTrack guard; B04/B05 false positive on review) | 2/2 | ✅ Complete | 2026-04-15 |
| 7 | P1 Data sweep (D05 eventDate shape; D04 auto-indexed, false positive) | 1/1 | ✅ Complete | 2026-04-15 |
| 8 | Performance + Dead-Code Sweep (P01-P05, C01-C04) | 0/TBD | ⏭️ Deferred to v4.4 | - |
| 9 | Role-Claim Sync (latent auth bug surfaced during 04-03) | 2/2 | ✅ Complete | 2026-04-15 |
| 10 | Auth Deep-Dive Hardening (added mid-cycle) | 6/6 | ✅ Complete | 2026-04-15 |

### Phase 1: Recursive Audit ✓
Deliverable: `.paul/phases/v43-01-recursive-research/FINDINGS.md`
6 parallel deep-audit agents → 83 raw findings synthesized into 10 P0 + ~20 P1 + balance P2. Prioritized action list and phase split drafted.

### Phase 10 (added mid-cycle): Auth Deep-Dive Hardening
After a recurring `/setlists ↔ /login` regression surfaced the architectural fragility of the auth flow, ran a fresh 2-wave 4-agents-each recursive research pass (WAVE-1A/B/C/D + WAVE-2A/B/C/D) producing FINDINGS + FINDINGS-v2. Shipped 6 plans: 10-01 fail-fast env + initAdmin guards + bounce-cookie path, 10-02 cold-load race kill (router.refresh after cookie + cold-load mount refresh + login UX), 10-03 drift-repair module with 3× retry + `[drift]` telemetry, 10-04 restore Firestore isMember() gate on setlists, 10-05 Playwright smoke + CI job, 10-06 cross-tab sign-out via BroadcastChannel.

## Previous Milestone
**v4.2 UX Polish & Band Onboarding**
Status: ✅ Complete
Completed: 2026-04-14
Phases: 8

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| 1 | Recursive Research (Bugs/Gaps/Failures) | 1/1 | 2026-04-13 |
| 1.1 | Concurrent-edit Safety | 1/1 | 2026-04-13 |
| 1.2 | Offline Truthiness | 1/1 | 2026-04-13 |
| 1.3 | Security Hardening | 1/1 | 2026-04-13 |
| 2 | Weekly Workflow Polish | 4/4 | 2026-04-13 |
| 3 | Stage UX for the Band | 4/4 | 2026-04-14 |
| 4 | Editor Ergonomics + Noise Cleanup | 6/6 + audit | 2026-04-14 |
| 5 | Navigation + Schedule Hygiene | 2/2 + audit | 2026-04-14 |

Focus: Deep app hardening pre-band-onboarding. Multi-wave audit → 53+ findings → 7 execution phases. Concurrent-edit safety via Firestore runTransaction + rev precondition. Offline truthiness via IndexedDB blob store (Cache-API pretense removed). Security hardening (storage.rules in VC, 10-char bridge setup-code, rate limits). Weekly-workflow polish (save-reliability flush route, single-step wizard, role-aware dashboard). Stage UX (per-track transposition display, amber cue-notes, IDB-backed offline indicator, SwapPicker keyboard/iOS polish, PDFOverlay ErrorBoundary). Editor cleanup (canEditSetlist helper, apiFetch timeout + PDFViewer abort, role-aware OnboardingCard, toast hygiene, Move-Up/Down buttons, triple-modal audit). Navigation hygiene (mobile Schedule tab, UnifiedCalendar cleanup, dead musician_availability indexes dropped, orphan /settings routes removed, SetlistDrawer + monitor-live audited-live).

## Previous Milestone
**v4.1 Kill Private Setlists (for real this time)**
Status: Complete
Completed: 2026-04-13
Phases: 1

| Phase | Name | Plans | Status | Completed |
|-------|------|-------|--------|-----------|
| 1 | Kill Private Setlists | 1/1 | Complete | 2026-04-13 |

### Phase 1: Kill Private Setlists

Focus: Finished what v4.0 Phase 2 started. Removed `isPublic` from the type, schema, service signature, and every caller. One-shot Firestore migration stripped the field from 25 of 26 existing setlist docs (idempotent). Removed lingering UI affordances. Added a regression-guard test.

## Previous Milestone
**v4.0 Live Swap Redesign**
Status: Complete
Completed: 2026-04-04
Phases: 3

| Phase | Name | Plans | Status | Completed |
|-------|------|-------|--------|-----------|
| 1 | Teardown Old Live System | 1/1 | Complete | 2026-04-04 |
| 2 | Remove Private Setlists | 1/1 | Complete | 2026-04-04 |
| 3 | Inline Swap + Toast | 1/1 | Complete | 2026-04-04 |

### Phase 1: Teardown Old Live System

Focus: Remove LeaderConsole, SwapButton, SwapBottomSheet, SwapToast, /live/[id] receiver page, liveState, presence tracking, canLiveSwap permission, song groups/liturgicalSlot system, admin Song Groups tab, canLiveSwap toggle in UserRow. Clean removal — no replacement yet.

### Phase 2: Remove Private Setlists

Focus: Eliminate the isPublic flag distinction. All setlists are public. Remove personal tab, ownership-gated restrictions. Any band leader or admin can edit any setlist. Simplify Firestore rules, UI, and data model.

### Phase 3: Inline Swap + Toast

Focus: Leader taps a song in the performance view → search picker appears pre-populated with fuzzy name matches from the library (e.g., Barechu variants). Leader picks replacement → Firestore tracks array updates → everyone's view updates in real-time. Toast notification shows all musicians what was swapped.
Skills required: /ui-ux-pro-max

## Previous Milestone
**v3.4 Fixes & Live Mode Activation**
Status: Complete
Completed: 2026-04-04
Phases: 3

| Phase | Name | Plans | Status | Completed |
|-------|------|-------|--------|-----------|
| 1 | Mount LeaderConsole | 1/1 | Complete | 2026-04-04 |
| 2 | Setlist Permissions Fix | 1/1 | Complete | 2026-04-04 |
| 3 | Print Outline Fix | 0/0 | Complete | 2026-04-04 |

### Phase 1: Mount LeaderConsole

Focus: Wire up the orphaned LeaderConsole component into the performance page so leaders can start Live Mode, step through the service, and enable Live Swap. All v3.0 infrastructure (swap buttons, bottom sheet, toast, /live/[id] receiver, Firestore rules, API routes) is already built — just needs the entry point. Absorbed from v3.3.
Skills required: /ui-ux-pro-max

### Phase 2: Setlist Permissions Fix

Focus: Close and duplicate actions currently only work on setlists created by the current user. Fix so they work on any public setlist regardless of owner.

### Phase 3: Print Outline Fix

Focus: Non-song items (readings, prayers, liturgical elements) are currently excluded from the printed outline/cover page. Include them as line items in the printed order of service — no chart pages needed, just listed on the outline.
Note: Fully addressed in Phase 2 — no separate plan needed.

## Previous Milestone
**v3.3 Live Mode Activation** (absorbed into v3.4)
Status: Absorbed
Note: Scope merged into v3.4 Phase 1

## Previous Milestone
**v3.2 Mobile Admin & Responsive Fixes**
Status: Complete
Completed: 2026-03-31

| Phase | Name | Plans | Status | Completed |
|-------|------|-------|--------|-----------|
| 1 | Mobile Admin Controls | 1/1 | Complete | 2026-03-31 |
| 2 | Touch Targets & Responsive Polish | 1/1 | Complete | 2026-03-31 |

## Previous Milestone
**v3.1 Post-v3.0 Bugsweep & Hardening**
Status: Complete
Completed: 2026-03-31

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
*Last updated: 2026-04-13 (v4.1 complete; v4.2 created)*
