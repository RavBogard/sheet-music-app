# RUNBOOK — `backfill-drive-id-on-library-index.mjs`

Tier-1 historical-data fixup for the `drive-id-write-symmetry-fix` lane.
Closes FINDING-1 from the 2026-05-24 ingest-mutator-matrix research:
SLI-shape `library_index` rows pre-fix were missing the `driveFileId`
field that the drive-sync poller queries on, so already-synced Drive
files were misclassified NEW and PCU minted duplicates.

The lane's forward-fix lands in `src/lib/sync-engine.ts` (admin sync) +
`src/app/api/setlists/import/execute/route.ts` (setlist import). This
script heals the **historical** population for the first channel only —
`library_index` rows whose doc id IS the Drive file id but where
`driveFileId` is absent.

## Scope

Backfills only rows where:

- `doc.id` does **not** start with `upload-`, AND
- `doc.id` matches `^[A-Za-z0-9_-]{25,}$` (Drive-id shape), AND
- `data.driveFileId` is currently missing (or not a string).

For each match, stamps `driveFileId: <docId>`. Idempotent — a second
dry-run after `--apply` should report `wouldUpdate=0`.

**Out of scope:** `upload-<uuid>` rows from setlist-import-execute.
Those rows pre-fix have NO recoverable Drive id (the row never carried
it). They stay as-is; the forward-fix prevents new ones.

**Sanity check.** If a row's `driveFileId` is set AND differs from the
doc id, the script logs `MISMATCH` and **skips** (no overwrite). Surface
mismatched rows to the operator before any further action.

## Prerequisites

1. `.env.local` in `sheet-music-app-drive-id-symmetry/` (or the eventual
   merged checkout) with:
   - `FIREBASE_CLIENT_EMAIL`
   - `FIREBASE_PRIVATE_KEY`
   - `NEXT_PUBLIC_FIREBASE_PROJECT_ID` (defaults to `crcmusiccharts`)
2. The service account `firebase-adminsdk-fbsvc@crcmusiccharts` needs
   `datastore.user` (read + update on `library_index`). Already granted
   for the precedent `rebuild-setlist-fileids-denorm.mjs` lane.
3. The lane's forward-fix MUST be deployed to prod **before** running
   `--apply`. Otherwise new pre-fix SLI rows can keep landing and the
   backfill won't be stable.

## Dry-run

Always run dry-run first. Default mode.

```bash
node scripts/backfill-drive-id-on-library-index.mjs > /tmp/backfill-dryrun.json 2> /tmp/backfill-dryrun.log
```

Read the stderr trace (`/tmp/backfill-dryrun.log`) for per-row decisions
and the summary block. Read the stdout JSON (`/tmp/backfill-dryrun.json`)
for a machine-readable record.

### What to look for

- `scanned` — total library_index rows (~600 for CRC at 2026-05-24).
- `driveShapeMatched` — rows passing the Drive-id heuristic (sanity:
  this should be > 0 but well under `scanned`; most catalog growth post
  2026-05-15 has been `upload-` rows).
- `alreadyStamped` — rows where `driveFileId` is already correctly set
  (e.g. the forward-fix has shipped and started filling these in for
  newly-synced rows, OR a prior partial backfill).
- `wouldUpdate` — number of rows the `--apply` run would write.
- `mismatched` — anomalies. **Investigate before `--apply`.** Each row
  shows up in the stderr log as `MISMATCH ... current="X" expected="Y"`.
- `skippedUploadShape` — `upload-` rows + anything else that didn't
  match the Drive-id heuristic. Sanity: this is the bulk of the catalog
  for an active project.
- `writeErrors` — always 0 in dry-run.

### Sanity ceilings

These are guidelines, not script-enforced gates. If any trip, HEADS-UP
supervisor before `--apply`:

- `mismatched > 0` — investigate the rows; they may indicate a bug in
  the write path, a manual edit, or a copy/restore artifact. Do NOT
  let the script "fix" these — it doesn't.
- `wouldUpdate / driveShapeMatched < 0.05` (post-forward-fix bake-in):
  most Drive-shape rows already stamped → backfill is mostly a no-op,
  fine to apply but low value.
- `wouldUpdate / driveShapeMatched > 0.95` (pre-forward-fix bake-in):
  forward-fix hasn't been writing yet → confirm deploy landed and rows
  written post-deploy carry `driveFileId`. Sample 3-5 rows manually.
- Any one of `driveShapeMatched + skippedUploadShape != scanned` —
  bug in the heuristic; do not `--apply`.

## Apply (gated)

**Single-owner rule per `[[feedback_single_owner_destructive_runs]]`.**
HEADS-UP supervisor first, get named as the executor, then run.

```bash
node scripts/backfill-drive-id-on-library-index.mjs --apply > /tmp/backfill-apply.json 2> /tmp/backfill-apply.log
```

Expected: `updated == wouldUpdate-from-prior-dryrun` (give or take
concurrent writes during the run window).

## Verify after `--apply`

Re-run dry-run. Expect `wouldUpdate == 0` (idempotent).

```bash
node scripts/backfill-drive-id-on-library-index.mjs > /tmp/backfill-verify.json 2> /tmp/backfill-verify.log
```

Also spot-check a handful of newly-stamped rows in the Firestore console
via `library_index` — confirm `driveFileId` equals the doc id.

## Followups

- The `upload-<uuid>` rows from pre-fix setlist-import-execute remain
  un-backfillable. If Daniel ever wants those healed, we'd need an
  external map (probably from the original `chartUrl` field stored on
  the parent setlist track's row — separate lane). For now they stay
  as orphans of the FINDING-1 historical population.

## See also

- `.paul/research/ingest-mutator-matrix/FINDINGS.md` §FINDING-1
- `src/lib/drive-sync/poller.ts:findRowByDriveFileId` (the query shape)
- `scripts/rebuild-setlist-fileids-denorm.mjs` (precedent shape)
- `[[feedback_single_owner_destructive_runs]]`
