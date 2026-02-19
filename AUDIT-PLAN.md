# Codebase Audit — February 2026

## Issues Found

### 1. HIGH: Data loss on navigate-away during auto-save
**File:** `src/hooks/use-setlist-logic.ts`
**Problem:** Auto-save debounces by 1 second. If user navigates away or switches apps within that window, cleanup clears the timeout and the save never fires. No `beforeunload`/`pagehide`/`visibilitychange` handler to flush pending saves. Realistic on iPad where musicians tap Home or switch apps mid-edit.
**Fix:** Add `beforeunload` and `visibilitychange` handlers that flush pending saves immediately. Use `navigator.sendBeacon` or synchronous save on pagehide.
**Status:** [x]

### 2. HIGH: Private setlists exposed in AI chat context
**File:** `src/app/api/chat/route.ts`
**Problem:** Chat route fetches `firestore.collection('setlists').orderBy('date','desc').limit(100)` with admin SDK — no ownership or visibility filter. Every user's private setlists (names, tracks, rabbi assignments) are injected into the Gemini prompt. Any authenticated user can see other users' private setlist contents through the AI.
**Fix:** Filter to only include public setlists plus the requesting user's own setlists.
**Status:** [x]

### 3. MEDIUM: Chat route crashes on malformed input
**File:** `src/app/api/chat/route.ts`
**Problem:** `messages[messages.length - 1].content` throws TypeError if messages is empty/undefined. No input validation on request body — `messages`, `currentSetlist`, `libraryFiles` destructured without existence checks.
**Fix:** Add input validation before processing.
**Status:** [x]

### 4. MEDIUM: Audit log writes silently fail (Firestore rules block client writes)
**File:** `src/lib/setlist-audit.ts`, `firestore.rules`
**Problem:** `logSetlistChange()` writes to `setlists/{id}/history/{entryId}` from the client SDK, but Firestore rules say `allow write: if false; // Server-only via admin SDK`. Every audit log call fails silently (`.catch()` swallows it). The audit trail is empty.
**Fix:** Either (a) change Firestore rules to allow authenticated writes to history subcollection, or (b) move audit logging to API routes that use admin SDK. Option (a) is simpler and sufficient — history entries are append-only and non-sensitive.
**Status:** [x]

### 5. MEDIUM: Notification broadcasts fail for non-admin users
**File:** `src/lib/notification-store.ts`
**Problem:** `getActiveMemberUids()` does `getDocs(collection(db, 'users'))` from the client. Firestore rules restrict user reads to own data or admin. For non-admin users, this query returns only their own doc — so `notifySetlistPublished` and `notifySetlistUpdated` only notify the publisher themselves (useless). The throttled notification in `updateSetlist` also fails.
**Fix:** Move notification broadcasting to the server-side publish route (which already uses admin SDK). Remove client-side broadcast calls from `setlist-firebase.ts`.
**Status:** [x]

### 6. MEDIUM: No IndexedDB quota error handling
**File:** `src/lib/offline-store.ts`
**Problem:** `saveOfflineFile` stores full PDF blobs with no quota error handling. If device runs low on storage, `db.put()` throws `QuotaExceededError` that bubbles up unhandled. Eviction only runs on prefetch, not on save failure.
**Fix:** Wrap saves in try/catch, on QuotaExceededError trigger eviction of oldest files then retry once.
**Status:** [x]

### 7. LOW: Custom claim staleness after role changes
**File:** `src/app/api/admin/set-role/route.ts`
**Problem:** When admin changes a user's role, Firestore doc updates immediately but ID token custom claims don't refresh for up to 1 hour. During that window, API calls use old role.
**Fix:** After setting custom claims, also update the Firestore user doc `claimsUpdatedAt` timestamp. Client auth context can detect this and call `user.getIdToken(true)` to force refresh.
**Status:** [x]

### 8. LOW: QR and bridge setup-code routes have no rate limiting
**Files:** `src/app/api/auth/qr/route.ts`, `src/app/api/bridge/setup-code/route.ts`
**Problem:** QR route creates Firestore docs, bridge route returns credentials. No rate limiting on either.
**Fix:** Add `checkRateLimit` calls to both routes.
**Status:** [x]

### 9. LOW: CORS origin check uses includes() instead of exact match
**File:** `src/app/api/drive/file/[fileId]/route.ts`
**Problem:** `origin.includes('centralreform.live')` matches `evil-centralreform.live.attacker.com`. Low severity since route is intentionally public.
**Fix:** Use proper domain matching (exact match or endsWith with dot prefix).
**Status:** [x]

### 10. LOW: Editor subscription could overwrite local edits (needs investigation)
**File:** `src/app/(editor)/setlists/[id]/page.tsx`
**Problem:** `subscribeToSetlist` updates `existingSetlist` state on every Firestore change. This flows into `initialTracks` prop. If editor re-reads props after auto-save writes to Firestore, there's a potential feedback loop. Mitigated by `key={id}` keeping the component mounted, and `use-setlist-logic` only reading initialTracks on mount.
**Fix:** Verify no issue exists; if it does, stop the subscription after initial load or add a "remote update" indicator.
**Status:** [x]

### 11. LOW: Nested .then() chains without outer catch in perform page
**File:** `src/app/perform/[id]/page.tsx`
**Problem:** Nested dynamic imports without outer `.catch()`. If outer import resolves but inner fails, unhandled rejection.
**Fix:** Add `.catch()` to outer chain or convert to async/await.
**Status:** [x]

### 12. LOW: markAllAsRead accepts any uid parameter
**File:** `src/lib/notification-store.ts`
**Problem:** Function signature accepts any uid. Firestore rules would block writes to other users' docs, but the function is a footgun.
**Fix:** Added documentation noting Firestore rules provide real uid enforcement.
**Status:** [x]

## Self-Audit Results

All 12 fixes verified. One issue caught during self-audit:

- **Fix 2 (chat route):** Original query used `where('isPublic', '==', false)` which requires
  a composite index (ownerId + isPublic + date) that doesn't exist. Fixed to use only the
  `ownerId + date` index (already exists) and rely on deduplication to handle overlap with
  public query. Committed as separate fix.

### Build Status
- TypeScript: 0 errors
- ESLint: 0 errors, 1 warning (pre-existing unused import in firebase-storage.ts)
- Commits: 28a81ab (main fixes), 54a5175 (index fix)

