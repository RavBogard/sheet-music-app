import { NextResponse } from "next/server"

import {
    readerMusicPreflight,
    rejectDisallowedReaderOrigin,
    withReaderMusicHeaders,
} from "@/lib/reader-music-http"
import {
    authorizeReaderMusic,
    resolveReaderMusic,
} from "@/lib/reader-music-server"

export const dynamic = "force-dynamic"
export const OPTIONS = readerMusicPreflight

function calmUnavailable(
    request: Request,
    status: number,
    unitId?: string,
): Response {
    return withReaderMusicHeaders(
        request,
        NextResponse.json(
            unitId ? { status: "unavailable", unitId } : { status: "unavailable" },
            { status },
        ),
    )
}

export async function POST(request: Request): Promise<Response> {
    try {
        const originFailure = rejectDisallowedReaderOrigin(request)
        if (originFailure) return originFailure
        const access = await authorizeReaderMusic(request, true)
        if (!access.ok) {
            return calmUnavailable(
                request,
                access.kind === "unauthenticated" ? 401 : 403,
            )
        }

        let body: unknown
        try {
            body = await request.json()
        } catch {
            return calmUnavailable(request, 400)
        }
        if (
            !body ||
            typeof body !== "object" ||
            Object.keys(body).length !== 1 ||
            typeof (body as Record<string, unknown>).unitId !== "string" ||
            !(body as { unitId: string }).unitId.trim()
        ) {
            return calmUnavailable(request, 400)
        }
        const unitId = (body as { unitId: string }).unitId.trim()
        const resolved = await resolveReaderMusic(unitId, access.orgId)
        if (resolved.status !== "available" || !resolved.pieceId) {
            return calmUnavailable(request, 200, unitId)
        }

        return withReaderMusicHeaders(
            request,
            NextResponse.json({
                status: "available",
                unitId,
                pieceId: resolved.pieceId,
                selection: resolved.binding,
                chartUrl: `/api/reader/music/chart?unitId=${encodeURIComponent(unitId)}`,
            }),
        )
    } catch {
        return calmUnavailable(request, 503)
    }
}
