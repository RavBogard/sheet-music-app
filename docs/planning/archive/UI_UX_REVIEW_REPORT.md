# UI/UX Aesthetic Review -- CentralReform.live

**Review Date:** February 23, 2026
**Reviewer:** Automated deep-audit of all UI/UX surfaces
**Stack:** Next.js 15, Tailwind CSS v4, shadcn/ui (new-york style), React, Radix UI, Sonner toasts
**Primary Target Devices:** iPads and phones at gig venues (stage use)

---

## Executive Summary

CentralReform.live is a well-crafted, premium-feeling PWA with a thoughtful design language. The globals.css establishes a sophisticated Apple-inspired glassmorphism system using oklch colors, translucent cards, and backdrop-blur materials. The overall architecture is strong -- server-rendered dashboard, staggered animations, proper loading skeletons, and error boundaries at every route level.

However, the review surfaces several categories of issues:

1. **Hardcoded color leakage** -- Performance mode and several components bypass the design token system with raw `zinc-*`, `gray-*`, `bg-black`, `text-white`, and `bg-white` classes (178+ zinc occurrences, 138+ white, 21+ black). This undermines dark mode consistency and makes future theming difficult.
2. **Dialog component is outdated** -- `dialog.tsx` uses the older `React.forwardRef` pattern with hardcoded `bg-white`, `border-zinc-200`, and `ring-offset-white`, while the rest of the component library (button, card, badge) uses the modern shadcn v2 function-component pattern with proper design tokens.
3. **Accessibility gaps** -- Only 4 `sr-only` instances across the entire component tree, very few `aria-label` attributes on interactive elements (particularly navigation items, icon-only buttons, and drag handles), and no visible focus indicators on many custom interactive elements.
4. **Performance mode creates a visual silo** -- The toolbar hard-codes a dark theme (`bg-zinc-950`, `text-zinc-500`, `border-zinc-800`) instead of using the existing CSS variable system, which means any future theme changes require manual updates across 200+ lines.
5. **PageTransition is a no-op** -- The template.tsx wraps children in a PageTransition component that renders a bare fragment, adding no transition behavior.

**Overall Grade: B+**
The foundation is excellent. The issues are primarily about consistency and polish rather than structural problems.

---

## Consistency Analysis

### Design Token System

The CSS variable system in `globals.css` is well-designed:

- Uses oklch color space for perceptually uniform colors
- Both light and dark modes are fully defined
- Custom utilities (`glass`, `glass-card`, `fluid-interaction`, `material-thick`, `material-thin`, `list-cell`, `text-eyebrow`, `text-title`) create a cohesive design language
- Radius scale is well-structured from `--radius-sm` through `--radius-4xl`
- The `--success` / `--success-foreground` tokens are defined but used sparingly

**Issue: Token Bypass**

The biggest consistency problem is widespread use of raw Tailwind colors instead of semantic tokens:

| Pattern | Occurrences | Problem |
|---------|-------------|---------|
| `zinc-*` classes | 178 across 28 files | Bypasses foreground/muted/border tokens |
| `white` classes | 138 across 50 files | Should use `primary-foreground` or equivalent |
| `black` classes | 21 across 15 files | Should use `background` or `foreground` |
| `gray-*` classes | 3 in 1 file | Inconsistent with zinc palette elsewhere |

**Worst offenders:**
- `src/components/performance/PerformanceToolbar.tsx` -- 17 zinc, 9 white references
- `src/components/performance/RehearsalToolbar.tsx` -- 14 zinc, 11 white references
- `src/components/music/TransposerMenu.tsx` -- 19 zinc, 7 white references
- `src/app/live/[id]/page.tsx` -- 23 zinc, 2 white references
- `src/components/dashboard/HeroCard.tsx` -- 16 white references (justified: gradient overlay on colored bg)
- `src/app/perform/error.tsx` -- 3 gray references (only file using gray instead of zinc)

**Performance mode is intentionally dark-forced**, which explains many zinc/white uses, but these should still use CSS variables with `.dark` forced, not raw colors.

### Component Library Consistency

**Patterns observed across shadcn/ui components:**

