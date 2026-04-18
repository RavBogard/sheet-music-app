# Phase 3: Setlist Performance View - Research

**Researched:** 2026-03-07
**Domain:** React UI (Next.js 16 + Tailwind v4 + Firestore real-time), tablet-first performance UX
**Confidence:** HIGH

## Summary

Phase 3 transforms the existing setlist performance page (`/perform/setlist/[id]`) from a navigation-based flow (tap song -> navigate to PDF route) into an immersive single-page experience where the PDF renders in-place as a full-screen takeover with a persistent bottom bar. The codebase already contains all the core building blocks: `PDFViewer`, `QuickMonitorPanel`, `useMusicianTransposition`, `useWakeLock`, `useSafeFirestoreSync`, `LiveState` with `currentTrackIndex`, and the `getTransposedKeyName` utility. The primary work is restructuring the setlist page into a dense single-scroll list, building the PDF takeover overlay with bottom bar, wiring up leader-driven position sync, creating the public access route, and redesigning the home screen as a single-card focused view.

The existing middleware already allows unauthenticated access to `/perform/*` routes, and Firestore rules already permit reads on setlists where `isPublic == true` without authentication. The `subscribeToPublicSetlists` method in `setlist-firebase.ts` is already implemented. This means public access is primarily a UI concern -- building the right views that work without auth context.

**Primary recommendation:** Restructure `/perform/setlist/[id]` as a dense list + in-page PDF overlay (no route navigation), wire up existing `liveState.currentTrackIndex` for position highlighting, and build a separate public landing page at `/perform` that lists public setlists for unauthenticated visitors.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Dense compact rows -- songs get slightly more visual weight (bold title), liturgical items are visually quieter (smaller text, muted color)
- Per song row: Title + transposed Key + Tempo + Lead musician visible without tapping
- Notes hidden until tapped -- keeps rows clean
- Liturgical non-song items (readings, prayers, transitions) show just the label -- no timing/duration
- Single scrollable list, no collapsible sections -- mirrors a physical setlist taped to a stand
- Portrait tablet optimized
- Full-screen takeover when tapping a song -- PDF owns the entire screen
- Persistent bottom bar during PDF view with: setlist drawer button, monitor access button, current song name, prev/next song buttons
- Setlist drawer opens as overlay from the bottom bar -- does NOT navigate away from PDF
- Tapping a different song in the drawer switches the PDF in place -- seamless, no round-trip to setlist page
- Prev/next buttons skip non-song items -- only navigates between songs with PDFs
- Leader-driven sync -- band leader advances position, all musicians see the same current item highlighted
- Uses existing Firestore liveState.currentTrackIndex for real-time sync
- Highlight only, no auto-scroll -- musicians control their own scroll position
- Background highlight style (soft colored background on current row) -- visible from arm's length on a music stand
- centralreform.live shows public setlists to non-signed-in visitors -- browse and tap into any public setlist
- Public view is the same performance view, read-only -- no transposition, no monitor controls, no editing
- No sign-in prompt for public visitors
- Signed-in musicians see one focused card: this week's service date, setlist name, who's playing, and a prominent "Perform" button
- Not a dashboard -- one card, one action
- Empty state (no upcoming service): show the most recent past setlist for practice reference

### Claude's Discretion
- Exact spacing, typography, and color choices for the dense list rows
- Loading states and skeleton patterns
- Error handling for missing PDFs or failed Firestore sync
- Wake lock implementation details (SET-06)
- Auto-transposition display format (how the transposed key appears in the row)
- Transition animations between setlist and PDF views
- Advance mechanism for leader (tap-to-set vs dedicated controls)

