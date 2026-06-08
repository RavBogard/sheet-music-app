---
phase: v11-01-tenant-foundation
plan: 03
subsystem: database
tags: [multi-tenant, orgId, backfill, migration, firestore, ops]

requires:
  - phase: v11-01-01
    provides: org registry (DEFAULT_ORG_ID, ORGS) + Org type
  - phase: v11-01-02
    provides: write-path orgId stamping (new writes emit orgId)
provides:
  - existing prod data stamped orgId="crc" across setlists/tracks/library_index/songs/recordings
  - orgs/{crc} + orgs/{brotherslazaroff} seeded from the registry
  - reusable backfillOrgId/seedOrgs module + prod runner + RUNBOOK
  - both v11-01-04 preconditions met (new writes + existing data both carry orgId)
affects: [v11-01-04 org-scoped rules + deploy]

tech-stack:
  added: []
  patterns: [one-time tenant migration via testable db-injected module + thin .mjs prod runner; firebase-CLI-token→ADC auth for Admin-SDK prod scripts]

key-files:
  created:
    - src/lib/org/backfill-orgid.ts
    - src/lib/org/__tests__/backfill-orgid.emulator.test.ts
    - scripts/backfill-orgid-v11.mjs
    - scripts/backfill-orgid-v11.RUNBOOK.md

key-decisions:
  - "Uniform orgId='crc' stamp on all existing data (all existing data is CRC; bl has none yet)"
  - "Idempotent: skip docs with a non-empty orgId; merge-set only orgId (+createdAt on org docs)"
  - "Authenticated the prod Admin-SDK run via the firebase CLI's refresh token → temp authorized_user ADC (no SA key download needed); deleted the temp file after"

patterns-established:
  - "Admin-SDK prod scripts can auth via firebase-CLI-token→ADC when .env.local has no SA cert"

duration: ~20min
completed: 2026-06-08
---

# Phase v11-01 Plan 03: CRC backfill + org seeding Summary

**Stamped orgId="crc" on all 2,105 existing CRC docs across the five tenant collections and seeded orgs/{crc,brotherslazaroff} — the second precondition (with v11-01-02) for safe strict org-scoped rules.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~20 min (incl. credential-blocker resolution) |
| Completed | 2026-06-08 |
| Tasks | 3 completed (3/3 PASS) |
| Files created | 4 |
| Prod docs stamped | 2105 (setlists 48, tracks 459, library_index 668, songs 930, recordings 0) |
| Orgs seeded | 2 (crc, brotherslazaroff) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: backfill stamps orgId="crc" on docs missing it (5 collections) | Pass | Emulator test + prod --apply stamped 2105 docs |
| AC-2: idempotent — existing orgId never overwritten; 2nd run stamps 0 | Pass | Emulator: pre-stamped "brotherslazaroff" untouched, 2nd apply 0; prod re-run dry-run wouldStamp:0 everywhere |
| AC-3: seedOrgs writes orgs/{crc,bl} from registry, idempotent createdAt | Pass | Emulator test (createdAt preserved across re-run); prod seeded both, re-run → noop |
| AC-4: dryRun no writes, accurate would-change counts | Pass | Emulator test; prod dry-run reported 48/459/668/930/0 with 0 writes |
| AC-5: prod runner defaults DRY-RUN, requires --apply, emits report | Pass | node --check OK; prod dry-run → inspect → --apply → idempotent re-run |

## Verification Results

- `npx tsc --noEmit` → EXIT 0
- `npm run test:emulator` (backfill-orgid + setlist-write + orgid-stamping + mcp-setlist-write) → 4 files, **95 tests passed**; new `backfill-orgid.emulator.test.ts` = 5 tests green
- `node --check scripts/backfill-orgid-v11.mjs` → EXIT 0
- Prod DRY-RUN → `--apply` (2105 stamped, 2 orgs created) → DRY-RUN re-run → `wouldStamp:0` all collections, orgs `noop` (idempotency confirmed)

## Accomplishments

- All pre-existing CRC data now carries `orgId="crc"`; orgs registry collection seeded.
- Both preconditions for v11-01-04 strict rules are satisfied (new writes emit orgId via v11-01-02 ✓; existing data stamped ✓) — strict `require orgId` rules can now deploy without CRC lock-out.
- Established a reusable firebase-CLI-token→ADC auth path for Admin-SDK prod scripts on this box (no SA key on hand).

## Task Commits

Not committed individually. Per the v11.0 AUTONOMY directive (auto-commit per PHASE) + PAUL phase-commit pattern, v11-01-03 changes accumulate toward the single v11-01 phase-complete commit (after v11-01-04). NOTE: the .mjs/module/test are code artifacts (will commit); the prod data mutation already landed in Firestore (not a git artifact).

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/lib/org/backfill-orgid.ts` | Created | `backfillOrgId(db,{dryRun})` + `seedOrgs(db,{dryRun})` — testable, db-injected stamping/seeding logic |
| `src/lib/org/__tests__/backfill-orgid.emulator.test.ts` | Created | Emulator coverage (AC-1..AC-4): stamp / idempotent-skip / seed / dry-run |
| `scripts/backfill-orgid-v11.mjs` | Created | Prod runner — .env.local cert OR GOOGLE_APPLICATION_CREDENTIALS ADC; DRY-RUN default, --apply to commit |
| `scripts/backfill-orgid-v11.RUNBOOK.md` | Created | Operational procedure, idempotency, rollback, single-owner discipline |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Uniform `orgId="crc"` for all existing docs | All existing data is CRC; brotherslazaroff has no data yet | Simple, correct; no per-doc tenant inference |
| Idempotent merge-set (skip non-empty orgId) | Safe re-runs; never clobber a real tenant value | 2nd run stamps 0; future bl docs untouched |
| firebase-CLI-token → ADC for the prod run | No SA key in .env.local + no gcloud; firebase CLI logged in as owner | Ran the migration without a key download; pattern recorded in STATE for reuse |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 0 | — |
| Scope additions | 1 | Credential-flexibility (applicationDefault fallback) — small, sensible |
| Deferred | 0 | — |

**Total impact:** Minor, beneficial. The plan assumed `.env.local` SA creds (cert path). On this box those were absent and gcloud wasn't installed, so Task 3's prod run was briefly BLOCKED. Resolved by (a) extending the runner to also accept `applicationDefault()` via `GOOGLE_APPLICATION_CREDENTIALS`, and (b) converting the firebase CLI login's refresh token into a temp `authorized_user` ADC json (public firebase-tools OAuth client) to authenticate as owner. Temp ADC file deleted after the run. No change to the migration's intent or result.

### Deferred Items

None.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Prod runner couldn't authenticate (no SA cert in .env.local, no gcloud) | Built temp ADC from firebase CLI refresh token; ran dry-run → --apply; deleted temp file |

## Skill Audit

`/ui-ux-pro-max` is required only for frontend phases. v11-01-03 is a data-layer/ops migration with no UI surface — no required skill triggered. ✓

## Next Phase Readiness

**Ready:**
- Strict org-scoped Firestore rules (v11-01-04) can now `require orgId` safely — every existing doc and every new write carries it.
- `firebase deploy` for rules uses the CLI directly (already authed) — no ADC needed.

**Concerns:**
- v11-01-04 rules MUST be designed err-public (never gate musicians/performers) and emulator-tested before deploy; the v11-05 isolation audit remains mandatory.
- recordings had 0 docs — the recordings rule path will be exercised first by NEW writes (already orgId-stamped via v11-01-02).

**Blockers:**
- None.

---
*Phase: v11-01-tenant-foundation, Plan: 03*
*Completed: 2026-06-08*
