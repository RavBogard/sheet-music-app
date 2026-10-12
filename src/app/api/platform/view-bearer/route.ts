import { NextResponse } from "next/server"
import { apiError, createApiHandler } from "@/lib/api-wrapper"
import { mintTenantViewBearer } from "@/lib/platform/tenants"
import { actorOf, jsonBody, platformErrorResponse, refuseUnlessPo } from "@/lib/platform/platform-http"

/**
 * POST /api/platform/view-bearer body {orgId, minutes?=30 (1-60)}
 *      → {token, tokenId, expiresAt}: a read-only MCP bearer (crl_view_…) for
 *      that tenant's /api/mcp, owned by the platform owner. Shown once.
 * Platform owner only. Not a dry run: minting is the action (audited).
 */
export const POST = createApiHandler(async (ctx) => {
    const refused = refuseUnlessPo(ctx.auth)
    if (refused) return refused
    const body = await jsonBody(ctx.req)
    if (body instanceof NextResponse) return body
    if (typeof body.orgId !== "string") return apiError("orgId is required", 400, "PLATFORM_INVALID")
    const minutes = body.minutes === undefined ? 30 : Number(body.minutes)
    try {
        return NextResponse.json(await mintTenantViewBearer(body.orgId, minutes, actorOf(ctx.auth)))
    } catch (e) {
        return platformErrorResponse(e)
    }
})
