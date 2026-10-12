import { NextResponse } from "next/server"
import { z } from "zod"
import { createApiHandler, apiError } from "@/lib/api-wrapper"
import { addCustomDomain, removeCustomDomain } from "@/lib/platform/tenant-address"
import { addressErrorResponse, badOrgId, refuseUnlessPlatformOwner } from "@/lib/platform/address-http"

const bodySchema = z.object({ domain: z.string().min(3).max(253) })

/**
 * POST /api/platform/tenants/{orgId}/domains  {domain}
 * Platform owner only. Attaches the custom domain (bare + www, bare 308 → www),
 * adds both to Firebase authorized domains, and returns the DNS records and
 * plain-language registrar steps.
 */
export const POST = createApiHandler<{ orgId: string }, typeof bodySchema>(
    async (ctx) => {
        const refused = refuseUnlessPlatformOwner(ctx.auth)
        if (refused) return refused
        const orgId = ctx.params?.orgId
        const bad = badOrgId(orgId)
        if (bad) return bad
        try {
            return NextResponse.json(await addCustomDomain(orgId!, ctx.body!.domain))
        } catch (e) {
            return addressErrorResponse(e)
        }
    },
    { schema: bodySchema },
)

/**
 * DELETE /api/platform/tenants/{orgId}/domains?domain=example.org
 * (or a JSON body {domain}). Platform owner only. Detaches bare + www.
 */
export const DELETE = createApiHandler<{ orgId: string }>(async (ctx) => {
    const refused = refuseUnlessPlatformOwner(ctx.auth)
    if (refused) return refused
    const orgId = ctx.params?.orgId
    const bad = badOrgId(orgId)
    if (bad) return bad
    let domain = new URL(ctx.req.url).searchParams.get("domain")
    if (!domain) {
        const raw = (await ctx.req.json().catch(() => null)) as unknown
        const parsed = bodySchema.safeParse(raw)
        domain = parsed.success ? parsed.data.domain : null
    }
    if (!domain) return apiError("domain is required", 400, "VALIDATION_ERROR")
    try {
        return NextResponse.json(await removeCustomDomain(orgId!, domain))
    } catch (e) {
        return addressErrorResponse(e)
    }
})
