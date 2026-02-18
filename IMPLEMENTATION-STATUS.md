# Implementation Audit: All 10 UX Recommendations

**Audit date:** February 18, 2026
**TypeScript errors:** 0
**ESLint warnings:** 0
**ESLint errors:** 0
**Orphaned files:** None
**Dead code:** None
**TODOs remaining:** 0

---

## Implementation Status

| # | Recommendation | Status | Key Changes |
|---|---------------|--------|-------------|
| 1 | One-tap gig launch | ✅ Complete | HeroCard switches primary action to `onPerform` when event is imminent (< 4hr). Secondary "Edit setlist" link preserved for leaders. |
| 2 | Unify performance modes | ✅ Complete | `/perform/setlist/[id]` is a ~60-line redirect. Builds queue from Firestore, routes to unified `/perform/[id]`. Flow items render via `FlowItemView`. |
| 3 | Instant page turns | ✅ Complete | PageDown/PageUp snap to `.pdf-page` boundaries with `behavior: 'instant'`. Fallback to 85% scroll when no page elements found. |
| 4 | Always-visible song context | ✅ Complete | `PerformanceStatusStrip` — non-interactive, semi-transparent pill showing "3/12 · Song Name · in G". `pointer-events-none`, ARIA `role="status"`. |
| 5 | Wake lock recovery | ✅ Complete | `shouldLockRef` tracks intent independently of sentinel state. Auto re-acquires on `visibilitychange` when returning from iOS notification or tab switch. |
| 6 | Setlist drawer redesign | ✅ Complete | Section grouping from header tracks, quick-jump chips, auto-scroll to current song on open. |
| 7 | Library filters | ✅ Complete | `LibraryFilters` component with key (circle-of-fifths), topic, and recency filters. Client-side filtering via `applyLibraryFilters()`. |
| 8 | Simplified key/transpose | ✅ Complete | Single Key picker with auto-context ("Chart is in E · transposing +3"). Expandable manual override for edge cases. |
| 9 | Live follow mode | ✅ Complete | `AutoFollowToggle` in setlist drawer. Auto-navigation with 1.5s confirmation toast. Cross-component sync via `CustomEvent`. |
| 10 | Offline confidence | ✅ Complete | `PerformanceOfflineIndicator` in perform layout. Hero card shows "✓ All 8 charts cached" / "⚠ 2 not cached". Download toasts. |

---

## Code Quality Audit

### Lint and Type Safety

- **0 TypeScript errors** (`npx tsc --noEmit`)
- **0 ESLint warnings** (`npx eslint src/ --ext .ts,.tsx --max-warnings 0`)
- No `any` types in new or modified code
- All error boundary pages properly typed (`_error` prefix for unused params)

### Bugs Fixed During Cleanup

1. **LiveNotification auto-follow sync** — `AutoFollowToggle` and `LiveNotification` had independent `useState(getAutoFollow())` calls. Toggling auto-follow in the drawer didn't propagate to the notification component until remount. Fixed with `CustomEvent('auto-follow-changed')` dispatch from `setAutoFollowStorage()`, listener in `LiveNotification`.

2. **Wake lock visibility handler** — Original had a TODO placeholder that never re-acquired the sentinel. iOS notifications, incoming calls, or any focus loss silently killed screen-on during services. Fixed with `shouldLockRef` intent tracking + unconditional re-acquisition on `visibilitychange`.

3. **Impure Date.now() in useMemo** — `useUpcomingPrep` called `Date.now()` inside `useMemo`, violating React's purity rules. Fixed with minute-granularity `useState` timer as a stable memo dependency.

4. **Hardcoded verifier name** — `ChordEditBar` saved chord verifications as "Daniel" instead of using the authenticated user. Fixed with `useAuth()` → `user.displayName || user.email`.

### Dead Code Removed

- Unused `useCallback` wrapper for `setAutoFollow` in LiveNotification (replaced with event-based sync)
- Placeholder `// ... imports` comment in SmartScoreViewer
- Unused imports flagged by ESLint (all resolved)

### Consistency Fixes

- Import quotes: standardized to double quotes throughout (was mixed single/double in `use-wake-lock.ts`)
- Semicolons: removed from `use-wake-lock.ts` to match codebase convention (no semicolons)
- `"use client"` directive: consistent across all client components

