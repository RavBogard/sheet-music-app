import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"

// v11-05-05: this module is PURE + client-safe (no firebase-admin in its build
// graph). The server-only resolvers that lazy-import firebase-admin
// (getUserOrgIds / getPrimaryOrgForMinting) live in `membership-server.ts` —
// a dynamic import still pulls firebase-admin into a client importer's bundle,
// which broke the build when scheduling-firebase.ts / setlist-firebase.ts
// (client) imported rowOrg from here.

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
 * v11-05-02: normalize a user DOC's `orgIds` field to a membership list. An
 * absent/empty/malformed `orgIds` → [DEFAULT_ORG_ID] ('crc') — the same CRC-safety
 * default as getOrgIdsFromClaims, so a legacy CRC user doc with no orgIds still
 * belongs to crc (roster filtering needs no doc backfill to keep CRC intact).
 * Parallel to `rowOrg` for single-org docs.
 */
export function rowOrgIds(raw: unknown): OrgId[] {
    if (Array.isArray(raw)) {
        const ids = raw.filter((v): v is string => typeof v === "string" && v.length > 0)
        if (ids.length > 0) return ids
    }
    return [DEFAULT_ORG_ID]
}

/**
 * v11-05-03: normalize a SINGLE-org doc's `orgId` field (e.g. a
 * scheduling_assignment, denormalized from its parent setlist) to a typed OrgId.
 * Absent/empty/non-string → DEFAULT_ORG_ID ('crc'), the same CRC-safety default
 * as rowOrgIds — so a legacy assignment with no orgId still scopes to crc and
 * reads need no backfill to keep CRC intact. Pure + client-safe (no firebase
 * import). Parallel to the server-only `rowOrg` in src/lib/mcp/org-context.ts;
 * this one is importable from client + route + MCP code alike.
 */
export function rowOrg(raw: unknown): OrgId {
    return typeof raw === "string" && raw.length > 0 ? (raw as OrgId) : DEFAULT_ORG_ID
}

/**
 * v11-05-02: order-insensitive set equality for two orgId lists. Used by the
 * sync-claims seam to decide whether `users/{uid}.orgIds` has drifted from the
 * claim before writing (stay idempotent — no write when already in sync).
 */
export function orgIdsEqual(
    a: readonly string[] | null | undefined,
    b: readonly string[] | null | undefined,
): boolean {
    const setA = new Set(a ?? [])
    const setB = new Set(b ?? [])
    if (setA.size !== setB.size) return false
    for (const v of setA) if (!setB.has(v)) return false
    return true
}

// getUserOrgIds + getPrimaryOrgForMinting moved to membership-server.ts (v11-05-05) —
// see the module-header note. Import them from "@/lib/org/membership-server".
