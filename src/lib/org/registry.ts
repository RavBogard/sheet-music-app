import type { Org, OrgId } from "@/lib/org/types"
import { isValidOrgId } from "@/lib/org/org-id"

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

/**
 * True only for the COMPILED tenants (crc, brotherslazaroff). Multi-tenant
 * phase 3: a tenant created in `orgs/{id}` is not "known" here — callers that
 * mean "a tenant that exists" use `orgExists` (src/lib/org/org-exists.ts), and
 * callers that mean "a well-formed id" use `isValidOrgId` (org-id.ts).
 */
export function isKnownOrg(orgId: string): boolean {
    return Object.prototype.hasOwnProperty.call(ORGS, orgId)
}

/**
 * Coerce a raw `x-org-id` header value (an ALREADY-RESOLVED org id set by the
 * Edge proxy, e.g. "brotherslazaroff") into a typed OrgId, falling back to
 * DEFAULT_ORG_ID for missing/malformed values.
 *
 * Multi-tenant phase 3: any well-formed id (OrgIdSchema's pattern) is
 * accepted, not just the compiled tenants — the proxy is the only setter of
 * `x-org-id` (an unconditional overwrite) and it only sets ids it resolved
 * from the compiled table or the address list, so a third tenant's id must
 * survive here instead of turning into crc downstream.
 *
 * NOTE: this is NOT resolveOrgIdByDomain — that one maps a *host* like
 * "www.brotherslazaroff.live" to an org. The proxy already did that and put the
 * org *id* on the header; the server render just needs to validate it. Passing
 * an org id through resolveOrgIdByDomain returns crc (no domain match), which
 * was the v11-03-01 bug.
 */
export function coerceOrgId(value: string | null | undefined): OrgId {
    return isValidOrgId(value) ? value : DEFAULT_ORG_ID
}

/**
 * v11-05-04: resolve the Firestore doc id for an org's `config/congregation`
 * singleton. CRC keeps the BARE `congregation` doc id (ZERO migration,
 * byte-identical to pre-multi-tenant); every other org is NAMESPACED as
 * `congregation__{orgId}`. Mirrors v11-05-01's liturgical-key namespacing
 * (bare CRC key = no backfill). Pure — no Firestore.
 */
export function congregationDocId(org: OrgId): string {
    return org === DEFAULT_ORG_ID ? "congregation" : `congregation__${org}`
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
    return compiledOrgIdForHost(host) ?? DEFAULT_ORG_ID
}

/**
 * Multi-tenant phase 3, step (a) of the proxy's host resolution: the compiled
 * CRC/BL map only. Same normalisation as resolveOrgIdByDomain (lowercase, no
 * port, leading `www.` stripped) but returns null instead of defaulting, so
 * the proxy can go on to the project's own Vercel URLs and the address list.
 */
export function compiledOrgIdForHost(host: string | null | undefined): OrgId | null {
    if (!host) return null
    let h = host.trim().toLowerCase()
    if (!h) return null
    const colon = h.indexOf(":")
    if (colon !== -1) h = h.slice(0, colon)
    if (h.startsWith("www.")) h = h.slice(4)
    for (const org of Object.values(ORGS)) {
        if (org.domain === h) return org.id
    }
    return null
}
