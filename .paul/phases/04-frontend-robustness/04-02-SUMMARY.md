---
phase: 04-frontend-robustness
plan: 02
subsystem: ui
tags: [error-boundaries, type-safety, firestore-types, react-error-boundary]

requires:
  - phase: 04-frontend-robustness
    provides: Hook dependency fixes and async safety (04-01)
provides:
  - Error boundaries on 4 crash-prone components
  - Type-safe useSafeFirestoreSync (no more ref as any)
  - Typed BridgeStatus.lastSeen (FirestoreDate, not unknown)
  - Removed unused makePublic/makePrivate Setlist param
  - ServiceType and Setlist['templateType'] casts replacing as any
affects: []

tech-stack:
  added: []
  patterns:
    - "SectionErrorBoundary for admin page sections"
    - "react-error-boundary with FallbackError for editor components"
    - "FirestoreRef as DocumentData (broadened) with T only on return type"

key-files:
  created: []
  modified:
    - src/hooks/use-safe-firestore-sync.ts
    - src/types/monitor.ts
    - src/types/models.ts
    - src/lib/firestore-helpers.ts
    - src/lib/setlist-firebase.ts
    - src/hooks/use-setlist-logic.ts
    - src/hooks/use-creation-wizard.ts
    - src/hooks/use-setlist-dashboard.ts
    - src/hooks/use-upcoming-prep.ts
    - src/hooks/use-setlist-performance.ts
    - src/hooks/use-monitor-access.ts
    - src/components/admin/SoundSystemSection.tsx
    - src/components/admin/LiveServiceSection.tsx
    - src/components/admin/people/AccessAuditLog.tsx
    - src/components/admin/live/FeaturedSetlistCard.tsx
    - src/components/setlist/v2/SetlistEditorV2.tsx

key-decisions:
  - "Broadened useSafeFirestoreSync ref type to DocumentData, eliminating all caller as any casts"
  - "FirestoreDate widened to accept { seconds: number; nanoseconds?: number } and { toDate: () => Date }"
  - "Removed unused _setlistData param from makePublic/makePrivate instead of passing dummy data"
  - "Used Setlist['templateType'] for narrow field type, ServiceType for context.type"

patterns-established:
  - "SectionErrorBoundary wraps admin page sections for crash isolation"
  - "ErrorBoundary + FallbackError wraps complex editor components"
  - "useSafeFirestoreSync<T>(ref) — no as any needed at call sites"

duration: ~12min
started: 2026-03-10
completed: 2026-03-10
---

# Phase 4 Plan 02: Type Normalization and Error Boundaries — Summary

**Added error boundaries to 4 crash-prone components and eliminated 14 dangerous `as any` casts by fixing root type signatures in useSafeFirestoreSync, FirestoreDate, and firestore-helpers.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~12 min |
| Started | 2026-03-10 |
| Completed | 2026-03-10 |
| Tasks | 2 completed |
| Files modified | 16 |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Error Boundaries Contain Section Crashes | Pass | SoundSystemSection, LiveServiceSection, AccessAuditLog wrapped with SectionErrorBoundary; SetlistEditorV2 with react-error-boundary |
| AC-2: Firestore Ref Types Are Sound | Pass | useSafeFirestoreSync accepts DocumentData refs; all 7 `ref as any` casts removed from callers |
| AC-3: Dangerous Type Assertions Eliminated | Pass | `{} as unknown as Setlist` removed (param deleted), `as any` → `as ServiceType`/`as Setlist['templateType']`, BridgeStatus.lastSeen typed as FirestoreDate |

## Accomplishments

