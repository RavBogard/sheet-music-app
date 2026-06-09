#!/usr/bin/env node
/**
 * v11-05-02 — fix David Lazaroff's orgIds custom claim to ['crc','brotherslazaroff'].
 *
 * David is a CRC band_leader AND runs Brothers Lazaroff. The v11-02-04 onboarding
 * MERGE set his orgIds claim to ['brotherslazaroff'] only — so once the v11-05-02
 * roster filter (where('orgIds','array-contains',org)) deploys, he would DROP OUT
 * of CRC's roster. Per Daniel's 2026-06-09 multi-org decision, his claim must be
 * ['crc','brotherslazaroff'] so he appears in BOTH rosters. After his next
 * sign-in, the sync-claims route mirrors this onto users/{uid}.orgIds.
 *
 * Sets the claim by MERGE (preserves role + any other claims). DRY-RUN by default.
 *
 * Target resolution (in order): --uid=<uid> | DAVID_UID env | --email=<e> | DAVID_EMAIL env.
 * Auth path mirrors backfill-orgid-v11.mjs (.env.local SA cert OR ADC).
 *
 * Usage:
 *   node scripts/fix-david-orgids-claim.mjs --email=david@example.com           # DRY-RUN
 *   node scripts/fix-david-orgids-claim.mjs --email=david@example.com --apply   # real run
 *   node scripts/fix-david-orgids-claim.mjs --uid=HTks9a8...           --apply
 */
import { initializeApp, cert, applicationDefault, getApps } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

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
const TARGET_ORGIDS = ["crc", "brotherslazaroff"]

function argVal(name) {
    const pfx = `--${name}=`
    const hit = process.argv.find((a) => a.startsWith(pfx))
    return hit ? hit.slice(pfx.length) : undefined
}

const targetUid = argVal("uid") || process.env.DAVID_UID
const targetEmail = argVal("email") || process.env.DAVID_EMAIL

function initAuth() {
    const email = process.env.FIREBASE_CLIENT_EMAIL
    const key = process.env.FIREBASE_PRIVATE_KEY
    if (getApps().length === 0) {
        if (email && key) {
            initializeApp({ credential: cert({ projectId: PROJECT_ID, clientEmail: email, privateKey: key }) })
        } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
            initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID })
        } else {
            throw new Error("No Admin credentials (see backfill-orgid-v11.mjs).")
        }
    }
    return getAuth()
}

async function main() {
    if (!targetUid && !targetEmail) {
        throw new Error("Provide --uid=<uid> / DAVID_UID, or --email=<email> / DAVID_EMAIL.")
    }
    const auth = initAuth()
    const user = targetUid
        ? await auth.getUser(targetUid)
        : await auth.getUserByEmail(targetEmail)

    const before = user.customClaims ?? {}
    const after = { ...before, orgIds: TARGET_ORGIDS }

    process.stderr.write(`# fix-david-orgids-claim.mjs — mode=${APPLY ? "APPLY" : "DRY-RUN"}\n`)
    process.stderr.write(`# uid=${user.uid} email=${user.email ?? "(none)"}\n`)
    process.stderr.write(`# before.orgIds = ${JSON.stringify(before.orgIds ?? null)}\n`)
    process.stderr.write(`# after.orgIds  = ${JSON.stringify(after.orgIds)}  (role preserved: ${JSON.stringify(before.role ?? null)})\n`)

    if (APPLY) {
        await auth.setCustomUserClaims(user.uid, after)
        process.stderr.write(`\n=== APPLIED — David must re-auth (or hit /api/auth/sync-claims) to mirror onto users/${user.uid}.orgIds ===\n`)
    } else {
        process.stderr.write(`\n=== DRY-RUN — no write. Re-run with --apply to set the claim. ===\n`)
    }
    process.stdout.write(JSON.stringify({ uid: user.uid, before: before.orgIds ?? null, after: after.orgIds, applied: APPLY }, null, 2) + "\n")
}

main().catch((err) => {
    process.stderr.write(`\n!! FATAL: ${err.stack || err.message}\n`)
    process.exit(1)
})
