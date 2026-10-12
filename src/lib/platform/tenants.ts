import "server-only"
import type { OrgId } from "@/lib/org/types"
import type { OrgConfig, OrgConfigInput } from "@/lib/org/config-schema"
import type { TenantRole } from "@/lib/org/membership-types"

/**
 * Multi-tenant phase 4: the platform owner's operations on tenants. ONE library
 * behind both the /platform console (API routes) and the platform MCP surface
 * (/api/platform/mcp), so they cannot disagree. Every write takes an Actor,
 * defaults to a dry run, returns before/after/diff, and records a platformAudit
 * row when applied. Address operations live in ./tenant-address.ts (phase 3).
 *
 * SIGNATURES ONLY in this commit (lanes code against them); lane 1 implements.
 */

export interface Actor {
    uid: string
    email?: string | null
    /** Where the action came from. */
    via: "console" | "claude"
}

export interface WriteOpts {
    actor: Actor
    /** Default true: compute and return, write nothing. */
    dryRun?: boolean
}

export interface WriteResult<T> {
    dryRun: boolean
    changed: boolean
    before: T | null
    after: T | null
    /** Dotted paths that differ, with old and new values. */
    diff: Array<{ path: string; before: unknown; after: unknown }>
    /** Set when applied: the platformAudit row id. */
    auditId?: string
}

export interface TenantSummary {
    orgId: OrgId
    name: string
    status: OrgConfig["status"]
    addresses: string[]
    primaryAddress: string | null
    memberCount: number
    pendingCount: number
    featuresOn: Array<keyof OrgConfig["features"]>
}

export interface TenantMember {
    uid: string
    name: string | null
    email: string | null
    role: TenantRole
    soundEngineer: boolean
    lastSeen: string | null
}

export interface TenantDetail {
    summary: TenantSummary
    config: OrgConfig
    domainStatus: Record<string, unknown>
    membersByRole: Partial<Record<TenantRole, number>>
    collections: CollectionRecord[]
}

/** Phase 4 stores the record; phase 5 computes row visibility from it. */
export interface CollectionRecord {
    id: string
    ownerOrgId: OrgId
    name: string
    label: string
    visibility: "private" | "listed" | "all"
    sharedWith: OrgId[]
    /** Set by the platform owner; a tenant admin cannot remove it. */
    assignedTo: OrgId[]
    chartCount?: number
}

export interface CreateTenantInput {
    orgId: OrgId
    /** Fields of the tenant config; the schema fills defaults. */
    config: Omit<OrgConfigInput, "id">
    /** Default address slug → <slug>.vercel.app (phase 3 provisioning). */
    subdomain: string
    /** Copy liturgy frames (service types, rabbi slots) and books from this tenant. */
    copyLiturgyFrom?: OrgId
}

export interface Invite {
    id: string
    orgId: OrgId
    email: string
    role: Exclude<TenantRole, "pending" | "denied">
    /** Link to send: the tenant's address + /invite/<token>. */
    link: string
    expiresAt: string
    acceptedAt?: string | null
}

export interface PlatformAuditEntry {
    id: string
    at: string
    actorUid: string
    actorEmail: string | null
    via: Actor["via"]
    action: string
    orgId: OrgId | null
    before: unknown
    after: unknown
}

const NOT_YET = "multi-tenant phase 4: platform/tenants.ts not implemented yet (lane 1)"

export async function listTenants(): Promise<TenantSummary[]> { throw new Error(NOT_YET) }
export async function getTenant(_orgId: OrgId): Promise<TenantDetail | null> { throw new Error(NOT_YET) }
export async function createTenant(_input: CreateTenantInput, _opts: WriteOpts): Promise<WriteResult<OrgConfig> & { address?: string; nextSteps: string[] }> { throw new Error(NOT_YET) }
export async function updateTenant(_orgId: OrgId, _patch: Partial<OrgConfigInput>, _opts: WriteOpts): Promise<WriteResult<OrgConfig>> { throw new Error(NOT_YET) }
export async function setTenantFeatures(_orgId: OrgId, _features: Partial<OrgConfig["features"]>, _opts: WriteOpts): Promise<WriteResult<OrgConfig["features"]>> { throw new Error(NOT_YET) }
export async function setTenantStatus(_orgId: OrgId, _status: OrgConfig["status"], _opts: WriteOpts): Promise<WriteResult<OrgConfig["status"]>> { throw new Error(NOT_YET) }

export async function listTenantMembersForPlatform(_orgId: OrgId, _opts?: { role?: TenantRole }): Promise<TenantMember[]> { throw new Error(NOT_YET) }
export async function setTenantMemberRole(_orgId: OrgId, _who: { uid?: string; email?: string }, _role: Exclude<TenantRole, "denied">, _opts: WriteOpts): Promise<WriteResult<TenantMember>> { throw new Error(NOT_YET) }
export async function removeTenantMember(_orgId: OrgId, _uid: string, _opts: WriteOpts): Promise<WriteResult<TenantMember>> { throw new Error(NOT_YET) }
export async function inviteTenantAdmin(_orgId: OrgId, _email: string, _role: Invite["role"], _opts: WriteOpts): Promise<WriteResult<Invite>> { throw new Error(NOT_YET) }
export async function listInvites(_orgId: OrgId): Promise<Invite[]> { throw new Error(NOT_YET) }
/** Called when the invited person signs in at the tenant's address and opens the link. */
export async function acceptInvite(_token: string, _uid: string, _email: string | null): Promise<{ orgId: OrgId; role: Invite["role"] }> { throw new Error(NOT_YET) }

export async function listCollections(_orgId?: OrgId): Promise<CollectionRecord[]> { throw new Error(NOT_YET) }
export async function setCollectionSharing(_collectionId: string, _sharing: { visibility: CollectionRecord["visibility"]; sharedWith: OrgId[] }, _opts: WriteOpts): Promise<WriteResult<CollectionRecord>> { throw new Error(NOT_YET) }
export async function assignCollection(_collectionId: string, _orgId: OrgId, _assigned: boolean, _opts: WriteOpts): Promise<WriteResult<CollectionRecord>> { throw new Error(NOT_YET) }

/** Short-lived (≤ 60 min) read-only MCP bearer for a tenant, for "view as". */
export async function mintTenantViewBearer(_orgId: OrgId, _minutes: number, _actor: Actor): Promise<{ token: string; tokenId: string; expiresAt: string }> { throw new Error(NOT_YET) }

export async function listPlatformActivity(_q?: { orgId?: OrgId; since?: string; limit?: number }): Promise<PlatformAuditEntry[]> { throw new Error(NOT_YET) }
export async function recordPlatformAudit(_e: Omit<PlatformAuditEntry, "id" | "at">): Promise<string> { throw new Error(NOT_YET) }
