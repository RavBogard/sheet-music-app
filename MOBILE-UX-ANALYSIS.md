# Mobile-First Usability Analysis

**App:** CentralReform.live — Congregational Music Platform  
**Date:** February 18, 2026  
**Scope:** Every user-facing flow traced on mobile (375px viewport, iPhone-class device)

---

## Methodology

I walked every user journey on mobile: cold launch → dashboard → setlist browsing → setlist editing → chart performance → library search → monitor control → settings. For each, I examined touch targets, navigation depth, gesture conflicts, information density, and real-world musician scenarios (stage lighting, time pressure, one-handed use).

---

## Recommendation 1: Surface "Perform" as a Primary Action, Not an Overflow Item

**The Problem**

The single most important action in this app — performing a setlist during a live service — is buried behind a three-dot overflow menu. A musician opens the setlist editor, taps `⋮`, scans a 12-item dropdown, and finds "Perform" as the first item.

On mobile during a service, this is the equivalent of hiding the "Play" button inside a settings menu.

The flow today: Dashboard → Tap setlist card → Opens *editor* → Tap `⋮` → Tap "Perform" = **3 taps, 1 cognitive scan** to reach the primary use case.

Worse: the Dashboard hero card ("Tonight's Setlist") navigates to the *editor*, not performance mode. A musician opening the app 2 minutes before downbeat wants to be performing in one tap.

**The Recommendation**

Add a prominent, always-visible "Perform" FAB or sticky button to the setlist editor. It should be visually dominant — larger than any other element, always accessible without scrolling or menu diving.

On the Dashboard hero card, add a direct "Perform" action alongside the current tap-to-edit behavior. Consider making "Perform" the primary tap and "Edit" the secondary action.

**Implementation Scope**

- Add a floating action button to `SetlistEditorV2` (outside `AddBar`, visually prominent, perhaps bottom-right corner)
- Split the hero card tap target: left side opens editor, right side or explicit button enters perform mode
- When there's an imminent setlist (within 2 hours), consider making the entire hero card tap go to perform mode with an "Edit" link as secondary

**Impact:** Eliminates the most critical friction point in the app. Every user, every service, every week.

---

## Recommendation 2: Unify the Two Divergent Performance Experiences

**The Problem**

There are two completely different performance UIs that users can land in depending on how they enter:

1. **`/perform/[id]`** (queue-based): PerformerView + PerformanceToolbar at the bottom. Auto-hiding toolbar on 8s timer. Horizontal swipe navigation (60px threshold + velocity check). Tap-to-toggle bars. Full transpose/annotate/metronome/monitor toolkit.

2. **`/perform/setlist/[id]`** (index-based): Fixed nav bar at the *top*. Swipe navigation (50px threshold, no velocity check). No transpose controls. No annotation. No metronome. No monitor access. ServiceFlowCard for non-song items. Loads from Firestore directly rather than queue.

A musician who enters via the setlist editor's overflow menu → "Perform" gets experience #1 (queue-based). A musician who enters via `SetlistDrawer` in an empty perform view gets experience #1. But the setlist-specific URL `/perform/setlist/[id]` gives a stripped-down experience #2.

This means the same setlist, accessed two different ways, provides dramatically different capabilities.

**The Recommendation**

Eliminate `/perform/setlist/[id]` as a separate implementation. Instead, have it build the queue and redirect to the standard queue-based performance view. The queue-based flow already handles ServiceFlowCard rendering (non-song items show as interstitial cards between charts). If it doesn't fully yet, extend it.

One performance experience. One set of gestures. One toolbar. Always.

**Implementation Scope**

