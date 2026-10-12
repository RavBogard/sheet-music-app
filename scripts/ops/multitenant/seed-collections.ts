/**
 * Multi-tenant phase 4 — seed `collections/{owner}__{key}` records from each
 * tenant's library config (CRC: core, supplemental, nava, uploads; BL: core,
 * uploads). All private, shared with nobody, assigned to nobody. Phase 5 reads
 * them; nothing reads them yet, so seeding changes nothing anyone sees.
 *
 *   npx vite-node -c vitest.config.ts scripts/ops/multitenant/seed-collections.ts            # dry run: prints the plan
 *   npx vite-node -c vitest.config.ts scripts/ops/multitenant/seed-collections.ts -- --apply # writes; saves a manifest first
 *   npx vite-node -c vitest.config.ts scripts/ops/multitenant/seed-collections.ts -- --undo <manifest.json> [--apply]
 *
 * Running twice changes nothing but labels and chart counts; an existing
 * record's sharing is never touched. chartCount = library_index rows with
 * orgId == owner and collection == key (a bare or unknown collection counts
 * as core). Credentials: GOOGLE_APPLICATION_CREDENTIALS (temp ADC) or
 * FIRESTORE_EMULATOR_HOST.
 */
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app"
import { FieldValue, getFirestore } from "firebase-admin/firestore"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { CODE_ORG_IDS, codeOrgConfig } from "@/lib/org/config-code"
import { parseOrgConfig, type OrgConfig } from "@/lib/org/config-schema"
import { desiredCollections, planCollectionSeed } from "@/lib/platform/collection-seed"
import { countCollectionCharts } from "@/lib/platform/tenants"

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "crcmusiccharts"
const args = process.argv.slice(2).filter((a) => a !== "--")
const APPLY = args.includes("--apply")
const UNDO = args.includes("--undo") ? args[args.indexOf("--undo") + 1] : null
const MANIFEST_DIR = process.env.MANIFEST_DIR || join(process.cwd(), "docs/planning/2026-10-12-multitenant/manifests")

if (!getApps().length)
    initializeApp(process.env.FIRESTORE_EMULATOR_HOST ? { projectId: PROJECT_ID } : { credential: applicationDefault(), projectId: PROJECT_ID })
const db = getFirestore()

type Manifest = { at: string; projectId: string; docs: Record<string, { existed: boolean; data: Record<string, unknown> | null }> }

async function tenantConfigs(): Promise<OrgConfig[]> {
    const snap = await db.collection("orgs").get()
    const out = new Map<string, OrgConfig>()
    for (const d of snap.docs) {
        if ((d.data() as { throwaway?: unknown }).throwaway === true) continue
        const parsed = parseOrgConfig(d.data())
        const cfg = parsed.ok ? parsed.config : codeOrgConfig(d.id)
        if (cfg) out.set(d.id, cfg)
    }
    for (const id of CODE_ORG_IDS) if (!out.has(id)) out.set(id, codeOrgConfig(id)!)
    return [...out.values()]
}

async function seed() {
    const configs = await tenantConfigs()
    const counts = new Map<string, number>()
    for (const c of configs)
        for (const col of c.library.collections) counts.set(`${c.id}|${col.id}`, await countCollectionCharts(db, c.id, col.id))
    const desired = desiredCollections(configs, (o, k) => counts.get(`${o}|${k}`) ?? 0)
    const existingSnap = await db.collection("collections").get()
    const existing = new Map(existingSnap.docs.map((d) => [d.id, d.data() as Record<string, unknown>]))
    const plan = planCollectionSeed(desired, existing)

    for (const c of plan.creates) console.log(`create collections/${c.id}: ${c.label} (${c.ownerOrgId}, ${c.chartCount} charts, private)`)
    for (const u of plan.updates) console.log(`update collections/${u.id}: ${JSON.stringify(u.set)}`)
    for (const id of plan.unchanged) console.log(`up to date: collections/${id}`)

    const changes = plan.creates.length + plan.updates.length
    if (!APPLY || changes === 0) {
        console.log(APPLY ? "nothing to write" : `dry run: ${changes} write(s) planned (pass --apply)`)
        return
    }
    const manifest: Manifest = { at: new Date().toISOString(), projectId: PROJECT_ID, docs: {} }
    for (const c of plan.creates) manifest.docs[c.id] = { existed: false, data: null }
    for (const u of plan.updates) manifest.docs[u.id] = { existed: true, data: JSON.parse(JSON.stringify(u.before)) }
    mkdirSync(MANIFEST_DIR, { recursive: true })
    const path = join(MANIFEST_DIR, `seed-collections-${manifest.at.replace(/[:.]/g, "-")}.json`)
    writeFileSync(path, JSON.stringify(manifest, null, 2) + "\n")
    console.log(`manifest: ${path}`)

    const batch = db.batch()
    for (const c of plan.creates) {
        const { id, ...rest } = c
        batch.create(db.collection("collections").doc(id), { ...rest, createdAt: FieldValue.serverTimestamp(), seededBy: "seed-collections" })
    }
    for (const u of plan.updates) batch.update(db.collection("collections").doc(u.id), { ...u.set, updatedAt: FieldValue.serverTimestamp() })
    await batch.commit()
    console.log(`applied ${changes} write(s)`)
}

async function undo(file: string) {
    const manifest = JSON.parse(readFileSync(file, "utf8")) as Manifest
    for (const [id, prev] of Object.entries(manifest.docs)) {
        const ref = db.collection("collections").doc(id)
        if (!prev.existed) {
            console.log(`undo: delete collections/${id} (created by the seed)`)
            if (APPLY) await ref.delete()
        } else {
            console.log(`undo: restore collections/${id}`)
            if (APPLY) await ref.set(prev.data ?? {})
        }
    }
    if (!APPLY) console.log("(dry run — pass --apply with --undo to restore)")
}

if (UNDO) await undo(UNDO)
else await seed()
