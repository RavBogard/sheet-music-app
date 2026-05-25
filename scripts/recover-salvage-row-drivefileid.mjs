#!/usr/bin/env node
/**
 * Recover `library_index.<docId>.driveFileId` for B-006 salvage rows
 * (W5-2 — salvage-row-drivefileid-recovery; Daniel's Option-E ruling
 * msg-drive-id-apply-backfill-ruling-002).
 *
 * Tier-0 ops tool — historical-data fixup. Sibling of
 * `scripts/backfill-drive-id-on-library-index.mjs` (W4-2 narrow Option-A
 * lane shipped at `f7c23e3c3` — same auth path, same .env.local loader,
 * same DRY-RUN-by-default discipline, same audit-trail shape).
 *
 * **The gap this script closes.** On 2026-05-20T19:37–19:44Z a bulk salvage
 * operation resurrected 271 `library_index` rows that had been orphaned
 * 3 days earlier (2026-05-17T01:40:37.553Z) for B-006 ("pre-atomic-guard
 * sync left no Storage bytes"). The salvage:
 *
 *   - generated fresh UUID v4 doc-ids (instead of reusing the original
 *     Drive id as the doc-id), so the W4-2 `looksLikeDriveId(docId)` path
 *     can't recover them from the doc-id alone;
 *   - parked the original Drive id in `backupDriveId` (real, populated,
 *     URL-safe-base64);
 *   - did NOT stamp `driveFileId` — so the drive-sync poller's
 *     `findRowByDriveFileId(driveFileId)` lookup misses them entirely.
 *
 * This script heals that by stamping `driveFileId: <backupDriveId>` on
 * each matching salvage row. Forward-symmetry was shipped in
 * `0c0392a72` (sync-engine + setlist-import write `driveFileId` at
 * ingest time); the W4-2 backfill at `f7c23e3c3` healed the 281
 * Drive-id-keyed historical rows. This is the orthogonal sibling.
 *
 * **Match criteria** (per `msg-salvage-row-drivefileid-recovery-001`):
 *
 *   - `data.source === "salvage"`, AND
 *   - `typeof data.backupDriveId === "string"` AND `length > 0`, AND
 *   - `data.driveFileId` is absent (or not a non-empty string), AND
 *   - `data.backupDriveId` passes a real-Drive-id-shape sanity check
 *     (`^[A-Za-z0-9_-]{25,}$` + length 28–44 — matches the 10/10 PROBE
 *     sample which had 33-char URL-safe-base64 ids).
 *
 * For each match, we stamp `driveFileId: <backupDriveId>`.
 *
 * **Sanity check.** If a salvage row has `driveFileId` set AND it differs
 * from `backupDriveId`, the script logs `MISMATCH` and skips (no
 * overwrite). Surface to operator before any further action.
 *
 * **Behavior.** DRY-RUN by default. `--apply` required for real writes.
 * Idempotent — re-running after `--apply` reports zero `wouldUpdate`.
 *
 * **Output.** Per-row record streamed to stderr (human trace) + accumulated
 * to stdout as a JSON report at the end:
 *   { summary: { mode, scanned, salvageRows, candidates, alreadyStamped,
 *     mismatched, skippedNoBackupDriveId, skippedBadShape, wouldUpdate,
 *     updated, writeErrors }, records: [{ docId, action, ... }, ...] }
 *
 * Usage:
 *   node scripts/recover-salvage-row-drivefileid.mjs            # DRY-RUN
 *   node scripts/recover-salvage-row-drivefileid.mjs --apply    # real run
 *
 * Auth: .env.local with FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY +
 * NEXT_PUBLIC_FIREBASE_PROJECT_ID. firebase-adminsdk-fbsvc@crcmusiccharts
 * SA — needs `datastore.user` (library_index read/write); same grant as
 * W4-2.
 *
 * Single-owner-rule (per `[[feedback_single_owner_destructive_runs]]`):
 * before running `--apply` on prod, HEADS-UP supervisor. Don't run --apply
 * autonomously.
 */
import { initializeApp, cert, getApps } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