| Component | Pattern | Status |
|-----------|---------|--------|
| `button.tsx` | Modern function component, `data-slot`, CVA | Current |
| `badge.tsx` | Modern function component, `data-slot`, CVA | Current |
| `card.tsx` | Modern function component, `data-slot` | Current |
| `input.tsx` | `React.forwardRef`, CVA with variants | Mixed (forwardRef) |
| `dialog.tsx` | `React.forwardRef`, hardcoded colors | **Outdated** |
| `sheet.tsx` | `React.forwardRef`, semantic colors | Acceptable |
| `skeleton.tsx` | Plain function, string concatenation | **Missing cn()** |
| `empty-state.tsx` | Plain function, string concatenation | **Missing cn()** |
| `error-state.tsx` | Plain function, hardcoded `red-500` | Semantic OK for error |
| `spinner.tsx` | Plain function, proper cn() | Good |

**Key finding:** `dialog.tsx` at line 41 uses `border-zinc-200 bg-white` instead of `border-border bg-background`, and `ring-offset-white` / `ring-zinc-950` instead of `ring-offset-background`. This is the single most impactful component to fix because dialogs appear across every feature.

**skeleton.tsx** uses string concatenation (`${className}`) instead of `cn()`, which could cause class conflicts.

### Typography Scale

The custom typography utilities are well-defined:
- `text-eyebrow`: 11px, uppercase, tracking-widest, semibold
- `text-title`: 2xl, -0.02em letter-spacing
- `text-title-large`: 4xl, -0.04em

**Usage is inconsistent.** The setlist dashboard uses `text-title` (line 59), but the admin page and settings page use raw `text-2xl font-semibold` (nearly identical but not using the utility). The `text-eyebrow` utility is used in the setlist dashboard but elsewhere the same pattern is manually written as `text-xs font-semibold text-muted-foreground uppercase tracking-wider`.

### Border Radius

The design system specifies `--radius: 1rem` (described as "Apple-like rounded corners"). Components consistently use `rounded-2xl` for cards and `rounded-xl` for interactive elements. The button uses `rounded-md` (shadcn default), which is slightly inconsistent with the Apple aesthetic but appropriate for smaller elements.

---

## Page-by-Page Findings

### Root Layout (`src/app/layout.tsx`)

**Strengths:**
- Proper `<html lang="en">` attribute
- `suppressHydrationWarning` for theme provider
- Geist font loaded with CSS variables
- Preconnect hints for auth domains
- `bg-noise` overlay for texture
- ErrorBoundary wraps entire app
- Sonner Toaster configured with `richColors`, `position="top-center"`, `theme="system"`
- Viewport meta disables zoom (`maximumScale: 1`) -- appropriate for a music stand app

**Issues:**
- No `<meta name="description">` in viewport for PWA (exists in metadata)
- `bg-noise` div has `z-index: 50` which could overlay modals at z-50

### Main Layout (`src/app/(main)/layout.tsx`)

**Strengths:**
- Clean flex column structure
- Proper padding offsets: `pb-24` mobile (clears tab bar), `pt-20 md` (clears header)
- Footer hidden on mobile (`hidden md:block`)
- Lazy client components deferred

**Issues:**
- Desktop header is 64px (`h-16`) but the content area has `pt-20` (80px) -- 16px gap/padding is intentional for breathing room but could be tighter

### Dashboard (`DashboardClient.tsx`)

**Strengths:**
- Server-rendered greeting eliminates blank flash
- Atmospheric gradients tied to Hebrew calendar (Shabbat, holiday, morning, evening)
- Skeleton loading states inline
- Cold-launch animation detection (session storage)
- Safety timeout prevents infinite loading
- Two-column desktop layout with timeline
- Staggered CSS animations with `dash-stagger-*` classes
- Proper `dash-no-animate` bypass for return visits

**Issues:**
- Line 191: string interpolation `${atmosphereClasses}` inside template literal for className -- should use `cn()` for safety
- Hero zone branding logo uses `<img>` without `width`/`height` attributes -- causes CLS
- Emoji usage (line 219: sparkles, party) in Hebrew date -- could be replaced with SVG icons for visual consistency
- `pb-28` on container is large and doesn't account for `pb-safe` on the tab bar -- potential double-padding

