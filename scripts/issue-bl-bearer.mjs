#!/usr/bin/env node
/**
 * v11-02-04 — issue David Lazaroff's Brothers Lazaroff MCP bearer + orgIds claim.
 *
 * Mints a `mcpTokens` doc stamped `orgId="brotherslazaroff"` (so verifyBearer →
 * orgFrom resolves David into the BL tenant — org source of truth is the token
 * doc, per v11-02-01) and sets his Firebase Auth custom claim `orgIds:
 * ["brotherslazaroff"]` by MERGE (preserving his existing role:"band_leader").
 *
 * Doc shape mirrors createMcpToken (src/lib/mcp/tokens.ts) EXACTLY so the
 * deployed verifyBearer accepts it: { tokenHash: sha256hex(raw), uid, label,
 * orgId, createdAt, lastUsedAt:null, revokedAt:null }. Raw token = "crl_live_" +
 * 32 random bytes hex; persisted only as sha256. The raw token is printed ONCE
 * to stderr — store it now, it is not recoverable and is never committed.
 *
 * Auth: same firebase-CLI-token → temp-ADC path as backfill-token-orgid.mjs
 * (this box has no SA creds). DRY-RUN by default; --apply to write.
 *
 * David resolution (his EXISTING band_leader account — Daniel decision 2026-06-08):
 *   1. DAVID_UID env → use verbatim.
 *   2. DAVID_EMAIL env → auth.getUserByEmail.
 *   3. else scan users where role=="band_leader" + email/displayName ~ /lazaroff/i,
 *      excluding crcmusic@centralreform.org. Require EXACTLY ONE match or abort.
 *
 * Usage:
 *   node scripts/issue-bl-bearer.mjs            # DRY-RUN (resolve + plan, no writes)
 *   node scripts/issue-bl-bearer.mjs --apply    # mint bearer + set claim
 *   DAVID_EMAIL=david@... node scripts/issue-bl-bearer.mjs   # pin the account
 */
import { initializeApp, cert, applicationDefault, getApps } from "firebase-admin/app"
import { getFirestore, FieldValue } from "firebase-admin/firestore"
import { getAuth } from "firebase-admin/auth"
import { randomBytes, createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

// ---------- .env.local loader (mirror backfill-token-orgid.mjs) ----------
const __dirname = dirname(fileURLToPath(import.meta.url))
const ENV_PATH = join(__dirname, "..", ".env.local")
{
    let envText
    try {
        envText = readFileSync(ENV_PATH, "utf8")
    } catch (err) {
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
const BL_ORG = "brotherslazaroff"
const COLLECTION = "mcpTokens"
const TOKEN_PREFIX = "crl_live_"
const DANIEL_EMAIL = "crcmusic@centralreform.org"

function initAdmin() {
    const email = process.env.FIREBASE_CLIENT_EMAIL
    const key = process.env.FIREBASE_PRIVATE_KEY
    if (getApps().length === 0) {
        if (email && key) {
            initializeApp({ credential: cert({ projectId: PROJECT_ID, clientEmail: email, privateKey: key }) })
        } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
            initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID })
        } else {
            throw new Error(
                "No Admin credentials. Set GOOGLE_APPLICATION_CREDENTIALS to an authorized_user/service-account JSON " +
                    "(firebase-CLI-token → temp ADC for this box — see backfill-token-orgid.mjs runbook).",
            )
        }
    }
}

const generateRawToken = () => TOKEN_PREFIX + randomBytes(32).toString("hex")
const hashToken = (raw) => createHash("sha256").update(raw).digest("hex")

