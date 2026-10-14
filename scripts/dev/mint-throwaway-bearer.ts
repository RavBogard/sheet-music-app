/**
 * Multi-tenant phase 9 — mint and clean up THROWAWAY probe identities, for any
 * tenant in the registry.
 *
 * This replaces `scripts/mint-throwaway-bl-bearer.mjs`, which could only mint a
 * Brothers Lazaroff bearer and did it by borrowing David's real uid. A probe
 * that borrows a real account cannot tell "the tenant seam holds" from "David
 * happens to be a member of both tenants", and it leaves a real person's claims
 * one bug away from being rewritten. Every identity minted here is new, owns
 * nothing until the probe creates something, and is deleted afterwards.
 *
 * A tenant persona comes from `POST <tenant address>/api/auth/admin-test-session`
 * — the secret-gated harness endpoint, called AT the tenant's own address so the
 * proxy's `x-org-id` decides the tenant. Three reasons to go through the
 * deployed endpoint rather than mint locally:
 *
 *   - it is the audited path (`adminTestSessionAudit` row, TTL, sweepable
 *     `test-` uid), so a probe run is visible to a later security review;
 *   - it returns a `customToken`, which the probe needs for the web-surface and
 *     deployed-rules legs. Signing one locally needs a service-account key;
 *     this box authenticates as a user, and that user has no
 *     `iam.serviceAccounts.signBlob`;
 *   - which tenant the persona lands in is then decided by the ADDRESS, so a
 *     mint that comes back stamped with the wrong tenant is itself a finding.
 *
 * The persona is a tenant ADMIN. For an isolation probe that is the right
 * adversary: if the strongest role inside tenant A still cannot touch tenant B,
 * no weaker one can.
 *
 * `--platform` mints a platform bearer (`crl_plat_…`) for /api/platform/mcp,
 * admin-side, since no HTTP path mints one without a browser ID token.
 *
 * Secrets go to `--out` — written owner-only (0600), and removed again when
 * `--cleanup` is passed the same `--out`; make the directory `mkdir -m 700`.
 * stdout carries only the identity, so a run can be logged without logging the
 * credential. `--cleanup` is the compensating action — run it even when the
 * probe fails.
 *
 * Usage:
 *   npx vite-node -c vitest.config.ts scripts/dev/mint-throwaway-bearer.ts -- \
 *       --org navatehila --out <dir>/navatehila.json
 *   npx vite-node -c vitest.config.ts scripts/dev/mint-throwaway-bearer.ts -- \
 *       --platform --out <dir>/platform.json
 *   npx vite-node -c vitest.config.ts scripts/dev/mint-throwaway-bearer.ts -- \
 *       --cleanup '<json array of identities>'
 *
 * Credentials: GOOGLE_APPLICATION_CREDENTIALS (authorized_user or service
 * account for the project) for the platform mint and for cleanup;
 * MCP_ADMIN_TEST_SESSION_SECRET (read from .env.local) for a tenant mint.
 */
import { writeFileSync, readFileSync, chmodSync, rmSync } from "node:fs"
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app"
import { getAuth, getFirestore } from "@/lib/firebase-admin"
import { createPlatformToken } from "@/lib/mcp/tokens"
import { setMembership } from "@/lib/org/memberships-write"
import { readOwners } from "@/lib/org/claims"
import type { OrgId } from "@/lib/org/types"

export interface MintedIdentity {
    kind: "tenant" | "platform"
    orgId: OrgId | null
    uid: string
    tokenId: string
    /** Where this persona was minted, and where the probe addresses it. */
    origin?: string
}

/** What the probe needs; written to --out, never to stdout. */
interface MintedSecrets extends MintedIdentity {
    bearer: string
    /** Exchangeable for an ID token: the web-surface and rules legs need one. */
    customToken?: string
}

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "crcmusiccharts"
const LABEL = "P9 throwaway probe (safe to revoke)"

function argOf(flag: string): string | undefined {
    const i = process.argv.indexOf(flag)
    return i >= 0 ? process.argv[i + 1] : undefined
}

function emit(minted: MintedSecrets, outPath: string | undefined): void {
    const { bearer, customToken, ...identity } = minted
    if (outPath) {
        // Owner-only, and refuse to overwrite silently: this file holds a live
        // bearer until `--cleanup` removes it.
        try {
            writeFileSync(outPath, JSON.stringify(minted, null, 2), { mode: 0o600, flag: "wx" })
        } catch (e) {
            if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e
            chmodSync(outPath, 0o600)
            writeFileSync(outPath, JSON.stringify(minted, null, 2), { mode: 0o600 })
        }
    } else {
        const rule = "=".repeat(64)
        process.stderr.write(`\n${rule}\n  RAW BEARER (stderr only):\n  ${bearer}\n${rule}\n`)
        if (customToken) process.stderr.write(`  (a custom token was minted too; pass --out to capture it)\n`)
    }
    process.stdout.write(JSON.stringify(identity) + "\n")
}

