# RUN-SUMMARY — drive-id-apply-backfill (W4-2 / FINDING-1 narrow Option A)

**Lane:** `drive-id-apply-backfill` (Tier-0 ops; single-owner --apply run)
**Owner:** coder-3 (named single-owner per `[[feedback_single_owner_destructive_runs]]`; Daniel blanket-ratify 2026-05-24T22:50Z)
**Branch:** `audit/drive-id-backfill-2026-05-24`
**Cut from:** `origin/master` @ `896342a2a` (2026-05-24T22:35Z)
**Window:** 2026-05-25T03:29Z (Phase 1 DRY-RUN) → 2026-05-25T17:16Z (Phase 3 RE-DRY done)
**Script:** `scripts/backfill-drive-id-on-library-index.mjs` (shipped `0c0392a72`; amended this lane, +8 LOC)

## Result

**281 `library_index.<docId>.driveFileId` stamps applied** to historical Drive-id-keyed rows that the FINDING-1 forward-fix (`0c0392a72`) only repaired going forward. 0 writeErrors. Idempotency verified via post-apply RE-DRY (`wouldUpdate: 0`, `alreadyStamped: 283`).

Population scope was narrowed from the original 552 candidates after a Phase-1.5 read-only probe surfaced 271 UUID-shape rows as B-006 salvage rows with recoverable Drive ids in `backupDriveId` (NOT in the doc-id). Those 271 are deferred to a separate follow-up lane (`salvage-row-drivefileid-recovery` / W5-2) per Daniel's Option-E ruling (`msg-drive-id-apply-backfill-ruling-002`).

## Phase ledger

| phase | timestamp | mode | wouldUpdate | updated | scanned | driveShapeMatched | alreadyStamped | skippedUploadShape | writeErrors |
|------:|-----------|------|------------:|--------:|--------:|------------------:|---------------:|-------------------:|------------:|
| 1 DRY-RUN-001 | 2026-05-25T03:29:31Z | dry-run | 552 | — | 625 | 554 | 2 | 71 | 0 |
| 1.5 PROBE | 2026-05-25T~17:30Z | read-only sample (Firebase MCP × 10) | — | — | — | — | — | — | — |
| 2 DRY-RUN-002 | 2026-05-25T17:05:49Z | dry-run (post-amendment) | 281 | — | 625 | 283 | 2 | 342 | 0 |
| 3 APPLY-001 | 2026-05-25T17:16:33Z | apply | 0 | **281** | 625 | 283 | 2 | 342 | 0 |
| 4 REDRY-001 | 2026-05-25T17:16:43Z | dry-run (post-apply) | **0** | 0 | 625 | 283 | **283** | 342 | 0 |

Reconciliation across all phases: `driveShapeMatched + skippedUploadShape = scanned` (283 + 342 = 625 ✓ post-amendment; 554 + 71 = 625 ✓ pre-amendment).

## Script amendment (+8 LOC, single regex + early-skip + 6 doc lines)

Per supervisor ruling `msg-drive-id-apply-backfill-ruling-002` (Option-E narrow-A):

```diff
+const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
 function looksLikeDriveId(docId) {
     if (typeof docId !== "string") return false
     if (docId.startsWith("upload-")) return false
+    if (UUID_V4_REGEX.test(docId)) return false
     return DRIVE_ID_REGEX.test(docId)
 }
```

Plus 6 documentation lines in the heuristic comment block citing this ruling + pointing at `PROBE-001-FINDINGS.md` for the salvage-row finding. No other code edits. No new counters. No recovery logic.

Auditor re-VERIFY ACCEPT at 2026-05-25T18:35Z (`msg-from-auditor-reverify-drive-id-apply-backfill`):
- Regex tightness: TIGHT (anchored `^…$`, lowercase-hex-only `[0-9a-f]`; false-positive risk on a real Drive id ≈ 5×10⁻²⁰).
- 281 wouldUpdate set: all real-Drive-id-shape (267 × len-33 + 14 × len-44; both valid Google Drive id length classes); 0 UUID-len-36 leakage.
- Salvage-row deferral: matches Option-E ruling; 271 rows park unchanged for W5-2 follow-up lane.

## Known wart (cosmetic, deferred to W5-2)

`skippedUploadShape` counter now lumps two distinct skip classes:
- `upload-*` shape: 71 rows (the script's original target of the prefix check).
- UUID v4 shape: 271 rows (new — B-006 salvage population).
- Total: 342.

Auditor ACK'd the wart; the supervisor's "one regex + one early-skip line" boundary disallowed splitting it here. The W5-2 follow-up lane (`salvage-row-drivefileid-recovery`) is the natural home for a cleaner `skippedSalvageUuid` counter alongside its `driveFileId = backupDriveId` recovery rule.

## Decision tree honored

- Phase 1 DRY-RUN saw 552 candidates (49.1% UUID-shape false-positives) → HEADS-UP `msg-coder-3-heads-up-uuid-overmatch-001`.
- Daniel ruling msg-001 → Option B (read-only probe first).
- Phase 1.5 PROBE (10/10 UUID rows sampled) → Case 2 surprise: B-006 salvage population with `backupDriveId` recoverable. HEADS-UP `msg-coder-3-probe-001-case-2-surprise`.
- Daniel ruling msg-002 → Option E (split into 2 lanes; ship narrow A here, salvage-recovery as W5-2 follow-up).
- Phase 2 DRY-RUN-002 → 281 stamps confirmed; auditor re-VERIFY GATE-REQUEST `msg-coder-3-dry-run-002-result`.
- Auditor `msg-from-auditor-reverify-drive-id-apply-backfill` → ACCEPT.
- Phase 3 APPLY → 281 updated, 0 errors.
- Phase 4 RE-DRY → 0 wouldUpdate, 283 alreadyStamped; idempotency proven.

## Daniel-action

None required — Tier-0 implicit ACCEPT on SHIP-NOTICE.

## Follow-up — W5-2 salvage-row-drivefileid-recovery

Supervisor queued in `.coord/QUEUE.md`. coder-3 is the natural owner (probe-hot context). Will stamp `driveFileId = backupDriveId` for the 271 B-006 salvage rows that this lane deliberately deferred. Same Tier-0 ops shape; separate audit-trail commit.

Sequencing left to Daniel — coder-3's other waiting lane is the prestaged Fix B storage-backup (Tier-1 code lane). Both can wait; both are unblocked.

## Artifacts (this commit)

- `scripts/backfill-drive-id-on-library-index.mjs` — +8 LOC amendment (see diff above).
- `.paul/ops/backfill-drive-id/DRY-RUN-001.log` — pre-amendment 552-candidate scan (preserved for audit).
- `.paul/ops/backfill-drive-id/DRY-RUN-002.log` — post-amendment 281-candidate scan.
- `.paul/ops/backfill-drive-id/APPLY-001.log` — 281 stamps applied; 0 write errors.
- `.paul/ops/backfill-drive-id/REDRY-001.log` — 0 wouldUpdate; idempotency proven.
- `.paul/ops/backfill-drive-id/PROBE-001-FINDINGS.md` — 10-row salvage-shape probe (Case-2 evidence).
- `.paul/ops/backfill-drive-id/RUN-SUMMARY.md` — this file.

## Worktree

Worktree at `sheet-music-app-drive-id-apply/`. Audit-trail commit on branch `audit/drive-id-backfill-2026-05-24`; FF-push to `origin master`. Standard supervisor teardown on ACCEPT per `[[feedback_worktree_teardown_timing]]` — do NOT self-remove the worktree.
