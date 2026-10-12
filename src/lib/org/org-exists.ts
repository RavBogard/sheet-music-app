import "server-only"

import { isKnownOrg } from "@/lib/org/registry"
import { isValidOrgId } from "@/lib/org/org-id"
import { getOrgConfig } from "@/lib/org/get-org-config"
import type { OrgId } from "@/lib/org/types"

/**
 * Multi-tenant phase 3: "is this a tenant that exists?" — the compiled tenants
 * (crc, brotherslazaroff), or any well-formed id whose `orgs/{id}` config
 * resolves (getOrgConfig, cached 60 s; with ORG_CONFIG_SOURCE=code only the
 * compiled tenants resolve). Suspended tenants still exist: this is for
 * validating an id an admin or test tool names, not for serving a host.
 */
export async function orgExists(orgId: unknown): Promise<boolean> {
    if (!isValidOrgId(orgId)) return false
    if (isKnownOrg(orgId)) return true
    try {
        return (await getOrgConfig(orgId as OrgId)) !== null
    } catch {
        return false
    }
}

/**
 * Prime the synchronous tenant-config cache for a request's tenant, so
 * orgString / getOrgBranding / locale reads see a third tenant's config rather
 * than the code fallback. Cheap (getOrgConfig is cached 60 s) and never throws.
 */
export async function primeTenantConfig(orgId: OrgId | null | undefined): Promise<void> {
    if (!orgId) return
    try {
        await getOrgConfig(orgId)
    } catch {
        // A failed config read must never fail the request; the code fallback stands.
    }
}
