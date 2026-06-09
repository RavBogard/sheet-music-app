import { logger } from "@/lib/logger"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"
import { getOrgIdsFromClaims } from "@/lib/org/membership"

/**
 * v11-05-05: SERVER-ONLY org membership resolvers. Split out of membership.ts so
 * that the pure client-safe helpers (rowOrg/rowOrgIds/getOrgIdsFromClaims/…) can be
 * imported by client modules (scheduling-firebase.ts, setlist-firebase.ts) WITHOUT
 * dragging firebase-admin into the client bundle. A `await import("@/lib/firebase-admin")`
 * still registers firebase-admin in the importing module's build graph (webpack
 * pulls the dynamic chunk), so the lazy import alone was not enough — these
 * functions must live in their own module that only server code imports.
 */

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

/**
 * v11-02b: the org a self-service MCP token should be stamped with for `uid`.
 * Resolves the minting user's tenant from their `orgIds` custom claim so the
 * in-app token route + the OAuth token route mint correctly-scoped bearers
 * (caller org is read FROM the token doc at verify time — v11-02-01 — so the
 * org MUST be stamped at mint). Defaults crc for claimless CRC users; never
 * throws (getUserOrgIds is crc-safe).
 *
 * MULTI-ORG CAVEAT: today every member belongs to exactly one non-default org
 * (David → brotherslazaroff). If `orgIds` ever holds multiple, the FIRST is
 * used for a self-mint — revisit with an explicit org-pick param when multi-org
 * membership becomes real.
 */
export async function getPrimaryOrgForMinting(uid: string): Promise<OrgId> {
    const orgs = await getUserOrgIds(uid)
    return orgs[0] ?? DEFAULT_ORG_ID
}
