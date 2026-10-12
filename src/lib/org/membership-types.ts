import type { OrgId } from "@/lib/org/types"

/**
 * Multi-tenant phase 2: a person's role in one tenant. Stored at
 * memberships/{tenantId}__{uid}; written by the server only.
 * `denied` keeps a declined request from reappearing; it carries no claim.
 */
export type TenantRole = "admin" | "band_leader" | "musician" | "member" | "pending" | "denied"

/** Firestore Timestamp on the server, Timestamp-like in the browser. */
type Stamp = { toDate(): Date } | Date

export interface Membership {
    uid: string
    tenantId: OrgId
    role: TenantRole
    soundEngineer: boolean
    /** actor uid | "migration" | "self-join" | "test-account" */
    addedBy: string
    addedAt: Stamp
    updatedBy?: string
    updatedAt?: Stamp
    requestedAt?: Stamp
}

export const membershipId = (orgId: OrgId, uid: string) => `${orgId}__${uid}`

/** Two-letter claim codes in the `m` claim map. */
export const ROLE_CODE = { admin: "ad", band_leader: "bl", musician: "mu", member: "me", pending: "pe" } as const
export type RoleCode = (typeof ROLE_CODE)[keyof typeof ROLE_CODE]
export const CODE_ROLE: Record<RoleCode, Exclude<TenantRole, "denied">> = { ad: "admin", bl: "band_leader", mu: "musician", me: "member", pe: "pending" }

/** Rank used everywhere a "role at least X" check is made. denied/none = -1. */
export const ROLE_RANK: Record<string, number> = { admin: 4, band_leader: 3, musician: 2, member: 1, pending: 0 }

/** Rank of a role string; unknown, denied or missing → -1. */
export function roleRank(role: string | null | undefined): number {
    return role && Object.prototype.hasOwnProperty.call(ROLE_RANK, role) ? ROLE_RANK[role] : -1
}

const TENANT_ROLES: ReadonlySet<string> = new Set(["admin", "band_leader", "musician", "member", "pending", "denied"])

/** Narrow an unknown value to a TenantRole (null when it is not one). */
export function asTenantRole(v: unknown): TenantRole | null {
    return typeof v === "string" && TENANT_ROLES.has(v) ? (v as TenantRole) : null
}

/**
 * Pure, Edge- and client-safe: the role a decoded token / session cookie grants
 * in `orgId` (design §3.5 transition rule).
 *   po            → "admin"
 *   `m` map       → the tenant's code decoded (absent → undefined)
 *   no `m` (legacy token) → the legacy `role` claim, tenant-blind — exactly what
 *                    the proxy and requireAuth read before phase 2.
 */
export function tenantRoleFromClaims(
    claims: Record<string, unknown> | null | undefined,
    orgId: string,
): string | undefined {
    if (!claims) return undefined
    if (claims.po === true) return "admin"
    const m = claims.m
    if (m && typeof m === "object" && !Array.isArray(m)) {
        const code = (m as Record<string, unknown>)[orgId]
        return typeof code === "string" && code in CODE_ROLE ? CODE_ROLE[code as RoleCode] : undefined
    }
    return typeof claims.role === "string" && claims.role ? claims.role : undefined
}
