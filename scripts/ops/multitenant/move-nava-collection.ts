/**
 * Multi-tenant phase 5 (built and rehearsed) / phase 8 (production run) — move
 * CRC's `nava` collection to Nava Tehila's ownership and share it back to CRC
 * (ruling R-1012-mt-6). What it writes: src/lib/library/nava-move.ts.
 *
 *   npx vite-node -c vitest.config.ts scripts/ops/multitenant/move-nava-collection.ts -- --to <navaOrgId>                 # dry run: plan + counts
 *   npx vite-node -c vitest.config.ts scripts/ops/multitenant/move-nava-collection.ts -- --to <navaOrgId> --apply         # manifest first, then the move
 *   npx vite-node -c vitest.config.ts scripts/ops/multitenant/move-nava-collection.ts -- --undo <manifest> [--apply]      # put everything back
 *
 * The tenant named by --to must exist (orgs/<id>). File ids never change. Undo
 * restores each field's before value (absent fields deleted again) only where
 * a document or object still holds what the move wrote, deletes the collection
 * record the move created, and clears crc__nava's movedTo.
 * Flags: --no-storage skips Storage. Credentials: GOOGLE_APPLICATION_CREDENTIALS
 * or FIRESTORE_EMULATOR_HOST / FIREBASE_STORAGE_EMULATOR_HOST.
 * Bucket: STORAGE_BUCKET (default crcmusiccharts.firebasestorage.app).
 */
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
import { getStorage } from "firebase-admin/storage"
import type { Bucket } from "@google-cloud/storage"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { applyNavaMove, planNavaMove, undoNavaMove, type MoveManifest } from "@/lib/library/nava-move"

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "crcmusiccharts"
const BUCKET = process.env.STORAGE_BUCKET || "crcmusiccharts.firebasestorage.app"
const args = process.argv.slice(2).filter((a) => a !== "--")
const APPLY = args.includes("--apply")
const NO_STORAGE = args.includes("--no-storage")
const TO = args.includes("--to") ? args[args.indexOf("--to") + 1] : null
const UNDO = args.includes("--undo") ? args[args.indexOf("--undo") + 1] : null
const MANIFEST_DIR = process.env.MANIFEST_DIR || join(process.cwd(), "docs/planning/2026-10-12-multitenant/manifests")

if (!getApps().length)
    initializeApp(process.env.FIRESTORE_EMULATOR_HOST ? { projectId: PROJECT_ID } : { credential: applicationDefault(), projectId: PROJECT_ID })
const db = getFirestore()
const bucket = NO_STORAGE ? null : (getStorage().bucket(BUCKET) as unknown as Bucket)

async function main() {
    if (UNDO) {
        const m = JSON.parse(readFileSync(UNDO, "utf8")) as MoveManifest
        const r = await undoNavaMove(db, bucket, m, APPLY)
        console.log(`${APPLY ? "restored" : "would restore"}: ${r.docs} documents, ${r.objects} objects; skipped (changed since): ${r.skipped.length}`)
        for (const s of r.skipped.slice(0, 50)) console.log(`  skipped ${s}`)
        if (!APPLY) console.log("dry run — pass --apply to undo")
        return
    }
    if (!TO) throw new Error("Pass --to <navaOrgId> (the tenant must exist).")
    const m = await planNavaMove(db, bucket, TO, PROJECT_ID)
    console.log(JSON.stringify({ to: m.to, collection: m.targetCollectionId, createsRecord: m.targetCollectionBefore === null, ...m.summary }))
    if (!APPLY) {
        console.log("dry run — pass --apply to move")
        return
    }
    mkdirSync(MANIFEST_DIR, { recursive: true })
    const path = join(MANIFEST_DIR, `move-nava-collection-${m.at.replace(/[:.]/g, "-")}.json`)
    writeFileSync(path, JSON.stringify(m, null, 2) + "\n")
    console.log(`manifest: ${path}`)
    const r = await applyNavaMove(db, bucket, m)
    console.log(`moved ${r.docs} documents, ${r.objects} objects`)
}

main().then(
    () => process.exit(0),
    (e) => {
        console.error(e instanceof Error ? e.message : e)
        process.exit(1)
    },
)
