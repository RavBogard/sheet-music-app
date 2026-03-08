# Phase 5: Backend Hardening & Library - Research

**Researched:** 2026-03-07
**Domain:** Backend robustness, library management, Drive sync, print pipeline, admin simplification
**Confidence:** HIGH

## Summary

Phase 5 works primarily with existing code. The codebase already has most of the infrastructure: a Drive sync engine with retry logic, a Zustand+Fuse.js library store, a Firebase Storage upload pipeline, a print pipeline with caching/transposition, and email delivery via Resend. The major work is (1) making the sync engine copy files to Firebase Storage during sync (currently it only writes metadata to Firestore), (2) hardening error recovery so sync never silently fails, (3) ensuring the library UI works well for browsing/searching/uploading, and (4) gutting the admin page from 7 sections across 4 tabs down to 2 essential sections: People and Library.

The `file-fetcher.ts` already implements Storage-first-Drive-fallback with cache-through, meaning the transition to Firebase Storage as source of truth is partially in place. The sync engine writes Firestore metadata but does NOT copy file bytes to Storage -- that is currently handled by a separate admin migration tool (`/api/admin/migrate-storage`). The key architectural change is integrating file copying INTO the sync engine so new Drive files automatically appear in Firebase Storage.

**Primary recommendation:** Extend `syncLibraryIndex()` to copy new/updated files to Firebase Storage during sync, add structured error reporting (per-file success/failure tracking stored in Firestore), simplify admin to People + Library tabs only, and ensure the print pipeline + email flow work end-to-end with Firebase Storage-sourced files.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Firebase Storage is the source of truth for all files served by the app
- Google Drive is an ingest channel only -- files land in Drive, sync-engine copies them to Firebase Storage, app always reads from Firebase Storage
- In-app uploads go directly to Firebase Storage (no round-trip through Drive)
- If Drive sync breaks, existing library still works -- it just doesn't pick up new Drive additions until fixed
- Flat list with Fuse.js search -- no folder hierarchy, no categories
- Upload is a per-user boolean flag ("can upload"), NOT role-based
- Duplicate handling: warn uploader with Levenshtein matching, user decides
- "Generate Gig Packet" button lives in the setlist editor action bar
- Default all assigned musicians pre-checked when emailing
- Both personalized (transposed) and generic (concert pitch) packets available
- Cover page + individual song PDFs format
- Cover page must be usable as a standalone setlist at the music stand

### Claude's Discretion
- Drive sync error recovery strategy (retry logic, partial batch failure handling)
- Admin simplification -- which tools get automated, which move to hidden dev page, which get deleted
- Backend robustness patterns (idempotency, error telemetry)
- Library search UI refinements
- Cover page layout and typography
- Print progress feedback UX

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| LIB-01 | Musician can browse and search the music library | Library UI exists (`SongChartsLibrary.tsx`), Zustand store with Fuse.js search works. Needs minor refinement for flat-list UX without folder navigation noise. |
| LIB-02 | New files added to Google Drive appear in the app library via sync | Sync engine writes metadata to Firestore already. Must be extended to also copy file bytes to Firebase Storage during sync. |
| LIB-03 | Drive sync is robust with retry logic and error recovery | `DriveClient` has exponential backoff for 429/50x. Sync engine has no per-file error tracking, no partial failure recovery, no sync status reporting. Needs structured error handling. |
| LIB-04 | Library management in-app: upload and organize files directly | Upload route and `UploadDialog.tsx` exist and work. Upload goes directly to Firebase Storage. Upload permission needs to change from `band_leader` role check to per-user flag check. |
| PRINT-01 | Band leader can generate PDF gig packets for a setlist | Print pipeline (`print-pipeline.ts`, ~700 lines) is complete with cover page, transposition, chord caching, result caching via Firebase Storage, Inngest background jobs. Needs "Generate Gig Packet" button wired into setlist editor action bar. |
| PRINT-02 | Gig packets can be emailed to musicians | Email route exists (`/api/setlist/email-packets`), uses Resend. Sends links to `/api/setlist/print/personal` for on-demand generation. Need recipient selection UI with pre-checked assigned musicians. |
| CODE-03 | Backend systems are robust enough that admin duct-tape tools are unnecessary | Sync must be self-healing. Migration tool becomes unnecessary once sync copies files. Enrichment cron already runs automatically. |
| CODE-04 | Admin tooling simplified to essentials: user management and library management | Admin page currently has 4 tabs (Overview, People, Production, System) with 7 sections. Target: 2 sections (People, Library). |
</phase_requirements>