### Deferred Ideas (OUT OF SCOPE)
- Live follow mode (all musicians auto-scroll together) -- v2 feature (PERF-V2-01)
- Offline caching of setlist data and PDFs -- v2 feature (OFFLINE-01)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SET-01 | Musician sees full service flow at a glance: title, transposed key, tempo, notes -- without tapping | Dense row layout pattern; `getTransposedKeyName` from music-math.ts; `SetlistTrack` has all fields (title, key, bpm, leadMusician, type) |
| SET-02 | Non-song items (readings, prayers, transitions) appear as first-class items in the flow | `TrackType` enum already includes 'reading', 'prayer', 'transition', 'note', 'header'; existing page already handles flow items with type-based icons |
| SET-03 | Current position clearly highlighted so musician never loses place | `LiveState` interface with `currentTrackIndex` in setlist-live.ts; `updateLiveTrack()` and `startLiveMode()` already implemented |
| SET-04 | Tapping a song opens PDF viewer immersively (full-screen) | `PDFViewer` component exists, renders with react-pdf; needs overlay wrapper instead of route navigation |
| SET-05 | Musician can return to setlist quickly from PDF (drawer/gesture) | Bottom bar + setlist drawer pattern; Radix Sheet/Dialog primitives available |
| SET-06 | Screen stays awake during performance mode | `useWakeLock` hook fully implemented with visibility change re-acquisition |
| SET-07 | Each musician sees songs in their instrument's key automatically | `useMusicianTransposition` hook handles full priority chain; `getTransposedKeyName` for display in list |
| PDF-03 | Monitor quick-adjust accessible from within PDF view without breaking immersion | `QuickMonitorPanel` component exists; integrate into bottom bar sheet |
| PUB-01 | Band leader can mark setlist as public | `Setlist.isPublic` field exists in data model; Firestore rules already support it |
| PUB-02 | Community members access public setlist and view PDFs without signing in | Middleware allows `/perform/*` unauthenticated; Firestore rules allow reads where `isPublic == true` |
| PUB-03 | Public view is read-only: setlist + PDFs only (no monitoring, no editing, no transposition) | Conditional rendering based on auth state; `useMonitorAccess` already returns null when no access |
| HOME-01 | Musician opens app, sees this week's service with setlist, who's playing, quick perform access | Dashboard already fetches upcoming setlists; needs simplification to single focused card |
| HOME-02 | Home screen focused on next service -- not a competing dashboard | Redesign `DashboardClient` to single HeroCard with Perform button |
</phase_requirements>

## Standard Stack

### Core (Already Installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react-pdf | 10.3.0 | PDF rendering in browser | Already used by PDFViewer; renders pages with pdfjs-dist |
| firebase | 12.9.0 | Firestore real-time subscriptions | Already used for liveState, presence, setlist data |
| zustand | 5.0.10 | Client state (music store, queue) | Already the app's state management solution |
| @radix-ui/react-dialog | 1.1.15 | Sheet/drawer overlays | Already installed; use for setlist drawer and monitor panel |
| lucide-react | 0.563.0 | Icons | Already the app's icon library |
| tailwindcss | 4.x | Styling | Already the app's CSS framework |
| next-themes | 0.4.6 | Dark mode | Already configured |

### Supporting (Already Installed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| date-fns | 4.1.0 | Date formatting for service dates | Home screen "this week's service" display |
| @tanstack/react-virtual | 3.13.18 | Virtualized lists | Only if setlist exceeds ~50 items (unlikely) |

### No New Dependencies Needed
All functionality can be built with existing installed packages. No new libraries required.

## Architecture Patterns

### Recommended Component Structure
```
src/
├── app/
│   ├── perform/
│   │   ├── page.tsx                    # Public setlist listing (PUB-01/02)
│   │   ├── setlist/[id]/page.tsx       # Redesigned performance view (SET-01 through SET-07)
│   │   └── layout.tsx                  # Existing perform layout
│   └── (main)/
│       ├── page.tsx                    # Redesigned home (HOME-01/02)
│       └── DashboardClient.tsx         # Simplified to single card
├── components/
│   ├── performance/
│   │   ├── SetlistView.tsx             # Dense scrollable setlist rows
│   │   ├── PDFOverlay.tsx              # Full-screen PDF takeover with bottom bar
│   │   ├── PerformanceBottomBar.tsx    # Persistent bar: drawer, monitor, nav
│   │   ├── SetlistDrawer.tsx           # Slide-up setlist from bottom bar
│   │   └── PositionHighlight.tsx       # Leader-driven current row highlight
│   └── home/
│       └── NextServiceCard.tsx         # Single focused card for home screen
├── hooks/
│   ├── use-wake-lock.ts                # Existing -- no changes
│   ├── use-musician-transposition.ts   # Existing -- use getTransposedKeyName for display
│   └── use-setlist-performance.ts      # NEW: orchestrates setlist state, PDF selection, position
└── lib/
    ├── setlist-live.ts                 # Existing -- liveState, presence
    └── setlist-firebase.ts             # Existing -- subscribeToSetlist, subscribeToPublicSetlists
```

