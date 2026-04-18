---
phase: 01-monitor-research-code-audit
plan: 03
subsystem: auth-roles-transposition
tags: [auth, roles, transposition, musician-profile, testing, tdd]
dependency_graph:
  requires: []
  provides: [AUTH-04, PROF-01, PROF-02]
  affects: [phase-3-setlist, phase-4-musician-ux, phase-5-monitor]
tech_stack:
  added: []
  patterns: [vitest-unit-tests, priority-chain-logic, tdd-green-first]
key_files:
  created:
    - src/lib/__tests__/roles.test.ts
    - src/hooks/__tests__/use-musician-transposition.test.ts
    - src/lib/__tests__/bridge-latency.util.ts
  modified:
    - src/lib/roles.ts
decisions:
  - "soundEngineer is confirmed as orthogonal boolean flag — not a role hierarchy level (research validated)"
  - "INSTRUMENT_PRESETS has 18 presets (not 17): core 7 + occasional 8 + piano/ukulele/other 3"
  - "bridge-latency.test.ts renamed to bridge-latency.util.ts — dev utility misnamed as test"
metrics:
  duration: "6 minutes"
  completed: "2026-03-08"
  tasks_completed: 2
  tasks_total: 2
  files_created: 3
  files_modified: 1
  tests_added: 131
---

# Phase 1 Plan 03: Role & Transposition Verification Summary

**One-liner:** 131 tests verify AUTH-04 role hierarchy (52 tests) and PROF-01/PROF-02 transposition priority chain (79 tests), confirming soundEngineer boolean flag is orthogonal to roles and auto-transposition wiring is complete.

## What Was Done

### Task 1: Role-based access control tests (AUTH-04)

Created `src/lib/__tests__/roles.test.ts` with 52 tests covering:

- Full 5x5 role matrix: every combination of user role vs. minimum role requirement
- `hasRole()` correctness for: admin, band_leader, musician, member, pending
- `deriveRoles()` boolean combinations for each role level
- Legacy alias: 'leader' == 'band_leader' (level 80)
- Null/undefined/empty string edge cases
- Sound engineer orthogonality: `deriveRoles('musician')` stays musician-level regardless of `soundEngineer` flag
- Monitor access pattern simulation: `isAdmin || isSoundEngineer || hasBusAssigned`

Updated `src/lib/roles.ts` with AUTH-04 role model documentation block:
- All four access levels with numeric hierarchy values (admin=100, band_leader=80, musician=60, member=40, pending=0)
- Explicit note that soundEngineer is a boolean on UserProfile, not a hierarchy level
- Reference to research decision: "Keep the boolean flag approach"

### Task 2: Musician profile auto-transposition tests (PROF-01, PROF-02)

Created `src/hooks/__tests__/use-musician-transposition.test.ts` with 79 tests covering:

**All 18 INSTRUMENT_PRESETS validated:**
- Concert pitch (0): acoustic_guitar, electric_bass, mandolin, electric_guitar, classical_guitar, voice, hand_drums, violin, trombone, piano, ukulele, other
- Bb instruments (+2): bb_trumpet, bb_clarinet, bb_tenor_sax, bb_soprano_sax
- Eb instruments (-3): eb_alto_sax
- F instruments (+7): f_horn

**Priority chain logic (4 levels):**
1. Per-track leader setting (non-zero) overrides everything
2. Per-song user preference overrides profile
3. Profile `defaultTransposition` overrides zero default
4. Falls back to 0 (original key)

**Additional validations:**
- Instrument label derivation from INSTRUMENT_PRESETS
- Auto-save debounce guard: no save when leader sets track transposition
- `isAutoTransposed` flag: true only when file applied AND transposition non-zero
- MusicianProfile interface compliance (optional fields, empty profile)

## Verification Results

```
Test Files: 25 passed (25)
Tests:      502 passed (502)
```

New tests added by this plan:
- `src/lib/__tests__/roles.test.ts`: 52 tests
- `src/hooks/__tests__/use-musician-transposition.test.ts`: 79 tests
- Total: 131 new tests

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] bridge-latency.test.ts caused vitest failure**
- **Found during:** Task 2, running full test suite
- **Issue:** `src/lib/__tests__/bridge-latency.test.ts` was a browser-only dev utility with `.test.ts` extension. Vitest picked it up and failed with "No test suite found" because it contains no `describe`/`it` blocks — only exported async utility functions for manual browser console use. File header explicitly says "NOT a Vitest test file."
- **Fix:** Renamed to `bridge-latency.util.ts` — preserves the utility while removing it from Vitest discovery
- **Files modified:** `src/lib/__tests__/bridge-latency.test.ts` → `src/lib/__tests__/bridge-latency.util.ts`
- **Commit:** 4a7f0a8

**2. [Rule 2 - Correctness] INSTRUMENT_PRESETS count was 18, not 17**
- **Found during:** Task 2, first test run
- **Issue:** Initial test expected 17 presets. Actual count is 18: 7 core + 8 occasional + 3 other (piano, ukulele, other). The plan description said "all 17 instruments" but the actual codebase has 18.
- **Fix:** Updated test to assert `toBe(18)` and verified all 18 keys exist
- **Commit:** 4a7f0a8

## Chain Verification (PROF-02)

End-to-end transposition chain confirmed intact:

1. `MusicianProfileSettings` → `saveMusicianProfile()` → Firestore users/{uid}.musicianProfile
2. `subscribeToMusicianProfile(uid)` → `setProfile()` in `useMusicianTransposition` hook
3. `profile.defaultTransposition` applied via `setTransposition()` in `useMusicStore`
4. `useMusicStore().transposition` → PDF chord overlays via `TransposerMenu`/PDF viewer
5. `isAutoTransposed` flag shows auto indicator in `TransposerMenu`

All links confirmed by code inspection; priority chain logic matches implementation in `use-musician-transposition.ts`.

## Self-Check: PASSED

Files exist:
- `src/lib/__tests__/roles.test.ts` — 52 tests, PASSES
- `src/hooks/__tests__/use-musician-transposition.test.ts` — 79 tests, PASSES
- `src/lib/roles.ts` — AUTH-04 documentation added
- `src/lib/__tests__/bridge-latency.util.ts` — renamed from .test.ts

Commits:
- 859ed04: test(01-03): add comprehensive role hierarchy tests (AUTH-04)
- 4a7f0a8: test(01-03): add transposition priority chain tests (PROF-01, PROF-02)

Requirements satisfied:
- AUTH-04: Four roles verified (admin, band_leader, musician, sound_engineer as boolean)
- PROF-01: Musician profile with instrument/transposition/capo/flats verified
- PROF-02: Auto-transposition priority chain verified end-to-end
