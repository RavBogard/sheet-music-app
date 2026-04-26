---
phase: v50-04-song-catalog
plan: 01
subsystem: database
tags: [dexie, indexeddb, firestore, migration, sticky-memory, song-catalog]

requires:
  - phase: v50-01-architecture
    provides: ARCHITECTURE.md §4 (per-song global defaults schema, propagation rules, conflict policy) + §5 (one-shot in-place migration approach)
  - phase: v50-03-sync-engine
    provides: applyEdit() atomic write API + Dexie songs store + FakeClock test pattern + per-doc drain ordering invariant

provides:
  - Dexie schema v2 with additive `defaults` + `recent` on songs (non-destructive upgrade from v1)
  - src/lib/songs/defaults.ts — seedTrackFromSong + propagateTrackEditToSong (debounced, FIFO-capped, per-song independent)
  - scripts/migrate-v50.ts — Firestore one-shot backfill with dry-run / apply / force / rollback / setlist-invariance hash check / system marker
  - vitest scripts/**/*.test.ts include path

affects: [v50-05-editor-cutover, v50-06-concurrent-edit-safety, v50-07-migration-cutover]

tech-stack:
  added: []
  patterns:
    - "Abstract MigrationFirestore interface — keeps migration core testable with in-memory fake; CLI wires firebase-admin separately"
    - "Per-key debounced propagation map (Map<id, {timer, pendingPatch, ...}>) — pattern reusable for future write-back consumers"
    - "FIELD_DELETE_SENTINEL Symbol — adapter-side mapping to FieldValue.delete() so the core stays admin-SDK-free"

key-files:
  created:
    - src/lib/songs/defaults.ts
    - src/lib/songs/__tests__/defaults.test.ts
    - scripts/migrate-v50.ts
    - scripts/__tests__/migrate-v50.test.ts
    - src/lib/local/__tests__/schema.test.ts
  modified:
    - src/lib/local/schema.ts (Dexie .version(2) added)
    - src/lib/local/types.ts (SongDefaults, SongRecentEntry, LocalSong+)
    - vitest.config.ts (include scripts/**/*.test.ts)

key-decisions:
  - "Debounce default = 1000ms — matches ARCHITECTURE.md §4.3 propagation rule explicitly"
  - "Schema bump to v2 is additive-only (no new indexes); explicit version() pinned for v50-05/06 indexed-field hooks"
  - "Migration core abstracted behind MigrationFirestore interface — testable without firebase-admin; CLI adapter uses FIELD_DELETE_SENTINEL for FieldValue.delete()"
  - "Orphan tracks (songId with no songs/{id} doc) skipped in BOTH dry-run and apply for honest counts"

patterns-established:
  - "FakeClock pattern from v50-03 ported to v50-04 helper tests — proven deterministic with fake-indexeddb microtask scheduling"
  - "Setlist-invariance hash check (pre/post sha256 of sorted-key JSON) as a regression guard for read-only-against-{collection} migration scripts"
  - "Atomic per-task commits with phase-close commit covering .paul/ planning artefacts (per feedback_paul_phase_commits.md)"

duration: ~75min
started: 2026-04-26T15:00:00Z
completed: 2026-04-26T15:30:00Z
---

# Phase v50-04 Plan 01: Song catalog & sticky memory — Summary

**Sticky song memory data plumbing shipped end-to-end: Dexie v2 schema, debounced read-through/write-back helpers, and a one-shot Firestore backfill script with dry-run + rollback. Zero UI changes. v50-05 editor cutover plugs in cleanly.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~75 min (PLAN→APPLY→UNIFY in one session) |
| Started | 2026-04-26T15:00:00Z |
| Completed | 2026-04-26T15:30:00Z |
| Tasks | 3/3 completed |
| Files created | 5 |
| Files modified | 3 |
| New tests | 25 (3 schema + 9 helper + 13 migration) |
| Test suite | 1344/1345 (1 pre-existing flake unrelated; see Issues) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Dexie v2 additive non-destructive | ✓ Pass | `db.verno === 2`; legacy v1 song rows round-trip with defaults/recent === undefined |
| AC-2: seedTrackFromSong read-through | ✓ Pass | Returns existing defaults; `{}` for missing song; coerces unknown fields out |
| AC-3: propagateTrackEditToSong debounced | ✓ Pass | 3 rapid calls → 1 applyEdit; latest-wins merge; per-song independent debounce; FIFO cap-5 |
| AC-4: Migration --dry-run zero writes | ✓ Pass | `fs.writes === {set:0,update:0,delete:0}`; `[DRY] songs/...` lines emitted; no marker written |
| AC-5: Migration apply + idempotency | ✓ Pass | most-recent-per-field defaults; marker written; second run exits early; `--force` overrides |
| AC-6: Migration --rollback | ✓ Pass | defaults+recent restored from snapshots; FIELD_DELETE_SENTINEL removes them entirely if pre-migration value was null; marker deleted |
| AC-7: Setlist invariance | ✓ Pass | Pre/post sha256 hash check; deliberate-mutation regression test confirms post-hash failure throws |

