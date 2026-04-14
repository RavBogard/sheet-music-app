---
phase: 04-editor-cleanup
plan: 04
subsystem: helpers
tags: [instruments, musician-profile, registry]

requires: []
provides:
  - ONBOARDING_INSTRUMENT_KEYS exported from musician-profile.ts
  - REQUIRED_INSTRUMENTS exported from musician-suggestions.ts
  - OnboardingCard stores slug keys consistent with Settings
affects: Any future onboarding/settings change touching instrument metadata

tech-stack:
  added: []
  patterns:
    - "Onboarding and Settings write the same slug shape to musicianProfile.instrument"

key-files:
  modified:
    - src/lib/musician-profile.ts
    - src/lib/musician-suggestions.ts
    - src/app/api/scheduling/suggest-band/route.ts
    - src/components/dashboard/OnboardingCard.tsx

key-decisions:
  - "ONBOARDING_INSTRUMENT_KEYS is a curated subset of INSTRUMENT_PRESETS; Settings keeps the full registry"
  - "Flute dropped from the onboarding list (not in INSTRUMENT_PRESETS); revisit if a musician asks"
  - "Backfill for pre-existing string-literal instrument values is deferred — not a real bug today"

duration: ~10min
started: 2026-04-14T09:20:00Z
completed: 2026-04-14T09:25:00Z
---

# Phase 04 Plan 04: INSTRUMENTS Unification Summary

**OnboardingCard now writes slug keys (e.g., `acoustic_guitar`) instead of human strings (e.g., `Guitar`) — same shape Settings writes. Scheduling's REQUIRED band-core list now has one source of truth.**

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: OnboardingCard stores slugs | Pass | Dropdown `value` = slug key; label comes from `INSTRUMENT_PRESETS[key].label`. |
| AC-2: Single REQUIRED source | Pass | `REQUIRED_INSTRUMENTS` exported from `musician-suggestions.ts`; scheduling route imports it. |
| AC-3: No duplicate literal lists in src | Pass | Product source has one declaration. Test mirror in `use-musician-transposition.test.ts` intentionally retained. |

## Files Modified

| File | Change |
|------|--------|
| `src/lib/musician-profile.ts` | +ONBOARDING_INSTRUMENT_KEYS export |
| `src/lib/musician-suggestions.ts` | REQUIRED_INSTRUMENTS promoted to export |
| `src/app/api/scheduling/suggest-band/route.ts` | Imports REQUIRED_INSTRUMENTS; local array deleted |
| `src/components/dashboard/OnboardingCard.tsx` | Dropdown reads INSTRUMENT_PRESETS via ONBOARDING_INSTRUMENT_KEYS |

## Deviations

**Total impact:** None — plan executed as written. No new tests needed (existing OnboardingCard tests still green; the scheduling tests passed unchanged).

## Next Phase Readiness

**Ready:** 04-05 (toast hygiene + error-toast sweep) or 04-06 (triple-modal chain consolidation) can proceed.

**Deferred:** One-shot migration script to normalize existing `musicianProfile.instrument` human-string values to slug keys. Low priority — Settings flow will fix per user on next visit.

---
*Phase: 04-editor-cleanup, Plan: 04 · Completed: 2026-04-14*
