# Milestones

Completed milestone log for this project.

| Milestone | Completed | Duration | Stats |
|-----------|-----------|----------|-------|
| v0.1 UI/UX Redesign | 2026-03-08 | 1 day | 6 phases, 12 plans |
| v1.0 Full Launch | 2026-03-08 | 1 day | 5 phases, 12 plans |
| v1.1 UI/UX Hardening | 2026-03-09 | 1 day | 11 phases, 19 plans |
| v1.2 Library, Manage & Monitor Overhaul | 2026-03-09 | 1 day | 9 phases, 10 plans |
| v1.3 Bugsweep & Backend Hardening | 2026-03-10 | ~76 min | 4 phases, 7 plans |
| v1.3.1 Regression Fixes | 2026-03-10 | ~8 min | 1 phase, 1 plan |
| v1.4 Fixes & Library Management | 2026-03-10 | ~1 hr | 5 phases, 5 plans |
| v1.5 Codebase & UI/UX Hardening | 2026-03-10 | 1 day | 6 phases, 11 plans |
| v1.6 Stability & Regression Audit | 2026-03-11 | 1 day | 4 phases, 4 plans |
| v1.7 Critical Bug Fixes | 2026-03-11 | 1 day | 5 phases, 5 plans |
| v1.8 Mobile UX Overhaul | 2026-03-11 | 1 day | 3 phases, 3 plans |
| v1.9 Auth Stability & Deferred Cleanup | 2026-03-11 | 1 day | 5 phases, 4 plans |
| v2.0 Schedule & Workflow Fixes | 2026-03-11 | 1 day | 3 phases, 3 plans |
| v2.5 Bugsweep & Test Coverage | 2026-03-12 | 2 days | 19 phases, 30 plans |
| v2.6 Deprecation Cleanup, Tech Debt & Setlist UX | 2026-03-12 | 1 day | 3 phases, 3 plans |
| v3.0 Live Setlist Sync | 2026-03-30 | 1 session | 3 phases, 5 plans |
| v3.1 Post-v3.0 Bugsweep & Hardening | 2026-03-31 | 1 session | 5 phases, 7 plans |
| v3.2 Mobile Admin & Responsive Fixes | 2026-03-31 | 1 session | 2 phases, 2 plans |
| v3.3 Live Mode Activation | 2026-04-04 | absorbed | absorbed into v3.4 |
| v3.4 Fixes & Live Mode Activation | 2026-04-04 | 1 session | 3 phases, 2 plans |
| v4.0 Live Swap Redesign | 2026-04-04 | 1 session | 3 phases, 3 plans |

---

## ✅ v3.4 Fixes & Live Mode Activation

**Completed:** 2026-04-04
**Duration:** 1 session across 2 plans + 1 bugfix

### Key Accomplishments

- LeaderConsole mounted on performance page as collapsible panel (absorbs v3.3)
- Admin/band_leader can delete any public setlist (UI + Firestore rules)
- Print cover page includes all items (readings, prayers, transitions) — not just songs
- "Led by: {rabbi}" shown on print cover page when rabbi field is set
- CSP updated to allow hebcal.com for liturgical calendar
- Fixed Firestore undefined rejection in cloneForNextWeek

### Key Decisions

| Decision | Phase | Impact |
|----------|-------|--------|
| Collapsible panel for LeaderConsole | P1 | Doesn't dominate screen for non-leaders |
| Band leaders can delete public setlists only | P2 | Consistent with update permissions |
| Cover page shows ALL items, not just songs | P2 | Full order of service visible on outline |
| Rabbi field as "Led by:" (not creator) | P2 | Service attribution to actual leader |
| Spread operator to omit undefined rabbi | Bugfix | Firestore rejects undefined values |

---

## ✅ v3.0 Live Setlist Sync

**Completed:** 2026-03-30
**Duration:** 1 session across 5 plans

### Stats

| Metric | Value |
|--------|-------|
| Phases | 3 |
| Plans | 5 |
| Files created | 10 |
| Files modified | 12 |

### Key Accomplishments

