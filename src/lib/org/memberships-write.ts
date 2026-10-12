import "server-only"
import type { OrgId } from "@/lib/org/types"
import type { Membership, TenantRole } from "@/lib/org/membership-types"

/**
 * Multi-tenant phase 2: every membership change goes through setMembership
 * (migrate-on-touch → transaction with audit row → rebuildClaims). Design §3.3.
 * SIGNATURES ONLY in this commit.
 */
const NOT_YET = "multi-tenant phase 2: memberships-write.ts not implemented yet (lane 2)"

export type MembershipChangeReason = "set-role" | "join" | "migration" | "sound-engineer" | "remove" | "test-account"

export interface MigrationPlanEntry {
    uid: string
    memberships: Array<{ orgId: OrgId; role: TenantRole; soundEngineer: boolean }>
    po: boolean
    alreadyMigrated: boolean
}

export async function setMembership(_a: {
    orgId: OrgId
    uid: string
    /** null removes the membership. */
    role: TenantRole | null
    soundEngineer?: boolean
    actorUid: string
    reason: MembershipChangeReason
}): Promise<{ before: Membership | null; after: Membership | null; claims: Record<string, unknown> }> {
    throw new Error(NOT_YET)
}

export async function ensureMembershipsMigrated(_uid: string, _opts?: { dryRun?: boolean }): Promise<MigrationPlanEntry> {
    throw new Error(NOT_YET)
}
