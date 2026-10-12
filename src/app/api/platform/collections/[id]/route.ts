import { NextResponse } from "next/server"
import { apiError, createApiHandler } from "@/lib/api-wrapper"
import { assignCollection, listCollections, setCollectionSharing, type CollectionRecord } from "@/lib/platform/tenants"
import { actorOf, dryRunFrom, jsonBody, platformErrorResponse, refuseUnlessPo } from "@/lib/platform/platform-http"

/**
 * GET   /api/platform/collections/{id}                → CollectionRecord (404 if none)
 * PATCH /api/platform/collections/{id}[?dryRun=false] body {visibility, sharedWith} → WriteResult<CollectionRecord>
 * POST  /api/platform/collections/{id}[?dryRun=false] body {orgId, assigned}        → WriteResult<CollectionRecord>
 * Platform owner only.
 */
export const GET = createApiHandler<{ id: string }>(async (ctx) => {
    const refused = refuseUnlessPo(ctx.auth)
    if (refused) return refused
    try {
        const c = (await listCollections()).find((x) => x.id === ctx.params!.id)
        return c ? NextResponse.json(c) : apiError(`There is no collection "${ctx.params!.id}".`, 404, "PLATFORM_NOT_FOUND")
    } catch (e) {
        return platformErrorResponse(e)
    }
})

export const PATCH = createApiHandler<{ id: string }>(async (ctx) => {
    const refused = refuseUnlessPo(ctx.auth)
    if (refused) return refused
    const body = await jsonBody(ctx.req)
    if (body instanceof NextResponse) return body
    try {
        return NextResponse.json(
            await setCollectionSharing(
                ctx.params!.id,
                { visibility: body.visibility as CollectionRecord["visibility"], sharedWith: body.sharedWith as string[] },
                { actor: actorOf(ctx.auth), dryRun: dryRunFrom(ctx.req) },
            ),
        )
    } catch (e) {
        return platformErrorResponse(e)
    }
})

export const POST = createApiHandler<{ id: string }>(async (ctx) => {
    const refused = refuseUnlessPo(ctx.auth)
    if (refused) return refused
    const body = await jsonBody(ctx.req)
    if (body instanceof NextResponse) return body
    if (typeof body.orgId !== "string" || typeof body.assigned !== "boolean")
        return apiError("body is {orgId, assigned: true|false}", 400, "PLATFORM_INVALID")
    try {
        return NextResponse.json(
            await assignCollection(ctx.params!.id, body.orgId, body.assigned, { actor: actorOf(ctx.auth), dryRun: dryRunFrom(ctx.req) }),
        )
    } catch (e) {
        return platformErrorResponse(e)
    }
})
