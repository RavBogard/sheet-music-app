# Phase 13: Print Modal UX & Performance Access - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase addresses two specific issues with the "Gig Packet" (Print) functionality:
1. **Modal Layout Issue:** The `PrintModal` content is pushing the primary action buttons ("Print" / "Download") off-screen, requiring users to scroll down. The layout needs to be constrained so the header and footer (actions) are always sticky and visible, while only the middle content scrolls.
2. **Access from Performance Mode:** The "Gig Packet" button is currently only in the Editor. It needs to be added to the `PerformanceToolbar` (next to the "Edit" button) and made accessible to all authenticated users (`isMusician` and above).

</domain>

<decisions>
## Implementation Decisions

### 1. Print Modal Layout Fix
- **Decision:** The `PrintModal` uses Tailwind's `flex-1` and `overflow-y-auto` for the middle section, but the parent container might not be constraining its height properly, causing the whole modal to grow beyond the viewport on some screens.
- **Decision:** Ensure the modal container (`div.bg-card`) has `max-h-[90vh] flex flex-col`, the header has `shrink-0`, the content area has `flex-1 overflow-y-auto min-h-0`, and the footer has `shrink-0 p-4 bg-background sticky bottom-0 border-t`.
- **Decision:** Check if `TransposeTrackList` or `PrintModeSelector` is forcing the modal to expand unnecessarily.

### 2. Performance Toolbar Access
- **Decision:** Add a "Print" (Printer icon) button to the `PerformanceToolbar`.
- **Decision:** It should sit next to the "Edit" button.
- **Decision:** It should be visible to `isMusician`, `isBandLeader`, and `isAdmin` (basically, any logged-in user who isn't just a community member or guest).
- **Decision:** Clicking it will mount the `PrintModal` directly over the performance view. We will need to pass the current setlist data to the toolbar, or have the toolbar trigger a state that opens the modal.

</decisions>

<code_context>
## Existing Code Insights

### `src/components/setlist/PrintModal.tsx`
- The outermost wrapper is `fixed inset-0 ...`.
- The inner modal is `bg-card rounded-xl w-full max-w-lg max-h-[95vh] sm:max-h-[90vh] flex flex-col`.
- The actions div is `p-4 border-t border-border shrink-0 space-y-3`.
- The bug likely stems from the fact that `max-h-[90vh]` works, but if the content is long, the user still has to scroll *inside* the modal to see the buttons. Actually, the prompt says "it opens up a view where the actual print menu is 'below' everything, and you have to scroll down significantly to access it." Wait, if the footer is `shrink-0` in a `flex flex-col` container with a fixed height, the footer *should* stick to the bottom. I need to review the exact HTML structure of the modal.

### `src/components/performance/PerformanceToolbar.tsx`
- Already has `isBandLeader` from `useAuth()`. We will add `isMusician` or simply check `user` since `proxy.ts` allows public access. We only want musicians+ to see the print button.

</code_context>

---

*Phase: 13-print-modal-ux*
*Context gathered: 2026-03-13*