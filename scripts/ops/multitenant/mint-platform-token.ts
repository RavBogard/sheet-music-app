/**
 * Multi-tenant phase 4 — mint a platform bearer (`crl_plat_…`, kind
 * "platform") for /api/platform/mcp, for a uid listed in platform/owners.
 * The same thing POST /api/platform/tokens does from the console, for when no
 * signed-in browser is at hand.
 *
 *   npx vite-node -c vitest.config.ts scripts/ops/multitenant/mint-platform-token.ts -- --uid <uid> [--label "Claude Code"] [--days 90]
 *
 * Prints the token ONCE (only its hash is stored). Revoke by setting
 * revokedAt on its mcpTokens doc, or DELETE /api/platform/tokens?id=….
 * Credentials: GOOGLE_APPLICATION_CREDENTIALS (temp ADC) or FIRESTORE_EMULATOR_HOST.
 */
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

import { createPlatformToken } from "@/lib/mcp/tokens"
import { readOwners } from "@/lib/org/claims"

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "crcmusiccharts"
const args = process.argv.slice(2).filter((a) => a !== "--")
const arg = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined)
const uid = arg("--uid")
const label = arg("--label") ?? "Platform (Claude)"
const days = arg("--days") ? Number(arg("--days")) : null

if (!uid) {
    console.error("usage: --uid <platform owner uid> [--label <text>] [--days <n>]")
    process.exit(2)
}
if (days !== null && (!Number.isInteger(days) || days < 1 || days > 3650)) {
    console.error("--days is a whole number from 1 to 3650")
    process.exit(2)
}

if (!getApps().length)
    initializeApp(process.env.FIRESTORE_EMULATOR_HOST ? { projectId: PROJECT_ID } : { credential: applicationDefault(), projectId: PROJECT_ID })
const db = getFirestore()

const owners = await readOwners(db)
if (!owners.includes(uid)) {
    console.error(`refusing: ${uid} is not in platform/owners`)
    process.exit(1)
}
const { id, rawToken } = await createPlatformToken(uid, label, { db, expiresAtMs: days ? Date.now() + days * 86_400_000 : null })
await db.collection("platformAudit").add({
    actorUid: uid,
    actorEmail: null,
    via: "console",
    action: "mint_platform_token",
    orgId: null,
    before: null,
    after: { tokenId: id, label, via: "script" },
    at: new Date(),
})
console.log(`tokenId: ${id}`)
console.log(`token (shown once): ${rawToken}`)
