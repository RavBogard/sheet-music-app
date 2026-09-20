# Code Review Report -- CentralReform.live Sheet Music App

**Reviewer:** Claude Opus 4.6 (CodeRabbit Agent)
**Date:** 2026-02-23
**Scope:** Features 1, 2, 3, 5, 6, 7, 9 and shared infrastructure (`api-auth.ts`, `api-client.ts`)
**Files reviewed:** 18 files across 7 feature areas

---

## Summary

The codebase is well-structured overall, with clear separation of concerns between client and server code, a consistent authentication middleware pattern, and thoughtful UX design (streaming SSE chat, live mode, conflict resolution). The recently added features demonstrate solid engineering practices including optimistic locking for concurrent edits, hierarchical role checks, batched Firestore writes, and a confirmation layer for destructive AI chat commands.

However, the review identified **3 critical**, **8 high**, **11 medium**, and **8 low** priority findings that should be addressed before shipping to production.

**Key risk areas:**
- The Firebase service worker config is **never injected**, so background push notifications are completely broken
- The push notification API has a **role check inconsistency** that silently drops notifications for legacy `leader` role users
- The public LIVE view page has **no access control** -- anyone with a URL can view real-time setlist content
- Several API routes **fetch entire Firestore collections** into memory with no pagination or query filters
- The backup cron secret uses **simple string equality** (timing attack surface)
- A **hardcoded super admin UID** fallback exists in the auth middleware source code

---

## Critical Issues

### C1. Service Worker Firebase Config Will Always Be Empty -- Push Notifications Broken

**File:** `C:\Users\dsbog\CentralReform.live\sheet-music-app\public\firebase-messaging-sw.js` (lines 14-19)
**Category:** Bug
**Severity:** CRITICAL

The service worker reads Firebase config from `self.__FIREBASE_CONFIG__`, but nothing in the codebase sets this global variable. Since this file is in `public/` it is served as a static asset -- not processed by Next.js bundler -- so no environment variable substitution occurs. All config values resolve to empty strings, causing FCM to silently fail for all background push notifications.

```javascript
firebase.initializeApp({
    apiKey: self.__FIREBASE_CONFIG__?.apiKey || '',
    projectId: self.__FIREBASE_CONFIG__?.projectId || '',
    messagingSenderId: self.__FIREBASE_CONFIG__?.messagingSenderId || '',
    appId: self.__FIREBASE_CONFIG__?.appId || '',
})
```

**Impact:** Background push notifications (received when the browser tab is inactive or closed) will never work. Foreground notifications may work because they use the main Firebase SDK initialized in the app bundle, but any notification received while the app is backgrounded will be silently lost.

**Suggested fix:** Choose one of:
1. **Hardcode the Firebase config** directly in the service worker file. These are public values already visible in the client bundle, so there is no security concern.
2. **Use a build script** in `next.config.js` or a prebuild step that reads `.env` and generates `firebase-messaging-sw.js` with injected values.
3. **Register the service worker from client code** that passes the config via `postMessage` before calling `getToken()`.

---

### C2. Push Notification Send API Has Role Check Inconsistency -- Legacy `leader` Role Silently Blocked

**File:** `C:\Users\dsbog\CentralReform.live\sheet-music-app\src\app\api\push\send\route.ts` (line 42)
**Category:** Security / Bug
**Severity:** CRITICAL

The push API route performs its own manual role check:

```typescript
if (!role || !['admin', 'band_leader'].includes(role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
}
```

This does NOT account for the backward-compatibility alias where `leader` maps to `band_leader`. Meanwhile, the shared auth middleware in `api-auth.ts` (line 65) correctly handles this:

```typescript
const isBandLeader = isAdmin || userRole === 'band_leader' || userRole === 'leader'
```

The `sendPushForBroadcast` function in `notification-store.ts` calls `/api/push/send` via `apiFetch`, which attaches the current user's auth token. If that user has the legacy `leader` role, the push API returns 403 and the error is silently swallowed (fire-and-forget pattern).

**Impact:** Users with the legacy `leader` role will have push notifications silently fail on every broadcast. Since push is fire-and-forget, this failure is invisible to both the leader and the recipients.

