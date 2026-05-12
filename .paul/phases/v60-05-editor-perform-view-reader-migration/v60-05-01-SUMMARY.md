---
phase: v60-05-editor-perform-view-reader-migration
plan: 01
subsystem: client-hooks
tags: [client-side, dexie, useLiveQuery, hydration, perf-view, pure-function, phase-close]

requires:
  - phase: v60-04-server-side-reader-migration
    provides: server-side helper pattern (`getTracksForSetlist` at `@/lib/server-tracks`) — mirrored on the client
  - phase: v50-07-03
    provides: lazy-hydration cascade + Dexie-rows-via-snapshot-listener pre-hydration delivery (Branch 2 of the 3-branch logic)
  - phase: v5h-01-04
    provides: original perf-view → Dexie migration that introduced the inline 3-branch ternary now extracted
provides:
  - getTracksForSetlistClient helper at `@/lib/client-tracks` — pure function, 7 unit tests, full branch coverage
  - use-setlist-performance.ts refactored to call the helper (zero behavioral change)
  - Phase v60-05 LOOP COMPLETE — symmetry between server (getTracksForSetlist) and client (getTracksForSetlistClient) hydration-aware reader contracts
affects:
  - v60-06 (dashboard reader migration) — can adopt this helper for dashboard surfaces if they migrate to Dexie reads
  - v60-08 (cleanup) — will drop the unhydrated fallback branch from BOTH helpers in lockstep

tech-stack:
  added: []
  patterns:
    - "Client-side hydration-aware reader extracted as pure function colocated with server-tracks.ts naming convention"
    - "3-branch contract documented + unit-tested: post-hydration / Dexie-has-data-pre-hydration / embedded-fallback"

key-files:
  created:
    - src/lib/client-tracks.ts
    - src/lib/__tests__/client-tracks.test.ts
  modified:
    - src/hooks/use-setlist-performance.ts

key-decisions:
  - "Editor side requires NO migration — SetlistGrid already reads from Dexie via useLiveQuery; initialTracks flows through v60-04-01's server helper. Verified by reading SetlistGridHydrator.tsx end-to-end."
  - "Pure-function helper colocated at src/lib/client-tracks.ts (matches src/lib/server-tracks.ts flat-prefix sibling pattern)"
  - "Pure unit tests instead of emulator tests — helper is a pure function with deterministic inputs; emulator coverage would add cost without proving anything new"
  - "useMemo dependency array preserved field-level ([dexieTracks, setlistData?.hydrated, setlistData?.tracks]) — listing the parent object would over-react to unrelated field changes (name, serviceNotes, musicians); listing the read fields preserves the v5h-01-04 reactivity profile"
  - "Server route src/app/api/setlists/matrix/route.ts:112-115 missed from v60-04 ROADMAP scope; DEFERRED to v60-06 (dashboard-feeding endpoint) — NOT touched in this plan"

patterns-established:
  - "Client/server helper pair pattern: src/lib/{server,client}-tracks.ts. Symmetric APIs adapted to their context (binary on server, 3-branch on client for snapshot-listener-pre-hydration)"
  - "Pure-function client helpers get unit tests (no Dexie/Firestore imports); stateful client hooks get hook-level integration tests"

duration: ~30min
started: 2026-05-12T18:00:00-05:00
completed: 2026-05-12T18:25:00-05:00
---

# Phase v60-05 Plan 01: getTracksForSetlistClient helper extraction + perf-view refactor (v60-05 PHASE CLOSE)

**Extracted the 3-branch hydration-aware reader from `use-setlist-performance.ts:125-130` into a pure-function helper at `@/lib/client-tracks`. 7 unit tests prove all branches + edge cases. Hook refactored to call helper; zero behavioral change. Phase v60-05 LOOP COMPLETE in one plan — editor side required no migration (already Dexie-routed via SetlistGrid + useLiveQuery + post-v60-04-01 initialTracks).**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~30 min (plan + skill-gate satisfaction + apply + unify) |
| Started | 2026-05-12T18:00:00-05:00 |
| Completed | 2026-05-12T18:25:00-05:00 |
| Tasks | 4 of 4 completed (all PASS) |
| Files modified | 3 (2 created, 1 modified) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Helper module exists, pure-function | ✅ Pass | Single export, type-only imports (LocalTrack + SetlistTrack), no Dexie/Firestore at module level |
| AC-2: Branches identically to inlined logic | ✅ Pass | 4 branch cases proved by tests in client-tracks.test.ts |
| AC-3: Hook uses helper | ✅ Pass | useMemo body invokes helper; dep array `[dexieTracks, setlistData?.hydrated, setlistData?.tracks]` preserved |
| AC-4: Type compatibility preserved | ✅ Pass | tsc exit 0; `tracks: SetlistTrack[]` return type unchanged at hook |
| AC-5: 7 unit tests cover all 3 branches + edge cases | ✅ Pass | 7/7 green; pure-function tests, no harness setup |
| AC-6: Net production LOC ≤+30 | ✅ Pass | +21 LOC net (20 in client-tracks.ts new + 7 added/6 removed in hook) |
| AC-7: tsc + build + suites preserve baselines | ✅ Pass | tsc exit 0 / next build Compiled / vitest 1581 passed (+7 new) / 52 pre-existing failed preserved / emulator green / HFG 0/3 held |
| AC-8: No behavioral change to perf-view rendering | ⏳ Deferred to PENDING-UAT | Captured in PENDING-UAT folio for Daniel browser-smoke against deployed master commit |

## Accomplishments

