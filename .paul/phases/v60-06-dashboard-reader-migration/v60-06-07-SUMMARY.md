---
phase: v60-06-dashboard-reader-migration
plan: 07
subsystem: api-server
tags: [firestore-admin-sdk, server-tracks, getTracksForSetlist, matrix, ssot, promise-all]

requires:
  - phase: v60-04-01
    provides: getTracksForSetlist(db, setlistId, setlistData) Admin-SDK helper at @/lib/server-tracks
provides:
  - matrix endpoint reads tracks via the canonical Admin-SDK helper for every doc in the 8-week bulk fetch
  - Parallelized per-setlist helper invocation (Promise.all over snapshot.docs) — single round-trip class regardless of N
  - Server reader spine COMPLETE: every server-side Setlist constructor with downstream-consumed `tracks` now routes through getTracksForSetlist
affects:
  - v60-07 (writer removal) — final server reader leakage point closed; embedded-array writer strip is safe to plan
  - v60-08 (cleanup) — the helper's `setlistData.tracks` fallback branch can be dropped after backfill
  - Any future bulk-snapshot mapper that builds Setlist[] objects with `tracks` for downstream consumption — pattern is now: spread → explicit overrides → `as unknown as Setlist` cast

tech-stack:
  added: []
  patterns:
    - "Bulk-snapshot mapper via Promise.all(snapshot.docs.map(async doc => ...)) when each row needs an awaited helper call — parallelizes the N-doc fanout without serializing"
    - "Spread-with-explicit-override narrowing fix at single-object cast site: `as unknown as T` (TS-suggested in TS2352 error). Variant of v60-06-06's pattern (where the fix was `Record<string, unknown>[]` for an intermediate array). Apply at cast site when a strongly-typed explicit member causes TS to drop the spread from the inferred literal"

key-files:
  created: []
  modified:
    - src/app/api/setlists/matrix/route.ts

key-decisions:
  - "Promise.all over snapshot.docs.map(async ...) (NOT serial for-loop with await) — typical N ≤ 8, parallel fanout keeps latency at one helper-RTT class"
  - "Spread → explicit `tracks` override after spread (helper result wins) — mirrors v60-04-01 page.tsx ordering; explicit post-spread override is the contract for 'helper beats embedded'"
  - "`as unknown as Setlist` cast (NOT `as Setlist`) — strongly-typed `tracks: LocalTrack[]` triggered TS2352 spread-narrowing; double-cast through unknown is TS-suggested and matches v60-06-06's documented spread-with-id pattern class"
  - "Single combined commit per session precedent (v60-04-01..03 / v60-06-01..06) — single file, ≤+25 LOC ceiling, independently revertible"
  - "/ui-ux-pro-max NOT required — SPECIAL-FLOWS trigger ('Any phase that touches frontend UI/UX') not met; this is a server API route only"

patterns-established:
  - "Server reader spine completion criterion: every server-side `as Setlist`-cast object literal containing `tracks` for downstream consumption must source `tracks` from `getTracksForSetlist(db, setlistId, data)` — NOT from `...data` spread. v60-04-01..03 + v60-06-07 prove this is the full set; v60-07 writer strip is safe."
  - "When a bulk Firestore snapshot mapper needs an awaited per-doc transformation (helper call, joined query), wrap snapshot.docs.map with `await Promise.all(...)` so the mapper becomes async-friendly without serializing the fanout."

duration: ~5min (single-task standard plan; 1 tsc iteration for spread-narrowing fix)
started: 2026-05-13T07:30:00-05:00
completed: 2026-05-13T07:40:00-05:00
---

# Phase v60-06 Plan 07: matrix/route.ts server-side reader migration

