# CentralReform.live — Post-Implementation Audit Report

**Date:** February 18, 2026  
**Scope:** Review of 6 commits (1aff69a → d6b01ea), plus fresh codebase scan  
**Build status:** TypeScript clean, ESLint clean, 369/369 tests passing

---

## Part 1: Original Audit — Status of Every Item

### Security & Bugs (Original BUG-1 through BUG-6)

| ID | Issue | Status | Notes |
|----|-------|--------|-------|
| BUG-1 | PublishDialog missing auth token | ✅ Fixed | `useAuth` + `getIdToken()` added (1aff69a) |
| BUG-2 | Chat API unauthenticated access | ✅ Fixed | Auth moved outside try/catch, rejects 401 (1aff69a) |
| BUG-3 | Cron endpoints open when CRON_SECRET unset | ✅ Fixed | Inverted to `if (!cronSecret \|\| ...)` (1aff69a) |
| BUG-4 | Editor doesn't remount on navigation | ✅ Fixed | Added `key={id}` to `<SetlistEditorV2>` (1aff69a) |
| BUG-5 | Blue focus rings on sortable rows | ✅ Fixed | Added `outline: 'none'` to all three row types (1aff69a) |
| BUG-6 | Drive file proxy — no auth, wildcard CORS | ⚠️ Partial | Rate limiting added. **CORS wildcard `*` still present** on both response paths (lines 31, 58). See NEW-3 below. |

### UX Features (Original UX-1 through UX-10)

| ID | Feature | Status | Notes |
|----|---------|--------|-------|
| UX-1 | Swipe-to-delete | ✅ Done | `SwipeToDelete.tsx` wrapping all track rows. See NEW-1 for concern. |
| UX-2 | Quick key picker | ✅ Done | `KeyPicker.tsx` — 12-note grid + major/minor toggle. See NEW-2 for bug. |
| UX-3 | Batch operations (multi-select) | ❌ Not started | Still on v2.2 roadmap |
| UX-4 | Keyboard shortcuts | ❌ Removed | Per Daniel's request — not useful for this app |
| UX-5 | Drag handle visibility | ✅ Done | FlowRow bumped to `/60`, matched to SongRow |
| UX-6 | Undo/redo surface | ✅ Already existed | TopBar already had undo/redo buttons and props wired through |
| UX-7 | Empty state flash during AI edits | ✅ Already existed | Debounce with 300ms setTimeout was already implemented |
| UX-8 | Print modal default to "Just me" | ✅ Already existed | `hasMyProfile ? "just-me" : "standard"` was already the initializer |
| UX-9 | Tap tempo visual feedback | ✅ Done | Pulse scale animation + "Tap..." indicator after first tap |
| UX-10 | Dashboard search/filter | ✅ Done | Search bar + rabbi filter chips. See NEW-4 for missing feature. |

### Architecture (Original ARCH-1 through ARCH-8)

| ID | Improvement | Status | Notes |
|----|-------------|--------|-------|
| ARCH-1 | Delete dead V1 code | ✅ Done | 1,554 lines removed (5 files). **3 more dead files found** — see NEW-5. |
| ARCH-2 | Memoize sortable rows | ✅ Done | `React.memo` on SongRow, FlowRow, DividerRow |
| ARCH-3 | Centralized `apiFetch` utility | ⚠️ Created but not adopted | `src/lib/api-client.ts` exists but **zero call sites migrated**. All 35 existing `getIdToken()` calls still use manual pattern. See NEW-6. |
| ARCH-4 | Firestore composite indexes | ❌ Not started | Needs investigation of actual Firestore console warnings |
| ARCH-5 | Rate limit drive file proxy | ✅ Done | `checkRateLimit(request, 'api')` added |
| ARCH-6 | Streaming chat responses | ❌ Not started | Requires Gemini streaming API + SSE client. ~4hr effort. |
| ARCH-7 | Per-route error boundaries | ✅ Already existed | `error.tsx` files at `(editor)`, `(main)`, `perform` routes |
| ARCH-8 | Optimistic save indicator | ✅ Done | Save dot shows green with pulse during save instead of dim green |

### Daniel's Custom Requests

| Request | Status | Notes |
|---------|--------|-------|
| Non-song items same size as songs | ✅ Done | FlowRow now uses `py-3`, two-line layout, matched grip/icon sizing |
| Rabbi assignment per service | ✅ Done | Full pipeline: model → hook → auto-save → OverflowMenu → AI context → dashboard filter |
| AI learns rabbi differences | ✅ Done | System prompt instructs AI to study past setlists tagged per rabbi |
| Remove keyboard shortcuts | ✅ Done | Removed from roadmap |

---

## Part 2: New Bugs Found

