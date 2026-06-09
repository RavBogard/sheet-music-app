#!/usr/bin/env node
/**
 * v11-05-03 — backfill `scheduling_assignments.orgId` (+ `scheduling_history.orgId`)
 * from each row's PARENT SETLIST (prod runner).
 *
 * The cross-tenant roster reads (subscribeToAllUpcomingAssignments, suggest-band,
 * history, remind, listPendingAssignments, list_musicians_on_date, suggestBand,
 * list_service_personnel) filter assignments IN-MEMORY via `rowOrg(doc.orgId)`
 * with a missing→'crc' default. So this backfill is a SOFT gate (CRC stays fully
 * visible even un-run); its job is to make BL rows correct + the data explicit.
 * New assignments are stamped at create (assignment-service.ts) — this covers
 * the legacy rows written before v11-05-03.
 *
 * org SOURCE: the assignment's `setlistId` → `setlists/{id}.orgId` (rowOrg default
 * 'crc' if the setlist is missing/unstamped). scheduling_history rows join the
 * same way when they carry a setlistId, else default 'crc'.
 *
 * Sibling of scripts/backfill-user-orgids.mjs — same auth path (.env.local SA cert
 * OR GOOGLE_APPLICATION_CREDENTIALS ADC), same DRY-RUN-by-default discipline.
 * Idempotent: a doc that already has a string `orgId` is SKIPPED.
 * Rollback: unset `orgId` on the docs this stamped (orgId is derived, not authored):
 *   for each stamped doc → db.doc(path).update({ orgId: FieldValue.delete() })
 *
 * Usage:
 *   node scripts/backfill-assignment-orgids.mjs            # DRY-RUN (read-only)
 *   node scripts/backfill-assignment-orgids.mjs --apply    # real run
 *
 * Single-owner rule ([[feedback_single_owner_destructive_runs]]): inspect the
 * DRY-RUN report BEFORE --apply. Run at v11-05 phase close with the other backfills.
 */
import { initializeApp, cert, applicationDefault, getApps } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

// ---------- .env.local loader (mirror backfill-user-orgids.mjs) ----------
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

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "crcmusiccharts"
const APPLY = process.argv.includes("--apply")
const DEFAULT_ORG_ID = "crc" // lockstep with src/lib/org/registry.ts

// Lockstep with rowOrg (src/lib/org/membership.ts).
function rowOrg(raw) {
    return typeof raw === "string" && raw.length > 0 ? raw : DEFAULT_ORG_ID
}

function initFirestore() {
    const email = process.env.FIREBASE_CLIENT_EMAIL
    const key = process.env.FIREBASE_PRIVATE_KEY
    if (getApps().length === 0) {
        if (email && key) {
            initializeApp({ credential: cert({ projectId: PROJECT_ID, clientEmail: email, privateKey: key }) })
        } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
            initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID })
        } else {
            throw new Error(
                "No Admin credentials. Provide FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY in .env.local, " +
                    "OR set GOOGLE_APPLICATION_CREDENTIALS to a service-account key JSON.",
            )
        }
    }
    return getFirestore()
}

/** Resolve org for a set of setlistIds via batched getAll → Map<setlistId, orgId>. */
async function resolveSetlistOrgs(db, setlistIds) {
    const map = new Map()
    const ids = [...setlistIds].filter(Boolean)
    const CHUNK = 300 // getAll has no hard cap, but chunk to keep payloads sane
    for (let i = 0; i < ids.length; i += CHUNK) {
        const refs = ids.slice(i, i + CHUNK).map((id) => db.collection("setlists").doc(id))
        const docs = await db.getAll(...refs)
        for (const d of docs) {
            map.set(d.id, d.exists ? rowOrg(d.data()?.orgId) : DEFAULT_ORG_ID)
        }
    }
    return map
}

async function backfillCollection(db, collName) {
    const snap = await db.collection(collName).get()
    const report = { scanned: snap.size, alreadyStamped: 0, wouldStamp: 0, stamped: 0, byOrg: {} }
    const candidates = []
    const setlistIds = new Set()

    for (const doc of snap.docs) {
        const data = doc.data()
        if (typeof data.orgId === "string" && data.orgId.length > 0) {
            report.alreadyStamped += 1
            continue
        }
        const sid = typeof data.setlistId === "string" ? data.setlistId : null
        if (sid) setlistIds.add(sid)
        candidates.push({ id: doc.id, setlistId: sid })
    }

    const orgBySetlist = await resolveSetlistOrgs(db, setlistIds)
    for (const c of candidates) {
        c.target = c.setlistId ? orgBySetlist.get(c.setlistId) ?? DEFAULT_ORG_ID : DEFAULT_ORG_ID
        report.byOrg[c.target] = (report.byOrg[c.target] ?? 0) + 1
    }

    if (!APPLY) {
        report.wouldStamp = candidates.length
        for (const c of candidates) {
            process.stderr.write(`  [${collName}] would stamp ${c.id} → orgId='${c.target}' (setlist=${c.setlistId ?? "—"})\n`)
        }
    } else {
        for (const c of candidates) {
            await db.collection(collName).doc(c.id).set({ orgId: c.target }, { merge: true })
            report.stamped += 1
        }
    }
    return report
}

async function main() {
    const db = initFirestore()
    process.stderr.write(`# backfill-assignment-orgids.mjs — mode=${APPLY ? "APPLY" : "DRY-RUN"}\n`)
    process.stderr.write(`# project=${PROJECT_ID}\n# started=${new Date().toISOString()}\n\n`)

    const assignments = await backfillCollection(db, "scheduling_assignments")
    const history = await backfillCollection(db, "scheduling_history")

    const summary = {
        mode: APPLY ? "apply" : "dry-run",
        projectId: PROJECT_ID,
        startedAt: new Date().toISOString(),
        scheduling_assignments: assignments,
        scheduling_history: history,
    }
    process.stderr.write(`\n=== Summary (${summary.mode}) ===\n`)
    process.stdout.write(JSON.stringify({ summary }, null, 2) + "\n")
}

main().catch((err) => {
    process.stderr.write(`\n!! FATAL: ${err.stack || err.message}\n`)
    process.exit(1)
})
