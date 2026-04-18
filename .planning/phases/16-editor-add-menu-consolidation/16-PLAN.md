# Plan 16: Editor Add Menu Consolidation

**Phase:** 16 - Editor Add Menu Consolidation
**Status:** Ready to execute

## Goal
Consolidate the "Add Song" and "Add Item" buttons at the bottom of the V2 Setlist Editor into a single, cohesive "Add Item" dropdown menu.

## Requirements
- ✓ Remove the standalone "Add Song" button.
- ✓ Convert the "Add Item" button into a `DropdownMenu` trigger.
- ✓ Include options for: Song (from library), Section Header, Note/Stage Direction, and Liturgy/Reading.
- ✓ Use clear Lucide icons for each menu item to comply with `ui-ux-pro-max`.

## Proposed Changes

### 1. `src/components/setlist/v2/SetlistEditorV2.tsx`
- **Task**: Locate the bottom action bar (usually fixed or sticky at the bottom of the editor).
- **Action**: Look for the `<Button onClick={() => setShowFilePicker(true)}>...Add Song</Button>` and the `<DropdownMenu>` or button for "Add Item".
- **Action**: Replace both with a single `<DropdownMenu>`.
- **Action**: The trigger should be a prominent `<Button className="w-full sm:w-auto" variant="brand"> <Plus /> Add Item </Button>`.
- **Action**: The content should be categorized:
  - `<DropdownMenuItem onClick={() => setShowFilePicker(true)}><Music /> Song from Library</DropdownMenuItem>`
  - `<DropdownMenuSeparator />`
  - `<DropdownMenuItem onClick={() => handleAddTrack('header')}><Heading1 /> Section Header</DropdownMenuItem>`
  - `<DropdownMenuItem onClick={() => handleAddTrack('prayer')}><BookOpen /> Liturgy / Reading</DropdownMenuItem>`
  - `<DropdownMenuItem onClick={() => handleAddTrack('note')}><StickyNote /> Stage Direction / Note</DropdownMenuItem>`
- **Note**: Check exact implementation of `handleAddTrack` in the file to see how it expects type arguments.

## Verification Criteria
- [ ] At the bottom of a setlist in edit mode, there is only one primary "Add Item" button.
- [ ] Clicking it opens a well-structured menu.
- [ ] Clicking "Song" opens the library modal.
- [ ] Clicking other options adds the respective rows.