# CentralReform.live — Audit Report v2.2

**Date:** February 18, 2026
**Scope:** Full codebase re-audit — 254 files, 28.8K lines, 31 API routes
**Build:** TypeScript clean, ESLint clean, 369/369 tests passing
**Commits reviewed:** 15 total (456ea50 → d6b01ea)

---

## Part 1: Complete Status of Every Planned Item

### Original Security Bugs (BUG-1 through BUG-6)

| ID | Issue | Status | Verification |
|----|-------|--------|-------------|
| BUG-1 | PublishDialog missing auth token | ✅ Fixed | `useAuth` + `getIdToken()` added, Bearer header attached |
| BUG-2 | Chat API unauthenticated access | ✅ Fixed | `withAuth` rejects 401 before Gemini is called |
| BUG-3 | Cron endpoints open when CRON_SECRET unset | ✅ Fixed | Logic inverted to `if (!cronSecret \|\| ...)` — fails closed |
| BUG-4 | Editor doesn't remount on navigation | ✅ Fixed | `key={id}` on `<SetlistEditorV2>` forces remount |
| BUG-5 | Blue focus rings on sortable rows | ✅ Fixed | `outline: 'none' as const` on all three row types |
| BUG-6 | Drive proxy — no auth, wildcard CORS | ⚠️ Partial | Rate limit added. **Wildcard CORS `*` still on lines 31 and 58.** Any origin can proxy files. |

### UX Features (UX-1 through UX-10)

| ID | Feature | Status | Verification |
|----|---------|--------|-------------|
| UX-1 | Swipe-to-delete | ✅ Built | `SwipeToDelete.tsx` wrapping all rows. Has bugs — see FRESH-1, FRESH-2. |
| UX-2 | Quick key picker | ✅ Built | `KeyPicker.tsx` with 12-note grid. Has bug — see FRESH-3. |
| UX-3 | Batch operations (multi-select) | ❌ Not started | Remains on roadmap |
| UX-4 | Keyboard shortcuts | ❌ Dropped | Per Daniel's request |
| UX-5 | Drag handle visibility | ⚠️ Partial | FlowRow and SongRow at `/60`. **DividerRow still at `/30` with `opacity-0 group-hover:opacity-100`** — completely invisible on mobile. See FRESH-4. |
| UX-6 | Undo/redo surface | ✅ Already existed | TopBar had undo/redo pre-implementation |
| UX-7 | Empty state flash | ✅ Already existed | 300ms debounce was already in place |
| UX-8 | Print modal "Just me" default | ✅ Already existed | `hasMyProfile ? "just-me" : "standard"` |
| UX-9 | Tap tempo visual feedback | ✅ Done | Pulse scale + "Tap..." indicator |
| UX-10 | Dashboard search/filter | ✅ Built | Search bar + rabbi chips. Has gap — see FRESH-5. |

### Architecture (ARCH-1 through ARCH-8)

| ID | Improvement | Status | Verification |
|----|-------------|--------|-------------|
| ARCH-1 | Delete dead V1 code | ⚠️ Mostly done | 5 components deleted (1,554 lines). **3 more dead files remain** — see FRESH-6. |
| ARCH-2 | Memoize sortable rows | ✅ Done | `React.memo` on SongRow, FlowRow, DividerRow |
| ARCH-3 | Centralized `apiFetch` | ⚠️ Created, not adopted | File exists at `src/lib/api-client.ts`. **Zero call sites migrated.** All 35 manual `getIdToken()` calls still use old pattern. See FRESH-7. |
| ARCH-4 | Firestore composite indexes | ❌ Not started | |
| ARCH-5 | Rate limit drive proxy | ✅ Done | `checkRateLimit(request, 'api')` added |
| ARCH-6 | Streaming chat responses | ❌ Not started | |
| ARCH-7 | Per-route error boundaries | ✅ Already existed | `error.tsx` at all 3 route groups |
| ARCH-8 | Optimistic save indicator | ✅ Done | Green + pulse during save |

### Post-Impl Bugs (NEW-1 through NEW-6)

| ID | Bug | Status | Verification |
|----|-----|--------|-------------|
| NEW-1 | SwipeToDelete needs undo toast | ❌ Not fixed | Immediate delete, no "Undo?" affordance |
| NEW-2 | KeyPicker stale quality state | ❌ Not fixed | No `useEffect` sync on prop change |
| NEW-3 | Drive proxy CORS wildcard | ❌ Not fixed | Still `Access-Control-Allow-Origin: *` |
| NEW-4 | Rabbi clearing doesn't persist | ❌ Not fixed | `rab \|\| undefined` gets stripped by `JSON.stringify` |
| NEW-5 | 3 dead editor files remain | ❌ Not fixed | `useDigitize.ts`, `useMetronome.ts`, `useMetronome.test.ts` |
| NEW-6 | apiFetch zero adoption | ❌ Not fixed | 35 manual auth patterns remain |

