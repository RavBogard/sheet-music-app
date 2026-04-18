---
phase: 20-add-song-to-existing-setlist-from-library-view
verified: 2026-03-18T19:55:00Z
status: human_needed
score: 15/15 must-haves verified
re_verification: false
human_verification:
  - test: "Context menu 'Add to Setlist...' appears as FIRST item on right-click of a chart file"
    expected: "Bottom sheet slides up showing setlists with search"
    why_human: "Context menu ordering and touch/right-click behavior cannot be confirmed programmatically"
  - test: "End-to-end flow: pick setlist from sheet, sheet closes, toast appears with 'Added X to Y'"
    expected: "Toast displays within 5 seconds; Undo button present in toast"
    why_human: "Firestore write + toast display requires live app and real auth session"
  - test: "Undo removes only the added song without disturbing other concurrent edits"
    expected: "The undone track disappears; other tracks remain intact"
    why_human: "Requires real Firestore state and timing"
  - test: "Duplicate song warning: add a song already in the setlist"
    expected: "Toast says '[Song] is already in this setlist. Added again.' — song appears twice in setlist"
    why_human: "Requires live setlist with an existing track matching the song"
  - test: "Batch: select 3+ songs in SelectionActionBar, click 'Add N to Setlist'"
    expected: "Sheet opens; after picking setlist, single toast says 'Added N songs to [Setlist]'"
    why_human: "Requires select mode interaction and multiple file selection"
  - test: "Musician role: context menu item, batch button, and search result buttons hidden"
    expected: "No 'Add to Setlist...' visible in any entry point for musician account"
    why_human: "Requires switching to musician Firebase account"
  - test: "Add to Setlist button visible in ContentSearchResults for authorized user"
    expected: "After typing 3+ chars in library search, each content result row shows 'Add to Setlist...' button"
    why_human: "Requires content search index to have results and live auth"
  - test: "Add to Setlist button visible in SearchOverlay (setlist editor search)"
    expected: "Each result row in the SearchOverlay shows 'Add to Setlist...' button; clicking opens bottom sheet"
    why_human: "Requires navigating to a setlist, opening search overlay, and verifying button renders"
---

# Phase 20: Add Song to Existing Setlist from Library View — Verification Report

**Phase Goal:** Add song to existing setlist from library view — Spotify-like "Add to Playlist" interaction with bottom sheet picker, context menu trigger, batch support, search results integration. Band leaders and admins only.
**Verified:** 2026-03-18T19:55:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Hook exposes `openForSongs()`, `addToSetlist()`, undo, and `canAddToSetlist` | VERIFIED | `use-add-to-setlist.ts` returns all of these in its return object (lines 193-204) |
| 2 | Bottom sheet displays editable setlists sorted by most recent first | VERIFIED | `editableSetlists` `useMemo` sorts by `updatedAt` desc (lines 82-86 of hook); `AddToSetlistSheet.tsx` renders list |
| 3 | Selecting a setlist adds tracks and auto-closes the sheet | VERIFIED | `addToSetlist()` calls `setIsOpen(false)` before Firestore write (line 135); test "closes the sheet after adding" passes |
| 4 | Toast with undo appears after successful add | VERIFIED | `toast()` called with `action: { label: "Undo", onClick: ... }` at line 161; 15 hook tests pass including this |
| 5 | Undo removes only the specific added track IDs (not snapshot restore) | VERIFIED | Undo closure re-reads via `subscribeToSetlist` then filters by `undoTrackIds` (lines 166-183); concurrent-edit test passes |
| 6 | Duplicate songs show warning toast but still add | VERIFIED | `hasDuplicates` detected; song appended regardless; toast message uses "already in this setlist" branch (lines 147-148); test passes |
| 7 | Batch add shows single aggregate toast | VERIFIED | `pendingSongs.length > 1` produces "Added N songs to..." message (lines 152-153); batch test passes |
| 8 | Context menu item is the FIRST item in LibraryFileRow for chart files, hidden for folders/audio/musicians | VERIFIED | `canAddToSetlist && !isFolder && !isAudio && onAddToSetlist` condition renders before "Select / View" at line 217-223 of `LibraryFileRow.tsx` |
| 9 | Context menu item hidden for musicians | VERIFIED | `SongChartsLibrary` passes `canAddToSetlist={addToSetlist.canAddToSetlist}` which evaluates `isBandLeader || isAdmin`; musicians get `false` |
| 10 | SelectionActionBar batch button opens sheet (not placeholder toast) | VERIFIED | `onAddToSetlist?.(selectedItems)` at line 71 calls hook's `openForSongs`; button only renders when `onAddToSetlist` provided (line 64) |
| 11 | `SongChartsLibrary` orchestrates hook + sheet + passes callbacks to children | VERIFIED | `useAddToSetlist()` called at line 147; `AddToSetlistSheet` rendered at lines 369-378; callbacks passed to `LibraryFileRow`, `SelectionActionBar`, `ContentSearchResults` |
| 12 | Add to Setlist works from `ContentSearchResults` | VERIFIED | Props `canAddToSetlist` and `onAddToSetlist` added and wired (lines 28-36 of `ContentSearchResults.tsx`); button renders at lines 84-98 |
| 13 | Add to Setlist works from `SearchOverlay` | VERIFIED | Props `canAddToSetlist` and `onAddToSetlist` added (lines 27-29 of `SearchOverlay.tsx`); button renders at lines 180-193 |
| 14 | `SetlistEditorV2` wires hook + sheet + passes props to SearchOverlay | VERIFIED | `useAddToSetlist()` at line 97; `AddToSetlistSheet` imported and rendered (lines 42, 672-680); SearchOverlay receives `canAddToSetlist` and `onAddToSetlist` at lines 667-668 |
| 15 | All 26 unit tests pass | VERIFIED | `vitest run` output: 2 test files, 26 tests, 0 failures |

