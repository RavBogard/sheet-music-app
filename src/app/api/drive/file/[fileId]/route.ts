import { NextRequest, NextResponse } from "next/server"
import { checkRateLimit } from "@/lib/rate-limit"
import { createApiHandler } from "@/lib/api-wrapper"
import { fetchFileById } from "@/lib/file-fetcher"
import { logger } from "@/lib/logger"
import { hasBrowserFetchMetadata } from "@/lib/drive-file-auth"
import { httpError, redactInProduction } from "@/lib/http/error-envelope"

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://centralreform.live,https://www.centralreform.live').split(',').map(s => s.trim())
const ALLOWED_HOSTNAMES = ALLOWED_ORIGINS.map(o => { try { return new URL(o).hostname } catch { return '' } }).filter(Boolean)

function getAllowedOrigin(request: NextRequest): string {
    const origin = request.headers.get('origin') || ''
    // Direct match against configured origins
    if (ALLOWED_ORIGINS.includes(origin)) return origin
    // Parse origin to check hostname safely
    try {
        const url = new URL(origin)
        const host = url.hostname
        if (
            host === 'localhost' ||
            host === '127.0.0.1' ||
            host.endsWith('.vercel.app')
        ) {
            return origin
        }
    } catch {
        // Invalid URL — fall through to default
    }
    return ALLOWED_ORIGINS[0]
}

// hasBrowserFetchMetadata lives in @/lib/drive-file-auth

export const GET = createApiHandler(async (ctx) => {
    const limited = await checkRateLimit(ctx.req, 'api')
    if (limited) return limited

    const fileId = ctx.params?.fileId
    const isTrusted = !!ctx.auth || hasBrowserFetchMetadata(ctx.req)
    const origin = getAllowedOrigin(ctx.req)

    try {
        // Cycle-1 F-021: existence check fires BEFORE the auth gate so a
        // bogus fileId returns 404 instead of the misleading "Authentication
        // required" 401 — agents kept treating the 401 as a credentials
        // problem when it was really a wrong-id problem. Chart-access
        // policy ([[feedback_chart_access_policy]]): chart bytes are
        // intentionally public for real fileIds, so revealing existence
        // to unauthed probes is acceptable. The auth gate still fires
        // below for existing files when the request carries neither a
        // Bearer token nor browser fetch metadata.
        const result = await fetchFileById(fileId)

        if (!result) {
            // Cycle-2 SEC-001 + SEC-002: rich envelope on the wire; the
            // `debug` field used to leak the raw receivedId + stringified
            // params unconditionally. Production now strips it via
            // `redactInProduction`; dev / test keep it for triage.
            const context = redactInProduction(
                {
                    fileId,
                    debug: {
                        receivedId: fileId,
                        stringified: String(ctx.params?.fileId),
                    },
                },
                ["debug"] as const,
            )
            return httpError(
                404,
                "file_not_found",
                "No chart found for the given fileId.",
                context,
                "Verify the fileId via the MCP list_library / get_chart_status tools, or open the chart in-app to confirm it still exists.",
                {
                    "Access-Control-Allow-Origin": origin,
                    "Cache-Control": "no-store",
                },
            )
        }

        // Auth: Accept Bearer token (API calls) OR requests that carry
        // browser-set Sec-Fetch-* metadata (chart embeds, prefetches, audio
        // elements — can't attach Bearer headers). Defense-in-depth only —
        // see hasBrowserFetchMetadata JSDoc. Direct curl/script access
        // without either is blocked.
        if (!isTrusted) {
            const fwd = ctx.req.headers.get('x-forwarded-for') || ''
            const ip = fwd.split(',')[0]?.trim() || ctx.req.headers.get('x-real-ip') || 'unknown'
            logger.warn(`[FileProxy] Untrusted request blocked for ${fileId}`, {
                secFetchSite: ctx.req.headers.get('sec-fetch-site'),
                secFetchDest: ctx.req.headers.get('sec-fetch-dest'),
                referer: ctx.req.headers.get('referer'),
                userAgent: ctx.req.headers.get('user-agent'),
                ip,
            })
            return httpError(
                401,
                "unauthenticated",
                "Bearer token (or in-app browser fetch metadata) required for chart bytes.",
                { fileId },
                "Send `Authorization: Bearer <token>`, or call from the in-app fetch surface where Sec-Fetch-Site / Sec-Fetch-Dest headers identify the request.",
                { "Access-Control-Allow-Origin": origin },
            )
        }

        return new NextResponse(new Uint8Array(result.buffer), {
            status: 200,
            headers: {
                'Access-Control-Allow-Origin': origin,
                'Cache-Control': 'public, max-age=86400, s-maxage=604800',
                'Content-Type': result.contentType,
                'X-Served-From': result.source,
            }
        })
    } catch (error) {
        logger.error(`[FileProxy] Unexpected error for ${fileId}:`, error)
        return httpError(
            502,
            "upstream_unavailable",
            "Chart bytes are temporarily unavailable.",
            { fileId },
            "Retry shortly; if the failure persists the underlying Storage / Drive blob may need re-upload.",
            {
                "Access-Control-Allow-Origin": origin,
                "Cache-Control": "no-store",
            },
        )
    }
}, { requireAuth: false })