All 7 acceptance criteria satisfied with executable test evidence.

## Accomplishments

- **`songs/{id}.defaults` is now a first-class data citizen.** Both the local-first (Dexie) and remote (Firestore) sides know the schema; the helper module routes all writes through `applyEdit('update', 'songs', ...)` so the v50-03 sync engine carries them to Firestore unchanged. Per-doc drain ordering invariant from v50-03 is preserved by construction.
- **`scripts/migrate-v50.ts` is production-ready behind a hash-checked safety net.** Dry-run shows the plan; apply is idempotent; rollback restores from snapshots; setlist invariance is a hard pre-condition. Actual prod execution deferred to v50-07 cutover (per plan boundaries) but the script is shipped + dry-run-tested today.
- **Zero changes to legacy editor surface.** `setlist-firebase.ts`, `use-setlist-logic.ts`, `SetlistEditorV2.tsx` are untouched. v50-05 imports the helpers from `@/lib/songs/defaults` and replaces the editor wholesale; the existing app keeps running on the old write path until then.
- **Test pattern carries forward.** v50-03's FakeClock + macrotask-flush approach ported cleanly to debounced-helper tests (9 green); the abstract `MigrationFirestore` interface keeps migration tests admin-SDK-free (13 green).

## Task Commits

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Handoff archive | `695bd1f` | chore | Archive HANDOFF-2026-04-26 (consumed on resume) |
| Task 1: Dexie v→2 schema bump | `58d2725` | feat | LocalSong gains `defaults` + `recent`; non-destructive v1→v2 upgrade |
| Task 2: Sticky-memory helpers | `d73e891` | feat | seedTrackFromSong + debounced propagateTrackEditToSong |
| Task 3: Migration script | `d13da61` | feat | scripts/migrate-v50.ts with dry-run/apply/force/rollback + setlist invariance |
| Phase close | (next) | docs | SUMMARY.md, ROADMAP/PROJECT/STATE updates |

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/lib/local/schema.ts` | Modified | Added `db.version(2).stores({...})` — additive, all stores re-declared verbatim |
| `src/lib/local/types.ts` | Modified | New `SongDefaults`, `SongRecentEntry` interfaces; `LocalSong` extended |
| `src/lib/local/__tests__/schema.test.ts` | Created | 3 tests: verno=2, round-trip with defaults+recent, legacy row preservation |
| `src/lib/songs/defaults.ts` | Created | Helper module: seedTrackFromSong + propagateTrackEditToSong + flushPendingPropagations + injectable PropagationClock |
| `src/lib/songs/__tests__/defaults.test.ts` | Created | 9 tests covering read-through, debounce coalescing, per-song independence, FIFO cap-5, additive merge across flushes |
| `scripts/migrate-v50.ts` | Created | runMigration core + CLI entry point + abstract MigrationFirestore interface + FIELD_DELETE_SENTINEL |
| `scripts/__tests__/migrate-v50.test.ts` | Created | 13 tests using in-memory FakeFirestore: apply, idempotency, --force, dry-run zero-writes, rollback (with and without pre-state), setlist invariance regression guard |
| `vitest.config.ts` | Modified | Added `scripts/**/*.test.ts` to include[] |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Debounce default = 1000ms (overridable via opts) | Matches ARCHITECTURE.md §4.3 explicitly ("debounced (1s) write-back to songs/{id}.defaults") | v50-05 editor inherits this default; tests use shorter values via clock injection |
| Schema bump to v2 is additive-only (no new indexes on `defaults`) | Lookups happen by `id` only; over-indexing wastes IDB space (per plan boundaries) | If v50-05/06 needs an index on e.g. `defaults.lead`, it goes in a v(3) bump |
| Migration core abstracted behind `MigrationFirestore` interface | Tests run without firebase-admin SDK; CLI adapter wires the real one | Pattern reusable for future migration scripts; FIELD_DELETE_SENTINEL keeps core admin-SDK-free |
| Orphan tracks skipped in BOTH dry-run and apply for honest counts | Found during testing: dry-run was reporting 4 candidates while apply only wrote 3 (silently skipping the orphan). Fixed by hoisting the existence check above the mode branch | Dry-run report now matches what apply will actually write |
| Field-existence check via `affectedSongIds = await listCollection('songs').filter(exists)` | Done up-front so dry-run is honest | Adds one extra getDoc per candidate; trivial since song count << setlist count |

These additions go to PROJECT.md Decisions table:
- 2026-04-26: Sticky-memory debounce default = 1000ms (v50-04, matches ARCHITECTURE.md §4.3)
- 2026-04-26: MigrationFirestore abstract interface — tests SDK-free (v50-04, pattern for future migration scripts)
- 2026-04-26: Orphan track filter applied to BOTH dry-run and apply paths (v50-04, honest counts)

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 2 | Both essential — outbox-query test syntax + dry-run honesty |
| Scope additions | 1 | vitest.config.ts include extension (necessary to run script tests) |
| Deferred | 0 | Plan executed as written |

**Total impact:** Clean execution. The two auto-fixes were caught by the verify steps and resolved within the same task.

### Auto-fixed Issues

**1. Outbox compound-index query in helper test**
- **Found during:** Task 2 (helper test verification)
- **Issue:** `db.outbox.where({ collection: 'songs', docId: 'songA' }).toArray()` requires a compound `[collection+docId]` index that doesn't exist (and shouldn't — per Task 1 boundary "do NOT add indexes not needed").
- **Fix:** Switched to in-memory filter: `outbox.toArray().then(rows => rows.filter(r => r.collection === 'songs' && r.docId === 'songA'))`.
- **Files:** `src/lib/songs/__tests__/defaults.test.ts`
- **Verification:** Re-ran the test — passes. Other 8 helper tests unaffected.
- **Commit:** part of `d73e891`.

**2. Dry-run vs. apply count mismatch on orphan tracks**
- **Found during:** Task 3 (migration test verification — "produces zero writes and reports planned changes" failed with `expected 3, received 4`)
- **Issue:** `runMigration` was filtering orphan songs (songIds with no songs/* doc) only in the apply branch, while dry-run reported the raw accumulator size including orphans. Inaccurate planning output.
- **Fix:** Hoisted the existence check above the mode branch — both dry-run and apply now operate on the same `affectedSongIds` list.
- **Files:** `scripts/migrate-v50.ts`
- **Verification:** Re-ran full migration test suite — 13/13 pass. Setlist invariance still holds.
- **Commit:** part of `d13da61`.

### Scope Additions

**1. vitest.config.ts include path extension**
- **Why:** Plan called for `scripts/__tests__/migrate-v50.test.ts` but the existing vitest config restricted include to `src/**` and `bridge/src/**`. Without this, the script tests would silently not run.
- **Change:** Added `'scripts/**/*.test.ts'` to the include array.
- **Risk:** None — narrow extension, doesn't pull in node_modules.

