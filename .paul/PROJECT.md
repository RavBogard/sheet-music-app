# Project: sheet-music-app (CentralReform.live)

## What This Is

A web app for Central Reform Congregation's worship band that musicians load on tablets, iPads, and phones to manage setlists, view and live-transpose charts, and adjust monitor mixes on the fly. Used during live services, rehearsals, and community jam events where anyone can pull up the setlist and charts on their own device.

## Core Value

Musicians can instantly access setlists, transpose charts to their instrument, and control their monitor mix — all live on any device, no paper or prep needed.

## Current State

| Attribute | Value |
|-----------|-------|
| Version | v4.4 |
| Status | Production — band-onboarding-ready |
| Last Updated | 2026-04-15 |

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

**v4.5 — TBD (awaiting scope)**: deferred from v4.4 — Phase 4 file-size refactor (5 files >600 LOC), Phase 7 type-safety tail, Phase 8 perf tail. Deferred human smoke tests still pending (v4.1, Phase 1.1, Phase 1.2, plus new ones for v4.4 Phases 5+6).

### Validated (Shipped this cycle)

**v4.4 Deferred Audit Sweep — Architectural Polish — 5 of 8 phases complete (3 deferred), 2026-04-15**
- [x] v4.4 Phase 1: Data-layer atomicity — DL-001/002/003/012/013/014 (scheduling assign/decline transactions) (2026-04-15)
- [x] v4.4 Phase 2: Denormalization reconciliation — user/setlist rename fan-out (DL-010) (2026-04-15)
- [x] v4.4 Phase 3: Client async safety — 11 AbortController sites + 3 stale closures + UX-007 retry cap + 5-test suite (2026-04-15)
- [x] v4.4 Phase 5: Observability — request-ID via AsyncLocalStorage + chat SSE meta/heartbeat/done + client error enrichment (L-001 + S-004) (2026-04-15)
- [x] v4.4 Phase 6: Modal state hygiene — UX-001/002/011/015/018 closed, last R2B "must fix before release" items (2026-04-15)
- ⏭ v4.4 Phase 4 (file-size refactor): deferred to v4.5 as P2 cosmetic
- ⏭ v4.4 Phase 7 (type-safety tail) + Phase 8 (perf tail): deferred to v4.5 as P2 polish

**v4.3 Deep Audit Remediation — 10 of 10 phases complete, 2026-04-15**
- [x] v4.3 Phase 1: Recursive audit (83 findings synthesized into P0/P1/P2 action list) (2026-04-14)
- [x] v4.3 Phase 2: P0 Security Triage — S01 chat prompt injection sanitization, S03 drive-file auth (2026-04-14)
- [x] v4.3 Phase 3: Bridge Credentials Design — S02/CRIT-003 audit log + admin email on redemption (2026-04-14)
- [x] v4.3 Phase 4: P0 Data Integrity — D01 orphan cascade server-side, D02 .passthrough schemas, D03 assign race (2026-04-14)
- [x] v4.3 Phase 5: P0 Bugs + UX — B01 silent catches, B02 alert-store, U01 touch targets, U02 keyboard (2026-04-14)
- [x] v4.3 Phase 6: P1 Security + Bugs — S04 QR role gate, S05 schema wontfix, B03 monitor-client disconnect race, B06 swapTrack array guard (B04/B05 confirmed false-positive on re-review) (2026-04-15)
- [x] v4.3 Phase 7: P1 Data sweep — D05 eventDate shape in unassign (D04 found to be auto-indexed by Firestore, no change needed) (2026-04-15)
- [x] v4.3 Phase 9: Role-Claim Sync — self-service sync-claims endpoint + client drift handler + server-signed __session_role companion cookie retiring the 945478b proxy hotfix (2026-04-15)
- [x] v4.3 Phase 10: Auth Deep-Dive Hardening (added mid-cycle) — fail-fast env + initAdmin guards + armed loop-breaker + cold-load race kill + drift-repair module with 3× retry + restored Firestore isMember() gate + Playwright CI + cross-tab sign-out (2026-04-15)

