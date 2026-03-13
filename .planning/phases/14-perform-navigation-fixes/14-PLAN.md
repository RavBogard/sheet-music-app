# Plan 14: Perform Navigation Fixes

**Phase:** 14 - Perform Navigation Fixes
**Status:** Ready to execute

## Goal
Fix broken navigation links for "Perform" on the Setlist Dashboard and the "Next/Previous" arrows within the Performance Mode PDF overlay.

## Requirements
- ✓ The "Perform" button on setlist cards in the dashboard must route to `/perform/setlist/[id]`.
- ✓ The "Next" and "Previous" arrows in `SongNavigation.tsx` must switch the active PDF in place using the V2 architecture (`activeSongIndex`), rather than attempting to route to the deleted `/perform/[fileId]` legacy view.

## Proposed Changes

### 1. `src/components/setlist/SetlistDashboard.tsx`
- **Task**: Wire up the explicit "Perform" button on cards.
- **Action**: Both `UpcomingSetlistCard` and `SetlistCard` currently support an `onPerform` prop. In `SetlistDashboard.tsx`, pass `onPerform={() => router.push(\`/perform/setlist/\${setlist.id}\`)}` to these cards.
- **Action**: Check if the cards are already calling this prop or if they need to stop propagation of the click event.

### 2. `src/components/performance/SongNavigation.tsx`
- **Task**: Remove legacy routing.
- **Action**: Modify `SongNavigation` to accept an `onNavigate?: (index: number) => void` prop.
- **Action**: Change `handleNext` to call `nextSong()`, get the index of that song in the global queue, and call `onNavigate(index)`.
- **Action**: Actually, `PDFOverlay.tsx` expects the *global* `activeSongIndex` which corresponds to the `tracks` array in `SetlistPerformPage`. Wait, `SongNavigation` uses `queueIndex` from `useMusicStore`. `queueIndex` is the index of the `playbackQueue`.
- **Action**: `useMusicStore` has a `jumpToSong(index)` function that updates the store. But `PDFOverlay` is currently driven by the `activeSongIndex` state in `SetlistPerformPage`.
- **Action**: Let's align them. When `SongNavigation` clicks "Next", it calls `onNavigate(queueIndex + 1)`.

### 3. `src/components/performance/PerformanceToolbar.tsx`
- **Task**: Pass `onNavigate` through to `SongNavigation`.
- **Action**: Add `onNavigate?: (index: number) => void` to `PerformanceToolbarProps`.
- **Action**: Pass it down to all instances of `<SongNavigation />`.

### 4. `src/components/performance/PDFOverlay.tsx`
- **Task**: Connect `onNavigate` from `PerformanceToolbar`.
- **Action**: In `PDFOverlay`, pass `onNavigate={(i) => onNavigate(i)}` to `<PerformanceToolbar>`. 
- **Wait, how does `queueIndex` map to `activeSongIndex`?** `PDFOverlay` gets `tracks` (the full setlist) and `currentIndex`. `SongNavigation` uses `playbackQueue` which filters out headers. We must ensure `onNavigate` receives the *global* track index, not just the queue index.
- **Better approach for `SongNavigation.tsx`**: Since `useMusicStore` handles `nextSong()` and updates `queueIndex`, we can simply have a `useEffect` in `PDFOverlay.tsx` that listens to `queueIndex` and calls `onNavigate(playbackQueue[queueIndex].originalIndex)`. Wait, `QueueItem` has an `originalIndex`? Let's check `lib/store.ts`.

## Verification Criteria
- [ ] Clicking "Perform" on a Setlist Dashboard card goes to `/perform/setlist/123`.
- [ ] Clicking the right arrow in the PDF overlay advances to the next song in the setlist without a 404 error.
- [ ] No `router.replace('/perform/...')` calls remain in the codebase.