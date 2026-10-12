/**
 * Multi-tenant phase 3 — tenant addresses from the command line (the lead's
 * gate tool). Same library the platform routes and (phase 4) the console and
 * platform MCP call: src/lib/platform/tenant-address.ts.
 *
 *   npx vite-node -c vitest.config.ts scripts/ops/multitenant/tenant-address.ts -- <command> [--apply]
 *
 * Commands (dry run unless --apply; a dry run only reads):
 *   provision <orgId> <slug>          attach <slug>.vercel.app (or the next free name), authorize it, record it
 *   add-domain <orgId> <domain>       attach bare + www (bare 308 → www), authorize both, print DNS steps
 *   check-domain <orgId> <domain>     verify + DNS check; records waiting_for_dns | verified | live
 *   remove-domain <orgId> <domain>    detach bare + www, deauthorize, restore the vercel.app primary
 *   --throwaway-tenant <id>           create a minimal ACTIVE orgs/<id> (marked throwaway: true)
 *   --remove-throwaway <id>           detach every address of orgs/<id>, deauthorize them, delete the doc
 *                                     (refuses unless the doc is marked throwaway: true)
 *
 * Manifest before write: every --apply first writes the org document's exact
 * previous state and the planned operation to MANIFEST_DIR
 * (default docs/planning/2026-10-12-multitenant/manifests).
 *
 * Credentials: GOOGLE_APPLICATION_CREDENTIALS (Firestore + the Identity
 * Toolkit token) or FIRESTORE_EMULATOR_HOST; VERCEL_API_TOKEN,
 * VERCEL_PROJECT_ID, VERCEL_TEAM_ID from the environment.
 */
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { OrgConfigSchema } from "@/lib/org/config-schema"
import { createVercelClient, VercelApiError } from "@/lib/platform/vercel"
import { changeAuthorizedDomains, readAuthorizedDomains } from "@/lib/platform/auth-domains"
import {
    addCustomDomain,
    checkCustomDomain,
    defaultAddressCandidates,
    normaliseCustomDomain,
    provisionDefaultAddress,
    removeCustomDomain,
    VERCEL_APP_SUFFIX,
} from "@/lib/platform/tenant-address"

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "crcmusiccharts"
const args = process.argv.slice(2).filter((a) => a !== "--")
const APPLY = args.includes("--apply")
const MANIFEST_DIR = process.env.MANIFEST_DIR || join(process.cwd(), "docs/planning/2026-10-12-multitenant/manifests")
const PROTECTED = new Set(["crc", "brotherslazaroff"])

if (!getApps().length)
    initializeApp(process.env.FIRESTORE_EMULATOR_HOST ? { projectId: PROJECT_ID } : { credential: applicationDefault(), projectId: PROJECT_ID })
const db = getFirestore()
const vercel = createVercelClient()

function flag(name: string): string | null {
    const i = args.indexOf(name)
    return i >= 0 ? (args[i + 1] ?? null) : null
}

function freeze(v: unknown): unknown {
    if (v && typeof v === "object" && typeof (v as { toDate?: unknown }).toDate === "function")
        return { __ts: (v as { toDate: () => Date }).toDate().toISOString() }
    if (Array.isArray(v)) return v.map(freeze)
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, y]) => [k, freeze(y)]))
    return v
}

async function writeManifest(op: string, orgId: string, plan: unknown): Promise<string> {
    const snap = await db.collection("orgs").doc(orgId).get()
    const at = new Date().toISOString()
    mkdirSync(MANIFEST_DIR, { recursive: true })
    const path = join(MANIFEST_DIR, `tenant-address-${op}-${orgId}-${at.replace(/[:.]/g, "-")}.json`)
    writeFileSync(
        path,
        JSON.stringify({ at, projectId: PROJECT_ID, op, orgId, plan, org: { existed: snap.exists, data: snap.exists ? freeze(snap.data()) : null } }, null, 2) +
            "\n",
    )
    console.log(`manifest: ${path}`)
    return path
}

async function show(orgId: string) {
    const snap = await db.collection("orgs").doc(orgId).get()
    if (!snap.exists) {
        console.log(`orgs/${orgId}: does not exist`)
        return null
    }
    const d = snap.data() as Record<string, unknown>
    console.log(`orgs/${orgId}: status=${d.status} domains=${JSON.stringify(d.domains)} domainStatus=${JSON.stringify(d.domainStatus ?? {})}`)
    return d
}

