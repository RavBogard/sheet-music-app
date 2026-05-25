#!/usr/bin/env node
/**
 * Re-stamp `library_index` rows whose stored `normalizedName` disagrees
 * with the NEW `recomputeIndexNameFields` algorithm (α: strip trailing
 * media extension via `STRIPPABLE_EXTENSION_RE` BEFORE the alphanumeric
 * collapse). Closes the backfill phase of the
 * `recompute-helper-normalizedname-pin` lane:
 *
 *   - α (Tier 1) lands the canonical helper change at
 *     `src/lib/library/recompute-index-name-fields.ts` (+ mirror at
 *     `scripts/lib/index-name-fields-compute.mjs`) + extends PCU's
 *     inline compute at `src/lib/library-upload.ts` so new writes land
 *     on the historical-correct ext-stripped shape.
 *   - This script (Tier 0) re-stamps any row whose stored normalizedName
 *     reflects the PRE-α algorithm — i.e. an ext-INCLUDED form like
 *     `"hodusilverpdf"` that the post-α canonical recomputes to
 *     `"hodusilver"`.
 *
 * Lane: `recompute-helper-normalizedname-pin` (coder-5). Daniel pre-
 * ratified the scope on `.paul/research/recompute-helper-normalizedname-drift/FINDINGS.md`
 * (own authoring) per supervisor msg-recompute-helper-normalizedname-pin-001
 * 2026-05-25T23:30Z.
 *
 * ## Population shape (predicted)
 *
 * DRY-RUN-001 in the sibling pdf-stem-drift lane found 271 rows whose
 * stored normalizedName was the EXT-STRIPPED form (historical-good
 * shape). Those rows match the post-α algorithm → they should report as
 * `alreadyStamped` here. The candidates for this script are the
 * INVERSE population: rows whose stored normalizedName is the EXT-
 * INCLUDED form (algorithmic-wrong shape). Count is unknown ahead of
 * DRY-RUN-001 — typically introduced by PCU/scrape paths writing pre-α.
 *
 * ## Behavior
 *
 * - DRY-RUN by default. `--apply` required for real writes.
 * - Single comparison axis: `normalizedName`. EXPLICITLY does not touch
 *   `nameLower` / `stem` / `titleSpecificity` (those are pdf-stem-drift's
 *   surface, already restamped at `e01dc2b1a`).
 * - Reads every `library_index` row in ONE shot (~568 rows; single
 *   `.get()`).
 * - Skips orphans (`status === "orphaned"`) — mirror PCU semantics.
 * - Skips nameless rows (anomaly).
 * - Skips rows whose stored `normalizedName` is absent — those belong to
 *   normalizedname-backfill territory (which ran clean at `10f7f8183`).
 * - For each remaining row, recomputes via the post-α
 *   `recomputeIndexNameFields` and compares normalizedName fields.
 * - Idempotent: second DRY-RUN after `--apply` reports `toRestamp=0`.
 *
 * ## Sibling-count semantics
 *
 *   siblingsInCatalog = (#active rows with `bareStem(name) === computedStem`)
 *
 * Same as the pdf-stem-drift script. Buckets are built via post-α
 * `bareStem` (already shipped at `e01dc2b1a`).
 *
 * ## Output
 *
 * Per-row record streamed to stderr (human trace) and accumulated to
 * stdout as JSON:
 *
 *   {
 *     summary: {
 *       mode, scanned, candidates, alreadyStamped, toRestamp, restamped,
 *       skippedIncomplete, skippedOrphaned, skippedNoName, writeErrors,
 *       extensionHisto, mismatchedFieldHisto, driftFraction
 *     },
 *     records: [{ docId, action, current?, computed?, patch?, ... }]
 *   }
 *
 * ## Usage
 *
 *   node scripts/restamp-normalizedname-drift.mjs            # DRY-RUN
 *   node scripts/restamp-normalizedname-drift.mjs --apply    # real run
 *
 * ## Auth
 *
 * `.env.local` with `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY` +
 * `NEXT_PUBLIC_FIREBASE_PROJECT_ID`. `firebase-adminsdk-fbsvc@crcmusiccharts`
 * SA — needs `datastore.user` (`library_index` read + update).
 *
 * ## Single-owner rule
 *
 * Per `[[feedback_single_owner_destructive_runs]]` — HEADS-UP supervisor
 * + auditor re-VERIFY before `--apply`. Do NOT run `--apply`
 * autonomously. Single named executor per dispatch (this lane: coder-5).
 */
import { initializeApp, cert, getApps } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

import {
    recomputeIndexNameFields,
    bareStem,
} from "./lib/index-name-fields-compute.mjs"

// ---------- .env.local loader (mirror sibling script) ----------
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

// ---------- Extension classifier (audit-only — does not gate decisions) ----------

const EXTENSION_RE = /\.([a-z0-9]{1,6})$/i
function extensionOf(name) {
    const m = (name || "").match(EXTENSION_RE)
    return m ? `.${m[1].toLowerCase()}` : "none"
}

// ---------- Per-row classification ----------

// Lane scope-restriction: normalizedName is the ONLY axis we compare or
// write. pdf-stem-drift's `nameLower`/`stem`/`titleSpecificity` axes were
// already restamped at `e01dc2b1a`; touching them here would double-write
// rows for fields that are already correct (and break this lane's clean
// audit trail). Keep this list narrow — adding new fields requires its
// own lane.
const W02_FIELDS = ["normalizedName"]