## Standard Stack

### Core (Already in Project)
| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| Next.js | 16.1.4 | App framework, API routes | In use |
| Firebase Admin | ^13.6.0 | Firestore, Storage, Auth | In use |
| @googleapis/drive | ^20.1.0 | Google Drive API | In use |
| Zustand | ^5.0.10 | Client state (library store) | In use |
| Fuse.js | ^7.1.0 | Client-side fuzzy search | In use |
| pdf-lib | ^1.17.1 | PDF generation/merging | In use |
| Inngest | ^3.52.3 | Background job dispatch | In use |
| Resend | ^6.9.2 | Transactional email | In use |
| @tanstack/react-query | ^5.90.21 | Data fetching/caching | In use |
| Zod | ^4.3.6 | Schema validation | In use |

### Supporting
| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| @upstash/ratelimit | ^2.0.8 | API rate limiting | In use |
| sonner | ^2.0.7 | Toast notifications | In use |
| date-fns | ^4.1.0 | Date formatting | In use |

### No New Dependencies Needed
This phase requires zero new npm packages. All needed functionality is already in the dependency tree.

## Architecture Patterns

### Current File Flow (Two Separate Paths)

```
DRIVE SYNC PATH (metadata only):
  Vercel Cron (hourly) → /api/cron/sync → syncLibraryIndex()
    → DriveClient.listAllFiles() → Firestore library_index (metadata only)
    → File bytes NOT copied to Storage (separate admin migration tool)

IN-APP UPLOAD PATH (complete):
  UploadDialog → POST /api/library/upload
    → Firebase Storage upload → Firestore library_index doc
    → Files ready to serve immediately

FILE SERVING PATH:
  /api/drive/file/[fileId] → fetchFileById()
    → Try Firebase Storage first → Fall back to Drive → Cache-through to Storage
```

### Target File Flow (Unified)

```
DRIVE SYNC PATH (metadata + bytes):
  Vercel Cron (hourly) → /api/cron/sync → syncLibraryIndex()
    → DriveClient.listAllFiles() → detect new/modified files
    → Copy file bytes to Firebase Storage for new files
    → Update Firestore library_index with metadata + storageUrl
    → Report per-file success/failure to sync_status collection

IN-APP UPLOAD PATH (unchanged):
  UploadDialog → POST /api/library/upload
    → Firebase Storage upload → Firestore library_index doc

FILE SERVING PATH (Storage-only for synced files):
  /api/drive/file/[fileId] → fetchFileById()
    → Firebase Storage (primary) → Drive fallback only for legacy unsynced files
```

### Key Architectural Files

```
src/
  lib/
    sync-engine.ts          # Drive → Firestore sync (MODIFY: add Storage copy)
    google-drive.ts          # DriveClient with retry (KEEP as-is)
    file-fetcher.ts          # Storage-first, Drive-fallback (KEEP as-is)
    firebase-storage.ts      # Upload/download helpers (KEEP as-is)
    library-store.ts         # Zustand + Fuse.js (MINOR tweaks)
    print-pipeline.ts        # PDF generation (KEEP as-is, already complete)
    email.ts                 # Resend email service (KEEP as-is)
    server-library.ts        # Server-side library fetch (KEEP as-is)
  stores/
    (library-store is in lib/)
  hooks/
    use-library.ts           # React Query hook (KEEP as-is)
  components/
    library/
      SongChartsLibrary.tsx  # Main library UI (MINOR: remove folder navigation noise)
      UploadDialog.tsx       # Upload dialog (MINOR: check permission model)
  app/
    api/
      cron/sync/             # Cron trigger (KEEP as-is)
      library/
        list/                # Library listing API (KEEP as-is)
        upload/              # Upload API (MODIFY: permission check)
        sync/                # Manual sync trigger (KEEP as-is)
      setlist/
        print/               # Print dispatch via Inngest (KEEP as-is)
        print/prepare/       # Pre-extract chords (KEEP as-is)
        print/personal/      # Personal packet generation (KEEP as-is)
        print/public/        # Public packet generation (KEEP as-is)
        email-packets/       # Email sending (KEEP as-is)
      admin/
        set-role/            # KEEP (essential user management)
        delete-user/         # KEEP (essential user management)
        band-prep/           # KEEP (useful overview for leaders)
        analytics/           # REMOVE or HIDE (duct-tape analytics)
        enrich/              # AUTOMATE via cron, remove admin trigger
        migrate-storage/     # REMOVE (sync engine handles this now)
        prune-orphans/       # REMOVE (duct-tape)
        prune/scan+execute/  # REMOVE (duct-tape)
        debug-pending/       # REMOVE (duct-tape debugging tool)
        migrations/          # KEEP but hide (dev-only)
        set-sound-engineer/  # KEEP (used by PeopleSection)
    (main)/
      manage/                # Admin page (SIMPLIFY to 2 tabs)
      library/               # Library page (MINOR tweaks)
  inngest/
    functions.ts             # PDF generation job (KEEP as-is)
  components/
    admin/
      PeopleSection.tsx      # KEEP (essential)
      BandPrepSection.tsx    # KEEP (useful overview, keep in People tab)
      LibraryDataSection.tsx # SIMPLIFY (keep sync status card only)
      SystemSection.tsx      # REMOVE from main admin
      DeveloperToolsSection.tsx  # REMOVE from main admin
      LiveServiceSection.tsx     # MOVE to separate page or remove
      SoundSystemSection.tsx     # Already in Production tab, keep if sound system stays
```

