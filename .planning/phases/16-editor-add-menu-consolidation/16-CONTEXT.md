# Phase 16: Editor Add Menu Consolidation - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase addresses the UX of the `SetlistEditorV2`. Currently, there are two distinct ways to add content to the bottom of a setlist: an "Add Song" button (which likely opens the library modal) and an "Add Item" button (which likely opens a dropdown or dialog for adding headers, readings, notes, etc.). 

The goal is to consolidate these into a single, cohesive menu structure (e.g., one "Add Item" button that opens a comprehensive menu allowing the user to pick "Song from Library", "Section Header", "Liturgy/Reading", "Note", etc.).

All UI changes must strictly adhere to the `ui-ux-pro-max` guidelines.

</domain>

<decisions>
## Implementation Decisions

### Menu Consolidation Strategy
- **Decision:** Remove the separate "Add Song" button from the bottom of the setlist editor.
- **Decision:** Upgrade the "Add Item" button to be the single entry point.
- **Decision:** When clicked, it should open a `DropdownMenu` (or a popover/sheet depending on mobile UX) that clearly categorizes the types of items that can be added.
- **Decision:** The menu should include:
  - **Song**: Triggers the `setShowFilePicker(true)` state.
  - **Section Header**: Adds a divider/header row.
  - **Note / Stage Direction**: Adds a text note.
  - **Liturgy / Reading**: Adds a prayer/reading block.

</decisions>

<code_context>
## Existing Code Insights

### Targets for Modification
- `src/components/setlist/v2/SetlistEditorV2.tsx`: This is where the bottom action bar is currently rendered.

### Dependencies
- The `SetlistEditorV2` uses `useSetlistLogic` for handling additions (`handleAddTrack`, `handleAddHeader`, etc.).
- It likely renders a `SetlistBottomBar` or just inline buttons at the bottom of the `SortableContext`.

</code_context>

---

*Phase: 16-editor-add-menu-consolidation*
*Context gathered: 2026-03-13*