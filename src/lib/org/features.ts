import "server-only"

import { NextResponse } from "next/server"
import { logger } from "@/lib/logger"
import { cronTenantIds } from "@/lib/org/cron-tenants"
import { getOrgConfig } from "@/lib/org/get-org-config"
import type { OrgFeatures } from "@/lib/org/config-schema"
import { featuresOf, type FeatureKey } from "@/lib/org/features-client"
import type { OrgId } from "@/lib/org/types"

export type { FeatureKey } from "@/lib/org/features-client"

/**
 * Multi-tenant phase 6 — feature flags, the server half.
 *
 * Checked at four places: UI (lane 2, via features-client featureOn), API
 * routes (requireFeature), the MCP tool list plus a handler check
 * (src/lib/mcp/tenant-tools.ts) and crons (tenantsWithFeature).
 *
 * `mixer` is off for every tenant but crc regardless of its flag
 * (features-client effectiveFeatures).
 */

/** The tenant's flags: getOrgConfig, else the compiled config, else schema defaults. Never throws. */
export async function tenantFeatures(orgId: OrgId): Promise<OrgFeatures> {
    let config = null
    try {
        config = await getOrgConfig(orgId)
    } catch (err) {
        logger.warn("[features] tenant config read failed; compiled config", { orgId, err: String(err) })
    }
    return featuresOf(config, orgId)
}

export async function hasFeature(orgId: OrgId, key: FeatureKey): Promise<boolean> {
    return (await tenantFeatures(orgId))[key] === true
}

/** null when the feature is on; otherwise a 404 `{ error: "feature_off", feature }`. */
export async function requireFeature(orgId: OrgId, key: FeatureKey): Promise<NextResponse | null> {
    if (await hasFeature(orgId, key)) return null
    return NextResponse.json({ error: "feature_off", feature: key }, { status: 404 })
}

/** The cron tenants (cronTenantIds order) with `key` on. */
export async function tenantsWithFeature(key: FeatureKey): Promise<OrgId[]> {
    const ids = await cronTenantIds()
    const out: OrgId[] = []
    for (const id of ids) if (await hasFeature(id, key)) out.push(id)
    return out
}