---

## Part 2: Fresh Bugs Found This Audit

### FRESH-1: SwipeToDelete conflicts with dnd-kit on touch devices 🟡

**File:** `src/components/setlist/v2/SwipeToDelete.tsx` wrapping rows in `SetlistEditorV2.tsx`
**Severity:** Medium — affects mobile drag-to-reorder reliability

The DOM nesting creates a gesture conflict:

```
SwipeToDelete
  └ motion.div drag="x"          ← framer-motion horizontal gesture
      └ SongRow div ref={setNodeRef}  ← dnd-kit sortable ref
          └ grip handle (touch-none)   ← dnd-kit listeners
```

framer-motion's `drag="x"` captures ALL touch events inside the `motion.div`, including touches that start on or near the grip handle. The `touch-none` CSS on the grip handle prevents browser default touch behaviors but does NOT prevent framer-motion's JavaScript gesture recognition.

The dnd-kit `TouchSensor` has a 250ms activation delay. A user trying to grab the grip handle who moves even slightly horizontally in the first 250ms will trigger framer-motion's direction lock to horizontal, stealing the gesture from dnd-kit entirely. The user sees the row start to swipe when they meant to drag-reorder.

**Fix options:**
1. Disable SwipeToDelete during active dnd-kit drag (use `useDndContext()` to detect `active`)
2. Add a `data-no-swipe` region around the grip handle and check it in the `onDragStart` handler
3. Only enable swipe gesture starting from the right half of the row (away from the grip handle)

---

### FRESH-2: SwipeToDelete has dead ref and no snap-back animation 🟡

**File:** `src/components/setlist/v2/SwipeToDelete.tsx`
**Severity:** Low

`deleteRef` (line 18) is set on line 31 but never read — dead code. Also, when a swipe doesn't reach the threshold, the `motion.div` snaps back to `x=0` via `dragConstraints`, but there's no explicit animation config. Depending on framer-motion version behavior, this may look abrupt. Adding `transition={{ type: "spring", stiffness: 300, damping: 30 }}` to the motion.div would ensure a smooth snap-back.

---

### FRESH-3: KeyPicker quality state desyncs on external changes 🟡

**File:** `src/components/ui/key-picker.tsx` (line 27)
**Severity:** Medium — wrong major/minor highlight after AI or undo

```tsx
const [quality, setQuality] = useState<"" | "m">(currentQuality) // ← only set once
```

When the key value changes externally (AI sets key, undo restores, or another user edits via live sync), the internal `quality` state keeps the OLD value. The picker shows the wrong major/minor toggle highlighted.

**Fix:** Add sync effect:
```tsx
useEffect(() => { setQuality(currentQuality) }, [currentQuality])
```

**Also:** The regex `parseKey` uses case-insensitive matching but the NOTES array uses specific casing (e.g. "E" not "e"). If AI sends `"em"`, `parseKey` returns `note: "e"` which won't highlight "E" in the grid. Normalize the note to title case after parsing.

---

### FRESH-4: DividerRow drag handle invisible on mobile 🟡

**File:** `src/components/setlist/v2/DividerRow.tsx` (line 42)
**Severity:** Medium — section headers can't be reordered on touch devices

```tsx
className="cursor-grab ... text-muted-foreground/30 ... opacity-0 group-hover:opacity-100 ..."
```

The grip handle has `opacity-0` with `group-hover:opacity-100`. Touch devices have no hover state, so the handle is permanently invisible. Even on desktop hover, the color is `/30` — barely visible. SongRow and FlowRow were both fixed to `/60` with no opacity toggle, but DividerRow was missed.

**Fix:** Match SongRow/FlowRow pattern:
```tsx
className="cursor-grab active:cursor-grabbing touch-none text-muted-foreground/60 hover:text-muted-foreground p-1 -ml-1"
```

---

### FRESH-5: Calendar view ignores search and rabbi filters 🟡

**File:** `src/components/setlist/SetlistDashboard.tsx` (line 344)
**Severity:** Low — UI inconsistency

```tsx
<CalendarView setlists={[...personalSetlists, ...publicSetlists]} ... />
```

The list view uses `displayedSetlists` (filtered by search + rabbi), but the calendar view bypasses filters entirely and shows all setlists from both tabs. A user who filters to "Rabbi Karen" and switches to calendar view sees everything.

**Fix:** Pass filtered data:
```tsx
<CalendarView setlists={displayedSetlists} ... />
```

---

