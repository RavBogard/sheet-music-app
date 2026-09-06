import { NextResponse } from "next/server"

import {
    readerMusicPreflight,
    rejectDisallowedReaderOrigin,
    withReaderMusicHeaders,
} from "@/lib/reader-music-http"
import {
    authorizeReaderMusic,
    fetchResolvedReaderMusic,
} from "@/lib/reader-music-server"

export const dynamic = "force-dynamic"
export const OPTIONS = readerMusicPreflight

function unavailable(request: Request, status: number): Response {
    return withReaderMusicHeaders(
        request,
        NextResponse.json({ status: "unavailable" }, { status }),
    )
}

export async function GET(request: Request): Promise<Response> {
    try {
        const originFailure = rejectDisallowedReaderOrigin(request)
        if (originFailure) return originFailure
        const access = await authorizeReaderMusic(request, true)
        if (!access.ok) {
            return unavailable(
                request,
                access.kind === "unauthenticated" ? 401 : 403,
            )
        }

        const unitId = new URL(request.url).searchParams.get("unitId")?.trim()
        if (!unitId) return unavailable(request, 404)
        const resolved = await fetchResolvedReaderMusic(unitId, access.orgId)
        if (!resolved) return unavailable(request, 404)

        return withReaderMusicHeaders(
            request,
            new NextResponse(new Uint8Array(resolved.file.buffer), {
                headers: {
                    "Content-Type": resolved.file.contentType,
                    "Content-Disposition": "inline",
                },
            }),
        )
    } catch {
        return unavailable(request, 503)
    }
}
