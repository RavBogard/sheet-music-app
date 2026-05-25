# RUNBOOK — `recover-salvage-row-drivefileid.mjs`

Tier-0 historical-data fixup for the `salvage-row-drivefileid-recovery`
lane (W5-2). Closes the orthogonal half of FINDING-1 (drive-id-write-
symmetry) that the W4-2 narrow-A backfill at `f7c23e3c3` deliberately
deferred per Daniel's Option-E ruling
`msg-drive-id-apply-backfill-ruling-002`.

The 271 B-006 salvage rows (resurrected 2026-05-20T19:37–19:44Z from the
2026-05-17T01:40:37 orphan event) have:

- a UUID v4 doc-id (NOT the original Drive id), so the W4-2
  `looksLikeDriveId(docId)` path can't reach them;
- the real Drive id parked in `backupDriveId`;
- NO `driveFileId` field — so the drive-sync poller's
  `findRowByDriveFileId(driveFileId)` lookup misses them entirely.

This script stamps `driveFileId: <backupDriveId>` on each matching row.

## Scope

Backfills only rows where:

- `data.source === "salvage"`, AND
- `typeof data.backupDriveId === "string"` AND `length > 0`, AND
- `data.driveFileId` is absent (or empty string), AND
- `data.backupDriveId` passes the real-Drive-id-shape sanity check
  (`^[A-Za-z0-9_-]{25,}$` + length 28–44).

For each match, stamps `driveFileId: <backupDriveId>`. Idempotent —
a second dry-run after `--apply` should report `wouldUpdate=0`.

**Out of scope:**

- Salvage rows with no `backupDriveId` (truly unrecoverable from the
  row alone). They stay as-is; counted under `skippedNoBackupDriveId`.
- Salvage rows whose `backupDriveId` fails the shape check (defense
  against unexpected data). Counted under `skippedBadShape`; HEADS-UP
  supervisor if `skippedBadShape > 0`.
- Non-salvage rows (handled by W4-2 sibling at
  `scripts/backfill-drive-id-on-library-index.mjs`).

**Sanity check.** If a salvage row's `driveFileId` is already set AND
differs from `backupDriveId`, the script logs `MISMATCH` and **skips**
(no overwrite). Surface mismatched rows to operator before any further
action.

## Prerequisites

1. `.env.local` in `sheet-music-app-salvage-recovery/` with:
   - `FIREBASE_CLIENT_EMAIL`
   - `FIREBASE_PRIVATE_KEY`
   - `NEXT_PUBLIC_FIREBASE_PROJECT_ID` (defaults to `crcmusiccharts`)
2. The service account `firebase-adminsdk-fbsvc@crcmusiccharts` needs
   `datastore.user` (read + update on `library_index`). Same grant as
   the precedent W4-2 lane (`f7c23e3c3`).
3. The W4-2 narrow backfill MUST be shipped (and it is, at
   `f7c23e3c3` on origin/master) — this script's recovery is
   orthogonal (different population) but coexisting populations in
   `library_index` confuse the reconciliation if W4-2 hasn't landed.

## Dry-run

Always run dry-run first. Default mode.

```bash
node scripts/recover-salvage-row-drivefileid.mjs > .paul/ops/salvage-row-recovery/DRY-RUN-001.log 2>&1
```

(The script writes both the JSON report on stdout and the per-row
trace on stderr, so a single combined log file captures everything.)

### What to look for

- `scanned` — total library_index rows (~625 for CRC at 2026-05-25).
- `salvageRows` — rows passing `source == "salvage"`. Expected ~271
  per `PROBE-001-FINDINGS.md` (10/10 sample shape consistent across
  the 271-row UUID set in the W4-2 DRY-RUN-001 trace).
- `candidates` — salvage rows that pass the recovery filter
  (`backupDriveId` present + valid shape, `driveFileId` absent).
  Expected ~271 (matches `salvageRows` if 10/10 PROBE generalises).
- `alreadyStamped` — salvage rows where `driveFileId == backupDriveId`
  already (post-apply re-run, or any prior partial backfill). Always 0
  on first DRY-RUN.
