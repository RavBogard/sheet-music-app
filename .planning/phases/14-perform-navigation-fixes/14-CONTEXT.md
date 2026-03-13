# Phase 14: Perform Navigation Fixes - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase addresses two critical navigation bugs reported by a Band Leader:
1. **"Perform" Button on Setlist Dashboard:** The Band Leader cannot click "Perform" from the Setlists page. The `handleSelect` function in `useSetlistDashboard` defaults to routing to the editor (`/setlists/[id]`), but the "Perform" button needs to route directly to the performance mode (`/perform/setlist/[id]`).
2. **"Forward" Button in Performance Mode:** The `SongNavigation` component in the `PerformanceToolbar` is attempting to route to the deleted legacy engine (`/perform/[fileId]`). This breaks the "Next" and "Previous" arrows when a user has a PDF open in the V2 Setlist view.

</domain>

<decisions>
## Implementation Decisions

### 1. Dashboard "Perform" Button Fix
- **Decision:** The `UpcomingSetlistCard` and `SetlistCard` currently call `onClick={() => handleSelect(setlist)}`, which goes to the editor. We need to distinguish between clicking the *card* (goes to editor) vs clicking the *Perform* button.
- **Decision:** Check if `UpcomingSetlistCard` has an explicit `onPerform` prop. If so, wire it up in `SetlistDashboard.tsx` to `router.push('/perform/setlist/[id]')`.

### 2. SongNavigation Fix (V2 Engine Integration)
- **Decision:** The `SongNavigation.tsx` component is hardcoded with `router.replace('/perform/${next.fileId}')`. This relies on the deleted Phase 1 legacy engine.
- **Decision:** In the V2 architecture (`PDFOverlay.tsx`), the active song is controlled by local state (`activeSongIndex`) inside `SetlistPerformPage`, not by URL routing.
- **Decision:** We must remove `router.replace` from `SongNavigation.tsx`. Instead, `SongNavigation` needs to trigger the `onNavigate` callback that is already passed down from `PDFOverlay`. 

</decisions>

<code_context>
## Existing Code Insights

### `SongNavigation.tsx`
- Relies heavily on `useMusicStore` (`queueIndex`, `nextSong`, `prevSong`).
- Uses `router.replace('/perform/${next.fileId}')` which is a 404 dead end.

### `PDFOverlay.tsx`
- Receives `onNavigate: (index: number) => void`.
- This callback currently does nothing inside `PDFOverlay` because `PerformanceToolbar` doesn't accept an `onNavigate` prop.

</code_context>

---

*Phase: 14-perform-navigation-fixes*
*Context gathered: 2026-03-13*