import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"
import { asTenantRole, roleRank, type TenantRole } from "@/lib/org/membership-types"

/**
 * Multi-tenant phase 2 (design §3.3, §6.2; ruling 5): PURE mapping from the
 * legacy identity (custom claims + users/{uid} doc) to per-tenant memberships.
 *
 * Used by `ensureMembershipsMigrated` (migrate-on-touch) and by the one-time
 * `scripts/ops/multitenant/migrate-memberships.ts`. No Firestore, no Auth.
 *
 *  - claim `role` absent (never approved) → no memberships, unless
 *    `includePending` (the one-time script): then doc role `denied` → denied,
 *    otherwise pending in doc orgIds ∪ claim orgIds.
 *  - claim `admin` → admin of crc only (ruling 5).
 *  - any other claim role R → R in each tenant of the claim orgIds (missing → crc).
 *  - `overrides[uid]` (platform/membershipMigration data) set/raise per tenant.
 *  - legacy soundEngineer → soundEngineer:true on memberships with role ≥ member.
 *  - po iff uid ∈ owners.
 */

export interface PlannedMembership {
    orgId: OrgId
    role: TenantRole
    soundEngineer: boolean
}

export type MembershipOverrides = Record<string, Record<string, string>>

export interface LegacyPlanInput {
    uid: string
    claims: Record<string, unknown> | null | undefined
    doc: Record<string, unknown> | null | undefined
    overrides?: MembershipOverrides | null
    owners?: readonly string[] | null
    /** One-time script only: plan pending/denied memberships for never-approved accounts. */
    includePending?: boolean
}

export interface LegacyPlan {
    uid: string
    memberships: PlannedMembership[]
    po: boolean
    flags: string[]
}

function stringList(raw: unknown): string[] | null {
    if (!Array.isArray(raw)) return null
    const out = raw.filter((v): v is string => typeof v === "string" && v.length > 0)
    return out.length > 0 ? out : null
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
    const sa = new Set(a)
    const sb = new Set(b)
    if (sa.size !== sb.size) return false
    for (const v of sa) if (!sb.has(v)) return false
    return true
}

/** crc first, then alphabetical — the order claims and plans are written in. */
export function sortTenants<T extends string>(ids: Iterable<T>): T[] {
    return [...new Set(ids)].sort((a, b) =>
        a === DEFAULT_ORG_ID ? -1 : b === DEFAULT_ORG_ID ? 1 : a < b ? -1 : a > b ? 1 : 0,
    )
}

export function planLegacyMemberships(input: LegacyPlanInput): LegacyPlan {
    const { uid } = input
    const claims = input.claims ?? {}
    const doc = input.doc ?? null
    const flags: string[] = []
    const roles = new Map<OrgId, TenantRole>()

    const claimRole = typeof claims.role === "string" && claims.role ? claims.role : null
    const claimOrgIdsRaw = stringList(claims.orgIds)
    const claimOrgIds: OrgId[] = claimOrgIdsRaw ?? [DEFAULT_ORG_ID]
    const docRole = doc && typeof doc.role === "string" ? doc.role : null
    const docOrgIdsRaw = doc ? stringList(doc.orgIds) : null

    if (doc && (docRole ?? "pending") !== (claimRole ?? "pending")) flags.push("doc_role≠claim")
    if (doc && docOrgIdsRaw && !sameSet(docOrgIdsRaw, claimOrgIds)) flags.push("doc_orgIds≠claim")

    const approvedClaimRole = claimRole && claimRole !== "pending" && claimRole !== "denied" ? asTenantRole(claimRole) : null

    if (approvedClaimRole === "admin") {
        roles.set(DEFAULT_ORG_ID, "admin")
        if (claimOrgIds.some((o) => o !== DEFAULT_ORG_ID)) flags.push("ruling5_admin_crc_only")
    } else if (approvedClaimRole) {
        for (const o of claimOrgIds) roles.set(o, approvedClaimRole)
    } else if (input.includePending) {
        // Never-approved (or claim pending/denied) account, one-time script only.
        const denied = docRole === "denied" || claimRole === "denied"
        const tenants = sortTenants([...(docOrgIdsRaw ?? []), ...claimOrgIds])
        for (const o of tenants) roles.set(o, denied ? "denied" : "pending")
        if (!denied && docOrgIdsRaw && docOrgIdsRaw.length > 1 && !claimRole) flags.push("pending_default_both")
    } else if (claimRole === "pending") {
        // Migrate-on-touch: an explicit pending claim stays pending where it was.
        for (const o of claimOrgIds) roles.set(o, "pending")
    }

    const ov = input.overrides?.[uid]
    if (ov && typeof ov === "object") {
        let applied = false
        for (const [tenant, raw] of Object.entries(ov)) {
            const r = asTenantRole(raw)
            if (!r) continue
            roles.set(tenant, r)
            applied = true
        }
        if (applied) flags.push("override_applied")
    }

    const legacySE = claims.soundEngineer === true || (doc?.soundEngineer === true)
    if (doc && (claims.soundEngineer === true) !== (doc.soundEngineer === true)) flags.push("se_doc≠claim")

    const memberships: PlannedMembership[] = sortTenants(roles.keys()).map((orgId) => {
        const role = roles.get(orgId)!
        return { orgId, role, soundEngineer: legacySE && roleRank(role) >= roleRank("member") }
    })
    if (legacySE && memberships.some((m) => m.role === "member" || m.role === "pending")) {
        flags.push("se_on_member_or_pending")
    }

    const po = !!input.owners?.includes(uid)
    return { uid, memberships, po, flags }
}
