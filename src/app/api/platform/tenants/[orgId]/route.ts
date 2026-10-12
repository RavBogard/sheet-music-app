import { NextResponse } from "next/server"
import { apiError, createApiHandler } from "@/lib/api-wrapper"
import { getTenant, updateTenant } from "@/lib/platform/tenants"
import { actorOf, dryRunFrom, jsonBody, platformErrorResponse, refuseUnlessPo } from "@/lib/platform/platform-http"

/**
 * GET   /api/platform/tenants/{orgId}                → TenantDetail (404 if none)
 * PATCH /api/platform/tenants/{orgId}[?dryRun=false] → WriteResult<OrgConfig>
 *       body: the patch (Partial<OrgConfigInput>), deep-merged into the config
 * Platform owner only.
 */
export const GET = createApiHandler<{ orgId: string }>(async (ctx) => {
    const refused = refuseUnlessPo(ctx.auth)
    if (refused) return refused
    try {
        const t = await getTenant(ctx.params!.orgId)
        return t ? NextResponse.json(t) : apiError(`There is no tenant "${ctx.params!.orgId}".`, 404, "PLATFORM_NOT_FOUND")
    } catch (e) {
        return platformErrorResponse(e)
    }
})

export const PATCH = createApiHandler<{ orgId: string }>(async (ctx) => {
    const refused = refuseUnlessPo(ctx.auth)
    if (refused) return refused
    const body = await jsonBody(ctx.req)
    if (body instanceof NextResponse) return body
    try {
        return NextResponse.json(await updateTenant(ctx.params!.orgId, body, { actor: actorOf(ctx.auth), dryRun: dryRunFrom(ctx.req) }))
    } catch (e) {
        return platformErrorResponse(e)
    }
})
