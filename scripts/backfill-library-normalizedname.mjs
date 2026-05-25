#!/usr/bin/env node
/**
 * Backfill the four W-02 derivative fields (`nameLower`, `normalizedName`,
 * `stem`, `titleSpecificity`) on `library_index` rows that are missing them.
 *
 * Closes ingest-mutator-matrix FINDING-4 (single-owner, Tier-0 ops). The
 * findings (and the auditor's audit) document that two pre-fix write
 * channels left historical rows blind to PCU dedup:
 *   - IMP rows (`/api/setlists/import/execute/route.ts` pre-`2333c68f0`)
 *     are blind to BOTH exact AND fuzzy dedup → missing `nameLower` AND
 *     `normalizedName` (plus `stem` + `titleSpecificity`).
 *   - SLI rows (drive-sync admin pre-`e100771ce`) are blind to fuzzy only →
 *     have `nameLower` but missing `normalizedName` / `stem` /
 *     `titleSpecificity`.
 *
 * The forward-fix has already landed on both channels (`2333c68f0` setlist-
 * import-via-pcu @ coder-4, `e100771ce` drive-sync rename/replace @ coder-2,
 * plus the F-7 helper `4a9e3d896` @ coder-5). This script heals the
 * historical population.
 *
 * Sibling-of:
 *   - `scripts/backfill-drive-id-on-library-index.mjs` (coder-3 `0c0392a72`)
 *     — closest mirror in shape (same env loader, same DRY-RUN/--apply, same
 *     audit-trail JSON output).
 *   - `scripts/rebuild-setlist-fileids-denorm.mjs` (coder-2 `8ddcca1c5`) —
 *     original precedent.
 *
 * ## Behavior
 *
 * - DRY-RUN by default. `--apply` required for real writes.
 * - Reads every `library_index` row in ONE shot (CRC has ~568 — single
 *   `.get()` is fine).
 * - Pre-builds a `stem → activeFileIds[]` index from the live catalog so
 *   per-row sibling-count is O(1), not O(N) re-queries.
 * - For each row with a name:
 *     * If row is orphaned (`status === "orphaned"`) → skip (rows hidden
 *       from dedup don't need W-02; matches PCU's `existingSiblings` filter
 *       at `src/lib/library-upload.ts:483`).
 *     * If row has no name (anomaly) → skip + log.
 *     * Otherwise compute fresh `{nameLower, normalizedName, stem,
 *       titleSpecificity}` via `recomputeIndexNameFields` (mirror module),
 *       using `siblingsInCatalog = count of active rows sharing computed
 *       stem` (the row itself IS in that count since the snapshot already
 *       contains it).
 *     * Compare per-field to the live row:
 *         - Field absent → backfill target.
 *         - Field present + equals computed → already-correct.
 *         - Field present + differs from computed → MISMATCH (anomaly,
 *           SKIP no overwrite, log to stderr + record as `mismatched`).
 *     * Write decision:
 *         - If any field absent (and no mismatches) → stamp the missing
 *           fields. Writes ONLY the missing keys (no overwrite of present
 *           ones) — preserves any operator-applied corrections.
 *         - If any field mismatches → skip the whole row (anomaly path).
 * - Idempotent: a second dry-run after `--apply` reports `wouldUpdate=0`.
 *
 * ## Sibling-count semantics (matches PCU at `library-upload.ts:472-487`)
 *
 *   siblingsInCatalog = (#active rows with `bareStem(name) === stem`)
 *
 * The row being scored is one of those active rows, so PCU's `+1` (for the
 * not-yet-written new row) is NOT applied here — we're scoring an existing
 * member of the bucket.
 *
 * ## Output
 *
 * Per-row record streamed to stderr (human trace) and accumulated to stdout
 * as JSON:
 *
 *   {
 *     summary: {
 *       mode, scanned, candidates, alreadyStamped, wouldUpdate, updated,
 *       mismatched, skippedOrphaned, skippedNoName, writeErrors
 *     },
 *     records: [{ docId, action, stamped?, current?, computed?, ... }]
 *   }
 *
 * ## Usage
 *
 *   node scripts/backfill-library-normalizedname.mjs            # DRY-RUN
 *   node scripts/backfill-library-normalizedname.mjs --apply    # real run
 *
 * ## Auth
 *
 * `.env.local` with `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY` +
 * `NEXT_PUBLIC_FIREBASE_PROJECT_ID`. `firebase-adminsdk-fbsvc@crcmusiccharts`
 * SA — needs `datastore.user` (`library_index` read + update). Same as the
 * precedent scripts.
 *
 * ## Single-owner rule
 *
 * Per `[[feedback_single_owner_destructive_runs]]` — HEADS-UP supervisor
 * before `--apply`. Do NOT run `--apply` autonomously. Single named
 * executor per dispatch.
 */
