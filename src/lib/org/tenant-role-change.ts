import "server-only"
import { FieldValue } from "firebase-admin/firestore"
import { getAuth, getFirestore, initAdmin } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"
import type { OrgId } from "@/lib/org/types"
import type { Membership, TenantRole } from "@/lib/org/membership-types"
import { getTenantMembership, listTenantMembers } from "@/lib/org/access"
import { LastAdminError, setMembership } from "@/lib/org/memberships-write"

/**
 * One person's role change in ONE tenant — the server logic behind the
 * /manage People tab (POST /api/admin/set-role) and the MCP `set_member_role`
 * tool. Both callers check that the CALLER is an admin of the tenant first;
 * this function then applies the shared refusals, writes through
 * setMembership (membership + audit row + claims rebuild) and leaves the
 * in-app "role changed" notification. It sends no email, SMS or push.
 *
 * Refusals, in this order:
 *   SELF_CHANGE    the caller is the target (platform owner exempt unless strict)
 *   USER_NOT_FOUND no Auth account; or, with `memberOnly`, no membership in
 *                  this tenant (another tenant's people are invisible)
 *   LAST_ADMIN     the target is the tenant's last admin and the new role is
 *                  not admin (platform owner exempt unless strict)
 *
 * `dryRun` reads only: it reports the before/after roles and writes nothing,
 * not even the migrate-on-touch a real change performs. Both runs decide on
 * the same read-only membership answer, taken before any write.
 */

export type RoleChangeCode = "SELF_CHANGE" | "USER_NOT_FOUND" | "LAST_ADMIN"

export interface RoleChangeInput {
    orgId: OrgId
    targetUid: string
    /** null removes the membership (route only). */
    newRole: TenantRole | null
    actorUid: string
    actorEmail?: string
    /** The caller is a platform owner (route: exempts self-change and last-admin). */
    po?: boolean
    /** Apply the self-change and last-admin refusals even to a platform owner. */
    strict?: boolean
    /** Refuse (as USER_NOT_FOUND) a target with no membership in `orgId`. */
    memberOnly?: boolean
    dryRun?: boolean
    /** Recorded on the audit row (setMembership). */
    note?: string
    via?: string
}

export type RoleChangeResult =
    | {
          ok: true
          dryRun: boolean
          before: { role: TenantRole; soundEngineer: boolean } | null
          after: { role: TenantRole; soundEngineer: boolean } | null
          changed: boolean
          notified: boolean
      }
    | { ok: false; code: RoleChangeCode; message: string }

const LAST_ADMIN = { ok: false as const, code: "LAST_ADMIN" as const, message: "This is the last admin of this tenant" }
const NOT_FOUND = { ok: false as const, code: "USER_NOT_FOUND" as const, message: "User not found" }

export async function changeTenantRole(a: RoleChangeInput): Promise<RoleChangeResult> {
    initAdmin()
    const db = getFirestore()
    const exempt = a.po === true && a.strict !== true

    if (a.targetUid === a.actorUid && !exempt) {
        return { ok: false, code: "SELF_CHANGE", message: "You cannot change your own role" }
    }
    try {
        await getAuth().getUser(a.targetUid)
    } catch {
        return NOT_FOUND
    }

    // Current role in this tenant: one read-only answer for the dry run AND
    // the real run (getTenantMembership plans an unmigrated person in memory,
    // pending included), taken before anything is migrated or written.
    const before = await getTenantMembership(a.targetUid, a.orgId, { db })
    if (a.memberOnly && !before) return NOT_FOUND

    // Last-admin guard, first pass (counts legacy, unmigrated admins too). The
    // real run repeats the count inside the write transaction (setMembership
    // guardLastAdmin), so concurrent demotions cannot leave zero admins.
    const guard = !exempt && a.newRole !== "admin"
    let legacyAdmins = 0
    if (guard && before?.role === "admin") {
        const admins = (await listTenantMembers(a.orgId, { roles: ["admin"], db })).filter((m) => m.uid !== a.targetUid)
        if (admins.length === 0) return LAST_ADMIN
        legacyAdmins = admins.filter((m) => m.addedBy === "legacy").length
    }

    const planned =
        a.newRole === null ? null : { role: a.newRole, soundEngineer: before ? before.soundEngineer : false }
    const changed = (before?.role ?? null) !== a.newRole
    if (a.dryRun) {
        return { ok: true, dryRun: true, before, after: planned, changed, notified: false }
    }

    let after: Membership | null
    try {
        ;({ after } = await setMembership({
            orgId: a.orgId,
            uid: a.targetUid,
            role: a.newRole,
            actorUid: a.actorUid,
            actorEmail: a.actorEmail ?? "unknown",
            reason: a.newRole === null ? "remove" : "set-role",
            note: a.note,
            via: a.via,
            ...(guard ? { guardLastAdmin: { extraAdmins: legacyAdmins } } : {}),
        }))
    } catch (e) {
        if (e instanceof LastAdminError) return LAST_ADMIN
        throw e
    }

    // In-app "role changed" notification (the bell; never email/SMS/push).
    let notified = false
    if (a.newRole !== null) {
        try {
            await db.collection("users").doc(a.targetUid).collection("notifications").add({
                type: "role_changed",
                title: "Role updated",
                body: `Your role has been changed to ${a.newRole}`,
                orgId: a.orgId,
                read: false,
                createdAt: FieldValue.serverTimestamp(),
            })
            notified = true
        } catch (e) {
            logger.warn("[Set Role] role-change notification failed:", e)
        }
    }

    return {
        ok: true,
        dryRun: false,
        before,
        after: after ? { role: after.role, soundEngineer: after.soundEngineer === true } : null,
        changed,
        notified,
    }
}