/** Read-only probe of Vercel and Firebase for a dry run; failures are printed, not fatal. */
async function probe(hosts: string[]) {
    for (const h of hosts) {
        try {
            const pd = await vercel.getProjectDomain(h)
            console.log(`  vercel ${h}: ${pd ? `attached verified=${pd.verified} redirect=${pd.redirect ?? "-"}` : "not attached to this project"}`)
        } catch (e) {
            console.log(`  vercel ${h}: ${e instanceof VercelApiError ? `${e.kind} (${e.message})` : String(e)}`)
        }
    }
    try {
        const list = await readAuthorizedDomains()
        for (const h of hosts) console.log(`  firebase authorized ${h}: ${list.includes(h) ? "yes" : "no"} (list size ${list.length})`)
    } catch (e) {
        console.log(`  firebase authorized domains: unreadable (${(e as Error).message})`)
    }
}

function throwawayConfig(id: string) {
    return OrgConfigSchema.parse({
        id,
        name: `Probe Tenant ${id}`,
        status: "active",
        domains: { primary: `${id}${VERCEL_APP_SUFFIX}`, aliases: [] },
        branding: {
            shortName: `Probe ${id}`,
            abbreviation: "PT",
            appName: `Probe Tenant ${id}`,
            metaTitleDefault: `Probe Tenant ${id}`,
            metaTitleTemplate: `%s | Probe Tenant ${id}`,
            metaDescription: "Throwaway tenant for multi-tenant gate checks.",
            ogTitle: `Probe Tenant ${id}`,
            themeColor: "#4f46e5",
            manifestPath: "/manifest.json",
            baseUrl: `https://${id}${VERCEL_APP_SUFFIX}`,
        },
        vocabulary: { mode: "band" },
        locale: { language: "en", direction: "ltr", timeZone: "America/Chicago" },
        email: { fromName: `Probe Tenant ${id}`, headerBg: "#4f46e5", footerText: "" },
        legal: { operatorName: "Rabbi Daniel Bogard" },
        features: { mixer: false, driveInbox: false, schedulingEmails: false, todayFeed: false, notifyBand: false, perform: true },
        library: {},
        liturgy: {},
        congregationDefaults: { name: `Probe Tenant ${id}`, shortName: `Probe ${id}`, themeColor: "#4f46e5" },
    })
}

async function createThrowaway(id: string) {
    if (PROTECTED.has(id)) throw new Error(`refusing: ${id} is a real tenant`)
    const ref = db.collection("orgs").doc(id)
    if ((await ref.get()).exists) throw new Error(`orgs/${id} already exists; refusing to overwrite`)
    const config = throwawayConfig(id)
    const doc = { ...config, throwaway: true, createdAt: new Date() }
    console.log(`would create orgs/${id}:`, JSON.stringify({ ...config, throwaway: true }, null, 2))
    if (!APPLY) return console.log("dry run — pass --apply to create")
    await writeManifest("throwaway-create", id, { create: `orgs/${id}` })
    await ref.create(doc)
    console.log(`created orgs/${id}. Next: provision ${id} <slug> --apply`)
}

