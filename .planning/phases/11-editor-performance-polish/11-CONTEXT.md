# Phase 11: Editor & Performance Navigation Polish - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase addresses two specific quality-of-life improvements requested for authorized users (Band Leaders / Admins):
1. **In-place Track Renaming:** The ability to rename a song directly within the `SetlistEditorV2` without having to delete it and re-add it.
2. **Performance to Editor Bridge:** A secure, authorized-only button/link inside the Performance mode (`/perform/setlist/[id]`) that instantly jumps the user to the Edit mode (`/setlists/[id]`).

All UI additions must strictly adhere to the `ui-ux-pro-max` guidelines.

</domain>

<decisions>
## Implementation Decisions

### Track Renaming (SetlistEditorV2)
- **Decision:** Introduce an inline "Rename" action on the `TransposeTrackList` or track row component.
- **Decision:** When clicked, it should present a simple input or a small dialog/popover to edit the `name` field of the track.
- **Decision:** The update must cleanly push to the parent's state/form without causing a full setlist reload.

### Performance to Editor Bridge
- **Decision:** Add an "Edit Setlist" button to the `PerformanceToolbar` or `SetlistDrawer`. 
- **Decision:** The button MUST be gated behind `isBandLeader` (using `useAuth()` on the client or passed down from the server).
- **Decision:** Clicking the button routes the user to `/setlists/[id]`.

### UI/UX Pro Max Compliance
- **Accessibility:** Use proper ARIA labels for the new Edit/Rename buttons.
- **Visual:** Use a consistent Lucide icon (e.g., `Pencil` or `Edit3`) for the rename and edit actions.

</decisions>

<code_context>
## Existing Code Insights

### Targets for Modification
- `src/components/setlist/TransposeTrackList.tsx` or `SetlistEditorV2.tsx` (for track renaming).
- `src/app/perform/setlist/[id]/page.tsx` or `src/components/performance/PerformanceToolbar.tsx` (for the edit setlist link).
- `src/components/performance/SetlistDrawer.tsx` (potential spot for the Edit link).

</code_context>

<specifics>
## Specific Ideas
- "a way to rename a song that is in a setlist, and not just delete it and add something else."
- "authorized users should have a way to move from performance mode to editing mode of a setlist from within the performance mode... but only authorized users."

</specifics>

---

*Phase: 11-editor-performance-polish*
*Context gathered: 2026-03-13*