### Pattern 1: In-Page PDF Overlay (Not Route Navigation)
**What:** Instead of navigating to `/perform/[id]` when tapping a song, render the PDF as a full-screen overlay on the same page. The setlist component stays mounted underneath.
**When to use:** This is the core architectural change for this phase.
**Why:** Eliminates route navigation latency, keeps setlist scroll position intact, enables the drawer to switch PDFs without round-trips.
**Example:**
```typescript
// Current (v1): navigates away
router.push(`/perform/${item.fileId}`)

// New (v2): overlay on same page
const [activeSongIndex, setActiveSongIndex] = useState<number | null>(null)
const activeSong = activeSongIndex !== null ? tracks[activeSongIndex] : null

return (
  <>
    <SetlistView tracks={tracks} onSongTap={setActiveSongIndex} />
    {activeSong && (
      <PDFOverlay
        song={activeSong}
        onClose={() => setActiveSongIndex(null)}
        onNavigate={setActiveSongIndex}
        tracks={tracks}
      />
    )}
  </>
)
```

### Pattern 2: Leader Position Sync via Firestore
**What:** Use existing `liveState.currentTrackIndex` on the setlist document for real-time position highlighting.
**When to use:** During live services when the leader has enabled live mode.
**Example:**
```typescript
// Already exists in setlist-live.ts:
// updateLiveTrack(setlistId, trackIndex, uid, displayName)
// startLiveMode(setlistId, uid, displayName)

// Subscribe to position via onSnapshot on the setlist doc
// liveState is a nested field on the setlist document
const liveState = setlistData?.liveState as LiveState | undefined
const currentIndex = liveState?.enabled ? liveState.currentTrackIndex : -1
```

### Pattern 3: Transposed Key Display in List Row
**What:** Show the transposed key inline in each song row, computed from the song's original key and the musician's profile transposition.
**When to use:** For SET-07 auto-transposition at a glance.
**Example:**
```typescript
import { getTransposedKeyName } from "@/lib/music-math"

// In the setlist row component:
const profile = useMusicianProfile() // or get from context
const defaultTransposition = profile?.defaultTransposition || 0
const transposedKey = track.key
  ? getTransposedKeyName(track.key, defaultTransposition)
  : null
// Renders e.g., "Bb (+2)" for a trumpet player looking at a song in Ab
```

### Pattern 4: Conditional Public vs Authenticated View
**What:** Same performance page renders differently based on auth state.
**When to use:** For PUB-01/02/03.
**Example:**
```typescript
const { user } = useAuth()
const isPublicView = !user

// In the setlist row: hide transposition controls for public
// In the bottom bar: hide monitor button for public
// Don't call useMusicianTransposition() for public (returns default 0)
```

### Anti-Patterns to Avoid
- **Route-based PDF navigation:** The v1 pattern of `router.push('/perform/[id]')` loses setlist scroll position and creates jarring transitions. Use overlay instead.
- **Over-rendering PDFs:** Don't pre-render all PDFs. Only render the active song's PDF. Use react-pdf's lazy loading.
- **Polling for position updates:** Use Firestore `onSnapshot` real-time subscriptions, not polling. Already established in the codebase.
- **Auto-scrolling to current position:** Explicitly decided against. Highlight only -- musicians control their own scroll.
- **Complex state management for PDF view:** Don't create a new Zustand store. Use local component state in the setlist page (`activeSongIndex`) plus existing `useMusicStore` for transposition/zoom.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PDF rendering | Custom canvas/iframe rendering | `PDFViewer` component (existing) | Already handles worker init, error states, resize, annotations |
| Key transposition display | Custom music theory math | `getTransposedKeyName` from `music-math.ts` | Already handles enharmonic spelling, semitone math |
| Monitor mixer panel | New fader UI | `QuickMonitorPanel` (existing) | Already has vertical faders, connection status, bus assignment |
| Wake lock | Custom visibility handlers | `useWakeLock` hook (existing) | Already handles re-acquisition on visibility change, cleanup |
| Transposition priority chain | Custom preference loading | `useMusicianTransposition` hook (existing) | Handles per-track, per-song, profile default priority chain |
| Real-time Firestore sync | Manual onSnapshot management | `useSafeFirestoreSync` hook (existing) | Handles cleanup, timeout, error states |
| Sheet/drawer overlays | Custom animation/positioning | Radix Dialog/Sheet primitives | Handles focus trap, escape key, overlay click, animations |
| Leader position updates | Custom WebSocket | `updateLiveTrack` from `setlist-live.ts` | Already writes to Firestore liveState atomically |

