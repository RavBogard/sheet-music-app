# Usability Analysis: Tablet Performance + Phone Planning

**App:** CentralReform.live — Congregational Music Platform  
**Date:** February 18, 2026  
**Analyst context:** Full codebase review of 252 source files, every user-facing component and route traced  
**Device assumptions:**  
- **Tablet on a music stand** = primary performance device (iPad, 768–1366px)  
- **Phone in hand** = planning, editing, and preparation (375–430px)  

---

## How I Audited This

I traced every user journey end-to-end across both device contexts:

**Tablet journeys:** Cold launch at the gig → tonight's setlist → performing → page turns → song navigation → mid-service jump → transpose on stage → annotate during rehearsal → monitor mix adjustment → offline fallback at a venue with no WiFi.

**Phone journeys:** Building a setlist on the couch → browsing the library → configuring keys and leads → reviewing prep status before Shabbat → checking what's coming up this week → setting up a musician profile.

For each, I examined: tap counts to primary action, gesture reliability, information visibility without interaction, real-world environmental factors (stage lighting, hands on instruments, time pressure), and how the app compares to professional music stand apps (forScore, OnSong, BandHelper).

---

## Recommendation 1: One-Tap Gig Launch

### Context: Tablet at the music stand, 2 minutes before downbeat

**The Problem**

The single most important moment in this app's life cycle — a musician opens it on their tablet at the music stand as the service is about to begin — requires three taps and a menu scan to reach the first chart.

Current flow:
1. Open app → Dashboard with hero card showing tonight's setlist
2. Tap hero card → Opens the **setlist editor** (not performance mode)
3. Tap the `⋮` overflow menu → Scan a 12-item dropdown
4. Tap "Perform" → Finally see the first chart

The hero card navigates to the editor because `navigateToSetlist()` always pushes to `/setlists/${id}`. There is no direct path from the dashboard to performance mode. The "Perform" action is the first item in an overflow menu, but it shares visual weight with "Print Gig Packets," "Publish & Notify," "Duplicate Setlist," "Select Items," "Assign Rabbi," "Make Public," "Version History," "Download for Offline," "AI Assistant," "Go Live," and "Delete Setlist."

A senior musician arriving late to a gig, placing their iPad on the stand, and tapping the one obvious thing — the hero card — lands in an editing interface. Every Friday night.

**The Recommendation**

When a setlist's event is imminent (within 4 hours — the same window the hero card already uses for its live countdown), **change the hero card's primary action to launch performance mode**. Show a secondary "Edit" link for leaders who need it.

Concretely, the hero card should render a large, unmistakable "GO" or "▶ Perform" button that calls `router.push(`/perform/setlist/${id}`)` (or the queue-based equivalent per Recommendation 2). The current tap-anywhere-to-edit behavior moves to a smaller "Edit setlist" text link below the title.

For non-imminent setlists (more than 4 hours out), the current behavior is fine — editing is the appropriate action when you're planning days ahead.

**Implementation**

```
// In HeroCard component, ~line 400 of page.tsx
const isImminent = eventDate && (eventDate.getTime() - Date.now()) < 4 * 60 * 60 * 1000

// Primary action changes based on imminence
const handlePrimary = isImminent 
  ? () => launchPerformMode(setlist)
  : () => navigateToSetlist(setlist)
```

Add `launchPerformMode` that builds the playback queue from the setlist's tracks and navigates to `/perform/[firstTrack.fileId]` with the queue set. This is the same thing the overflow menu's "Perform" does today — just surfaced directly.

On the hero card itself, when imminent:
- The card's main tap area → perform mode
- A small "Edit" link in the footer → editor (for leaders)
- Visual treatment: the "▶" icon or a "PERFORM" label makes the action unmistakable

**Effort:** Low — routing logic exists, just needs to be surfaced.  
**Impact:** Eliminates friction at the most critical moment. Every musician, every service.

---

## Recommendation 2: Unify the Two Performance Experiences

### Context: Tablet + phone — anyone who performs

**The Problem**

There are two completely different performance implementations that musicians can land in depending on how they enter:

