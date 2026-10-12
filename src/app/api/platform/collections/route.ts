import { NextResponse } from "next/server"
import { createApiHandler } from "@/lib/api-wrapper"
import { listCollections } from "@/lib/platform/tenants"
import { platformErrorResponse, refuseUnlessPo } from "@/lib/platform/platform-http"

/**
 * GET /api/platform/collections[?orgId=] → CollectionRecord[] (with chartCount);
 *     with orgId: the collections that tenant owns, is shared or is assigned.
 * Platform owner only.
 */
export const GET = createApiHandler(async (ctx) => {
    const refused = refuseUnlessPo(ctx.auth)
    if (refused) return refused
    const orgId = new URL(ctx.req.url).searchParams.get("orgId") ?? undefined
    try {
        return NextResponse.json(await listCollections(orgId))
    } catch (e) {
        return platformErrorResponse(e)
    }
})
