/**
 * B-006 remediation (v6 bugstomp) — mark all UUID-id library_index rows
 * that have no underlying Storage bytes as `status: 'orphaned'`.
 *
 * Background: scripts/probe-b006-uuid-charts.mjs found that 272 of 568
 * library_index rows are bare UUIDs (no `upload-` prefix) with
 * `source: "local_upload"`, `collection: "supplemental"`,
 * `lastSyncedAt` clustered on 2026-03-15, and zero matching bytes
 * anywhere in the Storage bucket. They predate the atomic upload
 * guard (`f650d94f0`, 2026-05-15) by ~2 months — likely from an
 * upload path that committed the catalog row before confirming
 * Storage write.
 *
 * This script verifies EACH of the 272 via the same `fileExistsInStorage`
 * helper production uses (Storage primary, all extension + with/without
 * `upload-` prefix candidate paths), then marks confirmed orphans with
 * `status: 'orphaned'`. Result: `search_library` hides them by default;
 * `list_library` still shows them when callers want the raw catalog.
 *
 * Idempotent: rows that already carry `status: 'orphaned'` are skipped.
 * Reversible: a future legitimate upload to the same fileId flips status
 * back to `active`.
 *
 * Run:
 *   npx tsx scripts/markorphan-b006-uuid-charts.ts            # dry-run
 *   npx tsx scripts/markorphan-b006-uuid-charts.ts --apply    # commit
 *   npx tsx scripts/markorphan-b006-uuid-charts.ts --help
 *
 * Writes a snapshot of every row touched to
 * `outputs/markorphan-b006-<ISO>.json` for audit + future revert.
 */
import * as dotenv from "dotenv"
import * as fs from "node:fs"
import * as path from "node:path"
import { initializeApp, getApps, cert } from "firebase-admin/app"
import { getFirestore, FieldValue } from "firebase-admin/firestore"
import { fileExistsInStorage } from "../src/lib/firebase-storage"

dotenv.config({ path: ".env.local" })

const args = process.argv.slice(2)
if (args.includes("--help") || args.includes("-h")) {
    console.log(
        `Usage: npx tsx scripts/markorphan-b006-uuid-charts.ts [--apply|--dry-run|--help]\n` +
            `\n` +
            `Default mode is --dry-run (lists planned writes without committing).\n` +
            `Pass --apply to commit.\n`,
    )
    process.exit(0)
}
const APPLY = args.includes("--apply")
const MODE = APPLY ? "APPLY" : "DRY-RUN"

console.log(`[markorphan-b006] mode: ${MODE}`)

if (getApps().length === 0) {
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n")
    if (!projectId || !clientEmail || !privateKey) {
        console.error(
            "Missing Firebase admin creds. Set FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY + NEXT_PUBLIC_FIREBASE_PROJECT_ID in .env.local.",
        )
        process.exit(1)
    }
    initializeApp({
        credential: cert({ projectId, clientEmail, privateKey }),
        storageBucket:
            process.env.FIREBASE_STORAGE_BUCKET ||
            process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
            `${projectId}.firebasestorage.app`,
    })
}

const db = getFirestore()

const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

interface RowSnapshot {
    id: string
    name: string | null
    collection: string | null
    source: string | null
    previousStatus: string | null
    storageVerdict: "missing-all-candidates" | "found" | "network-error"
}

