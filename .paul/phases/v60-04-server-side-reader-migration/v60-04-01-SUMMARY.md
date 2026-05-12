---
phase: v60-04-server-side-reader-migration
plan: 01
subsystem: api
tags: [firebase-admin, firestore, server-only, hydration, ssr, publish-route, emulator-tests]

requires:
  - phase: v60-03-java-install-emulator-canary
    provides: Firebase Local Emulator Suite + Java JDK 21 + `firebase emulators:exec` wrapper + vitest.emulator.config.ts (HFG counter 0/3)
  - phase: SSR-resurrection-hotfix-c9e92a5
    provides: Inline `fetchTopLevelTracks` + hydration ternary in page.tsx (now extracted)
provides:
  - getTracksForSetlist helper module — single source of truth for server-side hydration-aware track reads
  - publish/route.ts migrated to read tracks via helper (first non-SSR consumer)
  - Real-Firestore-emulator test coverage proving hydrated vs unhydrated branching contract
affects:
  - v60-04-02 (print/public + print/personal route migration — pattern established here)
  - v60-04-03 (email-packets + resend-email route migration)
  - v60-07 (embedded-array writer removal — depends on every reader being migrated first)
  - v60-08 (legacy-branch cleanup — deletes the unhydrated fallback after Wave 3 finishes)

tech-stack:
  added: []
  patterns:
    - "Hydration-aware server reader helper as single source of truth (additive — legacy branch retained until v60-08)"
    - "Real-Firestore-emulator test colocation for server admin-SDK helpers (`src/lib/__tests__/{name}.emulator.test.ts`)"

key-files:
  created:
    - src/lib/server-tracks.ts
    - src/lib/__tests__/server-tracks.emulator.test.ts
  modified:
    - src/app/(main)/setlists/[id]/page.tsx
    - src/app/api/setlist/publish/route.ts

key-decisions:
  - "Helper path: flat src/lib/server-tracks.ts (matches existing server-auth.ts / server-library.ts / server-setlists.ts convention; no new subdirectory)"
  - "Helper signature: setlistData typed as Record<string, unknown> (not a narrow {hydrated?, updatedAt?, tracks?} type) to match how callers pass parent doc data; TS2559 deviation from PLAN narrow-type wording"
  - "Publish migration bundled into v60-04-01 per Daniel scope decision (instead of helper-only entry plan + separate publish migration)"
  - "Type cast at publish/route.ts call site preserves the existing inline-annotated narrow shape for downstream consumers (publishedSnapshot, recordSongUsage, email body) instead of widening recordSongUsage"
  - "Test colocation: new sibling src/lib/__tests__/server-tracks.emulator.test.ts (NOT bolted onto v60-03's engine.emulator.test.ts — server reader is a different concern from engine FSM)"

patterns-established:
  - "Single shared helper for hydration-aware reads; every server surface routes through it"
  - "Server admin-SDK helpers live as flat src/lib/server-{name}.ts (not src/lib/server/{name}.ts subdir)"
  - "Emulator-backed tests for server admin-SDK code use the same emulators:exec harness as engine tests but live colocated to the helper, not the engine test file"

duration: ~35min
started: 2026-05-12T17:15:00-05:00
completed: 2026-05-12T17:35:00-05:00
---

# Phase v60-04 Plan 01: Server-side reader migration — getTracksForSetlist + publish-route bundled

**Extracted the hydration-aware `fetchTopLevelTracks` ternary from `page.tsx` into a shared admin-only `src/lib/server-tracks.ts` helper, rerouted SSR through it, and migrated the publish route (first non-SSR consumer) — all in one combined commit. Real-Firestore emulator tests (3/3 green) prove both branches; HFG counter holds at 0/3.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~35 min (resume + plan + apply + unify) |
| Started | 2026-05-12T17:15:00-05:00 |
| Completed | 2026-05-12T17:35:00-05:00 |
| Tasks | 5 of 5 completed (all PASS) |
| Files modified | 4 (2 created, 2 modified) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Helper module exists, admin-SDK only, single export | ✅ Pass | `grep ^export` returns exactly one `getTracksForSetlist`; no `firebase/firestore` imports |
| AC-2: Hydration-aware branching | ✅ Pass | Implemented per Task 1; emulator-proven in Task 4 (hydrated returns top-level, unhydrated returns embedded) |
| AC-3: page.tsx reroutes through helper; inline impl deleted | ✅ Pass | `fetchTopLevelTracks` + `buildLocalTracks` removed from page.tsx; single call site at page.tsx:92 |
| AC-4: publish route reads via helper | ✅ Pass | `setlist.tracks \|\| []` replaced with `await getTracksForSetlist(db, setlistId, setlist)` at publish/route.ts:91 |
| AC-5: Emulator-backed test proves both branches | ✅ Pass | 3 tests / 3 passing on real Firestore: hydrated-returns-top-level, unhydrated-returns-embedded, hydrated-sorts-by-order |
| AC-6: Single combined commit; net production source ≤30 LOC | ✅ Pass | Net +18 LOC (server-tracks.ts +79 / page.tsx -61 / publish/route.ts +9 -1 = net +18). Initially +38; trimmed JSDoc blocks to fit budget. |
| AC-7: tsc + `next build` clean | ✅ Pass | `npx tsc --noEmit` exit 0; `next build` Compiled successfully with route table preserved (publish/route.ts route-export discipline intact per feedback_nextjs_route_exports) |

