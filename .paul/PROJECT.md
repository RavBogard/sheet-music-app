# Project: sheet-music-app (CentralReform.live)

## What This Is

A web app for Central Reform Congregation's worship band that musicians load on tablets, iPads, and phones to manage setlists, view and live-transpose charts, and adjust monitor mixes on the fly. Used during live services, rehearsals, and community jam events where anyone can pull up the setlist and charts on their own device.

## Core Value

Musicians can instantly access setlists, transpose charts to their instrument, and control their monitor mix — all live on any device, no paper or prep needed.

## Current State

| Attribute | Value |
|-----------|-------|
| Version | 1.8.0 |
| Status | Production |
| Last Updated | 2026-03-11 |

**Production URLs:**
- CentralReform.live: Main application

## Requirements

### Validated (Shipped)

- [x] Setlist management with drag-and-drop ordering, sections, BPM/key metadata
- [x] Sheet music library synced from Google Drive with Firebase Storage CDN
- [x] Performance mode full-screen PDF viewer with smart prefetch and swipe nav
- [x] AI chord detection via Gemini OCR with transposed chord overlays
- [x] Auto-transposition with musician profiles and instrument presets
- [x] Print gig packets with per-musician transpositions
- [x] Light/dark theme with auto dark mode for performance
- [x] ~~PWA offline support with 30-day Workbox caching~~ — Removed: SW caused production issues, venue has wifi
- [x] AI chat assistant for natural language setlist management
- [x] v1.3 Bugsweep: codebase audit, security fixes, backend hardening, frontend robustness — Phase 1-4
- [x] v1.3.1 Regression fixes: cache-busted PDF worker, iPad monitor connection stability
- [x] v1.4 Phase 1: Library management — rename songs, unlink charts, archive restore
- [x] Auto-key detection on all chart assignment paths (fixed in c6375f4)
- [x] v1.4 Phase 2: Prominent key display + 5 monitor buses
- [x] v1.4 Phase 3: Print gig packet fixes (black screen, date, auth)
- [x] v1.4 Phase 4: PDF health scanner false positives fixed
- [x] v1.5 Phase 1: Critical bug fixes — AI slot safety, clearSaveTimer, transposition race, initAdmin, Firestore sanitization
- [x] v1.5 Phase 2: Security & API consistency — npm audit, CSP/HSTS, error sanitization, 18 routes migrated to createApiHandler
- [x] v1.5 Phase 3: Architecture cleanup — SetlistEditorV2, MusicianPicker, TransposerMenu, SongChartsLibrary split into sub-components
- [x] v1.5 Phase 4: Quality & deps — vitest jsdom default, ESLint exhaustive-deps re-enabled, deps/fonts/indexes already current
- [x] v1.5 Phase 5: UI/UX polish — skip-to-main-content link, mobile zoom indicator, tablet landscape sidebar toolbar
- [x] v1.5 Phase 6: Performance & monitoring — bundle analyzer, Sentry source maps + Web Vitals, component tests for PerformanceToolbar + SetlistEditorV2
- [x] v1.6 Phase 1: Auth & CSP hardening — signInWithPopup finalized, CSP audit, static PWA icon fallbacks
- [x] v1.6 Phase 2: Firebase-only file serving — removed Drive fallback, Storage is sole source of truth
- [x] v1.6 Phase 3: Performance view overhaul — key-left setlist redesign, removed tablet sidebar toolbar
- [x] v1.6 Phase 4: Regression sweep — route-auth test fix, 2 withAuth migrations, 23 ESLint suppress comments, CI green

### Active (In Progress)

- [ ] v2.5: Bugsweep & test coverage (type safety, error handling, comprehensive tests)
- [x] v2.5 Phase 1: Type safety fixes — all `as any` casts eliminated across 9 files
- [x] v2.5 Phase 2: Silent failure & error handling — empty catches logged, notification tracking logged, CORS env-only
- [x] v2.5 Phase 3: Test infrastructure & flaky fix — shared factories, Firebase mocks, API helpers, flaky publish test fixed (367ms → 4ms)
- [x] v2.5 Phase 4: Data layer tests — firebase helpers, users, setlists, scheduling, server-auth, server-library
- [x] v2.5 Phase 5: API route tests — 56 tests across 10 scheduling + library routes
- [x] v2.5 Phase 6: Hook tests — 221 tests across 17 hooks (3 plans)
- [x] v2.5 Phase 6.1: SW removal & Firestore recovery — IndexedDB crash fix, 5 dead SW files removed, next-pwa uninstalled
- [x] v2.5 Phase 7: Remove annotation feature — 5 annotation files deleted, 6 files cleaned, toolbar simplified
- [x] v2.5 Phase 8.1: Setlist access bug fixes — Firestore rules admin/band-leader fallback, server ownerId guard, backfill script, error messaging