### Login Page (`src/app/login/page.tsx`)

**Strengths:**
- Clean centered layout
- Loading spinner state
- Inline SVG Google icon (no external dependency)
- Proper redirect after auth

**Issues:**
- No error handling visible for failed sign-in (catch is empty)
- No keyboard shortcut (Enter to sign in)

### Settings Page

**Strengths:**
- Consistent card-based sections with `bg-card border border-border rounded-2xl p-5`
- Theme picker with visual selection states
- Inline name editing with optimistic UI
- Build version display at bottom

**Issues:**
- Back button only shows on mobile (`md:hidden`) -- desktop users have no explicit back navigation
- Appearance buttons use hardcoded `violet-500` for the active state instead of `primary`
- Role badge uses `font-mono` styling that differs from badges elsewhere

### Admin Page

**Strengths:**
- Proper auth guard with loading and redirect
- Consistent section layout with settings page
- Violet accent for admin-specific elements

**Issues:**
- Auth loading spinner uses hardcoded `text-violet-500` instead of design token
- Single card wrapping `AdminSections` -- deeply nested cards within this could cause border-on-border visual noise

### Setlist Dashboard (`SetlistDashboard.tsx`)

**Strengths:**
- Full-featured with tabs, search, rabbi filter, view switching (list/calendar/matrix)
- Loading skeletons for card grid
- ErrorState component properly used
- Lazy-loaded CalendarView with skeleton fallback
- Placeholder cards for unscheduled service dates
- Overflow menus on cards with context-appropriate actions

**Issues:**
- Header height is `h-20` while main layout header is `h-16` -- visual inconsistency between routes
- The "From Template" button uses `border-violet-500/30 text-violet-600` which is a different accent from the "New" button's `bg-blue-600` -- two different accent colors in the same toolbar
- Version number positioned `absolute bottom-2 right-2` could overlap with mobile tab bar
- SetlistCards use string concatenation for className instead of `cn()`

### Setlist Editor V2 (`SetlistEditorV2.tsx`)

**Strengths:**
- Full drag-and-drop with dnd-kit (mouse, touch, keyboard sensors)
- Touch sensor has 250ms delay with 5px tolerance -- good for preventing accidental drags
- Swipe-to-delete pattern for mobile
- Batch select mode with visual checkbox overlay
- Debounced empty state (300ms) to prevent flash during AI edits
- Proper undo/redo with history
- Offline sync

**Issues:**
- Select mode checkbox at line 417 uses string concatenation instead of `cn()`
- The empty state message at line 552 is plain text -- should use `EmptyState` component for consistency
- Service notes textarea at line 533 uses raw focus classes instead of the Input component
- No maximum track count or scroll-to-bottom behavior when adding items

### Performance Mode / Perform Layout

**Strengths:**
- Full-screen dark experience appropriate for stage
- `PerformanceOfflineIndicator` in layout
- Two-row mobile toolbar, single-row desktop -- responsive and touch-friendly
- Performance intro onboarding overlay (one-time)
- Wake lock and screen-always-on support

**Issues:**
- **Critical**: The entire performance toolbar hardcodes dark colors (`bg-zinc-950`, `text-zinc-500`, `border-zinc-800`, `hover:bg-zinc-800`). If the app's dark mode tokens were changed, performance mode would not update.
- `PerformError` at `src/app/perform/error.tsx` hardcodes `bg-black text-white` and `text-gray-400` / `border-gray-600` / `bg-gray-200` -- mixes gray and zinc palettes
- Perform setlist loading (`src/app/perform/setlist/[id]/loading.tsx`) uses hardcoded `text-zinc-500` instead of `text-muted-foreground`

### Not Found Page

**Strengths:**
- Clean centered layout using design tokens
- Link back to home

**Issues:**
- Could benefit from an illustration (the app already has illustration components in `ui/illustrations/`)
- No search suggestion or breadcrumb to help lost users

---

## Mobile/PWA Assessment

