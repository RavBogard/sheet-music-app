/**
 * W-02 one-time backfill — populate `stem`, `titleSpecificity`, and
 * `bondCorrectionHistory` on every existing `library_index` row.
 *
 * Idempotent: rows that already have all three fields are skipped, so
 * running the script twice produces zero writes on the second pass.
 * Orphans (status: "orphaned") are skipped — they have no Storage object
 * and don't surface in search anyway, so spending writes on them is waste.
 *
 * Run with:
 *   npx tsx scripts/backfill-title-specificity.ts [--dry-run|--apply|--help]
 *
 * Default mode is --dry-run (lists planned writes without committing).
 * Pass --apply to commit.
 *
 * No migration_snapshots: specificity is purely derived data and the
 * script is idempotent, so rollback = run with values cleared = trivial.
 */

import * as dotenv from "dotenv"
import { initializeApp, cert, getApps, applicationDefault } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
import { bareStem, titleSpecificity } from "../src/lib/mcp/title-specificity"

dotenv.config({ path: ".env.local" })

const BATCH_SIZE = 400 // Firestore commit limit is 500; pad for safety

type Mode = "dry-run" | "apply"

function parseArgs(argv: string[]): { mode: Mode; help: boolean } {
    const help = argv.includes("--help") || argv.includes("-h")
    const apply = argv.includes("--apply")
    return { mode: apply ? "apply" : "dry-run", help }
}

function usage(): void {
    console.log(`
W-02 specificity backfill

Usage:
  npx tsx scripts/backfill-title-specificity.ts [options]

Options:
  --dry-run   (default) Print planned writes, don't commit.
  --apply     Commit the writes to Firestore.
  --help      Show this message.

The script:
  1. Reads every library_index doc.
  2. Skips orphans + rows that already carry stem + titleSpecificity + bondCorrectionHistory.
  3. Groups remaining rows by normalized stem.
  4. Computes siblingsInCatalog from the non-orphan stem distribution.
  5. Writes back stem + titleSpecificity + bondCorrectionHistory in batches.
`)
}

function initFirebase(): void {
    if (getApps().length > 0) return
    const projectId =
        process.env.FIREBASE_PROJECT_ID ||
        process.env.GOOGLE_CLOUD_PROJECT ||
        "crcmusiccharts"
    const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
    if (credPath) {
        initializeApp({ projectId, credential: applicationDefault() })
    } else {
        // ADC fallback — gcloud auth application-default login
        initializeApp({ projectId, credential: applicationDefault() })
    }
}

interface RowSnapshot {
    id: string
    name: string
    status: string
    hasStem: boolean
    hasSpecificity: boolean
    hasBondHistory: boolean
}

async function main(): Promise<void> {
    const { mode, help } = parseArgs(process.argv.slice(2))
    if (help) {
        usage()
        return
    }

    initFirebase()
    const db = getFirestore()

    console.log(`[W-02 backfill] mode=${mode}; reading library_index...`)
    const snap = await db.collection("library_index").get()
    console.log(`[W-02 backfill] read ${snap.size} rows`)

    // First pass — compute stem + status snapshot for every row.
    const rows: RowSnapshot[] = []
    for (const doc of snap.docs) {
        const data = doc.data()
        const name =
            (typeof data.name === "string" && data.name) ||
            (typeof data.title === "string" && data.title) ||
            doc.id
        rows.push({
            id: doc.id,
            name,
            status: typeof data.status === "string" ? data.status : "active",
            hasStem: typeof data.stem === "string" && data.stem.length > 0,
            hasSpecificity: typeof data.titleSpecificity === "number",
            hasBondHistory:
                data.bondCorrectionHistory != null &&
                typeof data.bondCorrectionHistory === "object",
        })
    }

    // Compute non-orphan sibling counts per stem.
    const stemCounts = new Map<string, number>()
    const rowStem = new Map<string, string>()
    for (const r of rows) {
        const stem = bareStem(r.name)
        rowStem.set(r.id, stem)
        if (r.status === "orphaned" || !stem) continue
        stemCounts.set(stem, (stemCounts.get(stem) ?? 0) + 1)
    }

    // Plan writes — skip rows that already have all three fields.
    const writes: Array<{ id: string; patch: Record<string, unknown> }> = []
    let skippedIdempotent = 0
    let skippedOrphaned = 0
    for (const r of rows) {
        if (r.status === "orphaned") {
            skippedOrphaned++
            continue
        }
        if (r.hasStem && r.hasSpecificity && r.hasBondHistory) {
            skippedIdempotent++
            continue
        }
        const stem = rowStem.get(r.id) ?? ""
        const siblings = stem ? stemCounts.get(stem) ?? 1 : 1
        const score = titleSpecificity(r.name, siblings)
        const patch: Record<string, unknown> = {}
        if (!r.hasStem && stem) patch.stem = stem
        if (!r.hasSpecificity) patch.titleSpecificity = score
        if (!r.hasBondHistory) {
            patch.bondCorrectionHistory = {
                correctedTo: 0,
                correctedAwayFrom: 0,
            }
        }
        if (Object.keys(patch).length === 0) {
            skippedIdempotent++
            continue
        }
        writes.push({ id: r.id, patch })
    }

    console.log(`[W-02 backfill] planned writes: ${writes.length}`)
    console.log(`[W-02 backfill] skipped (orphaned): ${skippedOrphaned}`)
    console.log(`[W-02 backfill] skipped (idempotent — already has all fields): ${skippedIdempotent}`)

    // Distribution summary — how many rows below STOP_AND_ASK_THRESHOLD?
    let belowThreshold = 0
    let aboveThreshold = 0
    for (const w of writes) {
        const score = w.patch.titleSpecificity as number | undefined
        if (typeof score !== "number") continue
        if (score < 0.5) belowThreshold++
        else aboveThreshold++
    }
    console.log(`[W-02 backfill] distribution among planned writes: ${belowThreshold} rows < 0.5 (would prompt), ${aboveThreshold} rows >= 0.5`)

    if (mode === "dry-run") {
        const sample = writes.slice(0, 10)
        console.log(`[W-02 backfill] dry-run — sample of first 10 planned writes:`)
        for (const w of sample) {
            console.log(`  - ${w.id}: ${JSON.stringify(w.patch)}`)
        }
        console.log(`[W-02 backfill] dry-run complete. Re-run with --apply to commit.`)
        return
    }

    // Commit in batches.
    let committed = 0
    for (let i = 0; i < writes.length; i += BATCH_SIZE) {
        const batch = db.batch()
        const slice = writes.slice(i, i + BATCH_SIZE)
        for (const w of slice) {
            batch.update(db.collection("library_index").doc(w.id), w.patch)
        }
        await batch.commit()
        committed += slice.length
        console.log(`[W-02 backfill] committed ${committed}/${writes.length}`)
    }

    console.log(`[W-02 backfill] DONE — ${committed} rows updated. Re-run to verify idempotency.`)
}

main().catch((err) => {
    console.error("[W-02 backfill] FAILED:", err)
    process.exit(1)
})