**Key insight:** This phase is primarily a UI restructuring exercise. Nearly all backend/utility code already exists. The risk is in building new code when existing hooks and components already solve the problem.

## Common Pitfalls

### Pitfall 1: PDFViewer Worker Initialization Race
**What goes wrong:** The PDF worker gets initialized multiple times or on the wrong route, causing "Worker was destroyed" errors.
**Why it happens:** PDFViewer uses pdfjs-dist which requires a web worker. If the component mounts/unmounts rapidly (e.g., switching songs in drawer), the worker can get into a bad state.
**How to avoid:** PDFViewer is already dynamically imported with `next/dynamic` SSR disabled. Keep this pattern. When switching songs, update the `url` prop rather than unmounting/remounting the component.
**Warning signs:** Console errors about "Worker was destroyed" or "Setting up fake worker."

### Pitfall 2: Firestore Permission Denied for Public Users
**What goes wrong:** Unauthenticated users get permission-denied errors when trying to read setlists.
**Why it happens:** Firestore rules require `isPublic == true` on the document. If a non-public setlist URL is shared, or if the query doesn't match the security rule index, reads fail.
**How to avoid:** The existing rule (line 84) allows reads when `resource.data.isPublic == true` OR when the user is the owner. For public access, use `subscribeToSetlist` directly -- it uses `onSnapshot` on the document, which will fail gracefully if the setlist isn't public. Show a clear "This setlist isn't public" message.
**Warning signs:** Firestore console showing permission-denied errors for anonymous users.

### Pitfall 3: Lost Scroll Position on PDF Close
**What goes wrong:** When closing the PDF overlay, the setlist scrolls back to the top.
**Why it happens:** If the overlay causes the underlying scroll container to reset (e.g., via display:none or unmounting).
**How to avoid:** Keep the setlist mounted and visible behind the overlay. Use `fixed` or `absolute` positioning for the PDF overlay so the setlist DOM isn't disturbed. Use `overflow: hidden` on body only while overlay is open.
**Warning signs:** Users complain about losing their place in long setlists.

### Pitfall 4: Transposition Computed on Every Render
**What goes wrong:** Key transposition for every song in the list is computed on each render, causing unnecessary work.
**Why it happens:** `getTransposedKeyName` is called inside the render loop for each track.
**How to avoid:** `getTransposedKeyName` is a pure function (no side effects). Memoize the computed keys with `useMemo` keyed on `tracks` and `defaultTransposition`. The computation is lightweight (string lookup), but memoization prevents unnecessary string allocations for 20+ tracks.
**Warning signs:** Sluggish scrolling on the setlist page.

### Pitfall 5: Wake Lock Not Acquired on iOS Safari
**What goes wrong:** The screen dims during performance on iPads.
**Why it happens:** iOS Safari has limitations with the Wake Lock API. Some versions don't support it, or it requires user interaction first.
**How to avoid:** The existing `useWakeLock` hook already handles the `NotAllowedError` case. Call `requestWakeLock` in response to a user gesture (e.g., when entering performance mode or tapping "Perform"). The hook already re-acquires on visibility change.
**Warning signs:** iOS users report screen dimming.

### Pitfall 6: Bottom Bar Obscuring Content
**What goes wrong:** The persistent bottom bar during PDF view covers the bottom of the PDF pages.
**Why it happens:** Fixed positioning of the bottom bar without accounting for content padding.
**How to avoid:** Add `pb-[bottom-bar-height]` to the PDF scroll container. The existing pattern in the app uses `pb-safe` and `pb-24` for bottom navigation padding.
**Warning signs:** Last page of PDF partially hidden.

## Code Examples

