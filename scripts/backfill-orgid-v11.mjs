#!/usr/bin/env node
/**
 * v11-01-03 — one-time tenant backfill + org seeding (prod runner).
 *
 * Stamps `orgId="crc"` on every EXISTING doc missing it across the five
 * tenant-scoped collections (setlists, tracks, library_index, songs,
 * recordings), and seeds `orgs/{crc}` + `orgs/{brotherslazaroff}` from the
 * static org registry. Paired with v11-01-02 (orgId on NEW writes), this is the
 * second precondition for the strict org-scoped rules deployed in v11-01-04 —
 * without it, a rule that `require`s orgId would reject every legacy CRC doc.
 *
 * Sibling of `scripts/backfill-drive-id-on-library-index.mjs` — same auth path
 * (.env.local SA), same DRY-RUN-by-default discipline, same .env.local loader.
 * The canonical stamping/seeding rules are emulator-tested in
 * `src/lib/org/__tests__/backfill-orgid.emulator.test.ts`; this runner mirrors
 * the same rules for the prod population.
 *
 * **Stamping rule.** A doc is a candidate iff its `orgId` is absent or an empty
 * string. Candidates are stamped via `set({ orgId:'crc' }, { merge:true })` so
 * ONLY orgId is touched. Docs with a non-empty orgId are SKIPPED (never
 * overwritten) — so a brotherslazaroff doc, if any existed, would be untouched.
 *
 * **Org seeding.** `orgs/{id}` gets `{ id, name, domain }` (merge-set);
 * `createdAt` is stamped only when the doc has none, so re-runs preserve it.
 *
 * **Behavior.** DRY-RUN by default (no writes). `--apply` required for a real
 * run. Idempotent — re-running after `--apply` reports zero `wouldStamp`.
 *
 * **Output.** Per-collection trace to stderr; a JSON report to stdout:
 *   { summary: { mode, projectId, perCollection: { <col>: {scanned, alreadyStamped,
 *     wouldStamp|stamped} }, orgs: [{id, action}] } }
 *
 * Usage:
 *   node scripts/backfill-orgid-v11.mjs            # DRY-RUN (read-only)
 *   node scripts/backfill-orgid-v11.mjs --apply    # real run
 *
 * Auth: .env.local with FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY +
 * NEXT_PUBLIC_FIREBASE_PROJECT_ID. firebase-adminsdk-fbsvc@crcmusiccharts SA —
 * needs `datastore.user`.
 *
 * Single-owner rule ([[feedback_single_owner_destructive_runs]]): inspect the
 * DRY-RUN report BEFORE running `--apply`. See backfill-orgid-v11.RUNBOOK.md.
 */
import { initializeApp, cert, applicationDefault, getApps } from "firebase-admin/app"
import { getFirestore, FieldValue } from "firebase-admin/firestore"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

// ---------- .env.local loader (mirror backfill-drive-id-on-library-index.mjs) ----------
const __dirname = dirname(fileURLToPath(import.meta.url))
const ENV_PATH = join(__dirname, "..", ".env.local")
{
    let envText
    try {
        envText = readFileSync(ENV_PATH, "utf8")
    } catch (err) {
        process.stderr.write(`!! Cannot read ${ENV_PATH}: ${err.message}\n`)
        process.exit(1)
    }
    for (const line of envText.split("\n")) {
        const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
        if (!m) continue
        let val = m[2]
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1)
        val = val.replace(/\\n/g, "\n")
        if (!(m[1] in process.env)) process.env[m[1]] = val
    }
}

const PROJECT_ID =
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "crcmusiccharts"
const APPLY = process.argv.includes("--apply")

// Keep in lockstep with src/lib/org/registry.ts (DEFAULT_ORG_ID + ORGS).
const DEFAULT_ORG_ID = "crc"
const ORGS = [
    { id: "crc", name: "Central Reform Congregation", domain: "centralreform.live" },
    { id: "brotherslazaroff", name: "Brothers Lazaroff", domain: "brotherslazaroff.live" },
]
const TENANT_COLLECTIONS = [
    "setlists",
    "tracks",
    "library_index",
    "songs",
    "recordings",
]
const WRITE_BATCH_MAX = 400

