import { NextResponse } from "next/server"
import { apiError, createApiHandler } from "@/lib/api-wrapper"
import { asTenantRole } from "@/lib/org/membership-types"
import { listTenantMembersForPlatform, removeTenantMember, setTenantMemberRole } from "@/lib/platform/tenants"
import { actorOf, dryRunFrom, jsonBody, platformErrorResponse, refuseUnlessPo } from "@/lib/platform/platform-http"

/**
 * GET    /api/platform/tenants/{orgId}/members[?role=]         → TenantMember[]
 * POST   /api/platform/tenants/{orgId}/members[?dryRun=false]  body {uid? | email?, role} → WriteResult<TenantMember>
 * DELETE /api/platform/tenants/{orgId}/members?uid=…[&dryRun=false]                  → WriteResult<TenantMember>
 * Platform owner only. Results may carry `warnings` (e.g. last admin removed).
 */
export const GET = createApiHandler<{ orgId: string }>(async (ctx) => {
    const refused = refuseUnlessPo(ctx.auth)
    if (refused) return refused
    const roleParam = new URL(ctx.req.url).searchParams.get("role")
    const role = roleParam ? asTenantRole(roleParam) : null
    if (roleParam && !role) return apiError(`"${roleParam}" is not a role`, 400, "PLATFORM_INVALID")
    try {
        return NextResponse.json(await listTenantMembersForPlatform(ctx.params!.orgId, role ? { role } : undefined))
    } catch (e) {
        return platformErrorResponse(e)
    }
})

export const POST = createApiHandler<{ orgId: string }>(async (ctx) => {
    const refused = refuseUnlessPo(ctx.auth)
    if (refused) return refused
    const body = await jsonBody(ctx.req)
    if (body instanceof NextResponse) return body
    const role = asTenantRole(body.role)
    if (!role || role === "denied") return apiError("role is admin, band_leader, musician, member or pending", 400, "PLATFORM_INVALID")
    const who = {
        uid: typeof body.uid === "string" ? body.uid : undefined,
        email: typeof body.email === "string" ? body.email : undefined,
    }
    if (!who.uid && !who.email) return apiError("Name the person by uid or email", 400, "PLATFORM_INVALID")
    try {
        return NextResponse.json(await setTenantMemberRole(ctx.params!.orgId, who, role, { actor: actorOf(ctx.auth), dryRun: dryRunFrom(ctx.req) }))
    } catch (e) {
        return platformErrorResponse(e)
    }
})

export const DELETE = createApiHandler<{ orgId: string }>(async (ctx) => {
    const refused = refuseUnlessPo(ctx.auth)
    if (refused) return refused
    const uid = new URL(ctx.req.url).searchParams.get("uid")
    if (!uid) return apiError("uid is required", 400, "PLATFORM_INVALID")
    try {
        return NextResponse.json(await removeTenantMember(ctx.params!.orgId, uid, { actor: actorOf(ctx.auth), dryRun: dryRunFrom(ctx.req) }))
    } catch (e) {
        return platformErrorResponse(e)
    }
})
