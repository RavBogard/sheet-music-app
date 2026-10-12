import { NextResponse } from "next/server"
import { createApiHandler } from "@/lib/api-wrapper"
import { checkCustomDomain } from "@/lib/platform/tenant-address"
import { addressErrorResponse, badOrgId, refuseUnlessPlatformOwner } from "@/lib/platform/address-http"

/**
 * GET /api/platform/tenants/{orgId}/domains/{domain}
 * Platform owner only. "Check again": asks Vercel to verify, reads the DNS
 * config, records waiting_for_dns | verified | live, and promotes www to the
 * tenant's primary address once live.
 */
export const GET = createApiHandler<{ orgId: string; domain: string }>(async (ctx) => {
    const refused = refuseUnlessPlatformOwner(ctx.auth)
    if (refused) return refused
    const orgId = ctx.params?.orgId
    const bad = badOrgId(orgId)
    if (bad) return bad
    try {
        return NextResponse.json(await checkCustomDomain(orgId!, decodeURIComponent(ctx.params!.domain)))
    } catch (e) {
        return addressErrorResponse(e)
    }
})
