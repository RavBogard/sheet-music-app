# Roadmap: sheet-music-app (CentralReform.live)

## Current Milestone
**v2.5 Bugsweep & Test Coverage**
Status: In progress
Phases: 22 total

| Phase | Name | Plans | Status | Completed |
|-------|------|-------|--------|-----------|
| 1 | Type Safety Fixes | 1 | Complete | 2026-03-11 |
| 2 | Silent Failure & Error Handling | 1 | Complete | 2026-03-11 |
| 3 | Test Infrastructure & Flaky Fix | 1 | Complete | 2026-03-11 |
| 4 | Data Layer Tests | 2 | Complete | 2026-03-11 |
| 5 | API Route Tests | 3 | Complete | 2026-03-11 |
| 6 | Hook Tests | 3 | Complete | 2026-03-11 |
| 6.1 | SW Removal & Firestore Recovery | 2 | Complete | 2026-03-11 |
| 7 | Remove Annotation Feature | 1 | Complete | 2026-03-11 |
| 8 | Performance UX Fixes | 1 | Complete | 2026-03-12 |
| 8.1 | Setlist Access Bug Fixes | 1 | Complete | 2026-03-11 |
| 9 | Print View & Sticky Keys | 1 | Complete | 2026-03-12 |
| 10 | Public Setlist Access | 1 | Complete | 2026-03-12 |
| 10.1 | Mobile Action Bar Redesign | 1 | Complete | 2026-03-12 |
| 11 | Component Tests | 2 | Complete | 2026-03-12 |
| 12 | AI & Integration Tests | 2 | Complete | 2026-03-12 |
| 13 | Tablet Performance UX | 1 | Complete | 2026-03-12 |
| 14 | Bug Fixes & Race Conditions | TBD | Not started | |
| 15 | Setlist-Only Print Option | TBD | Not started | |
| 16 | Design Token Cleanup & Accessibility | TBD | Not started | |
| 17 | iPad Safe Areas & Spacing | TBD | Not started | |
| 18 | Backend Hardening | TBD | Not started | |
| 19 | Final Audit & Clean Sweep | TBD | Not started | |

### Phase 1: Type Safety Fixes

Focus: Eliminate ~15 `as any` casts with proper Firestore/API types across scheduling routes (assign, calendar-feed, remind, suggest), chat route, users-firebase, MusicianPicker, and liturgical-templates. Replace each cast with correct typed interfaces.

### Phase 2: Silent Failure & Error Handling

Focus: Fix empty catch blocks in QR auth and scheduling routes — add logging at minimum, proper error handling where needed. Fix fire-and-forget promises in scheduling assign route — track notification delivery failures so musicians know if email/push failed. Wire clearSaveTimer() in all annotation consumers. Move hardcoded CORS origins to env-only config.

### Phase 3: Test Infrastructure & Flaky Fix

Focus: Fix the flaky route-auth publish test (timeout). Set up shared test helpers and fixtures for Firebase mocking (Firestore snapshots, collection queries, auth tokens). Establish API route test patterns that can be reused across phases 4-5. Create mock factories for common types (SetlistTrack, UserProfile, SchedulingAssignment).

### Phase 4: Data Layer Tests

Focus: Tests for firebase helpers, users-firebase, setlist-firebase, scheduling-firebase, server-auth, server-setlists, server-library. Test CRUD operations, permission checks, data validation, and error paths. Use mock factories from Phase 3.

### Phase 5: API Route Tests

Focus: Tests for scheduling routes (assign, respond, suggest, remind), setlist operations (publish, email-packets, print), library operations (list, upload, sync, rename), and email/push delivery modules. Test request validation, authorization, business logic, and error responses.

### Phase 6: Hook Tests

Focus: Tests for all 19 untested hooks — use-setlist-logic, use-library, useMonitorConnection, use-offline, use-setlist-performance, use-setlist-presence, use-smart-transposer, use-metronome, use-wake-lock, use-media-query, use-batch-selection, use-calendar-data, use-content-search, use-creation-wizard, use-monitor-access, use-safe-firestore-sync, use-setlist-dashboard, use-upcoming-prep. Skip monitor hooks already covered.

### Phase 6.1: SW Removal & Firestore Recovery

Focus: Fix production Firestore crash on mobile caused by corrupted IndexedDB from old service worker, then fully remove all SW/PWA remnants. Plan 1: Firestore crash fix (IndexedDB recovery on assertion error + clear stale persistence). Plan 2: Full SW/offline dead code removal (remove next-pwa package, public/sw.js, public/workbox-ad66f20e.js, dead offline code in offline-manager.ts, cache-utils.ts, prefetch.ts, UpdatePrompt.tsx, BackgroundPrefetcher.tsx, clean up SW references across source files).
Plans: TBD (defined during /paul:plan)
Status: Not started

