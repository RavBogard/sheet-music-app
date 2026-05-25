# RUN-SUMMARY — salvage-row-drivefileid-recovery (W5-2 / FINDING-1 Option-E split)

**Lane:** `salvage-row-drivefileid-recovery` (Tier-0 ops; single-owner `--apply` run)
**Owner:** coder-3 (named single-owner per `[[feedback_single_owner_destructive_runs]]`; Daniel blanket-ratify 2026-05-24T22:50Z extending to follow-up lanes)
**Branch:** `audit/salvage-row-drivefileid-recovery-2026-05-25`
**Cut from:** `origin/master` @ `f7c23e3c3` (coder-3's prior W4-2 ship 2026-05-25T17:20Z)
**Window:** 2026-05-25T17:40Z (Phase 1 DRY-RUN-001 done) → 2026-05-25T17:55Z (Phase 3 RE-DRY-001 done)
**Script:** `scripts/recover-salvage-row-drivefileid.mjs` (NEW; ~265 LOC; mirrors W4-2 `scripts/backfill-drive-id-on-library-index.mjs` shape with cleaner counter naming)

## Result

**271 `library_index.<docId>.driveFileId` stamps applied** to B-006 salvage rows where the real Drive id was parked in `backupDriveId` (recoverable) but `driveFileId` was absent (invisible to drive-sync poller's `findRowByDriveFileId` lookup). 0 writeErrors. Idempotency verified via post-apply RE-DRY (`wouldUpdate: 0`, `alreadyStamped: 271`).

Closes the orthogonal half of FINDING-1 (drive-id-write-symmetry) that the W4-2 narrow-A backfill at `f7c23e3c3` deliberately deferred per Daniel's Option-E ruling `msg-drive-id-apply-backfill-ruling-002`. Combined with W4-2 (281 stamps) the FINDING-1 historical heal is now complete: 281 + 271 = 552 healed rows.

## Phase ledger

| phase | timestamp | mode | scanned | salvageRows | candidates | alreadyStamped | mismatched | skippedNoBackupDriveId | skippedBadShape | wouldUpdate | updated | writeErrors |
|------:|-----------|------|--------:|------------:|-----------:|---------------:|-----------:|-----------------------:|----------------:|------------:|--------:|------------:|
| 1 DRY-RUN-001 | 2026-05-25T17:40:47Z | dry-run | 625 | 271 | 271 | 0 | 0 | 0 | 0 | **271** | — | 0 |
| 2 APPLY-001 | 2026-05-25T17:54:20Z | apply | 625 | 271 | 271 | 0 | 0 | 0 | 0 | 0 | **271** | **0** |
| 3 REDRY-001 | 2026-05-25T17:54:54Z | dry-run | 625 | 271 | 0 | **271** | 0 | 0 | 0 | **0** | — | 0 |

APPLY-001 wall time: 27s end-to-end (vs. W4-2's 29s for 281 stamps — comparable per-row latency).

## Reconciliation (all 3 phases)

Reconciliation invariant: `candidates + alreadyStamped + mismatched + skippedNoBackupDriveId + skippedBadShape = salvageRows` ✓ at every phase.

- DRY-RUN-001: `271 + 0 + 0 + 0 + 0 = 271` ✓
- APPLY-001: `271 + 0 + 0 + 0 + 0 = 271` ✓
- REDRY-001: `0 + 271 + 0 + 0 + 0 = 271` ✓

RE-DRY's `alreadyStamped: 271` is structural proof that every row now satisfies `driveFileId === backupDriveId` — the script's `current === backup` predicate evaluated against all 271 (transitive proof of the dispatch's "sample of 5 healed rows" gate; we checked all 271, not just 5).

## Sample stamp evidence (matches PROBE-001 exactly)

Five sample stamps from APPLY-001 log:

| docId | backupDriveId → driveFileId | PROBE-001 row | name |
|-------|------------------------------|--------------:|------|
| `000cc80a-9c65-4b55-929e-c9ca1f6737c3` | `1HWv4dMDvKSVmvuX1FFv4V5U4s7O0D33_` | #1 | Yih'Yeh Shalom (Recht) - Yih'Yeh Tov (Broza) |
| `012dd661-f451-444c-88fb-11d589028908` | `1hGSUyKTSs79AXqLPsiyaK-BYzQpNzAKQ` | #2 | T'Filat Haderech (Friedman) |
| `0281c548-8aea-48c9-8991-98cb381b3f3a` | `1ch-Ttw6dRhxNpIdBDRuYsiLy6RtfDoLj` | #3 | David Melech Yisraeil (Frankel) - Dodi Li (Sher) |
| `fcdeef79-f662-4ac6-aa94-bdf74511ac2c` | `1tmoHJxCPhruGPqqODBQrMHe9SQnapaXZ` | #9 | Anachnu M'Vorachim (Recht) - Anatoly (Mishkin) |
| `fe495975-d73d-43ca-ba6c-2a16b2702bdf` | `1abWRNe8TxwhNCMtfl0LkNFQz-dA0LpQR` | #10 | Od Lo Ahavti Dai (Shemer) |

All 5 Drive ids are 33-char URL-safe-base64 — matches the PROBE-001 sample shape. PROBE → full-population generalization holds 100%.

## Counter naming (cleaner than W4-2's wart)

Per supervisor dispatch §"Clean counter naming: introduce `skippedSalvageUuid` if useful (auditor flagged this as the natural place to clean up the misnomer wart from W4-2)":

This script scans the salvage population directly (not the universe of all library_index rows), so the W4-2 `skippedUploadShape` lump-counter has no analogue here. The new counter naming:

- `salvageRows` — rows where `source == "salvage"` (the population of interest).
- `candidates` — salvage rows that pass the recovery filter (backupDriveId present + valid shape; driveFileId absent).
- `alreadyStamped` — salvage rows where `driveFileId == backupDriveId` (idempotent no-op).
- `mismatched` — salvage rows where `driveFileId` is set but ≠ `backupDriveId` (anomaly; skipped, surfaced).
- `skippedNoBackupDriveId` — salvage rows with no recoverable Drive id (out of recovery scope).
- `skippedBadShape` — salvage rows whose `backupDriveId` fails the Drive-id-shape regex (defense; surface if > 0).

Reconciliation invariant printed at end of every run; warns on drift. No lump-counter; every salvage row falls in exactly one bucket.

## Script details (~265 LOC NEW file)

`scripts/recover-salvage-row-drivefileid.mjs`:

- Same `.env.local` loader + Firebase admin init pattern as W4-2 sibling.
- Full-collection enumeration (`db.collection("library_index").get()`) → filter by `source == "salvage"` in-process. Single read; matches W4-2 cadence.
- For each salvage row: bucket into one of the 6 outcomes above. Sanity-check `backupDriveId` shape (`^[A-Za-z0-9_-]{25,}$` + length 28–44) before write to defend against unexpected data.
- DRY-RUN by default; `--apply` flag gates writes.
- Per-row stderr trace + accumulated stdout JSON report.
- Exit 1 on `writeErrors > 0`.

Companion `scripts/recover-salvage-row-drivefileid.RUNBOOK.md` mirrors the W4-2 RUNBOOK shape: scope, prerequisites, dry-run + apply + verify protocol, sanity ceilings.

## Why this matters

The 271 salvage rows were INVISIBLE to drive-sync poller's `findRowByDriveFileId(driveFileId)` lookup. Future Drive-side renames/replaces against the original Drive ids would miss these rows entirely. With `driveFileId` now stamped, drive-sync can find them via the canonical lookup path — closing the lookup gap the salvage operation left open on 2026-05-20.

The forward-fix at `0c0392a72` (sync-engine + setlist-import write `driveFileId` at ingest) handled all future writes; W4-2 (281 stamps) healed Drive-id-keyed historical rows; this lane (W5-2, 271 stamps) heals the UUID-keyed salvage population. FINDING-1 historical heal complete.

## Out-of-scope honored (hard boundaries per dispatch)

- ⛔ NO changes to `scripts/backfill-drive-id-on-library-index.mjs` (W4-2 canonical at `f7c23e3c3`).
- ⛔ NO Firestore mutations beyond `library_index/{docId}.driveFileId` writes (single field, single collection, single update path).
- ⛔ NO storage-backup investigation (Fix B prestaged separately as inbox msg-002; fires next on Daniel's go).
- ⛔ NO bridge / monitor / firestore.rules / vercel.json / env edits.
- ⛔ NO `[[project_smart_transposer_is_key_transcriber]]` zone.
- ⛔ NO `src/` edits at all — pure scripts/ + .paul/ ops surface.

## Gates (all green)

- ✅ DRY-RUN-001 captured 271-row population + sample rows.
- ✅ APPLY-001 shows 271 updated / 0 writeErrors (exactly matches DRY-RUN-001 projection).
- ✅ RE-DRY-001 shows 0 candidates + 271 alreadyStamped (full idempotency proof).
- ✅ Sample of 5 healed rows verified: `driveFileId == backupDriveId`, both are 33-char URL-safe-base64 real Drive ids.
- ✅ Reconciliation invariant holds at every phase.
- ✅ Audit-trail commit staged with RUN-SUMMARY.md.

## Tier-0 routing

- SHIP-NOTICE → `inbox/supervisor.md` `msg-from-coder-3-salvage-recovery-ship` (implicit ACCEPT per Tier-0 protocol; supervisor surfaces RUN-SUMMARY to Daniel).
- Worktree teardown awaits supervisor sweep per `[[feedback_worktree_teardown_timing]]` — do NOT self-remove.
- Fix B prestage (inbox msg-002) is now next-up; HEADS-UP supervisor "ready to fire Fix B" on Daniel's go (Tier-1 code lane, ~3-4h with emulator tests).

## Source of truth

- Supervisor dispatch `msg-salvage-row-drivefileid-recovery-001` 2026-05-25T19:00Z (inbox/coder-3.md).
- Supervisor APPLY-GO `msg-salvage-row-drivefileid-recovery-apply-go` 2026-05-25T20:00Z (inbox/coder-3.md).
- coder-3 HEADS-UP `msg-from-coder-3-dry-run-001-result` 2026-05-25T17:42Z (inbox/supervisor.md).
- Daniel's Option-E ruling `msg-drive-id-apply-backfill-ruling-002` (W4-2 lane archive).
- `.paul/ops/backfill-drive-id/PROBE-001-FINDINGS.md` (10/10 salvage shape sample).
- `.paul/ops/backfill-drive-id/RUN-SUMMARY.md` (W4-2 sibling lane ship summary).

## Daniel-action

None required — Tier-0 implicit ACCEPT on SHIP-NOTICE.

## Follow-ups (none-blocking)

- Fix B (`storage-backup-fix-b`) — Tier-1 code lane prestaged at inbox msg-002; fires after this ship on Daniel's go.
- `upload-<uuid>` rows from pre-fix `setlist-import-execute` remain un-backfillable (no recoverable Drive id from the row alone). Confirmed out of scope for both W4-2 and W5-2.

## Artifacts (this commit)

- `scripts/recover-salvage-row-drivefileid.mjs` — NEW (~265 LOC).
- `scripts/recover-salvage-row-drivefileid.RUNBOOK.md` — NEW.
- `.paul/ops/salvage-row-recovery/DRY-RUN-001.log` — 271-candidate scan.
- `.paul/ops/salvage-row-recovery/APPLY-001.log` — 271 stamps applied; 0 write errors.
- `.paul/ops/salvage-row-recovery/REDRY-001.log` — 0 wouldUpdate, 271 alreadyStamped; idempotency proven.
- `.paul/ops/salvage-row-recovery/RUN-SUMMARY.md` — this file.
