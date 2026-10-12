import { NextResponse } from "next/server"
import { apiError, createApiHandler } from "@/lib/api-wrapper"
import { inviteTenantAdmin, listInvites, type Invite } from "@/lib/platform/tenants"
import { actorOf, dryRunFrom, jsonBody, platformErrorResponse, refuseUnlessPo } from "@/lib/platform/platform-http"

/**
 * GET  /api/platform/tenants/{orgId}/invites                → Invite[] (link "" — the link is shown only when made)
 * POST /api/platform/tenants/{orgId}/invites[?dryRun=false] body {email, role?="admin"} → WriteResult<Invite>
 * Platform owner only.
 */
export const GET = createApiHandler<{ orgId: string }>(async (ctx) => {
    const refused = refuseUnlessPo(ctx.auth)
    if (refused) return refused
    try {
        return NextResponse.json(await listInvites(ctx.params!.orgId))
    } catch (e) {
        return platformErrorResponse(e)
    }
})

export const POST = createApiHandler<{ orgId: string }>(async (ctx) => {
    const refused = refuseUnlessPo(ctx.auth)
    if (refused) return refused
    const body = await jsonBody(ctx.req)
    if (body instanceof NextResponse) return body
    if (typeof body.email !== "string") return apiError("email is required", 400, "PLATFORM_INVALID")
    const role = (typeof body.role === "string" ? body.role : "admin") as Invite["role"]
    try {
        return NextResponse.json(await inviteTenantAdmin(ctx.params!.orgId, body.email, role, { actor: actorOf(ctx.auth), dryRun: dryRunFrom(ctx.req) }))
    } catch (e) {
        return platformErrorResponse(e)
    }
})
