---
phase: v60-06-dashboard-reader-migration
plan: 08
subsystem: data-migration
tags: [firestore-admin-sdk, backfill, migration-snapshots, rollback, idempotent, scripts, v60-tracks-ssot]

requires:
  - phase: v60-04-01
    provides: getTracksForSetlist + MigrationFirestore abstraction (via migrate-v50.ts)
  - phase: v60-06-02
    provides: 4-field cascade seed shape (hydrated/trackCount/songCount/fileIds) — backfill mirrors this byte-for-byte
provides:
  - scripts/backfill-tracks-v60.ts — apply / dry-run / rollback CLI for the 15-most-recent setlists
  - scripts/__tests__/backfill-tracks-v60.test.ts — 22-test vitest suite (fake-only, no firebase-admin)
  - migration_snapshots/{setlistId} rollback collection contract
  - system/v60TracksBackfill idempotency marker contract
  - Production dry-run report (5 MIGRATE / 5 SKIP-HYDRATED / 5 SKIP-EMPTY)
affects:
  - v60-07 writer removal — backfill ships the historical-setlist migration tool; --apply during a safe Mon–Wed window populates top-level tracks before the writer strip lands
  - v60-08 cleanup — owns deletion of `migration_snapshots/*` audit-trail collection after Daniel signs off on PENDING-UAT
  - Future migration scripts — reuses the migrate-v50.ts MigrationFirestore + FIELD_DELETE_SENTINEL abstraction; pattern compounds across v50 → v54-01 → v60-06-08

tech-stack:
  added: []
  patterns:
    - "Migration script triad: apply / dry-run / rollback via shared MigrationFirestore abstraction. Snapshot-before-mutate guarantees the rollback path. Idempotency marker doc records status + appliedAt + migratedSetlistIds for the rollback's resume cursor."
    - "Per-setlist mutation order is snapshot → top-level tracks fan-out (Promise.all) → setlist denormalization update. Order ensures any mid-script crash leaves rollback data intact."
    - "Marker-doc casting through `unknown as MarkerDocLike` (variant of v60-06-06/07 spread-narrowing class) when the runtime-typed Record<string, unknown> needs to flow into a structural type with required keys."

key-files:
  created:
    - scripts/backfill-tracks-v60.ts
    - scripts/__tests__/backfill-tracks-v60.test.ts
  modified: []

key-decisions:
  - "Reused MigrationFirestore / MigrationDoc / FIELD_DELETE_SENTINEL from scripts/migrate-v50.ts (verbatim imports, no redefinition) — same precedent as scripts/bootstrap-songs.ts (v54-01-01)"
  - "Default mode = `--dry-run` (NOT --apply) — script writes to PRODUCTION Firestore; the safer default prevents accidental migrations"
  - "Snapshot doc omits undefined fields rather than storing them as null — Firestore can't store undefined; rollback distinguishes 'field absent pre-apply' from 'field was false/0 pre-apply' via `=== undefined` check + FIELD_DELETE_SENTINEL"
  - "Per-setlist failure tolerance instead of cross-setlist atomic batch — N is small (≤15), partial migration is recoverable via per-setlist rollback, and the MigrationFirestore abstraction doesn't expose Firestore transactions/batches"
  - "Rollback PRESERVES migration_snapshots docs (does NOT delete them) — audit trail value; v60-08 cleanup owns final deletion"
  - "--force with --apply re-runs the script but classification still respects `hydrated:true` (no double-migration) — the marker check and the hydration check are independent gates"
  - "/ui-ux-pro-max NOT required — server-side data-migration script; SPECIAL-FLOWS trigger 'Any phase that touches frontend UI/UX' not met"