### Touch Targets

**Good practices observed:**
- Mobile tab bar items span `flex-1` with `h-full py-2` -- generous touch area
- Tab bar icon container is `w-12 h-8` pill shape -- meets 44px minimum width
- Bottom tab bar height: `h-16 sm:h-20` -- appropriate sizing
- Performance toolbar buttons are `h-9` minimum with adequate padding
- Setlist SongRow has `py-3` with `gap-3` -- adequate spacing
- Drag handles have `p-1` padding with a 20px icon -- slightly below 44px target

**Issues:**
- Drag handle in `SongRow.tsx` (`GripVertical` at `h-5 w-5` with `p-1`) is 28px total -- below the recommended 44px minimum touch target
- The "expand" chevron button in `UpcomingTimeline.tsx` (`p-1` with a `w-3.5 h-3.5` icon) is approximately 22px -- too small for reliable touch
- Desktop header search results items (`px-3 py-2`) are only about 36px tall
- The "Edit setlist" link inside HeroCard (`text-xs`) is a small underlined link -- hard to tap on mobile

### Safe Areas

- `pb-safe` utility is defined and used on the mobile tab bar -- good
- Performance toolbar uses `pb-safe` -- good
- Offline indicator is positioned `bottom-4` which doesn't account for safe-area -- on iPhone with home indicator, this would overlap

### Viewport and Zoom

- `maximumScale: 1` prevents pinch-to-zoom -- appropriate for a music stand app where accidental zoom would be disruptive during performance
- `width: device-width` is properly set

### PWA Features

- Manifest linked in metadata
- Apple Web App capable with status bar configuration
- Service worker update prompt (`UpdatePrompt.tsx`) positioned properly with mobile offset (`bottom-20 md:bottom-6`)
- Offline indicator shows when connectivity is lost
- Per-setlist offline download with progress indicators
- Background prefetcher component exists

### Performance Perception

- Dashboard uses server-side rendering for instant greeting
- Staggered animations give visual flow without blocking
- Cold-launch detection avoids re-animating on back-navigation
- Safety timeout (2s) prevents infinite loading states
- CalendarView is lazy-loaded with skeleton

---

## Accessibility Audit

### Critical Issues

1. **Screen reader labels severely lacking:**
   - Only 4 `sr-only` instances in the entire codebase (2 in dialog close buttons, 2 in TrackSheet)
   - Mobile tab bar navigation items have no `aria-label` -- screen readers would read the component text but the icon-only states on smaller screens are unlabeled
   - Desktop header profile button, notification bell, and search have no explicit `aria-label`
   - Drag handles in setlist editor have no `aria-roledescription` or instructions

2. **Focus management:**
   - PageTransition is a no-op (renders bare fragment) -- no focus management on route changes
   - Modals/dialogs do trap focus via Radix primitives -- good
   - The setlist editor's inline name editing properly focuses the input on mount -- good
   - Many custom button elements (styled `<button>` or `<div>`) lack visible focus rings

3. **Color contrast concerns:**
   - `text-muted-foreground` at oklch(0.55) on `background` at oklch(0.985) in light mode: ~4.0:1 ratio -- borderline for WCAG AA for normal text
   - `text-muted-foreground/40` (used for version numbers and separators) would fail contrast requirements
   - HeroCard's white text on violet/indigo gradient is likely adequate but untestable without rendered values
   - `text-muted-foreground/60` used in setlist metadata lines is below AA compliance

4. **Keyboard navigation:**
   - Setlist editor drag-and-drop includes `KeyboardSensor` with `sortableKeyboardCoordinates` -- good
   - Performance mode has no keyboard shortcuts for next/previous song (relies on swipe gestures)
   - Theme picker buttons in settings are not in a radio group pattern

### Moderate Issues

5. **Semantic HTML:**
   - Navigation uses `<nav>` elements -- good
   - Setlist dashboard header uses `<h1>` -- good
   - But some sections use `<div>` where `<section>` with headings would be more semantic
   - `CardTitle` renders as `<div>` instead of a heading element