### NEW-1: SwipeToDelete may conflict with dnd-kit drag on touch devices ⚠️

**File:** `src/components/setlist/v2/SwipeToDelete.tsx`  
**Severity:** Medium — potential UX issue on phones/tablets

The SwipeToDelete wrapper uses framer-motion `drag="x"` on the entire row content, while `useSortable` inside SongRow/FlowRow binds drag listeners to the grip handle. On touch devices, both gesture systems are active simultaneously. `dragDirectionLock` should prevent most conflicts (horizontal swipe → delete, vertical drag on grip → reorder), but diagonal gestures starting on the row content area could produce unpredictable behavior.

Additionally, there's no undo for swipe-delete — it fires `onDelete()` immediately with no confirmation dialog, unlike the TrackSheet delete which confirms first. On a fast accidental swipe, a track is gone. The undo stack in `useSetlistLogic` captures the state before delete, so undo IS available, but there's no toast or snackbar telling the user "Track deleted — Undo?"

**Also:** `deleteRef.current` is set but never read (dead code on line 30).

**Recommendations:**
1. Add a "Deleted — Undo" toast with a 5-second window after swipe-delete
2. Test on iPad — if conflicts arise, disable SwipeToDelete when a sort drag is active (dnd-kit provides `active` state via `useDndContext`)
3. Remove dead `deleteRef`

---

### NEW-2: KeyPicker quality state goes stale when value changes externally ⚠️

**File:** `src/components/ui/key-picker.tsx`  
**Severity:** Medium — wrong major/minor toggle highlighted

The `quality` state is initialized from the parsed prop value, but there's no `useEffect` to sync it when the value changes externally (e.g., AI sets the key via chat, or undo restores a previous key). After an external change, the major/minor toggle shows the OLD quality while the displayed key shows the NEW value.

```tsx
// Bug: quality is only initialized once
const { note: currentNote, quality: currentQuality } = parseKey(value)
const [quality, setQuality] = useState<"" | "m">(currentQuality) // ← stale after prop change
```

**Fix:** Add sync effect:
```tsx
useEffect(() => {
    setQuality(currentQuality)
}, [currentQuality])
```

**Also:** The regex uses case-insensitive flag but NOTES array uses specific casing. If AI sends "em" instead of "Em", `parseKey` returns `note: "e"` which won't match "E" in the `isSelected` comparison. The fix is to capitalize the first letter of the matched note.

---

### NEW-3: Drive file proxy CORS wildcard still present

**File:** `src/app/api/drive/file/[fileId]/route.ts` (lines 31, 58)  
**Severity:** Medium — any origin can proxy files

Rate limiting was added (good), but `Access-Control-Allow-Origin: *` remains on both the success and error response paths. Any website on the internet can make cross-origin requests to your drive proxy.

**Recommendation:** Scope to your app domain:
```ts
const origin = request.headers.get('origin')
const allowed = origin && (origin.includes('centralreform.live') || origin.includes('localhost'))
'Access-Control-Allow-Origin': allowed ? origin : 'https://centralreform.live'
```

---

### NEW-4: Clearing rabbi doesn't persist to Firestore 🔴

**File:** `src/hooks/use-setlist-logic.ts` (line 202)  
**Severity:** High — data integrity issue

When a user clears the rabbi selection (sets to empty string ""), the save data computes `rabbi: rab || undefined`. The `undefined` value is stripped by `JSON.parse(JSON.stringify())` in `setlist-firebase.ts`. Since `updateDoc` only writes the fields present in the data object, the old rabbi value stays in Firestore forever. The UI shows no rabbi locally (because state is ""), but on reload, the old rabbi reappears.

```ts
// Current: undefined is stripped → rabbi never cleared in Firestore
rabbi: rab || undefined,
```

**Fix:** Use Firestore's `deleteField()` sentinel:
```ts
import { deleteField } from "firebase/firestore"
// In save data:
rabbi: rab ? rab : deleteField(),
```

This requires adjusting the `cleanData = JSON.parse(JSON.stringify(data))` pattern in `updateSetlist` to preserve Firestore sentinel values, or handling it at the hook level before the service call.

**Simpler fix:** Save empty string instead of undefined:
```ts
rabbi: rab || "",  // Empty string survives JSON serialization and overwrites in Firestore
```

---

### NEW-5: 3 more dead files in editor directory

