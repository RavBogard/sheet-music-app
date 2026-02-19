import { NextRequest, NextResponse } from "next/server"
import { checkRateLimit } from "@/lib/rate-limit"
import { fetchFileById } from "@/lib/file-fetcher"
import { logger } from "@/lib/logger"

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function getAllowedOrigin(request: NextRequest): string {
    const origin = request.headers.get('origin') || ''
    // Parse origin to check hostname safely
    try {
        const url = new URL(origin)
        const host = url.hostname
        if (
            host === 'centralreform.live' ||
            host === 'www.centralreform.live' ||
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

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ fileId: string }> }
) {
    const limited = await checkRateLimit(request, 'api')
    if (limited) return limited

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
                'Cache-Control': result.source === 'firebase-storage'
                    ? 'public, max-age=86400, s-maxage=604800'
                    : 'public, max-age=3600, s-maxage=86400',
                'Content-Type': result.contentType,
                'X-Served-From': result.source,
            }
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        logger.error(`[FileProxy] Unexpected error for ${fileId}:`, message)
        return NextResponse.json(
            { error: 'File unavailable', fileId, reason: message },
            { status: 502, headers: { 'Access-Control-Allow-Origin': getAllowedOrigin(request), 'Cache-Control': 'no-store' } }
        )
    }
}
