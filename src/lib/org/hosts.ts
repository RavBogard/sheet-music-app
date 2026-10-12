import "server-only"

import { revalidateTag, unstable_cache } from "next/cache"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"
import { ORGS } from "@/lib/org/registry"
import { parseOrgConfig } from "@/lib/org/config-schema"
import { orgConfigSource } from "@/lib/org/get-org-config"
import { expandDomainHosts, type HostMap } from "@/lib/org/host-resolution"
import type { OrgId } from "@/lib/org/types"

/**
 * Multi-tenant phase 3 — the address list: every host a tenant answers on,
 * mapped to its org id. Served publicly by `/api/org-hosts` and read by the
 * proxy (src/lib/org/host-list-client.ts).
 *
 * Built from each `orgs/{id}` document's `domains.primary` + `domains.aliases`
 * (lowercased, port stripped; custom domains listed bare and with www;
 * vercel.app aliases exact). A tenant whose `status` is not active is left
 * out, so its addresses get "no such site". CRC and BL are always present
 * from the compiled table, whatever their documents say, and no other tenant
 * can claim one of their hosts.
 *
 * With `ORG_CONFIG_SOURCE=code` only the compiled tenants are listed: a tenant
 * that has no config to render must not get an address either.
 *
 * Cached in Next's data cache under the `org-hosts` tag for 60 s;
 * `revalidateHostList()` clears it (lane 2 calls it after writing
 * `orgs/{id}.domains`). The CDN copy of `/api/org-hosts` and each proxy
 * instance's memo can still be up to 60 s old each.
 */
export const ORG_HOSTS_TAG = "org-hosts"
export const ORG_HOSTS_TTL_S = 60

export interface HostListDoc {
    id: string
    data: Record<string, unknown>
}

export interface HostList {
    hosts: HostMap
    generatedAt: string
}

/** The compiled tenants' hosts (bare + www), CRC first. */
export function compiledHostMap(): HostMap {
    const out: HostMap = {}
    for (const org of Object.values(ORGS)) {
        for (const h of expandDomainHosts(org.domain, [])) out[h] = org.id
    }
    return out
}

/**
 * Pure builder (exported for tests). Documents are taken in id order so a
 * host claimed by two tenants always goes to the same one; the conflict is
 * logged.
 */
export function buildHostMap(docs: HostListDoc[]): HostMap {
    const hosts = compiledHostMap()
    const compiledIds = new Set<OrgId>(Object.keys(ORGS))
    const owner = new Map<string, OrgId>(Object.entries(hosts))
    const sorted = [...docs].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    for (const doc of sorted) {
        const domains = doc.data.domains as { primary?: unknown; aliases?: unknown } | undefined
        if (!domains) continue
        if (compiledIds.has(doc.id)) {
            // CRC / BL: always listed; their documents may add aliases, never remove.
            for (const h of expandDomainHosts(domains.primary, domains.aliases)) {
                const prev = owner.get(h)
                if (prev && prev !== doc.id) {
                    logger.warn(`[org-hosts] ${h} claimed by ${doc.id} and ${prev}; keeping ${prev}`)
                    continue
                }
                owner.set(h, doc.id)
                hosts[h] = doc.id
            }
            continue
        }
        const status = doc.data.status ?? "active"
        if (status !== "active") continue
        const parsed = parseOrgConfig({ ...doc.data, id: doc.data.id ?? doc.id })
        if (!parsed.ok || parsed.config.id !== doc.id) {
            logger.warn(`[org-hosts] orgs/${doc.id} skipped: ${parsed.ok ? "id mismatch" : parsed.error}`)
            continue
        }
        for (const h of expandDomainHosts(parsed.config.domains.primary, parsed.config.domains.aliases)) {
            const prev = owner.get(h)
            if (prev && prev !== doc.id) {
                logger.warn(`[org-hosts] ${h} claimed by ${doc.id} and ${prev}; keeping ${prev}`)
                continue
            }
            owner.set(h, doc.id)
            hosts[h] = doc.id
        }
    }
    return hosts
}

async function readHostList(): Promise<HostList> {
    const generatedAt = new Date().toISOString()
    if (orgConfigSource() !== "firestore" || !initAdmin()) {
        return { hosts: buildHostMap([]), generatedAt }
    }
    try {
        const snap = await getFirestore().collection("orgs").get()
        const docs = snap.docs.map((d) => ({ id: d.id, data: (d.data() ?? {}) as Record<string, unknown> }))
        return { hosts: buildHostMap(docs), generatedAt }
    } catch (err) {
        logger.error("[org-hosts] orgs read failed; listing the compiled tenants only", err)
        throw err
    }
}

const cachedHostList = unstable_cache(readHostList, ["org-hosts"], {
    tags: [ORG_HOSTS_TAG],
    revalidate: ORG_HOSTS_TTL_S,
})

/**
 * The current list. A failed Firestore read is not cached (it throws inside
 * the cache) and answers with the compiled tenants only.
 */
export async function getHostList(): Promise<HostList> {
    try {
        return await cachedHostList()
    } catch {
        return { hosts: buildHostMap([]), generatedAt: new Date().toISOString() }
    }
}

/**
 * Clear the cached address list. Lane 2 (provisioning) calls this after it
 * writes `orgs/{id}.domains` or a tenant's status changes.
 */
export function revalidateHostList(): void {
    try {
        revalidateTag(ORG_HOSTS_TAG, { expire: 0 })
    } catch (err) {
        // Outside a request scope (scripts, tests) there is nothing to clear.
        logger.warn("[org-hosts] revalidateTag failed", err)
    }
}
