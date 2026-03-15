---
wave: 1
files_modified:
  - "src/components/setlist/SetlistDashboard.tsx"
  - "src/components/setlist/SetlistCards.tsx"
  - "src/components/performance/SongNavigation.tsx"
autonomous: true
---
# Phase 14, Wave 1: Perform Navigation Fixes

**Phase:** 14 - Perform Navigation Fixes
**Status:** Approved for execution

## Goal
Fix broken navigation links by routing Dashboard Setlist cards directly to the Performance View (with an explicit "Edit" button) and repairing the "Next/Previous" arrows in the PDF overlay to utilize the V2 Architecture.

## Context Extract
1. The Band Leader cannot click "Perform" from the Setlists page smoothly. Clicking the card goes to the Editor.
2. The `SongNavigation` component in the `PerformanceToolbar` relies on `router.replace('/perform/${next.fileId}')` which attempts to hit the deleted V1 legacy engine, causing 404s.

## Implementation Details

```xml
<tasks>
  <task id="14-1" title="Rewire Dashboard Setlist Cards to Perform Route">
    <description>
    Update `/src/components/setlist/SetlistCards.tsx` and `/src/components/setlist/SetlistDashboard.tsx`:
    1. In `SetlistCards.tsx`, `UpcomingSetlistCard` and `SetlistCard` accept `onClick` and `onPerform` props. Currently, `onClick` is bound to the whole button (the card), and `onPerform` is a separate button inside. 
    2. We will swap the semantic intent: the `onClick` prop (the whole card) will trigger navigation to the Gig view `/perform/setlist/[id]`.
    3. The internal "Perform" button will be changed to an explicit "Edit Setlist" button. It will inherit the old behavior (triggering the `onEdit` or `onPerform` prop to route to `/setlists/[id]`).
    4. In `SetlistDashboard.tsx`, adjust the `handleSelect` (which currently routes to `/setlists/[id]`) to be the new "Edit" action. 
    5. Pass an explicit `onPerform={() => router.push('/perform/setlist/' + setlist.id)}` into the cards where `onClick` currently sits. Wait, no. We can just change `SetlistDashboard` to pass the correct routes!
        - `SetlistDashboard` passes `onClick={() => handleSelect(setlist)}` (goes to editor).
        - `SetlistDashboard` passes `onPerform={(e) => { e.stopPropagation(); router.push('/perform/setlist/' + setlist.id) }}`.
    6. **Wait the user explicitly requested:** "Clicking the *entire Setlist Card* will route the user directly to the Gig View... An explicit 'Edit' button will be added to the card".
    7. Therefore: 
        - In `SetlistDashboard.tsx`, change `handleSelect` to `router.push('/perform/setlist/' + setlist.id)`. (Now clicking anywhere on the card goes to perform mode).
        - Pass a new prop `onEdit` to `UpcomingSetlistCard` and `SetlistCard` which does `router.push('/setlists/' + setlist.id)`.
        - Inside `SetlistCards.tsx`, replace the `<Button onClick={onPerform}>Perform</Button>` with `<Button onClick={onEdit}>Edit Setlist</Button>` (using `Pencil` icon instead of `PlayCircle`).
    </description>
  </task>

  <task id="14-2" title="Repair SongNavigation Next/Prev Arrows">
    <description>
    Update `/src/components/performance/SongNavigation.tsx`:
    1. Remove `const router = useRouter()`.
    2. Remove the legacy code entirely (`router.replace`). Wait, there is no `router.replace` in the file currently! 
    3. Looking at the code: `handleNext = () => { nextSong() }`. `nextSong()` mutates `queueIndex` in `useMusicStore`.
    4. The problem is that `PDFOverlay.tsx` (which contains `SongNavigation`) only updates its internal `activeSongIndex` if `onNavigate` is called, but currently `SongNavigation` isn't firing `onNavigate` and `PDFOverlay` isn't translating `queueIndex` back to `activeSongIndex` correctly in all edge cases.
    5. Actually, `useMusicStore` handles bounds. Let's check `SongNavigation.tsx` code:
        - `disabled={queueIndex <= 0}`
        - `disabled={queueIndex >= playbackQueue.length - 1}`
    6. This ALREADY handles the user's second request ("The Next/Previous arrows will simply disable/gray out when reaching the beginning or end of the setlist, rather than wrapping around").
    7. But why is it breaking? Ah, `PDFOverlay.tsx` lines 101-116 have a synchronization block:
        ```typescript
        // When toolbar navigates (queueIndex changes), translate back to setlist index
        useEffect(() => {
            // ...
            if (queueIndex >= 0 && queueIndex < songTracks.length) {
                const setlistIndex = songTracks[queueIndex].setlistIndex
                if (setlistIndex !== currentIndex) {
                    onNavigate(setlistIndex)
                }
            }
        }, [queueIndex, tracks, currentIndex, onNavigate])
        ```
    8. Is it possible `nextSong()` in `useMusicStore` has an issue? Or maybe there IS no issue with the arrows wrapping (since the code says `disabled={queueIndex >= playbackQueue.length - 1}`), but the bug report says "The `SongNavigation` component... is attempting to route to the deleted legacy engine".
    9. Let's re-read the context. Ah, my first scan of `SongNavigation.tsx` showed NO `router.replace`. The bug might have already been partially fixed, or maybe I am misinterpreting. Wait, `nextSong()` inside `useMusicStore` must be doing the `router.replace`!
    10. I need to check `src/lib/store.ts` for `nextSong` and `prevSong`.
    </description>
  </task>
</tasks>
```

## Validation
1. Verify `SetlistDashboard.tsx` clicking logic works correctly (card -> gig, edit button -> editor).
2. Verify `useMusicStore` does not invoke router pushes.