**Score:** 15/15 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/hooks/use-add-to-setlist.ts` | Shared state hook for add-to-setlist flow | VERIFIED | 206 lines; exports `useAddToSetlist`; substantive implementation |
| `src/components/library/AddToSetlistSheet.tsx` | Bottom sheet setlist picker component | VERIFIED | 139 lines; exports `AddToSetlistSheet`; full implementation with search, loading, empty states |
| `src/hooks/__tests__/use-add-to-setlist.test.ts` | Hook unit tests | VERIFIED | 15 tests covering permission gating, open/close, merge/sort/filter, toast, undo, duplicates, batch |
| `src/components/library/__tests__/add-to-setlist-sheet.test.tsx` | Sheet component unit tests | VERIFIED | 11 tests covering render, search, click, loading, empty, closed states |
| `src/components/library/LibraryFileRow.tsx` | Context menu with "Add to Setlist..." as first item | VERIFIED | Props `canAddToSetlist` and `onAddToSetlist` added; item renders before "Select / View" |
| `src/components/library/SelectionActionBar.tsx` | Batch "Add to Setlist" button wired to sheet | VERIFIED | `onAddToSetlist` prop added; button only shows for authorized users; no placeholder toast |
| `src/components/library/SongChartsLibrary.tsx` | Orchestrates hook + sheet + passes callbacks | VERIFIED | Imports both; passes props to all children; renders `AddToSetlistSheet` |
| `src/components/library/ContentSearchResults.tsx` | Add to Setlist action from search results | VERIFIED | `canAddToSetlist` and `onAddToSetlist` props; button per row with `ListPlus` icon |
| `src/components/setlist/v2/SearchOverlay.tsx` | Add to Setlist action from setlist search overlay | VERIFIED | `canAddToSetlist` and `onAddToSetlist` props; button per result row |
| `src/components/setlist/v2/SetlistEditorV2.tsx` | Passes canAddToSetlist/onAddToSetlist to SearchOverlay; renders AddToSetlistSheet | VERIFIED | All wiring present at lines 41-43, 97, 667-680 |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `use-add-to-setlist.ts` | `src/lib/setlist-firebase.ts` | `createSetlistService` + `updateSetlist` + `subscribeToSetlist` | WIRED | All three methods called: `createSetlistService` at line 51, `updateSetlist` at line 138, `subscribeToSetlist` at line 169 |
| `AddToSetlistSheet.tsx` | `use-add-to-setlist.ts` | receives hook state as props | WIRED | Component is purely props-driven; `SongChartsLibrary` bridges hook to sheet |
| `use-add-to-setlist.ts` | `sonner` | `toast()` with undo action | WIRED | `toast(message, { action: { label: "Undo", onClick: ... } })` at line 161 |
| `SongChartsLibrary.tsx` | `use-add-to-setlist.ts` | `useAddToSetlist()` hook call | WIRED | Line 147: `const addToSetlist = useAddToSetlist()` |
| `SongChartsLibrary.tsx` | `AddToSetlistSheet.tsx` | `<AddToSetlistSheet>` with hook state | WIRED | Lines 369-378 |
| `LibraryFileRow.tsx` | `SongChartsLibrary.tsx` | `onAddToSetlist` callback prop | WIRED | `onAddToSetlist={(item) => addToSetlist.openForSongs([item])}` at line 346 |
| `SelectionActionBar.tsx` | `SongChartsLibrary.tsx` | `onAddToSetlist` callback prop | WIRED | `onAddToSetlist={addToSetlist.canAddToSetlist ? (items) => addToSetlist.openForSongs(items) : undefined}` at line 365 |
| `SearchOverlay.tsx` | `SetlistEditorV2.tsx` | `onAddToSetlist` callback prop | WIRED | Lines 667-668 of `SetlistEditorV2.tsx` |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| P20-01 | 20-01, 20-02 | "Add to Setlist..." context menu item as FIRST item for admins/band leaders on non-folder, non-audio files | SATISFIED | `LibraryFileRow.tsx` lines 217-223: condition renders before "Select / View" |
| P20-02 | 20-01, 20-02 | Context menu item and batch action button hidden for musicians | SATISFIED | `canAddToSetlist = isBandLeader || isAdmin`; musician gets `false`; `SelectionActionBar` only shows button when `onAddToSetlist` provided |
| P20-03 | 20-01 | Bottom sheet picker with personal + public setlists sorted by most recent, with search/filter | SATISFIED | `editableSetlists` merges, dedupes, sorts by `updatedAt` desc, filters by `searchQuery`; `AddToSetlistSheet` renders search input and list |
| P20-04 | 20-01 | Selecting a setlist adds songs as tracks matching `addSongsFromLibrary` ID format, auto-closes sheet | SATISFIED | Track IDs use `track-${Date.now()}-${file.id}-${index}` format; `setIsOpen(false)` called before Firestore write |
| P20-05 | 20-01 | Toast with undo action shown after successful add, matching delete-track toast pattern | SATISFIED | `toast(message, { action: { label: "Undo", onClick }, duration: 5000 })` — same pattern as existing delete-track toast |
| P20-06 | 20-01 | Undo removes only the specific added track IDs (not snapshot restore) | SATISFIED | Undo re-reads via `subscribeToSetlist`, filters by `undoTrackIds`; concurrent-edit test verifies this |
| P20-07 | 20-01 | Duplicate song: warn but allow; toast says '"Song Name" is already in this setlist. Added again.' | SATISFIED | `hasDuplicates` check at line 115; toast message at line 148; song still appended; test passes |
| P20-08 | 20-02 | Batch add from SelectionActionBar: all selected songs to sheet picker, single aggregate toast | SATISFIED | `SelectionActionBar` passes all selected items to `openForSongs`; batch toast path triggered when `pendingSongs.length > 1` |

All 8 requirements (P20-01 through P20-08) are satisfied. No orphaned requirements found.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | — | — | — | — |

No placeholders, stubs, empty handlers, or console.log-only implementations found in any of the 10 files. The `toast` import remaining in `SelectionActionBar.tsx` is legitimate — it is used for the "Copy Names" button (line 58), not a remnant of the old placeholder.

---

### Commit Verification

All 6 commits documented in the summaries are confirmed present in git:

| Commit | Message |
|--------|---------|
| `fcf864f` | test(20-01): add failing tests for use-add-to-setlist hook |
| `be89b4e` | feat(20-01): implement use-add-to-setlist hook |
| `cf65dd4` | test(20-01): add failing tests for AddToSetlistSheet component |
| `33c1759` | feat(20-01): implement AddToSetlistSheet bottom sheet component |
| `b70a41a` | feat(20-02): wire useAddToSetlist hook into library entry points |
| `aa29157` | feat(20-02): add "Add to Setlist" to search results and setlist editor |

---

### Human Verification Required

All automated checks pass. The following items require verification on the deployed app (push to main on Vercel, then test):

#### 1. Context Menu Order and Interaction

**Test:** Navigate to Library as admin or band leader. Right-click (or long-press on mobile) any PDF/MusicXML chart file.
**Expected:** "Add to Setlist..." appears as the very first item in the context menu, above "Select / View".
**Why human:** Context menu rendering order and touch/right-click trigger require a real browser session.

#### 2. Full Add Flow: Context Menu to Toast

**Test:** Click "Add to Setlist...", pick a setlist from the bottom sheet.
**Expected:** Sheet closes immediately; toast appears with "Added [Song] to [Setlist]" and an "Undo" button visible for 5 seconds.
**Why human:** Requires live Firestore write and real auth session.

#### 3. Undo Behavior

**Test:** After adding a song and seeing the toast, click "Undo".
**Expected:** The song disappears from the setlist. Other tracks in the setlist are unaffected.
**Why human:** Requires real Firestore state.

#### 4. Duplicate Warning

**Test:** Add a song that is already present in the target setlist.
**Expected:** Toast says '"[Song Name]" is already in this setlist. Added again.' — the song appears twice in the setlist.
**Why human:** Requires a setlist with a known matching track.

#### 5. Batch Selection Flow

**Test:** Enter select mode in the library (tap the checkbox icon), select 3+ songs, click "Add N to Setlist" in the action bar.
**Expected:** Bottom sheet opens; after picking a setlist, a single toast says "Added 3 songs to [Setlist Name]".
**Why human:** Requires select mode UI interaction.

#### 6. Musician Role Gating

**Test:** Log in as a musician account (non-admin, non-band-leader). Check right-click context menu, selection action bar, content search results, and setlist editor search overlay.
**Expected:** "Add to Setlist..." button/item is absent from all four entry points.
**Why human:** Requires switching Firebase auth accounts.

#### 7. ContentSearchResults Button

**Test:** On the Library page, type a chord or lyric (3+ characters) to trigger content search. Observe the results section above the file list.
**Expected:** Each search result row shows a small "Add to Setlist..." button on the right side (only for admins/band leaders).
**Why human:** Requires content search index to have indexed songs and return results.

#### 8. SearchOverlay Button (Setlist Editor)

**Test:** Open a setlist in the editor, tap the "+" add button to open the SearchOverlay. Observe result rows.
**Expected:** Each result row shows "Add to Setlist..." button on the right. Clicking it opens the bottom sheet. Selecting a setlist adds to a DIFFERENT setlist than the one being edited.
**Why human:** Requires navigating into a setlist and verifying the overlay renders the new button.

---

### Summary

Phase 20 is fully implemented and automated verification confirms all 15 must-haves. The codebase matches SUMMARY claims exactly:

- The `useAddToSetlist` hook is a complete, substantive implementation (not a stub) with permission gating, dual-subscription setlist fetching, track creation matching the `addSongsFromLibrary` ID format, optimistic sheet close, toast with undo-by-ID-removal, duplicate detection, and batch toasts.
- `AddToSetlistSheet` is a full bottom sheet component with search, sorted setlist list with date/count, loading skeletons, empty state, and no-results state.
- All 4 entry points (LibraryFileRow context menu, SelectionActionBar batch button, ContentSearchResults, SearchOverlay) are wired to the hook and conditionally gated on `canAddToSetlist`.
- All 26 unit tests pass. All 6 documented commits exist in git.

The only remaining verification is end-to-end UX on the deployed app, which requires a live browser session with real Firebase auth.

---

_Verified: 2026-03-18T19:55:00Z_
_Verifier: Claude (gsd-verifier)_
