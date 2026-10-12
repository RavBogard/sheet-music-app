import type { OrgConfig } from "@/lib/org/config-schema"
import { CODE_ORG_IDS, codeOrgConfig } from "@/lib/org/config-code"
import { peekOrgConfig } from "@/lib/org/config-cache"
import type { OrgId } from "@/lib/org/types"

/**
 * Multi-tenant phase 1 — CORS origins for the public chart-byte routes
 * (/api/library/file/[id], /api/drive/file/[fileId]).
 *
 * The default list stays exactly what it has always been: CRC's two origins.
 * Brothers Lazaroff is NOT in it — adding its origins would change what a BL
 * page gets back (today a BL origin falls through to centralreform.live), so
 * that is left for a later phase. `tenantOrigins` / `allTenantOrigins` list
 * each tenant's origins from config for when it is.
 */
export const DEFAULT_ALLOWED_ORIGINS = "https://centralreform.live,https://www.centralreform.live"

/** The configured allow-list (`ALLOWED_ORIGINS`, comma separated) or the default. */
export function allowedOriginsFromEnv(raw: string | undefined = process.env.ALLOWED_ORIGINS): string[] {
    return (raw || DEFAULT_ALLOWED_ORIGINS).split(",").map((s) => s.trim())
}

/** https:// origins for a tenant's primary host and aliases. */
export function tenantOrigins(config: Pick<OrgConfig, "domains">): string[] {
    const hosts = [config.domains.primary, ...config.domains.aliases]
    return [...new Set(hosts.filter(Boolean).map((h) => `https://${h}`))]
}

/** Origins of every tenant given (primed config first, then the code tables). */
export function allTenantOrigins(orgIds: OrgId[] = CODE_ORG_IDS): string[] {
    const out: string[] = []
    for (const id of orgIds) {
        const cfg = peekOrgConfig(id) ?? codeOrgConfig(id)
        if (cfg) out.push(...tenantOrigins(cfg))
    }
    return [...new Set(out)]
}
