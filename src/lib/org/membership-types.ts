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
