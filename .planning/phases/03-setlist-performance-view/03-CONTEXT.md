# Phase 3: Setlist Performance View - Context

**Gathered:** 2026-03-07
**Status:** Ready for planning

<domain>
## Phase Boundary

A musician sets their tablet on a music stand and sees the full service at a glance — songs in their key, tempo, lead, and liturgical flow items — with immersive PDF drill-down, leader-driven position tracking, monitor access from within the PDF, and public access for jam sessions. Home screen shows the next service focused.

</domain>

<decisions>
## Implementation Decisions

### Service flow layout
- Dense compact rows — songs get slightly more visual weight (bold title), liturgical items are visually quieter (smaller text, muted color)
- Per song row: Title + transposed Key + Tempo + Lead musician visible without tapping
- Notes hidden until tapped — keeps rows clean
- Liturgical non-song items (readings, prayers, transitions) show just the label — no timing/duration
- Single scrollable list, no collapsible sections — mirrors a physical setlist taped to a stand
- Portrait tablet optimized

### PDF drill-down flow
- Full-screen takeover when tapping a song — PDF owns the entire screen
- Persistent bottom bar during PDF view with: setlist drawer button, monitor access button, current song name, prev/next song buttons
- Setlist drawer opens as overlay from the bottom bar — does NOT navigate away from PDF
- Tapping a different song in the drawer switches the PDF in place — seamless, no round-trip to setlist page
- Prev/next buttons skip non-song items — only navigates between songs with PDFs

### Current position tracking
- Leader-driven sync — band leader advances position, all musicians see the same current item highlighted
- Uses existing Firestore liveState.currentTrackIndex for real-time sync
- Highlight only, no auto-scroll — musicians control their own scroll position
- Background highlight style (soft colored background on current row) — visible from arm's length on a music stand
- Claude's Discretion: advance mechanism (tap-to-set vs dedicated controls for leader)

### Public access
- centralreform.live shows public setlists to non-signed-in visitors — browse and tap into any public setlist
- Public view is the same performance view, read-only — no transposition, no monitor controls, no editing
- No sign-in prompt for public visitors

### Home screen
- Signed-in musicians see one focused card: this week's service date, setlist name, who's playing, and a prominent "Perform" button
- Not a dashboard — one card, one action
- Empty state (no upcoming service): show the most recent past setlist for practice reference

### Claude's Discretion
- Exact spacing, typography, and color choices for the dense list rows
- Loading states and skeleton patterns
- Error handling for missing PDFs or failed Firestore sync
- Wake lock implementation details (SET-06)
- Auto-transposition display format (how the transposed key appears in the row)
- Transition animations between setlist and PDF views

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `PDFViewer` (`/src/components/music/PDFViewer.tsx`): Dynamically imported, renders pages with react-pdf, supports annotations — use as-is for full-screen PDF display
- `QuickMonitorPanel` (`/src/components/monitor/QuickMonitorPanel.tsx`): Compact mixer with starred channels as vertical faders — integrate into bottom bar/drawer
- `useMusicianTransposition()` (`/src/hooks/use-musician-transposition.ts`): Auto-applies profile instrument defaults, per-track overrides, per-song preferences — handles SET-07 auto-transposition
- `RehearsalToolbar` (`/src/components/performance/RehearsalToolbar.tsx`): Existing toolbar with navigation, zoom, key changes — basis for the bottom bar
- `SmartTransposer` (`/src/components/music/SmartTransposer.tsx`): Transposition UI menu — available within PDF view
- `useMonitorAccess()`: Permission gating for monitor features — returns null when no access
- `useSafeFirestoreSync()`: Real-time Firestore subscriptions — use for liveState sync

### Established Patterns
- Tailwind CSS v4 + shadcn/ui (Radix primitives) for all UI components
- Zustand stores for client state, Firestore subscriptions for real-time data
- Dark mode support via next-themes with `dark:` prefixes
- Glass morphism effects (`glass`, `glass-card` classes) for overlays
- lucide-react for icons
- Dynamic imports with `next/dynamic` for heavy components (SSR: false)

### Integration Points
- `/perform/setlist/[id]` — existing route, entry point for performance view (needs redesign for dense list)
- `/perform/[id]` — existing PDF viewer route (may become in-place rendering instead of navigation)
- `setlist-firebase.ts` — `subscribeToSetlist()` for real-time data, `liveState` for position tracking
- `SetlistTrack` type — has all fields needed (title, key, bpm, leadMusician, type, fileId, transposition)
- `Setlist.isPublic` flag — already in data model for public access gating
- Bottom navigation (`MobileTabBar.tsx`) — integration point for monitor/setlist buttons

</code_context>

<specifics>
## Specific Ideas

- Bottom bar during PDF view should match the existing pattern: setlist drawer, monitor button, song name, prev/next — proven UX for music-stand tablets
- The setlist should feel like a physical setlist taped to a music stand — dense, scannable, no tapping required to get essential info
- Background highlight for current position should be noticeable from arm's length (musician is playing, not staring at screen)

</specifics>

<deferred>
## Deferred Ideas

- Live follow mode (all musicians auto-scroll together) — v2 feature (PERF-V2-01)
- Offline caching of setlist data and PDFs — v2 feature (OFFLINE-01)

</deferred>

---

*Phase: 03-setlist-performance-view*
*Context gathered: 2026-03-07*
