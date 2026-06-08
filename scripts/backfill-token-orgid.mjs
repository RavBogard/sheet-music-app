#!/usr/bin/env node
/**
 * v11-02-01 — one-time MCP-token tenant backfill (prod runner).
 *
 * Stamps `orgId="crc"` on every EXISTING `mcpTokens` doc missing it, so the
 * caller-org resolution path (verifyBearer → orgFrom) is explicit, not just
 * default-derived. Paired with v11-02-01's mint-site stamping (orgId on NEW
 * tokens), this leaves zero unstamped bearers in prod.
 *
 * Sibling of `scripts/backfill-orgid-v11.mjs` — same two-path auth, same
 * DRY-RUN-by-default discipline, same .env.local loader. The canonical stamping
 * rules are emulator-tested in
 * `src/lib/mcp/__tests__/backfill-token-orgid.emulator.test.ts`; this runner
 * mirrors them for the prod population.
 *
 * **Stamping rule.** A doc is a candidate iff its `orgId` is absent or empty.
 * Candidates are stamped via `set({ orgId:'crc' }, { merge:true })` so ONLY
 * orgId is touched (tokenHash / lastUsedAt / revokedAt untouched). A doc with a
 * non-empty orgId is SKIPPED — a David/brotherslazaroff bearer would be left be.
 *
 * **Behavior.** DRY-RUN by default (no writes). `--apply` required for a real
 * run. Idempotent — re-running after `--apply` reports zero `wouldStamp`.
 *
 * **Output.** Trace to stderr; a JSON report to stdout:
 *   { summary: { mode, projectId, scanned, alreadyStamped, wouldStamp|stamped } }
 *
 * ── RUNBOOK (this box has no SA creds — see STATE.md Blockers/Concerns) ───────
 * This machine has NO Firebase Admin SA in .env.local and no gcloud. To run:
 *   1. Convert the firebase CLI login refresh token into a temp authorized_user
 *      ADC json (public firebase-tools OAuth client_id/secret) and point
 *      GOOGLE_APPLICATION_CREDENTIALS at it (the v11-01-03 convention).
 *   2. DRY-RUN first:  node scripts/backfill-token-orgid.mjs
 *      INSPECT the report — `scanned` should equal the live token count.
 *   3. Real run:        node scripts/backfill-token-orgid.mjs --apply
 *   4. Confirm:         node scripts/backfill-token-orgid.mjs   → wouldStamp:0
 *   5. Delete the temp ADC json.
 * Single-owner rule ([[feedback_single_owner_destructive_runs]]): inspect the
 * DRY-RUN report BEFORE `--apply`.
 *
 * Usage:
 *   node scripts/backfill-token-orgid.mjs            # DRY-RUN (read-only)
 *   node scripts/backfill-token-orgid.mjs --apply    # real run
 */
import { initializeApp, cert, applicationDefault, getApps } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
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
        // .env.local is optional when GOOGLE_APPLICATION_CREDENTIALS is set.
        process.stderr.write(`(note) no ${ENV_PATH}: ${err.message}\n`)
        envText = ""
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

const DEFAULT_ORG_ID = "crc"
const COLLECTION = "mcpTokens"
const WRITE_BATCH_MAX = 400

// ---------- Firebase admin init (mirror backfill-orgid-v11.mjs) ----------
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
                    "OR set GOOGLE_APPLICATION_CREDENTIALS to an authorized_user/service-account JSON " +
                    "(see the RUNBOOK header — firebase-CLI-token → temp ADC for this box).",
            )
        }
    }
    return getFirestore()
}

function needsStamp(data) {
    const v = data?.orgId
    return !(typeof v === "string" && v.trim().length > 0)
}

async function main() {
    const db = initFirestore()

    process.stderr.write(`# backfill-token-orgid.mjs — mode=${APPLY ? "APPLY" : "DRY-RUN"}\n`)
    process.stderr.write(`# project=${PROJECT_ID}\n`)
    process.stderr.write(`# started=${new Date().toISOString()}\n\n`)

    const snap = await db.collection(COLLECTION).get()
    const report = { scanned: snap.size, alreadyStamped: 0, wouldStamp: 0, stamped: 0 }
    const candidates = []
    for (const doc of snap.docs) {
        if (needsStamp(doc.data())) candidates.push(doc.id)
        else report.alreadyStamped += 1
    }

    if (!APPLY) {
        report.wouldStamp = candidates.length
        process.stderr.write(
            `  mcpTokens: scanned=${report.scanned} alreadyStamped=${report.alreadyStamped} wouldStamp=${report.wouldStamp}\n`,
        )
    } else {
        for (let i = 0; i < candidates.length; i += WRITE_BATCH_MAX) {
            const slice = candidates.slice(i, i + WRITE_BATCH_MAX)
            const batch = db.batch()
            for (const id of slice) {
                batch.set(db.collection(COLLECTION).doc(id), { orgId: DEFAULT_ORG_ID }, { merge: true })
            }
            await batch.commit()
            report.stamped += slice.length
        }
        process.stderr.write(
            `  mcpTokens: scanned=${report.scanned} alreadyStamped=${report.alreadyStamped} stamped=${report.stamped}\n`,
        )
    }

    const summary = {
        mode: APPLY ? "apply" : "dry-run",
        startedAt: new Date().toISOString(),
        projectId: PROJECT_ID,
        ...report,
    }
    process.stderr.write(`\n=== Summary (${summary.mode}) ===\n`)
    process.stdout.write(JSON.stringify({ summary }, null, 2) + "\n")
}

main().catch((err) => {
    process.stderr.write(`\n!! FATAL: ${err.stack || err.message}\n`)
    process.exit(1)
})
