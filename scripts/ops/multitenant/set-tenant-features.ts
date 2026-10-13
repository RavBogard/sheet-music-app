/**
 * Multi-tenant phase 6 — set `orgs/{crc,brotherslazaroff}.features` and
 * `.driveInbox` to the compiled config (config-code.ts; BL's flags are the ones
 * P6-BL-FLAGS.md determined), and stamp `config/monitor.orgId = "crc"`.
 *
 *   npx vite-node -c vitest.config.ts scripts/ops/multitenant/set-tenant-features.ts                    # dry run
 *   npx vite-node -c vitest.config.ts scripts/ops/multitenant/set-tenant-features.ts -- --apply          # manifest first, then writes
 *   npx vite-node -c vitest.config.ts scripts/ops/multitenant/set-tenant-features.ts -- --undo <manifest> [--apply]
 *
 * Undo puts back the manifest's before-values (absent fields deleted again),
 * only where a field still holds what apply wrote. Refuses (writes nothing) if
 * an orgs document or config/monitor is missing. Credentials:
 * GOOGLE_APPLICATION_CREDENTIALS (temp ADC) or FIRESTORE_EMULATOR_HOST.
 * Config caches clear within 60 s (get-org-config.ts ORG_CONFIG_TTL_MS).
 */
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import {
    applySetFeatures,
    planSetFeatures,
    undoSetFeatures,
    type SetFeaturesManifest,
} from "@/lib/org/set-tenant-features"

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "crcmusiccharts"
const args = process.argv.slice(2).filter((a) => a !== "--")
const APPLY = args.includes("--apply")
const UNDO = args.includes("--undo") ? args[args.indexOf("--undo") + 1] : null
const MANIFEST_DIR = process.env.MANIFEST_DIR || join(process.cwd(), "docs/planning/2026-10-12-multitenant/manifests")

if (!getApps().length)
    initializeApp(process.env.FIRESTORE_EMULATOR_HOST ? { projectId: PROJECT_ID } : { credential: applicationDefault(), projectId: PROJECT_ID })
const db = getFirestore()

async function main() {
    if (UNDO) {
        const m = JSON.parse(readFileSync(UNDO, "utf8")) as SetFeaturesManifest
        if (m.kind !== "set-tenant-features") throw new Error(`${UNDO} is not a set-tenant-features manifest`)
        const r = await undoSetFeatures(db, m, APPLY)
        console.log(`${APPLY ? "restored" : "would restore"}: ${r.restored} fields; skipped: ${r.skipped.length}`)
        for (const s of r.skipped) console.log(`  skipped ${s}`)
        if (!APPLY) console.log("dry run — pass --apply to undo")
        return
    }
    const m = await planSetFeatures(db, PROJECT_ID)
    for (const c of m.changes) console.log(`${c.doc}.${c.field}: ${JSON.stringify(c.before)} -> ${JSON.stringify(c.after)}`)
    if (!m.changes.length) {
        console.log("nothing to change")
        return
    }
    if (!APPLY) {
        console.log("dry run — pass --apply to write")
        return
    }
    mkdirSync(MANIFEST_DIR, { recursive: true })
    const path = join(MANIFEST_DIR, `set-tenant-features-${m.at.replace(/[:.]/g, "-")}.json`)
    writeFileSync(path, JSON.stringify(m, null, 2) + "\n")
    console.log(`manifest: ${path}`)
    console.log(`wrote ${await applySetFeatures(db, m)} fields`)
}

main().then(
    () => process.exit(0),
    (e) => {
        console.error(e)
        process.exit(1)
    },
)
