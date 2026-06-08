import { logger } from "@/lib/logger"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"

/**
 * Read a user's org memberships from decoded custom claims.
 *
 * BACKWARD-COMPAT CONTRACT: a missing / empty / malformed `orgIds` claim →
 * [DEFAULT_ORG_ID]. Every existing CRC user carries no `orgIds` claim today and
 * MUST keep crc access with no claims migration. Phase v11-02 onboarding adds an
 * explicit orgIds claim for David's Brothers Lazaroff membership.
 */
export function getOrgIdsFromClaims(
    claims: Record<string, unknown> | null | undefined,
): OrgId[] {
    const raw = claims?.orgIds
    if (Array.isArray(raw)) {
        const ids = raw.filter((v): v is string => typeof v === "string" && v.length > 0)
        if (ids.length > 0) return ids
    }
    return [DEFAULT_ORG_ID]
}

/** True iff the claims grant membership in orgId. */
export function userInOrg(
    claims: Record<string, unknown> | null | undefined,
    orgId: string,
): boolean {
    return getOrgIdsFromClaims(claims).includes(orgId)
}

/**
 * Server-side: resolve a user's org memberships from their Auth custom claims.
 * Never throws on a missing user — returns [DEFAULT_ORG_ID] and warns. Firebase
 * Admin is lazy-imported so this module stays import-safe in pure unit tests.
 */
export async function getUserOrgIds(uid: string): Promise<OrgId[]> {
    const { initAdmin, getAuth } = await import("@/lib/firebase-admin")
    if (!initAdmin()) return [DEFAULT_ORG_ID]
    try {
        const user = await getAuth().getUser(uid)
        return getOrgIdsFromClaims(user.customClaims as Record<string, unknown> | undefined)
    } catch {
        logger.warn("[org] getUserOrgIds: user lookup failed; defaulting to crc", { uid })
        return [DEFAULT_ORG_ID]
    }
}
