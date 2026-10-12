import { NextResponse } from "next/server"
import { createApiHandler } from "@/lib/api-wrapper"
import { setTenantFeatures } from "@/lib/platform/tenants"
import { actorOf, dryRunFrom, jsonBody, platformErrorResponse, refuseUnlessPo } from "@/lib/platform/platform-http"

/**
 * PATCH /api/platform/tenants/{orgId}/features[?dryRun=false]
 *       body: Partial<OrgConfig["features"]>, e.g. {"mixer": false}
 *       → WriteResult<OrgConfig["features"]>
 * Platform owner only.
 */
export const PATCH = createApiHandler<{ orgId: string }>(async (ctx) => {
    const refused = refuseUnlessPo(ctx.auth)
    if (refused) return refused
    const body = await jsonBody(ctx.req)
    if (body instanceof NextResponse) return body
    try {
        return NextResponse.json(
            await setTenantFeatures(ctx.params!.orgId, body as Record<string, boolean>, { actor: actorOf(ctx.auth), dryRun: dryRunFrom(ctx.req) }),
        )
    } catch (e) {
        return platformErrorResponse(e)
    }
})