**Suggested fix:** Replace the manual role check with the shared `withAuth` middleware:

```typescript
import { withAuth } from "@/lib/api-auth"

export async function POST(req: NextRequest) {
    const auth = await withAuth(req, 'band_leader')
    if (auth instanceof NextResponse) return auth
    // ... rest of handler
}
```

---

### C3. Live Mode Toggle is Non-Atomic -- Can Leave Followers in Broken State

**File:** `C:\Users\dsbog\CentralReform.live\sheet-music-app\src\components\setlist\LeaderConsole.tsx` (lines 53-57)
**Category:** Bug
**Severity:** CRITICAL

Starting live mode requires two sequential Firestore writes:

```typescript
if (!isLive) {
    await enableLiveMode(setlistId, true)
    await updateLiveTrack(setlistId, 0, userId, userName)
    toast.success("Live mode started")
}
```

If the first write succeeds but the second fails (network error, Firestore rate limit, etc.), live mode is enabled but `currentTrackIndex` remains at its previous value (likely `-1` or undefined). All connected followers on the public live page will see "Service started -- waiting for first item..." indefinitely because `currentTrack` evaluates to `null` when `currentIndex` is `-1`.

**Suggested fix:** Combine both writes into a single Firestore update. In `src/lib/setlist-live.ts`:

```typescript
export function startLiveMode(
    setlistId: string,
    uid: string,
    displayName: string
) {
    const ref = doc(db, "setlists", setlistId)
    return updateDoc(ref, {
        "liveState.enabled": true,
        "liveState.currentTrackIndex": 0,
        "liveState.updatedBy": uid,
        "liveState.updatedByName": displayName,
        "liveState.updatedAt": serverTimestamp(),
    })
}
```

---

## High Priority Issues

### H1. Hardcoded Super Admin UID Fallback in Source Code

**File:** `C:\Users\dsbog\CentralReform.live\sheet-music-app\src\lib\api-auth.ts` (line 30)
**Category:** Security
**Severity:** HIGH

```typescript
const SUPER_ADMIN_UID = process.env.SUPER_ADMIN_UID || '93Xn3DbS0bSNb8zmfzLyfOMX1Ai3'
```

A hardcoded fallback UID gives permanent admin access to a specific Firebase user. If `SUPER_ADMIN_UID` is not set in production environment variables (easy to forget during deployment), this UID will always have admin privileges regardless of their Firestore role. This is effectively a backdoor in the source code.

**Suggested fix:** Remove the hardcoded fallback entirely:

```typescript
const SUPER_ADMIN_UID = process.env.SUPER_ADMIN_UID || null

// Then in usage:
const isAdmin = (SUPER_ADMIN_UID && decoded.uid === SUPER_ADMIN_UID) || userRole === 'admin'
```

---

### H2. Public LIVE View Exposes Setlist Data Without Any Authentication

**File:** `C:\Users\dsbog\CentralReform.live\sheet-music-app\src\app\live\[id]\page.tsx` (lines 30-43)
**Category:** Security
**Severity:** HIGH

The live page subscribes to the full setlist document from Firestore with no authentication check:

```typescript
const ref = doc(db, "setlists", setlistId)
const unsub = onSnapshot(ref, (snap) => {
    if (!snap.exists()) { setError(true); return }
    const data = snap.data()
    setSetlist({ id: snap.id, ...data } as Setlist)
    setLiveState((data.liveState as LiveState) || null)
}, () => setError(true))
```

While the design intent (public display for stage monitors, iPads) is reasonable, the code fetches the **entire** setlist document including all fields -- not just the `liveState` and `tracks` needed for display. The security boundary depends entirely on Firestore Security Rules.

**Suggested fix:**
1. Add a `liveAccessToken` field to the setlist document, generated when live mode starts. Require this token as a URL query parameter.
2. Ensure Firestore Security Rules restrict unauthenticated reads to only setlists with `liveState.enabled == true`.
3. Consider creating a separate public-facing document with only the fields needed for display.

---

