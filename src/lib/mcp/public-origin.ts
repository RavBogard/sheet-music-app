import { coerceOrgId, DEFAULT_ORG_ID, getOrg } from "@/lib/org/registry"
import {
    canonicalHostFor,
    expandDomainHosts,
    isLocalHost,
    isOwnVercelHost,
    isVercelAppHost,
    normalizeHost,
} from "@/lib/org/host-resolution"
import { getOrgConfig } from "@/lib/org/get-org-config"
import { originFromRequest } from "@/lib/mcp/oauth"
import type { OrgId } from "@/lib/org/types"

/**
 * Multi-tenant phase 3 — the public origin the MCP server and its OAuth
 * metadata name (RFC 9728 `resource`, RFC 8414 `issuer` and endpoints, the
 * `resource_metadata` in the 401 challenge).
 *
 * It comes from the request tenant (`x-org-id`, set by the proxy), never from
 * one env value:
 *
 *   - the request arrived on one of that tenant's own addresses (CRC/BL
 *     www hosts, a tenant's vercel.app alias or www custom domain, the
 *     project's own Vercel URLs for crc, localhost) → that address, exactly
 *     as before. RFC 9728 clients check the metadata's `resource` against
 *     the URL they connected to, so this must not be rewritten;
 *   - otherwise (no host header, a bare custom domain — which Vercel
 *     307-redirects to www and thereby drops MCP's Authorization header — or
 *     an address of a different tenant) → the tenant's canonical host:
 *     crc https://www.centralreform.live, brotherslazaroff
 *     https://www.brotherslazaroff.live, any other tenant its
 *     `domains.primary` (the alias for vercel.app, www for a custom domain).
 */

const COMPILED_CANONICAL: Record<string, string> = {
    crc: "www.centralreform.live",
    brotherslazaroff: "www.brotherslazaroff.live",
}

function firstHeaderValue(v: string | null): string | null {
    if (!v) return null
    const first = v.split(",")[0]?.trim()
    return first || null
}

/** The tenant's canonical host (no scheme). */
export async function canonicalMcpHost(orgId: OrgId): Promise<string> {
    const compiled = COMPILED_CANONICAL[orgId]
    if (compiled) return compiled
    try {
        const config = await getOrgConfig(orgId)
        const host = config ? canonicalHostFor(config.domains.primary) : ""
        if (host) return host
    } catch {
        // fall through
    }
    return COMPILED_CANONICAL[DEFAULT_ORG_ID]
}

/** Every address the tenant answers on (bare + www for custom domains). */
async function tenantHosts(orgId: OrgId): Promise<string[]> {
    const org = getOrg(orgId)
    if (org) return expandDomainHosts(org.domain, [])
    try {
        const config = await getOrgConfig(orgId)
        return config ? expandDomainHosts(config.domains.primary, config.domains.aliases) : []
    } catch {
        return []
    }
}

/**
 * The request host is one of the tenant's own, canonical-or-alias addresses
 * (not the bare form of a www custom domain).
 */
async function isTenantServingHost(host: string, orgId: OrgId): Promise<boolean> {
    if (isLocalHost(host)) return true
    if (isOwnVercelHost(host)) return orgId === DEFAULT_ORG_ID
    const hosts = await tenantHosts(orgId)
    if (!hosts.includes(host)) return false
    const isBareOfWww = !isVercelAppHost(host) && !host.startsWith("www.") && hosts.includes(`www.${host}`)
    return !isBareOfWww
}

export async function mcpPublicOrigin(req: Request): Promise<string> {
    const h = req.headers
    // No x-org-id means the request did not pass through the proxy (which
    // always sets it): keep the pre-phase-3 request-derived origin.
    const rawOrg = h.get("x-org-id")
    if (rawOrg === null) return originFromRequest(req)
    const orgId = coerceOrgId(rawOrg)
    const rawHost = firstHeaderValue(h.get("x-forwarded-host")) ?? firstHeaderValue(h.get("host"))
    const host = normalizeHost(rawHost)
    if (rawHost && host && (await isTenantServingHost(host, orgId))) {
        const proto = firstHeaderValue(h.get("x-forwarded-proto")) ?? "https"
        return `${proto}://${rawHost}`
    }
    return `https://${await canonicalMcpHost(orgId)}`
}
