import { NextResponse } from "next/server"
import { createApiHandler, apiError } from "@/lib/api-wrapper"
import { checkRateLimit } from "@/lib/rate-limit"
import { httpError } from "@/lib/http/error-envelope"
import { orgExists } from "@/lib/org/org-exists"
import { getTenantAccess, hasTenantRole, type TenantAccess } from "@/lib/org/access"
import { changeTenantRole } from "@/lib/org/tenant-role-change"
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
 * Effect (changeTenantRole, src/lib/org/tenant-role-change.ts): setMembership (audit row with orgId, claims rebuilt incl. legacy
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
        if (!(await orgExists(tenant))) {
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
        // Shared with the MCP set_member_role tool: refusals, setMembership
        // (audit row, claims rebuild) and the in-app notification.
        const result = await changeTenantRole({
            orgId: tenant,
            targetUid: targetUserId,
            newRole,
            actorUid: ctx.auth.uid,
            actorEmail: ctx.auth.email ?? "unknown",
            po: callerAccess.po,
        })
        if (!result.ok) {
            const status = result.code === "SELF_CHANGE" ? 400 : result.code === "USER_NOT_FOUND" ? 404 : 409
            return apiError(result.message, status, result.code)
        }
        const after = result.after

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
