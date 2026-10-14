/**
 * Delete a tenant completely — the undo for `create_tenant`.
 *
 * Phase 9's gate is "create a throwaway tenant end to end, then delete it and
 * confirm each piece is gone". Creating one is a single platform tool;
 * deleting one was nothing at all. The console and the platform MCP surface
 * can suspend a tenant, and `remove_tenant_domain` refuses a default
 * `.vercel.app` address outright ("vercel.app names are default addresses,
 * not custom domains") — so a tenant created through the supported path could
 * not be removed through any path. This script is that missing half, written
 * as a tool rather than as the one-off the gate needed.
 *
 * It removes, in this order (most reversible first, so a failure part-way
 * leaves the tenant unreachable rather than half-wired):
 *
 *   1. the Vercel alias            — the address stops resolving
 *   2. the Firebase authorized domain
 *   3. memberships + their Auth users and user docs, and MCP tokens
 *   4. the tenant's own documents  — setlists, tracks, songs, collections, …
 *   5. `orgs/{id}`                 — the registry entry; after this the
 *                                    address list no longer names it
 *
 * It does NOT delete `auditLogs` or `platformAudit` rows. Those are the
 * record of what was done and by whom; a delete tool that erases its own
 * trail is worse than no tool.
 *
 * REFUSES to touch crc or brotherslazaroff, and refuses any tenant with
 * charts in Storage unless `--with-charts` is passed — chart bytes are the
 * one thing here that cannot be rebuilt from anything else.
 *
 * Dry run by default. Usage:
 *   npx vite-node -c vitest.config.ts scripts/ops/multitenant/delete-tenant.ts -- --org p9probe
 *   npx vite-node -c vitest.config.ts scripts/ops/multitenant/delete-tenant.ts -- --org p9probe --apply
 *
 * Credentials: GOOGLE_APPLICATION_CREDENTIALS for Firestore/Auth,
 * VERCEL_API_TOKEN + VERCEL_PROJECT_ID (from .env.local) for the alias.
 */
import { readFileSync } from "node:fs"
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app"
import { getAuth, getFirestore } from "@/lib/firebase-admin"

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "crcmusiccharts"
const PROTECTED = new Set(["crc", "brotherslazaroff"])
const DEFAULT_TEAM_ID = "team_AyFDvnGV3IHjAY32PlW1tltN"
const DEFAULT_PROJECT_NAME = "sheet-music-app"

/** The project the tenant addresses hang off, by name. */
async function findProjectId(token: string, team: string | undefined): Promise<string | null> {
    const res = await fetch(`https://api.vercel.com/v9/projects?limit=100${team ? `&teamId=${encodeURIComponent(team)}` : ""}`, {
        headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return null
    const body = (await res.json()) as { projects?: Array<{ id: string; name: string }> }
    return body.projects?.find((p) => p.name === (process.env.VERCEL_PROJECT_NAME ?? DEFAULT_PROJECT_NAME))?.id ?? null
}

/** Collections holding tenant-owned documents, and how the tenant is written. */
const BY_FIELD = [
    "setlists",
    "tracks",
    "songs",
    "songUsage",
    "recordings",
    "contacts",
    "templates",
    "setlistTemplates",
    "library_index",
    "bond_flags",
    "proposal_stages",
    "tasks",
    "live_sessions",
    "scheduling_assignments",
    "musician_availability",
    "scheduling_history",
] as const
const BY_OWNER = ["collections"] as const
const BY_TENANT = ["memberships"] as const
/** Document ids of the shape `<base>__<tenant>`. */
const BY_ID_SUFFIX = ["config"] as const

function argOf(flag: string): string | undefined {
    const i = process.argv.indexOf(flag)
    return i >= 0 ? process.argv[i + 1] : undefined
}

function envLocal(key: string): string | undefined {
    if (process.env[key]) return process.env[key]
    try {
        const text = readFileSync(new URL("../../../.env.local", import.meta.url), "utf8")
        const line = text.split("\n").find((l) => l.startsWith(`${key}=`))
        return line?.slice(key.length + 1).trim().replace(/^"|"$/g, "")
    } catch {
        return undefined
    }
}

interface Plan {
    orgId: string
    address: string | null
    docs: Array<{ collection: string; ids: string[] }>
    members: string[]
    tokens: string[]
    chartCount: number
}

async function buildPlan(orgId: string): Promise<Plan> {
    const db = getFirestore()
    const org = await db.collection("orgs").doc(orgId).get()
    const address = (org.data()?.domains?.primary as string | undefined) ?? null
    const docs: Plan["docs"] = []

    const collect = async (collection: string, field: string) => {
        const snap = await db.collection(collection).where(field, "==", orgId).get()
        if (!snap.empty) docs.push({ collection, ids: snap.docs.map((d) => d.id) })
    }
    for (const c of BY_FIELD) await collect(c, "orgId")
    for (const c of BY_OWNER) await collect(c, "ownerOrgId")
    for (const c of BY_TENANT) await collect(c, "tenantId")
    for (const c of BY_ID_SUFFIX) {
        const ids = (await db.collection(c).listDocuments())
            .map((d) => d.id)
            .filter((id) => id.endsWith(`__${orgId}`))
        if (ids.length) docs.push({ collection: c, ids })
    }

    const members = (await db.collection("memberships").where("tenantId", "==", orgId).get()).docs.map(
        (d) => d.data().uid as string,
    )
    const tokens = (await db.collection("mcpTokens").where("orgId", "==", orgId).get()).docs.map((d) => d.id)
    const chartCount = docs.find((d) => d.collection === "library_index")?.ids.length ?? 0

    return { orgId, address, docs, members, tokens, chartCount }
}

async function removeAlias(address: string): Promise<string> {
    const token = envLocal("VERCEL_API_TOKEN")
    if (!token) return "skipped: VERCEL_API_TOKEN not set"
    const team = envLocal("VERCEL_TEAM_ID") ?? DEFAULT_TEAM_ID
    // The project id is only in Vercel's own environment, not in .env.local,
    // so look it up by name rather than making the caller supply it.
    const project = envLocal("VERCEL_PROJECT_ID") ?? (await findProjectId(token, team))
    if (!project) return "skipped: could not resolve the Vercel project"
    const url = `https://api.vercel.com/v9/projects/${encodeURIComponent(project)}/domains/${encodeURIComponent(address)}${team ? `?teamId=${encodeURIComponent(team)}` : ""}`
    const res = await fetch(url, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } })
    if (res.status === 404) return "already gone"
    if (!res.ok) return `failed: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`
    return "removed"
}