**v4.2 UX Polish & Band Onboarding — 8 of 8 phases complete, 2026-04-14**
- [x] v4.2 Phase 1: Recursive research — 53+ findings, bugs/gaps mapped (2026-04-13)
- [x] v4.2 Phase 1.1: Concurrent-edit safety — runTransaction + rev precondition + merge banner (2026-04-13)
- [x] v4.2 Phase 1.2: Offline truthiness — IndexedDB blob store, honest offline state (2026-04-13)
- [x] v4.2 Phase 1.3: Security hardening — storage.rules in VC, 10-char bridge code, rate limits on nudge-admin + calendar-feed (2026-04-13)
- [x] v4.2 Phase 2: Weekly workflow polish — save-reliability flush route + "Saved Ns ago" ticker; single-step wizard + congregation-driven rabbi list; past-list DESC + role-aware hero CTA + referrer-back; service-notes always visible + Save-as-Template + "Gig Packet" copy unification + global Cmd/Ctrl+Z (2026-04-13)
- [x] v4.2 Phase 3: Stage UX for the band — SwapPicker keyboard/iOS polish (03-01); PDFOverlay ErrorBoundary + Esc + unified wrapper (03-02); server-side setlist-updated broadcast + musician swap toast (03-03); per-track transposition display + amber cue-note contrast + ≥44px leader header + IDB-backed offline indicator (03-04) (2026-04-14)
- [x] v4.2 Phase 4: Editor ergonomics + noise cleanup — canEditSetlist helper, apiFetch timeout + PDFViewer abort, role-aware OnboardingCard, toast hygiene, inline Move-Up/Down, modal consolidation audit (2026-04-14)
- [x] v4.2 Phase 5: Navigation + schedule hygiene — mobile Schedule tab, UnifiedCalendar JSDoc correction, dead musician_availability indexes removed, orphan /settings/users + /settings/sound routes deleted, SetlistDrawer + monitor-live/commands/pending audited-live (2026-04-14)

### Validated (Recently Shipped)

- [x] v3.4 Phase 1: LeaderConsole mounted on performance page — collapsible panel, live mode accessible
- [x] v3.4 Phase 2: Setlist permissions broadened + print outline includes all items + rabbi "Led by:" on cover page
- [x] v3.4 Phase 3: Print outline fix (absorbed into Phase 2)
- [x] v3.4 Bugfix: CSP allow hebcal.com + strip undefined from clone data
- [x] v3.0 Phase 2: Swap UI — SwapButton, SwapBottomSheet, SwapToast, 3-tap director swap flow
- [x] v3.0 Phase 1: Song groups & swap infrastructure — types, permissions, security rules, API routes, admin UI
- [x] v2.6: Deprecation cleanup, tech debt & setlist UX — 3 phases complete
- [x] v2.6 Phase 1: Setlist row layout — key next to title, inline amber notes, dual-tint alternating rows
- [x] v2.6 Phase 2: Next.js & Sentry deprecation cleanup — proxy rename, instrumentation-client, global-error
- [x] v2.6 Phase 3: Technical debt cleanup — leader→band_leader migration script, build-info silence
- [x] v2.5: Bugsweep & test coverage — 19 phases, 1117 tests, zero warnings, full backend hardening
- [x] v2.0: Schedule & workflow fixes — all 3 phases complete
- [x] v1.9: Auth stability & deferred cleanup — Phases 1-5
- [x] v1.8: Mobile UX overhaul — navigation, responsive layout, schedule redesign
- [x] v1.7: Print pipeline overhaul, key signature position, monitor buses — Phases 1-5

### Planned (Next)