6. **ARIA patterns:**
   - `aria-describedby` is used in SheetContent for dialog descriptions -- good
   - `aria-label="Audio monitor mix"` on the monitor popover trigger -- good
   - But most other Popovers and DropdownMenus lack descriptive labels
   - The batch select mode checkbox (div with class toggling) lacks `role="checkbox"` and `aria-checked`

---

## Visual Design System Review

### Color Palette

The oklch-based palette is modern and well-tuned:
- Light mode: Cool off-white (`oklch(0.985 0.005 260)`) with translucent white cards
- Dark mode: Deep space grey (`oklch(0.14 0.015 260)`) with translucent dark cards
- Consistent hue angle of 260 (blue-violet) across background/foreground/muted/card

**Accent colors used throughout the app:**
- `violet-500/600` -- Admin actions, template buttons, gig mode, update prompt, active theme
- `blue-500/600` -- Primary actions (New, Perform, upcoming indicators), "Plan Service", search
- `emerald-500` -- Setlists command row
- `amber-500` -- New command row, offline warning
- `green-400/500` -- Success states, prep completion, offline ready
- `red-500` -- Destructive actions, errors

**Issue:** The accent palette is broad. Violet and blue compete for "primary action" status. The `--primary` token (near-black in light, near-white in dark) is mostly used for default buttons, while the colorful accents are applied ad-hoc. Consider establishing a clear hierarchy: primary action = one color, secondary = another.

### Glassmorphism System

The glass utilities are well-implemented:
- `glass`: 65% opacity background + 2xl blur + translucent border
- `glass-card`: 70% card opacity + xl blur + white/5 border
- `material-thick`: 85% opacity + 2xl blur (for navigation)
- `material-thin`: 75% opacity + xl blur (for overlays/dropdowns)

These are used consistently for navigation bars and overlays. The differentiation between "thick" and "thin" materials is subtle but provides appropriate depth hierarchy.

### Animation

- `fluid-interaction`: 400ms with spring bezier + active scale(0.98) -- applied consistently to interactive elements
- `animate-spring`: 500ms with same bezier -- for larger transitions
- Dashboard stagger: `dash-fade-up` at 350ms with 60ms delays -- smooth and fast
- Progress bar animation: `dash-progress-fill` at 600ms
- Radix animations (`animate-in`, `fade-in`, `zoom-in-95`) used for modals/popovers

**Issue:** The `PageTransition` component is a no-op. The `template.tsx` wraps children in it, but it renders a bare fragment. This was likely intended for route transition animations but was never implemented or was removed.

### Spacing Rhythm

Most spacing follows Tailwind's 4px grid:
- Card padding: `p-5` or `p-6` (20px or 24px) -- consistent
- Section gaps: `space-y-8` or `gap-6` -- consistent
- Content max-width: `max-w-2xl` (dashboard, settings) or `max-w-3xl` (setlist editor, admin)
- Page horizontal padding: `px-4 md:px-6`

**Minor inconsistency:** The setlist dashboard uses `max-w-6xl` for its content, while the dashboard content uses `max-w-2xl`. This creates very different information densities on desktop. The setlist dashboard's full-width grid layout justifies the difference, but the transition between pages feels abrupt.

---

## Recommendations (Prioritized)

### P0 -- Critical (Fix immediately)

1. **Update `dialog.tsx` to use design tokens**
   - Replace `bg-white` with `bg-background`, `border-zinc-200` with `border-border`
   - Replace `ring-offset-white` with `ring-offset-background`
   - Replace `ring-zinc-950` / `ring-zinc-300` with `ring-ring`
   - This component is used across every feature and is the highest-impact single fix
   - **File:** `src/components/ui/dialog.tsx` lines 41-47

2. **Add `aria-label` to all icon-only interactive elements**
   - Mobile tab bar items (add `aria-label={item.label}` to each Link)
   - Desktop header buttons (profile, notifications, search)
   - Performance toolbar icon buttons (annotate, zoom in/out, exit)
   - Drag handles (add `aria-roledescription="sortable"` and `aria-label`)
   - **Estimate:** 2-3 hours, high accessibility impact

### P1 -- High Priority (This sprint)