- Convert `perform/setlist/[id]/page.tsx` to a "loader" that fetches the setlist, builds the queue, calls `setQueue()`, and redirects to `/perform/[firstTrack.fileId]`
- Ensure `PerformerView` handles `trackType !== 'song'` items by rendering `ServiceFlowCard` inline (it may already via the queue's `trackType` field)
- Remove the duplicate swipe/keyboard handlers
- Remove the duplicate nav bar

**Impact:** Eliminates user confusion, halves the performance-mode code surface, ensures all musicians always have access to transpose/annotate/metronome regardless of entry path.

---

## Recommendation 3: Fix iPhone Safe Area and Touch Target Compliance

**The Problem**

The PerformanceToolbar — the most-used mobile surface in the app — has two critical accessibility failures:

**No safe-area-inset-bottom.** On any iPhone X or later (which is the vast majority of iPhones in use), the home indicator overlaps the bottom row of the toolbar. The Home button (bottom-left) and Setlist Drawer button (bottom-right) are partially obscured by the system gesture zone. The MobileTabBar correctly uses `pb-safe`, but the PerformanceToolbar does not. Neither does the AddBar in the setlist editor, nor the AnnotationToolbar (which uses `safe-area-bottom` as a class but it's not defined in the CSS — only `pb-safe` is).

**Undersized touch targets in the toolbar's top row.** The Annotate, Audio, and Transpose buttons are all `h-9` (36px tall). Apple's HIG specifies 44pt minimum; Google Material specifies 48dp. These are the buttons musicians tap during live performance — often while playing an instrument with one hand, under stage lighting, with adrenaline-reduced fine motor control.

Specific measurements:
- Annotate button: 36×36px ❌
- Audio/Monitor button: 36px tall ❌
- Transpose button: 36px tall ❌
- Home button: 48×48px ✅
- Prev/Next song: 48×48px ✅
- Setlist drawer: 40×40px ⚠️ (borderline)
- SongRow drag handle (GripVertical): ~20×20px effective area ❌❌

**The Recommendation**

Add `pb-safe` to PerformanceToolbar, AddBar, AnnotationToolbar, and any other fixed-bottom element. Increase all toolbar touch targets to minimum 44px in both dimensions. For the performance toolbar specifically, consider making the top row's buttons at least `h-11 w-11` (44px) or `h-12` for pill-shaped buttons.

For drag handles in SongRow, increase the grab zone to at least 44×44px (the icon can stay small, but wrap it in a larger touchable div).

**Implementation Scope**

- Add `pb-safe` class to PerformanceToolbar's outermost `<div>`
- Add `pb-safe` to AddBar, AnnotationToolbar, BatchActionBar
- Define `safe-area-bottom` utility in globals.css (currently only `pb-safe` exists)
- Increase h-9 → h-11 on all top-row performance toolbar buttons
- Increase SongRow drag handle padding from `p-1` to `p-2.5` minimum
- Audit all interactive elements in performance context for 44px minimum

**Impact:** Prevents misclicks during live performance. Fixes the app on every modern iPhone. Low effort, high impact — this is borderline a bug fix.

---

## Recommendation 4: Replace Tap-to-Toggle Toolbar with Edge Gesture or Persistent Mini-Bar

**The Problem**

In PerformerView, the toolbar auto-hides after 8 seconds and the only way to recall it is tapping anywhere on the chart. This creates three conflicts:

1. **Tap ambiguity.** Tapping to stop a scroll momentum is a natural mobile gesture. But it also toggles the toolbar. Musicians scroll through a multi-page chart and accidentally show/hide the toolbar constantly.

2. **Swipe ambiguity.** Horizontal swipe navigates to the next/previous song. But if the chart is zoomed in, horizontal swiping is also how you pan. The code has a `zoom > 1.1` guard, but the threshold is fragile — a slight pinch-zoom puts you in a state where swipe navigation is disabled but there's no indication why.

3. **Hidden controls.** When the toolbar is hidden, there's zero visual indication of what song you're on, where you are in the setlist, or how to navigate. A musician who glances down at their phone mid-song sees only a PDF with no chrome. If they need to quickly jump ahead (rabbi skipped a reading), they have to: tap → wait for animation → process the UI → tap setlist drawer → find the song. Under time pressure, this is too many steps.

**The Recommendation**

Keep the full toolbar hideable, but add a persistent "mini-bar" that never hides. This mini-bar shows: the current song name/number (e.g., "3/12 · Shalom Rav"), a small "next" arrow, and a subtle tap target to expand the full toolbar. It should be ~32px tall, semi-transparent, and positioned at the bottom edge above the safe area.

This gives musicians always-visible context ("where am I?") and one-tap access to the next song without recalling the full toolbar.

For the swipe conflict: add a horizontal swipe indicator animation on first use (a brief "swipe left for next song" ghost), and when zoom > 1.0, show a small lock icon indicating swipe navigation is disabled.

**Implementation Scope**

- New `MiniBar` component: song name, position counter, next button, expand button
- Modify PerformerView to render MiniBar always, full toolbar on toggle
- Mini-bar should be ~32px tall, `bg-black/40 backdrop-blur`, positioned `bottom-safe`
- Tapping the mini-bar expands the full toolbar
- Next button on mini-bar advances song directly (most common performance-mode action)
- Add first-use swipe tutorial overlay (show once, persist via localStorage)

**Impact:** Solves the "where am I?" problem that every musician experiences. Reduces cognitive load during performance. Keeps the clean full-screen chart view while always providing escape hatches.

---

## Recommendation 5: Add Smart Filters to the Library

**The Problem**

The library has 400+ songs with rich metadata (key, BPM, topics, last-used date, usage count, offline status) but the only discovery mechanism is a text search box. On mobile, a musician looking for "an upbeat song in D we haven't played in a while" has to scroll through the entire list, visually scanning key badges and mentally recalling usage history.

The content search (searching within chord data/lyrics) is a nice touch, but it triggers only after 3+ characters and 500ms debounce — fine for deep searches, but doesn't help with the much more common "browse by attribute" use case.

**The Recommendation**

Add a horizontal filter chip bar below the search input. Tapping a chip opens a compact picker:

- **Key:** Grid of 12 keys (C, C#/Db, D, ... B) with major/minor toggle. Single or multi-select.
- **Topic/Tag:** Scrollable chips from existing `metadata.topics` across the library (healing, gratitude, Shabbat, High Holidays, etc.)
- **Recency:** "Played recently" / "Not played in 30+ days" / "Never played" — using the `usageMap` data that already loads.
- **Offline:** "Available offline" filter — using the `isFileOffline` check that already runs per-row.

Active filters show as filled chips with an × to remove. Filters combine with AND logic.

**Implementation Scope**

- New `LibraryFilters` component rendered between search input and breadcrumbs in `SongChartsLibrary`
- Filter state managed in `useLibraryStore` or local state
- Key filter: simple grid of 12 buttons (tonal, not alphabetical — circle of fifths layout for musicians)
- Topic filter: derive available topics from `allFiles.flatMap(f => f.metadata?.topics || [])`, deduplicate, show as selectable chips
- Recency filter: uses existing `usageMap` data; add "Never used" by checking absence from map
- Apply filters to `displayedFiles` before rendering (client-side filtering, no API changes)
- Persist active filters in session storage so they survive navigation to a chart and back

**Impact:** Transforms the library from a flat list into a queryable database. Directly supports the real-world workflow of "what should we play this week?" — which is the creative act at the heart of setlist building.

---

## Recommendation 6: Redesign the In-Performance Setlist Drawer for Quick Navigation

**The Problem**

During performance, the SetlistDrawer is the only way to jump to a non-adjacent song. It opens as a bottom sheet covering 80% of the viewport. Issues:

1. **No search or section headers.** A 15-song setlist with 10 flow items (readings, prayers, transitions) renders as a flat 25-item list. The musician has to scroll and scan to find "Oseh Shalom" among all the items.

2. **No visual differentiation of song types.** Songs, readings, and prayers all render identically — just a number, a title, and optionally a key badge. The section headers from the setlist editor aren't represented.

3. **Full-height bottom sheet.** Opening and closing is a heavy animation. For the common action of "peek at what's next in 2 songs," it's overkill.

4. **Close button at the bottom.** After tapping a song to navigate, the sheet closes. But if you want to close without navigating, you have to scroll past all items to reach the "Close" button — or know to swipe down (which isn't indicated).

**The Recommendation**

Redesign the drawer with performance context in mind:

- **Show section groupings.** Use the `header` track types as section dividers within the drawer. "OPENING" → songs → "TORAH SERVICE" → songs → "CLOSING" gives immediate spatial context.
- **Highlight current + show peek.** Current song highlighted, but also show the next 2 items as a "peek" view without opening the full drawer. A small "up next" indicator above the mini-bar (from Recommendation 4) could show the next item's title.
- **Add quick search.** A small search field at the top of the drawer for jumping by name. Auto-focuses on open.
- **Half-height default.** Open to 50% height by default (showing ~6 items centered on current position). Swipe up to expand to full list if needed.
- **Swipe-to-close or tap-outside-to-close.** Remove the explicit "Close" button that takes up space at the bottom.

**Implementation Scope**

- Refactor SetlistDrawer to use a custom bottom sheet with snap points (50% and 85%)
- Group tracks by preceding `header` type items as section labels
- Auto-scroll to current item on open with `scrollIntoView({ block: 'center' })`
- Add `<Input>` at sheet top with local filtering of `playbackQueue`
- Remove the explicit Close button; use sheet's native drag-to-dismiss
- Add "up next" peek to mini-bar (from Rec 4)

**Impact:** Turns the setlist drawer from a dumb list into a performance-grade navigation tool. Significantly reduces time-to-target for mid-service jumps.

---

## Recommendation 7: Make the AI Chat Panel Work on Mobile

**The Problem**

The ChatPanel renders as `w-full sm:w-[400px]` sliding in from the right. On mobile, this covers the entire screen — which means:

1. **Users can't see the setlist while talking to the AI.** If the AI says "I added Shalom Rav, Oseh Shalom, and L'chi Lach to your setlist," the user can't verify without closing the panel, checking, then reopening to continue the conversation.

2. **Input field at the bottom + mobile keyboard = tiny visible area.** When the keyboard opens on mobile, the conversation history collapses to maybe 3-4 visible messages. Users lose conversation context constantly.

3. **No way to minimize without losing context.** Closing the panel (`close()`) unmounts the scroll position. Reopening shows the conversation but you have to scroll to find where you were.

4. **No quick actions.** The AI understands structured commands (CREATE_SETLIST, ADD_TO_SETLIST, etc.) but users have to type natural language. On mobile, typing "add Shalom Rav to my setlist" is slow compared to a structured UI.

**The Recommendation**

Redesign the mobile chat experience as a half-sheet (similar to Apple Maps or Google Maps search):

- **Half-sheet default.** Open to 40% height, showing the input field and last 2-3 messages. The setlist editor remains visible above.
- **Expandable.** Swipe up to full screen for longer conversations.
- **Quick action chips.** Above the input field, show contextual action chips based on current state: "Add songs," "Build from template," "Reorder by key," "Suggest for [this week's parasha]." These issue structured commands without typing.
- **Inline confirmations.** When the AI modifies the setlist, show a compact diff ("Added 3 songs: Shalom Rav, Oseh Shalom, L'chi Lach") with an inline Undo button, rather than requiring the user to visually verify.

**Implementation Scope**

- Replace the slide-from-right panel with a bottom sheet on mobile (keep slide panel on desktop)
- Use snap points: 40%, 85% height
- Add quick action chips component that reads from `contextData` (existing store field)
- When AI executes a setlist modification, emit a brief inline confirmation with undo affordance
- Keep keyboard-aware layout: when keyboard opens, sheet stays at current snap point, conversation scrolls to bottom

**Impact:** Makes the AI assistant usable on mobile rather than being a desktop-only feature that happens to render on phones. The quick action chips alone could dramatically increase AI usage.

---

## Recommendation 8: Simplify the Track Editing Sheet's Key/Transpose UX

**The Problem**

The TrackSheet (song editing on mobile) presents transposition as three separate concepts:

1. **Chart Key** (native key from library — "what key is the PDF written in")
2. **Play In** (setlist key — "what key do we want to perform it in")
3. **Transpose** (stepper: -11 to +11 semitones)

These are the same musical concept expressed three ways. A musician thinks: "We need this in G instead of E." They don't think in terms of "chart key vs. setlist key vs. semitone offset." The current UI forces them to understand the internal data model.

Additionally, the three controls interact in confusing ways:
- Changing "Play In" auto-calculates the transpose value from the native key
- Changing the transpose stepper auto-derives the "Play In" display
- The native key can be manually overridden, which changes the meaning of the transpose value
- If there's no native key detected, the stepper and "Play In" are independent

On mobile, these controls take up significant vertical space (3 separate sections with labels, inputs, and explanatory text) for what should be a single decision: "what key?"

**The Recommendation**

Collapse to a single, smart "Key" control:

- **One input: "Play In Key"** — a KeyPicker dropdown showing the target key.
- **Automatic context:** Below it, show a small label: "Chart is in E · Transpose +3" (derived automatically). This is informational, not interactive.
- **Advanced toggle:** A "Manual override" link that reveals the native key editor and semitone stepper for edge cases.

90% of the time, the musician just wants to pick a key from a grid. The transposition math should be invisible.

**Implementation Scope**

- Refactor the key/transpose section of TrackSheet into a single `KeyControl` component
- Primary UI: KeyPicker for target key + auto-derived context label
- Collapsible "Advanced" section for native key override and manual semitone control
- Remove the standalone transpose stepper from the default view
- Keep the calculation logic in `handleSetlistKeyChange` and `handleTranspositionChange` — just change the UI hierarchy

**Impact:** Reduces cognitive load for every track edit. Removes a common point of confusion for less technical musicians. The "I just want it in G" use case becomes a single tap instead of navigating three interconnected controls.

---

## Recommendation 9: Add Swipe Discoverability and Gesture Coaching

**The Problem**

The app relies heavily on gestures that have zero visual affordance:

- **SwipeToDelete** on setlist tracks: swipe left reveals a red trash zone. No visual hint this exists. The delete threshold (-80px) requires deliberate intent, which is good for safety but means casual exploration won't discover it.
- **Swipe left/right in PerformerView** to navigate songs: no indicator, no edge animation, no "peek" of the next song.
- **Drag-and-drop reordering** via GripVertical handles: the handles are tiny (see Rec 3) and there's no onboarding to explain they exist.
- **Tap-to-toggle toolbar** in performance mode: the only feedback is the toolbar appearing/disappearing, which feels like a bug if you didn't intend it.
- **Context menu (long-press)** on library items: provides "Add to Setlist (Coming Soon)" and "Digitize" options. Context menus are almost never discovered on mobile.

These are well-implemented gestures, but the app assumes users already know they exist.

**The Recommendation**

Add a lightweight gesture coaching system:

- **First-time hints.** On first use of the setlist editor, briefly show a translucent overlay on the first track row: an animated hand swiping left with "Swipe to delete" text. Show for 2 seconds, then fade. Track shown state in localStorage.
- **First-time performance hint.** On first enter to PerformerView with a queue, show a brief "Swipe ← → to navigate songs" toast or ghost animation. Once dismissed, never show again.
- **Edge peek on song boundaries.** When the user scrolls to the very bottom of a chart page (and there's a next song in queue), show a subtle gradient edge with the next song's title peeking up from below. This hints at continuity and teaches swipe-to-advance.
- **Drag handle visual improvement.** Replace the subtle GripVertical icon with a more prominent grab indicator (three horizontal lines, or a slightly raised "pill" that looks draggable). Add a subtle bounce animation on first render to draw attention.
- **Replace context menus.** Move "Digitize" to a visible button on admin rows. For "Add to Setlist" (when implemented), use a visible action icon rather than a hidden long-press menu.

**Implementation Scope**

- New `GestureCoach` component that checks localStorage for first-use flags
- Lottie or CSS animation for swipe/drag hints (keep it lightweight)
- Edge-peek component at bottom of PerformerView when near last scroll position
- Replace ContextMenu on LibraryFileRow with visible inline actions for admin functions
- Track coaching dismissal in localStorage (not Firestore — this is device-specific)

**Impact:** Bridges the gap between powerful gesture-based interactions and user discovery. Reduces support questions ("how do I delete a track?" / "how do I go to the next song?"). Relatively low effort for significant UX improvement.

---

## Recommendation 10: Add Offline-Aware State and Connectivity Feedback Throughout

**The Problem**

The app has excellent offline infrastructure (IndexedDB cache, LRU eviction, background prefetching, service worker) but the user-facing experience doesn't communicate offline state well:

1. **Library rows show a tiny CloudOff icon** (w-3 h-3) for cached files. On a phone screen, these are nearly invisible and don't communicate "you can use this offline" clearly.
2. **The setlist UpcomingSetlistCard** shows "Offline ready" / "Partial" badges but they're small text in the card footer.
3. **During performance, there's no indication whether you're online or offline.** If WiFi drops at the venue (common), the musician doesn't know if their charts are loading from cache or failing silently.
4. **The OfflineIndicator** exists in the main layout but not in the perform layout (which is a separate layout group). So performance mode — the context where offline matters most — has no offline indication.
5. **Background prefetching** runs silently. There's no progress indicator showing "downloading charts for Friday's service."
6. **The "Download for Offline" button** in the overflow menu doesn't show progress or confirm completion.

**The Recommendation**

Create a consistent offline-awareness layer:

- **Connection banner in perform layout.** When offline is detected during performance, show a thin banner: "Offline — charts loaded from cache" (green if all cached, amber if some missing). This reassures rather than alarms.
- **Prefetch progress indicator.** On the dashboard, when BackgroundPrefetcher is active, show a subtle progress bar or "Downloading 3/8 charts for Friday" indicator below the hero card.
- **Bigger offline badges in library.** Replace the tiny CloudOff icon with a more visible indicator — perhaps a green dot on the file icon, or a filled cloud-check icon at a readable size.
- **Download status in setlist editor.** The current "Download for Offline" overflow menu item should show actual progress (downloading 3/8) and change to a checkmark "All charts cached" when complete, without requiring the user to reopen the menu.
- **Pre-service offline check.** 30 minutes before a setlist's event time, if the device has WiFi, automatically trigger a prefetch of any uncached charts. Show a notification if charts couldn't be cached.

**Implementation Scope**

- Add `OfflineIndicator` to `perform/layout.tsx`
- New `PrefetchProgress` component for dashboard (reads from `useOffline` hook or a new prefetch store)
- Upgrade library offline badge size and visibility
- Add progress tracking to the download-for-offline flow (track per-file status in `offline-store`)
- Add pre-service auto-prefetch in BackgroundPrefetcher (compare `eventDate` with `Date.now()`)

**Impact:** Transforms offline from a hidden safety net into a visible, reassuring feature. Musicians at venues with bad WiFi (most synagogues) will trust the app more. The pre-service auto-prefetch prevents the "oh no my charts won't load" panic moment.

---

## Priority Matrix

| # | Recommendation | Effort | Impact | Priority |
|---|----------------|--------|--------|----------|
| 1 | Surface Perform as primary action | Low | Critical | **P0** |
| 3 | Fix safe area + touch targets | Low | High | **P0** |
| 2 | Unify performance experiences | Medium | High | **P1** |
| 4 | Persistent mini-bar in performance | Medium | High | **P1** |
| 8 | Simplify key/transpose UX | Low | Medium | **P1** |
| 5 | Library smart filters | Medium | High | **P2** |
| 6 | Redesign performance setlist drawer | Medium | Medium | **P2** |
| 9 | Gesture coaching/discoverability | Low | Medium | **P2** |
| 10 | Offline-aware state feedback | Medium | Medium | **P2** |
| 7 | Mobile-friendly AI chat panel | High | Medium | **P3** |

**Recommendation:** Start with P0 items (Recs 1 and 3) — they're the highest-impact, lowest-effort changes. A senior developer reviewing this codebase would flag both immediately. Then move to P1 items which reshape the core performance experience. P2 items are quality-of-life improvements that compound over time. P3 (AI chat redesign) is the largest effort and can wait until the core flows are solid.