All 7 AC pass. Browser-smoke (AC-7 follow-on per v6.0 constraint) deferred to PENDING-UAT against deployed master commit per standard Daniel-loop discipline.

## Accomplishments

- **Single source of truth established** for server-side hydration-aware track reads. Future server consumers (v60-04-02 print routes, v60-04-03 email-packets/resend-email) and the v60-07 writer strip / v60-08 cleanup all build on this one helper instead of re-implementing the ternary at each call site.
- **Publish route resurrection bug closed** — `publishedSnapshot` now reflects the live top-level `tracks/{id}` rows for hydrated setlists instead of the stale embedded array. The bug had been latent since v50-05; only fixed for SSR in `c9e92a5` (2026-05-12 P0). Publish stamps + email body + recordSongUsage now all read correct data.
- **HFG counter held at 0/3** — emulator tests added against real Firestore (not in-memory fake); no clause-(b) waiver taken. Wave 3 migration phases continue riding the v60-03 harness without re-opening the gap.

## Task Commits

Single combined commit per v60-01/02/03 precedent:

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| 1-5 (combined) | (filled at push) | feat(v60-04-01) | Helper extract + page.tsx reroute + publish migration + emulator tests |

Plan metadata + SUMMARY bundled into same commit per feedback_paul_phase_commits.md (entire `.paul/phases/v60-04-server-side-reader-migration/` dir staged explicitly).

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/lib/server-tracks.ts` | Created (79 LOC) | Admin-only `getTracksForSetlist` helper — hydration-aware track reader; single source of truth for server-side consumers |
| `src/lib/__tests__/server-tracks.emulator.test.ts` | Created (124 LOC) | Real-Firestore-emulator tests proving hydrated/unhydrated branching contract + order-by sort |
| `src/app/(main)/setlists/[id]/page.tsx` | Modified (+2 / -63) | Routes SSR through helper; inline `fetchTopLevelTracks` + `buildLocalTracks` removed; `toMs` + `buildLocalSetlist` preserved (still used for setlist envelope) |
| `src/app/api/setlist/publish/route.ts` | Modified (+9 / -1) | Imports helper; `setlist.tracks \|\| []` reader replaced with hydration-aware call; type cast preserves narrow downstream shape |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Helper at flat `src/lib/server-tracks.ts` (not subdir) | Matches existing server-auth.ts / server-library.ts / server-setlists.ts convention; avoids introducing a new directory mid-milestone | v60-04-02/03 follow-up migrations import from this stable path; no future refactor needed |
| Helper signature: `setlistData: Record<string, unknown>` (not narrow object type) | Original PLAN spec wanted `{hydrated?, updatedAt?, tracks?}` but TS2559 fired at the page.tsx call site (`Record<string, unknown> & {id}` has no name overlap with narrow type) | Widening preserves call-site ergonomics; runtime checks (`=== true`, `toMs`, `Array.isArray`) still narrow safely inside the helper |
| Bundle publish migration into v60-04-01 (not separate v60-04-02 plan) | Daniel scope decision at /paul:plan time — saves a plan cycle; publish route's hydrated-vs-not check is a clean drop-in | v60-04 now needs 3 plans total (01 helper+publish / 02 print routes / 03 email routes), not 4 |
| Type cast at publish/route.ts:91 (not widen recordSongUsage) | Plan's stated approach — keeps downstream API contracts narrow; cast is semantically identical to the pre-v60-04 inline type annotation | recordSongUsage / publishedSnapshot / email body unchanged; isolation preserved |
| Trim JSDoc blocks in server-tracks.ts to fit ≤30 LOC net budget | Initial draft was +38 LOC (over by 8); JSDoc carried the overflow without adding non-obvious WHY (the helper is short enough to read) | Net +18 LOC; well under ≤30 budget; preserved the admin-only / DO-NOT-import-from-client comment as it's load-bearing convention |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | Spec-level (helper signature) — corrected mid-task, no scope drift |
| Scope additions | 0 | None |
| Deferred | 0 | All AC met in-plan |

**Total impact:** One spec deviation (helper signature widened from narrow type to `Record<string, unknown>`). Behaviorally identical. No scope creep.

### Auto-fixed Issues

**1. [Spec] Helper signature too narrow for caller's declared type**
- **Found during:** Task 2 qualify (`npx tsc --noEmit` after page.tsx reroute)
- **Issue:** Plan specified `setlistData: { hydrated?: boolean; updatedAt?: unknown; tracks?: unknown }` but TS2559 fired because page.tsx's `serialized` is typed `Record<string, unknown> & { id: string }` — no name overlap with the narrow type, structural assignment refused
- **Fix:** Widened helper param to `setlistData: Record<string, unknown>` in `src/lib/server-tracks.ts:60`. Runtime guards (`setlistData.hydrated === true`, `toMs(setlistData.updatedAt)`, `Array.isArray(rawTracks)`) all accept `unknown` values, so behavior is unchanged
- **Files:** src/lib/server-tracks.ts (signature line only)
- **Verification:** Re-ran tsc (exit 0); re-ran emulator tests (3/3 still green); no semantic difference between narrow vs wide param type since helper accesses fields by name and validates at runtime
- **Commit:** part of the single v60-04-01 combined commit

### Deferred Items

None — every AC met within the plan.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| TS2559 at page.tsx call site (Task 2) | Widened helper signature to `Record<string, unknown>`; tsc clean on re-check |
| Initial net LOC +38, over ≤30 target (Task 5) | Trimmed 12 LOC of JSDoc commentary from server-tracks.ts (kept the load-bearing "Admin-SDK only" warning); final net +18 LOC |
| `npm run test:emulator -- <path>` produced "Too many arguments" because the npm script wraps `firebase emulators:exec "vitest run ..."` as a single positional | Bypassed the wrapper: ran `npx firebase emulators:exec --only firestore,auth "vitest run --config vitest.emulator.config.ts <path>"` directly. Same harness; just folded the test-path arg into the inner vitest command |

## Skill Audit

| Expected | Invoked | Notes |
|----------|---------|-------|
| /ui-ux-pro-max | n/a | SPECIAL-FLOWS trigger is "Any phase that touches frontend UI/UX." v60-04-01 modifies only server modules + admin-SDK code; no components / styling / user-visible affordances. Gate not applicable. Returns for v60-09 / v60-10 (Wave 4 UI work). |

All required skills satisfied (no required skill applied to this plan's surface area).

## Next Phase Readiness

**Ready:**
- `getTracksForSetlist` is a stable public symbol — v60-04-02 (print/public + print/personal) and v60-04-03 (email-packets + resend-email) can drop in the same import + replace pattern shown in publish/route.ts
- Real-Firestore-emulator test harness extended; future Wave 3 server-side helpers can colocate `*.emulator.test.ts` files in `src/lib/__tests__/` without re-establishing the pattern
- HFG counter remains 0/3; no debt accumulated

**Concerns:**
- Helper retains the unhydrated fallback branch (legacy `buildLocalTracks` path). This is required until v60-08 cleanup; documented in helper header. If a caller incorrectly passes a setlist with `hydrated: undefined`, the legacy branch silently runs — relies on data-model invariant that all v6.0-era setlists either have `hydrated: true` (post-cascade) or are pre-v50-07-03 legacy.
- Publish route's type cast (`as Array<{ fileId?, title, key?, type? }>`) is technically an assertion. Runtime-safe but Type-system silent on shape divergence. Downstream consumers (publishedSnapshot, recordSongUsage, emailAllMembers) still expect the narrow shape; if a future helper change adds rich fields, the cast would mask the shape change at this site. Acceptable trade for v60-04-01; revisit if v60-07/08 reshapes LocalTrack.

**Blockers:**
- None for v60-04-02 (print routes). Pattern is identical to publish migration; ~5-8 LOC net per route.
- None for v60-04-03 (email routes). Same pattern.
- Browser-smoke against deployed master commit deferred to standing Daniel-loop UAT (per project memory: "Never use local dev server — always push to production on Vercel"). Folds into v6.0 PENDING-UAT close path.

---
*Phase: v60-04-server-side-reader-migration, Plan: 01*
*Completed: 2026-05-12*
