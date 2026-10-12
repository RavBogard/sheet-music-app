/**
 * Multi-tenant phase 2 — extras (design §6.3), same manifest/undo pattern as
 * stamp-orgid.ts. Parts (`--only a,b`; default all):
 *
 *   templates  templates/* without orgId → orgId from the id prefix before "__"
 *              (a bare id is crc).                                    [step 0]
 *   auditLogs  auditLogs/* without orgId → "crc" (every existing row predates
 *              tenant-scoped admin roles).                            [step 0]
 *   defaults   config/defaults keys pointing at a non-crc setlist → copied to
 *              config/defaults__<org> and removed from the crc doc.   [step 2]
 *   admins     delete config/admins (dead; platform/owners replaces it). [step 2]
 *
 *   npx vite-node -c vitest.config.ts scripts/ops/multitenant/stamp-p2-extras.ts -- --only templates,auditLogs            # dry run
 *   npx vite-node -c vitest.config.ts scripts/ops/multitenant/stamp-p2-extras.ts -- --only templates,auditLogs --apply    # manifest first
 *   npx vite-node -c vitest.config.ts scripts/ops/multitenant/stamp-p2-extras.ts -- --undo <manifest> [--apply]
 *
 * Undo removes exactly the stamped fields (only where they still hold the
 * stamped value) and restores the config docs' recorded before-state verbatim.
 * Credentials: GOOGLE_APPLICATION_CREDENTIALS (temp ADC) or FIRESTORE_EMULATOR_HOST.
 * MANIFEST_DIR overrides where manifests go.
 */
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app"
import { FieldValue, getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "crcmusiccharts"
const DEFAULT_ORG = "crc"
const BATCH = 400
export const PARTS = ["templates", "auditLogs", "defaults", "admins"] as const
export type Part = (typeof PARTS)[number]

interface StampEntry { collection: string; id: string; orgId: string }
interface DocState { path: string; exists: boolean; data: unknown }
export interface ExtrasManifest {
    kind: "stamp-p2-extras"
    at: string
    projectId: string
    parts: Part[]
    stamps: StampEntry[]
    docs: { before: DocState[]; after: DocState[] }
}

// ── value (de)serialisation so a manifest can restore Timestamps exactly ──
export function ser(v: unknown): unknown {
    if (v instanceof Timestamp) return { __ts: [v.seconds, v.nanoseconds] }
    if (Array.isArray(v)) return v.map(ser)
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, ser(x)]))
    return v
}
export function deser(v: unknown): unknown {
    if (Array.isArray(v)) return v.map(deser)
    if (v && typeof v === "object") {
        const o = v as Record<string, unknown>
        if (Array.isArray(o.__ts) && Object.keys(o).length === 1) return new Timestamp(o.__ts[0] as number, o.__ts[1] as number)
        return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, deser(x)]))
    }
    return v
}

const tagged = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0

export function templateOrgOfId(id: string): string {
    const m = /^([a-z0-9-]+)__.+$/.exec(id)
    return m ? m[1] : DEFAULT_ORG
}

async function docState(db: Firestore, path: string): Promise<DocState> {
    const s = await db.doc(path).get()
    return { path, exists: s.exists, data: s.exists ? ser(s.data()) : null }
}

export interface ExtrasPlan {
    parts: Part[]
    stamps: StampEntry[]
    /** config doc writes: path → full new data (null = delete) */
    configWrites: Array<{ path: string; data: Record<string, unknown> | null; note: string }>
    configPaths: string[]
}

export async function planExtras(db: Firestore, parts: Part[]): Promise<ExtrasPlan> {
    const stamps: StampEntry[] = []
    const configWrites: ExtrasPlan["configWrites"] = []
    const configPaths = new Set<string>()
    if (parts.includes("templates")) {
        for (const d of (await db.collection("templates").get()).docs) {
            if (!tagged(d.get("orgId"))) stamps.push({ collection: "templates", id: d.id, orgId: templateOrgOfId(d.id) })
        }
    }
    if (parts.includes("auditLogs")) {
        for (const d of (await db.collection("auditLogs").get()).docs) {
            if (!tagged(d.get("orgId"))) stamps.push({ collection: "auditLogs", id: d.id, orgId: DEFAULT_ORG })
        }
    }
    if (parts.includes("defaults")) {
        const crc = await db.doc("config/defaults").get()
        if (crc.exists) {
            const data = crc.data() ?? {}
            const moves = new Map<string, Record<string, unknown>>()
            const remaining: Record<string, unknown> = { ...data }
            for (const [key, val] of Object.entries(data)) {
                if (key === "updatedAt" || key === "updatedBy" || typeof val !== "string" || !val) continue
                const s = await db.collection("setlists").doc(val).get()
                const org = s.exists && tagged(s.get("orgId")) ? (s.get("orgId") as string) : DEFAULT_ORG
                if (org === DEFAULT_ORG) continue
                const m = moves.get(org) ?? {}
                m[key] = val
                moves.set(org, m)
                delete remaining[key]
            }
            for (const [org, keys] of moves) {
                const path = `config/defaults__${org}`
                const existing = (await db.doc(path).get()).data() ?? {}
                configWrites.push({ path, data: { ...existing, ...keys }, note: `move ${Object.keys(keys).join(",")} → ${org}` })
                configPaths.add(path)
            }
            if (moves.size > 0) {
                configWrites.push({ path: "config/defaults", data: remaining, note: "remove moved keys" })
                configPaths.add("config/defaults")
            }
        }
    }
    if (parts.includes("admins")) {
        const a = await db.doc("config/admins").get()
        if (a.exists) {
            configWrites.push({ path: "config/admins", data: null, note: `delete (uids: ${JSON.stringify(a.get("uids") ?? null)})` })
            configPaths.add("config/admins")
        }
    }
    return { parts, stamps, configWrites, configPaths: [...configPaths] }
}

