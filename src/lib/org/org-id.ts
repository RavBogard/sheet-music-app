import type { OrgId } from "@/lib/org/types"

/**
 * Multi-tenant phase 3: the shape of a tenant id, without zod, so the Edge
 * proxy and client bundles can check it. `OrgIdSchema` (config-schema.ts) is
 * built from the same pattern and length limits, so the two cannot disagree.
 */
export const ORG_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/
export const ORG_ID_MIN = 2
export const ORG_ID_MAX = 40

export function isValidOrgId(value: unknown): value is OrgId {
    return (
        typeof value === "string" &&
        value.length >= ORG_ID_MIN &&
        value.length <= ORG_ID_MAX &&
        ORG_ID_PATTERN.test(value)
    )
}