### H3. Analytics Endpoints Fetch ALL Setlists Into Memory

**File:** `C:\Users\dsbog\CentralReform.live\sheet-music-app\src\app\api\admin\analytics\songs\route.ts` (line 39) and `C:\Users\dsbog\CentralReform.live\sheet-music-app\src\app\api\admin\analytics\export\route.ts` (line 22)
**Category:** Performance
**Severity:** HIGH

```typescript
const setlistsSnap = await db.collection('setlists').get()
```

Both analytics endpoints load the **entire** `setlists` collection and (in the songs route) the entire `songUsage` collection into memory. Each setlist document contains an embedded `tracks` array that can be large. The date range filter is applied *after* fetching all documents (line 75 in songs route), meaning documents outside the range are fetched and discarded.

**Impact:** At scale (hundreds to thousands of setlists), this will exceed Vercel serverless function memory limits, timeout, and incur excessive Firestore read charges.

**Suggested fix:** Add date-range filters at the Firestore query level:

```typescript
const setlistsSnap = await db.collection('setlists')
    .where('eventDate', '>=', fromDate)
    .where('eventDate', '<=', toDate)
    .get()
```

For the export endpoint, add pagination with `.orderBy('eventDate').limit(200).startAfter(lastDoc)`.

---

### H4. Live Mode Has No Server-Side Authorization Check

**File:** `C:\Users\dsbog\CentralReform.live\sheet-music-app\src\lib\setlist-live.ts` (lines 56-74)
**Category:** Security
**Severity:** HIGH

The `enableLiveMode` and `updateLiveTrack` functions write directly to Firestore with no role check:

```typescript
export function enableLiveMode(setlistId: string, enabled: boolean) {
    const ref = doc(db, "setlists", setlistId)
    return updateDoc(ref, { "liveState.enabled": enabled })
}
```

While the `LeaderConsole` UI is presumably only rendered for authorized users, any authenticated user could call these functions directly from the browser console.

**Suggested fix:** Enforce via Firestore Security Rules:

```
match /setlists/{setlistId} {
    allow update: if request.auth != null
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['liveState'])
        && request.auth.token.role in ['admin', 'band_leader', 'leader'];
}
```

---

### H5. Chat Panel ADMIN_ACTION Confirmation Lacks Target User Identity

**File:** `C:\Users\dsbog\CentralReform.live\sheet-music-app\src\components\setlist\ChatPanel.tsx` (lines 57, 323-332)
**Category:** Security
**Severity:** HIGH

The AI chat can issue `ADMIN_ACTION` commands that change user roles. While this requires confirmation, the summary only shows the target role, not who is being affected:

```typescript
case 'ADMIN_ACTION':
    summaries.push(`Change user role to "${p.targetRole || 'member'}"`)
    break
```

An admin could approve a role change without seeing which user is targeted. The actual `ADMIN_ACTION` handler sends the UID directly to the set-role API without displaying the target user's name or email.

**Suggested fix:** Include the target user's identity in the confirmation summary. Consider removing `ADMIN_ACTION` from AI chat entirely -- role changes are high-stakes operations that should happen through the dedicated admin UI.

---

### H6. No Input Validation on Push Notification Payload

**File:** `C:\Users\dsbog\CentralReform.live\sheet-music-app\src\app\api\push\send\route.ts` (lines 46-49)
**Category:** Security
**Severity:** HIGH

The push endpoint performs minimal validation:

```typescript
if (!targetUids?.length || !title || !body) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
}
```

Issues:
- No upper bound on `targetUids.length` -- could target thousands of UIDs
- No length limit on `title` and `body` strings
- The `link` field (line 89) is passed directly to FCM's `fcmOptions.link` without validating it is an internal path -- could be an external malicious URL

**Suggested fix:**

```typescript
if (targetUids.length > 500) {
    return NextResponse.json({ error: "Too many target users" }, { status: 400 })
}
if (title.length > 200 || body.length > 500) {
    return NextResponse.json({ error: "Title or body too long" }, { status: 400 })
}
if (link && !link.startsWith('/')) {
    return NextResponse.json({ error: "Link must be an internal path" }, { status: 400 })
}
```

