import type { Org, OrgId } from "@/lib/org/types"

/**
 * Default tenant for any unmatched host, AND the backward-compat membership
 * fallback: existing CRC users carry no `orgIds` claim and are treated as crc
 * (see getOrgIdsFromClaims in membership.ts). Changing this is a breaking change.
 */
export const DEFAULT_ORG_ID: OrgId = "crc"

/**
 * Static tenant registry — one entry per band. Persisted to orgs/{orgId} by the
 * v11-01-03 backfill; this constant is the in-code source of truth for
 * host→org resolution and org metadata.
 */
export const ORGS: Record<OrgId, Org> = {
    crc: {
        id: "crc",
        name: "Central Reform Congregation",
        domain: "centralreform.live",
    },
    brotherslazaroff: {
        id: "brotherslazaroff",
        name: "Brothers Lazaroff",
        domain: "brotherslazaroff.live",
    },
}

export function getOrg(orgId: string): Org | undefined {
    return ORGS[orgId]
}

export function isKnownOrg(orgId: string): boolean {
    return Object.prototype.hasOwnProperty.call(ORGS, orgId)
}

/**
 * Normalize a request host to an org id. Lowercases, strips any `:port` and a
 * leading `www.`, then matches against each org's `domain`. Unknown / undefined /
 * localhost / *.vercel.app fall through to DEFAULT_ORG_ID.
 *
 * Pure — no Firestore, no request object. Host→org wiring into middleware is
 * Phase v11-03; this is just the lookup the middleware will call.
 */
export function resolveOrgIdByDomain(host: string | null | undefined): OrgId {
    if (!host) return DEFAULT_ORG_ID
    let h = host.trim().toLowerCase()
    if (!h) return DEFAULT_ORG_ID
    const colon = h.indexOf(":")
    if (colon !== -1) h = h.slice(0, colon)
    if (h.startsWith("www.")) h = h.slice(4)
    for (const org of Object.values(ORGS)) {
        if (org.domain === h) return org.id
    }
    return DEFAULT_ORG_ID
}