async function resolveDavid(db, auth) {
    if (process.env.DAVID_UID) {
        const u = await auth.getUser(process.env.DAVID_UID)
        return { uid: u.uid, email: u.email ?? null, displayName: u.displayName ?? null, customClaims: u.customClaims ?? {} }
    }
    if (process.env.DAVID_EMAIL) {
        const u = await auth.getUserByEmail(process.env.DAVID_EMAIL)
        return { uid: u.uid, email: u.email ?? null, displayName: u.displayName ?? null, customClaims: u.customClaims ?? {} }
    }
    // Scan users for a band_leader whose email/displayName looks like Lazaroff.
    const snap = await db.collection("users").where("role", "==", "band_leader").get()
    const matches = []
    for (const d of snap.docs) {
        const data = d.data() ?? {}
        const email = typeof data.email === "string" ? data.email : ""
        const name = typeof data.displayName === "string" ? data.displayName : (typeof data.name === "string" ? data.name : "")
        if (email.toLowerCase() === DANIEL_EMAIL) continue
        if (/lazaroff/i.test(email) || /lazaroff|david/i.test(name)) {
            matches.push({ uid: d.id, email: email || null, displayName: name || null })
        }
    }
    if (matches.length !== 1) {
        process.stderr.write(`\n!! David resolution found ${matches.length} candidate(s):\n`)
        for (const m of matches) process.stderr.write(`   - uid=${m.uid} email=${m.email} name=${m.displayName}\n`)
        process.stderr.write(`   Pin the account with DAVID_UID=... or DAVID_EMAIL=... and re-run.\n`)
        throw new Error(`Expected exactly 1 David match, got ${matches.length}`)
    }
    const u = await auth.getUser(matches[0].uid)
    return { uid: u.uid, email: u.email ?? matches[0].email, displayName: u.displayName ?? matches[0].displayName, customClaims: u.customClaims ?? {} }
}

async function main() {
    initAdmin()
    const db = getFirestore()
    const auth = getAuth()

    process.stderr.write(`# issue-bl-bearer.mjs — mode=${APPLY ? "APPLY" : "DRY-RUN"} project=${PROJECT_ID}\n`)

    const david = await resolveDavid(db, auth)
    process.stderr.write(`\n# Resolved David:\n`)
    process.stderr.write(`   uid=${david.uid}\n   email=${david.email}\n   displayName=${david.displayName}\n`)
    process.stderr.write(`   currentClaims=${JSON.stringify(david.customClaims)}\n`)

    // Existing active BL bearers (idempotency — don't proliferate).
    const existing = await db.collection(COLLECTION)
        .where("uid", "==", david.uid)
        .where("orgId", "==", BL_ORG)
        .get()
    const activeBL = existing.docs.filter((d) => !d.data()?.revokedAt)
    process.stderr.write(`\n# Existing active BL bearers for David: ${activeBL.length}\n`)

    const plannedClaims = { ...david.customClaims, orgIds: [BL_ORG] }
    process.stderr.write(`# Planned claims (MERGE — role preserved): ${JSON.stringify(plannedClaims)}\n`)

    const report = {
        mode: APPLY ? "apply" : "dry-run",
        uid: david.uid,
        email: david.email,
        existingActiveBLBearers: activeBL.length,
        mintedTokenId: null,
        claimSet: false,
        rolePreserved: david.customClaims?.role ?? null,
    }

    if (!APPLY) {
        report.wouldMintBearer = activeBL.length === 0
        report.wouldSetClaim = true
        process.stdout.write(JSON.stringify({ summary: report }, null, 2) + "\n")
        process.stderr.write(`\n(DRY-RUN — no writes. Inspect, then re-run with --apply.)\n`)
        return
    }

    // 1) Mint the BL bearer (skip if an active one already exists).
    if (activeBL.length === 0) {
        const raw = generateRawToken()
        const ref = await db.collection(COLLECTION).add({
            tokenHash: hashToken(raw),
            uid: david.uid,
            label: "Brothers Lazaroff (David)",
            orgId: BL_ORG,
            createdAt: FieldValue.serverTimestamp(),
            lastUsedAt: null,
            revokedAt: null,
        })
        report.mintedTokenId = ref.id
        process.stderr.write(`\n${"=".repeat(64)}\n`)
        process.stderr.write(`  RAW BEARER (store NOW — not recoverable, never committed):\n`)
        process.stderr.write(`  ${raw}\n`)
        process.stderr.write(`${"=".repeat(64)}\n`)
    } else {
        process.stderr.write(`\n(skip mint — David already has ${activeBL.length} active BL bearer(s); set DAVID_FORCE_MINT to override is NOT implemented — revoke first if you must rotate.)\n`)
    }

    // 2) Set the orgIds claim by MERGE (preserve role).
    await auth.setCustomUserClaims(david.uid, plannedClaims)
    report.claimSet = true

    // Read-back verification.
    const after = await auth.getUser(david.uid)
    report.verifiedClaims = after.customClaims ?? {}
    process.stdout.write(JSON.stringify({ summary: report }, null, 2) + "\n")
}

main().catch((err) => {
    process.stderr.write(`\n!! FATAL: ${err.stack || err.message}\n`)
    process.exit(1)
})