---

### H7. Backup Cron Secret Vulnerable to Timing Attack

**File:** `C:\Users\dsbog\CentralReform.live\sheet-music-app\src\app\api\cron\backup\route.ts` (line 29)
**Category:** Security
**Severity:** HIGH

```typescript
if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
}
```

Simple `!==` string comparison is vulnerable to timing attacks. For a cron endpoint that controls database exports, this is a meaningful risk.

**Suggested fix:** Use constant-time comparison:

```typescript
import { timingSafeEqual } from "crypto"

function safeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) return false
    return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}
```

---

### H8. enableLiveMode(false) Does Not Clear Track Index

**File:** `C:\Users\dsbog\CentralReform.live\sheet-music-app\src\lib\setlist-live.ts` (lines 56-59)
**Category:** Bug
**Severity:** HIGH

```typescript
export function enableLiveMode(setlistId: string, enabled: boolean) {
    const ref = doc(db, "setlists", setlistId)
    return updateDoc(ref, { "liveState.enabled": enabled })
}
```

When ending live mode, `currentTrackIndex` is left at its last value. The next time live mode starts, `LeaderConsole` sets index to 0, but there is a brief window where the old index is visible to followers, potentially causing a flash of the wrong track on the public display.

**Suggested fix:**

```typescript
export function enableLiveMode(setlistId: string, enabled: boolean) {
    const ref = doc(db, "setlists", setlistId)
    if (!enabled) {
        return updateDoc(ref, {
            "liveState.enabled": false,
            "liveState.currentTrackIndex": -1,
        })
    }
    return updateDoc(ref, { "liveState.enabled": enabled })
}
```

---

## Medium Priority Issues

### M1. SSE Stream Parsing Can Miss Events Split Across TCP Chunks

**File:** `C:\Users\dsbog\CentralReform.live\sheet-music-app\src\components\setlist\ChatPanel.tsx` (lines 163-221)
**Category:** Bug
**Severity:** MEDIUM

The SSE parser splits each chunk by newline and processes lines starting with `data: `. However, TCP chunks do not respect SSE message boundaries -- a single event could be split across two chunks:

```typescript
const text = decoder.decode(value, { stream: true })
for (const line of text.split('\n')) {
    if (!line.startsWith('data: ')) continue
    const payload = JSON.parse(line.slice(6))
```

**Suggested fix:** Maintain a buffer across chunks:

```typescript
let sseBuffer = ""
// Inside the read loop:
sseBuffer += decoder.decode(value, { stream: true })
const lines = sseBuffer.split('\n')
sseBuffer = lines.pop() || "" // Keep incomplete last line in buffer
```

---

### M2. Notification Broadcast Reads ALL Users for Every Event

**File:** `C:\Users\dsbog\CentralReform.live\sheet-music-app\src\lib\notification-store.ts` (lines 178-188)
**Category:** Performance
**Severity:** MEDIUM

```typescript
async function getActiveMemberUids(excludeUid?: string): Promise<string[]> {
    const snap = await getDocs(collection(db, 'users'))
    // filters client-side
}
```

Fetches every user document every time a notification is broadcast. Full documents are read when only `role` and `id` are needed.

**Suggested fix:** Use a filtered query:

```typescript
const q = query(
    collection(db, 'users'),
    where('role', 'in', ['admin', 'band_leader', 'musician', 'member'])
)
```

---

### M3. markAllAsRead Has No Firestore Batch Size Limit

**File:** `C:\Users\dsbog\CentralReform.live\sheet-music-app\src\lib\notification-store.ts` (lines 86-98)
**Category:** Bug
**Severity:** MEDIUM

A Firestore batch can hold at most 500 operations. The query has no `limit()`, so if a user accumulates more than 500 unread notifications, `batch.commit()` will throw.

**Suggested fix:** Chunk the batch:

```typescript
const BATCH_LIMIT = 450
for (let i = 0; i < snap.docs.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db)
    snap.docs.slice(i, i + BATCH_LIMIT).forEach(d => batch.update(d.ref, { read: true }))
    await batch.commit()
}
```