### Phase 7: Remove Annotation Feature

Focus: Completely remove the PDF annotation/drawing feature from chart viewing. The ability to edit and draw notes on top of PDF charts won't be meaningfully used. Remove all annotation UI, tools, state management, and related code paths from the performance/chart view.
Plans: TBD (defined during /paul:plan)
Status: Not started
Skills required: /ui-ux-pro-max

### Phase 8.1: Setlist Access Bug Fixes

Focus: Fix two production-breaking bugs affecting band member access to setlists. (1) Firestore security rules missing admin fallback — old setlists with no ownerId are unreadable/unwritable by anyone via client SDK. (2) Server-side ownership check redirects users on legacy setlists with missing ownerId. Also: backfill ownerId on all existing setlists (assign to admin), and improve error messaging from catch-all "check internet" to actual Firestore errors.
Plans: 1/1 complete
Status: Complete

### Phase 8: Performance UX Fixes

Focus: Fix and improve the chart/setlist performance experience. (a) Add monitor popup trigger to setlist perform view — same monitor control available when viewing a chart should be accessible from the setlist view. (b) Relabel "Metronome" to "BPM" and "Audio" to "Monitor" in PerformanceToolbar to conserve space and match musician terminology. (c) Fix broken setlist popup — clicking "Setlist" button in bottom-right while viewing a chart shows blank instead of the setlist with keys next to each piece.
Plans: TBD (defined during /paul:plan)
Status: Not started
Skills required: /ui-ux-pro-max

### Phase 9: Print View & Sticky Keys

Focus: Two data-flow improvements. (a) Remove chartless items from print view — items without charts (e.g., "Pre Service", "V'ahavta") should remain in the setlist but NOT generate blank pages when printing. (b) Sticky key assignments — when a chart is assigned a key on a setlist, that key should persist to the next setlist it's added to, until manually changed. The key follows the chart, not the setlist.
Plans: TBD (defined during /paul:plan)
Status: Not started
Skills required: /ui-ux-pro-max

### Phase 10: Public Setlist Access

Focus: Allow unauthenticated users to view public setlists and their PDFs without signing in. Update middleware to allow unauthenticated access to public setlist detail pages. Update file proxy to serve PDFs for public setlist tracks without auth. Ensure Firestore queries for public setlists work without auth context. Anyone with a link to a public setlist should be able to view it and all its charts.
Plans: TBD (defined during /paul:plan)
Status: Not started

### Phase 10.1: Mobile Action Bar Redesign

Focus: Transform mobile bottom tab bar from redundant navigation links into a live-resources action bar. Three buttons: (1) Search — popover with library song search for finding any chart fast mid-service, (2) Setlist — slightly larger center button, navigates to current/upcoming setlist in perform mode (session-opened setlist takes priority, otherwise nearest future eventDate), (3) Monitor — popover with QuickMonitorPanel (already built). Mobile only, hidden during PDF view. Aesthetic consistency with PerformanceToolbar (material-thick, border-brand/10, same icon sizing). Setlist button gets subtle glow/elevation to emphasize it as the primary action.
Plans: TBD (defined during /paul:plan)
Status: Not started
Skills required: /ui-ux-pro-max

### Phase 11: Component Tests

Focus: Tests for critical UI components — PrintModal, library views (SongChartsLibrary, LibraryFileRow, UploadDialog), scheduling UI (ScheduleCard, RabbiBanner), dashboard (NextServiceCard interactions, PrepRecommendations), SetlistEditor complex interactions (drag-and-drop, inline editing). Skip admin panels and basic UI primitives.

### Phase 12: AI & Integration Tests

Focus: Tests for gemini.ts (chat completions, error handling), key-detection.ts (key extraction accuracy), pdf-chord-extractor.ts (chord parsing from PDF), enrichment-engine.ts (metadata enrichment), print-pipeline edge cases (empty setlists, missing files, transposition combos). Mock external APIs (Gemini, Firebase Storage).

### Phase 13: Tablet Performance UX

Focus: Optimize the core tablet performance experience (portrait-only, no landscape support). (a) Increase all performance toolbar touch targets to minimum 44x44px — zoom buttons currently 28px (`h-7 w-7`), song nav buttons borderline at 56px. (b) Add `md:` responsive breakpoint for iPad 768px portrait — toolbar currently jumps from cramped mobile to desktop at `lg:` (1024px) with no tablet layout. (c) Recover wasted PDF viewing space — remove `pb-28` (112px) bottom padding when toolbar is hidden, make transposer popover responsive width instead of fixed `w-80`. (d) Fix swipe navigation disabled when zoom > 1.1x — allow swiping between charts even when slightly zoomed. (e) Extend toolbar auto-hide from 8s to 15s during performance. (f) Widen song title truncation from `max-w-[200px]` to `max-w-[300px]` on tablet.
Skills required: /ui-ux-pro-max

