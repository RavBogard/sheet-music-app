/**
 * Multi-tenant phase 8 — ruling R-1012-mt-8, the two charts left over.
 *
 * Two `nava` rows hold Nava Tehila's ENGRAVED NOTATION pdf where ruling 8's
 * default says the transliterated CHORD CHART is "the chart". Both were flagged
 * "check first" in the ruling and never checked: the 12 Oct second pass skipped
 * Yedaber Aleihem on a date argument, and never looked at Ehyeh Asher Ehyeh.
 * Byte hashes against Nava's Drive copies settle it — see the phase 8 return.
 *
 * Replacement is IN PLACE through `healChartBytes`, so the fileId, every bond
 * and every curation field (key, bpm, tags, title) survive, as the ruling asks.
 *
 *   npx vite-node -c vitest.config.ts scripts/ops/multitenant/replace-nava-chart-bytes.ts -- --src <dir>            # dry run
 *   npx vite-node -c vitest.config.ts scripts/ops/multitenant/replace-nava-chart-bytes.ts -- --src <dir> --apply    # back up, manifest, then replace
 *   npx vite-node -c vitest.config.ts scripts/ops/multitenant/replace-nava-chart-bytes.ts -- --undo <manifest> [--apply]
 *
 * Current bytes are backed up to BACKUP_DIR (outside the repo — chart bytes are
 * never committed) before anything is written; the manifest records both hashes
 * and the backup path, and --undo heals them back the same way.
 * Credentials: GOOGLE_APPLICATION_CREDENTIALS (temp ADC).
 */
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
import { getStorage } from "firebase-admin/storage"
import { createHash } from "node:crypto"
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { healChartBytes } from "@/lib/chart-heal"

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "crcmusiccharts"
const BUCKET = process.env.STORAGE_BUCKET || "crcmusiccharts.firebasestorage.app"
/** Daniel, the platform owner; the rows' own uploadedBy. */
const ACTOR_UID = process.env.ACTOR_UID || "93Xn3DbS0bSNb8zmfzLyfOMX1A13"
const ORG = "navatehila"

const args = process.argv.slice(2).filter((a) => a !== "--")
const arg = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined)
const APPLY = args.includes("--apply")
const SRC = arg("--src")
const UNDO = arg("--undo")
const MANIFEST_DIR = process.env.MANIFEST_DIR || join(process.cwd(), "docs/planning/2026-10-12-multitenant/manifests")
const BACKUP_DIR = process.env.BACKUP_DIR || "C:/Users/dsbog/CentralReform.live/work/nava-chart-bytes-backup"

/** fileId → the chord-chart pdf that belongs on it, by file name under --src. */
const PLAN = [
    {
        fileId: "upload-737e52a7-fa67-4560-8a3f-f3653b131e7b",
        title: "Ehyeh Asher Ehyeh (Daphna Rosenberg)",
        source: "drive/ehyeh-asher-ehyeh_2026-08-17.pdf",
        note: "row held the engraved notation (15.6 KB); Nava's chord chart is G / C9 / D4 / F C/E G, (c) 2008",
    },
    {
        fileId: "upload-f03dc4c0-0930-4358-abe6-cd983364c829",
        title: "Yedaber Aleihem (Yoel Sykes)",
        source: "drive/shamru-edotav_KS-Ps99_2025-08-03.pdf",
        note: "row held the engraved notation (33 KB); Nava's chord chart is Em B7 / C7 Adim7, (c) 2007",
    },
] as const

const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex")
const stamp = () => new Date().toISOString().replace(/[:.]/g, "-")

if (!getApps().length) initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID })
const db = getFirestore()
const bucket = getStorage().bucket(BUCKET)

async function currentBytes(fileId: string): Promise<Buffer> {
    const [buf] = await bucket.file(`library/${fileId}.pdf`).download()
    return buf as Buffer
}

