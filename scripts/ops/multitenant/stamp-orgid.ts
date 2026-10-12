/**
 * Multi-tenant phase 2 — stamp `orgId` on every untagged tenant-owned row.
 *
 * List rules are not filters: once the rules check `orgId`, an unstamped CRC
 * row would vanish from its tenant's queries. So before the rules rewrite,
 * every untagged row gets the tenant it already belongs to:
 *   - rows with a parent setlist (tracks, live_sessions, proposal_stages, tasks,
 *     bond_flags) take the parent setlist's orgId — 34 untagged tracks in
 *     production sit on Brothers Lazaroff setlists, so a blanket "crc" would
 *     be wrong;
 *   - rows keyed by a chart (songUsage.fileId, digitized_charts.sourceFileId)
 *     take that chart's library_index orgId;
 *   - everything else, and any row whose parent is missing or itself
 *     unstamped, takes "crc" — what a missing orgId has always meant.
 * Rows that already carry an orgId are never touched.
 *
 *   npx vite-node -c vitest.config.ts scripts/ops/multitenant/stamp-orgid.ts                  # dry run
 *   npx vite-node -c vitest.config.ts scripts/ops/multitenant/stamp-orgid.ts -- --apply        # stamps; manifest first
 *   npx vite-node -c vitest.config.ts scripts/ops/multitenant/stamp-orgid.ts -- --undo <manifest> [--apply]
 *
 * The manifest lists exactly the documents stamped and the value written; undo
 * deletes `orgId` from exactly those, and only where it still holds that value.
 * Credentials: GOOGLE_APPLICATION_CREDENTIALS (temp ADC) or FIRESTORE_EMULATOR_HOST.
 */
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app"
import { FieldValue, getFirestore } from "firebase-admin/firestore"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "crcmusiccharts"
const args = process.argv.slice(2).filter((a) => a !== "--")
const APPLY = args.includes("--apply")
const UNDO = args.includes("--undo") ? args[args.indexOf("--undo") + 1] : null
const MANIFEST_DIR = process.env.MANIFEST_DIR || join(process.cwd(), "docs/planning/2026-10-12-multitenant/manifests")
const DEFAULT_ORG = "crc"
const BATCH = 400

if (!getApps().length)
    initializeApp(process.env.FIRESTORE_EMULATOR_HOST ? { projectId: PROJECT_ID } : { credential: applicationDefault(), projectId: PROJECT_ID })
const db = getFirestore()

type Rule = { collection: string; parent?: "setlist" | "chart"; parentField?: string }

/** Tenant-owned collections (handoff phase 2 list, as they exist in production). */
export const STAMP_RULES: Rule[] = [
    { collection: "setlists" },
    { collection: "tracks", parent: "setlist", parentField: "setlistId" },
    { collection: "songs" },
    { collection: "library_index" },
    { collection: "recordings" },
    { collection: "setlistTemplates" },
    { collection: "contacts" },
    { collection: "scheduling_assignments", parent: "setlist", parentField: "setlistId" },
    { collection: "scheduling_history", parent: "setlist", parentField: "setlistId" },
    { collection: "musician_availability" },
    { collection: "live_sessions", parent: "setlist", parentField: "setlistId" },
    { collection: "proposal_stages", parent: "setlist", parentField: "setlistId" },
    { collection: "tasks", parent: "setlist", parentField: "setlistId" },
    { collection: "bond_flags", parent: "setlist", parentField: "setlistId" },
    { collection: "songUsage", parent: "chart", parentField: "fileId" },
    { collection: "digitized_charts", parent: "chart", parentField: "sourceFileId" },
    { collection: "publicSetlists" },
]

const tagged = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0

async function orgMap(collection: string): Promise<Map<string, string>> {
    const m = new Map<string, string>()
    for (const d of (await db.collection(collection).select("orgId").get()).docs) {
        const o = d.get("orgId")
        if (tagged(o)) m.set(d.id, o)
    }
    return m
}

interface Entry { collection: string; id: string; orgId: string; via: string }

async function plan(): Promise<Entry[]> {
    const setlistOrg = await orgMap("setlists")
    const chartOrg = await orgMap("library_index")
    const out: Entry[] = []
    for (const r of STAMP_RULES) {
        const snap = await db.collection(r.collection).get()
        for (const d of snap.docs) {
            if (tagged(d.get("orgId"))) continue
            let orgId = DEFAULT_ORG
            let via = "default"
            const pid = r.parentField ? d.get(r.parentField) : undefined
            if (r.parent === "setlist" && typeof pid === "string" && setlistOrg.has(pid)) {
                orgId = setlistOrg.get(pid)!
                via = "setlist"
            } else if (r.parent === "chart" && typeof pid === "string" && chartOrg.has(pid)) {
                orgId = chartOrg.get(pid)!
                via = "chart"
            } else if (r.parent) {
                via = "default (parent missing or unstamped)"
            }
            out.push({ collection: r.collection, id: d.id, orgId, via })
        }
    }
    return out
}

function summarise(entries: Entry[]) {
    const s: Record<string, Record<string, number>> = {}
    for (const e of entries) {
        const k = `${e.collection}`
        s[k] ??= {}
        const v = `${e.orgId} via ${e.via}`
        s[k][v] = (s[k][v] ?? 0) + 1
    }
    for (const [c, m] of Object.entries(s)) console.log(`${c.padEnd(24)} ${JSON.stringify(m)}`)
    console.log(`total: ${entries.length}`)
}

async function stamp() {
    const entries = await plan()
    summarise(entries)
    if (!APPLY) {
        console.log("dry run — pass --apply to stamp")
        return
    }
    if (!entries.length) return
    mkdirSync(MANIFEST_DIR, { recursive: true })
    const at = new Date().toISOString()
    const path = join(MANIFEST_DIR, `stamp-orgid-${at.replace(/[:.]/g, "-")}.json`)
    writeFileSync(path, JSON.stringify({ at, projectId: PROJECT_ID, entries }, null, 2) + "\n")
    console.log(`manifest: ${path}`)
    for (let i = 0; i < entries.length; i += BATCH) {
        const b = db.batch()
        for (const e of entries.slice(i, i + BATCH)) b.set(db.collection(e.collection).doc(e.id), { orgId: e.orgId }, { merge: true })
        await b.commit()
    }
    console.log(`stamped ${entries.length}`)
}

async function undo(path: string) {
    const { entries } = JSON.parse(readFileSync(path, "utf8")) as { entries: Entry[] }
    let n = 0, skipped = 0
    for (let i = 0; i < entries.length; i += BATCH) {
        const b = db.batch()
        for (const e of entries.slice(i, i + BATCH)) {
            const ref = db.collection(e.collection).doc(e.id)
            const cur = await ref.get()
            if (!cur.exists || cur.get("orgId") !== e.orgId) { skipped++; continue }
            b.update(ref, { orgId: FieldValue.delete() })
            n++
        }
        if (APPLY) await b.commit()
    }
    console.log(`${APPLY ? "unstamped" : "would unstamp"} ${n}; skipped ${skipped} (gone or changed since)`)
}

if (UNDO) await undo(UNDO)
else await stamp()
