import "server-only"

import { unstable_cache } from "next/cache"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"
import { codeOrgConfig } from "@/lib/org/config-code"
import { primeOrgConfig } from "@/lib/org/config-cache"
import { parseOrgConfig, type OrgConfig } from "@/lib/org/config-schema"
import type { OrgId } from "@/lib/org/types"

/**
 * Multi-tenant phase 1 — the tenant's config, from `orgs/{orgId}`.
 *
 * Source switch `ORG_CONFIG_SOURCE`:
 *   - `code` (default): the code tables (config-code.ts) for crc and
 *     brotherslazaroff; null for anything else.
 *   - `firestore`: the `orgs/{orgId}` document, validated by OrgConfigSchema.
 *     A missing or invalid document falls back to the code tables for crc
 *     and brotherslazaroff, so those two always render today's output.
 *
 * Caching: 60 s in memory per server instance, plus Next's data cache tagged
 * `org-config:<id>` (shared across instances) so a save can clear it with
 * revalidateTag. Every successful read also primes the synchronous cache the
 * pure getters (getOrgBranding, label, …) consult.
 */
export const ORG_CONFIG_TTL_MS = 60_000
export const ORG_CONFIG_MEMORY_MAX = 200
export const orgConfigTag = (orgId: OrgId) => `org-config:${orgId}`

export type OrgConfigSource = "code" | "firestore"
export function orgConfigSource(): OrgConfigSource {
    return process.env.ORG_CONFIG_SOURCE === "firestore" ? "firestore" : "code"
}

const memory = new Map<OrgId, { at: number; config: OrgConfig | null }>()

async function readOrgDoc(orgId: OrgId): Promise<OrgConfig | null> {
    if (!initAdmin()) return null
    const snap = await getFirestore().collection("orgs").doc(orgId).get()
    if (!snap.exists) return null
    const parsed = parseOrgConfig(snap.data())
    if (!parsed.ok) {
        logger.error(`[org-config] orgs/${orgId} failed validation: ${parsed.error}`)
        return null
    }
    return parsed.config
}

function cachedRead(orgId: OrgId): Promise<OrgConfig | null> {
    return unstable_cache(() => readOrgDoc(orgId), ["org-config", orgId], {
        tags: [orgConfigTag(orgId)],
        revalidate: ORG_CONFIG_TTL_MS / 1000,
    })()
}

export async function getOrgConfig(orgId: OrgId): Promise<OrgConfig | null> {
    let config: OrgConfig | null
    if (orgConfigSource() === "code") {
        config = codeOrgConfig(orgId)
    } else {
        const hit = memory.get(orgId)
        if (hit && Date.now() - hit.at < ORG_CONFIG_TTL_MS) {
            config = hit.config
        } else {
            let fromDb: OrgConfig | null = null
            try {
                fromDb = await cachedRead(orgId)
            } catch (err) {
                logger.error(`[org-config] read orgs/${orgId} failed:`, err)
            }
            config = fromDb ?? codeOrgConfig(orgId)
            // Multi-tenant phase 3: coerceOrgId accepts any well-formed id, and
            // a few unproxied public paths (robots, sitemap, today.json) read a
            // client-sent x-org-id, so bound the map rather than let random ids
            // grow it. Oldest entries go first (Map keeps insertion order).
            memory.delete(orgId)
            memory.set(orgId, { at: Date.now(), config })
            while (memory.size > ORG_CONFIG_MEMORY_MAX) {
                const oldest = memory.keys().next().value
                if (oldest === undefined) break
                memory.delete(oldest)
            }
        }
    }
    if (config) primeOrgConfig(config)
    return config
}

/** Test seam. */
export function clearOrgConfigMemory(): void {
    memory.clear()
}
