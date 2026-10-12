"use client"

import { useOrg, useOrgConfig } from "@/lib/org/org-context"
import { featureOn, type FeatureKey } from "@/lib/org/features-client"

/**
 * Multi-tenant phase 6: whether a feature flag is on for the tenant this page
 * is served for. The config is the one the root layout resolved on the server
 * (getOrgConfig) and handed down through OrgProvider; outside a provider (unit
 * tests) it falls back to the compiled config for the org, CRC by default.
 *
 * The mixer reads as off for every tenant but crc whatever its flag says
 * (features-client effectiveFeatures): its data is CRC's alone.
 *
 * Pages check the same flag on the server with `hasFeature` and `notFound()`;
 * this hook only hides the nav entries and buttons that lead to them.
 */
export function useFeature(key: FeatureKey): boolean {
    const config = useOrgConfig()
    const org = useOrg()
    return featureOn(config, key, org)
}
