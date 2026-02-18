# CRC Music — Codebase & Backend Analysis

**Project:** Full-stack sheet music management platform for congregational musicians
**Stack:** Next.js 16 · React 19 · TypeScript · Firebase (Auth + Firestore) · Google Drive API · Gemini AI · Vercel
**Scale:** 252 source files · ~30,000 lines · 106 components · 32 API routes · 22 test suites (361 tests)

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│  CLIENTS                                                      │
│  React SPA (Next.js App Router) · PWA (Service Worker)        │
│  Zustand Stores (8) · IndexedDB Offline Cache · Fuse.js Search│
├──────────────────────────────────────────────────────────────┤
│  API LAYER (Next.js Route Handlers)                           │
│  32 routes · Firebase Admin Auth · Upstash Rate Limiting      │
│  Role-based: admin > leader > member > guest                  │
├──────────────────────────────────────────────────────────────┤
│  SERVICES                                                     │
│  Google Drive (library sync) · Gemini Flash (AI chord detect) │
│  Resend (email) · Sentry (error tracking) · Upstash Redis     │
├──────────────────────────────────────────────────────────────┤
│  DATA                                                         │
│  Firestore (setlists, users, config, usage tracking)          │
│  Google Drive (PDF/MusicXML source files)                     │
│  IndexedDB (offline file cache)                               │
│  Vercel Cron (hourly sync, nightly enrichment)                │
└──────────────────────────────────────────────────────────────┘
```

The app uses **Google Drive as the canonical file store** — PDFs and MusicXML files live in a shared Drive folder, and a sync engine mirrors metadata to Firestore's `library_index`. This is architecturally clever: it means the congregation's existing Google Workspace workflow (dropping files into a folder) automatically populates the app's library. Zero migration, zero duplicate storage.

---

## What's Genuinely Impressive

### 1. The AI Chord Detection Pipeline

The "Living Score" system is a three-layer chord detection pipeline that runs entirely client-side with async AI validation:

1. **Text Layer Scan** (instant) — Extracts chord symbols from PDF text layers using regex and music-theory validation
2. **AI Validation** (async, non-blocking) — Sends page images to Gemini Flash for full-page chord detection, merges results
3. **User Corrections** (highest priority) — Tap-to-correct with music-theory-aware suggestions, long-press-to-add with AI region detection

User corrections **survive cache invalidation** — they're extracted from old cache versions and re-applied after fresh scans. There's a concurrency limiter (max 2 concurrent AI calls) to prevent rate limit exhaustion. The entire pipeline runs without blocking the musician's ability to read and play the chart.

This is production-quality ML integration — not a "call the API and show the result" demo.

### 2. The Offline-First Architecture

The app is a PWA with genuine offline capability:

- **IndexedDB** stores PDF blobs with LRU eviction and `lastAccessedAt` tracking
- **Background prefetcher** downloads setlist charts ahead of gig time
- **Offline indicator** with real-time online/offline detection
- **Service Worker** handles navigation caching via Workbox
- Charts render from local cache when offline — critical for venues with poor WiFi

The offline store uses typed IndexedDB schemas (`idb` library) with proper versioned migrations.

### 3. Firestore Security Rules (150 lines, well-structured)

The rules implement a proper role hierarchy (`admin > leader > member > guest`) with:

- **Scoped subcollections**: `songPreferences`, `annotations`, `notifications` are per-user
- **Notification write restriction**: Users can only update the `read` field on their own notifications (`affectedKeys().hasOnly(['read'])`)
- **Setlist access control**: Public setlists readable by all, private only by owner; leaders can edit any public setlist
- **Server-only collections**: `library_index` and `songUsage` are locked to `false` for client access — only admin SDK (cron jobs, API routes) can write
- **Monitor self-assignment**: Authorized users can update their own bus assignment via custom claim check

This is better than most production Firestore deployments I've reviewed.

### 4. The Setlist Editor

The editor is a full drag-and-drop experience (dnd-kit) with:

- **Service flow modeling**: Not just songs — headers, readings, prayers, transitions, notes with estimated durations
- **Undo/redo**: Full history stack with addToHistory() before every mutation
- **AI agent**: Chat-driven setlist creation with liturgical awareness, cross-setlist operations, and command execution (CREATE_SETLIST, ADD_TO_SETLIST, etc.)
- **Offline sync**: Download entire setlist for offline performance
- **Print pipeline**: Personal gig packets with per-musician transposition, run sheet timelines, and email distribution

### 5. The Monitor System

A real-time audio monitor mixer that connects to an X32 digital mixing console via WebSocket. Musicians can control their own monitor mix from their phone during rehearsal. This is genuinely novel — most congregations use physical monitor wedges or in-ear systems without personal control.

---

## Backend Analysis

### API Security

**Auth middleware** (`api-auth.ts`) is well-designed:
- Single `requireAuth(req, role?)` function eliminates boilerplate across 32 routes
- Role hierarchy check is centralized
- `withAuth()` wrapper catches errors and returns proper HTTP responses
- Firebase ID tokens are verified server-side via admin SDK

**Rate limiting** uses Upstash Redis with an in-memory fallback for development:
- Tiered limits: `api` (general), `ai` (Gemini calls)
- In-memory fallback has proper token bucket implementation with periodic cleanup
- Applied to all AI and admin endpoints

**Security headers**: X-Frame-Options DENY, X-Content-Type-Options nosniff, strict Referrer-Policy. Standard but present.

**Cron authentication**: CRON_SECRET bearer token for Vercel Cron jobs. Correct pattern.

### Data Architecture

**Firestore collections** are well-normalized:
- `setlists` — root collection with ownership and public/private flags
- `library_index` — server-managed, mirrors Drive metadata + enrichment data
- `users/{uid}/songPreferences/{fileId}` — per-user per-song state (transposition, last viewed)
- `users/{uid}/annotations/{fileId}` — per-user chart annotations
- `songUsage/{fileId}/events` — server-tracked usage analytics

**Google Drive integration** (`google-drive.ts`) uses service account auth with proper credential handling (supports both JSON blob and individual env vars).

**Sync engine** does efficient delta syncing:
- Compares Drive file list against Firestore `library_index`
- Batch writes (450 per batch) to stay within Firestore limits
- Tracks added/updated/deleted/errors with structured stats
- Auto-invalidates chord caches when file `modifiedTime` changes

### Background Jobs

Two Vercel Cron jobs:
1. **Hourly sync** (`/api/cron/sync`): Drive → Firestore library index
2. **Nightly enrichment** (`/api/cron/enrich`): AI metadata extraction for unenriched files (batched at 20 per run, 300s max duration)

Both are properly authenticated via CRON_SECRET and have error reporting via Sentry.

### Environment Management

Uses `@t3-oss/env-nextjs` with Zod validation for all environment variables. Server and client variables are properly separated. Optional services (Redis, Resend, Sentry) gracefully degrade when unconfigured.

---

## Code Quality Assessment

### Strengths

**TypeScript discipline**: Full strict typing throughout. Interfaces for all data models, proper generic usage in Zustand stores, discriminated unions for track types.

**Component architecture**: Clean separation — `components/music/` for rendering, `components/setlist/v2/` for editor, `components/performance/` for gig mode. Memoized where appropriate (SongRow, FlowRow use `memo()`).

**State management**: Zustand stores are well-scoped — `store.ts` (music/performance), `library-store.ts` (files), `chat-store.ts` (AI), `monitor-store.ts` (mixer), `offline-store.ts` (cache). Persist middleware used selectively (only zoom + audio settings survive reload, not transient state).

**Custom hooks**: `useUpcomingPrep`, `useOffline`, `useMonitorAccess`, `useSetlistLogic` — each encapsulates a complete feature concern.

**Error boundaries**: Error pages at route boundaries (`error.tsx` in editor routes).

**Logging discipline**: Custom `logger` that suppresses in production, always logs errors. Consistent `[Module]` prefix convention.

### Testing

22 test suites covering:
- Core utilities (music-math, chord-utils, format-utils, utils)
- Data layer (chord-cache, firestore-helpers, library-cache, setlist-firebase)
- Business logic (liturgical-calendar, liturgical-templates, greeting, musician-profile)
- Infrastructure (api-auth, rate-limit, notification-store, chat-store, logger)
- Validation (validations, validations-v5)
- Prefetch logic

Plus a Playwright smoke test for E2E. The test suite runs in ~10 seconds.

---

## Areas for Improvement

### What a Senior IC Would Flag

**1. Inconsistent auth patterns across API routes**

Most routes use `requireAuth()` or `withAuth()`, but a grep shows not all do. Some older admin routes may still have inline token verification. A Meta engineer would want every route to go through the same middleware — ideally as Next.js middleware rather than per-route calls.

```
Recommendation: Add Next.js middleware.ts that validates auth
for all /api/* routes except explicitly public ones.
```

**2. No request validation on most API routes**

Only 8 Zod schema usages across 32 routes. Most POST/PATCH handlers trust the request body structure. At Meta scale this would be a P1 — any malformed client request could cause a 500.

```
Recommendation: Add Zod schemas to every API route's request body.
The pattern is straightforward — define schema, parse in first line.
```

**3. The `page.tsx` dashboard is 758 lines**

The main dashboard page contains 5 sub-components (HeroCard, CommandRow, UpcomingTimeline, ExpandedTrackList, CompactSetlistRow) defined inline. These should be in separate files under `components/dashboard/`.

```
Recommendation: Extract sub-components to individual files.
page.tsx should be <100 lines of composition logic.
```

**4. No integration tests for API routes**

Unit tests cover business logic well, but there are no tests that actually call the API route handlers with mocked Firebase. A critical path like "publish setlist → send email notifications" has no test coverage for the integration.

```
Recommendation: Add supertest or similar for API route testing.
Start with the critical paths: auth, setlist CRUD, chord cache.
```

**5. The Google Drive client lacks retry logic**

`google-drive.ts` makes API calls without retry or exponential backoff. Drive API has known rate limits and transient failures. The sync engine processing hundreds of files is especially vulnerable.

```
Recommendation: Add retry with exponential backoff to Drive API calls.
A simple wrapper (3 retries, 1s/2s/4s backoff) would suffice.
```

**6. No database migrations strategy**

Firestore is schemaless, but the app has evolved its data model (cache versions, new fields). There are admin backfill routes but no systematic migration framework. If a field rename is needed, it's manual.

```
Recommendation: Document the expected schema for each collection.
Add version fields to critical documents.
```

**7. Bundle size awareness**

The dependency list includes some heavy libraries: `pdfjs-dist`, `opensheetmusicdisplay`, `firebase`, `jspdf`. There's no evidence of bundle analysis or code splitting strategy beyond Next.js defaults.

```
Recommendation: Run next/bundle-analyzer periodically.
Consider dynamic imports for heavy components (PDF viewer, OSMD).
```

---

## Multi-Tenancy Readiness

The `CongregationConfig` interface and context provider suggest multi-tenant ambitions:

```typescript
interface CongregationConfig {
    name: string
    shortName: string
    features: { monitor, ai, audio, annotations, collaboration }
    driveFolderId: string
    // ...
}
```

Currently single-tenant (hardcoded defaults), but the architecture would support multi-tenant with:
- Config loaded from Firestore `config/congregation` doc
- Feature flags already gating Monitor, AI, Audio, etc.
- Drive folder ID is configurable
- Missing: tenant isolation in Firestore rules, per-tenant API key scoping

---

## Infrastructure & DevOps

| Concern | Status |
|---------|--------|
| CI/CD | Vercel auto-deploy from GitHub ✅ |
| Error tracking | Sentry (client + server) ✅ |
| Rate limiting | Upstash Redis with in-memory fallback ✅ |
| Cron jobs | Vercel Cron (hourly sync, nightly enrich) ✅ |
| PWA / Offline | Service Worker + IndexedDB ✅ |
| Type safety | Strict TypeScript ✅ |
| Env validation | t3-oss/env-nextjs + Zod ✅ |
| Security headers | X-Frame-Options, nosniff, Referrer-Policy ✅ |
| Firestore rules | Role-based, 150 lines, well-structured ✅ |
| Logging | Structured logger, dev-only suppression ✅ |
| E2E tests | Playwright (smoke) ⚠️ (minimal) |
| Bundle analysis | Not configured ⚠️ |
| API validation | Partial (8/32 routes) ⚠️ |
| Database backups | Firestore automatic ✅ |

---

## Summary

This is a **production-grade application** with thoughtful architecture. The AI chord detection pipeline, offline-first PWA design, and Firestore security rules are notably above the bar for a project of this size. The code demonstrates strong TypeScript discipline, clean state management patterns, and genuine domain expertise (music theory, Jewish liturgical knowledge, real-time audio).

The areas for improvement are mostly about hardening and scale — request validation, retry logic, integration tests, bundle optimization — rather than fundamental architectural issues. The codebase is well-organized, consistently styled, and would be straightforward for a new engineer to navigate.

For a project primarily built by a rabbi who learned to code, this is remarkable. For a production application serving real musicians at real gigs, it's solid. A senior Meta engineer would recognize the patterns, appreciate the security posture, and probably want to talk about the AI pipeline.