- `mismatched` — anomalies. **Investigate before `--apply`.** Each row
  shows up in the trace as `MISMATCH ... current="X" backupDriveId="Y"`.
- `skippedNoBackupDriveId` — salvage rows with no recoverable Drive id.
  Out of recovery scope.
- `skippedBadShape` — salvage rows whose `backupDriveId` doesn't pass
  the Drive-id shape check. Should be 0 in practice (the PROBE saw
  10/10 valid 33-char ids). If > 0, HEADS-UP supervisor.
- `wouldUpdate` — number of rows `--apply` would write. Expected ~271.
- `writeErrors` — always 0 in dry-run.

### Sanity ceilings

These are guidelines, not script-enforced gates. HEADS-UP supervisor
before `--apply` if any trip:

- `mismatched > 0` — investigate before applying. The salvage rows
  shouldn't have `driveFileId` set to anything other than the matching
  `backupDriveId`; a mismatch suggests a partial-backfill artifact or
  an unexpected ingest path.
- `skippedBadShape > 0` — at least one salvage row has a
  `backupDriveId` that doesn't fit the real Drive-id shape. The
  script won't write garbage; surface the row and decide whether to
  widen the shape check or leave it deferred.
- `candidates` materially different from ~271 (>10% drift either way)
  — suggests the PROBE sample missed a salvage variant; pause and
  re-probe before applying.
- `candidates + alreadyStamped + mismatched + skippedNoBackupDriveId
  + skippedBadShape != salvageRows` — bucketing drift; script also
  prints a `RECONCILIATION DRIFT` warning. Do NOT `--apply`.

## Apply (gated)

**Single-owner rule per `[[feedback_single_owner_destructive_runs]]`.**
HEADS-UP supervisor first with the DRY-RUN-001 numbers, get the GO,
then run.

```bash
node scripts/recover-salvage-row-drivefileid.mjs --apply > .paul/ops/salvage-row-recovery/APPLY-001.log 2>&1
```

Expected: `updated == wouldUpdate-from-prior-dryrun` (give or take
concurrent writes during the run window). `writeErrors: 0`.

## Verify after `--apply`

Re-run dry-run. Expect `wouldUpdate == 0` and
`alreadyStamped == prior-wouldUpdate` (idempotent).

```bash
node scripts/recover-salvage-row-drivefileid.mjs > .paul/ops/salvage-row-recovery/REDRY-001.log 2>&1
```

Spot-check a handful of newly-stamped rows in the Firestore console
via `library_index` — confirm `driveFileId` equals `backupDriveId`
for the sampled docs.

## Followups

- The non-salvage Drive-id-keyed historical population was already
  healed by the W4-2 sibling (`scripts/backfill-drive-id-on-library-
  index.mjs` shipped at `f7c23e3c3`).
- `upload-<uuid>` rows from pre-fix `setlist-import-execute` remain
  un-backfillable (no recoverable Drive id from the row alone). Out
  of scope for both this lane and W4-2.
- The W4-2 cosmetic counter wart (`skippedUploadShape` lumping
  `upload-*` + UUID-v4 = 342) is left as-is in the W4-2 script per
  the supervisor's tight-diff boundary. This W5-2 script has clean
  counter naming from the start (`salvageRows`, `candidates`,
  `skippedNoBackupDriveId`, `skippedBadShape`).

## See also

- `.paul/research/ingest-mutator-matrix/FINDINGS.md` §FINDING-1
- `.paul/ops/backfill-drive-id/PROBE-001-FINDINGS.md` (10/10 salvage
  shape sample; the rationale for splitting into 2 lanes)
- `.paul/ops/backfill-drive-id/RUN-SUMMARY.md` (W4-2 narrow Option-A
  ship summary)
- `scripts/backfill-drive-id-on-library-index.mjs` (W4-2 sibling)
- `[[feedback_single_owner_destructive_runs]]`
- `[[project_chart_loss_reports_are_display_bugs]]` (B-006 salvage
  context)
