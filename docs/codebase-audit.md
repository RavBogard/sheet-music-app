# Codebase Audit: Sheet Music App v2.0

**Audited:** 2026-03-07
**Auditor:** Phase 1 Plan 02 (GSD Execute)
**Scope:** Full codebase audit — dead code, store architecture, components, admin features, API routes, dependencies

---

## 1. Dead Code Removed (Phase 1)

### Deleted Files

| File | Lines | Reason |
|------|-------|--------|
| `src/app/(main)/tasks/page.tsx` | 290 | Task management cut from v2 scope |
| `src/app/api/tasks/create/route.ts` | ~50 | Task management cut from v2 scope |
| `src/app/api/tasks/delete/route.ts` | ~50 | Task management cut from v2 scope |
| `src/app/api/tasks/update/route.ts` | ~50 | Task management cut from v2 scope |
| `src/components/setlist/tasks/TaskSheet.tsx` | ~200 | Task management cut from v2 scope |
| `src/components/admin/UsageAnalyticsSection.tsx` | 377 | Analytics cut from v2 scope |
| `src/app/(main)/leader/page.tsx` | ~24 | Redirect page (middleware handles this) |

**Total removed: ~1,041 lines**

### Modified Files (Import Cleanup)

| File | Change |
|------|--------|
| `src/types/models.ts` | Removed `TaskStatus` type and `SetlistTask` interface (~25 lines) |
| `src/middleware.ts` | Removed `/leader` from route checks and redirect logic |
| `src/app/(main)/manage/page.tsx` | Removed `UsageAnalyticsSection` import and usage |
| `src/app/perform/setlist/[id]/page.tsx` | Removed `TaskSheet` import/usage, `ListTodo` icon, task state |
| `src/hooks/use-calendar-data.ts` | Removed task subscription, `SetlistTask` type, task-related state |
| `src/components/calendar/CalendarDayCell.tsx` | Removed `ListTodo` icon and task count indicator |

### Items That Could NOT Be Fully Removed

| Item | Reason | Disposition |
|------|--------|-------------|
| `src/lib/setlist-store.ts` (63 lines) | Still used as staging buffer for library-to-setlist workflow (`SongChartsLibrary` → `SetlistEditorV2`). The store populates `pendingItems` that `SetlistEditorV2` reads on `isNew=true` to initialize a new setlist from library selections. | Added `// TODO: Remove setlist-store dependency (Phase 4)` comment. Remove when Phase 3/4 rebuilds the setlist creation flow. |
| `src/components/dashboard/TaskCards.tsx` | Dashboard component that queries the `tasks` Firestore collection. Still rendered in `DashboardClient.tsx`. The task data model is gone from `models.ts` but the component uses its own inline `TaskItem` type and queries Firestore directly. | Leave in place — it will silently show 0 tasks since the tasks API routes are gone. Remove in Phase 5. |

---

## 2. Additional Dead Code Candidates

### Safe to Delete (High Confidence)

| File/Area | Lines | Evidence | Risk |
|-----------|-------|----------|------|
| `src/components/admin/analytics/TimelineChart.tsx` | ~80 | Recharts chart component. No file in `src/` imports it. `UsageAnalyticsSection` (now deleted) was the only consumer. | **Low** — no importers |
| `src/components/dashboard/TaskCards.tsx` | ~80 | Only queries `tasks` collection which has no write API anymore. Will always return empty results. | **Low** — UI shows nothing, can be cleaned after Phase 1 |
| `recharts` npm dependency | - | Only used by `TimelineChart.tsx` (now orphaned). Can be removed once `TimelineChart.tsx` is deleted. | **Low** — no other consumers |
| `src/app/api/admin/analytics/route.ts` | ~100 | Served data to `UsageAnalyticsSection`. No frontend callers remain. | **Medium** — verify no external consumers |
| `src/app/api/admin/analytics/export/route.ts` | ~60 | Analytics export route, same as above. | **Medium** |
| `src/app/api/admin/analytics/songs/route.ts` | ~60 | Song analytics, same as above. | **Medium** |
| `src/app/api/test-gemini/route.ts` | ~30 | Dev/test endpoint — should not be in production. | **Low** |

