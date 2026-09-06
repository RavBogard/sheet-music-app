import { NextRequest, NextResponse } from "next/server"

import {
    publicReaderMusicPreflight,
    rejectDisallowedPublicReaderOrigin,
    rejectPublicReaderCredentialsOrRange,
    withPublicReaderMusicHeaders,
} from "@/lib/reader-music-http"
import { publicReaderChartDefinition } from "@/lib/reader-music-public"
import { fetchPublicResolvedReaderMusic } from "@/lib/reader-music-server"
import { checkPublicReaderRateLimit } from "@/lib/reader-public-rate-limit"

export const dynamic = "force-dynamic"
export const OPTIONS = publicReaderMusicPreflight

function unavailable(request: Request, status: number): Response {
    return withPublicReaderMusicHeaders(
        request,
        NextResponse.json({ status: "unavailable" }, { status }),
    )
}

function rateLimited(
    request: Request,
    decision: { status: 429 | 503; retryAfterSec?: number },
): Response {
    const response = unavailable(request, decision.status)
    if (decision.retryAfterSec) {
        response.headers.set("Retry-After", String(decision.retryAfterSec))
    }
    return response
}

export async function GET(request: NextRequest): Promise<Response> {
    try {
        const originFailure = rejectDisallowedPublicReaderOrigin(request)
        if (originFailure) return originFailure
        const transportFailure = rejectPublicReaderCredentialsOrRange(request)
        if (transportFailure) return transportFailure

        const params = new URL(request.url).searchParams
        const unitIds = params.getAll("unitId")
        if (
            unitIds.length !== 1 ||
            [...params.keys()].some((key) => key !== "unitId")
        ) {
            return unavailable(request, 404)
        }
        const unitId = unitIds[0]?.trim()
        if (!unitId) return unavailable(request, 404)

        const limit = await checkPublicReaderRateLimit(request, "chart")
        if (!limit.allowed) return rateLimited(request, limit)
        if (!publicReaderChartDefinition(unitId)) return unavailable(request, 404)

        const resolved = await fetchPublicResolvedReaderMusic(unitId)
        if (!resolved) return unavailable(request, 404)

        return withPublicReaderMusicHeaders(
            request,
            new NextResponse(new Uint8Array(resolved.buffer), {
                headers: {
                    "Content-Type": resolved.definition.contentType,
                    "Content-Length": String(resolved.buffer.byteLength),
                    "Content-Disposition": "inline; filename=\"chart.pdf\"",
                },
            }),
            "approved-bytes",
        )
    } catch {
        return unavailable(request, 503)
    }
}
