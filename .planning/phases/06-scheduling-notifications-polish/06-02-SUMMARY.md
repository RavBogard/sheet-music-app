---
phase: 06-scheduling-notifications-polish
plan: 02
subsystem: performance-view, onboarding
tags: [who-is-playing, musician-chips, onboarding, inline-setup]
dependency_graph:
  requires: [useSetlistPerformance, SetlistMusician, useSafeFirestoreSync]
  provides: [performance-musician-chips, inline-instrument-setup]
  affects: [perform-setlist-page, dashboard-onboarding]
tech_stack:
  added: []
  patterns: [inline-form-over-redirect, firestore-dot-notation-update]
key_files:
  created: []
  modified:
    - src/hooks/use-setlist-performance.ts
    - src/app/perform/setlist/[id]/page.tsx
    - src/app/(main)/DashboardClient.tsx
decisions:
  - "Use Firestore dot-notation updateDoc for instrument field instead of full profile save (safer, no overwrite risk)"
  - "Show first name only in musician chips to keep performance view compact"
  - "Shared showQuickSetup state between pending and approved cards (only one shows at a time)"
metrics:
  duration: "4 min"
  completed: "2026-03-08"
  tasks: 2
  files: 3
---

# Phase 6 Plan 2: Who's Playing + Onboarding Polish Summary

Performance view musician chips from existing Firestore subscription, inline instrument setup replacing /settings redirect.

## What Was Done

### Task 1: Expose musicians from useSetlistPerformance and add who's playing chips (8d19f5f)

**Extended `src/hooks/use-setlist-performance.ts`** to expose the `musicians` array from the setlist document:
- Imported `SetlistMusician` type from `@/types/models`
- Added `musicians: SetlistMusician[]` to the return interface
- Extracted `musicians` from `setlistData.musicians` (already subscribed via `useSafeFirestoreSync`)
- No new Firestore subscription needed -- the existing `onSnapshot` on the setlist doc already includes the musicians field

**Added musician chips to `src/app/perform/setlist/[id]/page.tsx`**:
- Destructured `musicians` from the hook return
- Added a compact horizontally-scrollable chip row between the header and SetlistView
- Each chip shows first name + instrument (e.g., "Daniel Guitar", "Karen Vocals")
- Uses `Users` icon from lucide-react as a subtle section indicator
- Only renders when musicians array is non-empty
- Updates in real-time when musicians are assigned/unassigned via the existing Firestore subscription

### Task 2: Polish onboarding with inline quick-setup modal (77a7dbf)

**Replaced both onboarding card sections in `src/app/(main)/DashboardClient.tsx`**:

**Pending user card**: Replaced the "Set Up My Instrument" link (which redirected to /settings) with a button that reveals an inline instrument dropdown. On save, uses `updateDoc` with dot-notation (`musicianProfile.instrument`) to set just the instrument field without overwriting other profile data. NudgeAdmin button preserved.

**First-time approved card**: Same inline quick-setup form. On save, also calls `markWelcomeModalViewed` to dismiss the card. Skip button preserved -- calls `markWelcomeModalViewed` and hides the form.

**Other changes**:
- Added `INSTRUMENTS` constant with 11 common instruments
- Added `showQuickSetup`, `selectedInstrument`, `saving` state variables
- Imported `doc`/`updateDoc` from firebase/firestore and `db` from firebase
- Removed unused `Link` import (no more /settings redirects in onboarding)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] updateMusicianProfile function does not exist**
- **Found during:** Task 2
- **Issue:** Plan referenced `updateMusicianProfile` from `@/lib/musician-profile` but this function does not exist. Only `saveMusicianProfile` exists, which saves the entire profile and requires `auth.currentUser`.
- **Fix:** Used Firestore `updateDoc` with dot-notation (`musicianProfile.instrument`) directly, which is safer (no overwrite risk for other profile fields) and simpler.
- **Files modified:** src/app/(main)/DashboardClient.tsx
- **Commit:** 77a7dbf

**2. [Rule 1 - Bug] Unused Link import after removing /settings redirects**
- **Found during:** Task 2
- **Issue:** After replacing both Link-based buttons with onClick handlers, the `Link` import from `next/link` became unused, which would cause a build warning.
- **Fix:** Removed the unused import.
- **Files modified:** src/app/(main)/DashboardClient.tsx
- **Commit:** 77a7dbf

## Verification

- `npm run build` passes with no errors
- `npx vitest run --reporter=verbose` -- all 639 tests pass (40 test files), zero regressions
- useSetlistPerformance hook returns `musicians` in its return object
- Performance view page destructures and renders `musicians` as chips
- DashboardClient pending user card has inline instrument selector (no /settings link)
- DashboardClient first-time approved card has inline instrument selector (no /settings link)

## Self-Check: PASSED