### Needs Investigation (Medium Confidence)

| Area | Files | Question |
|------|-------|----------|
| `src/components/setlist/LeaderConsole.tsx` (268 lines) | `setlist-live.ts` live mode | Live follow mode is listed as a deferred feature. Is `LeaderConsole` + `setlist-live.ts` reachable from the current UI? |
| `src/app/live/[id]/page.tsx` | Live session page | Is the `/live/:id` route reachable from the current nav? Check if linked anywhere. |
| `src/lib/setlist-live.ts` | Real-time presence/live mode | Imported by `LeaderConsole` and `PerformanceToolbar`. If live follow mode is deferred, this may be partially dead. |
| `src/app/api/admin/debug-pending/route.ts` | Debug endpoint | May be a dev-only route that shouldn't be in production. |
| `src/app/api/admin/migrate-storage/route.ts` + `reset` | Migration routes | One-time migration routes that may have already been run. |
| `src/app/api/admin/migrations/route.ts` | Migration route | Same as above. |

### Out of Scope (Intentionally Deferred)

These are known areas to revisit in later phases. Not orphaned — actively used:
- `src/lib/song-suggestions.ts` — used by `AddSongsModal`
- `src/lib/song-preferences.ts` — used by `use-musician-transposition.ts`
- `src/lib/musician-suggestions.ts` — used by scheduling API
- `src/lib/new-song-detector.ts` — used by scheduling assign API

---

## 3. Zustand Store Architecture Plan

### Current State (7 Active Stores)

| Store | File | Lines | Responsibility | Consumers |
|-------|------|-------|----------------|-----------|
| Music Player | `store.ts` | 279 | File loading, playback queue, transposition, zoom, AI chord scanner | PerformanceToolbar, PDFViewer, SmartTransposer, ~20 components |
| Monitor | `monitor-store.ts` | 162 | Mixer state (channels, buses, matrices), connection status | FaderStrip, QuickMonitorPanel, MatrixPanel, ConnectionIndicator |
| Library | `library-store.ts` | 90 | File library search/filtering, hydration, display state | SongChartsLibrary, LibraryFileRow |
| Annotation | `annotation-store.ts` | 131 | Per-file drawing annotations, tools, colors | AnnotationLayer, AnnotationToolbar |
| Chat | `chat-store.ts` | 89 | AI chat window open/close, message history, streaming state | ChatPanel |
| Alert | `alert-store.ts` | 45 | Global system alert/banner state | GlobalAlertBanner, ManagePage |
| Congregation | `congregation-store.ts` | 97 | Org config, feature flags (monitor, chat, etc.) | AppNavigation, many components |
| ~~Setlist~~ | `setlist-store.ts` | 69 | **LEGACY** staging buffer for library-to-setlist | SongChartsLibrary, LibraryFileRow, SetlistEditorV2 |

### Problems with Current Architecture

1. **store.ts is a god object**: Music player, transposition, zoom, AI scanner, and queue are all in one 279-line store. These are independent concerns that could be split.
2. **No setlist state store**: Setlist editing state lives in `useSetlistLogic` hook (not a store), which means it can't be shared across components without prop drilling.
3. **setlist-store.ts is a stopgap**: The legacy localStorage staging buffer does not belong in the v2 architecture. Setlist creation should use `setlist-firebase.ts` flows directly.
4. **congregation-store.ts mixes concerns**: Org config (name, logo, features) and feature flags are in the same store. Feature flags could be a separate hook.

### Target Architecture (7 Focused Stores)