**Matrix endpoint (`/api/setlists/matrix`) now reads tracks via `getTracksForSetlist` for every doc in the 8-week bulk fetch, parallelized via `Promise.all`. Server reader spine COMPLETE — every server-side Setlist constructor that exposes `tracks` to downstream consumers now routes through the canonical Admin-SDK helper. v60-07 writer strip is unblocked.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~5 min (single task, single tsc iteration) |
| Started | 2026-05-13T07:30:00-05:00 |
| Completed | 2026-05-13T07:40:00-05:00 |
| Tasks | 1 of 1 executed (DONE/PASS after qualify) |
| Files modified | 1 |
| Net source LOC | +3 (7 insertions − 4 deletions) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: matrix reads via getTracksForSetlist; helper result wins over embedded | ✅ Pass | `getTracksForSetlist(db, doc.id, data)` invoked per doc; explicit `tracks` override after `...data` spread |
| AC-2: Per-setlist helper calls parallelized | ✅ Pass | `await Promise.all(snapshot.docs.map(async doc => ...))` — no serial await loop |
| AC-3: Grid-matching code consumes helper-derived tracks transparently | ✅ Pass | Lines ~109-130 untouched; `setlist.tracks.find(t => ...)` reads from helper-derived array via duck-typed `Setlist['tracks']` inference; `t.title` + `t.fileName` access compatible with LocalTrack |
| AC-4: Date / eventDate Timestamp conversion preserved | ✅ Pass | Both `data.date?.toDate ? .toISOString() : ...` chains intact verbatim |
| AC-5: tsc clean + next build Compiled successfully | ✅ Pass | tsc EXIT=0 (after auto-fix); next build Compiled successfully; `/api/setlists/matrix` route preserved in route table |
| AC-6: Suite baselines preserved | ✅ Pass | vitest 1591 passed / 52 failed (exact baseline; zero new failures); HFG counter 0/3 held (no engine touch) |
| AC-7: LOC ceiling ≤ +25 net | ✅ Pass | +3 LOC net (+7 / −4); 88% under ceiling |
| AC-8: PENDING-UAT | ⏳ Deferred | Daniel opens dashboard → 8-week matrix shows live top-level tracks for hydrated setlists / embedded for legacy. Joins v6.0 PENDING-UAT bundle |

## Accomplishments

- **Server reader spine COMPLETE.** With this plan, every server-side surface that builds a Setlist with `tracks` for downstream consumption (page.tsx publish, print/public, print/personal, email-packets, resend-email, matrix) routes through `getTracksForSetlist`. The contract is now: server code wanting "the live track list" for a setlist MUST call the helper. No reader leakage points remain — v60-07 embedded-array writer strip is safe to plan.
- **Bulk-snapshot parallelization pattern documented.** Future server routes that bulk-fetch setlists and need per-doc helper invocation now have a worked example: `await Promise.all(snapshot.docs.map(async doc => { ... const result = await helper(...); return { ...data, ...overrides } as unknown as T }))`. The pattern keeps the fanout latency at one round-trip class regardless of N.
- **Spread-narrowing pattern variant documented.** v60-06-06 caught the `Record<string, unknown>[]` variant for intermediate-array sites; v60-06-07 catches the `as unknown as Setlist` variant for single-object cast sites with a strongly-typed explicit member. Both stem from the same TS-narrowing root: explicit members after spread suppress the spread's contribution to the inferred literal.

## Task Commits

