# Architecture

**Analysis Date:** 2026-03-01

## Pattern Overview

**Overall:** Next.js 16 (App Router) with layered client-server architecture for sheet music library and performance management.

**Key Characteristics:**
- Client-Server separation via middleware-protected routes
- Real-time Firestore synchronization for collaborative features
- Zustand stores for client-side state (music playback, UI)
- Server-side API routes with Firebase Admin authentication
- Asynchronous job processing via Inngest for PDF generation
- Role-based access control (admin, band_leader, musician, member)

## Layers

**Presentation Layer (Client):**
- Purpose: React components with TailwindCSS styling and Radix UI primitives
- Location: `src/components/`
- Contains: Feature-specific component groups (music, setlist, performance, admin, etc.)
- Depends on: Zustand stores, React Query, Firebase client SDK
- Used by: Next.js App Router pages

**Routing Layer:**
- Purpose: Next.js App Router handling request matching and redirects
- Location: `src/app/` with segment-based organization
- Contains: Page components (`page.tsx`), layouts, error boundaries
- Depends on: Middleware for auth enforcement
- Used by: Browser requests

**Middleware Layer:**
- Purpose: Authentication verification and route-based authorization
- Location: `src/middleware.ts`
- Contains: JWT token decoding, public/private route classification, role-based redirects
- Depends on: Firebase session cookies, next/server
- Used by: All requests before route handler execution

**State Management Layer:**
- Purpose: Client-side state persistence and synchronization
- Location: `src/lib/store.ts` (Zustand) and feature stores (`src/lib/*-store.ts`)
- Contains: Music player state, UI toggles, chat messages, notifications, annotations
- Depends on: Zustand persistence middleware, browser localStorage
- Used by: React hooks and components

**API Layer:**
- Purpose: Server-side request handlers with Firebase Admin auth
- Location: `src/app/api/` organized by feature (auth, setlist, admin, ai, etc.)
- Contains: Route handlers for creating setlists, generating PDFs, AI operations, webhooks
- Depends on: Firebase Admin SDK, request validation (Zod), NextRequest/NextResponse
- Used by: Client-side fetch calls and external services

**Data Access Layer:**
- Purpose: Firebase Firestore and Storage abstraction
- Location: `src/lib/firebase*` files and Firebase collection services
- Contains: Query builders, document converters, real-time listeners
- Depends on: Firebase/firestore, firebase-admin
- Used by: API routes and client hooks

**Business Logic Layer:**
- Purpose: Domain-specific logic (music transposition, PDF generation, chord analysis)
- Location: `src/lib/` utility modules (music-math.ts, chord-cache.ts, print-pipeline.ts)
- Contains: Pure functions for calculations and transformations
- Depends on: Type definitions, math libraries (opensheetmusicdisplay for OMR)
- Used by: Components, hooks, and API routes

**Job Processing Layer:**
- Purpose: Background task execution for long-running operations
- Location: `src/inngest/` (functions.ts) + Inngest cloud service
- Contains: PDF generation pipeline (multiple steps with progress tracking)
- Depends on: Inngest SDK, Firebase Admin SDK, file system access
- Used by: Client requests to schedule jobs via `/api/` endpoints

**Authentication Layer:**
- Purpose: User identity and session management
- Location: `src/lib/auth-context.tsx` (client), `src/lib/firebase-admin.ts` (server)
- Contains: Firebase Auth integration, profile enrichment, role derivation
- Depends on: Firebase Auth, Firestore user profiles
- Used by: All protected routes and components

## Data Flow

**Sheet Music Viewing (Core Flow):**

1. User navigates to `/setlists` → middleware checks session → DashboardClient renders
2. DashboardClient loads setlists via `useSetlistDashboard` hook (Firebase real-time)
3. User clicks "Perform" → navigates to `/perform/[fileId]`
4. PerformPage retrieves file metadata, requests wake lock, renders PerformerView
5. PerformerView loads PDF/XML via `/api/drive/file/[fileId]` (cached API endpoint)
6. PDFViewer renders pages; user interacts with music display
7. Transposition state in `useMusicStore` triggers re-renders via Zustand subscription
8. AI SmartTransposer optionally scans pages and extracts chords
9. Chord corrections stored in `annotation-store.ts` (Zustand) + Firestore sync

**Setlist Management Flow:**

1. User on `/setlists` creates new setlist
2. CreationWizard hook (`useCreationWizard`) collects songs and metadata
3. Submit → POST `/api/setlist/create` with tracks array
4. API route calls `createSetlistService(userId).createSetlist()` (Firestore write + audit log)
5. Firestore onSnapshot listener updates local cache
6. Component re-renders with new setlist in list

**PDF Generation (Long-Running Job):**

1. User requests print → opens PrintOptions dialog
2. Submit → POST `/api/setlist/print/prepare` validates request (returns jobId)
3. Client polls Firestore `print_jobs/{jobId}` for progress
4. Meanwhile, `/api/setlist/print/prepare` enqueues Inngest event `pdf/generate`
5. Inngest worker executes `generatePdfJob` (Inngest function):
   - Step 1: Initialize job status in Firestore
   - Step 2: Run `generatePrintPdf()` pipeline, update progress after each track
   - Step 3: Save PDF to Cloud Storage, generate signed URL, update job complete
6. Client sees download URL appear, user clicks to download

**Performance/Setlist Mode (Queue-based):**

