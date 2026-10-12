import { NextResponse } from "next/server"
import { createApiHandler } from "@/lib/api-wrapper"
import { listPlatformActivity } from "@/lib/platform/tenants"
import { platformErrorResponse, refuseUnlessPo } from "@/lib/platform/platform-http"

/**
 * GET /api/platform/activity[?orgId=&since=<ISO>&limit=<1-500, default 50>] → PlatformAuditEntry[]
 * Platform owner only.
 */
export const GET = createApiHandler(async (ctx) => {
    const refused = refuseUnlessPo(ctx.auth)
    if (refused) return refused
    const p = new URL(ctx.req.url).searchParams
    const limit = p.get("limit") ? Number(p.get("limit")) : undefined
    try {
        return NextResponse.json(
            await listPlatformActivity({
                orgId: p.get("orgId") ?? undefined,
                since: p.get("since") ?? undefined,
                limit: limit !== undefined && Number.isFinite(limit) ? limit : undefined,
            }),
        )
    } catch (e) {
        return platformErrorResponse(e)
    }
})