Single combined commit per session precedent:

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Task 1 + SUMMARY + STATE/ROADMAP docs | (see Git State in STATE.md after push) | feat(v60-06-07) | matrix/route.ts: helper-routed bulk fetch with Promise.all parallel fanout |

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/app/api/setlists/matrix/route.ts` | Modified (+3 net) | New `getTracksForSetlist` import; bulk-snapshot mapper rewritten as `await Promise.all(...async doc => ...)` with helper call + explicit `tracks` override; cast adjusted to `as unknown as Setlist` for TS spread-narrowing compatibility |
| `.paul/phases/v60-06-dashboard-reader-migration/v60-06-07-PLAN.md` | Created | Plan artifact |
| `.paul/phases/v60-06-dashboard-reader-migration/v60-06-07-SUMMARY.md` | Created | This file |
| `.paul/STATE.md` | Modified | Loop position → UNIFY ✓; session continuity routed to v60-06-08 |
| `.paul/ROADMAP.md` | Modified | v60-06 row reflects v60-06-07 closure |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Promise.all over snapshot.docs.map | Typical N ≤ 8 for the 8-week window; parallel fanout keeps latency at one helper-RTT class. Serial `for/await` would multiply by N. | Worked pattern for any future bulk-snapshot+helper mapper |
| Spread → explicit `tracks` override (helper wins) | Embedded `data.tracks` shadows helper result if not overridden. Explicit post-spread `tracks: tracks` makes the precedence unambiguous in code (no implicit "later wins" reasoning required). | Helper-result-wins contract is visible in the literal itself; mirrors v60-04-01 page.tsx ordering |
| `as unknown as Setlist` double-cast | TS2352 fired because strongly-typed `tracks: LocalTrack[]` (post explicit-override) caused TS to drop the spread from inferred literal — Setlist's `name`/`trackCount` then appeared missing. Double-cast through `unknown` is TS-suggested and matches the v60-06-06 spread-narrowing pattern class. | Documented pattern variant for future single-object cast sites |
| /ui-ux-pro-max NOT required | SPECIAL-FLOWS trigger ("Any phase that touches frontend UI/UX") not met for a pure server API route. Same disposition as v60-04-01..03. | No skill load needed; saved invocation overhead |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | TS2353 spread-with-explicit-override narrowing — fixed via `as unknown as Setlist` cast (+1 LOC) |
| Scope additions | 0 | — |
| Deferred | 0 | — |

**Total impact:** Single TS-narrowing auto-fix matching v60-06-06's documented pattern class. All functional ACs PASS; LOC delta still 88% under ceiling.

### Auto-fixed Issues

**1. [TS] TS2352 spread-with-explicit-override narrowing in matrix mapper return**
- **Found during:** Task 1 qualify — initial `npx tsc --noEmit` produced:
  ```
  src/app/api/setlists/matrix/route.ts(71,20): error TS2352:
    Conversion of type '{ id: string; tracks: LocalTrack[]; date: any; eventDate: any; }'
    to type 'Setlist' may be a mistake because neither type sufficiently overlaps with the other.
    Type '{ id: string; tracks: LocalTrack[]; date: any; eventDate: any; }'
    is missing the following properties from type 'Setlist': name, trackCount
  ```
- **Issue:** The strongly-typed `tracks: LocalTrack[]` explicit member (post-spread override) caused TS to drop the `...data` spread from the inferred literal type. The original code's explicit members were all `any`-typed (`data.date?.toDate ? ... : data.date` returns `any`), so the spread was preserved in inference. Introducing a non-`any` explicit member triggered the narrowing.
- **Fix:** Changed the cast from `as Setlist` to `as unknown as Setlist` — TS-suggested in the error message itself ("If this was intentional, convert the expression to 'unknown' first"). Matches v60-06-06's documented spread-narrowing pattern class.
- **Files:** `src/app/api/setlists/matrix/route.ts` (1 line)
- **Verification:** `npx tsc --noEmit` EXIT=0 after fix; vitest 1591/52 baseline held.
- **Commit:** part of the v60-06-07 single combined commit

### Deferred Items

None — plan executed as written aside from the auto-fixed narrowing.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| TS2352 spread-with-explicit-override narrowing | Cast through `unknown`. Documented as a pattern variant in patterns-established. |

## Skill Audit

| Expected | Invoked | Notes |
|----------|---------|-------|
| /ui-ux-pro-max | n/a | Not required — SPECIAL-FLOWS trigger ("Any phase that touches frontend UI/UX") not met. Server API route only; no UI / styling / layout / copy changes. Same disposition as v60-04-01..03. |

All required skills invoked ✓ (none applicable to this plan).

## Next Phase Readiness

**Ready (final v60-06 plan):**
- **v60-06-08** — 15-setlist backfill script + `migration_snapshots/{setlistId}` rollback collection. Writes denormalized fields (`trackCount`, `songCount`, `fileIds`, `hydrated`) + top-level `tracks/{id}` rows for historical setlists. Enables v60-08 cleanup (drop the embedded `setlist.tracks[]` array; drop the helper's `setlistData.tracks` fallback branch; drop `mirrorTracksToTopLevel` writer side). After v60-06-08, the v60-06 phase LOOP COMPLETE and v60-07 writer strip becomes the next phase plan target.

**Wave 3 status after v60-06-07:**
- ✅ v60-04: Server-side reader migration (page.tsx + 4 routes) — complete
- ✅ v60-05: Editor + perform-view client reader migration — complete
- 🚧 v60-06: Dashboard + matrix + backfill — 7 of ~8 plans complete; only backfill (v60-06-08) remains
- ⚪ v60-07: Embedded-array writer strip — UNBLOCKED (server reader spine complete; v60-06-08 backfill writes top-level tracks for historical setlists before the writer dies)
- ⚪ v60-08: Cleanup — unchanged (waits on v60-07)

**Concerns:**
- None novel. The matrix endpoint has no current test file; route-level integration tests deferred to a future test-infra pass per v60-04-01..03 convention. Helper coverage (server-tracks.test.ts from v60-04-01) exercises both hydrated and legacy branches that matrix now consumes.

**Blockers:**
- None.
- **v6.0 PENDING-UAT carry:** Daniel (next dashboard session) — open dashboard, view 8-week matrix, confirm hydrated setlists show live top-level tracks (any post-v50-05 setlist whose tracks were edited after publish should reflect those edits in the matrix grid cells), legacy setlists still populate from embedded. UAT deferable to Daniel's next dashboard-checking session. Joins v5.0 / v5.2 / v5.3 / v5.4 / v60-01..06-06 PENDING-UAT bundle.

---
*Phase: v60-06-dashboard-reader-migration, Plan: 07*
*Completed: 2026-05-13*