---

### M4. CSV Export Vulnerable to Formula Injection

**File:** `C:\Users\dsbog\CentralReform.live\sheet-music-app\src\app\api\admin\analytics\export\route.ts` (lines 67-71)
**Category:** Security
**Severity:** MEDIUM

Song names are placed into CSV with only double-quote escaping. Names starting with `=`, `+`, `-`, or `@` could be interpreted as spreadsheet formulas.

**Suggested fix:** Prefix formula-triggering characters:

```typescript
function sanitizeCsvCell(value: string): string {
    const escaped = value.replace(/"/g, '""')
    if (/^[=+\-@\t\r]/.test(escaped)) {
        return `"'${escaped}"`
    }
    return `"${escaped}"`
}
```

---

### M5. Push Token Re-Registration Has No Debounce

**File:** `C:\Users\dsbog\CentralReform.live\sheet-music-app\src\lib\auth-context.tsx` (lines 127-131)
**Category:** Performance
**Severity:** MEDIUM

```typescript
if (typeof window !== 'undefined' && localStorage.getItem('crc_push_token')) {
    import('./push-notifications').then(({ registerPushNotifications }) => {
        registerPushNotifications(currentUser.uid).catch(() => {})
    }).catch(() => {})
}
```

This runs on every `onAuthStateChanged` event, including token refreshes (~every 60 minutes). Each call triggers an FCM `getToken()` network request and a Firestore `arrayUnion` write.

**Suggested fix:** Track registration with a ref to ensure it runs only once per session:

```typescript
const pushRegistered = useRef(false)
// ...
if (!pushRegistered.current && localStorage.getItem('crc_push_token')) {
    pushRegistered.current = true
    // ...register
}
```

---

### M6. useEffect Missing Dependencies in ChatPanel

**File:** `C:\Users\dsbog\CentralReform.live\sheet-music-app\src\components\setlist\ChatPanel.tsx` (lines 114-126)
**Category:** Bug
**Severity:** MEDIUM

```typescript
useEffect(() => {
    if (isOpen) {
        if (pendingPrompt) {
            setInput(pendingPrompt)
            clearPendingPrompt()
            setTimeout(() => handleSend(pendingPrompt), 100)
        }
    }
}, [isOpen, pendingPrompt])  // Missing: clearPendingPrompt, handleSend
```

`handleSend` and `clearPendingPrompt` are referenced but not in the dependency array. The `setTimeout` is never cleaned up -- if the panel unmounts within 100ms, it fires against an unmounted component.

**Suggested fix:** Add missing deps and clean up the timeout:

```typescript
useEffect(() => {
    if (!isOpen) return
    inputRef.current?.focus()
    if (pendingPrompt) {
        setInput(pendingPrompt)
        clearPendingPrompt()
        const timer = setTimeout(() => handleSend(pendingPrompt), 100)
        return () => clearTimeout(timer)
    }
}, [isOpen, pendingPrompt, clearPendingPrompt, handleSend])
```

---

### M7. Live Page onSnapshot Error Handler Discards Error Context

**File:** `C:\Users\dsbog\CentralReform.live\sheet-music-app\src\app\live\[id]\page.tsx` (lines 33-41)
**Category:** Code Quality
**Severity:** MEDIUM

```typescript
const unsub = onSnapshot(ref, (snap) => {
    // ...
}, () => setError(true))  // Error object discarded
```

Permission denied, network failures, and document-not-found errors are all treated identically with no logging.

**Suggested fix:**

```typescript
}, (err) => {
    logger.warn('[LivePage] Snapshot error:', err)
    setError(true)
})
```

---

### M8. Stale Presence Entries Never Cleaned Up

**File:** `C:\Users\dsbog\CentralReform.live\sheet-music-app\src\lib\setlist-live.ts` (lines 35-44)
**Category:** Bug
**Severity:** MEDIUM

The presence subscription returns all documents with no freshness filter. Users who close their browser without calling `removePresence` will appear as permanent ghost entries. The `lastSeen` timestamp exists in the interface but is never used for filtering.

