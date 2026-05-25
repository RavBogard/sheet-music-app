#!/usr/bin/env node
/**
 * Re-stamp `library_index` rows whose stored W-02 fields disagree with the
 * NEW `bareStem` algorithm (β: strip trailing media extension before
 * parens/hyphen drop). Closes γ of the pdf-stem-drift lane:
 *
 *   - β (Tier 1) lands the bareStem algorithm change at
 *     `src/lib/mcp/title-specificity.ts` (+ mirror at
 *     `scripts/lib/index-name-fields-compute.mjs`).
 *   - γ (Tier 0, this script) re-stamps the historical rows whose stored
 *     stem reflects the PRE-β behavior — typically rows whose `name` ends
 *     in `.pdf` / `.musicxml` / `.mp3` / etc., whose old stored stem was
 *     `"<title> pdf"` and whose NEW computed stem is `"<title>"`.
 *
 * Lane: `pdf-stem-drift-bareStem-fix-and-backfill` (coder-5). Daniel
 * ratified β+γ on `.paul/research/pdf-stem-drift-backfill/FINDINGS.md`
 * (own authoring) per supervisor msg-001 2026-05-25T19:30Z.
 *
 * Sibling-of:
 *   - `scripts/backfill-library-normalizedname.mjs` (own, `10f7f8183`) —
 *     SAME shape; this script's classifier is the inverse path: it
 *     OVERWRITES mismatched fields rather than skipping them. The lane's
 *     entire reason-for-being is to re-stamp those rows now that the
 *     algorithm output has shifted.
 *
 * ## Behavior
 *
 * - DRY-RUN by default. `--apply` required for real writes.
 * - Reads every `library_index` row in ONE shot (~568 rows; single
 *   `.get()` is fine).
 * - Pre-builds a `stem → activeFileIds[]` index using the NEW β-bareStem so
 *   per-row sibling-count is O(1) and uses the correct buckets.
 * - For each active row with a name:
 *     * Skip orphans (`status === "orphaned"`) — mirror PCU semantics.
 *     * Skip nameless rows (anomaly).
 *     * Otherwise compute fresh `{nameLower, normalizedName, stem,
 *       titleSpecificity}` via `recomputeIndexNameFields` (mirror module,
 *       now carrying the β bareStem).
 *     * Per-field compare to stored:
 *         - All fields equal → already-stamped (no-op).
 *         - Any field absent → SKIP + log as "incomplete-row" (normalizedname-
 *           backfill territory; out-of-scope for restamp).
 *         - Any field differs from computed → CANDIDATE: overwrite the
 *           differing fields with the computed values.
 *     * Diff-shape tagging: each restamp record carries an `extensionPattern`
 *       summary (e.g. `.pdf` / `.musicxml` / `none`) so the run summary can
 *       audit β's coverage on the actual population.
 * - Idempotent: a second DRY-RUN after `--apply` reports `toRestamp=0` on
 *   the β-drift axis (rows missing fields entirely still surface, but they
 *   belong to normalizedname-backfill, not this script).
 *
 * ## Sibling-count semantics
 *
 *   siblingsInCatalog = (#active rows with `bareStem(name) === computedStem`)
 *
 * Same as normalizedname-backfill — the row being scored is already in the
 * snapshot, so no `+1`. Buckets are recomputed against the β stem.
 *
 * ## Output
 *
 * Per-row record streamed to stderr (human trace) and accumulated to stdout
 * as JSON:
 *
 *   {
 *     summary: {
 *       mode, scanned, candidates, alreadyStamped, toRestamp, restamped,
 *       skippedIncomplete, skippedOrphaned, skippedNoName, writeErrors,
 *       extensionHisto, mismatchedFieldHisto
 *     },
 *     records: [{ docId, action, current?, computed?, patch?, ... }]
 *   }
 *
 * ## Usage
 *
 *   node scripts/restamp-pdf-stem-drift.mjs            # DRY-RUN
 *   node scripts/restamp-pdf-stem-drift.mjs --apply    # real run
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
 * before `--apply`. Do NOT run `--apply` autonomously. Single named
 * executor per dispatch.
 */
import { initializeApp, cert, getApps } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

import { recomputeIndexNameFields, bareStem } from "./lib/index-name-fields-compute.mjs"

// ---------- .env.local loader (mirror backfill-library-normalizedname.mjs) ----------
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

// Path A scope-restriction (Daniel ruling msg-pdf-stem-drift-path-ruling
// 2026-05-25T21:00Z): EXCLUDE `normalizedName` from this lane's restamp
// comparison set. The 233 historical normalizedName-only mismatches surfaced
// by DRY-RUN-001 are extension-stripped (historical-good) while the canonical
// `recomputeIndexNameFields` computes them extension-included (canonical-
// helper-worse). Restamping would REGRESS those rows. The helper-side fix
// belongs to the queued follow-up `recomputeIndexNameFields-normalizedName-pin`
// lane; this script stays inside its β scope (bareStem-driven `stem` +
// `titleSpecificity` propagation + `nameLower` parity).
const W02_FIELDS = ["nameLower", "stem", "titleSpecificity"]

function classify(data, computed) {
    const current = {
        nameLower: data.nameLower,
        normalizedName: data.normalizedName,
        stem: data.stem,
        titleSpecificity: data.titleSpecificity,
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
        if (f === "titleSpecificity") {
            if (typeof cur !== "number" || cur !== com) mismatched.push(f)
        } else if (cur !== com) {
            mismatched.push(f)
        }
    }
    return { current, absent, mismatched }
}

// ---------- Main ----------

async function main() {
    const db = initFirestore()

    process.stderr.write(
        `# restamp-pdf-stem-drift.mjs — mode=${APPLY ? "APPLY" : "DRY-RUN"}\n`,
    )
    process.stderr.write(`# project=${PROJECT_ID}\n`)
    process.stderr.write(`# started=${new Date().toISOString()}\n\n`)

    const snap = await db.collection("library_index").get()
    process.stderr.write(`Phase 1: enumerated ${snap.size} library_index rows\n`)

    // Pre-build stem buckets using the NEW (β) bareStem.
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
        `Phase 1: built β-stem index — ${stemBuckets.size} unique stems, ${orphanedCount} orphaned rows excluded, ${noNameCount} nameless rows excluded\n\n`,
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
    // Histo tracks only the fields this lane is allowed to compare/write
    // post Path A ruling (W02_FIELDS — normalizedName excluded).
    const mismatchedFieldHisto = {
        nameLower: 0,
        stem: 0,
        titleSpecificity: 0,
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

        // Incomplete row → SKIP. Belongs to normalizedname-backfill (which
        // ran clean at `10f7f8183`); a row missing fields here is either an
        // anomaly that arrived after that run OR a row whose name field is
        // also broken. Surface for visibility, do not write.
        if (absent.length > 0) {
            skippedIncomplete += 1
            records.push({
                docId,
                name,
                action: "skipped-incomplete",
                missing: absent,
                mismatched,
            })
            process.stderr.write(
                `INCOMPLETE ${docId} name="${name}" absent=${JSON.stringify(absent)} mismatched=${JSON.stringify(mismatched)} — out-of-scope (normalizedname-backfill territory), skipping\n`,
            )
            continue
        }

        if (mismatched.length === 0) {
            alreadyStamped += 1
            records.push({ docId, action: "already-stamped" })
            continue
        }

        // Mismatch only (no absent fields) → re-stamp the differing fields.
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
                ? Number(((APPLY ? restamped : toRestamp) / candidates).toFixed(4))
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