### Dense Setlist Row (SET-01, SET-02, SET-07)
```typescript
// Source: Adapted from existing SetlistPerformPage + TransposeTrackList patterns
import { getTransposedKeyName } from "@/lib/music-math"
import { SetlistTrack } from "@/types/models"

interface SetlistRowProps {
  track: SetlistTrack
  index: number
  isCurrentPosition: boolean  // from liveState
  defaultTransposition: number  // from musician profile
  onTap: () => void
  isPublicView: boolean
}

function SetlistRow({ track, index, isCurrentPosition, defaultTransposition, onTap, isPublicView }: SetlistRowProps) {
  const isSong = !track.type || track.type === 'song'
  const transposedKey = (!isPublicView && isSong && track.key && defaultTransposition !== 0)
    ? getTransposedKeyName(track.key, defaultTransposition)
    : null
  const displayKey = transposedKey || track.key

  return (
    <div
      role="button"
      onClick={isSong && track.fileId ? onTap : undefined}
      className={cn(
        "flex items-center gap-3 px-4 py-2",
        isCurrentPosition && "bg-violet-500/15 border-l-2 border-violet-500",
        isSong ? "cursor-pointer" : "cursor-default",
        !isSong && "opacity-60"
      )}
    >
      {isSong ? (
        // Song row: bold title, key badge, tempo, lead
        <>
          <span className="font-semibold text-base truncate flex-1">{track.title}</span>
          {displayKey && (
            <span className="font-mono text-xs px-1.5 py-0.5 bg-muted rounded">{displayKey}</span>
          )}
          {track.bpm && (
            <span className="text-xs text-muted-foreground tabular-nums">{track.bpm}</span>
          )}
          {track.leadMusician && (
            <span className="text-xs text-blue-400 truncate max-w-[60px]">{track.leadMusician}</span>
          )}
        </>
      ) : (
        // Liturgical item: quieter, just the label
        <span className="text-sm text-muted-foreground">{track.title}</span>
      )}
    </div>
  )
}
```

### PDF Overlay with Bottom Bar (SET-04, SET-05, PDF-03)
```typescript
// Source: Pattern derived from existing PerformPage + RehearsalToolbar
interface PDFOverlayProps {
  track: SetlistTrack
  tracks: SetlistTrack[]
  currentIndex: number
  onClose: () => void
  onNavigate: (index: number) => void
  isPublicView: boolean
}

function PDFOverlay({ track, tracks, currentIndex, onClose, onNavigate, isPublicView }: PDFOverlayProps) {
  const [showDrawer, setShowDrawer] = useState(false)
  const [showMonitor, setShowMonitor] = useState(false)

  // Find prev/next song indices (skip non-songs)
  const songIndices = tracks
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => (!t.type || t.type === 'song') && t.fileId)
    .map(({ i }) => i)

  const currentSongPos = songIndices.indexOf(currentIndex)
  const prevSongIndex = currentSongPos > 0 ? songIndices[currentSongPos - 1] : null
  const nextSongIndex = currentSongPos < songIndices.length - 1 ? songIndices[currentSongPos + 1] : null

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* PDF content area */}
      <div className="flex-1 overflow-auto pb-16">
        <PDFViewer url={`/api/drive/file/${track.fileId}`} trackName={track.title} />
      </div>

      {/* Persistent bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 h-14 bg-zinc-950/95 backdrop-blur border-t border-white/10 flex items-center px-3 gap-2 z-60">
        <button onClick={() => setShowDrawer(true)}>
          {/* Setlist drawer icon */}
        </button>
        {!isPublicView && (
          <button onClick={() => setShowMonitor(true)}>
            {/* Monitor icon */}
          </button>
        )}
        <span className="flex-1 text-sm font-medium truncate text-center">{track.title}</span>
        <button onClick={() => prevSongIndex !== null && onNavigate(prevSongIndex)} disabled={prevSongIndex === null}>
          {/* Prev */}
        </button>
        <button onClick={() => nextSongIndex !== null && onNavigate(nextSongIndex)} disabled={nextSongIndex === null}>
          {/* Next */}
        </button>
      </div>

      {/* Setlist drawer overlay */}
      {showDrawer && (
        <SetlistDrawer
          tracks={tracks}
          currentIndex={currentIndex}
          onSelect={(i) => { onNavigate(i); setShowDrawer(false) }}
          onClose={() => setShowDrawer(false)}
        />
      )}

      {/* Monitor panel overlay */}
      {showMonitor && !isPublicView && (
        <QuickMonitorPanel />
      )}
    </div>
  )
}
```