**Files:**
- `src/components/setlist/editor/useDigitize.ts` — imported nowhere
- `src/components/setlist/editor/useMetronome.ts` — duplicate of `src/hooks/use-metronome.ts` (the hooks/ version is what's actually imported by `MetronomeControl.tsx`)
- `src/components/setlist/editor/useMetronome.test.ts` — tests for the dead duplicate

These were missed in the V1 code deletion (ARCH-1) because they're hooks, not components.

---

### NEW-6: `apiFetch` utility created but zero adoption

**File:** `src/lib/api-client.ts`

The utility exists but none of the 35 manual `getIdToken()` + `Authorization: Bearer` call sites were migrated. The utility provides no value until it's actually used. Key call sites that should be migrated:

| File | Manual auth calls |
|------|-------------------|
| `ChatPanel.tsx` | 2 calls |
| `PrintModal.tsx` | 2 calls |
| `PublishDialog.tsx` | 1 call |
| `SongChartsLibrary.tsx` | 2 calls |
| `LibraryDataSection.tsx` | 8 calls |
| `UploadDialog.tsx` | 1 call |
| `PDFViewer.tsx` | 1 call |
| `SmartTransposer.tsx` | 1 call |
| `SetlistDashboard.tsx` | 1 call |
| `BandPrepSection.tsx` | 1 call |

**Risk:** Every unmigrated call site is a potential repeat of the PublishDialog auth bug.

---

## Part 3: Backend & Performance Observations

### Rate limiting gaps

7 admin API routes have authentication but no rate limiting:

| Route | Auth | Rate Limit |
|-------|------|------------|
| `/api/admin/band-prep` | ✅ withAuth | ❌ None |
| `/api/admin/enrich/failures` | ✅ withAuth | ❌ None |
| `/api/admin/migrate-storage` | ✅ withAuth | ❌ None |
| `/api/admin/migrate-storage/reset` | ✅ withAuth | ❌ None |
| `/api/admin/prune/execute` | ✅ withAuth | ❌ None |
| `/api/admin/prune/scan` | ✅ withAuth | ❌ None |
| `/api/admin/set-role` | ✅ withAuth | ❌ None |

Since these require admin auth, the risk is low. A compromised admin token could abuse them, but that's a much larger problem. Low priority.

### Chat API ordering concern

In `src/app/api/chat/route.ts`, `request.json()` is called on line 85 (consuming the body) BEFORE `withAuth(request)` on line 92. `withAuth` reads headers not body, so this works — but it means an unauthenticated request still gets its body parsed and rate-limited before being rejected. Reordering auth before body parse would save CPU on unauthorized requests. Very minor.

### RehearsalToolbar audio event listener leak (original audit)

**File:** `src/components/performance/RehearsalToolbar.tsx`  
**Status:** Not fixed

Cleanup function calls `audio.pause()` and `audio.src = ''` but doesn't `removeEventListener` for `loadedmetadata`, `timeupdate`, `ended`. In practice, the Audio element goes out of scope and is garbage-collected, so the listeners don't fire. But explicit cleanup is safer and aligns with React best practices. Low priority.

### Fuse index caching (original audit)

**Status:** Already optimal — library-store already caches the Fuse instance in `_fuseIndex` state and only rebuilds on `loadLibrary()` calls.

---

## Part 4: Summary

### By the numbers

| Metric | Value |
|--------|-------|
| Commits | 6 |
| Files changed | 33 |
| Lines added | +981 |
| Lines removed | -1,684 |
| Net line change | -703 |
| Tests passing | 369/369 |
| TypeScript errors | 0 |
| ESLint errors | 0 |

### Completion scorecard

| Category | Done | Remaining | Completion |
|----------|------|-----------|------------|
| Security bugs (BUG 1-6) | 5 full + 1 partial | CORS wildcard | 92% |
| UX features (UX 1-10) | 7 done/existed | Batch operations | 88% |
| Architecture (ARCH 1-8) | 6 done/existed | Streaming chat, Firestore indexes | 75% |
| Daniel's requests | 4/4 | — | 100% |
| **New bugs found** | **4** | — | — |

### Priority fix list (what to do next)

| Priority | Item | Effort |
|----------|------|--------|
| 🔴 Fix now | NEW-4: Rabbi clearing doesn't persist (change `undefined` to `""`) | 5 min |
| 🔴 Fix now | NEW-2: KeyPicker stale quality state (add useEffect sync) | 5 min |
| 🟡 This week | NEW-1: SwipeToDelete needs undo toast + remove dead ref | 30 min |
| 🟡 This week | NEW-5: Delete 3 remaining dead editor files | 5 min |
| 🟡 This week | NEW-6: Migrate top 5 call sites to apiFetch | 1 hr |
| 🟡 This week | NEW-3: Scope CORS to app domain | 15 min |
| 🟢 Next sprint | ARCH-6: Streaming chat responses | 4 hr |
| 🟢 Next sprint | UX-3: Batch multi-select operations | 6 hr |
| 🟢 Next sprint | ARCH-4: Firestore composite indexes | 1 hr |
