# CentralReform.live — Codebase Audit & v2.1 Roadmap

**Date:** February 18, 2026  
**Scope:** Full codebase review — 230 files, 27K lines  
**Focus:** Bugs, security, performance, UX, architecture

---

## Part 1: Bugs & Security Issues (Fix Now)

### 🔴 BUG-1: PublishDialog missing auth token

**File:** `src/components/setlist/PublishDialog.tsx`  
**Severity:** High — publishing fails for all users

The Publish dialog calls `/api/setlist/publish` without an `Authorization` header. The `useAuth` hook isn't even imported. This is the same class of bug as the PrintModal fix (`e7c6b1f`).

```tsx
// Current (broken) — no auth
const response = await fetch('/api/setlist/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ setlistId }),
})
```

**Fix:** Import `useAuth`, call `user.getIdToken()`, add `Authorization: Bearer ${token}` header.

---

### 🔴 BUG-2: Chat API allows unauthenticated access

**File:** `src/app/api/chat/route.ts` (lines 86–106)  
**Severity:** High — Gemini API costs, data leak

The chat API wraps `withAuth()` in a try/catch and *continues on failure*. An unauthenticated user can POST to `/api/chat` and receive AI responses including your full library listing, all setlist names/tracks, liturgical context, and song usage history. Rate limiting (20/min by IP) is the only gate — and it's trivially circumvented.

```ts
try {
    const auth = await withAuth(request)
    // ... admin check
} catch (e) {
    logger.warn("Auth verification failed in chat:", e) // ← Silently continues
}
// ← Proceeds to call Gemini with full context
```

**Fix:** Reject unauthenticated requests outright:

```ts
const auth = await withAuth(request)
if (auth instanceof NextResponse) return auth // 401
```

---

### 🔴 BUG-3: Cron endpoints open when CRON_SECRET is unset

**Files:** `src/app/api/cron/sync/route.ts`, `src/app/api/cron/enrich/route.ts`  
**Severity:** Medium — anyone can trigger library sync/enrichment

Both cron routes check `if (cronSecret && authHeader !== ...)`. When `CRON_SECRET` is undefined (e.g., local dev, env misconfiguration), the condition is falsy and the endpoint is completely open.

**Fix:** Fail closed — reject if `CRON_SECRET` is not configured:

```ts
if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
}
```

---

### 🟡 BUG-4: Editor doesn't re-initialize when navigating between setlists

**File:** `src/app/(editor)/setlists/[id]/page.tsx`  
**Severity:** Medium — stale data on client-side navigation

The hook `useSetlistLogic` initializes tracks via `useState(initialTracks)`, which only reads the prop once at mount. If a user navigates from `/setlists/abc` to `/setlists/xyz` via client-side routing (e.g., "Continue editing" from chat), React reuses the same component instance. The new `initialTracks` prop is silently ignored.

**Fix:** Add `key={id}` to `<SetlistEditorV2>` in the page component to force remount:

```tsx
<SetlistEditorV2 key={id} setlistId={isNew ? undefined : id} ... />
```

---

### 🟡 BUG-5: Blue focus rings on every sortable row (screenshot artifact)

**File:** `src/components/setlist/v2/SongRow.tsx`, `FlowRow.tsx`  
**Severity:** Low (visual) — but makes the UI look broken on mobile

`useSortable` injects `tabIndex={0}` and `role="button"` via `attributes`, making every row keyboard-focusable with a default browser focus ring. On mobile Chrome, tapping triggers `:focus-visible` which paints a persistent cyan/blue outline around rows.

**Fix:** Add `outline: 'none'` to the style object and use Tailwind's `focus-visible:ring-2 focus-visible:ring-primary` for keyboard-only focus:

```tsx
<div
    ref={setNodeRef}
    style={{ ...style, outline: 'none' }}
    className="... focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
>
```

---

### 🟡 BUG-6: Drive file proxy has wildcard CORS with no auth

**File:** `src/app/api/drive/file/[fileId]/route.ts`  
**Severity:** Medium — any origin can proxy your Google Drive files

The file proxy endpoint has `Access-Control-Allow-Origin: *` and zero authentication. The comment says "Security is based on the obscurity of the fileId." This is security through obscurity — once a fileId leaks (share links, browser history, logs), anyone on any domain can fetch your congregation's sheet music and audio files.

**Fix:** Remove wildcard CORS. For the public setlist use case, add the fileId to a per-setlist allowlist at publish time, or gate on a short-lived signed URL.

---

## Part 2: UX Recommendations (Top 10)

### UX-1: Swipe-to-delete on track rows

