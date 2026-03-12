---
phase: 16-design-token-accessibility
plan: 01
subsystem: ui
tags: [tailwind, accessibility, aria-label, design-tokens, dark-mode]

requires:
  - phase: 15-setlist-only-print
    provides: stable UI baseline
provides:
  - All hardcoded colors replaced with design system tokens
  - aria-label on all icon-only buttons in scope
  - Dark mode variants on GlobalAlertBanner
  - Descriptive logo alt text
affects: [17-ipad-safe-areas, 19-final-audit]

tech-stack:
  added: []
  patterns:
    - Use bg-background/bg-foreground instead of bg-black/text-white
    - Use bg-destructive token instead of hardcoded red-500
    - All icon-only buttons must have aria-label

key-files:
  created: []
  modified:
    - src/components/performance/FlowItemView.tsx
    - src/components/performance/MetronomeControl.tsx
    - src/components/layout/GlobalAlertBanner.tsx
    - src/components/ui/error-state.tsx
    - src/components/nav/DesktopHeader.tsx
    - src/components/audio/AudioPlayer.tsx
    - src/components/calendar/CalendarHeader.tsx
    - src/components/library/SongChartsLibrary.tsx
    - src/components/music/TransposerMenu.tsx
    - src/components/admin/SoundSystemSection.tsx
    - src/app/(main)/manage/page.tsx
    - src/app/(main)/schedule/page.tsx
    - src/app/(main)/settings/page.tsx
    - src/app/(main)/manage/templates/page.tsx
    - src/app/(main)/manage/templates/TemplateEditor.tsx
    - src/app/(main)/settings/sound/page.tsx

key-decisions:
  - "bg-background/40 for semi-transparent overlays (not custom token)"
  - "aria-label preferred over sr-only spans for icon buttons"
  - "UserRow buttons already had title attributes — no changes needed"

patterns-established:
  - "All new icon-only buttons must include aria-label"
  - "Use destructive token for error states, not hardcoded red-500"

duration: ~8min
completed: 2026-03-12
---

# Phase 16 Plan 01: Design Token Cleanup & Accessibility Summary

**Replaced hardcoded colors with design tokens across 4 files and added aria-label to 20 icon-only buttons across 12 files.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~8 min |
| Completed | 2026-03-12 |
| Tasks | 2 completed |
| Files modified | 16 |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Hardcoded colors replaced | Pass | FlowItemView, MetronomeControl, error-state all use tokens |
| AC-2: Dark mode variants on GlobalAlertBanner | Pass | dark: bg and border added for info/warning/error |
| AC-3: All icon-only buttons have aria-label | Pass | 20 labels added; UserRow already had title attrs |
| AC-4: Logo alt text descriptive | Pass | "Central Reform Congregation logo" |
| AC-5: Build and tests pass | Pass | Build clean, 1117/1117 tests pass |

## Accomplishments

- Replaced `bg-black text-white` with `bg-background text-foreground` in FlowItemView (performance view)
- Replaced `bg-black/40` and `bg-black/50` with `bg-background/40` and `bg-background/50` in MetronomeControl
- Added `dark:` bg/border variants to all three GlobalAlertBanner alert types
- Replaced all `bg-red-500/10` and `text-red-500` with `bg-destructive/10` and `text-destructive` in error-state
- Added aria-label to 20 icon-only buttons across AudioPlayer, CalendarHeader, SongChartsLibrary, TransposerMenu, SoundSystemSection, and 6 page-level back/action buttons

## Files Modified

| File | Change | Purpose |
|------|--------|---------|
| FlowItemView.tsx | Modified | bg-black → bg-background, text-white → text-foreground |
| MetronomeControl.tsx | Modified | bg-black/40 → bg-background/40, bg-black/50 → bg-background/50 |
| GlobalAlertBanner.tsx | Modified | Added dark: variants to bg and border for all alert types |
| error-state.tsx | Modified | red-500 → destructive token throughout |
| DesktopHeader.tsx | Modified | alt="Logo" → alt="Central Reform Congregation logo" |
| AudioPlayer.tsx | Modified | 4 aria-labels (skip back, play/pause, skip forward, mute/unmute) |
| CalendarHeader.tsx | Modified | 2 aria-labels (prev/next month) |
| SongChartsLibrary.tsx | Modified | 1 aria-label (back to library) |
| TransposerMenu.tsx | Modified | 2 aria-labels (transpose down/up) |
| SoundSystemSection.tsx | Modified | 1 aria-label (copy setup code) |
| manage/page.tsx | Modified | 1 aria-label (back) |
| schedule/page.tsx | Modified | 3 aria-labels (back, calendar toggle) |
| settings/page.tsx | Modified | 2 aria-labels (back, save name) |
| templates/page.tsx | Modified | 1 aria-label (back to manage) |
| TemplateEditor.tsx | Modified | 1 aria-label (remove linked chart) |
| settings/sound/page.tsx | Modified | 1 aria-label (back to manage) |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| bg-background/40 for overlays | Follows existing token system; no need for custom opacity token | Consistent with Tailwind CSS variable system |
| aria-label over sr-only | aria-label is preferred for icon buttons per WCAG; sr-only better for complex content | Simpler, more maintainable |
| UserRow skipped | Already had title attributes which provide accessibility | No unnecessary changes |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | MetronomeControl had second bg-black/50 instance |
| Scope additions | 0 | — |
| Deferred | 0 | — |

**Total impact:** Minor — caught additional hardcoded color in same file.

### Auto-fixed Issues

**1. Additional bg-black/50 in MetronomeControl**
- **Found during:** Task 1
- **Issue:** Second `bg-black/50` on the blinking light button (line 41)
- **Fix:** Replaced with `bg-background/50`
- **Verification:** Build passes

## Issues Encountered

None

## Next Phase Readiness

**Ready:**
- All design tokens consistent across performance views
- Accessibility baseline established for icon buttons
- Phase 17 (iPad Safe Areas & Spacing) can proceed

**Concerns:**
- None

**Blockers:**
- None

---
*Phase: 16-design-token-accessibility, Plan: 01*
*Completed: 2026-03-12*