/** MCP_ADMIN_TEST_SESSION_SECRET, from the environment or .env.local. */
function adminTestSecret(): string {
    const fromEnv = process.env.MCP_ADMIN_TEST_SESSION_SECRET
    if (fromEnv) return fromEnv
    const text = readFileSync(new URL("../../.env.local", import.meta.url), "utf8")
    const line = text.split("\n").find((l) => l.startsWith("MCP_ADMIN_TEST_SESSION_SECRET="))
    const value = line?.slice("MCP_ADMIN_TEST_SESSION_SECRET=".length).trim().replace(/^"|"$/g, "")
    if (!value) throw new Error("MCP_ADMIN_TEST_SESSION_SECRET is not set and not in .env.local")
    return value
}

/** The address a tenant answers on, from the registry. */
async function originFor(orgId: OrgId): Promise<string> {
    const snap = await getFirestore().collection("orgs").doc(orgId).get()
    if (!snap.exists) throw new Error(`no tenant ${orgId} in orgs`)
    const primary = (snap.data()?.domains?.primary ?? "") as string
    if (!primary) throw new Error(`tenant ${orgId} has no primary address`)
    return `https://${primary.endsWith(".vercel.app") ? primary : `www.${primary.replace(/^www\./, "")}`}`
}

async function mintTenant(orgId: OrgId): Promise<MintedSecrets> {
    const origin = await originFor(orgId)
    const res = await fetch(`${origin}/api/auth/admin-test-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-test-secret": adminTestSecret() },
        body: JSON.stringify({ ttlSec: 3600 }),
    })
    const body = (await res.json()) as Record<string, unknown>
    if (!res.ok || body.ok !== true) {
        throw new Error(`admin-test-session at ${origin} refused: ${res.status} ${JSON.stringify(body).slice(0, 300)}`)
    }
    const uid = String(body.uid)
    // The address decided the tenant; confirm it landed where we asked before
    // the probe builds anything on top of this persona.
    const membership = await getFirestore().collection("memberships").doc(`${orgId}__${uid}`).get()
    if (!membership.exists) {
        throw new Error(`persona ${uid} minted at ${origin} has no membership in ${orgId} — the address resolved elsewhere`)
    }
    return {
        kind: "tenant",
        orgId,
        uid,
        tokenId: String(body.tokenId),
        origin,
        bearer: String(body.token),
        customToken: typeof body.customToken === "string" ? body.customToken : undefined,
    }
}

async function mintPlatform(): Promise<MintedSecrets> {
    const uid = (await readOwners(getFirestore()))[0]
    if (!uid) throw new Error("platform/owners has no uid — cannot mint a platform bearer")
    const { id, rawToken } = await createPlatformToken(uid, LABEL)
    return { kind: "platform", orgId: null, uid, tokenId: id, bearer: rawToken }
}

/**
 * Undo a mint. Nothing is revoked by halves: the token doc, the membership
 * (which rebuilds claims), the index rows and the Auth user all go. A missing
 * piece is reported rather than thrown, so one stale entry cannot block the
 * rest of the sweep.
 */
async function cleanup(identities: MintedIdentity[]): Promise<Record<string, string>[]> {
    const db = getFirestore()
    const auth = getAuth()
    const out: Record<string, string>[] = []
    for (const id of identities) {
        const row: Record<string, string> = { uid: id.uid, tokenId: id.tokenId }
        const step = async (name: string, fn: () => Promise<unknown>) => {
            try {
                await fn()
                row[name] = "deleted"
            } catch (e) {
                row[name] = `failed: ${(e as Error).message}`
            }
        }
        await step("token", () => db.collection("mcpTokens").doc(id.tokenId).delete())
        if (id.kind !== "tenant") {
            out.push(row)
            continue
        }
        if (id.orgId) {
            await step("membership", () =>
                setMembership({ orgId: id.orgId as OrgId, uid: id.uid, role: null, actorUid: id.uid, reason: "remove" }),
            )
        }
        await step("userDoc", () => db.collection("users").doc(id.uid).delete())
        await step("testIndex", () => db.collection("mcpTestUsers").doc(id.uid).delete())
        await step("authUser", () => auth.deleteUser(id.uid))
        out.push(row)
    }
    return out
}

async function main() {
    if (!getApps().length) initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID })

    const cleanupArg = argOf("--cleanup")
    if (cleanupArg !== undefined) {
        const parsed = JSON.parse(cleanupArg) as MintedIdentity[] | MintedIdentity
        const rows = await cleanup(Array.isArray(parsed) ? parsed : [parsed])
        // The credential file outlives the credential otherwise.
        const secretsFile = argOf("--out")
        if (secretsFile) {
            rmSync(secretsFile, { force: true })
            rows.push({ secretsFile: "deleted" })
        }
        process.stdout.write(JSON.stringify({ cleaned: rows }, null, 2) + "\n")
        return
    }

    const out = argOf("--out")
    if (process.argv.includes("--platform")) {
        emit(await mintPlatform(), out)
        return
    }

    const orgId = argOf("--org") as OrgId | undefined
    if (!orgId) throw new Error("pass --org <tenantId>, --platform, or --cleanup <json>")
    emit(await mintTenant(orgId), out)
}

main().catch((err) => {
    process.stderr.write(`\n!! FATAL: ${(err as Error).stack || (err as Error).message}\n`)
    process.exit(1)
})
