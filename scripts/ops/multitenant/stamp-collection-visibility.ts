/**
 * Multi-tenant phase 5 — stamp `collectionId`, `visibleToOrgs` and
 * `libraryOrgs` on every library_index and songs row, and `visibleTo` on every
 * chart object under `library/` in Storage, from the collection records
 * (src/lib/library/stamp-visibility.ts). The records are all private until
 * someone shares one, so every row and object comes out visible only to its own
 * tenant: nothing anyone sees changes. Run before the browser starts querying
 * `visibleToOrgs array-contains <tenant>`.
 *
 *   npx vite-node -c vitest.config.ts scripts/ops/multitenant/stamp-collection-visibility.ts                    # dry run
 *   npx vite-node -c vitest.config.ts scripts/ops/multitenant/stamp-collection-visibility.ts -- --apply          # manifest first, then stamps
 *   npx vite-node -c vitest.config.ts scripts/ops/multitenant/stamp-collection-visibility.ts -- --undo <manifest> [--apply]
 *
 * Undo puts back exactly the manifest's before-values (absent fields deleted
 * again), only where a document or object still holds what the stamp wrote.
 * Flags: --no-storage skips Storage. Credentials: GOOGLE_APPLICATION_CREDENTIALS
 * (temp ADC) or FIRESTORE_EMULATOR_HOST / FIREBASE_STORAGE_EMULATOR_HOST.
 * Bucket: STORAGE_BUCKET (default crcmusiccharts.firebasestorage.app).
 */
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
import { getStorage } from "firebase-admin/storage"
import type { Bucket } from "@google-cloud/storage"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { applyStamp, planStamp, undoStamp, type StampManifest } from "@/lib/library/stamp-visibility"

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "crcmusiccharts"
const BUCKET = process.env.STORAGE_BUCKET || "crcmusiccharts.firebasestorage.app"
const args = process.argv.slice(2).filter((a) => a !== "--")
const APPLY = args.includes("--apply")
const NO_STORAGE = args.includes("--no-storage")
const UNDO = args.includes("--undo") ? args[args.indexOf("--undo") + 1] : null
const MANIFEST_DIR = process.env.MANIFEST_DIR || join(process.cwd(), "docs/planning/2026-10-12-multitenant/manifests")

if (!getApps().length)
    initializeApp(process.env.FIRESTORE_EMULATOR_HOST ? { projectId: PROJECT_ID } : { credential: applicationDefault(), projectId: PROJECT_ID })
const db = getFirestore()
const bucket = NO_STORAGE ? null : (getStorage().bucket(BUCKET) as unknown as Bucket)

async function main() {
    if (UNDO) {
        const m = JSON.parse(readFileSync(UNDO, "utf8")) as StampManifest
        if (m.kind !== "stamp-collection-visibility") throw new Error(`${UNDO} is not a stamp-collection-visibility manifest`)
        const r = await undoStamp(db, bucket, m, APPLY)
        console.log(`${APPLY ? "restored" : "would restore"}: ${r.docs} documents, ${r.objects} objects; skipped (changed since): ${r.skipped.length}`)
        for (const s of r.skipped.slice(0, 50)) console.log(`  skipped ${s}`)
        if (!APPLY) console.log("dry run — pass --apply to undo")
        return
    }
    const m = await planStamp(db, bucket, PROJECT_ID)
    console.log(JSON.stringify(m.summary))
    if (!APPLY) {
        console.log("dry run — pass --apply to stamp")
        return
    }
    if (!m.docs.length && !m.objects.length) {
        console.log("nothing to stamp")
        return
    }
    mkdirSync(MANIFEST_DIR, { recursive: true })
    const path = join(MANIFEST_DIR, `stamp-collection-visibility-${m.at.replace(/[:.]/g, "-")}.json`)
    writeFileSync(path, JSON.stringify(m, null, 2) + "\n")
    console.log(`manifest: ${path}`)
    const r = await applyStamp(db, bucket, m)
    console.log(`stamped ${r.docs} documents, ${r.objects} objects`)
}

main().then(
    () => process.exit(0),
    (e) => {
        console.error(e)
        process.exit(1)
    },
)
