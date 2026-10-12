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

/** The outcome of resolveMintOrg: the tenant to mint for, or a refusal. */
export type MintOrgDecision =
    | { ok: true; orgId: OrgId }
    | { ok: false; orgId: OrgId; message: string }

/** The refusal shown when a person is not a member of the tenant they connected through. */
export function notAMemberMessage(tenantName: string): string {
    return `This account isn't a member of ${tenantName}. Ask its admin for access.`
}

async function tenantDisplayName(orgId: OrgId): Promise<string> {
    try {
        const { getOrgConfig } = await import("@/lib/org/get-org-config")
        return (await getOrgConfig(orgId))?.name ?? orgId
    } catch {
        return orgId
    }
}

/**
 * The tenant an MCP bearer is minted for: the tenant of the ADDRESS the person
 * connected through (`requestedOrg`, the proxy-resolved `x-org-id`), and only
 * that tenant (multi-tenant phase 4). A person with no approved membership
 * there (role not pending/denied; unmigrated people by their orgIds claim) is
 * refused with a plain message; there is no fall-back to their first tenant,
 * so a CRC-only account connecting through another tenant's address gets no
 * token rather than a CRC one. The platform owner mints for the address's
 * tenant. The tenant comes from the host, never from a request argument
 * (v11-06-02). Never throws.
 */
export async function resolveMintOrg(uid: string, requestedOrg: OrgId): Promise<MintOrgDecision> {
    try {
        const { isPlatformOwner } = await import("@/lib/org/access")
        if (await isPlatformOwner(uid)) return { ok: true, orgId: requestedOrg }
    } catch {
        // owner lookup failure → ordinary member rules
    }
    const orgs = await getUserOrgIds(uid)
    if (orgs.includes(requestedOrg)) return { ok: true, orgId: requestedOrg }
    return { ok: false, orgId: requestedOrg, message: notAMemberMessage(await tenantDisplayName(requestedOrg)) }
}

/**
 * v11-02b: a person's PRIMARY tenant (first approved tenant, crc first; default
 * crc). Not used to mint any more — minting is for the address's tenant only
 * (resolveMintOrg) — kept for callers that need "where does this person
 * mainly belong".
 */
export async function getPrimaryOrgForMinting(uid: string): Promise<OrgId> {
    const orgs = await getUserOrgIds(uid)
    return orgs[0] ?? DEFAULT_ORG_ID
}