### Pattern: Sync Engine Error Recovery

**Recommendation:** Track sync status per-file in a Firestore `sync_runs` collection.

```typescript
// New pattern for sync status tracking
interface SyncRun {
  startedAt: string
  completedAt: string | null
  status: 'running' | 'completed' | 'failed'
  stats: SyncStats
  errors: SyncError[]
}

interface SyncError {
  fileId: string
  fileName: string
  phase: 'list' | 'copy' | 'metadata'
  error: string
  retryable: boolean
}
```

**Strategy for partial failure:**
1. List all files from Drive (if this fails, abort and report -- Drive is unreachable)
2. For each new/modified file, try to copy to Storage
3. If individual file copy fails, log error but continue with next file
4. Write metadata batch to Firestore for ALL files (including those that failed copy)
5. Mark files that failed copy with `storageFailed: true` so next sync retries them
6. Store sync run summary in `sync_runs` collection for admin visibility

### Pattern: Upload Permission Check

Current upload route checks `band_leader` role. Need to change to per-user boolean flag:

```typescript
// Current (src/app/api/library/upload/route.ts line 42):
const auth = await withAuth(req, 'band_leader')

// Target: check canUpload flag on user profile
const auth = await withAuth(req) // any authenticated user
if (auth instanceof NextResponse) return auth
// Then check user's canUpload flag in Firestore
const userDoc = await db.collection('users').doc(auth.uid).get()
if (!userDoc.exists || !userDoc.data()?.canUpload) {
  return NextResponse.json({ error: "Upload permission required" }, { status: 403 })
}
```

### Anti-Patterns to Avoid
- **Sync engine doing too much in one function:** Keep file listing, file copying, and metadata writing as separate phases with individual error handling
- **Silent failures in cron jobs:** Every sync run must produce a status record, even if it's "nothing to do"
- **Blocking on file copy during sync:** Copy files one at a time to stay within Vercel's 300s timeout. Don't try to parallelize all copies -- the 300s limit matters more than speed
- **Hard-coding admin checks:** Use the per-user flag pattern consistently, not role checks for upload permission

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PDF generation | Custom PDF layout engine | pdf-lib (already in use) | Extensive font/layout complexity |
| Fuzzy search | Custom search algorithm | Fuse.js (already in use) | Edge cases in fuzzy matching |
| Background jobs | Custom queue system | Inngest (already in use) | Retry, timeout, observability |
| Email delivery | Custom SMTP integration | Resend (already in use) | Deliverability, templating |
| Rate limiting | Custom token bucket | @upstash/ratelimit (already in use) | Distributed, edge-compatible |
| File deduplication | Custom hash comparison | Levenshtein distance (already in use) | Threshold-based, proven pattern |
| Retry with backoff | Custom retry loop | withRetry in google-drive.ts (already exists) | Handles 429, 50x correctly |