| Store | Responsibility | Change | Phase |
|-------|----------------|--------|-------|
| `player-store.ts` | Playback queue, current file, navigation | Split from `store.ts`. Keep: queue, currentIndex, setQueue, setFile. | Phase 3 |
| `editor-store.ts` | Transposition, zoom, annotation mode | Split from `store.ts`. Keep: transposition, zoom, isAnnotating. | Phase 3 |
| `monitor-store.ts` | Mixer state, connection | No change — already focused | Phase 2 (harden) |
| `library-store.ts` | Library display/filter state | No change — already focused | Phase 5 |
| `annotation-store.ts` | Drawing annotations | No change — already focused | No change planned |
| `chat-store.ts` | AI chat state | No change — already focused | No change planned |
| `congregation-store.ts` | Org config + feature flags | Minor cleanup — extract feature flags to a hook if needed | Phase 5 |
| ~~`alert-store.ts`~~ | Global banner | Merge into congregation-store or use React context | Phase 5 |
| ~~`setlist-store.ts`~~ | Legacy staging buffer | Delete when setlist creation is rebuilt | Phase 4 |

### Migration Plan by Phase

**Phase 2 (Monitor Production):**
- Harden `monitor-store.ts` — no structural changes, just add connection recovery state if needed.

**Phase 3 (Setlist + Performance Views):**
- Split `store.ts` into `player-store.ts` (queue/file) and `editor-store.ts` (transposition/zoom). This is the riskiest refactor — ~20 components import from `store.ts`. Do it when rebuilding the performance view anyway.
- No refactoring until the features that use those stores are being rebuilt.

**Phase 4 (Setlist Editor):**
- Delete `setlist-store.ts`. Replace library-to-setlist workflow with a direct `setlist-firebase.ts` flow.
- Consider a `setlist-editor-store.ts` for editor state if needed.

**Phase 5 (Library + Backend):**
- Evaluate merging `alert-store.ts` into congregation context.
- Clean up `library-store.ts` if library is rebuilt.
- Evaluate splitting feature flags from org config in `congregation-store.ts`.

---

## 4. Component Audit

### Component Count by Directory

| Directory | Count | Notes |
|-----------|-------|-------|
| `ui/` | 32 | shadcn/ui + custom UI primitives — stable, well-isolated |
| `setlist/` | 30 | Largest domain. v2 subdir (10) + v1 shared (12) + wizard (1) |
| `admin/` | 21 | Admin duct-tape components — see Section 5 |
| `performance/` | 12 | Performance view components |
| `music/` | 9 | PDF viewer, transposer, annotation |
| `library/` | 7 | Library browser |
| `dashboard/` | 7 | Home screen widgets |
| `calendar/` | 6 | Unified calendar |
| `nav/` | 5 | Navigation |
| `monitor/` | 5 | Monitor mixer UI |
| `offline/` | 3 | PWA offline support |
| `layout/` | 3 | Page layout |
| `settings/` | 3 | User settings |
| `scheduling/` | 2 | Scheduling cards |
| `audio/` | 1 | Audio player |
| `auth/` | 1 | QR sign-in |
| `people/` | 1 | Nudge admin button |
| `views/` | 1 | PerformerView |

### Oversized Components (>300 lines) — Candidates for Splitting

| Component | Lines | Problem | Phase |
|-----------|-------|---------|-------|
| `setlist/v2/MusicianPicker.tsx` | 855 | Combines musician selection, availability display, and assignment logic. Should be split into a picker UI + assignment logic hook. | Phase 3 |
| `setlist/v2/SetlistEditorV2.tsx` | 617 | Event handlers, modal state, track management — but delegates to `useSetlistLogic`. Acceptable size given it orchestrates many sub-components. | Phase 4 (rebuild) |
| `setlist/ChatPanel.tsx` | 546 | Chat UI + streaming + AI provider logic. Consider extracting AI logic to `chat-store`. | Phase 4 |
| `setlist/v2/TrackSheet.tsx` | 529 | Track detail editor sheet. Complex but focused. | Phase 4 |
| `library/SongChartsLibrary.tsx` | 491 | Library browser + digitize + select mode + audio tabs. Extract audio tab to separate component. | Phase 5 |
| `setlist/PrintModal.tsx` | 457 | Print modal + print preparation logic. Consider extracting `usePrintPreparation` hook. | Phase 3 |
| `music/TransposerMenu.tsx` | 411 | Transposer UI + chord extraction logic. Extract chord logic to hook. | Phase 3 |
| `setlist/wizard/CreationWizard.tsx` | 392 | Creation wizard — may be replaced entirely in Phase 4 setlist rebuild. | Phase 4 |
| `performance/RehearsalToolbar.tsx` | 378 | Rehearsal mode toolbar — complex but focused. | Phase 3 |

