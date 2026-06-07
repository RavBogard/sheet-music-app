# Handoff — Bug Sweep Session
**Date:** 2026-05-11  
**Branch:** master  
**Commits:** `c6e485f` → `e8e15f9` (8 commits)

---

## What Was Fixed

### 1. Firestore "Shutting Down" Cascade — SYSTEMIC FIX
**Root cause:** `persistentMultipleTabManager` coordinates cross-tab IDB ownership using IndexedDB. When any tab opened Firestore (new deployment, new tab), it negotiated primary ownership by opening the Firestore IDB at a potentially new version. This fired `onversionchange` on all other open tabs, causing the Firebase SDK to call `terminate()` on every Firestore instance — killing all listeners simultaneously.

**Fix:** Switched to `persistentSingleTabManager({})` in `src/lib/firebase.ts`. Each tab now manages its own IDB independently. No cross-tab version negotiation → no cascade possible.

**Defense in depth added:**
- `controllerchange` listener → 3s delayed page reload when new SW deployment activates (`firebase.ts`)
- `recoverFromFirestoreShutdown(err)` utility exported from `firebase.ts`, wired into all 6 listener error handlers that previously only logged:
  - `src/hooks/use-safe-firestore-sync.ts`
  - `src/lib/alert-store.ts`
  - `src/lib/users-firebase.ts`
  - `src/lib/notification-store.ts`
  - `src/hooks/use-monitor-connection.ts`
  - `src/lib/firestore-monitor-client.ts`
- Recovery flag (`sessionStorage`) now cleared on `load` event so future assertion failures can still trigger IDB wipe recovery

**User action needed:** Hard-refresh all open CRC tabs once to get the new code. Self-healing is automatic after that.

---

### 2. PDF 404 for Lechu Goldman.pdf — SYSTEMIC FIX
**Root cause:** The file `1jgs72zwhfEvqsqeeCFMw8Th7Zsk0mVJj` is a Google Drive **shortcut** (`mimeType: application/vnd.google-apps.shortcut`), not a real file. Drive returns 403 when you call `alt=media` directly on a shortcut. The sync copy failed with a 403, and the Drive fallback also failed for the same reason.

**Firestore doc state (before fix):**
```
storageFailed: true
storageError: "Request failed with status code 403"
storageCopiedAt: (missing)
```

**Fix:** `DriveClient.getFile()` in `src/lib/google-drive.ts` now does a metadata lookup first. If `mimeType === application/vnd.google-apps.shortcut`, it reads `shortcutDetails.targetId` and downloads the target file instead. Transparent to all callers.

Also:
- `listAllFiles()` now includes `shortcutDetails` in the fields query
- Sync batch write stores `shortcutTargetId` in the `library_index` doc

**User action needed:** Run a sync from Manage → Library tab. The sync will retry copying Lechu Goldman.pdf (now correctly resolved through the shortcut), clear `storageFailed`, and set `storageCopiedAt`. File will serve from Firebase Storage on all future loads.

---

### 3. Admin Data Tab 403 on `runAggregationQuery`
**Root cause:** `LibraryDataSection` was calling `getCountFromServer(collection(db, "library_index"))` client-side. `library_index` is `allow read, write: if false` in Firestore rules — server-only collection.

**Fix:** Removed the `getCountFromServer` call. File count now reads from `syncData.stats.totalScanned` from the last sync run record. (`src/components/admin/LibraryDataSection.tsx`)

---

### 4. Sync UI Didn't Name Failed Files
**Root cause:** `SyncStats` interface had `copyErrors: number` but no list of which files failed.

**Fix:** Added `copyFailedFiles?: string[]` to `SyncStats` in `src/lib/sync-engine.ts`. `LibrarySyncCard` in `src/components/admin/library/LibrarySyncCard.tsx` now displays the file names under the copy error warning.

---

### 5. Library Wipe Risk on Drive API Error
**Root cause:** If `drive.listAllFiles()` returned 0 files (API error, wrong folder ID, rate limit), `driveIds` would be an empty Set. The deletion loop (`!driveIds.has(doc.id)`) would then mark every existing `library_index` document as deleted.