- To be defined in next milestone

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
- Venue has wifi; PWA/SW removed in v2.5 (caused stale deploy issues)
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
| Testing | Vitest + Playwright | 1117 tests |
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
| Fuse.js for MobileTabBar search over library store | v2.5 P10.1 | Reuses hydrated library data; no API round-trip for song search |
| sessionStorage for last-opened setlist tracking | v2.5 P10.1 | Tab-scoped, auto-clears on close; Setlist button navigates to most-relevant setlist |
| Hidden placeholder for balanced 3-col layout without monitor | v2.5 P10.1 | Invisible div maintains spacing when monitor feature unavailable |
| Three-tier responsive: default → md: (768px) → lg: (1024px) | v2.5 P13 | Tablet gets dedicated single-row toolbar between phone two-row and desktop |
| Swipe threshold 1.5x (up from 1.1x) for zoomed navigation | v2.5 P13 | Musicians who zoom slightly can still swipe between charts |
| Auto-hide timeout 15s (up from 8s) for live performance | v2.5 P13 | More time for stage musicians to interact with toolbar |
| Batch musician prefs via db.getAll() in scheduling cron | v2.5 P14 | Eliminates N+1 reads; single batch for up to 100 musicians |
| AbortController per-file via Map ref in use-offline | v2.5 P14 | Prevents state updates after unmount during downloads |
| Notification create restricted to admin/band_leader | v2.5 P14 | Server writes via admin SDK; client-side only for privileged roles |
| coverOnly early-return in print pipeline | v2.5 P15 | Skips all PDF fetch/merge/transposition for cover-page-only prints |
| coverOnly included in content hash | v2.5 P15 | Prevents full-packet cache from serving as cover-only and vice versa |
| WriteBatch for delete-user, runTransaction for set-role | v2.5 P18 | Firestore ops atomic; Auth ops best-effort after commit |
| ApiErrorResponse {error, code?, details?} standard shape | v2.5 P18 | Consistent error responses via apiError() helper |
| config/admins Firestore doc for super-admin bootstrap | v2.5 P18 | Replaces hardcoded UID in firestore.rules; manageable without redeploy |
| CRON_SECRET/SUPER_ADMIN_UID optional in env.mjs | v2.5 P18 | Runtime guards still enforce; dev envs don't break on missing vars |
| bg-white/[opacity] for dark-mode alternating rows | v2.6 P1 | --muted OKLCH has baked-in alpha; bg-white is predictable |
| Dual-tint rows (0.03/0.07) instead of tint/black | v2.6 P1 | Both rows readable on dark backgrounds |
| canLiveSwap mirrors soundEngineer pattern (profile + custom claim) | v3.0 P1 | Consistent permission model across features |
| Hybrid song grouping: liturgicalSlot tag + config/songGroups doc | v3.0 P1 | Tags = source of truth, config = display metadata |
| affectedKeys().hasOnly() for field-level setlist update rules | v3.0 P1 | Swap users restricted to tracks/liveState/trackCount only |
| swapLiveTrack: single updateDoc + fire-and-forget audit | v3.0 P1 | Atomic swap, non-blocking audit trail |
| isNotTooFrequent() rule: 2s minimum between swaps | v3.0 P1 | Prevents accidental double-taps at Firestore level |
| storage.rules: isMember() via custom claim only (no Firestore cross-read) | v4.2 P1.3 | Storage rules cannot read Firestore; legacy config/admins bootstrap cannot be mirrored — accept cost |
| Dedicated `bridgeSetup` rate-limit tier (5/min) for credential exchange | v4.2 P1.3 | Credential endpoints deserve stricter bound than app-wide 60/min |
| 10-char unambiguous setup codes (~50 bits) over alphabet expansion | v4.2 P1.3 | Humans copy the code; ambiguity-free alphabet preserved, entropy comes from length |
| Unload flush: fetch keepalive + Bearer, not sendBeacon | v4.2 P2-01 | App auth is Bearer-header only; sendBeacon can't set headers → would 401 |
| New /api/setlist/flush route mirrors Phase 1.1 StaleWriteError precondition server-side | v4.2 P2-01 | Unload save path goes through Admin SDK; same version-check semantics as in-page save |
| Text + dot SaveStatus (dot scans at stage distance, text gives context) | v4.2 P2-01 | Glanceable + informative; no regression on existing visual cue |
| Single-step creation wizard with inline Template dropdown | v4.2 P2-02 | Shaves one click from 90% weekly flow; Template remains accessible as a Select |
| Storage rules isMember() uses custom claim only (no Firestore cross-read) | v4.2 P1.3 | Storage rules cannot call Firestore; config/admins bootstrap not mirrored — accept cost |
| Two distinct modals for create vs edit (NamePrompt / EditDetails) | v4.2 P2-02 | One overloaded modal was showing wrong title and missing rabbi/notes fields on edit path |
| Hardcoded rabbi list replaced with useCongregation() | v4.2 P2-02 | Admins can edit rabbiProfiles in Firestore without a code push; wizard + overflow submenu stay in sync |
| NextServiceCard is the live hero; HeroCard is dead code | v4.2 P2-03 | Role-aware CTA change applied to NextServiceCard (the rendered component); HeroCard left untouched for a future cleanup plan |
| router.back() gated on same-origin + href-not-self | v4.2 P2-03 | Referrer-based back respects in-app history but doesn't exit the app via search-engine referrers |
| Service Notes always visible (no "+ Add" gate) | v4.2 P2-04 | Progressive disclosure on a primary authoring field is an anti-pattern; placeholder carries the purpose |
| Field-aware global keyboard shortcuts | v4.2 P2-04 | Skip on INPUT/TEXTAREA/SELECT/contenteditable so native field undo works |
| Canonical "Gig Packet" copy (drop "Print") | v4.2 P2-04 | "Print" undersells a multi-page PDF; "Gig Packet" is the in-house term |
| AsyncLocalStorage for request-ID propagation across all API routes | v4.4 P5 | Logger auto-tags every call within a request scope; no manual plumbing at call sites |
| globalThis.__requestIdGetter__ resolver in logger to avoid client-bundle ALS leak | v4.4 P5 | Static import of node:async_hooks broke webpack via error-boundary.tsx |
| Chat SSE adds additive meta/heartbeat/done frames; assistant token format byte-identical | v4.4 P5 | ChatPanel parser unchanged (ignores unknown event types); zero client churn for observability |
| CollapsibleSection localStorage opt-in via storageKey prop | v4.4 P6 | Backward compatible — sites without storageKey keep in-memory behavior |
| Modal state-reset effect deps = [isOpen] only (NOT initial* props) | v4.4 P6 | Adding initial* deps would clobber in-progress edits on parent re-render |
| ref-stabilise prop callbacks in long-lived effect handlers | v4.4 P3 | TempoFlash/PDFOverlay Escape handler invokes latest callback, not the one captured at mount |
| PDFViewer retry cap at 3 attempts → terminal error UI | v4.4 P3 | Prevents infinite thrash on consistently-broken charts |

---
*PROJECT.md — Updated when requirements or context change*
*Last updated: 2026-04-15 after v4.4 milestone close (Phases 1, 2, 3, 5, 6 shipped; 4, 7, 8 deferred to v4.5)*