### Leader Position Advance (SET-03)
```typescript
// Source: Existing setlist-live.ts patterns
import { updateLiveTrack, startLiveMode, enableLiveMode } from "@/lib/setlist-live"

// For the leader: tap a row to set current position
function handleLeaderTap(index: number) {
  if (!isBandLeader) return
  updateLiveTrack(setlistId, index, user.uid, user.displayName)
}

// Or: dedicated advance buttons (Claude's discretion)
function handleAdvance() {
  const nextIndex = currentTrackIndex + 1
  if (nextIndex < tracks.length) {
    updateLiveTrack(setlistId, nextIndex, user.uid, user.displayName)
  }
}
```

### Public Setlist Landing Page (PUB-01, PUB-02)
```typescript
// Source: Existing subscribeToPublicSetlists from setlist-firebase.ts
// Route: /perform/page.tsx (public, no auth required)
import { createSetlistService } from "@/lib/setlist-firebase"

function PublicSetlistsPage() {
  const [setlists, setSetlists] = useState<Setlist[]>([])
  const service = useMemo(() => createSetlistService(), [])

  useEffect(() => {
    const unsub = service.subscribeToPublicSetlists((list) => {
      setSetlists(list)
    })
    return unsub
  }, [service])

  return (
    <div>
      {setlists.map(s => (
        <Link key={s.id} href={`/perform/setlist/${s.id}`}>
          {s.name} - {formatDate(s.date)}
        </Link>
      ))}
    </div>
  )
}
```

## State of the Art

| Old Approach (v1) | Current Approach (v2, this phase) | Impact |
|-------------------|-----------------------------------|--------|
| Route navigation to `/perform/[id]` for each PDF | In-page PDF overlay on setlist page | Eliminates navigation latency, preserves scroll |
| Section headers with collapsible groups | Single flat list, dense rows | Mirrors physical setlist, faster scanning |
| Key shown as original key only | Auto-transposed key per musician profile | Trumpet player sees Bb when original is C |
| No position tracking during service | Leader-driven liveState highlight | Band stays synchronized |
| Dashboard home with many sections | Single "next service" card | One card, one action |
| No public access | Public setlists for jam sessions | Community engagement without friction |

**Existing code to remove/modify:**
- The "Play from start" button at the bottom of the setlist page -- replaced by tap-to-open
- Section header grouping logic in `SetlistPerformPage` -- replaced by flat list
- `router.push('/perform/[id]')` navigation pattern -- replaced by in-page overlay
- Complex dashboard components -- simplified to single card (but keep components, just change rendering)

**Note on recharts:** STATE.md mentions "recharts dependency orphaned after analytics deletion -- remove when TimelineChart.tsx is deleted in Phase 3." Check if TimelineChart.tsx still exists and remove recharts if so.

## Open Questions

1. **Leader advance mechanism**
   - What we know: CONTEXT.md says "Claude's Discretion: advance mechanism (tap-to-set vs dedicated controls for leader)"
   - Options: (a) Leader taps any row to set position, (b) Dedicated prev/next buttons in a leader control bar, (c) Both
   - Recommendation: Both -- tap-to-set for jumping to any position, plus prev/next buttons for sequential advancement. The leader console (`LeaderConsole.tsx`) already exists as a reference pattern. Show leader controls only when `isBandLeader` is true.

2. **Transposed key display format**
   - What we know: `getTransposedKeyName` returns format like "Bb (+2)". CONTEXT.md leaves format to Claude's discretion.
   - Recommendation: Show just the transposed key name (e.g., "Bb") in the row badge, not the semitone offset. The offset is noise during performance. If needed, show original key in a tooltip or muted secondary text.

3. **recharts cleanup**
   - What we know: STATE.md says to remove recharts when TimelineChart.tsx is deleted in Phase 3
   - Recommendation: Include as a task in this phase -- verify if TimelineChart.tsx still exists, remove it, and uninstall recharts.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 3.2.1 |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run && npx playwright test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SET-01 | Dense row renders title, key, tempo, lead | unit | `npx vitest run src/components/performance/__tests__/setlist-row.test.tsx -x` | No -- Wave 0 |
