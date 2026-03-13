# Plan 13: Print Modal UX & Performance Access

**Phase:** 13 - Print Modal UX
**Status:** Ready to execute

## Goal
Fix the layout of the `PrintModal` so the primary action buttons are always visible without scrolling, and add a "Print" button to the `PerformanceToolbar` for authorized users.

## Requirements
- ✓ The "Print" and "Download PDF" buttons in `PrintModal` must be strictly fixed to the bottom of the viewport, regardless of how long the middle content (musician list, transposition list) is.
- ✓ A new "Print" button (Printer icon) must be added to the `PerformanceToolbar` next to the "Edit" button.
- ✓ The "Print" button in the toolbar must be visible to `isMusician`, `isBandLeader`, and `isAdmin` users.
- ✓ Clicking the toolbar button must open the `PrintModal` within the context of the performance view.

## Proposed Changes

### 1. `src/components/setlist/PrintModal.tsx` (Layout Fix)
- **Task**: Fix the sticky footer issue.
- **Action**: The outermost wrapper is `fixed inset-0 ... flex items-start sm:items-center`. On mobile (`items-start`), if the modal height exceeds the screen, it grows downwards.
- **Action**: Change the inner container `max-h-[95vh] sm:max-h-[90vh]` to `h-[95vh] sm:h-auto sm:max-h-[90vh]`. By forcing `h-[95vh]` on mobile, the `flex-col` will strictly confine the inner scroll area (`flex-1 min-h-0 overflow-y-auto`) and guarantee the footer (`shrink-0`) stays pinned to the bottom.
- **Action**: Ensure the content wrapper has `overflow-y-auto min-h-0`.

### 2. `src/components/performance/PerformanceToolbar.tsx` (New Button)
- **Task**: Add the print button.
- **Action**: Update `useAuth()` to extract `isMusician`, `isBandLeader`, `isAdmin`. If any of these are true, the user can print.
- **Action**: Add `printButton` function next to `editButton`.
- **Action**: Since `PerformanceToolbar` doesn't have the full setlist data (only `useMusicStore` queue), we need to check if we can lift the modal to `PDFOverlay.tsx` or `page.tsx`, OR if we can fetch the necessary data. Actually, `PDFOverlay` has access to the full `tracks` list via `useMusicStore`.
- **Action**: We will mount `<PrintModal>` inside `PDFOverlay.tsx` (which is the parent of the toolbar). We will pass a new callback `onPrint?: () => void` to `PerformanceToolbar`.

### 3. `src/components/performance/PDFOverlay.tsx` (Modal Mounting)
- **Task**: Mount the modal when triggered.
- **Action**: Add `[showPrintModal, setShowPrintModal] = useState(false)`.
- **Action**: Pass `onPrint={() => setShowPrintModal(true)}` down to `PerformanceToolbar`.
- **Action**: Render `<PrintModal>` conditionally. Pass the `tracks` from the store, and get the `setlistId` and `setlistName` (if available in store or passed down).
- **Action**: Wait, `useMusicStore` doesn't store the setlist *name* or *date*. Let's check `src/app/perform/setlist/[id]/page.tsx` where `useSetlistPerformance` is called. That page has the full `setlist` object.
- **Action**: The best place to mount `<PrintModal>` is actually in `src/app/perform/setlist/[id]/page.tsx`, and pass the open trigger down to `PerformanceToolbar` (which is rendered by `PDFOverlay`... wait, `PDFOverlay` is rendered by `page.tsx`).
- **Action**: Let's trace the component tree to find the cleanest place to mount it.

## Verification Criteria
- [ ] Open Print Modal on mobile/desktop: The middle content scrolls, but the Print/Download buttons are firmly fixed at the bottom.
- [ ] Musician opens Performance Mode: Sees a Printer icon in the bottom toolbar.
- [ ] Clicking Printer icon in Performance Mode opens the Print Modal with the correct setlist data.
- [ ] Guest opens Performance Mode: Does *not* see the Printer icon.