async function run() {
    if (UNDO) return undo()
    if (!SRC) {
        console.error("usage: --src <dir holding the chord-chart pdfs> [--apply]   |   --undo <manifest> [--apply]")
        process.exit(2)
    }

    const rows: Record<string, unknown>[] = []
    for (const p of PLAN) {
        const snap = await db.collection("library_index").doc(p.fileId).get()
        if (!snap.exists) throw new Error(`${p.fileId}: no library_index row`)
        const row = snap.data()!
        const before = await currentBytes(p.fileId)
        const after = readFileSync(join(SRC, p.source))
        const same = sha256(before) === sha256(after)
        if (row.orgId !== ORG) throw new Error(`${p.fileId}: orgId is ${row.orgId}, expected ${ORG}`)
        rows.push({
            fileId: p.fileId,
            title: p.title,
            rowName: row.name,
            note: p.note,
            orgId: row.orgId,
            visibleToOrgs: row.visibleToOrgs,
            backupDriveId: row.backupDriveId ?? null,
            before: { bytes: before.byteLength, sha256: sha256(before), contentHash: row.contentHash ?? null },
            after: { bytes: after.byteLength, sha256: sha256(after), source: p.source },
            identical: same,
            curationPreserved: { key: row.key ?? null, bpm: row.bpm ?? null, tags: row.tags ?? null, name: row.name },
        })
        console.log(
            `${same ? "SKIP   " : "REPLACE"} ${p.fileId}  ${String(row.name)}\n` +
                `        before ${before.byteLength} B ${sha256(before).slice(0, 12)}  ->  after ${after.byteLength} B ${sha256(after).slice(0, 12)}\n` +
                `        ${p.note}`,
        )
    }

    const todo = rows.filter((r) => !(r as { identical: boolean }).identical)
    if (!APPLY) {
        console.log(`\ndry run: ${todo.length} of ${rows.length} would be replaced. Re-run with --apply.`)
        return
    }
    if (todo.length === 0) {
        console.log("\nnothing to do: every row already holds the chord chart.")
        return
    }

    // Back up the current bytes OUTSIDE the repo before touching anything.
    mkdirSync(BACKUP_DIR, { recursive: true })
    const at = stamp()
    for (const r of todo) {
        const id = (r as { fileId: string }).fileId
        const dest = join(BACKUP_DIR, `${id}.before-${at}.pdf`)
        writeFileSync(dest, await currentBytes(id))
        ;(r as Record<string, unknown>).backupPath = dest
        const srcCopy = join(BACKUP_DIR, `${id}.after-${at}.pdf`)
        copyFileSync(join(SRC!, (r as { after: { source: string } }).after.source), srcCopy)
        ;(r as Record<string, unknown>).sourceCopyPath = srcCopy
    }

    const manifestPath = join(MANIFEST_DIR, `replace-nava-chart-bytes-${at}.json`)
    mkdirSync(MANIFEST_DIR, { recursive: true })
    const manifest = {
        kind: "replace-nava-chart-bytes",
        at,
        projectId: PROJECT_ID,
        bucket: BUCKET,
        org: ORG,
        actorUid: ACTOR_UID,
        ruling: "R-1012-mt-8",
        rows: todo,
    }
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
    console.log(`\nmanifest: ${manifestPath}`)

    for (const r of todo) {
        const { fileId, after } = r as { fileId: string; after: { source: string; sha256: string; bytes: number } }
        const buf = readFileSync(join(SRC!, after.source))
        const res = await healChartBytes(db, ACTOR_UID, fileId, buf, "application/pdf", "drive", ORG)
        if (!("ok" in res) || !res.ok) {
            console.error(`FAILED ${fileId}:`, JSON.stringify(res))
            process.exit(1)
        }
        const check = await currentBytes(fileId)
        const row = (await db.collection("library_index").doc(fileId).get()).data()!
        const good = sha256(check) === after.sha256 && row.fileSize === after.bytes
        console.log(
            `${good ? "OK      " : "MISMATCH"} ${fileId}  ${String(row.name)}  ${check.byteLength} B ${sha256(check).slice(0, 12)}  ` +
                `key=${String(row.key)} bpm=${String(row.bpm)} tags=${JSON.stringify(row.tags)} enrichment=${String(row.enrichmentStatus)}`,
        )
        if (!good) process.exit(1)
    }
    console.log(`\ndone. undo: --undo ${manifestPath} --apply`)
}

async function undo() {
    const m = JSON.parse(readFileSync(UNDO!, "utf8")) as {
        rows: { fileId: string; backupPath: string; before: { sha256: string; bytes: number } }[]
    }
    for (const r of m.rows) {
        const buf = readFileSync(r.backupPath)
        if (sha256(buf) !== r.before.sha256) throw new Error(`${r.fileId}: backup hash does not match the manifest`)
        console.log(`${APPLY ? "RESTORE" : "would restore"} ${r.fileId} <- ${r.backupPath} (${buf.byteLength} B)`)
        if (!APPLY) continue
        const res = await healChartBytes(db, ACTOR_UID, r.fileId, buf, "application/pdf", "undo", ORG)
        if (!("ok" in res) || !res.ok) throw new Error(`${r.fileId}: ${JSON.stringify(res)}`)
        const check = await currentBytes(r.fileId)
        console.log(`  restored ${check.byteLength} B ${sha256(check).slice(0, 12)}`)
    }
    if (!APPLY) console.log("\ndry run. Re-run with --apply.")
}

run().catch((e) => {
    console.error(e)
    process.exit(1)
})