// ---------- Firebase admin init ----------
// Two credential paths:
//  1. Explicit SA cert from .env.local (FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY)
//     — the established prod-script convention (backfill-drive-id-on-library-index.mjs).
//  2. Application Default Credentials — set GOOGLE_APPLICATION_CREDENTIALS to a
//     downloaded service-account key JSON, or use `gcloud auth application-default
//     login`. NOTE: `firebase login` (CLI auth) alone does NOT satisfy the Admin
//     SDK — it needs an SA key or ADC.
function initFirestore() {
    const email = process.env.FIREBASE_CLIENT_EMAIL
    const key = process.env.FIREBASE_PRIVATE_KEY
    if (getApps().length === 0) {
        if (email && key) {
            initializeApp({
                credential: cert({ projectId: PROJECT_ID, clientEmail: email, privateKey: key }),
            })
        } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
            initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID })
        } else {
            throw new Error(
                "No Admin credentials. Provide FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY in .env.local, " +
                    "OR set GOOGLE_APPLICATION_CREDENTIALS to a service-account key JSON. " +
                    "(`firebase login` CLI auth alone is NOT sufficient for the Admin SDK.)",
            )
        }
    }
    return getFirestore()
}

function needsStamp(data) {
    const v = data?.orgId
    return !(typeof v === "string" && v.trim().length > 0)
}

async function backfillCollection(db, col) {
    const snap = await db.collection(col).get()
    const report = { scanned: snap.size, alreadyStamped: 0, wouldStamp: 0, stamped: 0 }
    const candidates = []
    for (const doc of snap.docs) {
        if (needsStamp(doc.data())) candidates.push(doc.id)
        else report.alreadyStamped += 1
    }

    if (!APPLY) {
        report.wouldStamp = candidates.length
        process.stderr.write(
            `  ${col}: scanned=${report.scanned} alreadyStamped=${report.alreadyStamped} wouldStamp=${report.wouldStamp}\n`,
        )
        return report
    }

    for (let i = 0; i < candidates.length; i += WRITE_BATCH_MAX) {
        const slice = candidates.slice(i, i + WRITE_BATCH_MAX)
        const batch = db.batch()
        for (const id of slice) {
            batch.set(db.collection(col).doc(id), { orgId: DEFAULT_ORG_ID }, { merge: true })
        }
        await batch.commit()
        report.stamped += slice.length
    }
    process.stderr.write(
        `  ${col}: scanned=${report.scanned} alreadyStamped=${report.alreadyStamped} stamped=${report.stamped}\n`,
    )
    return report
}

async function seedOrgs(db) {
    const orgs = []
    for (const org of ORGS) {
        const ref = db.collection("orgs").doc(org.id)
        const existing = await ref.get()
        const hasCreatedAt = existing.exists && existing.data()?.createdAt !== undefined
        let action
        if (!existing.exists) action = "create"
        else if (!hasCreatedAt) action = "update"
        else action = "noop"

        if (APPLY) {
            const payload = { id: org.id, name: org.name, domain: org.domain }
            if (!hasCreatedAt) payload.createdAt = FieldValue.serverTimestamp()
            await ref.set(payload, { merge: true })
        }
        orgs.push({ id: org.id, action })
        process.stderr.write(`  orgs/${org.id}: ${action}\n`)
    }
    return orgs
}

// ---------- Main ----------
async function main() {
    const db = initFirestore()

    process.stderr.write(
        `# backfill-orgid-v11.mjs — mode=${APPLY ? "APPLY" : "DRY-RUN"}\n`,
    )
    process.stderr.write(`# project=${PROJECT_ID}\n`)
    process.stderr.write(`# started=${new Date().toISOString()}\n\n`)

    process.stderr.write(`Phase 1: backfill orgId on tenant collections\n`)
    const perCollection = {}
    for (const col of TENANT_COLLECTIONS) {
        perCollection[col] = await backfillCollection(db, col)
    }

    process.stderr.write(`\nPhase 2: seed orgs/{id}\n`)
    const orgs = await seedOrgs(db)

    const summary = {
        mode: APPLY ? "apply" : "dry-run",
        startedAt: new Date().toISOString(),
        projectId: PROJECT_ID,
        perCollection,
        orgs,
    }

    process.stderr.write(`\n=== Summary (${summary.mode}) ===\n`)
    process.stdout.write(JSON.stringify({ summary }, null, 2) + "\n")
}

main().catch((err) => {
    process.stderr.write(`\n!! FATAL: ${err.stack || err.message}\n`)
    process.exit(1)
})
