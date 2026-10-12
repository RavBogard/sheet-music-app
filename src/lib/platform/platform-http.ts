import "server-only"
import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { apiError } from "@/lib/api-wrapper"
import type { AuthResult } from "@/lib/api-auth"
import { addressErrorResponse } from "@/lib/platform/address-http"
import { PlatformError, type Actor } from "@/lib/platform/tenants"

/**
 * Multi-tenant phase 4: shared bits of the /platform console's routes
 * (route files may only export handlers).
 *
 * Conventions for every route under /api/platform/ (lane 2 codes against these):
 *   - platform owner only: anyone else gets 403 {code: "PLATFORM_OWNER_ONLY"};
 *   - writes are dry runs unless the URL says `?dryRun=false`;
 *   - bodies and responses are the src/lib/platform/tenants.ts types as JSON;
 *   - refusals are {error, code} with code PLATFORM_<KIND> (404/400/409/403/410).
 */

export function refuseUnlessPo(auth: AuthResult): NextResponse | null {
    if (auth.po) return null
    return apiError("Only the platform owner can do this", 403, "PLATFORM_OWNER_ONLY")
}

export function actorOf(auth: AuthResult): Actor {
    return { uid: auth.uid, email: auth.email ?? null, via: "console" }
}

/** `?dryRun=false` (or 0/no) applies; anything else, or nothing, is a dry run. */
export function dryRunFrom(req: NextRequest | Request): boolean {
    const v = new URL(req.url).searchParams.get("dryRun")
    return !(v !== null && ["false", "0", "no"].includes(v.toLowerCase()))
}

/** The JSON body, or a 400 response. */
export async function jsonBody(req: NextRequest | Request): Promise<Record<string, unknown> | NextResponse> {
    try {
        const b = await req.json()
        if (!b || typeof b !== "object" || Array.isArray(b)) return apiError("The body must be a JSON object", 400, "INVALID_JSON")
        return b as Record<string, unknown>
    } catch {
        return apiError("Invalid JSON format", 400, "INVALID_JSON")
    }
}

const STATUS: Record<PlatformError["kind"], number> = { not_found: 404, invalid: 400, conflict: 409, forbidden: 403, expired: 410, used: 409 }

/** Typed lib errors → HTTP; anything else rethrows (createApiHandler turns it into a 500). */
export function platformErrorResponse(e: unknown): NextResponse {
    if (e instanceof PlatformError) return apiError(e.message, STATUS[e.kind], `PLATFORM_${e.kind.toUpperCase()}`, e.details)
    return addressErrorResponse(e)
}

/**
 * Accept both `{<key>: {...}}` (what the console sends) and the bare object.
 * Only a body whose ONLY key is `key` is unwrapped.
 */
export function unwrap<T>(body: T, key: string): T {
    if (body && typeof body === "object" && !Array.isArray(body)) {
        const keys = Object.keys(body as object)
        if (keys.length === 1 && keys[0] === key) return (body as Record<string, unknown>)[key] as T
    }
    return body
}