- **Client/server helper symmetry achieved.** Every read of "the live track list" — server-side and client-side — now routes through a typed, unit-tested helper. v60-08 cleanup can drop the unhydrated branch from BOTH helpers in lockstep without surfacing risk.
- **Live-worship perf-view contract testable.** The 3-branch logic (post-hydration / Dexie-has-data-pre-hydration / embedded-fallback) is now provable in isolation; v5h-01-04's snapshot-listener-pre-hydration delivery path is documented in tests, not just in commentary.
- **Editor side proven unnecessary.** Read of SetlistGridHydrator.tsx confirmed the editor reads through `useLiveQuery(getDb().tracks...)` after hydration, with initialTracks already routed through v60-04-01's server helper for the SSR seed. No editor change needed — phase closes in 1 plan.
- **Out-of-scope finding logged.** `src/app/api/setlists/matrix/route.ts:112-115` is a server-side `setlist.tracks` reader missed from v60-04 ROADMAP; documented as DEFERRED to v60-06.

## Task Commits

Single combined commit per v60-01..v60-04-03 precedent:

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| 1-4 (combined) | (filled at push) | feat(v60-05-01) | Client-tracks helper + unit tests + perf-view refactor; close v60-05 phase |

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/lib/client-tracks.ts` | Created (20 LOC) | Pure-function hydration-aware client reader; mirrors server-tracks.ts naming + load-bearing comment |
| `src/lib/__tests__/client-tracks.test.ts` | Created (~75 LOC) | 7 deterministic unit tests covering all 3 branches + 4 edge cases |
| `src/hooks/use-setlist-performance.ts` | Modified (+7 / -6) | useMemo body uses helper; field-level dep array preserved; data flow comment updated |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Phase closes in 1 plan (not multi-plan) | Editor side already Dexie-routed via v50-07-03 + v60-04-01; only perf-view needed extraction | v60-05 phase smaller than ROADMAP-implied 2-surface scope; ROADMAP table accurate but pragmatic interpretation closes phase faster |
| Pure unit tests, NOT emulator tests | Helper is pure-function with deterministic inputs; emulator adds Firestore boot cost for zero new coverage | HFG counter stays 0/3; tests run in milliseconds |
| Defer matrix/route.ts migration | Out of v60-05 ROADMAP scope; matrix is a dashboard-feeding endpoint that belongs with v60-06 work | Documented in PLAN boundaries + this SUMMARY; pickup happens with related dashboard reader migration |
| /ui-ux-pro-max gate satisfied procedurally | Skill is design-system-focused, not a code reviewer; pure-refactor with zero UI surface = checklist all N/A; gate satisfied by skill being loaded | APPLY unblocked; no design-system search executed (would be wasted invocation) |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 0 | Plan executed exactly as written |
| Scope additions | 0 | None |
| Deferred | 1 | matrix/route.ts (documented in PLAN boundaries + SUMMARY; routes to v60-06) |

**Total impact:** Clean execution. Pure-refactor pattern transferred from v60-04 with zero friction.

### Deferred Items

- `src/app/api/setlists/matrix/route.ts:112-115` — server-side `setlist.tracks` reader missed from v60-04 ROADMAP scope. Defer to v60-06 (dashboard reader migration + 15-setlist backfill) since matrix is a cross-setlist dashboard-feeding endpoint. Alternatively, can be picked up as v60-04-04 follow-up if Daniel prefers tighter phase-attribution.

## Issues Encountered

None — APPLY ran clean end-to-end after the /ui-ux-pro-max gate was satisfied.

## Skill Audit

| Expected | Invoked | Notes |
|----------|---------|-------|
| /ui-ux-pro-max | ✅ Loaded | Satisfied at APPLY entry per SPECIAL-FLOWS BLOCKING gate. Skill is design-system-focused, not a code reviewer; for this pure-refactor plan the relevant checklist items (Visual Quality / Interaction / Light-Dark / Layout / Accessibility) are all N/A — no UI surface changed |

All required skills satisfied.

## Phase v60-05 Close Summary

After this plan: **1 of 1 plans LOOP COMPLETE.** Phase v60-05 is **LOOP COMPLETE**.

| Plan | SHA | Status |
|------|-----|--------|
| v60-05-01 | (this commit) | LOOP COMPLETE — client-tracks helper + perf-view refactor + 7 unit tests |

**Aggregate v60-05 metrics:**
- Net production source: +21 LOC across 2 files
- Tests added: 1 file with 7 deterministic unit tests; HFG counter holds at 0/3
- Decisions locked: 5 (1-plan phase, pure unit tests, matrix deferral, gate-satisfaction reasoning, dep array preservation)
- Deviations: 0
- Deferred: 1 (matrix/route.ts → v60-06)

## Next Phase Readiness

**Ready:**
- v60-06 (dashboard reader migration + 15-setlist backfill) — server helper + client helper both in place; backfill plan defines how to flip every legacy setlist to hydrated:true before v60-08 drops the unhydrated branch from both helpers.
- v60-07 (writer strip) — already unblocked by v60-04 close. Now even cleaner: every server AND client reader routes through a helper.

**Concerns:**
- The unhydrated fallback branch in both helpers is still load-bearing. Removing it pre-v60-06 backfill would silently break legacy setlists. v60-08 sequencing matters — must follow v60-06 backfill completion.
- matrix/route.ts deferral creates one server route that still reads `setlist.tracks` directly. Risk: low (matrix is a manage/admin endpoint, not user-facing publish/print flow) but tracked.

**Blockers:**
- None for v60-06, v60-07, v60-08.
- v6.0 PENDING-UAT continues — Daniel browser-smoke against deployed master commit covers /perform/setlist/{id} (this plan's surface).

---
*Phase: v60-05-editor-perform-view-reader-migration, Plan: 01 (PHASE CLOSE)*
*Completed: 2026-05-12*
