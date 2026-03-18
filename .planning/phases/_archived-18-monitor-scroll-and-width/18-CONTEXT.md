# Phase 18: Monitor Scroll Polish - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase specifically addresses horizontal scrolling friction within the `QuickMonitorPanel.tsx` and the `VerticalFaderStrip.tsx` on mobile devices. The user noted that "it just needs to be able to scroll well if that's what's happening."

</domain>

<decisions>
## Implementation Decisions

### 1. Fader Strip Width & Touch Targets
- **Decision:** The `VerticalFaderStrip` is currently hardcoded to `w-14 min-w-[48px]`. We need to ensure this is wide enough for a thumb but narrow enough to fit several on screen. A `w-14` (56px) is a solid touch target.
- **Decision:** The `snap-start` class is applied to the fader strip, but the parent container `ScrollFade` is applying `snap-x snap-mandatory`. This combination can make scrolling feel "sticky" or "stuck" if the user doesn't swipe hard enough, as `snap-mandatory` forces the browser to rest strictly on an element boundary.
- **Decision:** Relax `snap-mandatory` to `snap-proximity` in the `ScrollFade` component, or remove snapping entirely if it feels too rigid for a mixer interface.

### 2. Scroll Container Padding
- **Decision:** The `ScrollFade` inner container uses `flex flex-row gap-1 p-3 min-h-[280px]`. On mobile, `gap-1` is very tight, which might make it easy to accidentally adjust a fader while trying to scroll horizontally.
- **Decision:** Increase the horizontal gap slightly (`gap-2` or `gap-3`) so there is clear "dead space" between faders for the user to initiate a swipe without triggering a fader movement.

</decisions>

---

*Phase: 18-monitor-scroll-and-width*
*Context gathered: 2026-03-13*