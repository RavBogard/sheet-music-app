#!/usr/bin/env node
/**
 * v11-06-03 — mint a THROWAWAY Brothers Lazaroff MCP bearer for the close-gate
 * live isolation probe, then revoke it.
 *
 * Mints ONLY an `mcpTokens` doc stamped `orgId="brotherslazaroff"`, tied to
 * David's REAL band_leader uid (so the deployed verifyBearer → orgFrom resolves
 * the BL tenant AND the authoring-surface reads pass role gates). The raw token
 * is printed ONCE to stderr; the minted tokenId is printed to stdout so the
 * caller can revoke it after the probe.
 *
 * CRITICAL DIFFERENCE vs scripts/issue-bl-bearer.mjs: this script NEVER calls
 * setCustomUserClaims. issue-bl-bearer overwrites orgIds → ['brotherslazaroff'],
 * which would DROP David's existing 'crc' membership. A probe bearer must not
 * mutate David's auth claim — the bearer token doc's orgId is the only thing the
 * MCP org seam (orgFrom) needs.
 *
 * Auth: same firebase-CLI-token → temp-ADC path as issue-bl-bearer.mjs (this box
 * has no SA creds). DRY-RUN by default.
 *
 * Usage:
 *   node scripts/mint-throwaway-bl-bearer.mjs               # DRY-RUN (resolve + plan)
 *   node scripts/mint-throwaway-bl-bearer.mjs --apply       # mint; raw→stderr, tokenId→stdout
 *   node scripts/mint-throwaway-bl-bearer.mjs --revoke <id> # set revokedAt on that token doc
 *   DAVID_UID=... node scripts/mint-throwaway-bl-bearer.mjs --apply
 */
import { initializeApp, cert, applicationDefault, getApps } from "firebase-admin/app"
import { getFirestore, FieldValue } from "firebase-admin/firestore"
import { getAuth } from "firebase-admin/auth"
import { randomBytes, createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

// ---------- .env.local loader (mirror issue-bl-bearer.mjs) ----------
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
const REVOKE_IDX = process.argv.indexOf("--revoke")
const REVOKE_ID = REVOKE_IDX >= 0 ? process.argv[REVOKE_IDX + 1] : null
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
        return { uid: u.uid, email: u.email ?? null, displayName: u.displayName ?? null }
    }
    if (process.env.DAVID_EMAIL) {
        const u = await auth.getUserByEmail(process.env.DAVID_EMAIL)
        return { uid: u.uid, email: u.email ?? null, displayName: u.displayName ?? null }
    }
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
    return { uid: u.uid, email: u.email ?? matches[0].email, displayName: u.displayName ?? matches[0].displayName }
}

async function main() {
    initAdmin()
    const db = getFirestore()
    const auth = getAuth()

    // ---- REVOKE mode ----
    if (REVOKE_ID) {
        const ref = db.collection(COLLECTION).doc(REVOKE_ID)
        const snap = await ref.get()
        if (!snap.exists) {
            process.stderr.write(`(revoke) token ${REVOKE_ID} not found — nothing to do.\n`)
            process.stdout.write(JSON.stringify({ revoked: false, tokenId: REVOKE_ID, reason: "not_found" }) + "\n")
            return
        }
        await ref.update({ revokedAt: FieldValue.serverTimestamp() })
        process.stderr.write(`(revoke) token ${REVOKE_ID} revokedAt set.\n`)
        process.stdout.write(JSON.stringify({ revoked: true, tokenId: REVOKE_ID }) + "\n")
        return
    }

    process.stderr.write(`# mint-throwaway-bl-bearer.mjs — mode=${APPLY ? "APPLY" : "DRY-RUN"} project=${PROJECT_ID}\n`)
    const david = await resolveDavid(db, auth)
    process.stderr.write(`# Resolved David: uid=${david.uid} email=${david.email} name=${david.displayName}\n`)
    process.stderr.write(`# NO claim write — David's auth custom claim is left untouched.\n`)

    if (!APPLY) {
        process.stdout.write(JSON.stringify({ summary: { mode: "dry-run", uid: david.uid, wouldMint: true, wouldWriteClaim: false } }, null, 2) + "\n")
        process.stderr.write(`\n(DRY-RUN — no writes. Re-run with --apply.)\n`)
        return
    }

    const raw = generateRawToken()
    const ref = await db.collection(COLLECTION).add({
        tokenHash: hashToken(raw),
        uid: david.uid,
        label: "v11-06-03 throwaway probe (safe to revoke)",
        orgId: BL_ORG,
        createdAt: FieldValue.serverTimestamp(),
        lastUsedAt: null,
        revokedAt: null,
    })
    process.stderr.write(`\n${"=".repeat(64)}\n  RAW THROWAWAY BEARER (stderr only, never committed):\n  ${raw}\n${"=".repeat(64)}\n`)
    // tokenId to stdout so the caller can revoke after the probe.
    process.stdout.write(JSON.stringify({ minted: true, tokenId: ref.id, uid: david.uid, orgId: BL_ORG }) + "\n")
}

main().catch((err) => {
    process.stderr.write(`\n!! FATAL: ${err.stack || err.message}\n`)
    process.exit(1)
})