### FRESH-6: Rabbi not saved on initial setlist creation 🔴

**File:** `src/hooks/use-setlist-logic.ts` (lines 208-211)
**Severity:** High — data loss

The `create` path in `performSave` only passes `eventDate` in `additionalData`:

```tsx
const newId = await setlistService.createSetlist(n, t, pub, {
    eventDate: ed ? ed.toISOString() : undefined
    // ← rabbi is MISSING
})
```

Meanwhile the `update` path (line 206) passes the full `dataToSave` object which includes `rabbi`. So on a brand-new setlist:

1. User creates setlist, picks "Rabbi Karen"
2. First save fires → `createSetlist()` → rabbi NOT written to Firestore
3. ~1 second later, auto-save triggers again (because `setSetlistId` changed state) → `updateSetlist()` → rabbi IS written

There's a ~1 second window where closing the page loses the rabbi. More critically, this is just sloppy — the create call should include all fields.

**Fix:** Pass `dataToSave` as additionalData:
```tsx
const newId = await setlistService.createSetlist(n, t, pub, dataToSave)
```

Or more surgically:
```tsx
const newId = await setlistService.createSetlist(n, t, pub, {
    eventDate: ed ? ed.toISOString() : undefined,
    rabbi: rab || undefined,
})
```

---

### FRESH-7: Rabbi clearing still doesn't persist to Firestore 🔴

**File:** `src/hooks/use-setlist-logic.ts` (line 202)
**Severity:** High — data integrity

This was identified as NEW-4 in the previous report and remains unfixed:

```tsx
rabbi: rab || undefined,
```

When rabbi is cleared (empty string), this becomes `undefined`, which is stripped by `JSON.parse(JSON.stringify(data))` in the Firestore service. The old rabbi value persists in the database. On page reload, the cleared rabbi reappears.

**Fix (simplest):** Use empty string instead of undefined:
```tsx
rabbi: rab,  // Empty string overwrites in Firestore
```

---

### FRESH-8: OverflowMenu — Delete and Duplicate never wired 🟡

**File:** `src/components/setlist/v2/SetlistEditorV2.tsx` (lines 263-282)
**Severity:** Medium — missing functionality

The `OverflowMenu` component accepts `onDelete`, `onDuplicate`, and `onSetDate` props, but `SetlistEditorV2` passes none of them:

| Prop | Defined in OverflowMenu | Passed from Editor | Effect |
|------|-------------------------|-------------------|--------|
| `onDelete` | ✅ Renders "Delete Setlist" button | ❌ Not passed | Button hidden — users must go to dashboard to delete |
| `onDuplicate` | ✅ Renders "Duplicate Setlist" button | ❌ Not passed | Button hidden |
| `onSetDate` | ✅ In interface | ❌ Not passed | Dead prop — no JSX renders it at all |

The `onSetDate` prop is in the TypeScript interface but has zero rendering code — it's truly dead.

**Fix:**
- Wire `onDelete` to `setlistService.deleteSetlist()` with a confirmation dialog
- Wire `onDuplicate` to create a copy with `(Copy)` suffix
- Remove `onSetDate` from the interface (dead code)

---

### FRESH-9: Dead test file runs against dead code 🟢

**File:** `src/components/setlist/editor/useMetronome.test.ts`
**Severity:** Low — wasted CI time, false confidence

This test file tests the dead `editor/useMetronome.ts` (which is a duplicate of the active `hooks/use-metronome.ts`). The test passes in CI, giving false confidence that the metronome is tested — but the version actually used in the app (`hooks/use-metronome.ts`) has no tests.

**Fix:** Delete the dead test file along with its dead source. Optionally, move the test to cover the active implementation.

---

## Part 3: Backend & Architecture Observations

### API Routes — Auth and Rate Limit Coverage

All 31 API routes audited:

| Category | Routes | Auth | Rate Limit |
|----------|--------|------|-----------|
| User-facing (chat, print, library) | 15 | ✅ All have `withAuth` | ✅ All have `checkRateLimit` |
| Admin (set-role, migrate, prune, etc.) | 7 | ✅ All require admin role | ❌ None have rate limiting |
| Cron (sync, enrich) | 2 | ✅ Fixed — `CRON_SECRET` | N/A (server-to-server) |
| Drive proxy | 1 | ❌ **No auth** | ✅ Rate limited |
| AI endpoints (OMR, transposer) | 4 | ✅ `withAuth` | ✅ `checkRateLimit` |
| Other (chord-cache, metadata) | 2 | ✅ `withAuth` | ✅ `checkRateLimit` |

The 7 admin routes without rate limiting are low risk since they require admin auth. The drive proxy without auth is the only real concern (mitigated by rate limiting and fileId obscurity).