### Components Scheduled for Rebuild (Phase 3-4)

These are intentionally not refactored now — they will be replaced:
- `setlist/v2/SetlistEditorV2.tsx` → Phase 4 setlist rebuild
- `setlist/v2/TrackSheet.tsx` → Phase 4
- `setlist/wizard/CreationWizard.tsx` → Phase 4
- `performance/PerformanceToolbar.tsx` → Phase 3 performance view
- `performance/PerformerView.tsx` (via `views/`) → Phase 3

---

## 5. Admin Feature Triage

### Essential — Keep As-Is

| Feature | Component | Why Essential |
|---------|-----------|---------------|
| User management (roles, pending approval) | `PeopleSection.tsx`, `UserRow.tsx`, `AccessAuditLog.tsx` | Core access control — no users without this |
| Bridge setup wizard | `MonitorSetupWizard.tsx`, `SoundSystemSection.tsx` | Required for monitor hardware setup |
| Library sync + AI enrichment | `LibraryDataSection.tsx`, `LibrarySyncCard.tsx`, `AiEnrichmentCard.tsx` | Library would be unusable without sync |
| Global alert banner | `GlobalAlertCard.tsx`, `system/GlobalAlertCard.tsx` | Admin communication to musicians |
| Set sound engineer flag | `/api/admin/set-sound-engineer/route.ts` | Required for monitor access control |
| Set user roles | `/api/admin/set-role/route.ts` | Core access control |
| Delete user | `/api/admin/delete-user/route.ts` | GDPR compliance |

### Duct Tape — Remove When Backend is Fixed (Phase 5)

| Feature | Component | Why Duct Tape |
|---------|-----------|---------------|
| Firebase data migrations | `FirebaseMigrationCard.tsx`, `/api/admin/migrations/route.ts` | One-time migration tools. Already run. |
| Storage migration | `/api/admin/migrate-storage/route.ts` | One-time migration. Already run. |
| Data integrity checker | `DataIntegrityCard.tsx` | Should be automated, not manual |
| Orphaned file pruner | `OrphanedFilePruner.tsx`, `/api/admin/prune*` | Should be a cron job, not manual |
| Debug pending | `/api/admin/debug-pending/route.ts` | Dev-only debug endpoint in production |
| Chord cache management | `ChordCacheCard.tsx`, `/api/library/chord-cache/route.ts` | Should be automated invalidation |
| Test Gemini endpoint | `/api/test-gemini/route.ts` | Dev-only endpoint — should not exist in production |

### Simplify in Phase 5

| Feature | Current State | Target |
|---------|---------------|--------|
| Analytics | Deleted `UsageAnalyticsSection`. Admin/analytics API routes remain. | Replace with simple Firestore-native metrics or remove entirely |
| Band prep section | `BandPrepSection.tsx` — shows upcoming setlists with prep status | Keep but simplify once scheduling is solid in Phase 3 |
| Developer tools section | `DeveloperToolsSection.tsx` — wraps migration cards | Remove when duct-tape items are cleaned |
| Library backup | `BackupCard.tsx`, `/api/cron/backup/route.ts` | Review if Google Drive is already the source of truth |

---

## 6. API Route Audit

### Route Inventory (66 routes)

