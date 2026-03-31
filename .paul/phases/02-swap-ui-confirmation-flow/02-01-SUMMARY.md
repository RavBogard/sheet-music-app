---
phase: 02-swap-ui-confirmation-flow
plan: 01
subsystem: ui, performance
tags: [swap-ui, bottom-sheet, performance-view, live-swap, touch-targets]

requires:
  - phase: 01-01
    provides: swapLiveTrack(), useLiveSwapAccess(), useSongGroups()
provides:
  - SwapButton component on eligible SetlistRows
  - SwapBottomSheet with alternatives and "Swap Now" flow
  - Complete director-facing 3-tap swap initiation
affects: [02-02-receiver-toast, phase-3-receiver]

tech-stack:
  added: []
  patterns: [bottom sheet for mobile selection, stopPropagation for nested click handlers, useCallback for stable swap handler]

key-files:
  created:
    - src/components/performance/SwapButton.tsx
    - src/components/performance/SwapBottomSheet.tsx
  modified:
    - src/components/performance/SetlistRow.tsx
    - src/components/performance/SetlistView.tsx
    - src/app/perform/setlist/[id]/page.tsx
    - src/hooks/use-setlist-performance.ts

key-decisions:
  - "3-tap flow without separate confirm: tap icon → sheet → tap alternative (Swap Now label is the affordance)"
  - "getAlternativesByFileId fallback when track lacks liturgicalSlot"
  - "swapTarget state holds both index and track data for the bottom sheet"
  - "useAuth called twice (existing + user) to avoid breaking destructure pattern"

patterns-established:
  - "SwapButton uses stopPropagation to prevent row click-through"
  - "Bottom sheet: fixed positioning, backdrop blur, slide-in animation, 56px touch targets"
  - "hasAlternatives callback passed as prop through SetlistView → SetlistRow"

duration: ~15min
completed: 2026-03-30
---

# Phase 2 Plan 01: Director Swap UI

**SwapButton on eligible SetlistRows + SwapBottomSheet with 3-tap swap flow wired to swapLiveTrack().**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~15 min |
| Completed | 2026-03-30 |
| Tasks | 3 completed (2 auto + 1 checkpoint) |
| Files created | 2 |
| Files modified | 4 |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: SwapButton on eligible rows | Pass | Conditional on canSwap + isLiveMode + hasAlternatives; 44px target |
| AC-2: SwapBottomSheet with alternatives | Pass | Slot label, current song, alternatives with key badges, 56px targets |
| AC-3: Swap Now executes swap | Pass | Calls swapLiveTrack() with correct params, disables during async |
| AC-4: Build passes | Pass | tsc --noEmit + next build clean |

## Accomplishments

- Created SwapButton with amber styling, 44px touch target, focus ring, aria-label
- Created SwapBottomSheet with backdrop, slide-in animation, 56px alternative rows, "Swap Now" labels
- Wired complete swap flow through SetlistRow → SetlistView → SetlistPerformPage
- Extended useSetlistPerformance to expose liveState and setlistId

## Deviations from Plan

None — plan executed exactly as written.

## Next Phase Readiness

**Ready:**
- Director can initiate swaps via 3-tap flow
- Plan 02 (SwapToast + PDF reload) can build on this

**Concerns:**
- Musicians don't yet see swap notifications (Plan 02)
- PDF doesn't reload when a swap changes the current track (Plan 02)

**Blockers:** None

---
*Phase: 02-swap-ui-confirmation-flow, Plan: 01*
*Completed: 2026-03-30*
