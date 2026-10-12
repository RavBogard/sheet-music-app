import "server-only"
import type { Auth } from "firebase-admin/auth"
import type { Firestore } from "firebase-admin/firestore"
import { FieldValue } from "firebase-admin/firestore"
import { initAdmin, getAuth, getFirestore } from "@/lib/firebase-admin"
import { ROLE_CODE, roleRank, type Membership } from "@/lib/org/membership-types"
import { sortTenants } from "@/lib/org/legacy-membership-map"
export { ROLE_CODE } from "@/lib/org/membership-types"

/**
 * Multi-tenant phase 2: the ONLY writer of custom claims (grep gate:
 * `src/lib/org/__tests__/claims-writer-gate.test.ts`). Rebuilds
 * {po?, m, se?} from memberships and keeps the legacy role/orgIds/soundEngineer
 * claims during the changeover. Design §3.2.
 */

export const CLAIMS_BYTE_LIMIT = 900

/** Claim keys this module owns; every other key in the previous claims is preserved. */
const OWNED_KEYS = ["po", "m", "se", "role", "orgIds", "soundEngineer"] as const

const APPROVED = new Set(["admin", "band_leader", "musician", "member"])

/** Pure: previous claims + this person's memberships + po → new claims. Throws over the byte limit. */
export function buildClaims(prev: Record<string, unknown>, memberships: Membership[], po: boolean): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(prev ?? {})) {
        if (!(OWNED_KEYS as readonly string[]).includes(k)) out[k] = v
    }

    const live = memberships.filter((m) => m && m.role !== "denied" && m.role in ROLE_CODE)
    const byTenant = new Map(live.map((m) => [m.tenantId, m]))
    const tenants = sortTenants(byTenant.keys())

    const m: Record<string, string> = {}
    for (const t of tenants) m[t] = ROLE_CODE[byTenant.get(t)!.role as keyof typeof ROLE_CODE]
    const se = tenants.filter((t) => {
        const mm = byTenant.get(t)!
        return mm.soundEngineer === true && APPROVED.has(mm.role)
    })
    const orgIds = tenants.filter((t) => APPROVED.has(byTenant.get(t)!.role))
    let highest: string | undefined
    for (const t of tenants) {
        const r = byTenant.get(t)!.role
        if (roleRank(r) > roleRank(highest)) highest = r
    }

    if (po) out.po = true
    out.m = m
    if (se.length > 0) out.se = se
    if (highest) out.role = highest
    if (orgIds.length > 0) out.orgIds = orgIds
    if (se.length > 0) out.soundEngineer = true

    const bytes = JSON.stringify(out).length
    if (bytes > CLAIMS_BYTE_LIMIT) {
        throw new Error(`claims for this account would be ${bytes} bytes (limit ${CLAIMS_BYTE_LIMIT}); refusing to write`)
    }
    return out
}

/** Order-insensitive serialisation (object keys sorted, arrays kept in order). */
export function canonicalClaims(v: unknown): string {
    if (Array.isArray(v)) return `[${v.map(canonicalClaims).join(",")}]`
    if (v && typeof v === "object") {
        const o = v as Record<string, unknown>
        return `{${Object.keys(o)
            .sort()
            .filter((k) => o[k] !== undefined)
            .map((k) => `${JSON.stringify(k)}:${canonicalClaims(o[k])}`)
            .join(",")}}`
    }
    return JSON.stringify(v)
}

export interface ClaimsDeps {
    db?: Firestore
    auth?: Auth
}

function deps(d?: ClaimsDeps): { db: Firestore; auth: Auth } {
    if (d?.db && d?.auth) return { db: d.db, auth: d.auth }
    initAdmin()
    return { db: d?.db ?? getFirestore(), auth: d?.auth ?? getAuth() }
}

/** Reads every membership of `uid` (server). */
export async function readMemberships(db: Firestore, uid: string): Promise<Membership[]> {
    const snap = await db.collection("memberships").where("uid", "==", uid).get()
    return snap.docs.map((d) => d.data() as Membership)
}

/** platform/owners → uid list (no memo; claims must see the current list). */
export async function readOwners(db: Firestore): Promise<string[]> {
    const snap = await db.collection("platform").doc("owners").get()
    const uids = snap.exists ? snap.data()?.uids : null
    return Array.isArray(uids) ? uids.filter((u): u is string => typeof u === "string") : []
}

/**
 * Reads memberships + platform/owners, writes claims, mirrors legacy fields on
 * users/{uid}; revokes refresh tokens on removal. `set` merges extra
 * non-identity claims (e.g. `admin_test`) before the rebuild.
 */
export async function rebuildClaims(
    uid: string,
    opts?: { revoke?: boolean; set?: Record<string, unknown> } & ClaimsDeps,
): Promise<{ claims: Record<string, unknown>; bytes: number; changed: boolean }> {
    const { db, auth } = deps(opts)
    const [memberships, owners, user] = await Promise.all([readMemberships(db, uid), readOwners(db), auth.getUser(uid)])
    const current = (user.customClaims ?? {}) as Record<string, unknown>
    const claims = buildClaims({ ...current, ...(opts?.set ?? {}) }, memberships, owners.includes(uid))
    const bytes = JSON.stringify(claims).length
    const changed = canonicalClaims(current) !== canonicalClaims(claims)
    if (changed) await auth.setCustomUserClaims(uid, claims)

    // Legacy mirrors so unconverted readers stay correct; claimsUpdatedAt makes
    // open clients force-refresh their ID token (auth-context).
    const mirror: Record<string, unknown> = {
        role: typeof claims.role === "string" ? claims.role : "pending",
        orgIds: Array.isArray(claims.orgIds) ? claims.orgIds : FieldValue.delete(),
        soundEngineer: claims.soundEngineer === true,
    }
    if (changed) mirror.claimsUpdatedAt = FieldValue.serverTimestamp()
    await db.collection("users").doc(uid).set(mirror, { merge: true })

    if (opts?.revoke) await auth.revokeRefreshTokens(uid)
    return { claims, bytes, changed }
}

/**
 * Undo path only (`migrate-memberships --undo`): put back a manifest's
 * recorded claims exactly as they were. Not for normal role changes.
 */
export async function restoreClaimsVerbatim(uid: string, claims: Record<string, unknown> | null, d?: ClaimsDeps): Promise<void> {
    const { auth } = deps(d)
    await auth.setCustomUserClaims(uid, claims)
}
