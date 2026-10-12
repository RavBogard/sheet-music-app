import { NextResponse } from "next/server"
import { createApiHandler } from "@/lib/api-wrapper"
import { setTenantStatus } from "@/lib/platform/tenants"
import { actorOf, dryRunFrom, jsonBody, platformErrorResponse, refuseUnlessPo } from "@/lib/platform/platform-http"

/**
 * PATCH /api/platform/tenants/{orgId}/status[?dryRun=false]
 *       body: {"status": "active" | "suspended"} → WriteResult<status>
 * Platform owner only.
 */
export const PATCH = createApiHandler<{ orgId: string }>(async (ctx) => {
    const refused = refuseUnlessPo(ctx.auth)
    if (refused) return refused
    const body = await jsonBody(ctx.req)
    if (body instanceof NextResponse) return body
    try {
        return NextResponse.json(
            await setTenantStatus(ctx.params!.orgId, body.status as "active" | "suspended", { actor: actorOf(ctx.auth), dryRun: dryRunFrom(ctx.req) }),
        )
    } catch (e) {
        return platformErrorResponse(e)
    }
})