#### Auth (2)
| Route | Purpose | Status |
|-------|---------|--------|
| `POST /api/auth/session` | Create session cookie from Firebase token | Active — required |
| `POST /api/auth/qr` | QR code sign-in flow | Active |

#### Bridge (1)
| Route | Purpose | Status |
|-------|---------|--------|
| `POST /api/bridge/setup-code` | Generate/redeem bridge setup code | Active — core monitor feature |

#### Drive (4)
| Route | Purpose | Status |
|-------|---------|--------|
| `GET /api/drive/file/[fileId]` | Proxy Google Drive file download | Active — required for PDF viewing |
| `GET /api/drive/health` | Drive API health check | Active |
| `PATCH /api/drive/metadata` | Update file metadata | Active |
| `POST /api/drive/save` | Save generated XML to Drive | Active |

#### Library (8)
| Route | Purpose | Status |
|-------|---------|--------|
| `GET /api/library/list` | List library files | Active — primary library endpoint |
| `GET /api/library/search-content` | Search chord/content data | Active |
| `POST /api/library/sync` | Sync Drive → Firestore | Active |
| `GET /api/library/usage` | Song usage statistics | Active |
| `PATCH /api/library/archive` | Archive/unarchive files | Active |
| `POST /api/library/upload` | Upload file to Drive | Active |
| `GET /api/library/chord-cache` + `DELETE` | Manage chord cache | Duct tape — see Section 5 |
| `GET /api/library/file/[id]` | Direct file access | Active |
| `POST /api/library/save-generated` | Save AI-generated content | Active |

#### AI (4)
| Route | Purpose | Status |
|-------|---------|--------|
| `POST /api/ai/omr` | AI music digitization | Active |
| `POST /api/ai/transposer` | AI chord transposition | Active |
| `POST /api/ai/transposer/scan` | Scan page for chords | Active |
| `POST /api/ai/chord-validate` | Validate chord corrections | Active |

#### Setlist (7)
| Route | Purpose | Status |
|-------|---------|--------|
| `POST /api/setlist/publish` | Publish setlist to musicians | Active |
| `POST /api/setlist/transfer` | Transfer setlist ownership | Active |
| `POST /api/setlist/print` | Generate print PDF | Active |
| `POST /api/setlist/print/personal` | Personal gig packet | Active |
| `POST /api/setlist/print/public` | Public setlist print | Active |
| `POST /api/setlist/print/prepare` | Prepare print assets | Active |
| `POST /api/setlist/email-packets` | Email gig packets | Active |

#### Setlists (3)
| Route | Purpose | Status |
|-------|---------|--------|
| `POST /api/setlists/import/parse` | Parse imported setlist | Active |
| `POST /api/setlists/import/execute` | Execute setlist import | Active |
| `GET /api/setlists/matrix` | Setlist matrix view data | Active |

#### Scheduling (10)
| Route | Purpose | Status |
|-------|---------|--------|
| `POST /api/scheduling/assign` | Assign musician to setlist | Active |
| `DELETE /api/scheduling/unassign` | Remove assignment | Active |
| `POST /api/scheduling/respond` | Musician confirms/declines | Active |
| `POST /api/scheduling/remind` | Send reminder | Active |
| `POST /api/scheduling/suggest` | AI band suggestion | Active |
| `POST /api/scheduling/suggest-band` | Full band composition suggestion | Active |
| `GET/POST /api/scheduling/availability` | Availability management | Active |
| `GET/POST /api/scheduling/blockouts` | Blockout date management | Active |
| `GET /api/scheduling/calendar-feed/[token]` | iCal feed | Active |
| `GET /api/scheduling/history` | Scheduling history | Active |