**Key insight:** This phase is about HARDENING existing code, not building new systems. Resist the urge to rewrite -- extend and harden what exists.

## Common Pitfalls

### Pitfall 1: Vercel Cron Timeout (300s)
**What goes wrong:** Sync engine tries to copy too many files to Storage in one cron run and hits the 300s timeout
**Why it happens:** A large batch of new files added to Drive at once
**How to avoid:** Process file copies incrementally. Track which files need copying. Each cron run copies a bounded batch (e.g., 20 files max). Files not copied in this run will be caught on the next hourly run.
**Warning signs:** Sync cron returning 504 errors in Vercel logs

### Pitfall 2: Sync Engine Metadata-Only Update
**What goes wrong:** Firestore metadata is updated for a file, but the file bytes never make it to Storage
**Why it happens:** File copy to Storage fails, but metadata write succeeds (current pattern)
**How to avoid:** Track `storageCopiedAt` and `storageFailed` fields on library_index docs. Sync engine should check these and retry failed copies on subsequent runs.
**Warning signs:** Files appearing in library UI but failing to load in viewer

### Pitfall 3: Upload Permission Regression
**What goes wrong:** Changing from role-based to flag-based upload permission breaks existing upload flows
**Why it happens:** The current check is `withAuth(req, 'band_leader')`. Changing to flag-based means band leaders without the flag set can't upload.
**How to avoid:** When implementing the flag, auto-set `canUpload: true` for all users with `band_leader` or `admin` role via a migration. Then the flag becomes the single source of truth.
**Warning signs:** Daniel or David unable to upload after the change

### Pitfall 4: Library UI Still Shows Folders
**What goes wrong:** The library UI shows folder navigation (breadcrumbs, folder icons) even though the architecture is flat-list
**Why it happens:** `SongChartsLibrary.tsx` has folder navigation code (`breadcrumbs`, `currentFolderId`, folder filtering). `library-store.ts` has `sortFoldersFirst()` and folder filtering logic.
**How to avoid:** The flat-list decision means folders should be transparent. The library_index should contain individual files only, and the UI should not show folder hierarchy. However, files synced from Drive still have `parents` arrays. The Fuse.js search already ignores folder structure, but the UI shows breadcrumbs and folder rows.
**Warning signs:** Users confused by folders vs. search-only model

### Pitfall 5: Print Pipeline Already Complete
**What goes wrong:** Spending time "fixing" the print pipeline when it's already working
**Why it happens:** The print pipeline is ~700 lines with caching, transposition, service flow rendering, and background job support. It looks complex but it works.
**How to avoid:** Don't touch the print pipeline unless something is actually broken. The work here is wiring the "Generate Gig Packet" button and recipient selection UI, not modifying the pipeline itself.
**Warning signs:** Changing code in print-pipeline.ts when the task is about UI integration

### Pitfall 6: Admin Simplification Breaking Sound System Config
**What goes wrong:** Removing the Production/Sound System admin tab breaks the ability to configure X32 bridge
**Why it happens:** Sound system config lives in admin `SoundSystemSection` and `LiveServiceSection`
**How to avoid:** Keep sound system configuration accessible but move it out of the simplified admin page. Could be a separate `/settings/sound` page or kept behind the "System" tab that's admin-only.
**Warning signs:** Sound engineer unable to configure bridge after admin simplification

## Code Examples

### Sync Engine Extension: File Copy to Storage

```typescript
// Pattern for extending syncLibraryIndex() to copy files to Storage
// This shows the incremental copy approach

const MAX_COPIES_PER_RUN = 20 // Stay within 300s timeout

// After metadata batch write, copy new files to Storage
const newFiles = allFiles.filter(f => !existingDocs.has(f.id))
const needsCopy = newFiles
  .filter(f => f.mimeType !== 'application/vnd.google-apps.folder')
  .slice(0, MAX_COPIES_PER_RUN)

for (const file of needsCopy) {
  try {
    const fileData = await drive.getFile(file.id)
    const buffer = Buffer.from(fileData as ArrayBuffer)
    if (buffer.byteLength < 50) continue // Skip empty/corrupt

    await uploadToStorage(file.id, buffer, file.mimeType || 'application/pdf')

    // Mark as copied
    await db.collection('library_index').doc(file.id).update({
      storageCopiedAt: new Date().toISOString(),
      storageFailed: null,
    })
    stats.copiedToStorage = (stats.copiedToStorage || 0) + 1
  } catch (err) {
    // Mark as failed -- will be retried next sync
    await db.collection('library_index').doc(file.id).update({
      storageFailed: true,
      storageError: err instanceof Error ? err.message : 'Unknown',
    }).catch(() => {})
    stats.copyErrors = (stats.copyErrors || 0) + 1
  }
}
```

