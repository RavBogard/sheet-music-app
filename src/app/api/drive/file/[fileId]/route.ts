// NOTE: This route uses withAuth directly instead of createApiHandler because
// it accepts BOTH Bearer token auth AND same-origin browser requests (no token).
// createApiHandler would reject all browser requests with 401.
import { NextRequest, NextResponse } from "next/server"
import { checkRateLimit } from "@/lib/rate-limit"
import { withAuth } from "@/lib/api-auth"
import { fetchFileById } from "@/lib/file-fetcher"
import { logger } from "@/lib/logger"

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://centralreform.live,https://www.centralreform.live').split(',').map(s => s.trim())

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
    return 'https://centralreform.live'
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
            return url.hostname === 'centralreform.live' ||
                url.hostname === 'www.centralreform.live' ||
                url.hostname === 'localhost' ||
                url.hostname.endsWith('.vercel.app')
        } catch { /* invalid referer */ }
    }

    // 4. Accept header with browser-typical content types
    const accept = req.headers.get('accept') || ''
    if (accept.includes('text/html') || accept.includes('application/pdf') || accept.includes('image/')) return true

    return false
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ fileId: string }> }
) {
    const limited = await checkRateLimit(request, 'api')
    if (limited) return limited

    // Auth: Accept Bearer token (API calls) OR same-origin browser requests
    // (chart embeds, prefetches, audio elements — can't attach Bearer headers).
    // Direct curl/script access without either is blocked.
    const hasAuthHeader = request.headers.get('Authorization')?.startsWith('Bearer ')
    if (hasAuthHeader) {
        const auth = await withAuth(request)
        if (auth instanceof NextResponse) return auth
    } else if (!isTrustedBrowserRequest(request)) {
        const { fileId: fid } = await params
        logger.warn(`[FileProxy] Untrusted request blocked for ${fid}`, {
            secFetchSite: request.headers.get('sec-fetch-site'),
            secFetchDest: request.headers.get('sec-fetch-dest'),
            referer: request.headers.get('referer'),
        })
        return NextResponse.json(
            { error: "Authentication required" },
            { status: 401, headers: { 'Access-Control-Allow-Origin': getAllowedOrigin(request) } }
        )
    }

    const { fileId } = await params

    try {
        const result = await fetchFileById(fileId)

        if (!result) {
            return NextResponse.json(
                { error: 'File not found', fileId },
                { status: 404, headers: { 'Access-Control-Allow-Origin': getAllowedOrigin(request), 'Cache-Control': 'no-store' } }
            )
        }

        return new NextResponse(new Uint8Array(result.buffer), {
            status: 200,
            headers: {
                'Access-Control-Allow-Origin': getAllowedOrigin(request),
                'Cache-Control': 'public, max-age=86400, s-maxage=604800',
                'Content-Type': result.contentType,
                'X-Served-From': result.source,
            }
        })
    } catch (error) {
        logger.error(`[FileProxy] Unexpected error for ${fileId}:`, error)
        return NextResponse.json(
            { error: 'File unavailable', fileId },
            { status: 502, headers: { 'Access-Control-Allow-Origin': getAllowedOrigin(request), 'Cache-Control': 'no-store' } }
        )
    }
}