import { initializeApp, cert, getApps } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

import { recomputeIndexNameFields, bareStem } from "./lib/index-name-fields-compute.mjs"

// ---------- .env.local loader (mirror rebuild-setlist-fileids-denorm.mjs) --
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

// ---------- Per-row classification ----------

const W02_FIELDS = ["nameLower", "normalizedName", "stem", "titleSpecificity"]

function classify(docId, data, computed) {
    const current = {
        nameLower: data.nameLower,
        normalizedName: data.normalizedName,
        stem: data.stem,
        titleSpecificity: data.titleSpecificity,
    }
    const missing = []
    const mismatched = []
    for (const f of W02_FIELDS) {
        const cur = current[f]
        const com = computed[f]
        if (cur === undefined || cur === null) {
            missing.push(f)
            continue
        }
        // Type-aware comparison — titleSpecificity is a number, the others are strings.
        if (f === "titleSpecificity") {
            if (typeof cur !== "number" || cur !== com) mismatched.push(f)
        } else if (cur !== com) {
            mismatched.push(f)
        }
    }
    return { current, missing, mismatched }
}

// ---------- Main ----------

async function main() {
    const db = initFirestore()

    process.stderr.write(
        `# backfill-library-normalizedname.mjs — mode=${APPLY ? "APPLY" : "DRY-RUN"}\n`,
    )
    process.stderr.write(`# project=${PROJECT_ID}\n`)
    process.stderr.write(`# started=${new Date().toISOString()}\n\n`)

    const snap = await db.collection("library_index").get()
    process.stderr.write(`Phase 1: enumerated ${snap.size} library_index rows\n`)

    // Pre-build stem → activeFileIds[] index over the LIVE compute path.
    // Matches PCU at `library-upload.ts:472-487` — exclude orphans, include
    // the row itself (since it's already in the snapshot).
    const stemBuckets = new Map()
    let orphanedCount = 0
    let noNameCount = 0
    for (const doc of snap.docs) {
        const data = doc.data() || {}
        const status = typeof data.status === "string" ? data.status : "active"
        if (status === "orphaned") {
            orphanedCount += 1
            continue
        }
        const name = typeof data.name === "string" ? data.name : null
        if (!name || !name.trim()) {
            noNameCount += 1
            continue
        }
        const stem = bareStem(name)
        const list = stemBuckets.get(stem)
        if (list) list.push(doc.id)
        else stemBuckets.set(stem, [doc.id])
    }
    process.stderr.write(
        `Phase 1: built stem index — ${stemBuckets.size} unique stems, ${orphanedCount} orphaned rows excluded, ${noNameCount} nameless rows excluded\n\n`,
    )

    const records = []
    let candidates = 0
    let alreadyStamped = 0
    let wouldUpdate = 0
    let updated = 0
    let mismatchedCount = 0
    let skippedOrphaned = orphanedCount
    let skippedNoName = noNameCount
    let writeErrors = 0
    const missingFieldHisto = { nameLower: 0, normalizedName: 0, stem: 0, titleSpecificity: 0 }

    for (const doc of snap.docs) {
        const docId = doc.id
        const data = doc.data() || {}
        const status = typeof data.status === "string" ? data.status : "active"
        if (status === "orphaned") continue // already counted
        const name = typeof data.name === "string" ? data.name : null
        if (!name || !name.trim()) continue // already counted

        candidates += 1

        const stemKey = bareStem(name)
        const bucket = stemBuckets.get(stemKey) || []
        const siblingsInCatalog = bucket.length || 1
        const computed = recomputeIndexNameFields(name, siblingsInCatalog)

        const { current, missing, mismatched } = classify(docId, data, computed)

        for (const f of missing) missingFieldHisto[f] += 1

        if (missing.length === 0 && mismatched.length === 0) {
            alreadyStamped += 1
            records.push({ docId, action: "already-stamped" })
            continue
        }

        if (mismatched.length > 0) {
            mismatchedCount += 1
            const detail = mismatched.map((f) => ({
                field: f,
                current: current[f],
                expected: computed[f],
            }))
            records.push({
                docId,
                name,
                action: "mismatched",
                siblingsInCatalog,
                fields: detail,
                missing,
            })
            process.stderr.write(
                `MISMATCH  ${docId} name="${name}" mismatched=${JSON.stringify(detail)} missing=${JSON.stringify(missing)} — SKIPPING (no write)\n`,
            )
            continue
        }

        // missing.length > 0, mismatched.length === 0 → stamp the missing fields only.
        wouldUpdate += 1
        const patch = {}
        for (const f of missing) patch[f] = computed[f]

        process.stderr.write(
            `STAMP     ${docId} name="${name}" siblings=${siblingsInCatalog} missing=${JSON.stringify(missing)} patch=${JSON.stringify(patch)}\n`,
        )

        if (APPLY) {
            try {
                await db.collection("library_index").doc(docId).update(patch)
                updated += 1
                records.push({
                    docId,
                    name,
                    action: "stamped",
                    siblingsInCatalog,
                    patch,
                })
            } catch (err) {
                writeErrors += 1
                records.push({
                    docId,
                    name,
                    action: "stamp-failed",
                    error: err.message,
                    patch,
                })
                process.stderr.write(`  !! UPDATE FAILED: ${err.message}\n`)
            }
        } else {
            records.push({
                docId,
                name,
                action: "would-stamp",
                siblingsInCatalog,
                patch,
            })
        }
    }

    const summary = {
        mode: APPLY ? "apply" : "dry-run",
        startedAt: new Date().toISOString(),
        projectId: PROJECT_ID,
        scanned: snap.size,
        candidates,
        alreadyStamped,
        wouldUpdate: APPLY ? 0 : wouldUpdate,
        updated: APPLY ? updated : 0,
        mismatched: mismatchedCount,
        skippedOrphaned,
        skippedNoName,
        writeErrors,
        missingFieldHisto,
        staleFraction:
            candidates > 0
                ? Number(((APPLY ? updated : wouldUpdate) / candidates).toFixed(4))
                : 0,
    }

    process.stderr.write(`\n=== Summary ===\n`)
    process.stderr.write(`  mode:              ${summary.mode}\n`)
    process.stderr.write(`  scanned:           ${summary.scanned}\n`)
    process.stderr.write(`  candidates:        ${summary.candidates}\n`)
    process.stderr.write(`  alreadyStamped:    ${summary.alreadyStamped}\n`)
    if (APPLY) {
        process.stderr.write(`  updated:           ${summary.updated}\n`)
        process.stderr.write(`  writeErrors:       ${summary.writeErrors}\n`)
    } else {
        process.stderr.write(`  wouldUpdate:       ${summary.wouldUpdate}\n`)
    }
    process.stderr.write(`  mismatched:        ${summary.mismatched}\n`)
    process.stderr.write(`  skippedOrphaned:   ${summary.skippedOrphaned}\n`)
    process.stderr.write(`  skippedNoName:     ${summary.skippedNoName}\n`)
    process.stderr.write(`  staleFraction:     ${summary.staleFraction}\n`)
    process.stderr.write(
        `  missingFieldHisto: ${JSON.stringify(summary.missingFieldHisto)}\n`,
    )

    process.stdout.write(JSON.stringify({ summary, records }, null, 2) + "\n")

    if (writeErrors > 0) process.exit(1)
}

main().catch((err) => {
    process.stderr.write(`\n!! FATAL: ${err.stack || err.message}\n`)
    process.exit(1)
})