async function main() {
    console.log("[markorphan-b006] loading library_index ...")
    const snap = await db.collection("library_index").get()
    console.log(`[markorphan-b006] total rows: ${snap.size}`)

    const uuidRows = snap.docs.filter((d) => UUID_PATTERN.test(d.id))
    console.log(`[markorphan-b006] uuid-id rows: ${uuidRows.length}`)

    const alreadyOrphaned = uuidRows.filter(
        (d) => (d.data() as { status?: string }).status === "orphaned",
    )
    console.log(
        `[markorphan-b006] already marked orphaned (will skip): ${alreadyOrphaned.length}`,
    )

    const candidates = uuidRows.filter(
        (d) => (d.data() as { status?: string }).status !== "orphaned",
    )
    console.log(`[markorphan-b006] candidates to verify: ${candidates.length}`)

    // Verify each candidate via production's fileExistsInStorage. Probe in
    // batches so we don't hammer Storage in a tight Promise.all of 272.
    const BATCH = 20
    const toMark: RowSnapshot[] = []
    const stillHasBytes: RowSnapshot[] = []
    const networkErrors: RowSnapshot[] = []
    for (let i = 0; i < candidates.length; i += BATCH) {
        const slice = candidates.slice(i, i + BATCH)
        const verdicts = await Promise.all(
            slice.map(async (d) => {
                const data = d.data() as Record<string, unknown>
                const mime =
                    typeof data.mimeType === "string"
                        ? data.mimeType
                        : undefined
                const res = await fileExistsInStorage(d.id, mime)
                const snapshot: RowSnapshot = {
                    id: d.id,
                    name: (data.name as string) ?? null,
                    collection: (data.collection as string) ?? null,
                    source: (data.source as string) ?? null,
                    previousStatus: (data.status as string) ?? null,
                    storageVerdict: res.success
                        ? res.data
                            ? "found"
                            : "missing-all-candidates"
                        : "network-error",
                }
                return snapshot
            }),
        )
        for (const v of verdicts) {
            if (v.storageVerdict === "missing-all-candidates") toMark.push(v)
            else if (v.storageVerdict === "found") stillHasBytes.push(v)
            else networkErrors.push(v)
        }
        process.stdout.write(
            `\r[markorphan-b006] verified ${Math.min(
                i + BATCH,
                candidates.length,
            )}/${candidates.length} ...`,
        )
    }
    process.stdout.write("\n")

    console.log(`[markorphan-b006] verdicts:`)
    console.log(`  to mark orphaned : ${toMark.length}`)
    console.log(`  storage-has-bytes (skip): ${stillHasBytes.length}`)
    console.log(`  network-error (retry later): ${networkErrors.length}`)

    if (stillHasBytes.length > 0) {
        console.log(
            "[markorphan-b006] FOUND-IN-STORAGE rows (will NOT mark orphaned):",
        )
        for (const r of stillHasBytes.slice(0, 10)) {
            console.log(`  ${r.id}  ${r.name}`)
        }
        if (stillHasBytes.length > 10) {
            console.log(`  ...and ${stillHasBytes.length - 10} more`)
        }
    }
    if (networkErrors.length > 0) {
        console.log(
            "[markorphan-b006] NETWORK-ERROR rows (retry the script later):",
        )
        for (const r of networkErrors.slice(0, 10)) {
            console.log(`  ${r.id}  ${r.name}`)
        }
    }
    console.log(`[markorphan-b006] sample of to-mark rows (first 5):`)
    for (const r of toMark.slice(0, 5)) {
        console.log(`  ${r.id}  ${r.name}  (${r.collection}, ${r.source})`)
    }

    // Snapshot the to-mark set so we can audit / revert.
    const outDir = path.resolve("outputs")
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, "-")
    const snapshotFile = path.join(outDir, `markorphan-b006-${stamp}.json`)
    fs.writeFileSync(
        snapshotFile,
        JSON.stringify(
            {
                mode: MODE,
                generatedAt: new Date().toISOString(),
                summary: {
                    totalUuidRows: uuidRows.length,
                    alreadyOrphaned: alreadyOrphaned.length,
                    toMark: toMark.length,
                    stillHasBytes: stillHasBytes.length,
                    networkErrors: networkErrors.length,
                },
                toMark,
                stillHasBytes,
                networkErrors,
            },
            null,
            2,
        ),
    )
    console.log(`[markorphan-b006] snapshot: ${snapshotFile}`)

    if (!APPLY) {
        console.log(
            `[markorphan-b006] DRY-RUN complete. Pass --apply to commit ${toMark.length} writes.`,
        )
        return
    }

    if (toMark.length === 0) {
        console.log("[markorphan-b006] nothing to mark.")
        return
    }

    // Batch writes — Firestore limit is 500 per batch.
    const BATCH_WRITE = 400
    let committed = 0
    for (let i = 0; i < toMark.length; i += BATCH_WRITE) {
        const slice = toMark.slice(i, i + BATCH_WRITE)
        const batch = db.batch()
        for (const r of slice) {
            batch.update(db.collection("library_index").doc(r.id), {
                status: "orphaned",
                orphanedAt: FieldValue.serverTimestamp(),
                orphanedReason: "B-006: pre-atomic-guard sync left no Storage bytes",
            })
        }
        await batch.commit()
        committed += slice.length
        console.log(
            `[markorphan-b006] committed ${committed}/${toMark.length} ...`,
        )
    }
    console.log(`[markorphan-b006] APPLY complete. ${committed} rows marked orphaned.`)
}

main().catch((err) => {
    console.error("[markorphan-b006] FAILED:", err)
    process.exit(1)
})