### Admin Page Simplification

```typescript
// Target admin page structure (from 4 tabs to 2)
const tabs = [
  { id: 'people', label: 'People', icon: Users, show: isBandLeader },
  { id: 'library', label: 'Library', icon: Database, show: isBandLeader },
]

// People tab: PeopleSection + BandPrepSection
// Library tab: LibrarySyncCard (status only, auto-runs via cron) + upload stats
```

### Upload Permission Flag Check

```typescript
// In UploadDialog.tsx, check canUpload from user profile
const { user, profile } = useAuth()
const canUpload = profile?.canUpload === true

// Only show Upload button if user has canUpload flag
{canUpload && (
  <UploadDialog onUploadComplete={() => loadLibrary()} />
)}
```

## Admin Route Classification

### KEEP (Essential)
| Route | Purpose | Used By |
|-------|---------|---------|
| `/api/admin/set-role` | Change user roles | PeopleSection |
| `/api/admin/delete-user` | Remove users | PeopleSection |
| `/api/admin/set-sound-engineer` | Sound engineer flag | PeopleSection |
| `/api/admin/band-prep` | Band preparation overview | BandPrepSection (Overview tab) |

### AUTOMATE (Remove Admin UI Trigger)
| Route | Purpose | Automated By |
|-------|---------|-------------|
| `/api/admin/enrich` | AI metadata enrichment | Already has cron at `/api/cron/enrich` (daily 2am) |
| `/api/library/sync` | Manual sync trigger | Already has cron at `/api/cron/sync` (hourly) |

### REMOVE (Duct-Tape)
| Route | Purpose | Why Remove |
|-------|---------|-----------|
| `/api/admin/migrate-storage` | Batch copy Drive→Storage | Sync engine will handle this automatically |
| `/api/admin/migrate-storage/reset` | Reset migration status | No longer needed |
| `/api/admin/prune-orphans` | Clean orphaned setlist refs | One-time cleanup, not ongoing need |
| `/api/admin/prune/scan` | Scan for prunable items | Duct-tape |
| `/api/admin/prune/execute` | Execute prune | Duct-tape |
| `/api/admin/debug-pending` | Debug pending storage status | Duct-tape debugging tool |
| `/api/admin/analytics` | Dashboard analytics | Over-engineered for 10-user base |
| `/api/admin/analytics/export` | Export analytics | Over-engineered |
| `/api/admin/analytics/songs` | Song usage analytics | Over-engineered |
| `/api/admin/enrich/failures` | View enrichment failures | Duct-tape |
| `/api/admin/migrations` | Run DB migrations | Keep route but remove UI -- dev-only |

### Admin Component Classification
| Component | Current Tab | Decision |
|-----------|------------|----------|
| PeopleSection | People & Access | KEEP |
| AccessAuditLog | People & Access | KEEP (under People) |
| BandPrepSection | Overview | KEEP (move to People tab) |
| LibraryDataSection | System (hidden) | SIMPLIFY to sync status card only |
| SystemSection | System (hidden) | REMOVE from admin page |
| DeveloperToolsSection | System (hidden) | REMOVE from admin page |
| LiveServiceSection | Live Production | KEEP but move to separate settings page |
| SoundSystemSection | Live Production | KEEP but move to separate settings page |

## Sync Engine Gap Analysis

### Current Sync (`syncLibraryIndex()`) - What It Does
1. Fetches ALL files from Drive via `listAllFiles()`
2. Compares with existing Firestore docs by `modifiedTime`
3. Purges stale chord caches for modified files
4. Batch writes metadata to Firestore `library_index`
5. Detects deleted files (in Firestore but not in Drive)

### What's Missing for Firebase Storage Source of Truth
1. **File byte copying:** New files found in Drive need to be downloaded and uploaded to Firebase Storage
2. **Modified file re-copying:** Files with changed `modifiedTime` need bytes re-copied to Storage
3. **Deletion handling:** Deleted files need Storage cleanup (currently only detected, not cleaned)
4. **Per-file error tracking:** No way to know which files failed to copy
5. **Sync run logging:** No record of what happened during each sync
6. **Incremental processing:** Must bound work to stay within 300s Vercel timeout
7. **Status field:** `storageCopiedAt` field needed on library_index docs to track copy status

