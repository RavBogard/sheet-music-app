#!/usr/bin/env node
/**
 * v11-05-02 — backfill `users/{uid}.orgIds` from auth custom claims (prod runner).
 *
 * The roster reads filter by `users.where('orgIds','array-contains',org)`.
 * `array-contains` CANNOT match a missing field, so every user doc MUST carry an
 * `orgIds` array before the v11-05-02 roster filter deploys — else a claimless
 * CRC user would vanish from CRC's roster. This stamps each doc's orgIds from the
 * SOURCE OF TRUTH (the user's auth claim), defaulting claimless users to ['crc']
 * (the CRC-safety invariant mirrored from src/lib/org/membership.ts).
 *
 * Sibling of scripts/backfill-orgid-v11.mjs — same auth path (.env.local SA cert
 * OR GOOGLE_APPLICATION_CREDENTIALS ADC), same DRY-RUN-by-default discipline.
 * Idempotent: a doc whose orgIds already equals its claim-derived set is SKIPPED.
 * Rollback: unset orgIds on the docs this stamped (orgIds is derived, not authored).
 *
 * Usage:
 *   node scripts/backfill-user-orgids.mjs            # DRY-RUN (read-only)
 *   node scripts/backfill-user-orgids.mjs --apply    # real run
 *
 * Single-owner rule ([[feedback_single_owner_destructive_runs]]): inspect the
 * DRY-RUN report BEFORE --apply. Run at v11-05 phase close with the other backfills.
 */
import { initializeApp, cert, applicationDefault, getApps } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
import { getAuth } from "firebase-admin/auth"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

// ---------- .env.local loader (mirror backfill-orgid-v11.mjs) ----------
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

// Lockstep with getOrgIdsFromClaims (src/lib/org/membership.ts).
function orgIdsFromClaims(claims) {
    const raw = claims?.orgIds
    if (Array.isArray(raw)) {
        const ids = raw.filter((v) => typeof v === "string" && v.length > 0)
        if (ids.length > 0) return ids
    }
    return [DEFAULT_ORG_ID]
}

function orgIdsEqual(a, b) {
    const sa = new Set(Array.isArray(a) ? a : [])
    const sb = new Set(b)
    if (sa.size !== sb.size) return false
    for (const v of sa) if (!sb.has(v)) return false
    return true
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

async function main() {
    const db = initFirestore()
    const auth = getAuth()
    process.stderr.write(`# backfill-user-orgids.mjs — mode=${APPLY ? "APPLY" : "DRY-RUN"}\n`)
    process.stderr.write(`# project=${PROJECT_ID}\n# started=${new Date().toISOString()}\n\n`)

    const snap = await db.collection("users").get()
    const report = { scanned: snap.size, alreadyStamped: 0, wouldStamp: 0, stamped: 0, errors: 0 }
    const candidates = []

    for (const doc of snap.docs) {
        let claims
        try {
            const user = await auth.getUser(doc.id)
            claims = user.customClaims
        } catch {
            report.errors += 1
            process.stderr.write(`  ! ${doc.id}: auth lookup failed — defaulting to ['${DEFAULT_ORG_ID}']\n`)
        }
        const target = orgIdsFromClaims(claims)
        const current = doc.data().orgIds
        if (orgIdsEqual(current, target)) {
            report.alreadyStamped += 1
        } else {
            candidates.push({ id: doc.id, target })
        }
    }

    if (!APPLY) {
        report.wouldStamp = candidates.length
        for (const c of candidates) {
            process.stderr.write(`  would stamp ${c.id} → [${c.target.join(",")}]\n`)
        }
    } else {
        for (const c of candidates) {
            await db.collection("users").doc(c.id).set({ orgIds: c.target }, { merge: true })
            report.stamped += 1
            process.stderr.write(`  stamped ${c.id} → [${c.target.join(",")}]\n`)
        }
    }

    const summary = {
        mode: APPLY ? "apply" : "dry-run",
        projectId: PROJECT_ID,
        startedAt: new Date().toISOString(),
        report,
    }
    process.stderr.write(`\n=== Summary (${summary.mode}) ===\n`)
    process.stdout.write(JSON.stringify({ summary }, null, 2) + "\n")
}

main().catch((err) => {
    process.stderr.write(`\n!! FATAL: ${err.stack || err.message}\n`)
    process.exit(1)
})
