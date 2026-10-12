import "server-only"
import type { Membership } from "@/lib/org/membership-types"
export { ROLE_CODE } from "@/lib/org/membership-types"

/**
 * Multi-tenant phase 2: the ONLY writer of custom claims. Rebuilds
 * {po?, m, se?} from memberships and keeps the legacy role/orgIds/soundEngineer
 * claims during the changeover. Design §3.2. SIGNATURES ONLY in this commit.
 */
const NOT_YET = "multi-tenant phase 2: claims.ts not implemented yet (lane 2)"

export const CLAIMS_BYTE_LIMIT = 900

/** Pure: previous claims + this person's memberships + po → new claims. */
export function buildClaims(_prev: Record<string, unknown>, _memberships: Membership[], _po: boolean): Record<string, unknown> {
    throw new Error(NOT_YET)
}

/** Reads memberships + platform/owners, writes claims, mirrors legacy fields on users/{uid}; revoke on removal. */
export async function rebuildClaims(
    _uid: string,
    _opts?: { revoke?: boolean },
): Promise<{ claims: Record<string, unknown>; bytes: number; changed: boolean }> {
    throw new Error(NOT_YET)
}