**Suggested fix:** Filter by freshness on the client:

```typescript
const STALE_THRESHOLD = 5 * 60 * 1000 // 5 minutes
const entries = snap.docs
    .map((d) => ({ ...d.data() } as PresenceEntry))
    .filter(e => {
        if (!e.lastSeen) return false
        return Date.now() - e.lastSeen.toMillis() < STALE_THRESHOLD
    })
```

---

### M9. Backup Endpoint Leaks Internal Error Details to Client

**File:** `C:\Users\dsbog\CentralReform.live\sheet-music-app\src\app\api\cron\backup\route.ts` (lines 36-40)
**Category:** Security
**Severity:** MEDIUM

```typescript
return NextResponse.json(
    { error: "Backup failed", details: err instanceof Error ? err.message : "Unknown error" },
    { status: 500 }
)
```

Error messages from Firebase Admin SDK, Google Auth Library, or Firestore can contain internal project IDs, service account emails, file paths, or permission details.

**Suggested fix:** Log full error server-side, return generic message to client:

```typescript
logger.error("[Backup] Failed:", err)
return NextResponse.json({ error: "Backup failed" }, { status: 500 })
```

---

### M10. uniqueSongs Metric in Song Analytics is Accumulated Incorrectly

**File:** `C:\Users\dsbog\CentralReform.live\sheet-music-app\src\app\api\admin\analytics\songs\route.ts` (line 112)
**Category:** Bug
**Severity:** MEDIUM

```typescript
monthlyBuckets[monthKey].uniqueSongs += uniqueInSetlist.size
```

This adds the count of unique songs *per setlist* to the monthly bucket. If Song A appears in 3 setlists in the same month, `uniqueSongs` will count it 3 times. The metric should track unique songs per month using a Set:

```typescript
const monthlyUniqueSets: Record<string, Set<string>> = {}
// Inside loop: monthlyUniqueSets[monthKey].add(key)
// After loop: monthlyBuckets[monthKey].uniqueSongs = monthlyUniqueSets[monthKey].size
```

---

### M11. Duplicated parseDate Helper Function

**Files:** `C:\Users\dsbog\CentralReform.live\sheet-music-app\src\app\api\admin\analytics\songs\route.ts` (lines 179-187) and `C:\Users\dsbog\CentralReform.live\sheet-music-app\src\app\api\admin\analytics\export\route.ts` (lines 89-96)
**Category:** Code Quality
**Severity:** MEDIUM

The same `parseDate` function is copy-pasted between both analytics route files, with slightly different implementations (the songs version handles `Date` instances; the export version does not).

**Suggested fix:** Extract to a shared utility file at `src/lib/firestore-utils.ts`.

---

## Low Priority Issues

### L1. Hardcoded Firebase SDK Version in Service Worker

**File:** `C:\Users\dsbog\CentralReform.live\sheet-music-app\public\firebase-messaging-sw.js` (lines 9-10)
**Category:** Security
**Severity:** LOW

```javascript
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js')
```

The Firebase SDK version is pinned at 10.12.0 and will not receive security patches until manually updated.

---

### L2. LeaderConsole Track List Uses Array Index as Key

**File:** `C:\Users\dsbog\CentralReform.live\sheet-music-app\src\components\setlist\LeaderConsole.tsx` (line 189)
**Category:** Code Quality
**Severity:** LOW

```tsx
<button key={i} onClick={() => jumpTo(i)}>
```

Using array indices as React keys can cause rendering bugs when tracks are reordered. Use `track.fileId || 'track-' + i` as a more stable key.

---

### L3. Notification Type Assertion Without Runtime Validation

**File:** `C:\Users\dsbog\CentralReform.live\sheet-music-app\src\lib\notification-store.ts` (lines 48-53)
**Category:** Code Quality
**Severity:** LOW

Firestore document data is cast directly to `Notification` without runtime validation. Missing or malformed fields could cause downstream runtime errors.

---

### L4. apiFetch Does Not Handle Token Refresh Failures Gracefully

