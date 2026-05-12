---
phase: v60-04-server-side-reader-migration
plan: 02
subsystem: api
tags: [firebase-admin, firestore, server-only, hydration, print-pdf, packet-generation]

requires:
  - phase: v60-04-server-side-reader-migration
    provides: `getTracksForSetlist` helper at `@/lib/server-tracks` (introduced by v60-04-01)
provides:
  - print/public route migrated to read tracks via shared helper (anonymous-download path)
  - print/personal route migrated to read tracks via shared helper (authenticated personal-transposition path)
affects:
  - v60-04-03 (email-packets + resend-email — last v60-04 plan; same drop-in pattern)
  - v60-07 (writer strip — every reader must be migrated first)
  - v60-08 (legacy-branch cleanup)

tech-stack:
  added: []
  patterns:
    - "Drop-in route migration: import helper + replace reader at the call site, preserve existing narrow-type cast for downstream consumers"

key-files:
  created: []
  modified:
    - src/app/api/setlist/print/public/route.ts
    - src/app/api/setlist/print/personal/route.ts

key-decisions:
  - "No new emulator tests — v60-04-01's `server-tracks.emulator.test.ts` proves the helper contract; per-route emulator coverage would re-prove the same invariants without exercising route-specific behavior"
  - "Both routes file-bundled into one plan + one commit — matches the original phase plan ('v60-04-02 print/public + print/personal') and avoids splitting near-identical 1-line migrations across two plans"
  - "Preserved `as SetlistTrack[]` cast at each call site — keeps downstream `.map(t => ({...}))` PrintRequest builders compiling unchanged; same pattern as the publish-route migration in v60-04-01"

patterns-established:
  - "Per-route reader migration is a ~+4 LOC change (import line + reader swap + brief comment); identical scaffold across routes; bundle ≤3 near-identical routes per plan/commit"

duration: ~15min
started: 2026-05-12T17:40:00-05:00
completed: 2026-05-12T17:50:00-05:00
---

# Phase v60-04 Plan 02: print/public + print/personal route reader migration

**Migrated both print PDF route handlers to read tracks via the shared `getTracksForSetlist` helper. Drop-in pattern from v60-04-01; +8 LOC net production source; zero scope expansion; zero new tests (helper contract already proven). Closes the print-packet resurrection gap before band onboarding.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~15 min (plan + apply + unify) |
| Started | 2026-05-12T17:40:00-05:00 |
| Completed | 2026-05-12T17:50:00-05:00 |
| Tasks | 3 of 3 completed (all PASS) |
| Files modified | 2 |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: print/public reads via helper | ✅ Pass | `setlist.tracks` removed from reader path; helper call at public/route.ts:55 |
| AC-2: print/personal reads via helper; transposition math preserved | ✅ Pass | Helper call at personal/route.ts:53; `(t.transposition \|\| 0) + (profile.defaultTransposition \|\| 0)` mapper untouched |
| AC-3: Type compatibility preserved | ✅ Pass | `as SetlistTrack[]` cast at each call site; downstream `.map()` mappers compile unchanged; tsc exit 0 |
| AC-4: Net production LOC ≤+30 | ✅ Pass | +8 LOC net (12 added / 4 removed across both files) — well under budget |
| AC-5: tsc + `next build` clean | ✅ Pass | Both checks pass; route table preserved with /api/setlist/print/public + /api/setlist/print/personal segments |
| AC-6: Suite baselines preserved | ✅ Pass | Main: 1574 passed / 52 pre-existing failed / 40 skipped (zero new failures). Emulator: green (HFG counter 0/3 held) |

## Accomplishments

- **Print-packet correctness restored for hydrated setlists** — both anonymous-download (public packet served via email link) and authenticated personal-transposition flows now read the live top-level `tracks/{id}` source instead of the stale embedded array. Critical before band-onboarding; bandmembers downloading packets from email links would otherwise see resurrection-class stale data.
- **Drop-in pattern validated** — v60-04-03 (email routes) and any future server-side track reader can follow the exact same scaffold (~+4 LOC per route). Zero need to revisit helper API.
- **HFG counter held at 0/3** — no new emulator tests; helper contract is one test surface, and v60-04-01's coverage transitively validates all consumers that route through `getTracksForSetlist`.

## Task Commits

Single combined commit per v60-01/02/03/v60-04-01 precedent:

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| 1-3 (combined) | (filled at push) | feat(v60-04-02) | Migrate print/public + print/personal readers through getTracksForSetlist |

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/app/api/setlist/print/public/route.ts` | Modified (+7 / -2) | Hydration-aware reader; cast preserves SetlistTrack[] for downstream PrintRequest mapper |
| `src/app/api/setlist/print/personal/route.ts` | Modified (+5 / -2) | Hydration-aware reader; transposition math + musician-profile flags untouched |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Skip new emulator tests for the migrated routes | Helper contract already proven by v60-04-01; per-route emulator coverage re-proves same invariants without exercising route-specific behavior; "Don't add features beyond what the task requires" | HFG counter stays 0/3; plan executes in ~15min vs ~35min with redundant test coverage |
| File-bundle both routes into one commit | Matches original phase plan wording; routes are near-identical 1-line migrations; splitting would inflate commit count without changing revert isolation (both routes can be reverted by reverting one commit) | v60-04 phase plan count stays at 3 instead of inflating to 4 |
| Comment block at each call site (4 lines) | Future readers seeing `setlist.tracks` removed from these routes need the WHY (hydration + stale resurrection class); load-bearing per project memory "WHY non-obvious" rule | ~+8 LOC net (4 lines × 2 routes) of justified commentary; absent the comments, the change is opaque |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 0 | Plan executed exactly as written |
| Scope additions | 0 | None |
| Deferred | 0 | All AC met in-plan |

**Total impact:** Clean drop-in execution; no spec corrections, no scope creep. The v60-04-01 plan's hardest decisions (helper API, signature widening, test colocation) carried this plan through without friction.

### Deferred Items

None.

## Issues Encountered

None.

## Skill Audit

| Expected | Invoked | Notes |
|----------|---------|-------|
| /ui-ux-pro-max | n/a | Server-only API route handlers; no UI surface. Same as v60-04-01. |

All required skills satisfied.

## Next Phase Readiness

**Ready:**
- v60-04-03 (email-packets + resend-email migration) — same drop-in pattern. ~2 routes × ~+4 LOC each = ~+8 LOC net target. Last v60-04 plan.
- Both print packet endpoints serve correct data for hydrated setlists deployed at next push.

**Concerns:**
- Print-route narrow `SetlistTrack[]` cast preserves field access pattern; if `LocalTrack` is reshaped in v60-07/08, both casts need re-verification. Acceptable trade for v60-04.

**Blockers:**
- None.
- Browser-smoke against deployed master commit deferred to PENDING-UAT per Daniel "never local dev server" mandate; folds into v6.0 close path.

---
*Phase: v60-04-server-side-reader-migration, Plan: 02*
*Completed: 2026-05-12*