### Validated (Recently Shipped)

- [x] v2.0: Schedule & workflow fixes — all 3 phases complete
- [x] v2.0 Phase 1: Schedule visibility fix — setlists with future dates appear regardless of assignment status
- [x] v2.0 Phase 2: Gig packet modal layout fix — modal starts near top on mobile, tighter padding
- [x] v2.0 Phase 3: Print PDF layout fixes — Key column before Lead, non-song items excluded from charts
- [x] v1.9: Auth stability & deferred cleanup — Phases 1-5
- [x] v1.7: Print pipeline overhaul, key signature position, monitor buses — Phases 1-5
- [x] v1.8 Phase 1: Mobile navigation redesign — hamburger menu moved to upper-left header
- [x] v1.8 Phase 2: Setlist mobile responsive layout — responsive padding, touch-visible menus
- [x] v1.8 Phase 3: Schedule page redesign — all-services-first default, personal filter toggle

### Planned (Next)

- v2.5 Phase 8: Performance UX Fixes

### Out of Scope

- To be identified during planning

## Target Users

**Primary:** CRC worship band musicians
- Use tablets/iPads on music stands during live services
- Need instant transposition for their instrument (Bb trumpet, Eb sax, etc.)
- Need monitor mix control without leaving their position

**Secondary:** Community jam participants
- Load setlists and charts on personal phones
- Need simple read-only access to current song/chart

## Context

**Business Context:**
Central Reform Congregation worship services and rehearsals. Also used for community jam events with broader participation.

**Technical Context:**
- Next.js 16 (App Router) on Vercel
- Firebase (Auth, Firestore, Storage)
- Google Drive for file intake
- Gemini AI for chord detection and chat
- PWA for offline tablet/phone use

## Constraints

### Technical Constraints
- Must run on Vercel serverless
- Must work offline (PWA) for unreliable venue WiFi
- Must perform well on tablets and phones (touch-first)
- Firebase ecosystem for auth, database, storage

### Business Constraints
- Single congregation use case (CRC)
- Musicians are not technical — UX must be frictionless

## Tech Stack

| Layer | Technology | Notes |
|-------|------------|-------|
| Framework | Next.js 16 | App Router |
| UI | Tailwind CSS 4 + shadcn/ui | |
| State | Zustand | |
| Auth | Firebase Auth | |
| Database | Firestore | |
| Storage | Firebase Storage (CDN) + Google Drive (intake) | |
| AI | Google Gemini | OCR, chat |
| Testing | Vitest + Playwright | 712+ tests |
| Deploy | Vercel | |

## Links

| Resource | URL |
|----------|-----|
| Repository | https://github.com/RavBogard/sheet-music-app |
| Production | CentralReform.live |

## Key Decisions

