import { NextResponse } from "next/server"
import { apiError, createApiHandler } from "@/lib/api-wrapper"
import { acceptInvite, peekInvite } from "@/lib/platform/tenants"
import { jsonBody, platformErrorResponse } from "@/lib/platform/platform-http"

/**
 * Multi-tenant phase 4: tenant invitations (made by the platform owner with
 * invite_tenant_admin or the console).
 *
 * GET  /api/invite/accept?token=…  (no sign-in needed)
 *      → {orgId, tenantName, role, email, status: open|accepted|expired|revoked, expiresAt}
 * POST /api/invite/accept  body {token}  (signed in, at the tenant's address)
 *      → {orgId, role}. The signed-in email must match the invitation
 *      (any case) unless the caller is the platform owner. Single use.
 */
export const GET = createApiHandler(
    async (ctx) => {
        const token = new URL(ctx.req.url).searchParams.get("token") ?? ""
        try {
            const peek = await peekInvite(token)
            if (!peek) return apiError("This invitation link is not valid. Ask for a new one.", 404, "PLATFORM_NOT_FOUND")
            return NextResponse.json(peek)
        } catch (e) {
            return platformErrorResponse(e)
        }
    },
    { requireAuth: false },
)

export const POST = createApiHandler(async (ctx) => {
    const body = await jsonBody(ctx.req)
    if (body instanceof NextResponse) return body
    const token = typeof body.token === "string" ? body.token : ""
    try {
        const peek = await peekInvite(token)
        if (!peek) return apiError("This invitation link is not valid. Ask for a new one.", 404, "PLATFORM_NOT_FOUND")
        if (peek.orgId !== ctx.auth.orgId)
            return apiError(`Open this invitation at ${peek.tenantName}'s own address to accept it.`, 409, "WRONG_ADDRESS", { orgId: peek.orgId })
        return NextResponse.json(await acceptInvite(token, ctx.auth.uid, ctx.auth.email ?? null))
    } catch (e) {
        return platformErrorResponse(e)
    }
})
