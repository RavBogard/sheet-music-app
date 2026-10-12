import "server-only"
import { NextResponse } from "next/server"
import { apiError } from "@/lib/api-wrapper"
import type { AuthResult } from "@/lib/api-auth"
import { OrgIdSchema } from "@/lib/org/config-schema"
import { VercelApiError } from "@/lib/platform/vercel"
import { AuthDomainsError } from "@/lib/platform/auth-domains"
import { TenantAddressError } from "@/lib/platform/tenant-address"

/**
 * Shared bits of the platform-owner address routes under
 * /api/platform/tenants/[orgId]/... (route files may only export handlers).
 */

/** null when allowed; a 403 response otherwise. */
export function refuseUnlessPlatformOwner(auth: AuthResult): NextResponse | null {
    if (auth.po) return null
    return apiError("Only the platform owner can change tenant addresses", 403, "PLATFORM_OWNER_ONLY")
}

export function badOrgId(orgId: unknown): NextResponse | null {
    return OrgIdSchema.safeParse(orgId).success ? null : apiError("Not a tenant id", 400, "INVALID_ORG_ID")
}

/** Typed lib errors → HTTP; anything else rethrows (createApiHandler turns it into a 500). */
export function addressErrorResponse(e: unknown): NextResponse {
    if (e instanceof TenantAddressError) {
        const status = { not_found: 404, invalid: 400, conflict: 409, exhausted: 409, not_attached: 409 }[e.kind]
        return apiError(e.message, status, `ADDRESS_${e.kind.toUpperCase()}`)
    }
    if (e instanceof VercelApiError) {
        const status = {
            taken: 409,
            invalid: 400,
            rate_limited: 429,
            not_found: 404,
            forbidden: 502,
            config_missing: 503,
            upstream: 502,
        }[e.kind]
        return apiError(e.message, status, `VERCEL_${e.kind.toUpperCase()}`, { vercelCode: e.code, retryAfter: e.retryAfter })
    }
    if (e instanceof AuthDomainsError) {
        const status = e.kind === "lock_timeout" ? 503 : 502
        return apiError(e.message, status, `AUTH_DOMAINS_${e.kind.toUpperCase()}`)
    }
    throw e
}
