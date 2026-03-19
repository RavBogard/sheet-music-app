# Phase 20: Add Song to Existing Setlist from Library View - Research

**Researched:** 2026-03-18
**Domain:** React UI interaction flow (context menu -> bottom sheet picker -> Firestore mutation)
**Confidence:** HIGH

## Summary

This phase adds a Spotify-like "Add to Playlist" interaction to the library view. The entire feature is an orchestration of **existing components and patterns** -- no new libraries, no new APIs, no new data models. The core flow is: user right-clicks a song (or selects batch) -> "Add to Setlist..." context menu item -> bottom sheet picker with setlist search -> Firestore mutation via existing `updateSetlist()` -> toast with undo.

Every building block already exists in the codebase: Radix ContextMenu on `LibraryFileRow`, shadcn Sheet component (bottom side), `createSetlistService` for Firestore reads/writes, `addSongsFromLibrary()` pattern in `use-setlist-logic.ts` for track creation, `useAuth()` for role gating, and sonner toast with undo action. The work is purely **integration and UI composition**.

**Primary recommendation:** Build a single new component (`AddToSetlistSheet`) that encapsulates the setlist picker bottom sheet, then wire it into LibraryFileRow's context menu, SelectionActionBar, and ContentSearchResults via a shared state hook.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Add "Add to Setlist..." item to the existing context menu (right-click/long-press) on LibraryFileRow
- Menu item appears as the FIRST item (top) in the context menu
- Label: "Add to Setlist..." (with ellipsis indicating a picker will follow)
- Also available from the batch SelectionActionBar when multiple songs are selected
- Available in library grid AND search results (SearchOverlay, ContentSearchResults)
- Bottom sheet (slides up from bottom, like Spotify's "Add to Playlist")
- Uses existing shadcn Sheet component
- Search/filter bar at top for filtering setlists by name
- Setlists ordered by most recent (last modified) first
- Shows ALL editable setlists -- personal setlists + public setlists the user has edit access to
- Sheet auto-closes after adding (does not stay open for multi-add)
- Toast with undo after successful add: 'Added "Song Name" to Setlist Name'
- Matches existing delete-track toast pattern with undo action
- If song already exists in selected setlist: warn but allow -- toast says '"Song Name" is already in this setlist. Added again.'
- Undo removes the just-added track from the setlist
- Feature only available to band leaders and admins
- Context menu item and batch action button hidden for other roles
- Setlist picker shows only setlists the user has edit access to
- Must use /ui-ux-pro-max skill during planning and execution

### Claude's Discretion
- Exact bottom sheet height and scroll behavior
- Loading state while fetching setlist list
- Empty state if user has no editable setlists
- How to handle batch add feedback (single toast vs per-setlist)
- Search bar debounce timing

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

## Standard Stack

### Core (all already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @radix-ui/react-context-menu | (installed) | Context menu on LibraryFileRow | Already in use |
| @radix-ui/react-dialog | (installed) | Sheet component (shadcn wraps this) | Already in use |
| sonner | (installed) | Toast notifications with undo action | Already in use |
| firebase/firestore | (installed) | Setlist reads/writes | Already in use |
| fuse.js | (installed) | Client-side fuzzy search for setlist names | Already used in SearchOverlay |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lucide-react | (installed) | Icons (ListPlus, Search, Loader2) | Menu items, sheet UI |

### Alternatives Considered
None -- all building blocks exist in the codebase already.

**Installation:**
```bash
# No new packages needed
```

## Architecture Patterns

### Recommended Project Structure
```
src/
  components/
    library/
      AddToSetlistSheet.tsx     # NEW: Bottom sheet setlist picker
      LibraryFileRow.tsx         # MODIFY: Add "Add to Setlist..." context menu item
      SelectionActionBar.tsx     # MODIFY: Wire existing "Add to Setlist" button to sheet
      SongChartsLibrary.tsx      # MODIFY: Add sheet state + pass callbacks
      ContentSearchResults.tsx   # MODIFY: Add context menu or action button
  hooks/
    use-add-to-setlist.ts        # NEW: Shared logic hook for the add-to-setlist flow
```

### Pattern 1: Shared State Hook for Multi-Entry-Point Feature
**What:** A custom hook (`useAddToSetlist`) that manages the entire flow: which songs to add, whether the sheet is open, fetching editable setlists, performing the mutation, showing toast with undo.
**When to use:** When multiple UI entry points (context menu, batch bar, search results) need to trigger the same interaction.
**Example:**
```typescript
// useAddToSetlist.ts
export function useAddToSetlist() {
  const [isOpen, setIsOpen] = useState(false)
  const [pendingSongs, setPendingSongs] = useState<DriveFile[]>([])
  const { user, isBandLeader, isAdmin } = useAuth()

  const canAddToSetlist = isBandLeader || isAdmin

  const openForSongs = (songs: DriveFile[]) => {
    setPendingSongs(songs)
    setIsOpen(true)
  }

  const addToSetlist = async (setlistId: string, setlist: Setlist) => {
    // Build tracks from pendingSongs using same pattern as addSongsFromLibrary
    // Call updateSetlist() to append tracks
    // Show toast with undo
    setIsOpen(false)
  }

  return { isOpen, setIsOpen, pendingSongs, openForSongs, addToSetlist, canAddToSetlist }
}
```

### Pattern 2: Setlist Fetching for Picker
**What:** Query editable setlists using existing Firestore subscription patterns.
**When to use:** For the bottom sheet picker content.
**Key insight:** The codebase already has `subscribeToPersonalSetlists()` and `subscribeToPublicSetlists()` on `createSetlistService`. The picker needs BOTH -- personal setlists (user owns) + public setlists (band leaders can edit all public ones). Combine and sort by `updatedAt` or `date` descending.
```typescript
// Inside the hook or component:
const setlistService = useMemo(() => createSetlistService(user.uid, user.displayName), [user])

// Subscribe to personal setlists
useEffect(() => {
  const unsub1 = setlistService.subscribeToPersonalSetlists(callback)
  const unsub2 = setlistService.subscribeToPublicSetlists(callback)
  return () => { unsub1(); unsub2() }
}, [setlistService])
```

### Pattern 3: Track Creation from DriveFile (reuse existing)
**What:** The `addSongsFromLibrary()` function in `use-setlist-logic.ts` already converts `DriveFile[]` to `SetlistTrack[]`. Reuse the same track-building logic.
**Key difference:** In this phase, we are NOT inside the setlist editor context. We need to build tracks and append them to a setlist via direct Firestore `updateSetlist()`, not through the hook's local state.
```typescript
// Build tracks the same way addSongsFromLibrary does:
const newTracks: SetlistTrack[] = files.map((file, index) => ({
  id: `track-${Date.now()}-${file.id}-${index}`,
  title: file.name.replace(/\.(pdf|musicxml|xml|mxl)$/i, '').replace(/_/g, ' ').replace(/-/g, ' ').trim() || "Untitled",
  fileId: file.id,
  fileName: file.name,
  key: file.metadata?.key || "",
  notes: "",
  type: 'song' as const,
}))

// Append to existing tracks and save
const updatedTracks = [...existingSetlist.tracks, ...newTracks]
await setlistService.updateSetlist(setlistId, existingSetlist.isPublic, {
  tracks: updatedTracks,
  trackCount: updatedTracks.length,
})
```

### Pattern 4: Toast with Undo (existing pattern)
**What:** Sonner toast with action button for undo. Already used in `deleteTrack`.
```typescript
toast(`Added "${songName}" to ${setlistName}`, {
  action: {
    label: "Undo",
    onClick: async () => {
      // Remove the just-added track(s) from the setlist
      const revertedTracks = existingTracks // tracks before the add
      await setlistService.updateSetlist(setlistId, isPublic, {
        tracks: revertedTracks,
        trackCount: revertedTracks.length,
      })
    },
  },
  duration: 5000,
})
```

### Anti-Patterns to Avoid
- **Do NOT use `useSetlistLogic` for this feature:** That hook manages editor-local state with auto-save debouncing. This feature needs direct Firestore writes since we are NOT in the setlist editor.
- **Do NOT open the setlist editor:** The user stays in the library view. The mutation happens behind the scenes.
- **Do NOT block on real-time subscription for the picker:** Subscribe and show a loading skeleton while waiting. The picker should feel instant.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Fuzzy search for setlist names | Custom string matching | `fuse.js` (already in project) | Handles typos, partial matches |
| Track ID generation | Sequential counters | `Date.now() + crypto.randomUUID()` | Existing pattern in codebase |
| Toast with undo | Custom notification system | `sonner` toast with action | Established pattern |
| Bottom sheet UI | Custom modal/drawer | shadcn `Sheet` with `side="bottom"` | Already styled and animated |
| Context menu | Custom right-click handler | Radix `ContextMenu` | Already on LibraryFileRow |

**Key insight:** Every piece of this feature exists. The work is composition, not creation.

## Common Pitfalls

### Pitfall 1: Stale Setlist Data During Undo
**What goes wrong:** User adds a song, then someone else edits the setlist, then user clicks Undo -- the undo overwrites the other person's changes.
**Why it happens:** Undo captures a snapshot of tracks at add-time and blindly writes it back.
**How to avoid:** For the undo, remove only the specific track IDs that were added (filter them out of current tracks) rather than restoring a full snapshot. This way concurrent edits are preserved.
**Warning signs:** Race condition when multiple users edit the same setlist.

### Pitfall 2: Duplicate Subscription Overwrite
**What goes wrong:** `subscribeToPersonalSetlists` and `subscribeToPublicSetlists` fire at different times, and one overwrites the other in state.
**Why it happens:** Both callbacks set the same state, and the second one replaces the first.
**How to avoid:** Use separate state for personal and public setlists, then merge in a `useMemo`. Or accumulate into a Map keyed by setlist ID.
**Warning signs:** Picker shows only personal OR only public setlists, never both.

### Pitfall 3: Sheet Not Closing After Add
**What goes wrong:** The sheet stays open after a successful add because state update and close happen asynchronously.
**Why it happens:** The Firestore write is async, and if you close before it completes, the toast might not show. If you wait for completion, there's a visible delay.
**How to avoid:** Close the sheet optimistically (immediately on click), then let the Firestore write happen in the background. Show toast after write completes.
**Warning signs:** Laggy-feeling interaction if waiting for Firestore round-trip before closing.

### Pitfall 4: Context Menu Item Showing for Non-Admin/Non-Leader Users
**What goes wrong:** The "Add to Setlist..." menu item appears for musicians who cannot edit setlists.
**Why it happens:** LibraryFileRow currently only checks `isAdmin` for its menu items.
**How to avoid:** Pass a `canAddToSetlist` prop (derived from `isBandLeader || isAdmin`) from SongChartsLibrary down to LibraryFileRow. Gate the menu item on this prop.
**Warning signs:** Musicians see the option but get permission errors.

### Pitfall 5: Batch Add with Many Songs Creates Confusing Toasts
**What goes wrong:** Adding 10 songs to a setlist shows 10 individual toasts or one confusing toast.
**Why it happens:** No design for batch feedback.
**How to avoid:** For batch adds, show a single toast: 'Added 10 songs to "Setlist Name"'. The undo removes all 10.
**Warning signs:** Toast spam when batch-adding.

## Code Examples

### Existing: ContextMenu on LibraryFileRow (lines 214-262)
```typescript
// Current structure -- new item goes FIRST inside <ContextMenuContent>
<ContextMenuContent>
    {/* ADD NEW ITEM HERE - before existing items */}
    {canAddToSetlist && !isFolder && !isAudio && (
        <ContextMenuItem onClick={() => onAddToSetlist?.(item)}>
            <span className="flex items-center gap-2">
                <ListPlus className="h-4 w-4" /> Add to Setlist...
            </span>
        </ContextMenuItem>
    )}

    <ContextMenuItem onClick={onClick}>
        {isFolder ? "Open Folder" : isAudio ? "Play" : "Select / View"}
    </ContextMenuItem>
    {/* ... existing menu items ... */}
</ContextMenuContent>
```

### Existing: Toast with undo (use-setlist-logic.ts line 451)
```typescript
toast("Track deleted", {
    action: { label: "Undo", onClick: () => undo() },
    duration: 5000,
})
```

### Existing: Sheet side="bottom" usage
```typescript
<Sheet open={isOpen} onOpenChange={setIsOpen}>
    <SheetContent side="bottom" className="max-h-[70vh] flex flex-col">
        <SheetHeader>
            <SheetTitle>Add to Setlist</SheetTitle>
        </SheetHeader>
        {/* Search bar + setlist list */}
    </SheetContent>
</Sheet>
```

### Existing: SelectionActionBar "Add to Setlist" button (already present, line 67-73)
```typescript
// Currently shows a toast.info placeholder -- needs to be wired to the sheet
<Button onClick={() => {
    const selectedItems = combinedItems.filter(i => selectedIds.has(i.id))
    // TODO: Replace toast.info with onAddToSetlist(selectedItems)
}}>
    Add {selectedIds.size} to Setlist
</Button>
```

### Existing: Firestore updateSetlist (setlist-firebase.ts line 117)
```typescript
async updateSetlist(id: string, _isPublic: boolean, data: Partial<Setlist>) {
    const docRef = doc(db, COLLECTION_PATH, id);
    const cleanData = stripUndefined(data as Record<string, unknown>);
    cleanData.updatedAt = serverTimestamp();
    await updateDoc(docRef, cleanData);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Navigate to setlist editor to add songs | Add from library view directly | Phase 20 | Eliminates context-switching |
| SelectionActionBar shows placeholder toast | Batch action wired to real setlist picker | Phase 20 | Completes batch workflow |

**Existing placeholder:** The `SelectionActionBar` already has an "Add to Setlist" button that shows `toast.info("Use the setlist editor")`. This phase replaces that placeholder with the real implementation.

## Open Questions

1. **Editable setlist definition for non-owners**
   - What we know: Band leaders and admins can edit public setlists. Personal setlists are only editable by owners.
   - What's unclear: Should the picker show public setlists owned by OTHER users? The existing `canEdit` logic in `use-setlist-logic.ts` says yes for band leaders on public setlists.
   - Recommendation: Show personal setlists + public setlists (if user is band leader/admin). This matches the locked decision in CONTEXT.md.

2. **Real-time subscription vs one-time fetch for picker**
   - What we know: Existing code uses real-time subscriptions (`onSnapshot`) for setlist lists.
   - What's unclear: Whether a one-time `getDocs` query would be simpler for a transient picker.
   - Recommendation: Use real-time subscriptions for consistency with existing patterns. The subscriptions auto-unsubscribe when the sheet closes (component unmounts).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 3.2.1 |
| Config file | vitest.config.ts (assumed, standard Next.js + vitest) |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| P20-01 | Context menu "Add to Setlist..." appears for band leaders/admins on non-folder, non-audio files | unit | `npx vitest run src/components/library/__tests__/add-to-setlist.test.tsx -x` | No - Wave 0 |
| P20-02 | Context menu item hidden for musicians | unit | Same file | No - Wave 0 |
| P20-03 | Bottom sheet opens with editable setlist list | unit | Same file | No - Wave 0 |
| P20-04 | Selecting a setlist adds the song(s) and closes sheet | unit | Same file | No - Wave 0 |
| P20-05 | Toast shown with undo action after successful add | unit | Same file | No - Wave 0 |
| P20-06 | Undo removes only the added track(s) | unit | `npx vitest run src/hooks/__tests__/use-add-to-setlist.test.ts -x` | No - Wave 0 |
| P20-07 | Duplicate song warning toast shown when song already in setlist | unit | Same file | No - Wave 0 |
| P20-08 | Batch add from SelectionActionBar | unit | `npx vitest run src/components/library/__tests__/add-to-setlist.test.tsx -x` | No - Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run src/components/library/__tests__/add-to-setlist.test.tsx src/hooks/__tests__/use-add-to-setlist.test.ts -x`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/hooks/__tests__/use-add-to-setlist.test.ts` -- covers P20-06, P20-07 (hook logic)
- [ ] `src/components/library/__tests__/add-to-setlist.test.tsx` -- covers P20-01 through P20-05, P20-08 (UI integration)

## Sources

### Primary (HIGH confidence)
- Codebase inspection: LibraryFileRow.tsx, SelectionActionBar.tsx, use-setlist-logic.ts, setlist-firebase.ts, SongChartsLibrary.tsx, SearchOverlay.tsx, ContentSearchResults.tsx, sheet.tsx, auth-context.tsx, models.ts
- All patterns, APIs, and component structures verified directly from source code

### Secondary (MEDIUM confidence)
- shadcn Sheet component: uses @radix-ui/react-dialog with `side="bottom"` variant -- verified from sheet.tsx source
- sonner toast with undo action: verified from use-setlist-logic.ts deleteTrack pattern

### Tertiary (LOW confidence)
- None -- all findings verified from codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed and in use
- Architecture: HIGH -- all patterns derived from existing codebase patterns
- Pitfalls: HIGH -- identified from actual code structure and data flow analysis

**Research date:** 2026-03-18
**Valid until:** 2026-04-18 (stable -- no external dependencies)