#### Admin (12)
| Route | Purpose | Status |
|-------|---------|--------|
| `POST /api/admin/set-role` | Set user role | Active — essential |
| `POST /api/admin/set-sound-engineer` | Set sound engineer flag | Active — essential |
| `DELETE /api/admin/delete-user` | Delete user | Active — essential |
| `GET /api/admin/analytics` | Usage analytics | **Orphaned** — `UsageAnalyticsSection` deleted |
| `GET /api/admin/analytics/export` | Export analytics CSV | **Orphaned** |
| `GET /api/admin/analytics/songs` | Song analytics | **Orphaned** |
| `GET /api/admin/band-prep` | Band prep data | Active (BandPrepSection) |
| `GET /api/admin/debug-pending` | Debug endpoint | Duct tape — should be removed |
| `POST /api/admin/enrich` | Trigger AI enrichment | Active |
| `GET /api/admin/enrich/failures` | View enrichment failures | Active |
| `POST /api/admin/migrate-storage` + `reset` | Storage migration | Duct tape — one-time use |
| `POST /api/admin/migrations` | Data migrations | Duct tape — one-time use |
| `GET /api/admin/prune-orphans` | Scan orphaned files | Duct tape |
| `POST /api/admin/prune/scan` + `execute` | Prune execution | Duct tape |

#### Cron (4)
| Route | Purpose | Status |
|-------|---------|--------|
| `POST /api/cron/backup` | Scheduled backup | Active — review if needed |
| `POST /api/cron/enrich` | Scheduled enrichment | Active |
| `POST /api/cron/scheduling-reminder` | Scheduled reminders | Active |
| `POST /api/cron/sync` | Scheduled library sync | Active |

#### Other (4)
| Route | Purpose | Status |
|-------|---------|--------|
| `POST /api/chat` | AI chat endpoint | Active |
| `POST /api/push/send` | Push notification | Active |
| `POST /api/nudge-admin` | Nudge pending user admin | Active |
| `GET /api/inngest` | Inngest webhook handler | Active |
| `GET /api/webhooks/resend` | Resend email webhook | Active |
| `GET /api/test-gemini` | **Dev-only test endpoint** | **Should be deleted** |

### Routes Needing Hardening (Phase 2-5)

