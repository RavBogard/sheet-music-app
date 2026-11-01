import "server-only"
import type { Auth } from "firebase-admin/auth"
import type { Firestore } from "firebase-admin/firestore"
import { FieldValue } from "firebase-admin/firestore"
import { initAdmin, getAuth, getFirestore } from "@/lib/firebase-admin"
import type { OrgId } from "@/lib/org/types"
import { membershipId, type Membership, type TenantRole } from "@/lib/org/membership-types"
import { planLegacyMemberships, type MembershipOverrides, type LegacyPlan } from "@/lib/org/legacy-membership-map"
import { readOwners, rebuildClaims } from "@/lib/org/claims"

/**
 * Multi-tenant phase 2: every membership change goes through setMembership
 * (migrate-on-touch → transaction with audit row → rebuildClaims). Design §3.3.
 */

export type MembershipChangeReason = "set-role" | "join" | "migration" | "sound-engineer" | "remove" | "test-account"

export interface MigrationPlanEntry {
    uid: string
    memberships: Array<{ orgId: OrgId; role: TenantRole; soundEngineer: boolean }>
    po: boolean
    alreadyMigrated: boolean
}

interface Deps {
    db?: Firestore
    auth?: Auth
}

function deps(d?: Deps): { db: Firestore; auth: Auth } {
    if (d?.db && d?.auth) return { db: d.db, auth: d.auth }
    initAdmin()
    return { db: d?.db ?? getFirestore(), auth: d?.auth ?? getAuth() }
}

/** Audit `action` per reason (role change rows keep the pre-P2 name). */
export const MEMBERSHIP_AUDIT_ACTION: Record<MembershipChangeReason, string> = {
    "set-role": "ROLE_CHANGE",
    join: "MEMBERSHIP_REQUESTED",
    migration: "MEMBERSHIP_MIGRATED",
    "sound-engineer": "SOUND_ENGINEER_CHANGE",
    remove: "MEMBERSHIP_REMOVED",
    "test-account": "TEST_ACCOUNT_MEMBERSHIP",
}

function addedByFor(reason: MembershipChangeReason, actorUid: string): string {
    if (reason === "join") return "self-join"
    if (reason === "migration") return "migration"
    if (reason === "test-account") return "test-account"
    return actorUid
}

export async function readMigrationOverrides(db: Firestore): Promise<MembershipOverrides> {
    const snap = await db.collection("platform").doc("membershipMigration").get()
    const ov = snap.exists ? snap.data()?.overrides : null
    return ov && typeof ov === "object" ? (ov as MembershipOverrides) : {}
}

export async function setMembership(
    a: {
        orgId: OrgId
        uid: string
        /** null removes the membership. */
        role: TenantRole | null
        soundEngineer?: boolean
        actorUid: string
        reason: MembershipChangeReason
        /** Added P2: recorded on the audit row. */
        actorEmail?: string
        /** Added P2: extra non-identity claims merged before the rebuild (e.g. admin_test). */
        extraClaims?: Record<string, unknown>
        /** Free-text reason the actor gave; recorded on the audit row. */
        note?: string
        /** Where the change came from when not the web app (e.g. "mcp"); recorded on the audit row. */
        via?: string
    },
    d?: Deps,
): Promise<{ before: Membership | null; after: Membership | null; claims: Record<string, unknown> }> {
    const { db, auth } = deps(d)
    await ensureMembershipsMigrated(a.uid, { db, auth })

    const ref = db.collection("memberships").doc(membershipId(a.orgId, a.uid))
    const { before, after } = await db.runTransaction(async (txn) => {
        const snap = await txn.get(ref)
        const before = snap.exists ? (snap.data() as Membership) : null
        let after: Membership | null
        if (a.role === null) {
            after = null
            if (before) txn.delete(ref)
        } else if (before) {
            const se = a.soundEngineer ?? before.soundEngineer === true
            if (before.role === a.role && (before.soundEngineer === true) === se) {
                return { before, after: before, unchanged: true }
            }
            const patch: Record<string, unknown> = {
                role: a.role,
                soundEngineer: se,
                updatedBy: a.actorUid,
                updatedAt: FieldValue.serverTimestamp(),
            }
            txn.update(ref, patch)
            after = { ...before, ...(patch as Partial<Membership>) }
        } else {
            const doc: Record<string, unknown> = {
                uid: a.uid,
                tenantId: a.orgId,
                role: a.role,
                soundEngineer: a.soundEngineer === true,
                addedBy: addedByFor(a.reason, a.actorUid),
                addedAt: FieldValue.serverTimestamp(),
            }
            if (a.reason === "join") doc.requestedAt = FieldValue.serverTimestamp()
            txn.create(ref, doc)
            after = doc as unknown as Membership
        }
        if (!before && !after) return { before, after, unchanged: true }
        txn.create(db.collection("auditLogs").doc(), {
            action: a.role === null && a.reason === "set-role" ? MEMBERSHIP_AUDIT_ACTION.remove : MEMBERSHIP_AUDIT_ACTION[a.reason],
            orgId: a.orgId,
            targetUserId: a.uid,
            previousRole: before?.role ?? null,
            newRole: a.role,
            ...(a.soundEngineer !== undefined ? { soundEngineer: a.soundEngineer } : {}),
            reason: a.reason,
            actorUid: a.actorUid,
            actorEmail: a.actorEmail ?? "unknown",
            ...(a.note ? { note: a.note } : {}),
            ...(a.via ? { via: a.via } : {}),
            timestamp: FieldValue.serverTimestamp(),
        })
        return { before, after }
    })

    const { claims } = await rebuildClaims(a.uid, {
        db,
        auth,
        revoke: a.role === null && before !== null,
        set: a.extraClaims,
    })
    return { before, after, claims }
}