// ---------- .env.local loader (mirror W4-2 / rebuild-setlist-fileids-denorm) ---
const __dirname = dirname(fileURLToPath(import.meta.url))
const ENV_PATH = join(__dirname, "..", ".env.local")
{
    let envText
    try {
        envText = readFileSync(ENV_PATH, "utf8")
    } catch (err) {
        process.stderr.write(`!! Cannot read ${ENV_PATH}: ${err.message}\n`)
        process.exit(1)
    }
    for (const line of envText.split("\n")) {
        const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
        if (!m) continue
        let val = m[2]
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1)
        val = val.replace(/\\n/g, "\n")
        if (!(m[1] in process.env)) process.env[m[1]] = val
    }
}

const PROJECT_ID =
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "crcmusiccharts"
const APPLY = process.argv.includes("--apply")

// ---------- Firebase admin init ----------
function initFirestore() {
    const email = process.env.FIREBASE_CLIENT_EMAIL
    const key = process.env.FIREBASE_PRIVATE_KEY
    if (!email || !key) {
        throw new Error(
            "FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY required in .env.local",
        )
    }
    if (getApps().length === 0) {
        initializeApp({
            credential: cert({
                projectId: PROJECT_ID,
                clientEmail: email,
                privateKey: key,
            }),
        })
    }
    return getFirestore()
}

// ---------- Heuristic: does `backupDriveId` look like a real Drive id? ----------
// Drive ids are URL-safe-base64-ish (no padding). The 10/10 PROBE-001 sample
// showed 33-char ids; Google publicly documents Drive ids as 28–44 chars.
// Bound length [28, 44] in addition to the char-class anchor to defend
// against unexpected data shapes (truncated strings, accidental prefixes,
// etc.) — script SKIPS any row whose backupDriveId fails the sanity check
// rather than writing a garbage stamp.
const DRIVE_ID_REGEX = /^[A-Za-z0-9_-]{25,}$/
function looksLikeDriveId(s) {
    if (typeof s !== "string") return false
    if (s.length < 28 || s.length > 44) return false
    return DRIVE_ID_REGEX.test(s)
}