### Deferred Items

None. Plan executed as written.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Pre-existing flake in `src/lib/sync/__tests__/cross-tab-lock.test.ts` ("exactly one of two instances acquires the lock") — non-deterministic tabId tie-break causes ~50% failure rate when run in isolation | **Out of scope.** `src/lib/sync/*` is in DO NOT CHANGE boundary (sync engine contract-locked from v50-03). Failing test asserts that the lower-tabId always wins, but the test creates instances `a` then `b` with random tabIds. Recommend: fix in a v50-06 (concurrent-edit safety) cleanup pass since that phase will already touch cross-tab logic. Logged for follow-up; not blocking v50-04 close. |

## Next Phase Readiness

**Ready:**
- `seedTrackFromSong` + `propagateTrackEditToSong` are stable, tested, and importable from `@/lib/songs/defaults` — v50-05 editor can call them directly.
- Dexie v2 is in place; v50-05 can add new song fields via patches without further schema changes (additive non-indexed). If v50-05/06 needs indexed fields on songs (e.g. `defaults.lead` for fast filter), it adds `db.version(3).stores(...)` — pattern is established.
- Migration script is dry-run-tested against an in-memory Firestore; production apply is deferred to v50-07 cutover. The 30-day snapshot soak window starts at first prod apply, not at script ship.

**Concerns:**
- Pre-existing cross-tab-lock test flake (see Issues). Not introduced here, not in scope to fix here, but worth a note in v50-06 plan when that phase opens.
- The migration script never exercised against real Firestore. v50-07 will run it for real with `--dry-run` first; we should add a smoke-test against a Firestore emulator before that point.

**Blockers:**
None. v50-05 (Spreadsheet editor cutover) can start.

---
*Phase: v50-04-song-catalog, Plan: 01*
*Completed: 2026-04-26*