**Fix:** Guard added in `src/lib/sync-engine.ts` — if `allFiles.length === 0`, the sync throws immediately before any writes.

---

### 6. Concurrent Sync Runs
**Root cause:** No concurrency guard — Vercel cron retries or rapid admin double-clicks could start two syncs simultaneously, double-counting stats and creating duplicate `sync_runs` docs.

**Fix:** At sync start, queries `sync_runs` for any run with `status: running` started within the last 10 minutes. If found, throws immediately. New composite index added in `firestore.indexes.json` and deployed.

---

### 7. `storageFailed` Mark Failure Silently Swallowed
**Root cause:** In the Storage copy error handler, `db.update({ storageFailed: true }).catch(() => {})` swallowed all errors. If both the upload AND the failure-marking failed, the file would have neither `storageCopiedAt` nor `storageFailed=true` — permanently invisible to the retry logic.

**Fix:** `.catch(() => {})` replaced with `.catch((err) => logger.warn(...))` in `src/lib/sync-engine.ts`.

---

### 8. `set-role` Silent Claims Failure
**Root cause:** After a successful Firestore role update, if Firebase Auth `setCustomUserClaims` failed, the route returned `{ success: true }` with no indication of the failure. The role was correct in Firestore but the user's ID token would carry stale claims until next sign-in.

**Fix:** Response now includes `claimsUpdated: boolean` field. `src/app/api/admin/set-role/route.ts`.

---

## Files Changed

| File | What changed |
|------|-------------|
| `src/lib/firebase.ts` | `persistentMultipleTabManager` → `persistentSingleTabManager`; SW `controllerchange` reload; `recoverFromFirestoreShutdown()` export; recovery flag cleared on load |
| `src/lib/google-drive.ts` | `getFile()` resolves shortcuts; `listAllFiles()` includes `shortcutDetails` in fields |
| `src/lib/sync-engine.ts` | Zero-files guard; concurrent run guard; `storageFailed` mark logged; `copyFailedFiles[]` tracking; `shortcutTargetId` stored |
| `src/lib/file-fetcher.ts` | Drive fallback added for Storage misses |
| `src/lib/alert-store.ts` | `recoverFromFirestoreShutdown` wired in |
| `src/lib/users-firebase.ts` | `recoverFromFirestoreShutdown` wired in |
| `src/lib/notification-store.ts` | `recoverFromFirestoreShutdown` wired in |
| `src/lib/firestore-monitor-client.ts` | `recoverFromFirestoreShutdown` wired in |
| `src/hooks/use-safe-firestore-sync.ts` | `recoverFromFirestoreShutdown` wired in |
| `src/hooks/use-monitor-connection.ts` | `recoverFromFirestoreShutdown` wired in |
| `src/components/admin/LibraryDataSection.tsx` | Removed `getCountFromServer`; reads count from sync stats |
| `src/components/admin/library/LibrarySyncCard.tsx` | Shows failed file names |
| `src/app/api/admin/set-role/route.ts` | Returns `claimsUpdated` field |
| `firestore.indexes.json` | Added `sync_runs` composite index (`status` + `startedAt`) |

---

## Remaining / Out of Scope

- **Lechu Goldman.pdf sync**: Needs one manual sync run to fully resolve. The Drive fallback serves it immediately; Storage copy follows after sync.
- **`upload-*` IDs in deleted files list**: Files uploaded directly (not from Drive) appear in the "What changed?" deleted list on every sync because they have Drive IDs that don't exist in Drive. Known issue, not addressed.
- **`set-role` admin UI**: Doesn't yet surface `claimsUpdated: false` to the user — backend returns it, frontend ignores it. Low priority.
- **SW `no-response` for `/perform/...` URLs**: Was caused by the Firestore shutdown cascade making the page non-functional. Should resolve with the `persistentSingleTabManager` fix.
