import { logger } from "@/lib/logger"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"
import { getOrgIdsFromClaims } from "@/lib/org/membership"
import { sortTenants } from "@/lib/org/legacy-membership-map"

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
 * Server-side: the tenants a user is an APPROVED member of (multi-tenant P2:
 * memberships with role ∉ {pending, denied}, crc first). Transition: a person
 * not migrated yet (no users/{uid}.membershipsMigratedAt and no memberships)
 * resolves from their Auth `orgIds` claim exactly as before (missing → crc).
 * Never throws on a missing user — returns [DEFAULT_ORG_ID] and warns.
 * Firebase Admin is lazy-imported so this module stays import-safe in pure
 * unit tests.
 */
export async function getUserOrgIds(uid: string): Promise<OrgId[]> {
    const fa = await import("@/lib/firebase-admin")
    if (!fa.initAdmin()) return [DEFAULT_ORG_ID]
    try {
        const db = fa.getFirestore()
        const [mems, userSnap] = await Promise.all([
            db.collection("memberships").where("uid", "==", uid).get(),
            db.collection("users").doc(uid).get(),
        ])
        const migrated = userSnap.exists && !!userSnap.data()?.membershipsMigratedAt
        if (migrated || !mems.empty) {
            const approved = mems.docs
                .map((d) => d.data() as { tenantId?: string; role?: string })
                .filter((m) => typeof m.tenantId === "string" && m.role !== "pending" && m.role !== "denied" && !!m.role)
                .map((m) => m.tenantId as OrgId)
            return sortTenants(approved)
        }
    } catch {
        // membership read failed → the pre-P2 claim rule below
        logger.warn("[org] getUserOrgIds: membership read failed; using the orgIds claim", { uid })
    }
    try {
        const user = await fa.getAuth().getUser(uid)
        return getOrgIdsFromClaims(user.customClaims as Record<string, unknown> | undefined)
    } catch {
        logger.warn("[org] getUserOrgIds: user lookup failed; defaulting to crc", { uid })
        return [DEFAULT_ORG_ID]
    }
}

/**
 * v11.1-02-01: the org a leader's MCP bearer should be stamped with, given the
 * tenant DOMAIN they connected Claude Desktop through. `requestedOrg` is the
 * proxy-resolved `x-org-id` (the host's org); the bearer is pinned to it ONLY
 * when the caller is actually a member (validated against their `orgIds` claim),
 * otherwise it falls back to their primary org (`orgs[0]`, default crc).
 *
 * This is the multi-org authoring seam (Daniel decision 2026-06-09): authoring
 * org = connection domain. It pins org at MINT time from the host, NOT from any
 * tool/request-body arg, so the v11-06-02 no-arg-injection invariant is fully
 * preserved. A leader can NEVER mint for an org outside their membership — a
 * crc-only user connecting on the broslaz host still mints crc (no escalation).
 * Never throws (getUserOrgIds is crc-safe).
 */
export async function resolveMintOrg(
    uid: string,
    requestedOrg: OrgId | null | undefined,
): Promise<OrgId> {
    // Multi-tenant P2: the platform owner mints for the host it connected
    // through. Everyone else: the host if they are an approved member there,
    // else (kept in P2; phase 4 removes it) their first tenant.
    if (requestedOrg) {
        try {
            const { isPlatformOwner } = await import("@/lib/org/access")
            if (await isPlatformOwner(uid)) return requestedOrg
        } catch {
            // owner lookup failure → ordinary member rules
        }
    }
    const orgs = await getUserOrgIds(uid)
    if (requestedOrg && orgs.includes(requestedOrg)) return requestedOrg
    return orgs[0] ?? DEFAULT_ORG_ID
}

/**
 * v11-02b: the org a self-service MCP token defaults to for `uid` when no host
 * org is in play — the minting user's PRIMARY org from their `orgIds` claim
 * (first element; default crc). Equivalent to `resolveMintOrg(uid, null)`. Kept
 * as a named helper for callers that have no host context.
 */
export async function getPrimaryOrgForMinting(uid: string): Promise<OrgId> {
    return resolveMintOrg(uid, null)
}
