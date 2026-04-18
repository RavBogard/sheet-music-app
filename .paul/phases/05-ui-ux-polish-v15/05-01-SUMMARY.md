---
phase: 05-ui-ux-polish-v15
plan: 01
subsystem: ui
tags: [accessibility, responsive, tailwind, wcag, tablet]

requires:
  - phase: 04-quality-deps-v15
    provides: clean test environment, ESLint exhaustive-deps
provides:
  - Skip-to-main-content keyboard navigation link
  - Mobile zoom indicator with +/- controls
  - Tablet landscape sidebar toolbar layout for performance mode
  - PerformanceToolbar layout prop (bottom vs sidebar)
affects: [06-performance-monitoring-v15]

tech-stack:
  added: []
  patterns:
    - "PerformanceToolbar layout prop pattern (bottom | sidebar) for responsive layout switching"
    - "PDFOverlay renders two toolbar instances (hidden/shown by breakpoint) to avoid Radix popover portal conflicts"

key-files:
  modified:
    - src/app/layout.tsx
    - src/app/(main)/layout.tsx
    - src/app/perform/layout.tsx
    - src/components/performance/PerformanceToolbar.tsx
    - src/components/performance/PDFOverlay.tsx

key-decisions:
  - "4 of 7 roadmap items already satisfied — reduced-motion, focus trapping, LibraryFileRow colors, ghost hover"
  - "Tablet sidebar rendered as separate PerformanceToolbar instance with layout='sidebar' prop to avoid Radix popover conflicts across hidden breakpoints"

patterns-established:
  - "Skip link pattern: sr-only focus:not-sr-only with brand colors and ring focus indicator"
  - "Responsive toolbar layout switching via layout prop rather than CSS-only hiding"

duration: ~15min
completed: 2026-03-10
---

# Phase 5 Plan 01: UI/UX Polish Summary

**Skip-to-main-content link, mobile zoom indicator with +/- controls, and tablet landscape sidebar toolbar layout for performance mode.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~15min |
| Completed | 2026-03-10 |
| Tasks | 3 completed |
| Files modified | 5 |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Tablet Landscape Layout | Pass | At ≥ 1024px, PDFOverlay switches to flex-row with sidebar toolbar |
| AC-2: Mobile Zoom Indicator | Pass | Compact zoom controls (ZoomOut / percentage / ZoomIn) in mobile Row 1 |
| AC-3: Skip-to-Main-Content Link | Pass | Skip link in root layout, id="main-content" on both main layouts |

## Accomplishments

- Added skip-to-main-content link as first focusable element in root layout with brand-colored focus styling and ring indicator
- Added compact zoom controls to mobile toolbar Row 1 with ±0.1 step buttons and percentage display
- Created tablet landscape sidebar layout: vertical toolbar on right side with icon-only buttons and left-side popover menus
- Refactored PerformanceToolbar to accept `layout` prop ("bottom" | "sidebar") — extracted shared sub-components (zoomControls, syncButton, monitorPopover, transposerPopover, annotateButton) to eliminate duplication across 3 layout tiers
- PDFOverlay switches from `flex-col` to `flex-row` at `lg:` breakpoint, rendering separate toolbar instances per breakpoint to avoid Radix portal conflicts

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/app/layout.tsx` | Modified | Added skip-to-main-content `<a>` tag with sr-only/focus styles |
| `src/app/(main)/layout.tsx` | Modified | Added `id="main-content"` to `<main>` element |
| `src/app/perform/layout.tsx` | Modified | Added `id="main-content"` to performance wrapper div |
| `src/components/performance/PerformanceToolbar.tsx` | Modified | Added `layout` prop, sidebar layout mode, mobile zoom controls, extracted shared helpers |
| `src/components/performance/PDFOverlay.tsx` | Modified | Switched to `flex-col lg:flex-row` layout, renders bottom/sidebar toolbar by breakpoint |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| 4 roadmap items already done | prefers-reduced-motion, Radix focus trap, LibraryFileRow brand colors, ghost hover opacity all already implemented | Reduced Phase 5 to 3 tasks |
| Separate toolbar instances per breakpoint | Radix popovers use portals that conflict when hidden by CSS breakpoints (dismiss layer fires onOpenChange(false) immediately on the hidden instance) | Each breakpoint gets its own popover state — mobile/desktop/tablet transposer states are independent |
| Tablet breakpoint at lg (1024px) | Matches iPad landscape and standard tablet viewports; desktop pushed to xl would require too many breakpoint changes elsewhere | Tablet gets sidebar at 1024px+; kept desktop bottom bar at same lg breakpoint within PDFOverlay only |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Scope reduction | 4 items | Already satisfied — no work needed |
| Approach change | 1 | Kept desktop bottom bar at lg instead of pushing to xl — avoids cascading breakpoint changes |

**Total impact:** Scope was smaller than expected. Approach deviation is cosmetic — desktop users still get the full single-row bottom bar.

### Detail

The plan originally called for pushing desktop layout from `lg:` to `xl:` (1280px+). Instead, the sidebar layout is rendered via the `layout="sidebar"` prop within PDFOverlay only, controlled by `lg:hidden` / `hidden lg:flex` wrappers in PDFOverlay. This means:
- PDFOverlay at ≥1024px: sidebar layout
- FlowItemView (non-song items): always bottom layout (no PDF to put beside)
- Standalone PerformanceToolbar usage: defaults to bottom layout

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| None | — |

## Verification Results

- `npx tsc --noEmit`: Pass (zero errors)
- `npx vitest run pdf-overlay.test.tsx`: 3/3 tests pass
- Skip link: `<a href="#main-content">` present in root layout
- Mobile zoom: compact controls rendered in mobile Row 1
- Tablet sidebar: `layout="sidebar"` renders vertical toolbar with icon buttons

## Next Phase Readiness

**Ready:**
- All UI/UX polish items from roadmap addressed (7/7 — 4 pre-existing, 3 built)
- Phase 5 complete (1 plan)
- Codebase ready for Phase 6: Performance & Monitoring

**Concerns:**
- None

**Blockers:**
- None

---
*Phase: 05-ui-ux-polish-v15, Plan: 01*
*Completed: 2026-03-10*