Currently, removing a track requires: tap row → wait for TrackSheet → scroll to bottom → tap Delete → confirm. That's 4 interactions for the most common destructive action.

**Proposal:** Add swipe-left-to-reveal-delete on SongRow/FlowRow (iOS-style). Use `framer-motion`'s `drag="x"` with a red "Delete" zone. Keep the TrackSheet delete as a secondary path.

---

### UX-2: Inline quick-key selector on SongRow

Key is the most-changed field after title. Currently requires opening TrackSheet and scrolling to the Key dropdown.

**Proposal:** Long-press on the key badge (or tap if no key set) shows a floating 12-key picker (C, C#, D, ... B) with major/minor toggle. One-tap key change without opening TrackSheet.

---

### UX-3: Batch operations (multi-select mode)

No way to select multiple tracks for bulk delete, bulk key change, bulk reorder (move a section), or bulk export.

**Proposal:** Long-press on any row enters multi-select mode (checkboxes appear). Bottom action bar shows: Delete Selected, Move to Section, Set Key, Copy to New Setlist.

---

### UX-4: Keyboard shortcuts for desktop power users

No keyboard shortcuts exist. Desktop users must mouse-click everything.

**Proposal:** Add `?` shortcut to show help. Core shortcuts: `N` = new track, `⌘S` = force save, `⌘Z/⌘⇧Z` = undo/redo, `↑/↓` = navigate tracks, `Enter` = open TrackSheet, `Delete` = remove track, `⌘P` = print, `/` = focus search.

---

### UX-5: Drag handle visual affordance

The grip dots are nearly invisible (`text-muted-foreground/40`). Users don't realize they can drag to reorder.

**Proposal:** On first visit, show a subtle animation (grip handle slides right 4px then back) on the first two tracks. Increase resting opacity to `/60`. On touch, show a "Drag to reorder" tooltip once.

---

### UX-6: Undo/redo surface in V2

The V2 editor has full undo/redo logic in `useSetlistLogic` but *no UI surface*. The old editor had undo/redo buttons in the 14-button toolbar (which V2 removed). Now undo/redo are completely invisible.

**Proposal:** Add undo/redo to the TopBar (small arrow-left/arrow-right icons next to the overflow menu). Also wire `⌘Z/⌘⇧Z` keyboard shortcuts.

---

### UX-7: Empty state after AI clears setlist

When the AI clears a setlist and adds new tracks, there's a brief flash where the UI shows the empty state ("This setlist is empty") before the new tracks render. This is because the batch edit processes removes before adds in a single setState, but React may paint between them.

**Proposal:** Wrap the empty-state check in a `requestAnimationFrame` debounce or add a `isAIEditing` flag that suppresses the empty state during batch operations.

---

### UX-8: Print modal — pre-select "Just me" if profile has instrument

When the user has configured their musician profile (instrument, capo, etc.), the print modal should default to "Just me" instead of "Standard." Currently defaults to Standard every time, requiring an extra tap.

**Proposal:** `const [printMode, setPrintMode] = useState(myProfile?.instrument ? 'just-me' : 'standard')`

---

### UX-9: TrackSheet — tap tempo needs visual feedback

The Tap Tempo button works but gives no visual feedback between taps. Users can't tell if their taps are registering.

**Proposal:** Add a pulse animation on each tap (scale from 1.0 → 1.15 → 1.0 over 150ms). Show a running beat counter ("Tap 3 of 4... 🎵 ~120 BPM").

---

### UX-10: Setlist dashboard — sort/filter options

The dashboard shows all setlists in a single reverse-chronological list. No way to filter by "mine only," "public only," "has upcoming event," or search by name.

**Proposal:** Add a search bar + filter chips (My Setlists / Public / Upcoming / All). Persist last-used filter in localStorage.

---

## Part 3: Backend & Architecture Improvements

### ARCH-1: Delete 1,554 lines of dead V1 code

These files are completely unreferenced after the V2 migration:

| File | Lines |
|------|-------|
| `SetlistEditor.tsx` | 356 |
| `editor/SetlistHeader.tsx` | 293 |
| `editor/TrackItem.tsx` | 361 |
| `editor/TrackServiceItem.tsx` | 293 |
| `modals/TrackDetailsModal.tsx` | 251 |

**Impact:** Reduces bundle size, eliminates confusion about which component is active, removes maintenance burden.

---

### ARCH-2: Memoize sortable row components

`SongRow`, `FlowRow`, and `DividerRow` re-render on every state change (name typing, save status, presence updates). With 20+ tracks, this is noticeable on lower-end phones.

**Fix:** Wrap each in `React.memo` with a custom comparison that checks `track`, `canEdit`, and `isDragging`. The DnD `useSortable` hook handles its own updates internally.

---

### ARCH-3: Consolidate fetch auth pattern into a utility

12 components independently call `user.getIdToken()` and construct `Authorization: Bearer ${token}` headers. This is where the PrintModal and PublishDialog bugs came from — easy to forget.

**Proposal:** Create `src/lib/api-client.ts`:

```ts
export async function apiFetch(path: string, options?: RequestInit) {
    const user = auth.currentUser
    const token = user ? await user.getIdToken() : null
    return fetch(path, {
        ...options,
        headers: {
            ...options?.headers,
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
    })
}
```

Then replace all 12 call sites. New code can never forget auth.

---

### ARCH-4: Add Firestore composite indexes for common queries

The setlist dashboard likely triggers Firestore index warnings for compound queries like `where('ownerId', '==', ...).orderBy('date', 'desc')`. These queries work but are slow without a composite index.

**Proposal:** Add `firestore.indexes.json` with explicit composite indexes for the 3-4 common query patterns. Deploy via `firebase deploy --only firestore:indexes`.

---

### ARCH-5: Rate limit the drive file proxy

`/api/drive/file/[fileId]` is the only API route with zero rate limiting. It's also unauthenticated (BUG-6). A bot could enumerate fileIds and download your entire library.

**Proposal:** Add `checkRateLimit(request, 'api')` at minimum. Consider requiring auth for non-public files.

---

### ARCH-6: Streaming chat responses

The chat API waits for Gemini to fully generate its response before returning. For complex operations (building a full Friday night service), this takes 5-10 seconds with zero feedback beyond "Thinking..."

**Proposal:** Switch to Gemini's streaming API. Stream the `message` field as it generates (show words appearing in real-time). Process `commands` after the stream completes. This gives immediate visual feedback and makes the AI feel responsive.

---

### ARCH-7: Add per-route error boundaries

Currently there's a single `ErrorBoundary` at the root layout. If the setlist editor crashes (e.g., bad track data), it takes down the entire app with no recovery path.

**Proposal:** Add error boundaries at each route group:
- `(editor)/setlists/[id]/error.tsx` — "Something went wrong. Return to dashboard?"
- `(main)/library/error.tsx` — "Library failed to load. Retry?"
- `perform/[id]/error.tsx` — "Chart failed to render. Skip to next?"

Next.js `error.tsx` convention handles this automatically.

---

### ARCH-8: Optimistic UI for auto-save

Currently, the save status dot goes green only *after* the Firestore write completes (1-3 seconds on mobile). During this time the dot is yellow, creating anxiety.

**Proposal:** Show green immediately on local state change (optimistic). Switch to yellow only if the save *fails*. Red for persistent failures. This matches how Google Docs works — "All changes saved" appears instantly.

---

## Implementation Priority

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| 🔴 Now | BUG-1 PublishDialog auth | 15 min | Broken feature |
| 🔴 Now | BUG-2 Chat API auth | 15 min | Security hole |
| 🔴 Now | BUG-3 Cron auth | 10 min | Security hole |
| 🔴 Now | BUG-4 Editor key prop | 5 min | Data integrity |
| 🔴 Now | BUG-5 Focus rings | 10 min | Visual polish |
| 🟡 Soon | BUG-6 Drive proxy auth | 2 hr | Security |
| 🟡 Soon | ARCH-1 Delete V1 code | 30 min | Hygiene |
| 🟡 Soon | ARCH-3 apiFetch utility | 1 hr | Prevents bugs |
| 🟡 Soon | UX-6 Undo/redo surface | 30 min | Missing feature |
| 🟢 v2.1 | UX-1 Swipe-to-delete | 3 hr | Mobile UX |
| 🟢 v2.1 | UX-2 Quick-key picker | 2 hr | Workflow speed |
| 🟢 v2.1 | UX-4 Keyboard shortcuts | 2 hr | Desktop UX |
| 🟢 v2.1 | ARCH-6 Streaming chat | 4 hr | Perceived perf |
| 🟢 v2.1 | ARCH-2 Memoize rows | 1 hr | Render perf |
| 🟢 v2.2 | UX-3 Batch operations | 6 hr | Power feature |
| 🟢 v2.2 | UX-10 Dashboard filters | 3 hr | Navigation |
| 🟢 v2.2 | ARCH-7 Route error boundaries | 2 hr | Resilience |
| 🟢 v2.2 | ARCH-8 Optimistic save | 2 hr | Perceived perf |