export async function applyExtras(db: Firestore, plan: ExtrasPlan, manifestDir: string, projectId = PROJECT_ID): Promise<string | null> {
    if (!plan.stamps.length && !plan.configWrites.length) return null
    const before = await Promise.all(plan.configPaths.map((p) => docState(db, p)))
    mkdirSync(manifestDir, { recursive: true })
    const at = new Date().toISOString()
    const path = join(manifestDir, `stamp-p2-extras-${at.replace(/[:.]/g, "-")}.json`)
    const manifest: ExtrasManifest = { kind: "stamp-p2-extras", at, projectId, parts: plan.parts, stamps: plan.stamps, docs: { before, after: [] } }
    writeFileSync(path, JSON.stringify(manifest, null, 2) + "\n")
    for (let i = 0; i < plan.stamps.length; i += BATCH) {
        const b = db.batch()
        for (const e of plan.stamps.slice(i, i + BATCH)) b.set(db.collection(e.collection).doc(e.id), { orgId: e.orgId }, { merge: true })
        await b.commit()
    }
    for (const w of plan.configWrites) {
        if (w.data === null) await db.doc(w.path).delete()
        else await db.doc(w.path).set(w.data)
    }
    manifest.docs.after = await Promise.all(plan.configPaths.map((p) => docState(db, p)))
    writeFileSync(path, JSON.stringify(manifest, null, 2) + "\n")
    return path
}

export async function undoExtras(db: Firestore, manifestPath: string, apply: boolean): Promise<{ unstamped: number; skipped: number; restored: string[] }> {
    const m = JSON.parse(readFileSync(manifestPath, "utf8")) as ExtrasManifest
    let unstamped = 0
    let skipped = 0
    for (let i = 0; i < m.stamps.length; i += BATCH) {
        const b = db.batch()
        for (const e of m.stamps.slice(i, i + BATCH)) {
            const ref = db.collection(e.collection).doc(e.id)
            const s = await ref.get()
            if (!s.exists || s.get("orgId") !== e.orgId) {
                skipped++
                continue
            }
            b.update(ref, { orgId: FieldValue.delete() })
            unstamped++
        }
        if (apply) await b.commit()
    }
    const restored: string[] = []
    for (const d of m.docs.before) {
        if (apply) {
            if (d.exists) await db.doc(d.path).set(deser(d.data) as Record<string, unknown>)
            else await db.doc(d.path).delete()
        }
        restored.push(d.path)
    }
    return { unstamped, skipped, restored }
}

async function main() {
    const args = process.argv.slice(2).filter((a) => a !== "--")
    const APPLY = args.includes("--apply")
    const UNDO = args.includes("--undo") ? args[args.indexOf("--undo") + 1] : null
    const onlyRaw = args.includes("--only") ? args[args.indexOf("--only") + 1] : null
    const MANIFEST_DIR = process.env.MANIFEST_DIR || join(process.cwd(), "docs/planning/2026-10-12-multitenant/manifests")
    if (!getApps().length)
        initializeApp(process.env.FIRESTORE_EMULATOR_HOST ? { projectId: PROJECT_ID } : { credential: applicationDefault(), projectId: PROJECT_ID })
    const db = getFirestore()

    if (UNDO) {
        const r = await undoExtras(db, UNDO, APPLY)
        console.log(`${APPLY ? "undone" : "would undo"}: unstamp ${r.unstamped} (skipped ${r.skipped} changed since), restore ${r.restored.join(", ") || "no config docs"}`)
        if (!APPLY) console.log("dry run — pass --apply to undo")
        return
    }
    const parts = (onlyRaw ? onlyRaw.split(",").map((s) => s.trim()) : [...PARTS]) as Part[]
    const bad = parts.filter((p) => !(PARTS as readonly string[]).includes(p))
    if (bad.length) throw new Error(`unknown part(s): ${bad.join(", ")} (known: ${PARTS.join(", ")})`)
    const plan = await planExtras(db, parts)
    const byCol: Record<string, Record<string, number>> = {}
    for (const s of plan.stamps) {
        byCol[s.collection] ??= {}
        byCol[s.collection][s.orgId] = (byCol[s.collection][s.orgId] ?? 0) + 1
    }
    console.log(`parts: ${parts.join(",")}`)
    for (const [c, m] of Object.entries(byCol)) console.log(`stamp ${c.padEnd(12)} ${JSON.stringify(m)}`)
    for (const w of plan.configWrites) console.log(`config ${w.path}: ${w.note}`)
    if (!plan.stamps.length && !plan.configWrites.length) console.log("nothing to do")
    if (!APPLY) {
        console.log("dry run — pass --apply to write (manifest first)")
        return
    }
    const path = await applyExtras(db, plan, MANIFEST_DIR)
    console.log(path ? `manifest: ${path}` : "nothing written")
}

if (!process.env.VITEST) {
    main().catch((e) => {
        console.error(e)
        process.exit(1)
    })
}