3. **Create a `dark-forced` CSS class for performance mode**
   - Instead of hardcoding `bg-zinc-950`, `text-zinc-500`, etc., add `.dark-forced` to the performance layout's root div
   - Define performance mode to always render within `.dark` class context
   - Replace all raw zinc/gray references with token-based equivalents
   - **Files:** `PerformanceToolbar.tsx`, `RehearsalToolbar.tsx`, `TransposerMenu.tsx`, `perform/error.tsx`, `perform/setlist/[id]/loading.tsx`
   - **Estimate:** 4-6 hours

4. **Fix color contrast for muted text**
   - Increase `--muted-foreground` lightness in light mode from `oklch(0.55)` to `oklch(0.45)` to improve contrast ratio from ~4.0:1 to ~5.5:1
   - Remove or increase opacity on `text-muted-foreground/40` and `text-muted-foreground/60` usages
   - **File:** `src/app/globals.css` line 74

5. **Replace string concatenation with `cn()` in all components**
   - `skeleton.tsx`, `empty-state.tsx`, `error-state.tsx`, `SetlistCards.tsx`, `SetlistEditorV2.tsx` batch select mode
   - This prevents Tailwind class conflicts and enables proper merge behavior
   - **Estimate:** 1-2 hours

### P2 -- Medium Priority (Next sprint)

6. **Unify accent color hierarchy**
   - Define a clear rule: `blue-600` = primary actions, `violet-500` = admin/special, `green-500` = success, `amber-500` = warning
   - Currently blue and violet compete (e.g., setlist dashboard: "From Template" is violet, "New" is blue)
   - Consider adding `--accent-action` and `--accent-admin` tokens

7. **Enlarge undersized touch targets**
   - Drag handle: increase from `h-5 w-5 p-1` (28px) to `h-6 w-6 p-2` (40px) or wrap in 44px container
   - Timeline expand chevron: increase from `p-1 w-3.5 h-3.5` (22px) to `p-2 w-4 h-4` (32px+)
   - HeroCard "Edit setlist" link: increase to a pill-shaped button with adequate padding

8. **Implement PageTransition or remove it**
   - The current no-op `PageTransition` component and `template.tsx` wrapper add complexity with no benefit
   - Either implement a `framer-motion` or View Transitions API-based transition, or remove both files

9. **Fix `bg-noise` z-index**
   - Currently `z-50`, which matches modal z-index
   - Reduce to `z-[1]` since it's purely decorative and should never overlay interactive content

### P3 -- Low Priority (Backlog)

10. **Add illustration to 404 page**
    - The app has a full illustrations system (`ui/illustrations/`) -- use `NoResultsIllustration` or create a dedicated 404 illustration

11. **Standardize loading skeletons**
    - Create a shared `PageSkeleton` component with variants (list, grid, detail) to replace the 4 different hand-coded loading.tsx files
    - Reduces duplication and ensures visual consistency

12. **Add keyboard shortcuts to performance mode**
    - Left/right arrow for next/previous song
    - Space to toggle toolbar
    - Escape to exit
    - This is important for accessibility and for musicians using keyboards/foot pedals

13. **Improve semantic HTML in card titles**
    - `CardTitle` currently renders as `<div>` -- consider allowing heading level prop (`as="h2"`, `as="h3"`)
    - Settings page section headings should be `<h2>` within `<section>` elements

---

## Quick Wins (Things that can be fixed easily)

These are changes that take under 30 minutes each and have visible impact:

1. **`skeleton.tsx`** -- Replace `${className}` with `cn("animate-pulse rounded-md bg-muted", className)` (5 min)

2. **`empty-state.tsx`** -- Replace string concatenation in className with `cn()` call (5 min)

3. **`perform/setlist/[id]/loading.tsx`** -- Replace `text-zinc-500` with `text-muted-foreground` (2 min)

4. **`perform/error.tsx`** -- Replace `text-gray-400` with `text-muted-foreground`, `border-gray-600` with `border-border`, `bg-gray-200` with `bg-secondary` (5 min)

