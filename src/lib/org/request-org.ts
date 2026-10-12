import "server-only"

import { headers } from "next/headers"
import { coerceOrgId } from "@/lib/org/registry"
import { getOrgConfig } from "@/lib/org/get-org-config"
import type { OrgConfig } from "@/lib/org/config-schema"
import type { OrgId } from "@/lib/org/types"

/**
 * Multi-tenant phase 1: the request's tenant, with its config resolved and
 * primed. Layouts and pages render in parallel, so a server component that
 * reads a tenant value (getOrgBranding, label, orgString…) awaits this first
 * rather than relying on the root layout having primed the cache.
 */
export async function requestOrg(): Promise<{ orgId: OrgId; config: OrgConfig | null }> {
    const orgId = coerceOrgId((await headers()).get("x-org-id"))
    const config = await getOrgConfig(orgId)
    return { orgId, config }
}