### Current File Serving (`file-fetcher.ts`) - Already Correct
1. Tries Firebase Storage first (fast path)
2. Falls back to Google Drive if not in Storage
3. Cache-through: copies Drive result to Storage for next time
4. This pattern is already the correct architecture

## Print Pipeline Status

The print pipeline is **complete and functional**. Key details:

- `print-pipeline.ts` (700 lines): Full pipeline with cover page, transposition, chord caching
- `/api/setlist/print`: Dispatches to Inngest for background generation
- `/api/setlist/print/personal`: On-demand personalized packet (applies user's transposition)
- `/api/setlist/print/public`: On-demand generic packet (concert pitch, no auth required)
- `/api/setlist/print/prepare`: Pre-extracts chords to warm cache
- `/api/setlist/email-packets`: Sends emails with links to personal packet download
- `inngest/functions.ts`: Background PDF generation with progress tracking via Firestore

**What needs wiring:**
1. "Generate Gig Packet" button in setlist editor action bar
2. Recipient selection UI (pre-check assigned musicians)
3. Choice between personalized vs generic packet
4. Print progress feedback in the UI (Firestore real-time listener on `print_jobs` collection)

## Email Flow Status

- `email.ts`: Resend integration with `sendSetlistEmail()` -- works
- `/api/setlist/email-packets`: Takes `setlistId` and optional `recipientUids`, sends email to each with download link
- Email contains: setlist URL, packet download URL, song list, event date
- Recipient filtering: loads all band members, filters by `recipientUids` if provided

**What needs wiring:**
1. UI for selecting recipients (default: all assigned musicians pre-checked)
2. Integration with setlist editor action bar alongside "Generate Gig Packet"

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.1 |
| Config file | `vitest.config.ts` |
| Quick run command | `npm test -- --reporter=verbose` |
| Full suite command | `npm test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LIB-01 | Library browsing/search | unit | `npx vitest run src/lib/library-store.test.ts` | No -- Wave 0 |
| LIB-02 | Drive files appear after sync | unit | `npx vitest run src/lib/sync-engine.test.ts` | No -- Wave 0 |
| LIB-03 | Sync error recovery | unit | `npx vitest run src/lib/sync-engine.test.ts` | No -- Wave 0 |
| LIB-04 | Upload flow | manual-only | Manual: upload via UI, verify in library | N/A |
| PRINT-01 | Gig packet generation | unit | `npx vitest run src/lib/print-pipeline.test.ts` | Yes (partial) |
| PRINT-02 | Email sending | manual-only | Manual: send test email | N/A |
| CODE-03 | Backend robustness | integration | Covered by sync-engine tests | No -- Wave 0 |
| CODE-04 | Admin simplified | manual-only | Manual: verify admin page has 2 sections | N/A |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before verify

### Wave 0 Gaps
- [ ] `src/lib/sync-engine.test.ts` -- covers LIB-02, LIB-03, CODE-03 (sync with Storage copy, error recovery)
- [ ] `src/lib/library-store.test.ts` -- covers LIB-01 (Fuse.js search, filtering)
- [ ] Mock setup for firebase-admin, firebase-storage, google-drive in test files

## Sources

### Primary (HIGH confidence)
- Direct codebase analysis of all relevant files (sync-engine.ts, google-drive.ts, file-fetcher.ts, firebase-storage.ts, library-store.ts, print-pipeline.ts, email.ts, all API routes, admin components)
- CONTEXT.md with locked decisions from user discussion
- REQUIREMENTS.md with phase assignment

### Secondary (MEDIUM confidence)
- Existing test patterns observed in print-pipeline.test.ts and other test files

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- everything is already installed and in use, zero new dependencies
- Architecture: HIGH -- direct code reading of all relevant files, clear gap analysis
- Pitfalls: HIGH -- identified from actual code patterns and Vercel deployment constraints
- Admin classification: HIGH -- read every admin route and component

**Research date:** 2026-03-07
**Valid until:** 2026-04-07 (stable codebase, no external dependency changes expected)
