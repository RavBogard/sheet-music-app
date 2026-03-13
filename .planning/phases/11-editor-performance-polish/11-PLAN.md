# Plan 11: Editor & Performance Navigation Polish

**Phase:** 11 - Editor & Performance Navigation Polish
**Status:** Ready to execute

## Goal
Add inline track renaming for setlists and provide a secure bridge from Performance Mode to Editor Mode for authorized users.

## Requirements
- ✓ Add a "Rename" button/input for tracks within the Setlist Editor without deleting/re-adding.
- ✓ Add an "Edit Setlist" button to the Performance Mode toolbar/drawer, visible *only* to Band Leaders/Admins.
- ✓ Ensure UI adheres to `ui-ux-pro-max` (SVG icons, proper contrast, logical routing).

## Proposed Changes

### 1. `src/components/setlist/TransposeTrackList.tsx` (In-place Renaming)
- **Task**: Add an edit action to each track row that toggles an inline `<input>` (or simple dialog) to change `track.name`.
- **Action**: Add state `editingTrackId` (string | null).
- **Action**: Render a small `Pencil` icon next to the track name.
- **Action**: When editing, show an input field with Save/Cancel buttons. Upon save, call the parent's update callback for that specific track to update the `name` property.

### 2. `src/app/perform/setlist/[id]/page.tsx` & Toolbar (Navigation Bridge)
- **Task**: Provide a way back to the editor for authorized users.
- **Action**: Since `/perform/setlist/[id]/page.tsx` is a Client Component (or uses client components like `PerformanceToolbar`), we can read `isBandLeader` from `useAuth()`.
- **Action**: Add an "Edit Setlist" button to `PerformanceToolbar.tsx` or `SetlistDrawer.tsx` (wherever navigation fits best, likely near the "Home" or "Exit" buttons).
- **Action**: Use a `Pencil` or `Settings` icon.
- **Action**: The button triggers `router.push("/setlists/[id]")`.

## Verification Criteria
- [ ] User can click an edit icon next to a track name in the editor, type a new name, and save it without affecting the file ID or key.
- [ ] A Band Leader viewing `/perform/setlist/123` sees an "Edit Setlist" button.
- [ ] Clicking "Edit Setlist" successfully routes to `/setlists/123`.
- [ ] A Guest or standard Musician viewing `/perform/setlist/123` does *not* see the "Edit Setlist" button.

---
*Plan: 11-PLAN*
*Phase: 11-editor-performance-polish*