| SET-02 | Non-song items render with quieter styling | unit | `npx vitest run src/components/performance/__tests__/setlist-row.test.tsx -x` | No -- Wave 0 |
| SET-03 | Current position highlights correct row | unit | `npx vitest run src/components/performance/__tests__/position-highlight.test.ts -x` | No -- Wave 0 |
| SET-04 | Tapping song opens PDF overlay | unit | `npx vitest run src/components/performance/__tests__/pdf-overlay.test.tsx -x` | No -- Wave 0 |
| SET-05 | Closing overlay preserves scroll position | manual-only | N/A -- requires browser interaction | N/A |
| SET-06 | Wake lock acquired on perform entry | unit | `npx vitest run src/hooks/__tests__/use-wake-lock.test.ts -x` | No -- Wave 0 |
| SET-07 | Transposed key computed correctly per profile | unit | `npx vitest run src/hooks/__tests__/use-musician-transposition.test.ts -x` | Yes |
| PDF-03 | Monitor panel accessible from PDF overlay | unit | `npx vitest run src/components/performance/__tests__/pdf-overlay.test.tsx -x` | No -- Wave 0 |
| PUB-01 | Public setlists listed without auth | unit | `npx vitest run src/components/performance/__tests__/public-setlists.test.ts -x` | No -- Wave 0 |
| PUB-02 | Public view renders without sign-in prompt | unit | `npx vitest run src/components/performance/__tests__/public-view.test.tsx -x` | No -- Wave 0 |
| PUB-03 | Public view hides monitor/transposition/editing | unit | `npx vitest run src/components/performance/__tests__/public-view.test.tsx -x` | No -- Wave 0 |
| HOME-01 | Home shows next service card with perform button | unit | `npx vitest run src/components/home/__tests__/next-service-card.test.tsx -x` | No -- Wave 0 |
| HOME-02 | Home is focused single card, not dashboard | manual-only | N/A -- visual verification | N/A |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose`
- **Per wave merge:** `npx vitest run && npx playwright test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/components/performance/__tests__/setlist-row.test.tsx` -- covers SET-01, SET-02
- [ ] `src/components/performance/__tests__/position-highlight.test.ts` -- covers SET-03
- [ ] `src/components/performance/__tests__/pdf-overlay.test.tsx` -- covers SET-04, PDF-03
- [ ] `src/components/performance/__tests__/public-view.test.tsx` -- covers PUB-02, PUB-03
- [ ] `src/components/performance/__tests__/public-setlists.test.ts` -- covers PUB-01
- [ ] `src/components/home/__tests__/next-service-card.test.tsx` -- covers HOME-01
- [ ] Test utilities for mocking Firestore subscriptions and auth context -- check if existing test patterns can be reused from monitor tests

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `src/components/music/PDFViewer.tsx` -- PDF rendering pattern
- Codebase inspection: `src/lib/setlist-live.ts` -- LiveState interface, updateLiveTrack, startLiveMode
- Codebase inspection: `src/hooks/use-wake-lock.ts` -- Wake lock implementation
- Codebase inspection: `src/hooks/use-musician-transposition.ts` -- Transposition priority chain
- Codebase inspection: `src/lib/music-math.ts` -- getTransposedKeyName utility
- Codebase inspection: `src/middleware.ts` -- Public route configuration (/perform prefix)
- Codebase inspection: `firestore.rules` -- Public read rules for isPublic setlists
- Codebase inspection: `src/lib/setlist-firebase.ts` -- subscribeToPublicSetlists, subscribeToSetlist
- Codebase inspection: `src/types/models.ts` -- SetlistTrack, Setlist, TrackType interfaces
- Codebase inspection: `src/components/monitor/QuickMonitorPanel.tsx` -- Monitor mixer component
- Codebase inspection: `src/app/perform/setlist/[id]/page.tsx` -- Current setlist page (to be redesigned)
- Codebase inspection: `src/app/perform/[id]/page.tsx` -- Current PDF viewer page (pattern reference)

### Secondary (MEDIUM confidence)
- Codebase inspection: `src/app/live/[id]/page.tsx` -- Existing live view pattern (reference for public view)
- Codebase inspection: `src/app/(main)/DashboardClient.tsx` -- Current dashboard (to be simplified)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed, no new dependencies
- Architecture: HIGH -- all building blocks exist in codebase, pattern is clear restructuring
- Pitfalls: HIGH -- based on direct inspection of existing code and established patterns
- Public access: HIGH -- middleware and Firestore rules already support it

**Research date:** 2026-03-07
**Valid until:** 2026-04-07 (stable -- no external dependency changes expected)