function classify(data, computed) {
    const current = {
        normalizedName: data.normalizedName,
    }
    const absent = []
    const mismatched = []
    for (const f of W02_FIELDS) {
        const cur = current[f]
        const com = computed[f]
        if (cur === undefined || cur === null) {
            absent.push(f)
            continue
        }
        if (cur !== com) mismatched.push(f)
    }
    return { current, absent, mismatched }
}

// ---------- Main ----------

async function main() {
    const db = initFirestore()

    process.stderr.write(
        `# restamp-normalizedname-drift.mjs — mode=${APPLY ? "APPLY" : "DRY-RUN"}\n`,
    )
    process.stderr.write(`# project=${PROJECT_ID}\n`)
    process.stderr.write(`# started=${new Date().toISOString()}\n\n`)

    const snap = await db.collection("library_index").get()
    process.stderr.write(`Phase 1: enumerated ${snap.size} library_index rows\n`)

    // Pre-build stem buckets using the (post-pdf-stem-drift) bareStem so
    // siblingsInCatalog matches what PCU writes on a fresh upload.
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
    let toRestamp = 0
    let restamped = 0
    let skippedIncomplete = 0
    const skippedOrphaned = orphanedCount
    const skippedNoName = noNameCount
    let writeErrors = 0
    const extensionHisto = {}
    const mismatchedFieldHisto = {
        normalizedName: 0,
    }

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

        const { current, absent, mismatched } = classify(data, computed)

        if (absent.length > 0) {
            skippedIncomplete += 1
            records.push({
                docId,
                name,
                action: "skipped-incomplete",
                missing: absent,
            })
            process.stderr.write(
                `INCOMPLETE ${docId} name="${name}" absent=${JSON.stringify(absent)} — out-of-scope (normalizedname-backfill territory), skipping\n`,
            )
            continue
        }

        if (mismatched.length === 0) {
            alreadyStamped += 1
            records.push({ docId, action: "already-stamped" })
            continue
        }

        toRestamp += 1
        const ext = extensionOf(name)
        extensionHisto[ext] = (extensionHisto[ext] || 0) + 1
        for (const f of mismatched) mismatchedFieldHisto[f] += 1

        const patch = {}
        const diff = []
        for (const f of mismatched) {
            patch[f] = computed[f]
            diff.push({ field: f, was: current[f], now: computed[f] })
        }

        process.stderr.write(
            `RESTAMP   ${docId} name="${name}" ext=${ext} siblings=${siblingsInCatalog} diff=${JSON.stringify(diff)}\n`,
        )

        if (APPLY) {
            try {
                await db.collection("library_index").doc(docId).update(patch)
                restamped += 1
                records.push({
                    docId,
                    name,
                    extension: ext,
                    action: "restamped",
                    siblingsInCatalog,
                    diff,
                    patch,
                })
            } catch (err) {
                writeErrors += 1
                records.push({
                    docId,
                    name,
                    extension: ext,
                    action: "restamp-failed",
                    error: err.message,
                    diff,
                    patch,
                })
                process.stderr.write(`  !! UPDATE FAILED: ${err.message}\n`)
            }
        } else {
            records.push({
                docId,
                name,
                extension: ext,
                action: "would-restamp",
                siblingsInCatalog,
                diff,
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
        toRestamp: APPLY ? 0 : toRestamp,
        restamped: APPLY ? restamped : 0,
        skippedIncomplete,
        skippedOrphaned,
        skippedNoName,
        writeErrors,
        driftFraction:
            candidates > 0
                ? Number(
                      ((APPLY ? restamped : toRestamp) / candidates).toFixed(4),
                  )
                : 0,
        extensionHisto,
        mismatchedFieldHisto,
    }

    process.stderr.write(`\n=== Summary ===\n`)
    process.stderr.write(`  mode:                 ${summary.mode}\n`)
    process.stderr.write(`  scanned:              ${summary.scanned}\n`)
    process.stderr.write(`  candidates:           ${summary.candidates}\n`)
    process.stderr.write(`  alreadyStamped:       ${summary.alreadyStamped}\n`)
    if (APPLY) {
        process.stderr.write(`  restamped:            ${summary.restamped}\n`)
        process.stderr.write(`  writeErrors:          ${summary.writeErrors}\n`)
    } else {
        process.stderr.write(`  toRestamp:            ${summary.toRestamp}\n`)
    }
    process.stderr.write(`  skippedIncomplete:    ${summary.skippedIncomplete}\n`)
    process.stderr.write(`  skippedOrphaned:      ${summary.skippedOrphaned}\n`)
    process.stderr.write(`  skippedNoName:        ${summary.skippedNoName}\n`)
    process.stderr.write(`  driftFraction:        ${summary.driftFraction}\n`)
    process.stderr.write(
        `  extensionHisto:       ${JSON.stringify(summary.extensionHisto)}\n`,
    )
    process.stderr.write(
        `  mismatchedFieldHisto: ${JSON.stringify(summary.mismatchedFieldHisto)}\n`,
    )

    process.stdout.write(JSON.stringify({ summary, records }, null, 2) + "\n")

    if (writeErrors > 0) process.exit(1)
}

main().catch((err) => {
    process.stderr.write(`\n!! FATAL: ${err.stack || err.message}\n`)
    process.exit(1)
})
