import { NextResponse } from "next/server"
import { createApiHandler } from "@/lib/api-wrapper"
import { createTenant, listTenants, type CreateTenantInput } from "@/lib/platform/tenants"
import { actorOf, dryRunFrom, jsonBody, platformErrorResponse, refuseUnlessPo } from "@/lib/platform/platform-http"

/**
 * GET  /api/platform/tenants                → TenantSummary[]
 * POST /api/platform/tenants[?dryRun=false] → createTenant result
 *      body: CreateTenantInput {orgId, subdomain, config: {name, …}, copyLiturgyFrom?}
 * Platform owner only.
 */
export const GET = createApiHandler(async (ctx) => {
    const refused = refuseUnlessPo(ctx.auth)
    if (refused) return refused
    try {
        return NextResponse.json(await listTenants())
    } catch (e) {
        return platformErrorResponse(e)
    }
})

export const POST = createApiHandler(async (ctx) => {
    const refused = refuseUnlessPo(ctx.auth)
    if (refused) return refused
    const body = await jsonBody(ctx.req)
    if (body instanceof NextResponse) return body
    try {
        return NextResponse.json(
            await createTenant(body as unknown as CreateTenantInput, { actor: actorOf(ctx.auth), dryRun: dryRunFrom(ctx.req) }),
        )
    } catch (e) {
        return platformErrorResponse(e)
    }
})