**Experience A** (`/perform/[id]`, queue-based):
- PerformerView + PerformanceToolbar (bottom, auto-hiding, two rows on tablet-portrait)
- Horizontal swipe between songs (60px + velocity + angle checks)
- Keyboard/foot pedal support: PageDown scrolls 85%, then advances song at bottom
- Full toolkit: transpose, annotate, metronome, monitor mix, setlist drawer
- Wake lock active
- Live notifications from leader
- Prefetches next 3 songs in queue

**Experience B** (`/perform/setlist/[id]`, index-based):
- Fixed nav bar at the **top** of the screen
- Different swipe handling (50px threshold, no velocity check)
- Keyboard: ArrowRight/Space = next **track** (not page scroll). No PageDown/PageUp handling
- No transpose, no annotation, no metronome, no monitor, no prefetch
- ServiceFlowCard rendering for non-song items
- Loads directly from Firestore (no queue abstraction)
- Wake lock active

The same setlist, entered two different ways, gives dramatically different capabilities. Experience B — which is what you get from the overflow menu's "Perform" button — is the stripped-down one. A professional musician who enters via that path has no access to transpose, annotation, or foot pedal page scrolling.

Critically for tablet: **Experience B doesn't handle PageDown/PageUp at all**, meaning Bluetooth foot pedals (AirTurn, PageFlip, iRig BlueTurn) won't work for page turns within a chart. The foot pedal only advances to the next track. For a multi-page chart on a tablet, this is a showstopper.

**The Recommendation**

Eliminate `/perform/setlist/[id]` as a separate implementation. Convert it to a thin loader:

1. Fetch the setlist from Firestore
2. Build a `QueueItem[]` array (which it already does for its ServiceFlowCard rendering)
3. Call `setQueue(queue, 0, `/setlists/${setlistId}`)` (same as SetlistDrawer already does)
4. Navigate to `/perform/${queue[0].fileId}`

Experience A's queue-based PerformerView already has the infrastructure to handle everything Experience B does — it just needs to render ServiceFlowCard for non-song queue items (track types like "reading," "prayer," "transition"). The queue's `trackType` field already carries this data.

One performance experience. One set of gestures. One toolbar. One foot pedal behavior. Always.

**Implementation**

Convert `src/app/perform/setlist/[id]/page.tsx` from a 200-line performance view into a ~40-line redirect:

```tsx
export default function SetlistPerformPage() {
  const { id } = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const { setQueue } = useMusicStore()

  useEffect(() => {
    async function load() {
      const snap = await getDoc(doc(db, 'setlists', id))
      const tracks = snap.data()?.tracks || []
      const queue = tracks.filter(t => t.fileId).map(toQueueItem)
      if (queue.length > 0) {
        setQueue(queue, 0, `/setlists/${id}`)
        router.replace(`/perform/${queue[0].fileId}`)
      }
    }
    if (user) load()
  }, [id, user])

  return <LoadingSpinner />
}
```

Then extend PerformerView to handle `trackType !== 'song'` queue items by rendering `ServiceFlowCard` instead of PDFViewer/SmartScoreViewer when the current queue item is a flow element.

**Effort:** Medium — mostly deletion and a small extension to PerformerView.  
**Impact:** Fixes foot pedal support, gives all musicians full tools regardless of entry path, halves the performance code surface area. A Meta engineer would flag the duplication immediately.

---

## Recommendation 3: Instant Page Turns for Foot Pedals

### Context: Tablet on music stand with Bluetooth foot pedal

**The Problem**

Professional musicians use Bluetooth foot pedals (AirTurn PED, PageFlip Firefly, iRig BlueTurn) that send keyboard events — typically PageDown/PageUp or arrow keys. The app handles these correctly in PerformerView... almost.

The scroll behavior is `{ behavior: 'smooth' }`, which produces an animated scroll over ~300-500ms. During that animation, the chart is in motion and unreadable. For a musician sight-reading on stage, that half-second of unreadable chart is the difference between hitting the next phrase and losing their place.

Professional music stand apps (forScore, OnSong) use instant page snapping — the new content appears immediately with no animation. Some offer a brief crossfade, but the content is never in motion.

Additionally, the scroll distance is `clientHeight * 0.85` (85% of viewport). This "overlap scroll" is fine for reading continuity on multi-page prose, but on a tablet where one PDF page roughly equals one screen height, it creates a confusing half-state: you see the bottom 15% of the current page and the top 85% of the next, and it's not clear which page you're on. Music charts should snap to page boundaries.