### Chat API — Body Parsed Before Auth

In `src/app/api/chat/route.ts`, `request.json()` is called on line 85 before `withAuth()` on line 92. This means unauthenticated requests still get their JSON body parsed and allocated in memory before being rejected. Not a security issue (auth still blocks the request), but reordering would save a few milliseconds of CPU on unauthorized requests.

### RehearsalToolbar — Audio Event Listener Leak

**File:** `src/components/performance/RehearsalToolbar.tsx` (lines 82-94)

Three `addEventListener` calls (`loadedmetadata`, `timeupdate`, `ended`) with no corresponding `removeEventListener` in the cleanup function. The Audio element is created locally so it gets garbage collected on cleanup, but explicit removal is cleaner and prevents potential issues if the Audio reference is ever shared.

### `apiFetch` Utility — Adoption Path

`src/lib/api-client.ts` exists with zero consumers. There are 35 manual `getIdToken()` + `Authorization: Bearer` patterns across 10 component files. Every unmigrated call site is a potential repeat of the original PrintModal/PublishDialog auth bug class.

**Top migration candidates (most frequently modified files):**
1. `ChatPanel.tsx` — 2 calls
2. `PrintModal.tsx` — 2 calls
3. `PublishDialog.tsx` — 1 call (already has manual auth, but should use utility)
4. `SongChartsLibrary.tsx` — 2 calls
5. `SetlistDashboard.tsx` — 1 call

---

## Part 4: Summary Scorecard

### Completion by Category

| Category | Items | Done | Partial | Not Done | % |
|----------|-------|------|---------|----------|---|
| Original security bugs (6) | 6 | 5 | 1 | 0 | 92% |
| Original UX features (10) | 10 | 7 | 1 | 2 | 75% |
| Original architecture (8) | 8 | 5 | 2 | 1 | 69% |
| Post-impl bugs (6) | 6 | 0 | 0 | 6 | 0% |
| **Totals** | **30** | **17** | **4** | **9** | **63%** |

### Fresh Bugs Found This Audit: 9

| Severity | Count | IDs |
|----------|-------|-----|
| 🔴 High | 2 | FRESH-6 (rabbi not saved on create), FRESH-7 (rabbi clear doesn't persist) |
| 🟡 Medium | 6 | FRESH-1, FRESH-3, FRESH-4, FRESH-5, FRESH-8 |
| 🟢 Low | 1 | FRESH-9 |

### Priority Fix List

| Priority | Item | Effort | What to do |
|----------|------|--------|------------|
| 🔴 Fix now | FRESH-7 / NEW-4: Rabbi clearing | 1 line | Change `rab \|\| undefined` → `rab` |
| 🔴 Fix now | FRESH-6: Rabbi missing from create | 2 lines | Add rabbi to `createSetlist` additionalData |
| 🔴 Fix now | FRESH-3 / NEW-2: KeyPicker stale quality | 3 lines | Add `useEffect` sync + normalize note casing |
| 🟡 This session | FRESH-4: DividerRow invisible grip | 1 line | Match SongRow class |
| 🟡 This session | FRESH-8: Wire onDelete to OverflowMenu | 30 min | Add confirm dialog + delete handler |
| 🟡 This session | FRESH-5: Calendar ignores filters | 1 line | Pass `displayedSetlists` to CalendarView |
| 🟡 This session | NEW-5 / FRESH-9: Delete 3 dead files | 2 min | rm editor/useDigitize.ts, editor/useMetronome.ts, editor/useMetronome.test.ts |
| 🟡 This session | FRESH-2: SwipeToDelete dead ref | 1 line | Remove `deleteRef` |
| 🟡 This session | FRESH-8: Remove dead `onSetDate` prop | 1 line | Remove from OverflowMenu interface |
| 🟡 This week | FRESH-1: Swipe vs drag conflict | 1 hr | Disable swipe during active dnd-kit drag |
| 🟡 This week | NEW-1: Swipe delete undo toast | 30 min | Show "Deleted — Undo" toast for 5s |
| 🟡 This week | NEW-3: CORS wildcard | 15 min | Scope to centralreform.live domain |
| 🟡 This week | NEW-6: Migrate top 5 files to apiFetch | 1 hr | ChatPanel, PrintModal, PublishDialog, SongChartsLibrary, Dashboard |
| 🟢 Next sprint | ARCH-6: Streaming chat | 4 hr | Gemini streaming API + SSE client |
| 🟢 Next sprint | UX-3: Batch multi-select | 6 hr | Long-press → checkbox mode → bulk actions |
| 🟢 Next sprint | ARCH-4: Firestore indexes | 1 hr | Add composite indexes for dashboard queries |
