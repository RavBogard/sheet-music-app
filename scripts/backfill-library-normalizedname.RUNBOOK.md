# RUNBOOK — `backfill-library-normalizedname.mjs`

Tier-0 ops fix-up for the `normalizedname-backfill-apply` lane. Closes
ingest-mutator-matrix **FINDING-4** (per `.paul/research/ingest-mutator-matrix/
FINDINGS.md` §FINDING-4 + `FINDINGS-AUDIT.md` §FINDING-4 — auditor verified
the population is "wider than coder-4 described": IMP rows blind to BOTH
exact AND fuzzy dedup; SLI rows blind to fuzzy only).

The forward-fix has already landed:
- **IMP path** — `2333c68f0` setlist-import-via-pcu @ coder-4 routes new
  setlist-import rows through `processChartUpload` (PCU writes all 5 W-02
  fields).
- **SLI path** — `e100771ce` drive-sync rename/replace stem+titleSpecificity
  @ coder-2 + `4a9e3d896` shared `recomputeIndexNameFields` helper @
  coder-5.

This script heals the **historical population** on `library_index` rows
that the pre-fix channels wrote without one or more of:
- `nameLower`
- `normalizedName`
- `stem`
- `titleSpecificity`

It does NOT touch:
- Rows with `status === "orphaned"` (hidden from dedup; W-02 there is
  moot — matches PCU's filter at `src/lib/library-upload.ts:483`).
- Rows without a usable `name` (anomaly; logged + counted, never written).
- Any row where a current W-02 field is PRESENT but DIFFERS from the
  computed value (logged `MISMATCH`, no overwrite — surface to operator
  before any further action).
- Any field outside the four W-02 derivatives. The script preserves the
  rest of the row and writes ONLY the missing fields (no clobber of
  operator-applied corrections).

## Scope

For each `library_index/{docId}` row:

1. Filter: `status !== "orphaned"` AND `name` is a non-empty string.
2. Compute siblings: `siblingsInCatalog = count of active rows sharing
   bareStem(name)` (the row itself IS in that count). Matches PCU at
   `library-upload.ts:472-487`.
3. Compute fresh `{nameLower, normalizedName, stem, titleSpecificity}` via
   `scripts/lib/index-name-fields-compute.mjs` (pure-JS mirror of
   `src/lib/library/recompute-index-name-fields.ts`; parity enforced by
   `src/lib/library/__tests__/index-name-fields-compute-parity.test.ts`).
4. Per-field, classify against current:
   - **absent** → backfill target
   - **present + matches computed** → already-correct (no-op)
   - **present + differs** → mismatch (anomaly; skip whole row)
5. Write decision:
   - All four present + match → `already-stamped`.
   - One or more absent, zero mismatches → stamp only the missing fields.
   - Any mismatch → `mismatched`, no write.

Idempotent: a second dry-run after `--apply` reports `wouldUpdate=0`.

## Prerequisites

1. Standalone worktree per `[[project_worktree_test_harness_node_modules]]`
   (`sheet-music-app-normalizedname-backfill/` for this lane). `.env.local`
   present with:
   - `FIREBASE_CLIENT_EMAIL`
   - `FIREBASE_PRIVATE_KEY`
   - `NEXT_PUBLIC_FIREBASE_PROJECT_ID` (defaults to `crcmusiccharts`)
2. Service account `firebase-adminsdk-fbsvc@crcmusiccharts` with
   `datastore.user` (read + update on `library_index`). Already granted
   for the precedent backfill scripts.
3. The forward-fix MUST be deployed to prod **before** running `--apply`.
   At the time of this lane the forward-fix is on master at `2333c68f0`
   (IMP) + `e100771ce` (SLI rename/replace) + `4a9e3d896` (F-7 helper).
   Confirm the deploy with the supervisor before applying.
4. **Single-owner discipline** per `[[feedback_single_owner_destructive_runs]]`.
   The supervisor names ONE executor; that executor runs the script. Do
   NOT run `--apply` autonomously. Do NOT let two coders race the same
   apply.

## Dry-run

Default mode. Always run first.

```bash
node scripts/backfill-library-normalizedname.mjs \
  > .paul/ops/backfill-normalizedname/DRY-RUN-001.log 2>&1
```

(stdout JSON + stderr trace go to the same log file so the run is a single
artifact. To separate them: `> dryrun.json 2> dryrun.log`.)

### What to look for

- `scanned` — total `library_index` rows (~568 for CRC at 2026-05-24 per
  `[[project_orphan_baseline]]`).
- `skippedOrphaned` — rows with `status === "orphaned"`. CRC baseline = 297
  pre-hard-delete.
- `skippedNoName` — rows missing `name`. Expect 0 for a healthy catalog;
  >0 is an anomaly worth surfacing to the operator.
- `candidates` — active+named rows the script considered (== scanned −
  skippedOrphaned − skippedNoName).
- `alreadyStamped` — candidates already carrying all four W-02 fields.
- `wouldUpdate` — candidates the `--apply` run would stamp.
- `mismatched` — candidates with at least one PRESENT field that disagrees
  with the recomputed value. **Investigate before `--apply`.** Each row's
  stderr trace begins with `MISMATCH  <docId> ...`.
- `missingFieldHisto` — breakdown by field. Useful to cross-check the
  FINDING-4 population shape (IMP rows missing 4/4 fields; SLI rows
  missing 3/4, i.e. `normalizedName` + `stem` + `titleSpecificity`).
- `staleFraction = wouldUpdate / candidates` — sanity gauge for the
  HEADS-UP step.
- `writeErrors` — always 0 in dry-run.

### Sanity ceilings (HEADS-UP triggers)

These are guidelines; the script enforces no gate itself. If any trip,
HEADS-UP supervisor before `--apply`:

- `mismatched > 0` — anomaly: a row's existing W-02 field disagrees with
  the deterministic recompute. May indicate a bug, a manual edit, a
  schema drift, or a stale fixture. Do NOT let the script "fix" these —
  it doesn't. Surface to operator.
- `staleFraction > 0.05` (per dispatch precedent at coder-2 `8ddcca1c5`)
  — many candidates need writes; flag the count.
- `skippedNoName > 0` — anomaly; investigate.
- `candidates + skippedOrphaned + skippedNoName !== scanned` — bookkeeping
  bug; do not `--apply`.

## Apply (gated)

**Single-owner rule.** HEADS-UP supervisor with the DRY-RUN-001 summary
(staleFraction + sample rows + any mismatches); get named as the executor;
then run.

```bash
node scripts/backfill-library-normalizedname.mjs --apply \
  > .paul/ops/backfill-normalizedname/APPLY-001.log 2>&1
```

Expected: `updated == wouldUpdate-from-DRY-RUN-001` (give or take any
concurrent live writes during the run window — for an idle weekend slot
expect exact match).

## Re-dry (idempotency)

```bash
node scripts/backfill-library-normalizedname.mjs \
  > .paul/ops/backfill-normalizedname/REDRY-001.log 2>&1
```

Expected: `wouldUpdate == 0`. If non-zero, investigate (concurrent writes
or a row the apply skipped).

## Audit-trail commit

Stage all three logs + this RUNBOOK + a `RUN-SUMMARY.md` distilling the
three log summaries side-by-side (DRY → APPLY → RE-DRY counts). Push to
master per `[[feedback_git_push.md]]` (`git push origin
feat/backfill-library-normalizedname:master`).

Audit-trail location: `.paul/ops/backfill-normalizedname/`. Mirror the
coder-2 precedent at `8ddcca1c5` (`.paul/ops/stale-setlist-fileids-rebuild/`).

## Followups

- The `mismatched` rows (if any) need an operator triage path. Likely
  candidates: stale stem from a pre-`bareStem`-spec name OR an emoji
  prefix that's drifted under a new Unicode rev. Not in this lane's
  scope.
- If `missingFieldHisto.nameLower` is non-zero, those rows came from the
  IMP path and now have BOTH exact and fuzzy dedup restored. If the
  histogram is ZERO on `nameLower` but non-zero on the other three, the
  IMP path was already empty at apply time (i.e. all IMP rows had
  `nameLower` from a separate code path). Surface either way.

## See also

- `.paul/research/ingest-mutator-matrix/FINDINGS.md` §FINDING-4
- `.paul/research/ingest-mutator-matrix/FINDINGS-AUDIT.md` §FINDING-4
- `src/lib/library/recompute-index-name-fields.ts` (canonical helper @
  `4a9e3d896`)
- `src/lib/mcp/title-specificity.ts` (helper's only dep)
- `src/lib/library-upload.ts:472-554` (PCU's W-02 compute + sibling-recount
  cascade — the model this backfill mirrors)
- `scripts/backfill-drive-id-on-library-index.mjs` (closest sibling shape)
- `scripts/rebuild-setlist-fileids-denorm.mjs` (original DRY-RUN/--apply
  precedent at `8ddcca1c5`)
- `[[feedback_single_owner_destructive_runs]]`
