# Phase 5: Backend Hardening & Library - Context

**Gathered:** 2026-03-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Make backend systems robust enough to run without admin intervention. Drive sync is reliable, library management works in-app, print pipeline is clean, admin is simplified to essentials (user management + library management only).

Requirements: LIB-01, LIB-02, LIB-03, LIB-04, PRINT-01, PRINT-02, CODE-03, CODE-04

</domain>

<decisions>
## Implementation Decisions

### File storage architecture
- Firebase Storage is the source of truth for all files served by the app
- Google Drive is an ingest channel only -- files land in Drive, sync-engine copies them to Firebase Storage, app always reads from Firebase Storage
- In-app uploads go directly to Firebase Storage (no round-trip through Drive)
- If Drive sync breaks, existing library still works -- it just doesn't pick up new Drive additions until fixed
- This replaces the current approach where some files serve from Drive URLs

### Library organization
- Flat list with Fuse.js search -- no folder hierarchy, no categories
- Musicians find songs by name, which is how they actually look for them
- Key/BPM/tags stored as metadata on each file but not used for folder structure

### Upload permissions
- Upload is NOT role-based -- it's a per-user boolean flag ("can upload")
- Admin (Daniel) toggles this flag on specific users (e.g., Daniel, David the music director)
- Standard musicians cannot upload

### Duplicate handling on upload
- Warn uploader when a similar file exists (Levenshtein matching already at 85% threshold)
- Show "Similar file exists: [name]. Upload anyway?" with option to view the existing file
- Uploader makes the final call -- no auto-blocking

### Gig packet placement
- "Generate Gig Packet" button lives in the setlist editor action bar
- Not on dashboard cards -- you generate packets while looking at the setlist

### Gig packet recipients
- Default all assigned musicians pre-checked when emailing
- Daniel deselects anyone who doesn't need a packet
- One-tap for the common case (send to everyone)

### Gig packet transposition
- Both personalized and generic packets available
- Daniel chooses "personalized" (transposed per musician's profile) or "generic" (concert pitch)
- Personalized for regular band members with profiles, generic for guest musicians without profiles

### Gig packet format
- Cover page + individual song PDFs
- Cover page is a high-quality functional setlist: song title, key, tempo, lead, full flow items (readings, prayers, transitions)
- Cover page must be usable on its own as a printed setlist at the music stand
- Song PDFs follow the cover page

### Claude's Discretion
- Drive sync error recovery strategy (retry logic, partial batch failure handling)
- Admin simplification -- which tools get automated, which move to hidden dev page, which get deleted
- Backend robustness patterns (idempotency, error telemetry)
- Library search UI refinements
- Cover page layout and typography
- Print progress feedback UX

</decisions>

<specifics>
## Specific Ideas

- Cover page should function as a standalone setlist -- not just a table of contents, but something a musician could put on their stand and use to play the service
- Firebase as source of truth means Drive outages don't break the app for musicians mid-service

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `DriveClient` (src/lib/google-drive.ts): Already has retry with exponential backoff, handles 429 and 50x errors
- `syncLibraryIndex()` (src/lib/sync-engine.ts): Batch writes with BATCH_SIZE=450, detects deletions, pre-detects chord cache purging needs
- `library-store.ts`: Zustand store with Fuse.js search, folder filtering, cached Fuse index
- Upload route (api/library/upload): Form-data handling, 25MB limit, PDF/MusicXML types, Levenshtein duplicate detection, Firebase Storage upload
- `UploadDialog.tsx`: File picker with drag-drop, auto-title from filename, key/BPM/tags fields
- `print-pipeline.ts` (~300 lines): Chord extraction with caching, content hash dedup, progress phases, transposition support
- `email-packets route`: Sends emails with recipient filtering, auth check, setlist metadata

### Established Patterns
- `withAuth(request, requiredRole?)` guards all API routes
- `checkRateLimit(request, tier)` for rate limiting (basic/api/upload tiers)
- Firestore batch writes with 450-doc limit
- Error boundaries per admin section (SectionErrorBoundary)
- Inngest for background job dispatch (print/generate)

### Integration Points
- Cron job at /api/cron/sync (Vercel hourly) calls syncLibraryIndex()
- Print routes: /api/setlist/print (main), /prepare, /personal, /public
- Email route: /api/setlist/email-packets
- Admin page: /manage with 7 sections (target: 2)
- 12+ admin API routes (many are duct-tape candidates for removal)

</code_context>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

*Phase: 05-backend-hardening-library*
*Context gathered: 2026-03-08*