### Phase 14: Bug Fixes & Race Conditions

Focus: Fix all bugs identified in codebase audit. (a) Fix `useMonitorConnection` ref-count race condition — two components mounting simultaneously can create duplicate connections. (b) Add `.catch()` to `syncSessionCookie` promise in `auth-context.tsx` — missing catch causes infinite loading on auth failure. (c) Fix state-update-after-unmount in `use-offline.ts` — add AbortController to `downloadFile`. (d) Add missing `.catch()` handlers in `SongChartsLibrary`, `LibraryFileRow`, `AddSongsModal`. (e) Fix Firestore security rule — `notifications` subcollection allows any signed-in user to create notifications for any other user. (f) Fix N+1 query in `cron/scheduling-reminder` — batch-fetch musician docs instead of per-loop reads. (g) Validate numeric inputs in `library/upload/route.ts` — prevent NaN BPM stored in Firestore. (h) Fix `PerformanceToolbar` effect missing `activeSessions` in dependency array. (i) Fix unsafe non-null assertion in `use-safe-firestore-sync.ts` line 119.

### Phase 15: Setlist-Only Print Option

Focus: Add option to print just the setlist cover page (song list with keys, BPM, lead) without any chart PDFs. Currently printing always generates cover page + all chart PDFs. Add a toggle or separate button in PrintModal to print "setlist only" — generates just the cover page. Useful for quickly printing a one-page song list for the music stand without waiting for all PDFs to render.
Skills required: /ui-ux-pro-max

### Phase 16: Design Token Cleanup & Accessibility

Focus: Replace all hardcoded colors with design system tokens and improve accessibility. (a) Replace `bg-black text-white` in `FlowItemView.tsx` with `bg-background text-foreground`. (b) Replace `bg-black/40` in `MetronomeControl.tsx` with token. (c) Add `dark:` variants to `GlobalAlertBanner.tsx` color classes. (d) Replace `bg-red-500/10` in `error-state.tsx` with `bg-destructive/10`. (e) Add `aria-label` to all icon-only buttons in performance toolbar and other components. (f) Improve `sr-only` coverage (currently 9 instances across 448 files). (g) Fix image alt text in `DesktopHeader.tsx` from "Logo" to descriptive text.
Skills required: /ui-ux-pro-max

### Phase 17: iPad Safe Areas & Spacing

Focus: Portrait-only iPad polish. (a) Add top/left/right safe area insets for iPad Pro with notch — currently only bottom is handled in `globals.css`. (b) Fix setlist drawer `max-h-[60vh]` — increase to `max-h-[70vh]` or `calc(100vh-120px)` for better use of iPad screen. (c) Fix inconsistent popover padding (`p-3` vs `p-0`). (d) Fix MetronomeControl BPM input touch target size. (e) Replace arbitrary shadow values in `MobileTabBar.tsx` with design tokens.
Skills required: /ui-ux-pro-max

### Phase 18: Backend Hardening

Focus: Data integrity and API consistency. (a) Wrap admin operations in Firestore transactions — `delete-user` (Auth delete + Firestore delete + audit log), `set-role` (custom claims + Firestore + setlist locks). (b) Define and enforce consistent error response interface across all 56 API routes — standardize on `{ error: string, code?: string, details?: object }`. (c) Add rate limiting to unprotected mutation routes (AI routes, admin routes). (d) Move hardcoded super-admin UID from `firestore.rules` to a Firestore config document. (e) Add `CRON_SECRET` to env.mjs validation schema.

### Phase 19: Final Audit & Clean Sweep

Focus: Recursive codebase audit and bug/lint sweep until totally clean. Run full TypeScript strict check, ESLint, and test suite. Fix all errors, warnings, and failures — fix the code, never rig tests (updating tests for changed code is fine). Run Playwright E2E if available. Re-audit for any regressions introduced by Phases 13-18. Repeat sweep until zero warnings, zero test failures, zero lint errors. Verify production build succeeds. Verify Vercel deploy preview works.

## Previous Milestone
**v2.0 Schedule & Workflow Fixes**
Status: Complete
Phases: 3 of 3 complete

| Phase | Name | Plans | Status | Completed |
|-------|------|-------|--------|-----------|
| 1 | Schedule Visibility Fix | 1 | Complete | 2026-03-11 |
| 2 | Gig Packet Modal Layout Fix | 1 | Complete | 2026-03-11 |
| 3 | Print PDF Layout Fixes | 1 | Complete | 2026-03-11 |

## Completed Milestones

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
*Last updated: 2026-03-12 (Phase 13 complete)*
