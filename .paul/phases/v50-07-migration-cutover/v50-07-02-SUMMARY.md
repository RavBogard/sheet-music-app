# v50-07-02 SUMMARY

**Closed:** 2026-04-27
**Loop:** PLAN ✓ → APPLY ✓ → UNIFY ✓
**Type:** execute — backend / data-layer; no source code changes outside `scripts/`
**Skill required:** none — `/ui-ux-pro-max` not invoked (no UI surface modified)

---

## What was built

Two deliverables prerequisite to v50-07-03 (lazy hydration in `SetlistGridHydrator` + perf-view dual-read):

### Task 1 — `migrate-v50.ts` MARKER_PATH patch
Pre-existing structural bug (caught by v50-07-01 audit): `MARKER_PATH = 'system/migrations/v50'` is a 3-segment path = collection, not document. `db.doc()` throws against real Firestore. Tests use a fake adapter that does not validate path structure, so the bug never surfaced before.

Patched to `system/v50Migration` (2-segment doc path). Test fixtures updated to match (3 occurrences in `scripts/__tests__/migrate-v50.test.ts`). All 13 existing migrate-v50 tests still pass.

### Task 2 — `scripts/scrub-livestate.ts` (new, ~250 LOC)
One-shot script removing the orphan `liveState` field from setlists. v50-02 amputation deleted the code that consumed `liveState` but left field data in place; scrubbing removes dead weight before v50-07-03 lazy hydration reads each setlist.

Modeled on `migrate-v50.ts` structure:
- Reuses `MigrationFirestore` interface + `FIELD_DELETE_SENTINEL` (no contract duplication)
- Modes: dry-run (default; safer than migrate-v50.ts which defaults to apply) / apply / rollback / force / help
- Idempotency via `system/livestateScrub` marker (2-seg doc path)
- Per-setlist rollback snapshots written to `migrations/livestate-scrub/snapshot/{setlistId}` BEFORE each delete (4-seg doc path)
- `FieldValue.delete()` mapped via existing sentinel pattern

Tests in `scripts/__tests__/scrub-livestate.test.ts` (~280 LOC, 14 cases): dry-run safety, apply correctness (field removal + snapshots + marker + invariance), idempotency (skip on marker present + force re-run), rollback (restore + delete marker + count). Mirrors migrate-v50.test.ts patterns. All 14 green on first run.

### Task 3 — Production scrub applied
Sequence:
1. `npx tsx scripts/scrub-livestate.ts --dry-run` → reported 10 setlists carrying `liveState`, sample IDs match v50-07-01 audit exactly
2. `npx tsx scripts/scrub-livestate.ts --apply` → wrote 10 rollback snapshots, removed 10 `liveState` fields, wrote `system/livestateScrub` marker with `appliedAt + affectedCount: 10`
3. Re-ran `npx tsx scripts/audit-v50.ts` → confirms `liveState` count = 0; setlist count unchanged at 29; embedded track count unchanged at 650; all other v50-02 orphans still clean

Logs captured in `v50-07-02-DRY-RUN-LOG.md` + `v50-07-02-APPLY-LOG.md` for audit trail.

---

## Acceptance criteria status

- ✓ AC-1: MARKER_PATH valid 2-segment doc path
- ✓ AC-2: All 13 migrate-v50 tests pass after patch (no regressions)
- ✓ AC-3: dry-run reports 10 setlists; zero production writes; no marker creation
- ✓ AC-4: apply removes liveState via FieldValue.delete; per-setlist snapshots; marker written
- ✓ AC-5: rollback path covered by tests (not exercised against prod — snapshots stay in place as undo path for v50-07-03)
- ✓ AC-6: 14 unit tests pass on in-memory FakeFirestore
- ✓ AC-7: production scrub applied + verified via re-audit

---

## Decisions made

| Decision | Rationale |
|----------|-----------|
| `MARKER_PATH = 'system/v50Migration'` (not `migrations/v50State` or other 4-seg path) | 2-segment is the simplest valid form; matches the existing `system/` namespace convention; minimal edit for the patch |
| scrub-livestate.ts default mode is dry-run (NOT apply) | Smaller / less reviewed script than migrate-v50.ts; safer default; explicit `--apply` is required to actually mutate production |
| Reuse `MigrationFirestore` + `FIELD_DELETE_SENTINEL` from migrate-v50.ts via import | Single contract for all v50 migrations; tests stay admin-SDK-free; pattern reusable for future scrub scripts |
| Per-setlist snapshot path: `migrations/livestate-scrub/snapshot/{setlistId}` (parallel to migrate-v50's `migrations/v50/snapshot/{songId}`) | Symmetric layout — every v50 migration gets its own subtree under `migrations/` for snapshots and isolation |
| Did NOT exercise rollback against production | Apply succeeded + re-audit confirmed; rollback snapshots stay in place as undo path if v50-07-03 surfaces something liveState-related (defensive) |
| Did NOT change `SNAPSHOT_COLLECTION` in migrate-v50.ts | Already correct (`migrations/v50/snapshot` = 3-seg base; `${SNAPSHOT_COLLECTION}/${songId}` = 4-seg doc; `listCollection(SNAPSHOT_COLLECTION)` = 3-seg collection — both usages valid) |

---

## Files touched

### New
- `scripts/scrub-livestate.ts` (~250 LOC)
- `scripts/__tests__/scrub-livestate.test.ts` (~280 LOC, 14 tests)
- `.paul/phases/v50-07-migration-cutover/v50-07-02-PLAN.md`
- `.paul/phases/v50-07-migration-cutover/v50-07-02-DRY-RUN-LOG.md`
- `.paul/phases/v50-07-migration-cutover/v50-07-02-APPLY-LOG.md`
- `.paul/phases/v50-07-migration-cutover/v50-07-02-SUMMARY.md`

### Modified
- `scripts/migrate-v50.ts` (MARKER_PATH constant + 4-line comment)
- `scripts/__tests__/migrate-v50.test.ts` (3 path string literals + 1 test name)
- `.paul/STATE.md` (loop position + decision log)
- `.paul/ROADMAP.md` (v50-07-02 row)

### Production Firestore (mutated, with rollback path)
- 10 setlists in `setlists/*` had `liveState` field removed
- 10 snapshot docs written to `migrations/livestate-scrub/snapshot/*`
- 1 marker doc written to `system/livestateScrub`

---

## Suite + build status

- vitest: **1456/1456 passing** (was 1442; +14 scrub tests; 0 regressions)
- tsc: clean
- next build: clean (full route table renders; no Next.js App Router export violations)

---

## What's next

**v50-07-03** — Lazy hydration in `SetlistGridHydrator` + perf-view dual-read
- `/ui-ux-pro-max` BLOCKING (touches frontend rendering)
- Detect legacy `setlists/{id}.tracks[]` shape on hydrator mount
- Convert per-track via `applyEdit('set', 'tracks', ...)` to top-level
- Write `hydrated:true` on setlist doc (idempotency for re-mount)
- `useSetlistPerformance` dual-reads: legacy `tracks[]` if non-empty, else top-level `tracks/{id}`
- Both paths must stay backwards-compatible — Rabbi must be able to view + edit any of the 24 historical setlists

**Substrate ready (delivered by v50-07-02):**
- `migrate-v50.ts` is now apply-safe (path bug fixed) — available if user later changes mind on song-catalog bootstrap
- `liveState` orphan eliminated — v50-07-03 lazy hydration won't trip on it
- Rollback path preserved via `migrations/livestate-scrub/snapshot/*`