**File:** `C:\Users\dsbog\CentralReform.live\sheet-music-app\src\lib\api-client.ts` (lines 11-27)
**Category:** Code Quality
**Severity:** LOW

If `getIdToken()` throws (expired session, network issue), the entire `apiFetch` call fails with an unhelpful Firebase error rather than falling back to an unauthenticated request.

**Suggested fix:** Wrap token retrieval in try-catch:

```typescript
let token: string | null = null
try {
    token = user ? await user.getIdToken() : null
} catch {
    // Token refresh failed -- proceed without auth
}
```

---

### L5. ConflictDialog Has No Keyboard Accessibility

**File:** `C:\Users\dsbog\CentralReform.live\sheet-music-app\src\components\setlist\ConflictDialog.tsx` (lines 32-85)
**Category:** Code Quality
**Severity:** LOW

The conflict dialog uses a custom `div`-based modal without keyboard trap, Escape key handling, focus management, or `role="dialog"` / `aria-modal="true"` attributes.

---

### L6. Recharts Dynamic Import Has No Error Handling

**File:** `C:\Users\dsbog\CentralReform.live\sheet-music-app\src\components\admin\UsageAnalyticsSection.tsx` (lines 298-312)
**Category:** Code Quality
**Severity:** LOW

If the recharts dynamic import fails (CDN issue, network error), the component silently stays in the loading state forever. Add a `.catch()` handler.

---

### L7. signIn and signOut Functions Not Wrapped in useCallback

**File:** `C:\Users\dsbog\CentralReform.live\sheet-music-app\src\lib\auth-context.tsx` (lines 144-161)
**Category:** Performance
**Severity:** LOW

`signIn` and `signOut` are recreated on every render. While they are excluded from the `useMemo` dependency array (so they do not currently cause issues), this is a latent bug -- if someone adds them to the deps array, the memoization would be defeated.

---

### L8. UsageAnalyticsSection Uses `any` Types for Recharts Components

**File:** `C:\Users\dsbog\CentralReform.live\sheet-music-app\src\components\admin\UsageAnalyticsSection.tsx` (lines 286-296)
**Category:** Code Quality
**Severity:** LOW

All dynamically imported recharts components are typed as `any`, losing type safety for chart props. Consider importing recharts types.

---

## Recommendations

### Architecture

1. **Move notification broadcasting to a Cloud Function.** Currently, `broadcastNotification` and `getActiveMemberUids` run on the client, fetching all user documents. This should be a backend operation triggered by Firestore document writes.

2. **Audit Firestore Security Rules.** Several features depend on Firestore rules for access control (live mode, presence, notifications). A formal review of `firestore.rules` is essential to complement this code review.

3. **Consider a shared event bus for notifications.** The current pattern of calling `notifySetlistPublished` directly from client code is fragile. A Firestore-triggered Cloud Function pattern would be more reliable and ensure push notifications work regardless of calling context.

### Testing

4. **Add integration tests for the backup endpoint.** The backup route has complex branching (GCS vs logical, cron vs manual auth), and failures could go unnoticed for weeks.

5. **Add unit tests for the SSE stream parser.** The chat panel's SSE parsing logic is fragile (see M1) and needs tests with edge cases like split chunks and malformed data.

6. **Add tests for conflict resolution.** The `setlist-versioning.ts` transaction logic is critical to data integrity and should have unit tests covering version match, mismatch, and concurrent write scenarios.

### Security Hardening

7. **Implement rate limiting on the push notification endpoint.** Without limits, a compromised admin token could spam all users.

8. **Replace SUPER_ADMIN_UID with custom claims.** Set a custom claim via Firebase Admin SDK during initial setup, and check for that claim in the auth middleware.

9. **Add CSP headers for the service worker.** The service worker loads scripts from `gstatic.com` but there are no Content Security Policy headers restricting which origins can be loaded.

### Observability

10. **Add structured logging to push notification sends.** Include targeted user count, success/failure counts, and latency metrics.

11. **Monitor backup success/failure.** The `recordBackup` function writes to Firestore, but there is no alerting if backups stop succeeding. Consider sending a notification to the admin on failure.

---

*End of Code Review Report*