1. User opens setlist editor, clicks "Start Performance"
2. `setQueue()` action in `useMusicStore` populates `playbackQueue` array
3. PerformPage renders FlowItemView or PerformerView for queue[queueIndex]
4. User swipes/clicks next → `nextSong()` increments queueIndex, updates transposition
5. Each queue item has per-track metadata (type, performer, transposition)
6. PerformerView rerenders with new file based on track in queue

**State Management:**

- `useMusicStore`: Central hub for file viewer state (transposition, zoom, queue, AI page data)
- Persisted via Zustand middleware to localStorage (zoom, audio settings only)
- Feature stores (`annotation-store`, `chat-store`, etc.) follow same pattern
- Server-side state via API routes (no session persistence beyond Firebase auth token)

## Key Abstractions

**Setlist Service:**
- Purpose: Encapsulates Firestore operations for setlist CRUD
- Examples: `src/lib/setlist-firebase.ts`, `src/lib/server-setlists.ts`
- Pattern: Factory function `createSetlistService(userId)` returns object with methods
- Handles: Real-time subscriptions, batch updates, audit logging

**Music Math Engine:**
- Purpose: Transpose chords, detect keys, calculate intervals
- Examples: `src/lib/music-math.ts` (pure functions), `src/lib/chord-utils.ts`
- Pattern: Functional with no side effects
- Used by: SmartTransposer, chord validation API

**PDF Generation Pipeline:**
- Purpose: Convert setlist to printable PDF with page layout
- Examples: `src/lib/print-pipeline.ts` (26KB, complex state machine)
- Pattern: Async generator-like with progress callbacks
- Input: PrintRequest (tracks, options); Output: Uint8Array PDF + stats

**File Fetcher:**
- Purpose: Unified interface for retrieving PDFs, MusicXML, ChordPro files
- Examples: `src/lib/file-fetcher.ts`
- Pattern: Adapter pattern wrapping `/api/drive/file` endpoint
- Caches: Uses IndexedDB (idb) for offline access

**Annotation Store:**
- Purpose: Client-side chord edits before Firestore sync
- Examples: `src/lib/annotation-store.ts`
- Pattern: Zustand store with optimistic updates
- Lifecycle: Local edits → batch sync → Firestore update

## Entry Points

**Public Pages:**
- `/login` → `src/app/login/page.tsx` — Google/email auth UI
- `/perform/[id]` → `src/app/perform/[id]/page.tsx` — Musician view (unauthenticated allowed)
- `/qr/*` → `src/app/qr/` — QR sign-in flow (unauthenticated)

**Protected Pages:**
- `/setlists` → `src/app/(main)/setlists/page.tsx` — Setlist library (any authenticated user)
- `/setlists/[id]` → `src/app/(main)/setlists/[id]/page.tsx` — Setlist editor (owner)
- `/manage` → `src/app/(main)/manage/page.tsx` — Admin panel (band_leader | admin role)
- `/monitor` → `src/app/(main)/monitor/page.tsx` — Live performance monitor (leader)

**API Endpoints:**
- `/api/auth/session` — POST to sync Firebase token to secure cookie
- `/api/setlist/*` — CRUD and print operations (requires auth)
- `/api/admin/*` — Admin utilities (requires admin role)
- `/api/ai/*` — LLM operations for chord validation, OMR, transposition
- `/api/drive/file/[fileId]` — Fetch file from Google Drive (with caching)
- `/api/cron/*` — Scheduled tasks via external trigger (Vercel Cron)

**Client Initialization:**
- `src/app/layout.tsx` — Root layout with providers
- `src/components/client-providers.tsx` — Sets up AuthProvider, QueryClientProvider, CongregationStore
- `src/middleware.ts` — Runs on every request for auth checks

## Error Handling

**Strategy:** Layered error propagation with user-friendly fallbacks

**Patterns:**
- React Error Boundary (`src/components/error-boundary.tsx`) wraps critical sections
- API routes return JSON errors with HTTP status codes (400, 401, 403, 500)
- Zustand stores track error state (`error` field in store)
- Toast notifications (Sonner) display errors to users
- Sentry integration (`@sentry/nextjs`) logs exceptions server-side
- Graceful degradation: If Firebase unavailable in dev, features skip initialization

**Example:** PDF generation failure → job marked "failed" in Firestore → client sees error toast + retry option

## Cross-Cutting Concerns

**Logging:**
- `src/lib/logger.ts` provides simple console wrapper
- Server-side logs to Sentry
- Client-side errors reported via `/api/` endpoints

**Validation:**
- Input validation via Zod schemas (`src/types/schemas.ts`)
- Email, setlist names, numeric ranges validated before Firestore writes

**Authentication:**
- Firebase Auth for user identity
- Custom claims (role) set via Firebase Admin SDK
- Middleware decodes JWT from cookies for route-level checks
- Session cookie refreshed on each auth state change

**Rate Limiting:**
- `src/lib/rate-limit.ts` uses Upstash Redis for distributed limits
- Applied to AI endpoints (chord validation) and chat API
- Returns 429 Too Many Requests if exceeded

## Performance Optimizations

**Prefetching:**
- `src/lib/prefetch.ts` pre-fetches upcoming songs in queue
- Reduces perceived latency when navigating between tracks

**Caching:**
- PDF worker (`pdfjs-dist`) cached in `/public`
- Firebase real-time listeners unsubscribe on unmount (memory cleanup)
- React Query with 5-minute stale time for HTTP requests
- File content cached in IndexedDB for offline access

**Code Splitting:**
- PDF viewer (`react-pdf`) loaded on-demand in `/perform` route
- Chart library (`recharts`) only imported on analytics pages
- AI transposer modal lazy-loaded for music editing

---

*Architecture analysis: 2026-03-01*
