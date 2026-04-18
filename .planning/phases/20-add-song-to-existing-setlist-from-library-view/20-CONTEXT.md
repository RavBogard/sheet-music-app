# Phase 20: Add Song to Existing Setlist from Library View - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning
**UI Requirement:** Must use /ui-ux-pro-max skill during planning and execution

<domain>
## Phase Boundary

Add the ability to add a song (or batch of songs) from the library to an existing setlist, using a Spotify-like "Add to Playlist" interaction. Available from the library grid context menu, batch selection bar, and search results.

</domain>

<decisions>
## Implementation Decisions

### Trigger interaction
- Add "Add to Setlist..." item to the existing context menu (right-click/long-press) on LibraryFileRow
- Menu item appears as the FIRST item (top) in the context menu
- Label: "Add to Setlist..." (with ellipsis indicating a picker will follow)
- Also available from the batch SelectionActionBar when multiple songs are selected
- Available in library grid AND search results (SearchOverlay, ContentSearchResults)

### Setlist picker UI
- Bottom sheet (slides up from bottom, like Spotify's "Add to Playlist")
- Uses existing shadcn Sheet component
- Search/filter bar at top for filtering setlists by name
- Setlists ordered by most recent (last modified) first
- Shows ALL editable setlists — personal setlists + public setlists the user has edit access to
- Sheet auto-closes after adding (does not stay open for multi-add)

### Feedback & confirmation
- Toast with undo after successful add: 'Added "Song Name" to Setlist Name'
- Matches existing delete-track toast pattern with undo action
- If song already exists in selected setlist: warn but allow — toast says '"Song Name" is already in this setlist. Added again.'
- Undo removes the just-added track from the setlist

### Permissions
- Feature only available to band leaders and admins (users who can edit public setlists)
- Context menu item and batch action button hidden for other roles
- Setlist picker shows only setlists the user has edit access to

### Claude's Discretion
- Exact bottom sheet height and scroll behavior
- Loading state while fetching setlist list
- Empty state if user has no editable setlists
- How to handle batch add feedback (single toast vs per-setlist)
- Search bar debounce timing

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `LibraryFileRow` (src/components/library/LibraryFileRow.tsx): Has ContextMenu with right-click/long-press — add new menu item here
- `SelectionActionBar` (src/components/library/SelectionActionBar.tsx): Batch action bar — add "Add to Setlist" button
- `Sheet` (src/components/ui/sheet.tsx): shadcn Sheet component for the bottom sheet picker
- `addSongsFromLibrary()` (src/hooks/use-setlist-logic.ts): Existing function to add DriveFile[] to a setlist's tracks
- `SearchOverlay` (src/components/setlist/v2/SearchOverlay.tsx): Has `isChartFile` filter and `onSelect` — can add context menu here too
- `ContentSearchResults` (src/components/library/ContentSearchResults.tsx): Has `onSelectFile` prop

### Established Patterns
- Context menu via Radix ContextMenu (already on LibraryFileRow)
- Toast with undo via sonner (used in deleteTrack)
- Firestore setlist queries via `createSetlistService`
- Role checks via `useAuth()` — `isBandLeader`, `isAdmin`

### Integration Points
- `SongChartsLibrary.tsx`: Where LibraryFileRow is rendered — wire up the "Add to Setlist" action
- `setlist-firebase.ts`: Has `updateSetlist()` for modifying setlist tracks server-side
- `useAuth()`: For role-based visibility of the feature

</code_context>

<specifics>
## Specific Ideas

- "I want it to feel like adding a track to a playlist in Spotify" — the bottom sheet picker, the quick toast confirmation, the overall flow should feel familiar to anyone who's used Spotify
- First item in context menu = high prominence, signals this is a primary action

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 20-add-song-to-existing-setlist-from-library-view*
*Context gathered: 2026-03-18*