| Decision | Phase | Impact |
|----------|-------|--------|
| withAiSlot as preferred AI concurrency API | Phase 2 | Pattern for all future AI callers |
| Drive timeout via Promise.race | Phase 2 | googleapis doesn't support AbortSignal |
| uploadToStorage keeps throwing, reads get StorageResult | Phase 3 | Consistent pattern for Storage callers |
| Missing context tracked in AI prompt (not silent) | Phase 3 | AI responses note missing data sources |
| BroadcastChannel for cross-tab cache invalidation | Phase 3 | Tabs stay in sync after library sync |
| Ref-based callbacks for effect dep stability | Phase 4 | Pattern for all hooks with callback deps |
| Broadened useSafeFirestoreSync ref type to DocumentData | Phase 4 | Eliminates all caller `as any` casts |
| stripUndefined/Deep for Firestore sanitization (not JSON roundtrip) | v1.5 P1 | Preserves Timestamp instances, explicit filtering |
| cancelled-flag before every state update after async boundaries | v1.5 P1 | Pattern for all hooks with async + state |
| All standard auth routes use createApiHandler | v1.5 P2 | withAuth reserved for complex patterns (dual auth, streaming, mixed auth, dev-only) |
| SectionErrorBoundary for admin crash isolation | Phase 4 | Sections fail independently |
| pdfjs.version in worker URL for cache busting | v1.3.1 | Prevents stale worker mismatch after deploys |
| Ref-based uid tracking in useMonitorConnection | v1.3.1 | Prevents effect churn during iPad auth token refresh |
| visibilitychange as iOS Safari reconnection trigger | v1.3.1 | beforeunload doesn't fire on iOS Safari |
| displayName overlay for song rename (Firestore, not Drive) | v1.4 P1 | Preserves Drive filenames, rename is Firestore-only |
| Conditional withSentryConfig (only when DSN set) | v1.5 P6 | Zero build overhead without Sentry |
| Offline write queue not needed (Firebase native persistence) | v1.5 P6 | Firestore SDK handles offline writes natively |
| Firebase Storage is sole file source (Drive = intake only) | v1.6 P2 | Simplified file serving, removed Drive fallback |
| Key-left setlist layout for live performance | v1.6 P3 | Keys prominent next to song names for tablet glanceability |
| chat + drive/file routes stay on withAuth permanently | v1.6 P4 | SSE streaming and mixed browser auth don't fit createApiHandler |
| COOP: same-origin-allow-popups for Google sign-in | v1.7 P1 | Allows popup sign-in while maintaining isolation |
| signInWithRedirect as popup fallback | v1.7 P1 | Mobile browsers that block popups get working sign-in |
| 10s suppress window for SW update banner | v1.7 P1 | Prevents false "update available" on fresh page load |
| Direct sync PDF generation (bypass Inngest) | v1.7 P3 | Inngest not configured on Vercel; sync matches working personal/public routes |
| Remove Firestore polling from PrintModal | v1.7 P3 | No background job = no job status to poll |
| Key badge right of title (reversed key-left) | v1.7 P4 | User preference; inline after title is cleaner |
| All services as schedule default (not personal) | v1.8 P3 | Everyone sees full schedule; "Mine" toggle for personal filter |
| Single subscription with client-side filter | v1.8 P3 | subscribeToAllUpcomingAssignments for all users, filter locally |
| Dual subscription merge for schedule page | v2.0 P1 | Subscribe to both setlists and assignments; setlists-first ensures all services visible |
| Key column before Lead on gig packet cover page | v2.0 P3 | Key is most glanceable info after song title for musicians |
| Non-song items excluded from PDF charts section | v2.0 P3 | Readings/prayers don't have charts; saves paper, reduces confusion |
| TemplateContext with type:string instead of widening ServiceType | v2.5 P1 | Template keys are superset of ServiceType; avoids breaking union |
| hasSeconds() type guard for Firestore Timestamp-like fields | v2.5 P1 | Pattern for safely checking Timestamp objects in scheduling routes |
| Mock objects exported from helpers, vi.mock() stays in test file | v2.5 P3 | Vitest hoisting requires vi.mock at file scope; helpers provide objects only |
| beforeAll dynamic import for route handlers | v2.5 P3 | Eliminates cold-start flakiness in API route tests |
| clearFirestoreIndexedDB() for corrupted persistence recovery | v2.5 P6.1 | Shared helper used by SwCleanup, ErrorBoundary, and unhandledrejection listener |
| PWA/SW fully removed, next-pwa uninstalled | v2.5 P6.1 | SW caused stale deploys, PDF worker failures, cache breaks; venue has wifi |
| Annotation feature removed entirely | v2.5 P7 | Unused by worship band; simplifies toolbar before Phase 8 UX fixes |
| react-pdf AnnotationLayer.css preserved | v2.5 P7 | PDF.js built-in, not custom annotation code |
| All existing setlists assigned to admin UID | v2.5 P8.1 | Rabbi Daniel created all setlists; backfill script sets ownerId |
| Band leaders granted read access to all setlists | v2.5 P8.1 | isBandLeader() added to Firestore read rule |
| Missing ownerId treated as legacy accessible data | v2.5 P8.1 | Truthiness guard prevents redirect on legacy docs |

---
*PROJECT.md — Updated when requirements or context change*
*Last updated: 2026-03-11 after Phase 8.1 (Setlist Access Bug Fixes complete)*
