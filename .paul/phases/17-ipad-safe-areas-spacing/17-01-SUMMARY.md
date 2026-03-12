---
phase: 17-ipad-safe-areas-spacing
plan: 01
subsystem: ui
tags: [safe-area, ipad, spacing, popover, touch-target, css-custom-properties]

requires:
  - phase: 16-design-token-accessibility
    provides: design token baseline
provides:
  - Safe area inset utilities for all edges (pt/pr/pb/pl-safe)
  - viewport-fit: cover for iPad notch support
  - Larger setlist drawer height
  - Consistent popover padding (p-0 for custom content)
  - 44px BPM input touch target
  - CSS custom properties for brand glow shadows
affects: [19-final-audit]

tech-stack:
  added: []
  patterns:
    - Safe area utilities via @utility in globals.css
    - --shadow-brand-glow and --shadow-brand-glow-soft CSS custom properties
    - Popovers with custom content use p-0

key-files:
  created: []
  modified:
    - src/app/globals.css
    - src/app/layout.tsx
    - src/components/performance/SetlistDrawer.tsx
    - src/components/performance/PerformanceToolbar.tsx
    - src/components/performance/MetronomeControl.tsx
    - src/components/nav/MobileTabBar.tsx
    - src/components/ui/key-picker.tsx

key-decisions:
  - "p-0 for popovers with custom content, p-4 default for inline content"
  - "CSS custom properties for shadows instead of Tailwind extend"
  - "viewport-fit: cover added to layout.tsx viewport export"

patterns-established:
  - "Popovers rendering custom panels use p-0 and manage own padding"
  - "Brand glow shadows use --shadow-brand-glow / --shadow-brand-glow-soft"

duration: ~5min
completed: 2026-03-12
---

# Phase 17 Plan 01: iPad Safe Areas & Spacing Summary

**Added safe area insets for all edges, increased setlist drawer height, standardized popover padding to p-0, fixed BPM touch target to 44px, and tokenized MobileTabBar shadows.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~5 min |
| Completed | 2026-03-12 |
| Tasks | 2 completed |
| Files modified | 7 (+1 layout.tsx for viewport-fit) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Safe area insets all edges | Pass | pt-safe, pr-safe, pb-safe, pl-safe defined; viewport-fit: cover added |
| AC-2: Setlist drawer more screen space | Pass | max-h-[calc(100vh-120px)] replaces max-h-[60vh] |
| AC-3: Popover padding consistent | Pass | All custom-content popovers now p-0 |
| AC-4: BPM touch target 44px | Pass | h-8 → h-11 on MetronomeControl input container |
| AC-5: MobileTabBar shadows tokenized | Pass | 3 arbitrary values → 2 CSS custom properties |
| AC-6: Build and tests pass | Pass | Build clean, 1117/1117 tests pass |

## Accomplishments

- Added pt-safe, pr-safe, pl-safe utilities alongside existing pb-safe in globals.css
- Added viewport-fit: cover to Next.js viewport export for iPad notch support
- SetlistDrawer uses calc-based height for better iPad screen utilization
- Standardized 3 popover components from p-3 to p-0 (PerformanceToolbar monitor, MobileTabBar search, key-picker)
- MetronomeControl BPM input container increased from h-8 (32px) to h-11 (44px)
- Created --shadow-brand-glow and --shadow-brand-glow-soft CSS custom properties
- Replaced 3 arbitrary shadow-[...] values in MobileTabBar with CSS variable references

## Files Modified

| File | Change | Purpose |
|------|--------|---------|
| globals.css | Modified | Added 3 safe area utilities + 2 shadow CSS custom properties |
| layout.tsx | Modified | Added viewport-fit: cover |
| SetlistDrawer.tsx | Modified | max-h-[60vh] → max-h-[calc(100vh-120px)] |
| PerformanceToolbar.tsx | Modified | Monitor popover p-3 → p-0 |
| MetronomeControl.tsx | Modified | BPM container h-8 → h-11 |
| MobileTabBar.tsx | Modified | Search popover p-3 → p-0; 3 shadows → CSS variables |
| key-picker.tsx | Modified | Popover p-3 → p-0 |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | Added viewport-fit: cover to layout.tsx (plan mentioned checking, it was missing) |
| Scope additions | 0 | — |
| Deferred | 0 | — |

**Total impact:** Essential addition — viewport-fit: cover required for safe area insets to work.

## Issues Encountered

None

## Next Phase Readiness

**Ready:**
- Phase 18 (Backend Hardening) can proceed — no frontend dependencies
- Safe area utilities available for any future layout work

**Concerns:**
- Popover p-0 changes may need visual verification on device (content panels manage own padding)

**Blockers:**
- None

---
*Phase: 17-ipad-safe-areas-spacing, Plan: 01*
*Completed: 2026-03-12*