**The Recommendation**

Add a "page snap" scroll mode that:

1. **Detects page boundaries** from the PDF renderer. PDFPageWrapper already renders each page as a separate `<div>` with measurable heights. Calculate the scroll positions where each page starts.
2. **Snaps to the nearest page** on foot pedal press (PageDown/PageUp). Instead of scrolling 85%, calculate the next page boundary and scroll there instantly.
3. **Uses `behavior: 'instant'`** (or `behavior: 'auto'` which defaults to instant) instead of `'smooth'` for pedal-triggered page turns.
4. **Keeps smooth scroll for manual touch scrolling** — only pedal/keyboard triggers get instant behavior.

When the user is on the last page and presses the pedal, the existing "advance to next song" behavior fires. This already works correctly.

Optionally, offer a "half-page turn" mode (common in forScore) where each pedal press scrolls exactly 50% of viewport — this lets musicians see the bottom of the current system and the top of the next, which is how experienced sight-readers prefer to turn pages.

**Implementation**

In PerformerView's keyboard handler (~line 78):

```tsx
case 'PageDown': {
  e.preventDefault()
  const el = viewRef.current
  if (!el) break
  
  const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 20
  if (atBottom && playbackQueue.length > 1) {
    const next = nextSong()
    if (next) router.push(`/perform/${next.fileId}`)
  } else {
    // Snap to next page boundary instead of 85% scroll
    const pages = el.querySelectorAll('.pdf-page')
    const currentScroll = el.scrollTop
    for (const page of pages) {
      const pageTop = (page as HTMLElement).offsetTop
      if (pageTop > currentScroll + 10) {
        el.scrollTo({ top: pageTop, behavior: 'instant' })
        break
      }
    }
  }
  break
}
```

