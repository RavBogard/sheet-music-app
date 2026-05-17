/**
 * B-006 discovery probe (v6 bugstomp) — empirically figure out what's
 * going on with UUID-id chart rows in `library_index` that `getChartHealth`
 * reports as `status: missing, reason: "Drive: File not found"`.
 *
 * Three hypotheses to discriminate:
 *
 *   (a) Bytes exist in Storage at an UNCONVENTIONAL path that
 *       getCandidatePaths doesn't try (e.g. `library/{uuid}` with no
 *       extension, or under a different prefix). → Fix is routing.
 *   (b) Bytes exist in DRIVE under a Drive-id, but `library_index` stores
 *       the UUID as fileId instead of the Drive-id. → Fix is per-row
 *       fileId backfill from another doc field.
 *   (c) Bytes don't exist anywhere. Orphan catalog rows. → Fix is
 *       hygiene-pass (mark orphaned or delete).
 *
 * The probe samples up to N=5 UUID-pattern fileIds from library_index,
 * then for each one:
 *   - Lists every Storage object whose name contains the UUID
 *   - Dumps every field on the library_index row (look for hidden hints
 *     like driveFileId, storagePath, originalId, etc.)
 *   - Reports findings so Daniel + I can decide on the fix together.
 *
 * Read-only — no writes, no deletes.
 *
 * Run with:
 *   npx tsx scripts/probe-b006-uuid-charts.mjs
 *
 * Requires .env.local with Firebase admin credentials (same pattern as
 * scripts/backfill-title-specificity.ts).
 */
import * as dotenv from "dotenv"
import {
    initializeApp,
    cert,
    getApps,
    applicationDefault,
} from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
import { getStorage } from "firebase-admin/storage"

dotenv.config({ path: ".env.local" })

if (getApps().length === 0) {
    // Match src/lib/firebase-admin.ts: FIREBASE_CLIENT_EMAIL +
    // FIREBASE_PRIVATE_KEY (no _ADMIN_ infix).
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n")
    if (clientEmail && privateKey) {
        initializeApp({
            credential: cert({ projectId, clientEmail, privateKey }),
            storageBucket:
                process.env.FIREBASE_STORAGE_BUCKET ||
                process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
                `${projectId}.firebasestorage.app`,
        })
    } else {
        initializeApp({
            credential: applicationDefault(),
            storageBucket:
                process.env.FIREBASE_STORAGE_BUCKET ||
                process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
                `${projectId}.firebasestorage.app`,
        })
    }
}

const db = getFirestore()
const bucket = getStorage().bucket()

// UUID v4 pattern, used as the "bare UUID, no prefix" marker.
const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

console.log("Bucket:", bucket.name)
console.log("Scanning library_index for UUID-id rows (no `upload-` prefix, no extension)...")

const snap = await db.collection("library_index").get()
console.log(`Total library_index rows: ${snap.size}`)

const uuidRows = []
let uploadCount = 0
let otherCount = 0
for (const doc of snap.docs) {
    const id = doc.id
    if (UUID_PATTERN.test(id)) {
        uuidRows.push({ id, data: doc.data() })
    } else if (id.startsWith("upload-")) {
        uploadCount++
    } else {
        otherCount++
    }
}
console.log(
    `Classification: uuid=${uuidRows.length}, upload-prefix=${uploadCount}, other=${otherCount}`,
)

const SAMPLE_N = 5
const sample = uuidRows.slice(0, SAMPLE_N)
console.log(`\nProbing first ${sample.length} UUID-id rows:`)

for (const row of sample) {
    console.log(`\n=== ${row.id} ===`)
    console.log("library_index doc fields:")
    for (const [k, v] of Object.entries(row.data)) {
        const display =
            typeof v === "string" && v.length > 100
                ? v.slice(0, 100) + "..."
                : v
        console.log(`  ${k}: ${JSON.stringify(display)}`)
    }
    // Find every Storage object whose name contains this UUID, anywhere.
    console.log("Storage objects matching this UUID:")
    const [files] = await bucket.getFiles({ prefix: "library/" })
    const matches = files.filter((f) => f.name.includes(row.id))
    if (matches.length === 0) {
        console.log("  (none found in library/ with this UUID)")
        // Also try outside library/ — maybe migrated to a different prefix.
        const [allFiles] = await bucket.getFiles({ maxResults: 5000 })
        const broaderMatches = allFiles.filter((f) => f.name.includes(row.id))
        if (broaderMatches.length === 0) {
            console.log("  (none anywhere in bucket)")
        } else {
            console.log("  Found OUTSIDE library/:")
            for (const m of broaderMatches) {
                console.log(`    ${m.name}`)
            }
        }
    } else {
        for (const m of matches) {
            console.log(`  ${m.name}`)
        }
    }
}

console.log("\n=== Probe complete ===")
console.log(
    `Total uuid-id rows: ${uuidRows.length}. Sample shown: ${sample.length}.`,
)
console.log(
    "Use findings to discriminate hypotheses (a) routing, (b) field drift, (c) true orphans.",
)