---

## Architecture Notes for Reviewers

### Performance Mode (Unified)

```
/perform/setlist/[id]  →  Redirect (builds queue, resolves first song)
                              ↓
/perform/[id]          →  Page (checks trackType)
                              ↓
                  ┌──────────────────────┐
                  │ trackType === 'song'  │ → PerformerView (PDF/MusicXML/ChordPro)
                  │ trackType !== 'song'  │ → FlowItemView (reading/prayer/transition)
                  └──────────────────────┘
```

One entry point. One set of gestures. One toolbar. Foot pedals work everywhere.

### Wake Lock Intent Model

```
requestWakeLock()   →  shouldLockRef = true  +  acquire sentinel
releaseWakeLock()   →  shouldLockRef = false +  release sentinel
visibilitychange    →  if (visible && shouldLockRef)  →  re-acquire
unmount             →  shouldLockRef = false +  release
```

The ref survives iOS sentinel releases. The sentinel doesn't survive focus loss. The ref is what matters.

### Auto-Follow Sync

```
AutoFollowToggle (drawer)
    └→ setAutoFollowStorage(value)
        └→ localStorage.setItem(...)
        └→ window.dispatchEvent(CustomEvent('auto-follow-changed'))

LiveNotification
    └→ useEffect: window.addEventListener('auto-follow-changed', sync)
        └→ sync: setAutoFollowState(getAutoFollow())
```

No polling. No shared state store. Just a custom event for same-tab cross-component sync.

### Library Filters

```
applyLibraryFilters(files, filters, usageMap) → DriveFile[]
```

Pure function. Client-side only. No API changes. Filters: key (multi-select), topic (multi-select), recency (single-select: played recently / 60+ days / never played).

---

## File Manifest

### New Components

| File | Lines | Purpose |
|------|-------|---------|
| `src/components/performance/PerformanceStatusStrip.tsx` | 37 | Always-visible song position + key indicator |
| `src/components/performance/PerformanceOfflineIndicator.tsx` | ~60 | Connection status banner for performance mode |
| `src/components/performance/FlowItemView.tsx` | ~80 | Renders non-song queue items (readings, prayers, transitions) |
| `src/components/performance/LiveNotification.tsx` | 191 | Live sync notifications + auto-follow toggle |
| `src/components/library/LibraryFilters.tsx` | ~240 | Key, topic, and recency filter chips |

### Modified Files

| File | Change |
|------|--------|
| `src/hooks/use-wake-lock.ts` | Full rewrite: shouldLockRef intent tracking + visibility recovery |
| `src/hooks/use-upcoming-prep.ts` | Pure useMemo: minute-granularity timer replaces Date.now() |
| `src/components/views/PerformerView.tsx` | Status strip integration, page-boundary snapping |
| `src/components/performance/SetlistDrawer.tsx` | Section grouping, quick-jump chips, auto-scroll |
| `src/components/setlist/v2/TrackSheet.tsx` | Simplified key/transpose UI |
| `src/components/music/TransposerMenu.tsx` | Auth-based verifier name (was hardcoded) |
| `src/components/music/SmartScoreViewer.tsx` | Removed placeholder comment |
| `src/app/(main)/page.tsx` | Hero card: imminent → perform, offline readiness indicator |
| `src/app/perform/[id]/page.tsx` | Flow item routing (FlowItemView vs PerformerView) |
| `src/app/perform/setlist/[id]/page.tsx` | Rewritten as queue-building redirect |
| `src/app/perform/layout.tsx` | Added PerformanceOfflineIndicator |
| `src/app/(editor)/setlists/[id]/error.tsx` | Lint: unused error param |
| `src/app/(main)/error.tsx` | Lint: unused error param |
| `src/app/perform/error.tsx` | Lint: unused error param |

---

## What's NOT in This Implementation

These were deliberately excluded to keep changes scoped and safe:

- **No bottom nav redesign** — existing routing patterns are fine
- **No component library swap** — shadcn/ui is well-integrated
- **No state management migration** — Zustand stores work correctly
- **No schema/database changes** — everything is client-side or uses existing Firestore fields
- **No new API routes** — library filters are client-side, offline uses existing IndexedDB
- **No build config changes** — same Next.js setup, same dependencies
