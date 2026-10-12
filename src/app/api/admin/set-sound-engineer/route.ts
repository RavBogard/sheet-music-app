/**
 * POST /api/admin/set-sound-engineer
 *
 * Toggles a person's sound-engineer flag IN ONE TENANT (multi-tenant phase 2,
 * design §3.4): the flag lives on memberships/{tenant}__{uid}; claims (`se`,
 * legacy `soundEngineer`) and the users-doc mirror are rebuilt from it.
 *
 * Body: { targetUserId: string, soundEngineer: boolean, tenant?: OrgId (default host) }
 * Requires band_leader or above in `tenant` (platform owner anywhere); the
 * target must have a membership there.
 */

import { NextResponse } from "next/server"
import { createApiHandler, apiError } from "@/lib/api-wrapper"
import { checkRateLimit } from "@/lib/rate-limit"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { httpError } from "@/lib/http/error-envelope"
import { orgExists } from "@/lib/org/org-exists"
import { getTenantAccess, hasTenantRole } from "@/lib/org/access"
import { membershipId, asTenantRole } from "@/lib/org/membership-types"
import { ensureMembershipsMigrated, setMembership } from "@/lib/org/memberships-write"
import { z } from "zod"

const schema = z.object({
    targetUserId: z.string().min(1),
    soundEngineer: z.boolean(),
    tenant: z.string().min(1).optional(),
})

export const POST = createApiHandler(
    async (ctx) => {
        const limited = await checkRateLimit(ctx.req, "api")
        if (limited) return limited

        const { targetUserId, soundEngineer } = ctx.body!
        const tenant = ctx.body!.tenant ?? ctx.auth.orgId
        if (!(await orgExists(tenant))) return apiError(`Unknown tenant '${tenant}'`, 400, "UNKNOWN_TENANT")

        if (!initAdmin()) {
            return NextResponse.json(
                { error: "Server not ready", code: "FIREBASE_NOT_INITIALIZED" },
                { status: 500 },
            )
        }
        const caller = tenant === ctx.auth.orgId ? ctx.auth.access : await getTenantAccess(ctx.auth.uid, tenant)
        if (!hasTenantRole(caller, "band_leader")) {
            return httpError(403, "forbidden_role", "Requires band_leader role", {
                errorCode: 403,
                callerRole: caller.effectiveRole ?? null,
                requiredRole: "band_leader",
                tenant,
            })
        }

        await ensureMembershipsMigrated(targetUserId)
        const snap = await getFirestore().collection("memberships").doc(membershipId(tenant, targetUserId)).get()
        const role = snap.exists ? asTenantRole(snap.get("role")) : null
        if (!role) return apiError("This person is not a member of this tenant", 404, "NOT_A_MEMBER")

        await setMembership({
            orgId: tenant,
            uid: targetUserId,
            role,
            soundEngineer,
            actorUid: ctx.auth.uid,
            actorEmail: ctx.auth.email,
            reason: "sound-engineer",
        })

        return NextResponse.json({ success: true, soundEngineer, tenant })
    },
    // band leader in the HOST tenant first (as before P2), then in `tenant`.
    { role: "band_leader", schema },
)
