# Plan 18: Monitor Scroll Polish

**Phase:** 18 - Monitor Scroll Polish
**Status:** Ready to execute

## Goal
Improve the horizontal scrolling physics of the monitor mixer on mobile devices so it feels smooth and prevents accidental fader adjustments.

## Requirements
- ✓ Remove `snap-mandatory` from `ScrollFade` to make scrolling less "sticky".
- ✓ Increase the horizontal gap between fader strips to provide a clear "swipe zone" for the user's thumb.

## Proposed Changes

### 1. `src/components/ui/scroll-fade.tsx`
- **Task**: Relax the CSS snap strictness.
- **Action**: Change `snap-x snap-mandatory` to `snap-x snap-proximity` in the `className` builder. This allows the browser to rest between faders if the user stops swiping gently, rather than violently forcing a snap.

### 2. `src/components/monitor/QuickMonitorPanel.tsx`
- **Task**: Increase horizontal dead space.
- **Action**: Change `scrollClassName="flex flex-row gap-1 p-3 min-h-[280px]"` to `gap-2` or `gap-3` (likely `gap-3` which is 12px) so there is a clear channel between the fader touch targets where a thumb can safely drag horizontally.

## Verification Criteria
- [ ] Swiping horizontally on the mixer feels native and doesn't get "stuck".
- [ ] There is visible padding between faders.