/**
 * Multi-tenant phase 2 — stamp `orgId` into the custom metadata of every chart
 * object under `library/` in Storage, so storage.rules can check the reader's
 * membership in the object's tenant. No object is moved or rewritten; only its
 * metadata gains one key.
 *
 * Each object's tenant is its chart's: `library/<fileId>[.ext]` (or a nested
 * path whose first segment is the fileId) → library_index/<fileId>.orgId;
 * then digitized_charts by id; otherwise "crc", what a missing tenant has
 * always meant. Objects that already carry metadata.orgId are never touched.
 *
 *   npx vite-node -c vitest.config.ts scripts/ops/multitenant/stamp-storage-orgid.ts                 # dry run
 *   npx vite-node -c vitest.config.ts scripts/ops/multitenant/stamp-storage-orgid.ts -- --apply       # stamps; manifest first
 *   npx vite-node -c vitest.config.ts scripts/ops/multitenant/stamp-storage-orgid.ts -- --undo <manifest> [--apply]
 *
 * Undo removes metadata.orgId from exactly the manifest's objects, and only
 * where it still holds the value written. Credentials: GOOGLE_APPLICATION_CREDENTIALS.
 * Bucket: STORAGE_BUCKET (default crcmusiccharts.firebasestorage.app).
 */
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
import { getStorage } from "firebase-admin/storage"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "crcmusiccharts"
const BUCKET = process.env.STORAGE_BUCKET || "crcmusiccharts.firebasestorage.app"
const args = process.argv.slice(2).filter((a) => a !== "--")
const APPLY = args.includes("--apply")
const UNDO = args.includes("--undo") ? args[args.indexOf("--undo") + 1] : null
const MANIFEST_DIR = process.env.MANIFEST_DIR || join(process.cwd(), "docs/planning/2026-10-12-multitenant/manifests")
const DEFAULT_ORG = "crc"
const CONCURRENCY = 16

if (!getApps().length) initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID })
const db = getFirestore()
const bucket = getStorage().bucket(BUCKET)

const tagged = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0

/** `library/abc123.pdf` → `abc123`; `library/abc123/page-1.png` → `abc123`. */
export function fileIdOf(name: string): string {
    const rest = name.replace(/^library\//, "")
    const first = rest.split("/")[0]
    return rest.includes("/") ? first : first.replace(/\.[A-Za-z0-9]+$/, "")
}

async function orgMap(collection: string): Promise<Map<string, string>> {
    const m = new Map<string, string>()
    for (const d of (await db.collection(collection).select("orgId").get()).docs) {
        const o = d.get("orgId")
        if (tagged(o)) m.set(d.id, o)
    }
    return m
}

interface Entry { name: string; orgId: string; via: string }

async function plan(): Promise<{ entries: Entry[]; already: number; total: number }> {
    const chartOrg = await orgMap("library_index")
    const digitizedOrg = await orgMap("digitized_charts")
    const [files] = await bucket.getFiles({ prefix: "library/" })
    const entries: Entry[] = []
    let already = 0
    for (const f of files) {
        if (f.name.endsWith("/")) continue
        if (tagged(f.metadata?.metadata?.orgId)) { already++; continue }
        const id = fileIdOf(f.name)
        const fromChart = chartOrg.get(id)
        const fromDigitized = digitizedOrg.get(id)
        entries.push(fromChart
            ? { name: f.name, orgId: fromChart, via: "library_index" }
            : fromDigitized
                ? { name: f.name, orgId: fromDigitized, via: "digitized_charts" }
                : { name: f.name, orgId: DEFAULT_ORG, via: "default (no chart row)" })
    }
    return { entries, already, total: files.length }
}

async function pool<T>(items: T[], fn: (t: T) => Promise<void>) {
    let i = 0
    await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
        while (i < items.length) await fn(items[i++])
    }))
}

async function stamp() {
    const { entries, already, total } = await plan()
    const by: Record<string, number> = {}
    for (const e of entries) by[`${e.orgId} via ${e.via}`] = (by[`${e.orgId} via ${e.via}`] ?? 0) + 1
    console.log(`objects under library/: ${total}; already stamped: ${already}; to stamp: ${entries.length}`)
    console.log(JSON.stringify(by, null, 2))
    if (!APPLY) { console.log("dry run — pass --apply to stamp"); return }
    if (!entries.length) return
    mkdirSync(MANIFEST_DIR, { recursive: true })
    const at = new Date().toISOString()
    const path = join(MANIFEST_DIR, `stamp-storage-orgid-${at.replace(/[:.]/g, "-")}.json`)
    writeFileSync(path, JSON.stringify({ at, bucket: BUCKET, entries }, null, 2) + "\n")
    console.log(`manifest: ${path}`)
    let n = 0
    await pool(entries, async (e) => {
        await bucket.file(e.name).setMetadata({ metadata: { orgId: e.orgId } })
        if (++n % 200 === 0) console.log(`  ${n}/${entries.length}`)
    })
    console.log(`stamped ${n}`)
}

async function undo(path: string) {
    const { entries } = JSON.parse(readFileSync(path, "utf8")) as { entries: Entry[] }
    let n = 0, skipped = 0
    await pool(entries, async (e) => {
        const f = bucket.file(e.name)
        const [exists] = await f.exists()
        if (!exists) { skipped++; return }
        const [meta] = await f.getMetadata()
        if (meta.metadata?.orgId !== e.orgId) { skipped++; return }
        if (APPLY) await f.setMetadata({ metadata: { orgId: null } })
        n++
    })
    console.log(`${APPLY ? "unstamped" : "would unstamp"} ${n}; skipped ${skipped} (gone or changed since)`)
}

if (UNDO) await undo(UNDO)
else await stamp()
