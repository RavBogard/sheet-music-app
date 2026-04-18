# Phase 14: Perform Navigation Fixes - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase addresses two critical navigation bugs reported by a Band Leader:
1. **Setlist Dashboard Routing:** The "Perform" logic from the Setlists page defaults to routing to the editor (`/setlists/[id]`). We need clicking the card to route directly to the performance mode (`/perform/setlist/[id]`) with a distinct action for editing.
2. **"Forward" Button in Performance Mode:** The `SongNavigation` component in the `PerformanceToolbar` is attempting to route to the deleted legacy engine (`/perform/[fileId]`). This breaks the "Next" and "Previous" arrows when a user has a PDF open in the V2 Setlist view.

</domain>

<decisions>
## Implementation Decisions

### 1. Dashboard "Perform" vs "Edit" Behavior
- **Decision:** Clicking the *entire Setlist Card* will route the user directly to the Gig View (`/perform/setlist/[id]`). 
- **Decision:** An explicit "Edit" button will be added to the card for authorized users (Band Leaders/Admins) to route them to the Editor (`/setlists/[id]`).

### 2. SongNavigation Arrow Behavior
- **Decision:** The Next/Previous arrows will simply **disable/gray out** when reaching the beginning or end of the setlist, rather than wrapping around.

</decisions>

<code_context>
## Existing Code Insights

### Dashboard Cards (`src/components/setlist/SetlistCard.tsx` & `UpcomingSetlistCard.tsx`)
- We need to modify the `onClick` handler of the root card div to `router.push('/perform/setlist/[id]')`.
- We need to add an `onEdit` callback or an internal `Link` to `/setlists/[id]` to satisfy the new Edit requirement.

### `SongNavigation.tsx`
- We must remove `router.replace('/perform/${next.fileId}')`.
- The `handleNext` and `handlePrev` functions should mutate the `queueIndex` via the store, which will natively update `PDFOverlay.tsx` via its reactive effect.
</code_context>

<specifics>
## Specific Ideas
- Best practice standard Tailwind UI/UX applies, as per user request in Phase 13.
</specifics>

<deferred>
## Deferred Ideas
None.
</deferred>

---

*Phase: 14-perform-navigation-fixes*
*Context gathered: 2026-03-13*