async function removeAuthorizedDomain(address: string): Promise<string> {
    const { changeAuthorizedDomains } = await import("@/lib/platform/auth-domains")
    try {
        const r = await changeAuthorizedDomains({ remove: [address] })
        return r.changed ? "removed" : "already gone"
    } catch (e) {
        return `failed: ${(e as Error).message}`
    }
}

async function main() {
    if (!getApps().length) initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID })
    const orgId = argOf("--org")
    if (!orgId) throw new Error("pass --org <tenantId>")
    if (PROTECTED.has(orgId)) throw new Error(`${orgId} is a live tenant and is never deleted from here`)
    const apply = process.argv.includes("--apply")

    const plan = await buildPlan(orgId)
    const totalDocs = plan.docs.reduce((n, d) => n + d.ids.length, 0)
    process.stdout.write(
        JSON.stringify(
            {
                mode: apply ? "APPLY" : "dry-run",
                orgId,
                address: plan.address,
                documents: plan.docs.map((d) => `${d.collection}: ${d.ids.length}`),
                totalDocs,
                members: plan.members.length,
                tokens: plan.tokens.length,
                charts: plan.chartCount,
            },
            null,
            2,
        ) + "\n",
    )

    if (plan.chartCount > 0 && !process.argv.includes("--with-charts")) {
        throw new Error(
            `${orgId} owns ${plan.chartCount} library rows. Chart bytes are the one thing here that cannot be rebuilt — pass --with-charts if you mean it.`,
        )
    }
    if (!apply) {
        process.stdout.write("(dry run — nothing written. Re-run with --apply.)\n")
        return
    }

    const db = getFirestore()
    const auth = getAuth()
    const result: Record<string, unknown> = {}

    if (plan.address) {
        result.vercelAlias = await removeAlias(plan.address)
        result.authorizedDomain = await removeAuthorizedDomain(plan.address)
    }

    for (const uid of plan.members) {
        try {
            await auth.deleteUser(uid)
        } catch {
            /* already gone, or a real person who belongs elsewhere too */
        }
        await db.collection("users").doc(uid).delete().catch(() => undefined)
        await db.collection("mcpTestUsers").doc(uid).delete().catch(() => undefined)
    }
    result.members = plan.members.length

    const deleteAll = async (collection: string, ids: string[]) => {
        for (let i = 0; i < ids.length; i += 400) {
            const batch = db.batch()
            for (const id of ids.slice(i, i + 400)) batch.delete(db.collection(collection).doc(id))
            await batch.commit()
        }
    }
    for (const id of plan.tokens) await db.collection("mcpTokens").doc(id).delete()
    result.tokens = plan.tokens.length
    for (const d of plan.docs) await deleteAll(d.collection, d.ids)
    result.documents = totalDocs

    await db.collection("orgs").doc(orgId).delete()
    result.orgsDoc = "deleted"

    process.stdout.write(JSON.stringify({ deleted: result }, null, 2) + "\n")
}

main().catch((err) => {
    process.stderr.write(`\n!! ${(err as Error).message}\n`)
    process.exit(1)
})