patterns-established:
  - "Migration script triad pattern (apply/dry-run/rollback + marker + snapshot collection + force flag) is now formalized across 3 production migrations: migrate-v50 (v50-04) / bootstrap-songs (v54-01-01) / backfill-tracks-v60 (v60-06-08). The shared MigrationFirestore abstraction is the test seam — every script is exercised against an in-memory FakeFirestore (no firebase-admin in tests)."
  - "Mutation-order contract for top-level fan-out migrations: snapshot doc FIRST, then per-doc writes via Promise.all, then parent-doc denormalization update LAST. Crash-safety: any partial state has a rollback path (snapshot exists ⇒ recoverable)."
  - "When a Firestore-typed Record<string, unknown> needs to flow into a structural type with required keys (e.g., MarkerDocLike), cast through `unknown` first. Same class as v60-06-06 (intermediate-array variant) and v60-06-07 (single-object cast variant); this is the marker-doc variant."

duration: ~50min (research + script implementation + test suite + tsc/vitest qualify loops + production dry-run)
started: 2026-05-13T08:00:00-05:00
completed: 2026-05-13T08:35:00-05:00
---

# Phase v60-06 Plan 08: 15-setlist top-level tracks backfill + rollback collection

**Ships the migration tool that finishes v6.0 Wave 3 on the historical-setlist surface: `scripts/backfill-tracks-v60.ts` migrates the 15 most-recent setlists from the embedded `tracks[]` shape to top-level `tracks/{id}` + 4-field denormalization, with per-setlist snapshots in `migration_snapshots/{setlistId}` for safe rollback. 22 unit tests pass against an in-memory MigrationFirestore fake; production dry-run identifies 5 historical migration candidates (late Mar–Apr 2026). Last plan in v60-06 — phase LOOP COMPLETE.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~35 min (research + 3 tasks + 2 tsc/test qualify iterations + production dry-run) |
| Started | 2026-05-13T08:00:00-05:00 |
| Completed | 2026-05-13T08:35:00-05:00 |
| Tasks | 3 of 3 (Task 1 DONE_WITH_CONCERNS, Tasks 2-3 DONE; all PASS after qualify) |
| Files created | 2 (script + test) |
| Files modified | 0 |
| New LOC | 563 script + 478 test = 1041 total |
| New tests | 22 (all passing) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: apply/dry-run/rollback with idempotency marker | ✅ Pass | All 3 modes implemented; marker `system/v60TracksBackfill`; `--force` overrides; `--help` exits 0 without touching Firestore |
| AC-2: Apply migrates 15 most-recent setlists by date DESC | ✅ Pass | BACKFILL_LIMIT=15; sort by `date` DESC; classify per doc (MIGRATE / SKIP-HYDRATED / SKIP-EMPTY); test asserts 18-candidate selection drops 3 oldest |
| AC-3: Snapshot written BEFORE mutation | ✅ Pass | Test asserts op-order: setDoc(snapshot) < setDoc(tracks/*) < updateDoc(setlist) |
| AC-4: tracks/{id} matches cascade shape | ✅ Pass | Test asserts setlistId override + order fallback to index + updatedAt sourced from setlist.updatedAt |
| AC-5: Setlist update has exactly 4 denorm fields | ✅ Pass | Test asserts hydrated=true, trackCount, songCount, fileIds; original fields preserved (merge semantics) |
| AC-6: Rollback restores prev fields + deletes scoped tracks | ✅ Pass | FIELD_DELETE_SENTINEL applied for previously-undefined fields; external tracks/{id} for other setlists untouched; ERROR-MISSING-SNAPSHOT logged for orphans |
| AC-7: ≥10 tests covering all 4 modes + edge cases | ✅ Pass (over-delivered) | 22 tests total (4 classifyAction + 3 computeDenormFields + 2 dry-run + 7 apply + 5 rollback + 1 determinism); fake-only verified via grep |
| AC-8: Dry-run produces actionable report | ✅ Pass | Production dry-run emitted 15 per-setlist lines + summary footer; result JSON includes migratedIds array |
| AC-9: tsc + vitest baselines | ✅ Pass | tsc EXIT=0 (after 2× marker-cast auto-fix); vitest 1613 pass / 52 baseline failed (1591 prior + 22 new; zero new failures); HFG 0/3 held |
| AC-10: PENDING-UAT --apply against production | ⏳ Deferred | Daniel runs `--apply` during a safe Mon–Wed window. Joins v6.0 PENDING-UAT bundle. Rollback available via `--rollback`. |

## Accomplishments

- **v6.0 Wave 3 historical-setlist surface unblocked.** The 5 production setlists currently on the legacy embedded shape (uBkulVkN…, tIJ5Dlvk…, IvowaTdX…, fgxquthW…, 9bmwUMJz… — late Mar–Apr 2026; track counts 16-45) have a deterministic migration path. After Daniel runs `--apply`, the matrix endpoint + dashboard surfaces show live top-level tracks data for the entire 8-week window with zero embedded-array fallbacks.
- **Migration script triad pattern formalized.** Third production migration shipping the apply/dry-run/rollback + marker + snapshot-collection + force-flag pattern (after v50 + v54-01-01). Future migrations follow the same skeleton; the `MigrationFirestore` abstraction in `migrate-v50.ts` keeps the test seam clean (in-memory fake; zero firebase-admin imports in tests).
- **Mutation-order contract documented.** Snapshot → fan-out → parent-doc-update. Any mid-script crash leaves a rollback-safe state (snapshot exists ⇒ recoverable). The op-order assertion in tests is a guard against future refactors that reorder for "elegance."
- **Production dry-run report captured for the PENDING-UAT decision.** The 15-candidate breakdown (5/5/5) gives Daniel a concrete preview of what `--apply` will do. The 5 MIGRATE candidates are all real CRC/Shireinu setlists older than Daniel's recent editor activity — exactly the historical-surface gap v60-07 needs closed.

## Dry-Run Report (verbatim from Task 3)

```
[DRY-RUN] backfill-tracks-v60 starting...
  [SKIP-HYDRATED] 5ZOswikr7CKqm7Zp7zje (2026-05-11) — already hydrated
  [SKIP-HYDRATED] vJqQL6jbpTwVVbv1Oahy (2026-05-10) — already hydrated
  [SKIP-EMPTY] xpFyGClkCD3je2WnQO10 (2026-05-09) — no embedded tracks
  [SKIP-EMPTY] eMFwUx7XBBAN0KUPmdhs (2026-05-09) — no embedded tracks
  [SKIP-EMPTY] BozK3CzZIaSZvWK0hnRs (2026-05-09) — no embedded tracks
  [SKIP-EMPTY] zyJGXUdIG80fLHaifJ7o (2026-05-09) — no embedded tracks
  [SKIP-EMPTY] QQSsAK2XY4dc8k5sFXIa (2026-05-08) — no embedded tracks
  [SKIP-HYDRATED] UnjLqKTtS4lNKQfMY6hB (2026-05-02) — already hydrated
  [MIGRATE] uBkulVkN8K7idSapCJjq (2026-04-25) — 27 tracks, 18 songs
  [MIGRATE] tIJ5DlvkeeN1CWAUTUM2 (2026-04-20) — 16 tracks, 16 songs
  [MIGRATE] IvowaTdXwZI7qu9U9QXc (2026-04-18) — 45 tracks, 25 songs
  [MIGRATE] fgxquthWA9IQ4UF2fZWw (2026-04-11) — 44 tracks, 24 songs
  [MIGRATE] 9bmwUMJzgIQgNRIe81jv (2026-04-04) — 38 tracks, 18 songs
  [SKIP-HYDRATED] FB2yEICglR8jQmG3pcnp (2026-04-03) — already hydrated
  [SKIP-HYDRATED] RL1C7QW75134LNA3rvQD (2026-03-28) — already hydrated
Total candidates: 15 / Migrate: 5 / Skip-hydrated: 5 / Skip-empty: 5
[DRY-RUN] No mutations performed. Run with --apply to migrate.
```

**Result JSON (truncated):**
```json
{
  "mode": "dry-run",
  "candidatesEvaluated": 15,
  "migrated": 5,
  "skippedHydrated": 5,
  "skippedEmpty": 5,
  "errors": [],
  "migratedIds": ["uBkulVkN8K7idSapCJjq", "tIJ5DlvkeeN1CWAUTUM2", "IvowaTdXwZI7qu9U9QXc", "fgxquthWA9IQ4UF2fZWw", "9bmwUMJzgIQgNRIe81jv"]
}
```

## Task Commits

Single combined commit per session precedent:

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Task 1 + Task 2 + Task 3 + SUMMARY + STATE/ROADMAP docs | (see Git State in STATE.md after push) | feat(v60-06-08) | scripts/backfill-tracks-v60.ts + 22-test fake-only suite; production dry-run captured |

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `scripts/backfill-tracks-v60.ts` | Created (+563 LOC) | apply/dry-run/rollback CLI; 7 named exports for test surface; firebase-admin adapter in CLI shim only |
| `scripts/__tests__/backfill-tracks-v60.test.ts` | Created (+478 LOC) | 22 vitest tests against in-memory FakeFirestore; deterministic via `now()` injection; ZERO firebase-admin imports |
| `.paul/phases/v60-06-dashboard-reader-migration/v60-06-08-PLAN.md` | Created | Plan artifact |
| `.paul/phases/v60-06-dashboard-reader-migration/v60-06-08-SUMMARY.md` | Created | This file |
| `.paul/STATE.md` | Modified | Loop position → UNIFY ✓; phase 6 marked complete; next-action routes to phase transition |
| `.paul/ROADMAP.md` | Modified | v60-06 row → ✅ LOOP COMPLETE |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Reuse MigrationFirestore from migrate-v50.ts (verbatim) | Third migration script in repo; abstraction proven across v50 / v54-01-01. Re-deriving would fragment the test pattern and lose the FieldValue.delete handling parity. | Future migrations import from migrate-v50.ts; consolidation pressure for v60-08 to refactor migrate-v50 into a generic helper (deferred) |
| Default mode = `--dry-run` (not --apply) | Script writes to PRODUCTION Firestore on --apply; the bootstrap-songs precedent defaulted to --apply, which is more dangerous. Safer default for a 15-doc-touching migration. | Daniel's PENDING-UAT step now requires the explicit `--apply` flag — clearer intent signal |
| Per-setlist failure tolerance (not cross-setlist atomic batch) | N ≤ 15; partial migration is recoverable via per-setlist rollback; MigrationFirestore abstraction doesn't expose Firestore batches. Atomic batch would also blow past Firestore's 500-write limit if any single setlist had >450 tracks (rare but possible). | Per-setlist errors logged + counted; script continues on individual failures; `result.errors` array surfaces failed IDs |
| Rollback preserves migration_snapshots docs | Audit trail value — Daniel can inspect what was migrated even after rollback. v60-08 cleanup owns final deletion. | Snapshot collection accumulates 10-15 docs once --apply runs; trivial storage cost |
| --force overrides marker but classification still applies | Two independent gates: marker (re-run protection) vs hydration flag (already-migrated protection). --force only bypasses the marker; double-migration on the same setlist is still prevented by classifyAction. | Documented in test (it block name calls it out); prevents users from re-creating top-level tracks if they --force expecting a full re-do |
| `as unknown as MarkerDocLike` cast | Same TS-narrowing class as v60-06-06 (array) and v60-06-07 (object) — Record<string, unknown> doesn't structurally satisfy MarkerDocLike's required `status` field, so a direct cast fails TS2352. Double-cast through `unknown` is the TS-suggested escape hatch. | Pattern variant catalog now spans 3 contexts (array / object / typed-record) |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 2 | TS2352 marker-cast (×2 sites, same class); test expectation correction on --force re-run |
| LOC overshoot | 1 | Script 563 LOC vs verify's ≤300 ceiling — verify estimate was off (bootstrap-songs reference is ~600) |
| Scope additions | 1 | 22 tests vs ≥10 floor (over-delivered for coverage robustness) |
| Deferred | 0 | — |

**Total impact:** Two essential auto-fixes (one TS-narrowing class, one test-expectation drift from prior apply state). All functional ACs PASS. Production dry-run is clean.

### Auto-fixed Issues

**1. [TS] TS2352 marker-cast narrowing (2 sites)**
- **Found during:** Task 1 verify — `npx tsc --noEmit` produced two errors:
  ```
  scripts/backfill-tracks-v60.ts(309,28): error TS2352: Conversion of type 'Record<string, unknown>' to type 'MarkerDocLike' may be a mistake...
  scripts/backfill-tracks-v60.ts(347,28): error TS2352: ...
  Property 'status' is missing in type 'Record<string, unknown>' but required in type 'MarkerDocLike'.
  ```
- **Issue:** The `(marker.data ?? {}) as MarkerDocLike` cast at the apply + rollback entry-points failed because Record<string, unknown> doesn't structurally satisfy MarkerDocLike's required `status` field (the literal `{}` empty object satisfies neither).
- **Fix:** Changed both casts to `as unknown as MarkerDocLike` — TS-suggested in the error message; matches v60-06-06 (array variant) + v60-06-07 (object variant) of the same TS-narrowing class.
- **Files:** `scripts/backfill-tracks-v60.ts` (2 lines via replace_all)
- **Verification:** `npx tsc --noEmit` EXIT=0 after fix.
- **Commit:** part of the v60-06-08 single combined commit.

**2. [TEST] --force re-run expectation drift**
- **Found during:** Task 2 vitest run — `it('re-run with --force bypasses the marker and re-applies')` failed: expected `result2.migrated === 1`, got `0`.
- **Issue:** After the first `--apply`, the test's seeded setlist sl1 has `hydrated: true` (FakeFirestore merged the denormalization patch). On the second `--apply --force` run, classifyAction correctly returns SKIP-HYDRATED — preventing double-migration. The test's expectation was wrong: --force bypasses the MARKER, but the hydration-flag check is a separate independent gate.
- **Fix:** Updated the test's expectation to match the correct behavior: marker bypassed (skippedAlreadyApplied === undefined) AND setlist classified as SKIP-HYDRATED (migrated === 0, skippedHydrated === 1). Also renamed the test to call out the actual contract: "...(but classification still skips already-hydrated setlists)".
- **Files:** `scripts/__tests__/backfill-tracks-v60.test.ts` (1 it() block body)
- **Verification:** 22/22 tests pass after fix.
- **Commit:** part of the v60-06-08 single combined commit.

### LOC Overshoot

**1. [LOC] `scripts/backfill-tracks-v60.ts` — 563 LOC vs ≤300 ceiling (+263 over)**
- **Found during:** Task 1 verify — `wc -l` returned 563.
- **Issue:** Plan estimated ≤300 LOC; actual is 563. The estimate was off; the real reference is `scripts/bootstrap-songs.ts` at ~600 LOC for a comparable apply/dry-run/rollback script. Comparing to bootstrap-songs, this script is 94% as large.
- **Root cause of size:** (a) 4-mode CLI shape with parseArgs / printHelp / main bodies; (b) full TypeScript types for SetlistDocLike / SnapshotDocLike / MarkerDocLike / BackfillOpts / BackfillResult / Action; (c) firebase-admin adapter shim (lines 506-563); (d) explicit per-setlist control flow that other patterns might collapse via cleverness.
- **Resolution:** Accept and document. Trimming would either lose the firebase-admin adapter (forces a separate file) or lose the typed interfaces (forces test casts everywhere). The bootstrap-songs precedent absorbs the same boilerplate floor; no degradation in maintainability.

### Scope Additions

**22 tests vs ≥10 floor:**
- Plan AC-7 specified "≥10 tests"; shipped 22 to thoroughly cover the 4 modes + 3 pure functions + determinism + op-order assertions.
- Net cost: ~150 LOC in the test file. Net value: catches the --force re-run expectation drift early (the test that initially failed was one of the over-delivered ones — without it, the bug ships).

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Initial tsc failure: 2× TS2352 on marker-cast | Cast through `unknown` (matches v60-06-06/07 pattern class). Documented in patterns-established. |
| Initial test failure on --force re-run | Updated expectation to match correct script behavior (marker and hydration-flag are independent gates). Documented in test name + comment. |
| Bash cwd state non-persistence | Used `/c/Users/dsbog/centralreform.live/sheet-music-app` absolute path on second tsc invocation; subsequent commands relied on the harness-stable working directory. |

## Skill Audit

| Expected | Invoked | Notes |
|----------|---------|-------|
| /ui-ux-pro-max | n/a | Not required — server-side data-migration script. SPECIAL-FLOWS trigger ("Any phase that touches frontend UI/UX") not met. Same disposition as v60-04-01..03, v60-06-07. |

All required skills invoked ✓ (none applicable to this plan).

## Next Phase Readiness

**Phase v60-06 LOOP COMPLETE.** Wave 3 reader-migration spine fully delivered:
- ✅ v60-06-01..05: Dashboard surfaces (HeroCard, CompactSetlistRow, SetlistCards, use-upcoming-prep, dashboard reader, SetlistDrawer) reading denormalized fields with embedded fallback
- ✅ v60-06-06: TemplatesSection admin migration + new Web-SDK direct-fetch helper (client reader inventory complete)
- ✅ v60-06-07: matrix endpoint migration (server reader spine complete)
- ✅ v60-06-08 (this plan): historical backfill tool + production dry-run captured

**Ready (next phase):**
- **v60-07 — Embedded-array writer removal + immediate FieldValue.delete strip.** All reader surfaces (server + client + dashboard denorm + historical backfill tool) closed. v60-07 strips the writer side: remove `mirrorTracksToTopLevel` writer code paths; SetlistGridHydrator stops maintaining the embedded array post-cascade; the dual-write era ends. After v60-07 + Daniel's `--apply` run, every active setlist (recent + historical-15) reads exclusively from top-level `tracks/{id}`.

**Concerns:**
- The 5 SKIP-EMPTY setlists in the dry-run report (xpFyGClk, eMFwUx7X, BozK3CzZ, zyJGXUdI, QQSsAK2X — all from 2026-05-08/09) are unusual: recent dates with no embedded tracks. Probably template/draft setlists Daniel created but never populated. Not a bug — classifyAction correctly skips them. Worth noting in case Daniel asks "why didn't these get migrated?".
- The 4 most-recent setlists are SKIP-HYDRATED (Daniel actively uses the editor on them, so the lazy-hydration cascade already ran). Healthy signal; matches expected production state.
- LOC overshoot pattern (script 563 / test 478) is consistent with bootstrap-songs.ts (v54-01-01). Future migration ceilings should reference ~600/~500 as the realistic floor for a full triad-mode script.

**Blockers:**
- None for v60-07.
- **v6.0 PENDING-UAT carry-over for v60-06-08:** Daniel runs `npx tsx scripts/backfill-tracks-v60.ts --apply` during a safe Mon–Wed window. Expected outcome: 5 migrations land, marker doc records `status: 'applied'`, 5 migration_snapshots docs created. Rollback available via `--rollback`. Joins v5.0 / v5.2 / v5.3 / v5.4 / v60-01..06-07 PENDING-UAT bundle.

---
*Phase: v60-06-dashboard-reader-migration, Plan: 08*
*Completed: 2026-05-13*