| Route | Issue |
|-------|-------|
| `/api/admin/*` | Missing rate limiting on destructive operations |
| `/api/setlist/print` | No size limits — large setlists could cause timeouts |
| `/api/ai/omr` | No concurrency limit per user (existing `ai-concurrency.ts` exists but verify it's used) |
| `/api/scheduling/*` | Email sending routes need idempotency keys to prevent duplicate sends |

---

## 7. Dependency Health

### Dependencies in Use (Core)

All core dependencies are actively used and appropriate:
- `firebase` ^12.9.0 — Firestore, Auth
- `firebase-admin` ^13.6.0 — Server-side Firebase
- `zustand` ^5.0.10 — Client state
- `zod` ^4.3.6 — Schema validation
- `next` 16.1.4 — App framework (note: check if this is latest stable)
- `react` 19.2.3 — UI framework
- `pdfjs-dist` ^5.4.530 — PDF rendering (core feature)
- `opensheetmusicdisplay` ^1.9.4 — MusicXML rendering (core feature)

### Potentially Unused After Phase 1 Cleanup

| Package | Status | Action |
|---------|--------|--------|
| `recharts` ^3.7.0 | **Likely orphaned** — only used by deleted `UsageAnalyticsSection`. `TimelineChart.tsx` (admin/analytics) also orphaned. | Delete `TimelineChart.tsx`, then remove `recharts` from package.json |
| `canvas` ^3.2.1 | Used by `pdf-transpose-renderer.ts` for server-side PDF manipulation | Keep |
| `@upstash/ratelimit` + `@upstash/redis` | Rate limiting library — verify it's actually wired up in prod | Keep but verify |
| `inngest` ^3.52.3 | Background job processing — verify jobs are actually configured | Keep |
| `papaparse` ^5.5.3 | CSV parsing — used by setlist importer | Keep |

### Version Flags

| Package | Concern |
|---------|---------|
| `next 16.1.4` | Verify this is the intended version (Next.js 15 is current stable as of early 2026) |
| `@sentry/nextjs ^10.39.0` | Sentry integration — verify it's properly initialized (check `sentry.client.config.ts`) |
| `canvas ^3.2.1` | Server-only — ensure it's not bundled client-side |

### No Known Security Issues

All major dependencies are pinned to recent versions. No flagged CVEs in the packages listed above based on available knowledge.

---

## 8. Recommended Cleanup by Phase

### Phase 2 — Monitor Production

**Dead code to remove:**
- None specific to monitor
- Can leave existing dead code — not worth the risk during monitor work

**Hardening:**
- Verify `/api/bridge/setup-code` rate limiting
- Ensure monitor-store.ts connection recovery state is adequate

### Phase 3 — Setlist + Performance Views

**Dead code to remove:**
- Delete `src/components/admin/analytics/TimelineChart.tsx` (orphaned after `UsageAnalyticsSection` deletion)
- Remove `recharts` from `package.json` once `TimelineChart.tsx` is deleted
- Delete `/api/admin/analytics/*` routes (3 routes, now orphaned)
- Delete `/api/test-gemini/route.ts` (dev-only endpoint)
- Evaluate `src/components/setlist/LeaderConsole.tsx` — if live follow mode stays deferred, this can be removed

**Refactoring:**
- Split `store.ts` into `player-store.ts` + `editor-store.ts` while rebuilding performance view
- Extract `usePrintPreparation` hook from `PrintModal.tsx`

### Phase 4 — Setlist Editor Rebuild

**Dead code to remove:**
- Delete `src/lib/setlist-store.ts` (legacy staging buffer)
- Remove `useSetlistStore` imports from `SongChartsLibrary.tsx`, `LibraryFileRow.tsx`, `SetlistEditorV2.tsx`
- Delete `src/components/setlist/wizard/CreationWizard.tsx` when replaced
- Delete `src/components/dashboard/TaskCards.tsx` (queries non-existent tasks collection)

**Refactoring:**
- Replace setlist creation flow with `setlist-firebase.ts` native flow (no staging store needed)
- Split `MusicianPicker.tsx` (855 lines) into picker UI + assignment logic hook

### Phase 5 — Library + Backend Simplification

**Dead code to remove:**
- `/api/admin/debug-pending/route.ts` — dev-only
- `/api/admin/migrate-storage/*` — one-time migrations already run
- `/api/admin/migrations/route.ts` — same
- `/api/admin/prune-orphans`, `/api/admin/prune/*` — automate or remove
- `src/components/admin/developer/FirebaseMigrationCard.tsx` — one-time tool
- `src/components/admin/developer/DataIntegrityCard.tsx` — should be automated

**Refactoring:**
- Merge `alert-store.ts` into congregation context or React context (too small for dedicated store)
- Simplify `congregation-store.ts` — evaluate splitting feature flags into a custom hook
- Evaluate `library-store.ts` changes when library is rebuilt
- Remove `src/components/admin/developer/DeveloperToolsSection.tsx` when its sub-cards are cleaned

---

## Appendix: Store Consumer Map

| Store | Key Consumers |
|-------|--------------|
| `store.ts` | PerformanceToolbar, PDFViewer, SmartTransposer, TransposerMenu, SetlistEditorV2, SongChartsLibrary, PerformerView, ~15 more |
| `monitor-store.ts` | FaderStrip, QuickMonitorPanel, MatrixPanel, BusAssignmentPanel, ConnectionIndicator |
| `library-store.ts` | SongChartsLibrary, LibraryFileRow |
| `annotation-store.ts` | AnnotationLayer, AnnotationToolbar, PDFPageWrapper |
| `chat-store.ts` | ChatPanel, AppNavigation |
| `alert-store.ts` | GlobalAlertBanner, GlobalAlertCard (admin) |
| `congregation-store.ts` | AppNavigation, MobileTabBar, MonitorSetupWizard, SoundSystemSection, SongChartsLibrary |
| `setlist-store.ts` | SongChartsLibrary, LibraryFileRow, SetlistEditorV2 (staging only) |