/**
 * Migrate-on-touch: if users/{uid}.membershipsMigratedAt is absent, create the
 * memberships `planLegacyMemberships` derives (no pending rule — §3.3), stamp the
 * marker and rebuild claims. Idempotent; concurrent callers converge (the marker
 * is checked inside the transaction and memberships are only created if absent).
 */
export async function ensureMembershipsMigrated(
    uid: string,
    opts?: { dryRun?: boolean } & Deps,
): Promise<MigrationPlanEntry> {
    const { db, auth } = deps(opts)
    const userRef = db.collection("users").doc(uid)
    const userSnap = await userRef.get()
    const doc = userSnap.exists ? ((userSnap.data() ?? {}) as Record<string, unknown>) : null

    if (doc?.membershipsMigratedAt) {
        const [mems, owners] = await Promise.all([
            db.collection("memberships").where("uid", "==", uid).get(),
            readOwners(db),
        ])
        return {
            uid,
            memberships: mems.docs.map((m) => {
                const x = m.data() as Membership
                return { orgId: x.tenantId, role: x.role, soundEngineer: x.soundEngineer === true }
            }),
            po: owners.includes(uid),
            alreadyMigrated: true,
        }
    }

    let claims: Record<string, unknown> = {}
    try {
        claims = ((await auth.getUser(uid)).customClaims ?? {}) as Record<string, unknown>
    } catch {
        claims = {}
    }
    const [overrides, owners] = await Promise.all([readMigrationOverrides(db), readOwners(db)])
    const plan: LegacyPlan = planLegacyMemberships({ uid, claims, doc, overrides, owners })
    const entry: MigrationPlanEntry = { uid, memberships: plan.memberships, po: plan.po, alreadyMigrated: false }
    if (opts?.dryRun) return entry

    const migrated = await db.runTransaction(async (txn) => {
        const fresh = await txn.get(userRef)
        if (fresh.exists && fresh.data()?.membershipsMigratedAt) return false
        const refs = plan.memberships.map((m) => db.collection("memberships").doc(membershipId(m.orgId, uid)))
        const snaps = refs.length > 0 ? await txn.getAll(...refs) : []
        plan.memberships.forEach((m, i) => {
            if (snaps[i].exists) return
            txn.create(refs[i], {
                uid,
                tenantId: m.orgId,
                role: m.role,
                soundEngineer: m.soundEngineer,
                addedBy: "migration",
                addedAt: FieldValue.serverTimestamp(),
            })
        })
        txn.set(userRef, { membershipsMigratedAt: FieldValue.serverTimestamp() }, { merge: true })
        return true
    })
    if (migrated) await rebuildClaims(uid, { db, auth })
    return { ...entry, alreadyMigrated: !migrated }
}