- Song group tagging system with liturgicalSlot + config/songGroups Firestore document
- canLiveSwap permission model mirroring soundEngineer (profile + custom claims + auth context)
- Firestore security rules with field-level restrictions (affectedKeys().hasOnly) and rate limiting
- swapLiveTrack() atomic swap function (tracks + liveState in single updateDoc)
- SwapButton on eligible SetlistRows (amber, 44px touch target, live mode only)
- SwapBottomSheet with 3-tap swap flow (56px alternatives, "Swap Now")
- SwapToast receiver notification (4s auto-dismiss, dedup via swapId)
- Offline connectivity indicator in performance view
- Admin UI: canLiveSwap toggle in UserRow + Song Groups tab with template seeding
- 4-round recursive research (12 agents) informing architecture decisions

### Key Decisions

| Decision | Phase | Impact |
|----------|-------|--------|
| Hybrid song grouping (tag + config doc) | P1 | No sync issues, client-side filtering |
| canLiveSwap mirrors soundEngineer pattern | P1 | Consistent permission model |
| affectedKeys().hasOnly() for field-level rules | P1 | Swap users restricted to tracks/liveState only |
| 3-tap flow without separate confirm button | P2 | Fastest possible with safety |
| SwapToast dedup via swapId ref | P2 | Prevents re-showing on re-renders |
| navigator.onLine for offline detection | P3 | Simpler than Firestore fromCache |

---

## ✅ v2.6 Deprecation Cleanup, Tech Debt & Setlist UX

**Completed:** 2026-03-12
**Duration:** ~1 day across 3 plans

### Stats

| Metric | Value |
|--------|-------|
| Phases | 3 |
| Plans | 3 |

### Key Accomplishments

- Setlist row layout — key badge next to title, inline amber notes, dual-tint alternating rows
- Next.js & Sentry deprecation cleanup — proxy.ts rename, instrumentation-client migration, global-error with Sentry
- Technical debt — leader→band_leader Firestore migration script, build-info git describe cleanup

### Key Decisions

| Decision | Phase | Impact |
|----------|-------|--------|
| bg-white/[opacity] for dark-mode alternating rows | P1 | Predictable alpha on dark backgrounds |
| Dual-tint rows (0.03/0.07) | P1 | Both rows readable |
| Next.js 16 proxy requires export function proxy() | P2 | Not just a file rename |

---

## ✅ v2.5 Bugsweep & Test Coverage

**Completed:** 2026-03-12
**Duration:** ~2 days across 30 plans

### Stats

| Metric | Value |
|--------|-------|
| Phases | 19 |
| Plans | 30 |
| Commits | 55 |

### Key Accomplishments

- **Type safety & error handling:** Eliminated all `as any` casts, fixed empty catches, added notification tracking, moved CORS to env
- **Comprehensive test coverage:** 1117 tests — data layer, API routes, hooks (221 tests across 17 hooks), components (116 tests), AI/integration (53 tests)
- **SW removal & Firestore recovery:** Fixed production IndexedDB crash, fully removed PWA/service worker, uninstalled next-pwa
- **Annotation feature removed:** Simplified chart viewer by removing unused drawing tools
- **Mobile action bar redesign:** MobileTabBar rewritten as Search/Setlist/Monitor action bar with Fuse.js search
- **Tablet performance UX:** Three-tier responsive layout, 44px touch targets, swipe-while-zoomed, 15s auto-hide
- **Bug fixes & race conditions:** Firestore notification rule tightened, N+1 batch fetch, AbortController for offline, 8 bugs fixed
- **Setlist-only print option:** Cover page toggle for quick one-page song list prints
- **Design tokens & accessibility:** Hardcoded colors replaced with tokens, 20 icon-only buttons labeled
- **Backend hardening:** Firestore transactions for admin ops, rate limiting, ApiErrorResponse standardization, config/admins doc
- **Final audit:** Zero tsc errors, zero ESLint warnings, 1117 tests passing, production build verified

### Key Decisions

| Decision | Phase | Impact |
|----------|-------|--------|
| Mock objects exported from helpers, vi.mock() stays in test file | P3 | Vitest hoisting compatibility |
| PWA/SW fully removed, next-pwa uninstalled | P6.1 | SW caused stale deploys; venue has wifi |
| Annotation feature removed entirely | P7 | Unused; simplifies toolbar |
| Fuse.js for MobileTabBar search over library store | P10.1 | No API round-trip for song search |
| Three-tier responsive: default → md: → lg: | P13 | Tablet gets dedicated layout |
| coverOnly early-return in print pipeline | P15 | Skips all PDF processing for cover-only prints |
| WriteBatch for delete-user, runTransaction for set-role | P18 | Atomic admin operations |
| config/admins Firestore doc for super-admin bootstrap | P18 | Replaces hardcoded UID in rules |