async function removeThrowaway(id: string) {
    if (PROTECTED.has(id)) throw new Error(`refusing: ${id} is a real tenant`)
    const d = await show(id)
    if (!d) return
    if (d.throwaway !== true) throw new Error(`refusing: orgs/${id} is not marked throwaway: true`)
    const domains = (d.domains ?? {}) as { primary?: string; aliases?: string[] }
    const hosts = [...new Set([domains.primary ?? "", ...(domains.aliases ?? [])].filter(Boolean))]
    // Never touch a host another tenant records.
    const others = new Set<string>()
    for (const o of (await db.collection("orgs").get()).docs) {
        if (o.id === id) continue
        const od = (o.data().domains ?? {}) as { primary?: string; aliases?: string[] }
        for (const h of [od.primary ?? "", ...(od.aliases ?? [])]) if (h) others.add(h)
    }
    const mine = hosts.filter((h) => !others.has(h))
    console.log(`will detach from Vercel and deauthorize: ${mine.join(", ") || "(none)"}; then delete orgs/${id}`)
    if (!APPLY) {
        await probe(mine)
        return console.log("dry run — pass --apply to remove")
    }
    await writeManifest("throwaway-remove", id, { detach: mine, deleteDoc: `orgs/${id}` })
    // Bare (redirecting) hosts before their www targets.
    const ordered = [...mine].sort((a, b) => Number(a.startsWith("www.")) - Number(b.startsWith("www.")))
    for (const h of ordered) {
        try {
            await vercel.removeProjectDomain(h)
            console.log(`  vercel: removed ${h}`)
        } catch (e) {
            if (e instanceof VercelApiError && e.kind === "not_found") console.log(`  vercel: ${h} was not attached`)
            else throw e
        }
    }
    if (mine.length) {
        const r = await changeAuthorizedDomains({ remove: mine })
        console.log(`  firebase: removed ${r.removed.join(", ") || "(none present)"}; list size now ${r.size}`)
    }
    await db.collection("orgs").doc(id).delete()
    console.log(`deleted orgs/${id}`)
}

async function main() {
    const tw = flag("--throwaway-tenant")
    const rm = flag("--remove-throwaway")
    if (tw) return createThrowaway(tw)
    if (rm) return removeThrowaway(rm)

    const [cmd, orgId, value] = args.filter((a) => !a.startsWith("--"))
    if (!cmd || !orgId || !value) {
        console.error("usage: <provision|add-domain|check-domain|remove-domain> <orgId> <slug|domain> [--apply]")
        process.exit(1)
    }
    const org = await show(orgId)
    if (!org) process.exit(1)

    if (cmd === "provision") {
        const names = defaultAddressCandidates(value)
        console.log(`plan: try in order ${names.join(", ")}; first free one becomes orgs/${orgId}.domains.primary`)
        if (!APPLY) {
            await probe(names.slice(0, 1))
            return console.log("dry run — pass --apply to provision")
        }
        await writeManifest("provision", orgId, { candidates: names })
        console.log(JSON.stringify(await provisionDefaultAddress(orgId, value, { db }), null, 2))
    } else if (cmd === "add-domain") {
        const { apex, www } = normaliseCustomDomain(value)
        console.log(`plan: attach ${www}, then ${apex} with a 308 redirect to ${www}; authorize both; add to aliases`)
        if (!APPLY) {
            await probe([apex, www])
            return console.log("dry run — pass --apply to add")
        }
        await writeManifest("add-domain", orgId, { apex, www })
        const r = await addCustomDomain(orgId, value, { db })
        console.log(JSON.stringify({ ...r, instructions: undefined }, null, 2))
        console.log(`\n${r.instructions}`)
    } else if (cmd === "check-domain") {
        const { apex, www } = normaliseCustomDomain(value)
        if (!APPLY) {
            await probe([apex, www])
            for (const h of [apex, www]) {
                try {
                    const c = await vercel.getDomainConfig(h)
                    console.log(`  dns ${h}: misconfigured=${c.misconfigured}`)
                } catch (e) {
                    console.log(`  dns ${h}: ${(e as Error).message}`)
                }
            }
            return console.log("dry run — pass --apply to verify and record the status")
        }
        await writeManifest("check-domain", orgId, { apex, www })
        const r = await checkCustomDomain(orgId, value, { db })
        console.log(JSON.stringify({ ...r, instructions: undefined }, null, 2))
        if (r.status !== "live") console.log(`\n${r.instructions}`)
    } else if (cmd === "remove-domain") {
        const { apex, www } = normaliseCustomDomain(value)
        console.log(`plan: detach ${apex} and ${www}; deauthorize both; drop from aliases; restore the vercel.app primary if needed`)
        if (!APPLY) {
            await probe([apex, www])
            return console.log("dry run — pass --apply to remove")
        }
        await writeManifest("remove-domain", orgId, { apex, www })
        console.log(JSON.stringify(await removeCustomDomain(orgId, value, { db }), null, 2))
    } else {
        console.error(`unknown command ${cmd}`)
        process.exit(1)
    }
}

main().catch((e) => {
    console.error("FAILED:", e instanceof Error ? `${e.name}: ${e.message}` : e)
    process.exit(1)
})