// ---------- Main ----------
async function main() {
    const db = initFirestore()

    process.stderr.write(
        `# recover-salvage-row-drivefileid.mjs — mode=${
            APPLY ? "APPLY" : "DRY-RUN"
        }\n`,
    )
    process.stderr.write(`# project=${PROJECT_ID}\n`)
    process.stderr.write(`# started=${new Date().toISOString()}\n\n`)

    // Scan everything; the where("source","==","salvage") query is the
    // hot path but full enumeration keeps the audit trail honest (every
    // row visible in stderr trace; matches W4-2 cadence).
    const snap = await db.collection("library_index").get()
    process.stderr.write(
        `Phase 1: enumerated ${snap.size} library_index rows\n\n`,
    )

    const records = []
    let salvageRows = 0
    let candidates = 0
    let alreadyStamped = 0
    let mismatched = 0
    let skippedNoBackupDriveId = 0
    let skippedBadShape = 0
    let wouldUpdate = 0
    let updated = 0
    let writeErrors = 0

    for (const doc of snap.docs) {
        const docId = doc.id
        const data = doc.data() || {}

        if (data.source !== "salvage") continue
        salvageRows += 1

        const backup = data.backupDriveId
        const current = data.driveFileId

        // No recoverable Drive id → out of recovery scope (skip with trace).
        if (typeof backup !== "string" || backup.length === 0) {
            skippedNoBackupDriveId += 1
            records.push({
                docId,
                action: "skip-no-backup-drive-id",
                currentDriveFileId: typeof current === "string" ? current : null,
            })
            process.stderr.write(
                `SKIP-NO-BACKUP ${docId} (no backupDriveId on this salvage row)\n`,
            )
            continue
        }

        // Defense against unexpected shapes.
        if (!looksLikeDriveId(backup)) {
            skippedBadShape += 1
            records.push({
                docId,
                action: "skip-bad-shape",
                backupDriveId: backup,
                backupDriveIdLength: backup.length,
            })
            process.stderr.write(
                `SKIP-BAD-SHAPE ${docId} backupDriveId="${backup}" length=${backup.length} — SKIPPING (no write)\n`,
            )
            continue
        }

        // Already correctly stamped — idempotent no-op.
        if (typeof current === "string" && current === backup) {
            alreadyStamped += 1
            records.push({ docId, action: "already-stamped", driveFileId: current })
            continue
        }

        // Anomaly: driveFileId is set but differs from backupDriveId.
        // Surface, do NOT touch. Operator decides next move.
        if (typeof current === "string" && current.length > 0 && current !== backup) {
            mismatched += 1
            records.push({
                docId,
                action: "mismatched",
                currentDriveFileId: current,
                backupDriveId: backup,
            })
            process.stderr.write(
                `MISMATCH ${docId} current="${current}" backupDriveId="${backup}" — SKIPPING (no write)\n`,
            )
            continue
        }

        // driveFileId is absent (or empty string) → recovery candidate.
        candidates += 1
        wouldUpdate += 1
        process.stderr.write(
            `STAMP ${docId} -> driveFileId="${backup}"  (from backupDriveId)\n`,
        )

        if (APPLY) {
            try {
                await db
                    .collection("library_index")
                    .doc(docId)
                    .update({ driveFileId: backup })
                updated += 1
                records.push({
                    docId,
                    action: "stamped",
                    driveFileId: backup,
                    source: "backupDriveId",
                })
            } catch (err) {
                writeErrors += 1
                records.push({
                    docId,
                    action: "stamp-failed",
                    backupDriveId: backup,
                    error: err.message,
                })
                process.stderr.write(`  !! UPDATE FAILED: ${err.message}\n`)
            }
        } else {
            records.push({
                docId,
                action: "would-stamp",
                driveFileId: backup,
                source: "backupDriveId",
            })
        }
    }

    const summary = {
        mode: APPLY ? "apply" : "dry-run",
        startedAt: new Date().toISOString(),
        projectId: PROJECT_ID,
        scanned: snap.size,
        salvageRows,
        candidates,
        alreadyStamped,
        mismatched,
        skippedNoBackupDriveId,
        skippedBadShape,
        wouldUpdate: APPLY ? 0 : wouldUpdate,
        updated: APPLY ? updated : 0,
        writeErrors,
    }

    process.stderr.write(`\n=== Summary ===\n`)
    process.stderr.write(`  mode:                   ${summary.mode}\n`)
    process.stderr.write(`  scanned:                ${summary.scanned}\n`)
    process.stderr.write(`  salvageRows:            ${summary.salvageRows}\n`)
    process.stderr.write(`  candidates:             ${summary.candidates}\n`)
    process.stderr.write(`  alreadyStamped:         ${summary.alreadyStamped}\n`)
    process.stderr.write(`  mismatched:             ${summary.mismatched}\n`)
    process.stderr.write(`  skippedNoBackupDriveId: ${summary.skippedNoBackupDriveId}\n`)
    process.stderr.write(`  skippedBadShape:        ${summary.skippedBadShape}\n`)
    if (APPLY) {
        process.stderr.write(`  updated:                ${summary.updated}\n`)
        process.stderr.write(`  writeErrors:            ${summary.writeErrors}\n`)
    } else {
        process.stderr.write(`  wouldUpdate:            ${summary.wouldUpdate}\n`)
    }

    // Reconciliation invariant: every salvage row falls into exactly one bucket.
    const accounted =
        candidates +
        alreadyStamped +
        mismatched +
        skippedNoBackupDriveId +
        skippedBadShape
    if (accounted !== salvageRows) {
        process.stderr.write(
            `\n!! RECONCILIATION DRIFT: candidates+alreadyStamped+mismatched+skippedNoBackupDriveId+skippedBadShape (${accounted}) != salvageRows (${salvageRows})\n`,
        )
    }

    process.stdout.write(JSON.stringify({ summary, records }, null, 2) + "\n")

    if (writeErrors > 0) process.exit(1)
}

main().catch((err) => {
    process.stderr.write(`\n!! FATAL: ${err.stack || err.message}\n`)
    process.exit(1)
})