5. **Mobile tab bar** -- Add `aria-label={item.label}` to each `<Link>` element (5 min)

6. **Dialog close button** -- The sr-only text says "Close" -- already present, good (no change needed)

7. **Offline indicator position** -- Add `pb-safe` or `bottom-[calc(1rem+env(safe-area-inset-bottom))]` to prevent overlap with iPhone home indicator (5 min)

8. **Dashboard logo** -- Add `width={32} height={32}` to `<img>` tags (or use Next.js `Image`) to prevent CLS during load (10 min)

9. **Remove unused `PageTransition`** -- Delete `src/components/layout/PageTransition.tsx` and simplify `src/app/template.tsx` to render children directly (5 min)

10. **Print styles** -- The existing `@media print` rules are well-structured. No changes needed, but consider adding `.no-print` to the `OfflineIndicator` and `UpdatePrompt` floating elements (5 min)

---

## Appendix: File Reference

Key files examined in this review:

| File | Purpose |
|------|---------|
| `src/app/globals.css` | CSS variables, utilities, animations |
| `src/app/layout.tsx` | Root layout with theme, error boundary, toaster |
| `src/app/(main)/layout.tsx` | Main layout with navigation padding |
| `src/app/(main)/page.tsx` | Dashboard server component |
| `src/app/(main)/DashboardClient.tsx` | Dashboard client with greeting, hero, timeline |
| `src/app/(main)/settings/page.tsx` | Settings page |
| `src/app/(main)/admin/page.tsx` | Admin console |
| `src/app/login/page.tsx` | Login page |
| `src/app/not-found.tsx` | 404 page |
| `src/app/perform/layout.tsx` | Performance mode layout |
| `src/app/perform/error.tsx` | Performance error boundary |
| `src/components/ui/button.tsx` | Button component (shadcn) |
| `src/components/ui/card.tsx` | Card component (shadcn) |
| `src/components/ui/dialog.tsx` | Dialog component (shadcn, outdated) |
| `src/components/ui/sheet.tsx` | Sheet/drawer component |
| `src/components/ui/badge.tsx` | Badge component |
| `src/components/ui/skeleton.tsx` | Skeleton loader |
| `src/components/ui/spinner.tsx` | Loading spinner |
| `src/components/ui/empty-state.tsx` | Empty state component |
| `src/components/ui/error-state.tsx` | Error state component |
| `src/components/ui/fallback-error.tsx` | Error boundary fallback |
| `src/components/ui/input.tsx` | Input component with variants |
| `src/components/nav/AppNavigation.tsx` | Navigation wrapper |
| `src/components/nav/MobileTabBar.tsx` | Bottom tab bar |
| `src/components/nav/DesktopHeader.tsx` | Desktop top bar |
| `src/components/dashboard/HeroCard.tsx` | Dashboard hero card |
| `src/components/dashboard/CommandRow.tsx` | Quick action buttons |
| `src/components/dashboard/UpcomingTimeline.tsx` | Upcoming setlist timeline |
| `src/components/dashboard/CompactSetlistRow.tsx` | Compact setlist list item |
| `src/components/setlist/SetlistDashboard.tsx` | Setlist list page |
| `src/components/setlist/SetlistCards.tsx` | Setlist card variants |
| `src/components/setlist/v2/SetlistEditorV2.tsx` | Setlist editor |
| `src/components/setlist/v2/SongRow.tsx` | Track row in editor |
| `src/components/setlist/v2/SetlistTopBar.tsx` | Editor top bar |
| `src/components/performance/PerformanceToolbar.tsx` | Performance mode toolbar |
| `src/components/performance/PerformanceIntro.tsx` | First-time intro overlay |
| `src/components/offline/OfflineIndicator.tsx` | Offline status |
| `src/components/offline/UpdatePrompt.tsx` | SW update prompt |
| `src/components/layout/GlobalAlertBanner.tsx` | System alert banner |
| `src/components/layout/PageTransition.tsx` | No-op page transition |
| `src/components/error-boundary.tsx` | Global error boundary |
| `src/components/Footer.tsx` | Desktop footer |
| `components.json` | shadcn/ui configuration |
