import { NextResponse } from "next/server"
import { z } from "zod"
import { createApiHandler } from "@/lib/api-wrapper"
import { provisionDefaultAddress } from "@/lib/platform/tenant-address"
import { addressErrorResponse, badOrgId, refuseUnlessPlatformOwner } from "@/lib/platform/address-http"

const bodySchema = z.object({ slug: z.string().min(2).max(40) })

/**
 * POST /api/platform/tenants/{orgId}/address  {slug}
 * Platform owner only. Attaches the tenant's default `<slug>.vercel.app`
 * address (or the nearest free name) and records it on orgs/{orgId}.
 */
export const POST = createApiHandler<{ orgId: string }, typeof bodySchema>(
    async (ctx) => {
        const refused = refuseUnlessPlatformOwner(ctx.auth)
        if (refused) return refused
        const orgId = ctx.params?.orgId
        const bad = badOrgId(orgId)
        if (bad) return bad
        try {
            return NextResponse.json(await provisionDefaultAddress(orgId!, ctx.body!.slug))
        } catch (e) {
            return addressErrorResponse(e)
        }
    },
    { schema: bodySchema },
)