- Wrapped 4 components with error boundaries to isolate section crashes from full-page failures
- Fixed useSafeFirestoreSync type signature at the root, eliminating 7 `ref as any` casts across the codebase
- Typed BridgeStatus.lastSeen as FirestoreDate and replaced verbose toMillis chains with toDate() helper
- Reduced hook `as any`/`as unknown` count from 16 to 2 (both internal to useSafeFirestoreSync)
- Removed unused `_setlistData` param from makePublic/makePrivate service methods

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/hooks/use-safe-firestore-sync.ts` | Modified | Broadened FirestoreRef type to DocumentData |
| `src/types/monitor.ts` | Modified | Import FirestoreDate, type lastSeen properly |
| `src/types/models.ts` | Modified | Widened FirestoreDate to accept partial Timestamp shapes |
| `src/lib/firestore-helpers.ts` | Modified | Made nanoseconds optional in toDate/toISOString/formatEventDate/dateStr/getRelativeDateLabel |
| `src/lib/setlist-firebase.ts` | Modified | Removed unused _setlistData param from makePublic/makePrivate |
| `src/hooks/use-setlist-logic.ts` | Modified | Removed `{} as unknown as Setlist` from visibility toggle |
| `src/hooks/use-creation-wizard.ts` | Modified | `as any` → `as ServiceType` / `as Setlist['templateType']` |
| `src/hooks/use-setlist-dashboard.ts` | Modified | Same ServiceType/templateType fixes |
| `src/hooks/use-upcoming-prep.ts` | Modified | Removed `ref as any`, fixed generic to `Setlist[]` |
| `src/hooks/use-setlist-performance.ts` | Modified | Removed `ref as any` |
| `src/hooks/use-monitor-access.ts` | Modified | Removed `ref as any` |
| `src/components/admin/SoundSystemSection.tsx` | Modified | SectionErrorBoundary wrap, removed `ref as any` |
| `src/components/admin/LiveServiceSection.tsx` | Modified | SectionErrorBoundary wrap, removed `ref as any`, toDate() for lastSeen |
| `src/components/admin/people/AccessAuditLog.tsx` | Modified | SectionErrorBoundary wrap, removed `ref as any`, cleaned rawLogs cast |
| `src/components/admin/live/FeaturedSetlistCard.tsx` | Modified | Removed `ref as any` |
| `src/components/setlist/v2/SetlistEditorV2.tsx` | Modified | ErrorBoundary + FallbackError wrap |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Broadened FirestoreRef to DocumentData | Root cause fix — onSnapshot accepts DocumentData refs natively | Eliminates all caller `as any` casts |
| Widened FirestoreDate to accept partial shapes | Firestore REST API and test mocks use `{ seconds }` without nanoseconds | Consistent type across all timestamp sources |
| Removed makePublic/makePrivate unused param | Param was `_setlistData` (prefixed unused) — cleaner than passing dummy data | Simpler API surface |
| Separate casts for ServiceType vs Setlist['templateType'] | context.type is ServiceType (broad), setlist field is narrower union | Correct type at each use site |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 2 | Essential type alignment |
| Scope additions | 1 | Required by type change |

**Total impact:** Essential fixes, no scope creep.

### Auto-fixed Issues

**1. FirestoreDate widened for partial Timestamp shapes**
- **Found during:** Task 2 (type fixes)
- **Issue:** Changing BridgeStatus.lastSeen to FirestoreDate caused TS errors in test mocks using `{ toDate: () => Date }` and `{ seconds: number }` without nanoseconds
- **Fix:** Added `{ toDate: () => Date }` and `number` to FirestoreDate union; made nanoseconds optional
- **Files:** src/types/models.ts
- **Verification:** npx tsc --noEmit passes

**2. firestore-helpers parameter types aligned**
- **Found during:** Task 2 (type fixes)
- **Issue:** toDate/toISOString/formatEventDate/dateStr/getRelativeDateLabel all had `nanoseconds: number` (required) which conflicted with the widened FirestoreDate
- **Fix:** Made nanoseconds optional in all 5 helper function signatures (runtime already handled undefined via `|| 0`)
- **Files:** src/lib/firestore-helpers.ts
- **Verification:** npx tsc --noEmit passes

### Scope Addition

**setlist-firebase.ts modified** — not in original plan files_modified, but removing the unused `_setlistData` param was cleaner than any alternative.

## Issues Encountered

None.

## Next Phase Readiness

**Ready:**
- Phase 4 complete — all frontend robustness work done
- Full milestone v1.3 Bugsweep & Backend Hardening ready for completion

**Concerns:**
- clearSaveTimer() from 04-01 still needs to be wired into consuming components (deferred)

**Blockers:**
- None

---
*Phase: 04-frontend-robustness, Plan: 02*
*Completed: 2026-03-10*
