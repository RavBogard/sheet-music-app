#!/usr/bin/env node
/**
 * Backfill `library_index.<docId>.driveFileId` for SLI-shape rows missing the
 * field (FINDING-1, drive-id-write-symmetry-fix lane).
 *
 * Tier-1 ops tool — historical-data fixup. Sibling of
 * `scripts/rebuild-setlist-fileids-denorm.mjs` (same auth path, same
 * DRY-RUN-by-default discipline, same .env.local loader).
 *
 * **The gap this script closes.** Two write channels pre-fix wrote `library_index`
 * rows without the `driveFileId` field that the drive-sync poller queries on
 * (`src/lib/drive-sync/poller.ts:findRowByDriveFileId`):
 *   - `src/lib/sync-engine.ts:syncLibraryIndex` (admin-triggered sync) — wrote
 *     rows at `library_index/<driveFileId>` (doc id = Drive id) but skipped
 *     the field.
 *   - `src/app/api/setlists/import/execute/route.ts` — wrote rows at
 *     `library_index/upload-<uuid>` (NOT the Drive id) and skipped the field;
 *     for those rows the original Drive id is unrecoverable from the row alone.
 *
 * Both write sites are now fixed forward at this lane's HEAD; this script
 * heals the historical population for the FIRST channel only — rows where
 * `doc.id` IS the Drive file id (no `upload-` prefix). The setlist-import
 * `upload-<uuid>` rows can't be backfilled without an external map from
 * upload id → original Drive id, which we don't have.
 *
 * **Heuristic for "this doc.id looks like a Drive id":**
 *   - does NOT start with `upload-`
 *   - matches `^[A-Za-z0-9_-]{25,}$` (Drive ids are typically 28-33 chars of
 *     URL-safe-base64; the {25,} floor is per dispatch)
 *
 * For each matching row missing `driveFileId`, we stamp `driveFileId: <docId>`.
 *
 * **Sanity check.** Dry-run reports any row where `driveFileId` already exists
 * AND differs from the doc id — that's an anomaly worth surfacing to the
 * operator, NOT something we want to overwrite. We skip those (no
 * destruction) and log them as `mismatched`.
 *
 * **Behavior.** DRY-RUN by default (no writes). `--apply` required for real
 * run. Idempotent — re-running after `--apply` reports zero `wouldUpdate`.
 *
 * **Output.** Per-row record streamed to stderr (human trace) and accumulated
 * to stdout as a JSON report at the end:
 *   { summary: { mode, scanned, driveShapeMatched, alreadyStamped,
 *     wouldUpdate, updated, mismatched, skippedUploadShape, writeErrors },
 *     records: [{ docId, currentDriveFileId, action, ... }, ...] }
 *
 * Usage:
 *   node scripts/backfill-drive-id-on-library-index.mjs            # DRY-RUN
 *   node scripts/backfill-drive-id-on-library-index.mjs --apply    # real run
 *
 * Auth: .env.local with FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY +
 * NEXT_PUBLIC_FIREBASE_PROJECT_ID. firebase-adminsdk-fbsvc@crcmusiccharts
 * SA — needs `datastore.user` (library_index read/write).
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

// ---------- .env.local loader (mirror rebuild-setlist-fileids-denorm.mjs) ---
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

// ---------- Heuristic: does `docId` look like a Drive file id? ----------
// Drive ids are URL-safe-base64-ish (no padding), typically 28-33 chars.
// We treat `^[A-Za-z0-9_-]{25,}$` AND no `upload-` prefix as a match.
// PCU's `upload-{uuid}` ids contain `-` segments but start with `upload-`,
// so the prefix check is sufficient to exclude them.
const DRIVE_ID_REGEX = /^[A-Za-z0-9_-]{25,}$/
function looksLikeDriveId(docId) {
    if (typeof docId !== "string") return false
    if (docId.startsWith("upload-")) return false
    return DRIVE_ID_REGEX.test(docId)
}

// ---------- Main ----------
async function main() {
    const db = initFirestore()

    process.stderr.write(
        `# backfill-drive-id-on-library-index.mjs — mode=${
            APPLY ? "APPLY" : "DRY-RUN"
        }\n`,
    )
    process.stderr.write(`# project=${PROJECT_ID}\n`)
    process.stderr.write(`# started=${new Date().toISOString()}\n\n`)

    // Pull every library_index row. CRC has ~600 — single get() is fine.
    const snap = await db.collection("library_index").get()
    process.stderr.write(`Phase 1: enumerated ${snap.size} library_index rows\n\n`)

    const records = []
    let driveShapeMatched = 0
    let alreadyStamped = 0
    let wouldUpdate = 0
    let updated = 0
    let mismatched = 0
    let skippedUploadShape = 0
    let writeErrors = 0

    for (const doc of snap.docs) {
        const docId = doc.id
        const data = doc.data() || {}

        if (!looksLikeDriveId(docId)) {
            skippedUploadShape += 1
            continue
        }

        driveShapeMatched += 1
        const current = data.driveFileId
        const expected = docId

        if (typeof current === "string" && current === expected) {
            alreadyStamped += 1
            records.push({ docId, action: "already-stamped" })
            continue
        }

        if (typeof current === "string" && current !== expected) {
            // Anomaly: a different Drive id is stamped. Surface, do not touch.
            mismatched += 1
            records.push({
                docId,
                action: "mismatched",
                currentDriveFileId: current,
                expectedDriveFileId: expected,
            })
            process.stderr.write(
                `MISMATCH  ${docId} current="${current}" expected="${expected}" — SKIPPING (no write)\n`,
            )
            continue
        }

        // Field absent (or non-string) — backfill candidate.
        wouldUpdate += 1
        process.stderr.write(
            `STAMP     ${docId} -> driveFileId="${expected}"\n`,
        )

        if (APPLY) {
            try {
                await db
                    .collection("library_index")
                    .doc(docId)
                    .update({ driveFileId: expected })
                updated += 1
                records.push({ docId, action: "stamped", driveFileId: expected })
            } catch (err) {
                writeErrors += 1
                records.push({
                    docId,
                    action: "stamp-failed",
                    error: err.message,
                })
                process.stderr.write(`  !! UPDATE FAILED: ${err.message}\n`)
            }
        } else {
            records.push({
                docId,
                action: "would-stamp",
                driveFileId: expected,
            })
        }
    }

    const summary = {
        mode: APPLY ? "apply" : "dry-run",
        startedAt: new Date().toISOString(),
        projectId: PROJECT_ID,
        scanned: snap.size,
        driveShapeMatched,
        alreadyStamped,
        wouldUpdate: APPLY ? 0 : wouldUpdate,
        updated: APPLY ? updated : 0,
        mismatched,
        skippedUploadShape,
        writeErrors,
    }

    process.stderr.write(`\n=== Summary ===\n`)
    process.stderr.write(`  mode:              ${summary.mode}\n`)
    process.stderr.write(`  scanned:           ${summary.scanned}\n`)
    process.stderr.write(`  driveShapeMatched: ${summary.driveShapeMatched}\n`)
    process.stderr.write(`  alreadyStamped:    ${summary.alreadyStamped}\n`)
    if (APPLY) {
        process.stderr.write(`  updated:           ${summary.updated}\n`)
        process.stderr.write(`  writeErrors:       ${summary.writeErrors}\n`)
    } else {
        process.stderr.write(`  wouldUpdate:       ${summary.wouldUpdate}\n`)
    }
    process.stderr.write(`  mismatched:        ${summary.mismatched}\n`)
    process.stderr.write(`  skippedUploadShape:${summary.skippedUploadShape}\n`)

    process.stdout.write(JSON.stringify({ summary, records }, null, 2) + "\n")

    if (writeErrors > 0) process.exit(1)
}

main().catch((err) => {
    process.stderr.write(`\n!! FATAL: ${err.stack || err.message}\n`)
    process.exit(1)
})
