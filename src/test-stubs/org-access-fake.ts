/**
 * Test double for `@/lib/org/access` (multi-tenant phase 2), implementing the
 * behaviour in docs/planning/2026-10-12-multitenant/work/P2-design.md §3.3
 * against whatever Firestore the test hands it (a fake, or the emulator):
 *
 *   - platform owner (`platform/owners.uids` contains uid) → effectiveRole admin;
 *   - membership `memberships/{org}__{uid}` → its role / soundEngineer;
 *   - no membership and `users/{uid}.membershipsMigratedAt` absent → legacy
 *     `users/{uid}.role` / `.soundEngineer` (tenant-blind, exactly the old
 *     users-doc role read);
 *   - no membership and migrated → null (not a member).
 *
 * Usage in a test file:
 *   vi.mock("@/lib/org/access", () => import("@/test-stubs/org-access-fake"))
 *
 * Reads that a hand-rolled fake DB does not model (a collection it throws on)
 * count as "absent", so legacy fakes that only know `users/{uid}` keep working.
 */
import { getFirestore } from "@/lib/firebase-admin"
import type { OrgId } from "@/lib/org/types"
import type { Membership, TenantRole } from "@/lib/org/membership-types"
import type { TenantAccess } from "@/lib/org/access"

export type { Membership, TenantRole } from "@/lib/org/membership-types"
export type { TenantAccess } from "@/lib/org/access"
export { membershipId } from "@/lib/org/membership-types"

type DB = FirebaseFirestore.Firestore

const RANK: Record<Exclude<TenantRole, "denied">, number> = {
    admin: 4,
    band_leader: 3,
    musician: 2,
    member: 1,
    pending: 0,
}

async function readDoc(db: DB, col: string, id: string): Promise<Record<string, unknown> | null> {
    try {
        const snap = await db.collection(col).doc(id).get()
        if (!snap || !snap.exists) return null
        return (snap.data() ?? {}) as Record<string, unknown>
    } catch {
        return null
    }
}

export async function isPlatformOwner(uid: string, db?: DB): Promise<boolean> {
    const d = await readDoc(db ?? getFirestore(), "platform", "owners")
    return Array.isArray(d?.uids) && (d!.uids as unknown[]).includes(uid)
}

export async function getTenantAccess(
    uid: string,
    orgId: OrgId,
    opts?: { db?: DB; legacyClaims?: Record<string, unknown> | null },
): Promise<TenantAccess> {
    const db = opts?.db ?? getFirestore()
    const [m, u, po] = await Promise.all([
        readDoc(db, "memberships", `${orgId}__${uid}`),
        readDoc(db, "users", uid),
        isPlatformOwner(uid, db),
    ])
    let role: TenantRole | null = null
    let soundEngineer = false
    let source: TenantAccess["source"] = "none"
    if (m && typeof m.role === "string") {
        role = m.role as TenantRole
        soundEngineer = m.soundEngineer === true
        source = "membership"
    } else if (!u?.membershipsMigratedAt) {
        // Same as the real module: unmigrated → the token's legacy claims when
        // the caller passes them (requireAuth), else the users-doc role.
        const lc = opts?.legacyClaims
        const src = lc ?? u
        role = src && typeof src.role === "string" ? (src.role as TenantRole) : null
        soundEngineer = src?.soundEngineer === true
        source = role ? "legacy" : "none"
    }
    return {
        uid,
        orgId,
        role,
        effectiveRole: po ? "admin" : role,
        soundEngineer,
        canUpload: u?.canUpload === true,
        po,
        source,
    }
}

export function hasTenantRole(a: TenantAccess, min: Exclude<TenantRole, "denied">): boolean {
    if (a.po) return true
    const r = a.role
    if (!r || r === "denied" || !(r in RANK)) return false
    return RANK[r as keyof typeof RANK] >= RANK[min]
}

export async function readTenantRole(db: DB, uid: string, orgId: OrgId): Promise<string | undefined> {
    return (await getTenantAccess(uid, orgId, { db })).effectiveRole ?? undefined
}

/**
 * Members of `orgId` (optionally filtered by role), each with its users/{uid}
 * profile. Membership docs first; unmigrated users (no membershipsMigratedAt)
 * fall back to their legacy users doc when its `orgIds` (missing → ['crc'])
 * contains the tenant — the transition behaviour the design needs so rosters
 * are not empty before the people migration runs.
 */
export async function listTenantMembers(
    orgId: OrgId,
    opts?: { roles?: TenantRole[] },
): Promise<Array<Membership & { profile: Record<string, unknown> | null }>> {
    const db = getFirestore()
    const want = opts?.roles
    const out: Array<Membership & { profile: Record<string, unknown> | null }> = []
    const seen = new Set<string>()
    try {
        const ms = await db.collection("memberships").where("tenantId", "==", orgId).get()
        for (const d of ms.docs) {
            const m = d.data() as Membership
            if (want && !want.includes(m.role)) continue
            seen.add(m.uid)
            out.push({ ...m, profile: await readDoc(db, "users", m.uid) })
        }
    } catch {
        /* fake DB without memberships */
    }
    try {
        const us = await db.collection("users").get()
        for (const d of us.docs) {
            if (seen.has(d.id)) continue
            const u = (d.data() ?? {}) as Record<string, unknown>
            if (u.membershipsMigratedAt) continue
            const ids = Array.isArray(u.orgIds) && u.orgIds.length > 0 ? (u.orgIds as string[]) : ["crc"]
            if (!ids.includes(orgId)) continue
            if (typeof u.role !== "string") continue
            const role = u.role as TenantRole
            if (want && !want.includes(role)) continue
            out.push({
                uid: d.id,
                tenantId: orgId,
                role,
                soundEngineer: u.soundEngineer === true,
                addedBy: "legacy",
                addedAt: new Date(0),
                profile: u,
            })
        }
    } catch {
        /* fake DB without a users list */
    }
    return out
}

/**
 * Tenant-aware membership (mirrors access.ts getTenantMembership): membership
 * doc; migrated → null; unmigrated → legacy role in its users-doc tenants
 * (missing → crc; a legacy admin is crc-only).
 */
export async function getTenantMembership(
    uid: string,
    orgId: OrgId,
    opts?: { db?: DB },
): Promise<{ role: TenantRole; soundEngineer: boolean } | null> {
    const db = opts?.db ?? getFirestore()
    const [m, u] = await Promise.all([readDoc(db, "memberships", `${orgId}__${uid}`), readDoc(db, "users", uid)])
    if (m && typeof m.role === "string") return { role: m.role as TenantRole, soundEngineer: m.soundEngineer === true }
    if (!u || u.membershipsMigratedAt || typeof u.role !== "string") return null
    const tenants = u.role === "admin" ? ["crc"] : Array.isArray(u.orgIds) && u.orgIds.length ? (u.orgIds as string[]) : ["crc"]
    return tenants.includes(orgId) ? { role: u.role as TenantRole, soundEngineer: u.soundEngineer === true } : null
}
