import { NextResponse } from "next/server"
import { getAuth, getFirestore } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"
import { createApiHandler, apiError } from "@/lib/api-wrapper"
import { checkRateLimit } from "@/lib/rate-limit"
import { httpError } from "@/lib/http/error-envelope"
import { isKnownOrg } from "@/lib/org/registry"
import { getTenantAccess, hasTenantRole, listTenantMembers, type TenantAccess } from "@/lib/org/access"
import { membershipId } from "@/lib/org/membership-types"
import { ensureMembershipsMigrated, setMembership } from "@/lib/org/memberships-write"
import { z } from "zod"

/**
 * POST /api/admin/set-role — multi-tenant phase 2 (design §5.5): a person's
 * role IN ONE TENANT.
 *
 * body: { targetUserId, newRole: role | 'denied' | null (null = remove from
 *         the tenant), tenant? (default host), orgIds? (accepted and IGNORED —
 *         cached pre-P2 People pages; response says orgIdsIgnored:true) }
 *
 * Auth: platform owner, or admin IN `tenant`. Refusals: own membership (unless
 * po) → 400 SELF_CHANGE; demoting/removing a tenant's last admin (unless po) →
 * 409 LAST_ADMIN; unknown tenant → 400 UNKNOWN_TENANT.
 * Effect: setMembership (audit row with orgId, claims rebuilt incl. legacy
 * mirrors, refresh tokens revoked on removal) + a "role changed" notification.
 * Response: { success, tenant, role, claimsUpdated, orgIdsIgnored? }
 */
const setRoleSchema = z.object({
    targetUserId: z.string().min(1),
    newRole: z.enum(["admin", "band_leader", "musician", "member", "pending", "denied"]).nullable(),
    tenant: z.string().min(1).optional(),
    orgIds: z.array(z.string().min(1)).optional(),
})

export const POST = createApiHandler(
    async (ctx) => {
        const limited = await checkRateLimit(ctx.req, "api")
        if (limited) return limited

        const { targetUserId, newRole, orgIds } = ctx.body!
        const tenant = ctx.body!.tenant ?? ctx.auth.orgId
        if (!isKnownOrg(tenant)) {
            return apiError(`Unknown tenant '${tenant}'`, 400, "UNKNOWN_TENANT")
        }

        // Caller must be admin in the target tenant (po anywhere).
        const callerAccess: TenantAccess =
            tenant === ctx.auth.orgId ? ctx.auth.access : await getTenantAccess(ctx.auth.uid, tenant)
        if (!hasTenantRole(callerAccess, "admin")) {
            return httpError(403, "forbidden_role", "Requires admin role", {
                errorCode: 403,
                callerRole: callerAccess.effectiveRole ?? null,
                requiredRole: "admin",
                tenant,
            })
        }
        const po = callerAccess.po
        if (targetUserId === ctx.auth.uid && !po) {
            return apiError("You cannot change your own role", 400, "SELF_CHANGE")
        }

        try {
            await getAuth().getUser(targetUserId)
        } catch {
            return apiError("User not found", 404, "USER_NOT_FOUND")
        }

        // Last-admin guard (counts legacy, unmigrated admins too).
        if (!po && newRole !== "admin") {
            await ensureMembershipsMigrated(targetUserId)
            const db = getFirestore()
            const cur = await db.collection("memberships").doc(membershipId(tenant, targetUserId)).get()
            if (cur.exists && cur.get("role") === "admin") {
                const admins = await listTenantMembers(tenant, { roles: ["admin"] })
                if (admins.filter((a) => a.uid !== targetUserId).length === 0) {
                    return apiError("This is the last admin of this tenant", 409, "LAST_ADMIN")
                }
            }
        }

        const { after } = await setMembership({
            orgId: tenant,
            uid: targetUserId,
            role: newRole,
            actorUid: ctx.auth.uid,
            actorEmail: ctx.auth.email ?? "unknown",
            reason: newRole === null ? "remove" : "set-role",
        })

        // Server-side "role changed" notification (replaces the browser write).
        if (newRole !== null) {
            try {
                const { FieldValue } = await import("firebase-admin/firestore")
                await getFirestore().collection("users").doc(targetUserId).collection("notifications").add({
                    type: "role_changed",
                    title: "Role updated",
                    body: `Your role has been changed to ${newRole}`,
                    orgId: tenant,
                    read: false,
                    createdAt: FieldValue.serverTimestamp(),
                })
            } catch (e) {
                logger.warn("[Set Role] role-change notification failed:", e)
            }
        }

        return NextResponse.json({
            success: true,
            tenant,
            role: after?.role ?? null,
            claimsUpdated: true,
            ...(orgIds ? { orgIdsIgnored: true } : {}),
        })
    },
    // role:'admin' = admin in the HOST tenant (checked before body validation,
    // as before P2); acting on another tenant additionally needs admin there.
    { role: "admin", schema: setRoleSchema },
)
