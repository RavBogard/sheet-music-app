/**
 * Multi-tenant phase 1 — write orgs/crc and orgs/brotherslazaroff from the code
 * tables (src/lib/org/config-code.ts), so the Firestore documents cannot drift
 * from the code they replace.
 *
 *   npx vite-node -c vitest.config.ts scripts/ops/multitenant/seed-org-configs.ts            # dry run: prints the difference
 *   npx vite-node -c vitest.config.ts scripts/ops/multitenant/seed-org-configs.ts -- --apply # writes; saves a manifest
 *   npx vite-node -c vitest.config.ts scripts/ops/multitenant/seed-org-configs.ts -- --undo <manifest.json>
 *
 * Each config field is written whole (update, not a deep merge), so a removed
 * override does not linger. Fields the config does not own (domain, createdAt
 * from the v11 backfill) are kept. Running twice changes nothing.
 * The manifest holds every document's exact previous state; --undo restores it.
 * Credentials: GOOGLE_APPLICATION_CREDENTIALS (temp ADC) or FIRESTORE_EMULATOR_HOST.
 */
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app"
import { FieldValue, getFirestore } from "firebase-admin/firestore"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { CODE_ORG_IDS, codeOrgConfig } from "@/lib/org/config-code"
import { OrgConfigSchema } from "@/lib/org/config-schema"

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "crcmusiccharts"
const args = process.argv.slice(2).filter((a) => a !== "--")
const APPLY = args.includes("--apply")
const UNDO = args.includes("--undo") ? args[args.indexOf("--undo") + 1] : null
const MANIFEST_DIR = join(process.cwd(), "docs/planning/2026-10-12-multitenant/manifests")

if (!getApps().length)
    initializeApp(process.env.FIRESTORE_EMULATOR_HOST ? { projectId: PROJECT_ID } : { credential: applicationDefault(), projectId: PROJECT_ID })
const db = getFirestore()

/** Stable JSON for comparison (sorted keys; Timestamps as ISO). */
function canon(v: unknown): unknown {
    if (v && typeof v === "object" && typeof (v as { toDate?: unknown }).toDate === "function")
        return (v as { toDate: () => Date }).toDate().toISOString()
    if (Array.isArray(v)) return v.map(canon)
    if (v && typeof v === "object")
        return Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, canon((v as Record<string, unknown>)[k])]))
    return v
}
const same = (a: unknown, b: unknown) => JSON.stringify(canon(a)) === JSON.stringify(canon(b))

async function undo(path: string) {
    const manifest = JSON.parse(readFileSync(path, "utf8")) as { docs: Record<string, { existed: boolean; data: Record<string, unknown> | null }> }
    for (const [id, prev] of Object.entries(manifest.docs)) {
        const ref = db.collection("orgs").doc(id)
        if (!prev.existed) {
            console.log(`undo: delete orgs/${id} (did not exist before)`)
            if (APPLY) await ref.delete()
            continue
        }
        console.log(`undo: restore orgs/${id} to its previous ${Object.keys(prev.data ?? {}).length} fields`)
        if (APPLY) await ref.set(reviveTimestamps(prev.data ?? {}))
    }
    if (!APPLY) console.log("(dry run — pass --apply with --undo to restore)")
}

/** Manifest timestamps are stored as {__ts: iso}; turn them back into Dates. */
function reviveTimestamps(v: Record<string, unknown>): Record<string, unknown> {
    const walk = (x: unknown): unknown => {
        if (x && typeof x === "object" && "__ts" in (x as object)) return new Date((x as { __ts: string }).__ts)
        if (Array.isArray(x)) return x.map(walk)
        if (x && typeof x === "object") return Object.fromEntries(Object.entries(x).map(([k, y]) => [k, walk(y)]))
        return x
    }
    return walk(v) as Record<string, unknown>
}
function freezeTimestamps(v: unknown): unknown {
    if (v && typeof v === "object" && typeof (v as { toDate?: unknown }).toDate === "function")
        return { __ts: (v as { toDate: () => Date }).toDate().toISOString() }
    if (Array.isArray(v)) return v.map(freezeTimestamps)
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, y]) => [k, freezeTimestamps(y)]))
    return v
}

async function seed() {
    const manifest: { at: string; projectId: string; docs: Record<string, { existed: boolean; data: unknown }> } = {
        at: new Date().toISOString(),
        projectId: PROJECT_ID,
        docs: {},
    }
    let changes = 0
    const pending: Array<{ id: string; update: Record<string, unknown> }> = []
    for (const id of CODE_ORG_IDS) {
        const desired = OrgConfigSchema.parse(codeOrgConfig(id))
        const snap = await db.collection("orgs").doc(id).get()
        const current = (snap.data() ?? {}) as Record<string, unknown>
        manifest.docs[id] = { existed: snap.exists, data: snap.exists ? freezeTimestamps(current) : null }
        const update: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(desired)) {
            if (!same(current[k], v)) update[k] = v
        }
        const keys = Object.keys(update)
        console.log(`orgs/${id}: ${keys.length ? `${keys.length} field(s) differ: ${keys.join(", ")}` : "up to date"}`)
        for (const k of keys) {
            console.log(`  ${k}:
    now:  ${JSON.stringify(current[k] ?? null).slice(0, 400)}
    want: ${JSON.stringify(update[k]).slice(0, 400)}`)
        }
        if (keys.length) pending.push({ id, update })
        changes += keys.length
    }
    if (APPLY && changes) {
        // The manifest is written BEFORE any write, so an interrupted run can still be undone.
        mkdirSync(MANIFEST_DIR, { recursive: true })
        const path = join(MANIFEST_DIR, `seed-org-configs-${manifest.at.replace(/[:.]/g, "-")}.json`)
        writeFileSync(path, JSON.stringify(manifest, null, 2) + "\n")
        console.log(`manifest: ${path}`)
        for (const { id, update } of pending) {
            const keys = Object.keys(update)
            await db.collection("orgs").doc(id).set(
                { ...update, configUpdatedAt: FieldValue.serverTimestamp() },
                { mergeFields: [...keys, "configUpdatedAt"] },
            )
        }
    }
    console.log(APPLY ? `applied ${changes} field change(s)` : `dry run: ${changes} field change(s) would be written (pass --apply)`)
}

if (UNDO) await undo(UNDO)
else await seed()
