import { NextRequest, NextResponse } from "next/server"
import { checkRateLimit } from "@/lib/rate-limit"
import { createApiHandler } from "@/lib/api-wrapper"
import { fetchFileById } from "@/lib/file-fetcher"
import { logger } from "@/lib/logger"

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

/**
 * Check if request is from a trusted browser context (same-origin navigation/embed).
 * Modern browsers send Sec-Fetch-Site on all requests. This can't be forged
 * by curl/scripts since browsers control the header.
 *
 * Fallback: also accept requests with a valid Referer from our domain.
 */
function isTrustedBrowserRequest(req: NextRequest): boolean {
    // 1. Best signal: Sec-Fetch-Site (set by all modern browsers, can't be forged)
    const secFetchSite = req.headers.get('sec-fetch-site')
    if (secFetchSite === 'same-origin' || secFetchSite === 'same-site') return true

    // 2. Sec-Fetch-Dest indicates a browser request context (embed, document, image, etc.)
    const secFetchDest = req.headers.get('sec-fetch-dest')
    if (secFetchDest && secFetchDest !== 'empty') return true

    // 3. Referer from our domain
    const referer = req.headers.get('referer')
    if (referer) {
        try {
            const url = new URL(referer)
            return ALLOWED_HOSTNAMES.includes(url.hostname) ||
                url.hostname === 'localhost' ||
                url.hostname.endsWith('.vercel.app')
        } catch { /* invalid referer */ }
    }

    // 4. Accept header with browser-typical content types
    const accept = req.headers.get('accept') || ''
    if (accept.includes('text/html') || accept.includes('application/pdf') || accept.includes('image/')) return true

    return false
}

export const GET = createApiHandler(async (ctx) => {
    const limited = await checkRateLimit(ctx.req, 'api')
    if (limited) return limited

    // Auth: Accept Bearer token (API calls) OR same-origin browser requests
    // (chart embeds, prefetches, audio elements — can't attach Bearer headers).
    // Direct curl/script access without either is blocked.
    if (!ctx.auth && !isTrustedBrowserRequest(ctx.req)) {
        const fid = ctx.params?.fileId
        logger.warn(`[FileProxy] Untrusted request blocked for ${fid}`, {
            secFetchSite: ctx.req.headers.get('sec-fetch-site'),
            secFetchDest: ctx.req.headers.get('sec-fetch-dest'),
            referer: ctx.req.headers.get('referer'),
        })
        return NextResponse.json(
            { error: "Authentication required" },
            { status: 401, headers: { 'Access-Control-Allow-Origin': getAllowedOrigin(ctx.req) } }
        )
    }

    const fileId = ctx.params?.fileId

    try {
        const result = await fetchFileById(fileId)

        if (!result) {
            return NextResponse.json(
                { error: 'File not found', fileId, debug: { receivedId: fileId, stringified: String(ctx.params?.fileId) } },
                { status: 404, headers: { 'Access-Control-Allow-Origin': getAllowedOrigin(ctx.req), 'Cache-Control': 'no-store' } }
            )
        }

        return new NextResponse(new Uint8Array(result.buffer), {
            status: 200,
            headers: {
                'Access-Control-Allow-Origin': getAllowedOrigin(ctx.req),
                'Cache-Control': 'public, max-age=86400, s-maxage=604800',
                'Content-Type': result.contentType,
                'X-Served-From': result.source,
            }
        })
    } catch (error) {
        logger.error(`[FileProxy] Unexpected error for ${fileId}:`, error)
        return NextResponse.json(
            { error: 'File unavailable', fileId },
            { status: 502, headers: { 'Access-Control-Allow-Origin': getAllowedOrigin(ctx.req), 'Cache-Control': 'no-store' } }
        )
    }
}, { requireAuth: false })
