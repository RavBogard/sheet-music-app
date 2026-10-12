import "server-only"
import type { Firestore } from "firebase-admin/firestore"
import { initAdmin, getAuth, getFirestore } from "@/lib/firebase-admin"
import type { OrgId } from "@/lib/org/types"
import { rowOrgIds } from "@/lib/org/membership"
import { capRoleToClaims } from "@/lib/roles"
import {
    asTenantRole,
    membershipId,
    roleRank,
    type Membership,
    type TenantRole,
} from "@/lib/org/membership-types"

/**
 * Multi-tenant phase 2: one server API for "what may this person do in this
 * tenant". Web routes pass the host tenant (x-org-id); MCP passes the token's
 * tenant. Design: docs/planning/2026-10-12-multitenant/work/P2-design.md §3.3.
 *
 * Transition (§3.5, server side): membership missing AND users/{uid}
 * .membershipsMigratedAt absent → `source:'legacy'` with today's tenant-blind
 * role (users doc role, or the caller's legacy claims when supplied). Missing
 * and migrated → no role. No cross-request cache for memberships (removal is
 * immediate for routes and MCP); only platform/owners is memoised (60 s).
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

function adminDb(db?: Firestore): Firestore {
    if (db) return db
    initAdmin()
    return getFirestore()
}

export async function getTenantAccess(
    uid: string,
    orgId: OrgId,
    opts?: {
        db?: Firestore
        /**
         * Legacy-path role source. When the person is not migrated yet, routes
         * that authorised from the ID-token claim before phase 2 (requireAuth,
         * reader music, backups) pass the decoded token here so the legacy
         * answer is byte-for-byte today's; omitted → users/{uid} doc (what
         * readUserRole / getServerUser read).
         */
        legacyClaims?: Record<string, unknown> | null
    },
): Promise<TenantAccess> {
    const db = adminDb(opts?.db)
    const [memSnap, userSnap, po] = await Promise.all([
        db.collection("memberships").doc(membershipId(orgId, uid)).get(),
        db.collection("users").doc(uid).get(),
        isPlatformOwner(uid, db),
    ])
    const user = userSnap.exists ? ((userSnap.data() ?? {}) as Record<string, unknown>) : null
    const canUpload = user?.canUpload === true

    let role: TenantRole | null = null
    let soundEngineer = false
    let source: TenantAccess["source"] = "none"

    // A membership doc without a valid role is treated as absent (server
    // writes always carry one; this keeps a malformed doc from deciding).
    const mem = memSnap.exists ? ((memSnap.data() ?? {}) as Record<string, unknown>) : null
    const memRole = mem ? asTenantRole(mem.role) : null
    if (mem && memRole) {
        role = memRole
        soundEngineer = mem.soundEngineer === true && roleRank(role) >= roleRank("member")
        source = "membership"
    } else if (!user?.membershipsMigratedAt) {
        const lc = opts?.legacyClaims
        if (lc) {
            role = asTenantRole(lc.role)
            soundEngineer = lc.soundEngineer === true
        } else {
            role = asTenantRole(user?.role)
            soundEngineer = user?.soundEngineer === true
        }
        source = role ? "legacy" : "none"
    }

    return {
        uid,
        orgId,
        role,
        effectiveRole: po ? "admin" : role,
        soundEngineer,
        canUpload,
        po,
        source,
    }
}

/** po → true; denied/null → false; else role rank ≥ min. */
export function hasTenantRole(a: TenantAccess, min: Exclude<TenantRole, "denied">): boolean {
    if (a.po) return true
    if (!a.role || a.role === "denied") return false
    return roleRank(a.role) >= roleRank(min)
}

/** effectiveRole ?? undefined — drop-in replacement for readUserRole(db, uid). */
export async function readTenantRole(db: Firestore, uid: string, orgId: OrgId): Promise<string | undefined> {
    const a = await getTenantAccess(uid, orgId, { db })
    return a.effectiveRole ?? undefined
}

const OWNERS_TTL_MS = 60_000
let ownersMemo: { at: number; db: Firestore; uids: ReadonlySet<string> } | null = null

/** platform/owners, memoised 60 s. */
export async function isPlatformOwner(uid: string, db?: Firestore): Promise<boolean> {
    const d = adminDb(db)
    const now = Date.now()
    if (!ownersMemo || ownersMemo.db !== d || now - ownersMemo.at > OWNERS_TTL_MS) {
        const snap = await d.collection("platform").doc("owners").get()
        const raw = snap.exists ? snap.data()?.uids : null
        const uids = Array.isArray(raw) ? raw.filter((u): u is string => typeof u === "string") : []
        ownersMemo = { at: now, db: d, uids: new Set(uids) }
    }
    return ownersMemo.uids.has(uid)
}

/** Test seam: forget the memoised owner list. */
export function __resetPlatformOwnerMemo(): void {
    ownersMemo = null
}

/**
 * Members of a tenant with their users/{uid} profile. Includes not-yet-migrated
 * people synthesised from the legacy users doc (role in each tenant of the doc's
 * orgIds, missing → crc — exactly what the rosters filtered on before phase 2),
 * marked `addedBy: "legacy"`. `roles` filters by membership role.
 */
export async function listTenantMembers(
    orgId: OrgId,
    opts?: { roles?: TenantRole[]; db?: Firestore },
): Promise<Array<Membership & { profile: Record<string, unknown> | null }>> {
    const db = adminDb(opts?.db)
    const [memSnap, usersSnap] = await Promise.all([
        db.collection("memberships").where("tenantId", "==", orgId).get(),
        db.collection("users").get(),
    ])
    const profiles = new Map<string, Record<string, unknown>>()
    for (const d of usersSnap.docs) profiles.set(d.id, (d.data() ?? {}) as Record<string, unknown>)

    const wanted = opts?.roles ? new Set<string>(opts.roles) : null
    const out: Array<Membership & { profile: Record<string, unknown> | null }> = []
    const seen = new Set<string>()
    for (const d of memSnap.docs) {
        const m = d.data() as Membership
        seen.add(m.uid)
        if (wanted && !wanted.has(m.role)) continue
        out.push({ ...m, profile: profiles.get(m.uid) ?? null })
    }
    for (const [uid, p] of profiles) {
        if (seen.has(uid) || p.membershipsMigratedAt) continue
        const role = asTenantRole(p.role)
        if (!role || !rowOrgIds(p.orgIds).includes(orgId)) continue
        if (wanted && !wanted.has(role)) continue
        out.push({
            uid,
            tenantId: orgId,
            role,
            soundEngineer: p.soundEngineer === true,
            addedBy: "legacy",
            addedAt: (p.createdAt as Membership["addedAt"]) ?? new Date(0),
            profile: p,
        })
    }
    return out
}

/**
 * The role the `__session_role` companion cookie carries for `orgId`
 * (design §3.4): the tenant role from the membership (po → admin). While the
 * person is unmigrated (legacy source) the P0 rule still holds — the users-doc
 * role, never above what the account's claims grant (stored or token claim).
 */
export async function resolveSessionRole(
    uid: string,
    orgId: OrgId,
    tokenRole?: string | null,
    opts?: { db?: Firestore },
): Promise<string | null> {
    const access = await getTenantAccess(uid, orgId, opts)
    if (access.po || access.source !== "legacy") return access.effectiveRole
    if (!access.role) return null
    const rec = await getAuth().getUser(uid)
    return capRoleToClaims(access.role, rec.customClaims?.role as string | undefined, tokenRole ?? undefined) ?? null
}
