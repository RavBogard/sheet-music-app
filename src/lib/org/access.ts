import "server-only"
import type { Firestore } from "firebase-admin/firestore"
import type { OrgId } from "@/lib/org/types"
import type { Membership, TenantRole } from "@/lib/org/membership-types"

/**
 * Multi-tenant phase 2: one server API for "what may this person do in this
 * tenant". Web routes pass the host tenant (x-org-id); MCP passes the token's
 * tenant. Design: docs/planning/2026-10-12-multitenant/work/P2-design.md §3.3.
 *
 * SIGNATURES ONLY in this commit (lanes code against them); lane 2 implements.
 */
export type { Membership, TenantRole } from "@/lib/org/membership-types"
export { membershipId } from "@/lib/org/membership-types"

export interface TenantAccess {
    uid: string
    orgId: OrgId
    /** Membership role; null = no membership in this tenant. */
    role: TenantRole | null
    /** "admin" when platform owner, else role. */
    effectiveRole: TenantRole | null
    soundEngineer: boolean
    /** users/{uid}.canUpload (stays global in phase 2). */
    canUpload: boolean
    po: boolean
    source: "membership" | "legacy" | "none"
}

const NOT_YET = "multi-tenant phase 2: access.ts not implemented yet (lane 2)"

export async function getTenantAccess(_uid: string, _orgId: OrgId, _opts?: { db?: Firestore }): Promise<TenantAccess> {
    throw new Error(NOT_YET)
}

/** po → true; denied/null → false; else role rank ≥ min. */
export function hasTenantRole(_a: TenantAccess, _min: Exclude<TenantRole, "denied">): boolean {
    throw new Error(NOT_YET)
}

/** effectiveRole ?? undefined — drop-in replacement for readUserRole(db, uid). */
export async function readTenantRole(_db: Firestore, _uid: string, _orgId: OrgId): Promise<string | undefined> {
    throw new Error(NOT_YET)
}

/** platform/owners, memoised 60 s. */
export async function isPlatformOwner(_uid: string, _db?: Firestore): Promise<boolean> {
    throw new Error(NOT_YET)
}

export async function listTenantMembers(
    _orgId: OrgId,
    _opts?: { roles?: TenantRole[] },
): Promise<Array<Membership & { profile: Record<string, unknown> | null }>> {
    throw new Error(NOT_YET)
}