The `.pdf-page` class already exists on every rendered page (from react-pdf's Page component). This gives us page-boundary snapping for free.

**Effort:** Low — ~20 lines of code changed in one file.  
**Impact:** Critical for any musician using a foot pedal. This is table-stakes for a professional music stand app. The Brothers Lazaroff would notice this immediately.

---

## Recommendation 4: Always-Visible Song Context on Tablet

### Context: Tablet on music stand, mid-performance

**The Problem**

When the performance toolbar auto-hides (after 8 seconds of no interaction), the tablet shows a full-screen chart with zero context: no song name, no position in the setlist, no key indicator, nothing. The musician is staring at a PDF on a dark background.

This is actually the *right* design for maximizing chart readability — you don't want chrome eating into the chart area on a music stand. But two pieces of information are essential at a glance:

1. **What song am I on?** — When the rabbi says "let's skip ahead to the closing," the musician needs to instantly know where they are in the setlist to calculate how far to jump.
2. **What key am I playing in?** — If the chart is transposed, the musician needs ongoing confirmation. "Am I seeing this in G or is it still in E?" is a real thought during performance.

Currently, getting either answer requires: tap to reveal toolbar → read the song navigation center display → process. The tap itself can trigger an accidental scroll or swipe.

**The Recommendation**

Add a minimal, non-interactive "status strip" that persists even when the toolbar is hidden. This is *not* a mini-toolbar with buttons — it's pure information, designed to be read in a <1 second glance without any interaction.

Position: top-right corner of the screen, overlaying the chart.  
Content: `"3/12 · Shalom Rav"` and if transposed, `"in G"`.  
Styling: Semi-transparent dark pill (`bg-black/30 backdrop-blur-sm`), small text (`text-xs`), high contrast white text. No tap handlers. No buttons. Just information.

On tablet in portrait (~820px wide), this takes up maybe 200px × 24px in the corner — negligible impact on chart readability. It's the equivalent of the song number written in pencil at the top of a paper chart.

**Implementation**

New component `PerformanceStatusStrip` (~30 lines):

```tsx
function PerformanceStatusStrip() {
  const { playbackQueue, queueIndex, transposition } = useMusicStore()
  const current = playbackQueue[queueIndex]
  if (!current || playbackQueue.length <= 1) return null

  return (
    <div className="fixed top-3 right-3 z-40 pointer-events-none
      bg-black/30 backdrop-blur-sm rounded-full px-3 py-1 
      flex items-center gap-2 text-white/70 text-xs font-medium">
      <span>{queueIndex + 1}/{playbackQueue.length}</span>
      <span className="truncate max-w-[180px]">{current.name}</span>
      {current.key && transposition !== 0 && (
        <span className="text-purple-300">in {current.key}</span>
      )}
    </div>
  )
}
```

Rendered in PerformerView, always visible, independent of toolbar state. `pointer-events-none` ensures it never interferes with tap/swipe gestures.

**Effort:** Very low — a single new component, ~30 lines.  
**Impact:** Solves the "where am I?" problem without sacrificing chart area. Professional musicians will appreciate this — it's how they think about their music stand.

---

## Recommendation 5: Wake Lock Recovery and Screen Reliability

### Context: Tablet on music stand, during a 90-minute service

**The Problem**

The wake lock implementation has a gap. The `useWakeLock` hook acquires a `WakeLockSentinel` on mount, but the visibility change handler (line 53) has a placeholder comment and doesn't actually re-acquire:

```typescript
if (document.visibilityState === 'visible' && !wakeLock) {
    // Optionally re-acquire if it was supposed to be locked
    // For now, we leave it manual or controlled by the component
}
```

When the Wake Lock API releases the sentinel (which happens when the tab/app loses focus — e.g., the musician briefly switches to check a text, or iOS interrupts with a notification), returning to the app leaves the screen unprotected. The tablet can go dark mid-service.

This is not theoretical. During a 90-minute Shabbat morning service, iOS will almost certainly trigger at least one interruption (Bluetooth notification, low battery alert, an incoming call dismissed). Each one silently kills the wake lock.

**The Recommendation**

Implement proper wake lock recovery:

```typescript
useEffect(() => {
    const handleVisibilityChange = async () => {
        if (document.visibilityState === 'visible') {
            try {
                const lock = await navigator.wakeLock.request('screen')
                setWakeLock(lock)
                setIsLocked(true)
                lock.addEventListener('release', () => {
                    setIsLocked(false)
                    setWakeLock(null)
                })
            } catch (err) {
                // Low battery or other system restriction — expected
            }
        }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
}, []) // No dependency on wakeLock — always try to re-acquire
```

**Effort:** Very low — 10 lines of code in `use-wake-lock.ts`.  
**Impact:** Prevents the "my screen went dark during the Torah service" scenario. This is a reliability fix, not a feature.

---

## Recommendation 6: Redesign the Setlist Drawer for Performance Navigation

### Context: Tablet on music stand, rabbi skips ahead

**The Problem**

Mid-service, the rabbi decides to skip a reading and go straight to the closing songs. The musician needs to jump from song 5 to song 12. Current flow:

1. Tap the screen to reveal the toolbar (might accidentally scroll)
2. Find and tap the setlist drawer icon (bottom-right, 40×40px)
3. Wait for the 80vh bottom sheet animation
4. Scroll through a flat, unsectioned list of 15-25 items (songs + readings + prayers all mixed)
5. Find "Oseh Shalom" among them
6. Tap to navigate
7. Sheet animates closed

That's a lot of interaction for a time-critical moment. Worse, the setlist drawer renders every item identically — numbered circles with titles. The section headers from the editor (OPENING, TORAH SERVICE, CLOSING) aren't carried through. So the musician can't use spatial memory ("the closing songs are in the third group") — they have to read every title.

**The Recommendation**

Redesign the performance-mode setlist drawer with three improvements:

**A. Section grouping.** Render `header`-type tracks as visual section dividers in the drawer, not as tappable items. This gives instant spatial structure: OPENING → 3 songs → TORAH SERVICE → 2 songs + readings → CLOSING → 4 songs.

**B. Smart initial scroll position.** Auto-scroll to the current song and center it, so the musician immediately sees context: what just happened, where they are, what's coming next. Currently the drawer opens scrolled to the top regardless of position.

**C. Quick jump by section.** At the top of the drawer, show section tabs (one per header): tapping "CLOSING" instantly scrolls to that section. For a musician who knows "I need to jump to the closing," this is one tap instead of scrolling through the whole list.

**Implementation**

In `SetlistDrawer.tsx`, when rendering the queue in non-public-picker mode:

```tsx
// Group tracks by preceding header
const sections = groupBySections(playbackQueue)

// Render with section headers
{sections.map(section => (
  <div key={section.label}>
    {section.label && (
      <div className="sticky top-0 bg-background/90 backdrop-blur-sm px-4 py-2 
        text-xs font-bold uppercase tracking-wider text-muted-foreground border-b border-border/50">
        {section.label}
      </div>
    )}
    {section.tracks.map((track, index) => (
      // ... existing track button rendering
    ))}
  </div>
))}
```

Add a ref on the current-song element and call `scrollIntoView({ block: 'center' })` in a `useEffect` when the sheet opens.

For section quick-jump, render a horizontal chip bar at the top of the sheet:
```tsx
<div className="flex gap-2 px-4 py-2 overflow-x-auto border-b border-border">
  {sections.filter(s => s.label).map(s => (
    <button onClick={() => scrollToSection(s.label)} 
      className="shrink-0 px-3 py-1 rounded-full text-xs bg-muted">
      {s.label}
    </button>
  ))}
</div>
```

**Effort:** Medium — mostly rendering changes in SetlistDrawer, plus a `groupBySections` utility.  
**Impact:** Transforms the drawer from a flat list into a structured navigation tool. The section grouping alone makes mid-service jumps 2-3x faster.

---

## Recommendation 7: Library Filters for Setlist Planning

### Context: Phone on the couch, building next week's setlist

**The Problem**

Building a setlist starts with song selection — "what should we sing this Shabbat?" The library has 400+ songs with rich metadata already present: key, BPM, topics (healing, gratitude, Shabbat, High Holidays), last-used date, total usage count, and offline status. But the only way to find songs is a text search box.

A music director thinking "I need an upbeat song in D that we haven't played recently" has to: search by name (if they remember one), scroll through results, visually spot the key badge, and mentally recall when they last used it. The `usageMap` data loads per row but isn't filterable.

The metadata is there. The UI just doesn't expose it as filters.

**The Recommendation**

Add a horizontal filter chip bar below the search input in `SongChartsLibrary`. Tapping a chip opens a compact picker:

**Key filter:** A circle-of-fifths grid (musically intuitive, not alphabetical). Tap C, D, G to show only songs in those keys. Multi-select. This is the most common filter for musicians: "I need something in D because the guitar is already capoed there."

**Topic filter:** Chips derived from existing `metadata.topics` across the library. Deduplicated and sorted by frequency. "Shabbat," "Healing," "Gratitude," "High Holidays," "Israel," etc. This directly supports the creative act of liturgical programming.

**Recency filter:** Three options: "Played recently" (used in last 30 days), "Not played in 60+ days" (fresh repertoire), "Never played" (new material). Uses the `usageMap` data that already loads.

Active filters show as filled chips with ×. Filters combine with AND logic. Persist in session storage so navigating to a chart and back doesn't reset them.

This also benefits the `AddSongsModal` in the setlist editor — the same filter component should be usable there. Currently the AddSongsModal has only a search box and folder navigation, which is the same limitation.

**Implementation**

New `LibraryFilters` component:
- Rendered between search input and breadcrumbs in `SongChartsLibrary`
- Filter state as local state or in `useLibraryStore`
- Client-side filtering on `displayedFiles` (no API changes needed)
- Key filter: render 12 buttons in circle-of-fifths order with major/minor toggle
- Topic filter: `allFiles.flatMap(f => f.metadata?.topics || [])` → deduplicate → sort by count
- Recency filter: compare against `usageMap` entries

Extract as a reusable component so `AddSongsModal` can also use it.

**Effort:** Medium.  
**Impact:** Transforms song discovery from "I know the name" to "I know what I need." This is the creative tool that music directors actually want.

---

## Recommendation 8: Simplify the Key/Transpose Editing UX

### Context: Phone, editing a setlist track

**The Problem**

The TrackSheet presents transposition as three separate, interconnected controls:

1. **Chart Key** — the native key from the library ("what key is the PDF in"). Read-only, with a tiny pencil icon to override.
2. **Play In** — the setlist key ("what key we perform it in"). A KeyPicker dropdown.
3. **Transpose** — a stepper from -11 to +11 semitones. Has its own Reset button.

These three controls interact bidirectionally:
- Changing "Play In" auto-calculates the Transpose value from Chart Key
- Changing Transpose auto-derives the "Play In" display from Chart Key
- Overriding Chart Key changes the meaning of Transpose
- If there's no Chart Key, the Transpose stepper and Play In become independent

A musician thinks: "We need this in G instead of E." They don't think in separate concepts of "chart key," "setlist key," and "semitone offset." The current UI forces users to understand the internal data model. On a phone screen, these three sections with labels, inputs, and contextual text take up significant vertical space for what is fundamentally a single decision.

**The Recommendation**

Collapse to one primary control with smart context:

**Primary:** "Key" — a single `KeyPicker` showing the target key for this setlist slot. This is what the musician cares about. Pick G, done.

**Auto-context:** Below the picker, a single line: `Chart is in E · transposing +3`. This is derived automatically and is informational — not interactive. It tells the musician "yes, I know the chart is written in E, and I'm transposing 3 semitones to get you to G."

**Expandable advanced:** A "Manual" link that reveals the native key override and semitone stepper. This serves edge cases: charts where AI key detection got it wrong, or musicians who think in semitones rather than keys.

90% of interactions become: tap Key field → select G from grid → done. One tap, one decision.

**Implementation**

Refactor the key/transpose section of `TrackSheet` into a `SimpleKeyControl` component:

```tsx
function SimpleKeyControl({ nativeKey, currentKey, onChange, onNativeKeyOverride }) {
  const [showAdvanced, setShowAdvanced] = useState(false)
  
  return (
    <div className="space-y-2">
      <Label>Key</Label>
      <KeyPicker value={currentKey} onChange={onChange} />
      {nativeKey && currentKey && nativeKey !== currentKey && (
        <p className="text-xs text-muted-foreground">
          Chart is in {nativeKey} · transposing {calculateSemitones(nativeKey, currentKey) > 0 ? '+' : ''}
          {calculateSemitones(nativeKey, currentKey)}
        </p>
      )}
      {showAdvanced ? (
        <AdvancedTransposeControls ... />
      ) : (
        <button onClick={() => setShowAdvanced(true)} className="text-xs text-muted-foreground">
          Manual override
        </button>
      )}
    </div>
  )
}
```

**Effort:** Low — UI refactor of one section within TrackSheet.  
**Impact:** Reduces cognitive load for every track edit. Makes the app immediately intuitive for new musicians.

---

## Recommendation 9: Live Follow Mode for Bands

### Context: Tablet, band gig with multiple musicians

**The Problem**

The Live Sync feature broadcasts the leader's current track index via Firestore, and followers see a notification toast: "Daniel moved to: Oseh Shalom — tap to jump." The notification appears for 6 seconds and requires an active tap to follow.

For a congregational setting where musicians move at their own pace through a liturgical flow, this opt-in model makes sense. But for a band gig — where the bandleader calls songs and everyone needs to be on the same chart simultaneously — the tap-to-follow model creates unnecessary friction. Every song change requires every band member to look away from their chart, read the notification, and tap it. Multiply by 15 songs and 4 band members, that's 60 interruptions per set.

Professional band apps (BandHelper, Setlist Live) offer an "auto-follow" mode where the follower's display automatically advances when the leader moves. This is what bands expect.

**The Recommendation**

Add a "Follow" toggle to the Live Sync system. When enabled:

- The follower's chart automatically advances to match the leader's position. No tap required.
- A brief toast confirms the advance: "→ Oseh Shalom" (1.5 seconds, non-interactive, smaller than current notification).
- The follower can temporarily "un-follow" by manually navigating to a different song (e.g., to review an upcoming chart). A small "Following [Leader Name]" indicator shows in the status strip (Rec 4), and tapping it re-syncs.
- If the follower is mid-scroll within a chart when the leader advances, the advance happens with a brief delay (1 second) to avoid jarring mid-read jumps.

The existing opt-in notification remains the default. "Auto-follow" is a toggle in the setlist drawer or the Live controls.

**Implementation**

Extend `LiveNotification` with an `autoFollow` state (stored in the music store or a dedicated live-sync store):

```tsx
// In LiveNotification
useEffect(() => {
  if (!liveState?.enabled || !autoFollow) return
  if (newIndex !== queueIndex && playbackQueue[newIndex]) {
    // Auto-navigate after brief delay
    const timer = setTimeout(() => {
      router.push(`/perform/${playbackQueue[newIndex].fileId}`)
    }, isScrolling ? 1000 : 200)
    return () => clearTimeout(timer)
  }
}, [liveState?.currentTrackIndex])
```

Add the toggle to `SetlistDrawer` when live mode is detected:
```tsx
{liveState?.enabled && (
  <div className="flex items-center justify-between px-4 py-2 border-b border-border">
    <span className="text-sm">Auto-follow leader</span>
    <Switch checked={autoFollow} onCheckedChange={setAutoFollow} />
  </div>
)}
```

**Effort:** Medium — extends existing live sync infrastructure.  
**Impact:** Makes CentralReform.live viable as a band performance tool, not just a congregational one. This is the feature that would make the Brothers Lazaroff say "we could actually use this for our gigs."

---

## Recommendation 10: Offline Confidence at the Venue

### Context: Tablet on music stand, venue WiFi is unreliable

**The Problem**

The offline infrastructure is genuinely impressive — IndexedDB with LRU eviction, background prefetching, service worker caching, typed schemas with versioned migrations. But the user-facing experience doesn't communicate offline state effectively, and the performance layout (`/perform/layout.tsx`) doesn't include the `OfflineIndicator` at all.

Specific gaps:

1. **Performance mode has zero offline indication.** The `OfflineIndicator` component lives in `(main)/layout.tsx` but not in `perform/layout.tsx`. If WiFi drops at the venue, the musician has no idea whether their charts are loading from cache or failing.

2. **Pre-service prefetch is silent.** `BackgroundPrefetcher` downloads charts ahead of time but shows no progress. A musician can't tell if Friday night's charts are cached and ready.

3. **Download-for-offline is fire-and-forget.** The overflow menu item "Download for Offline" triggers a download but shows no progress and requires reopening the menu to check status (which then says "Offline Ready" or nothing).

4. **The library's offline indicator is tiny.** A 12×12px `CloudOff` icon on each cached file row. On a phone screen, these are nearly invisible.

For a venue setting, confidence matters as much as capability. A musician who doesn't *know* they're offline-safe will worry about it all service.

**The Recommendation**

**A. Add offline indication to performance mode.** Include a connection-aware indicator in `perform/layout.tsx`. When offline, show a thin, non-intrusive banner at the very top: "Offline · charts from cache" in green (if all cached) or amber (if some missing). This reassures rather than alarms. When online, show nothing.

**B. Pre-gig readiness check.** On the dashboard hero card for tonight's setlist, add a small indicator: "✓ All 8 charts cached" or "⚠ 2 charts not cached — tap to download." This runs the same `isFileOffline` check that `UpcomingSetlistCard` already does but surfaces it more prominently.

**C. Download progress in the editor.** When "Download for Offline" is triggered, show a progress toast: "Downloading 3/8 charts..." → "All charts cached ✓". Use the existing `toast` system with `toast.loading()` and `toast.success()`.

**D. Auto-prefetch before service.** In `BackgroundPrefetcher`, if an upcoming setlist's event time is within 2 hours and the device is on WiFi, automatically trigger a prefetch of any uncached charts. This is the "it just works" behavior that builds trust.

**Implementation**

A: Add `<OfflineIndicator variant="performance" />` to `perform/layout.tsx`. The "performance" variant renders as a top banner instead of a bottom notification.

B: Extend the `UpcomingSetlistCard`'s existing `offlineStatus` state. Instead of showing the small text in the card footer, surface it in the hero card more prominently when status is not "full."

C: Modify the download handler in `SetlistEditorV2` / `OverflowMenu` to use progressive toasts. The `useOffline().downloadSetlist()` function already exists — wrap it with toast progress tracking.

D: In `BackgroundPrefetcher`, add a time-based trigger:
```tsx
useEffect(() => {
  const checkInterval = setInterval(async () => {
    const upcoming = getUpcomingSetlists()  // within 2 hours
    for (const setlist of upcoming) {
      const uncached = await getUncachedFileIds(setlist.tracks)
      if (uncached.length > 0 && navigator.onLine) {
        await prefetchFiles(uncached)
      }
    }
  }, 5 * 60 * 1000)  // Check every 5 minutes
  return () => clearInterval(checkInterval)
}, [])
```

**Effort:** Medium across four related changes.  
**Impact:** Transforms offline from a hidden safety net into a visible feature that builds confidence. The auto-prefetch prevents the "oh no, my charts won't load" panic moment that can happen at any venue.

---

## Priority and Sequencing Plan

### Phase 1: Gig-Ready (Ship this week)

These are low-effort, high-impact changes that make the tablet performance experience solid for real gigs immediately.

| # | Recommendation | Effort | What It Fixes |
|---|---------------|--------|---------------|
| 1 | One-tap gig launch | ~2 hours | 3-tap friction to start performing |
| 4 | Always-visible song context | ~1 hour | "Where am I?" during performance |
| 5 | Wake lock recovery | ~30 min | Screen going dark mid-service |
| 3 | Instant page turns | ~2 hours | Foot pedal usability for pros |

**Total: ~1 day of work. Immediately improves every tablet performance session.**

### Phase 2: Professional Polish (Ship within 2 weeks)

These reshape the core experience for serious musicians and bands.

| # | Recommendation | Effort | What It Fixes |
|---|---------------|--------|---------------|
| 2 | Unify performance modes | ~1 day | Two divergent UIs, broken foot pedals in one path |
| 6 | Redesign setlist drawer | ~1 day | Flat list with no structure for mid-service jumps |
| 8 | Simplify key/transpose | ~3 hours | Confusing 3-control UI for a single decision |

**Total: ~2.5 days. After this, the performance experience is ready for professional musicians.**

### Phase 3: Platform Growth (Ship within a month)

These make the planning/editing experience excellent on phones and add band-specific features.

| # | Recommendation | Effort | What It Fixes |
|---|---------------|--------|---------------|
| 7 | Library filters | ~2 days | No way to browse by key, topic, recency |
| 9 | Live follow mode | ~2 days | Manual tap-to-follow for every song change in a band |
| 10 | Offline confidence | ~2 days | Users can't tell if they're offline-safe |

**Total: ~6 days. After this, the app serves both congregational and professional band use cases.**

---

## What a Senior Engineer Will See

The recommendations above are ordered by user impact, but here's what a Meta-level engineer reviewing the PR sequence will appreciate:

**Phase 1 commits are surgical.** Four small, well-scoped changes. No refactors. No new abstractions. Each one has a clear before/after and is independently shippable. The wake lock fix is literally 10 lines. The status strip is a single new component with no dependencies.

**Phase 2's unification (Rec 2) is the big architectural win.** Deleting `/perform/setlist/[id]/page.tsx` (200 lines) and replacing it with a 40-line redirect eliminates an entire class of bugs (inconsistent behavior between entry paths). It's the kind of change a senior engineer loves to review: net negative lines, increased consistency, clearer mental model.

**Phase 3 introduces new capabilities without new complexity.** Library filters are client-side (no API changes). Live follow mode extends existing Firestore listeners. Offline confidence surfaces data the system already tracks. None of these require schema migrations, new services, or infrastructure changes.

**What's *not* in this plan** is as important as what is. I'm not recommending: a bottom navigation redesign, a new component library, a state management migration, or any backend changes. The architecture is sound. These recommendations work *with* the existing patterns, not against them.

---

## What Professional Musicians Will Feel

After Phase 1 + 2, a musician using this at a gig will experience:

1. **Open the app on their iPad.** The hero card says "Shabbat Evening · starts in 20 min." They tap "Perform." First chart appears instantly.

2. **They play through the opening songs.** Foot pedal taps advance pages instantly — no scroll animation, just snap. At the bottom of a chart, the pedal advances to the next song. A small status strip in the corner says "3/12 · Mi Chamocha · in G."

3. **The rabbi skips a reading.** The musician opens the setlist drawer. It shows sections: OPENING → TORAH SERVICE → CLOSING. They tap "CLOSING" and see the closing songs immediately. One more tap and they're on Oseh Shalom.

4. **A band member has auto-follow on.** When the leader advances, their iPad switches to the right chart automatically. A brief "→ Oseh Shalom" confirms the transition.

5. **The screen never goes dark.** Wake lock recovers automatically. The tablet stays lit for the full 90-minute service.

That's the experience of an app that respects musicians' craft and understands that on stage, every second and every tap counts.