---

## v1.4 Fixes & Library Management

**Completed:** 2026-03-10
**Duration:** ~1 hr across 5 plans

### Stats

| Metric | Value |
|--------|-------|
| Phases | 5 |
| Plans | 5 |
| Files changed | 14 |

### Key Accomplishments

- Library management: rename songs (displayName overlay), unlink charts from tracks, restore archived songs
- Prominent key badge in setlist editor (text-sm, font-semibold, bg-brand/20)
- 5 monitor buses as default for CRC's X32 setup
- Print gig packet fixes: iframe-based printing (no black screen), eventDate support, token retry
- PDF health scanner: workerless pdfjs eliminates false positives, strict mimeType filter
- Full codebase audit: 7 critical, 11 high, 17 medium, 8 low findings catalogued
- Recommended v1.5 phase structure based on audit findings

### Key Decisions

| Decision | Phase | Impact |
|----------|-------|--------|
| displayName overlay for song rename (Firestore, not Drive) | Phase 1 | Preserves Drive filenames |
| Iframe over window.open for PDF printing | Phase 3 | Reliable cross-browser printing |
| apiFetch throws on token failure | Phase 3 | Surfaces auth issues early |
| Workerless pdfjs for scanner | Phase 4 | Eliminates worker URL dependency |

---

## v1.3.1 Regression Fixes

**Completed:** 2026-03-10
**Duration:** ~8 min across 1 plan

### Stats

| Metric | Value |
|--------|-------|
| Phases | 1 |
| Plans | 1 |
| Files changed | 6 |

### Key Accomplishments

- Cache-busted PDF worker URL (`pdf.worker.min.{version}.mjs`) eliminates stale worker mismatch after deploys
- Ref-based uid tracking in useMonitorConnection prevents effect churn during iPad auth token refresh
- visibilitychange listener reconnects monitor after iOS Safari tab suspension
- 5s teardown debounce accommodates iPad suspension timing
- Dev script parity with build (copy-pdf-worker runs in both)

### Key Decisions

| Decision | Phase | Impact |
|----------|-------|--------|
| pdfjs.version in worker URL for cache busting | Phase 1 | Prevents stale worker mismatch after deploys |
| Ref-based uid tracking in useMonitorConnection | Phase 1 | Prevents effect churn during iPad auth token refresh |
| visibilitychange as iOS Safari reconnection trigger | Phase 1 | beforeunload doesn't fire on iOS Safari |

---

## v1.3 Bugsweep & Backend Hardening

**Completed:** 2026-03-10
**Duration:** ~76 min across 7 plans

### Stats

| Metric | Value |
|--------|-------|
| Phases | 4 |
| Plans | 7 |
| Files changed | 40+ |

### Key Accomplishments

- Produced comprehensive codebase audit with 20+ findings categorized by severity
- Fixed QR auth token binding vulnerability and AI concurrency deadlock
- Added rate limiting to unauthenticated endpoints and fire-and-forget notification safety
- Standardized error responses via createApiHandler pattern on key routes
- Added Zod validation, StorageResult pattern, and BroadcastChannel cache invalidation
- Fixed dependency array bugs on 7 hooks eliminating stale closures in live performance
- Added unmount safety (isMountedRef, AbortController, cancelled flags) to 4 async hooks
- Implemented ref-counted monitor connection with debounced teardown
- Added error boundaries to 4 crash-prone components (admin sections, setlist editor)
- Eliminated 14 dangerous `as any` casts by fixing root type signatures

### Key Decisions

| Decision | Phase | Impact |
|----------|-------|--------|
| withAiSlot as preferred AI concurrency API | Phase 2 | Pattern for all future AI callers |
| Drive timeout via Promise.race | Phase 2 | googleapis doesn't support AbortSignal |
| uploadToStorage keeps throwing, reads get StorageResult | Phase 3 | Consistent pattern for Storage callers |
| BroadcastChannel for cross-tab cache invalidation | Phase 3 | Tabs stay in sync after library sync |
| Ref-based callbacks for effect dep stability | Phase 4 | Pattern for all hooks with callback deps |
| Broadened useSafeFirestoreSync ref type to DocumentData | Phase 4 | Eliminates all caller as any casts |

---
