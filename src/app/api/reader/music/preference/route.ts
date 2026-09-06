import { NextResponse } from "next/server"

import {
    readerMusicPreflight,
    rejectDisallowedReaderOrigin,
    withReaderMusicHeaders,
} from "@/lib/reader-music-http"
import {
    authorizeReaderMusic,
    setReaderMusicPreference,
} from "@/lib/reader-music-server"

export const dynamic = "force-dynamic"

function unavailable(request: Request, status: number): Response {
    return withReaderMusicHeaders(
        request,
        NextResponse.json({ status: "unavailable" }, { status }),
    )
}

export const OPTIONS = readerMusicPreflight

export async function GET(request: Request): Promise<Response> {
    try {
        const originFailure = rejectDisallowedReaderOrigin(request)
        if (originFailure) return originFailure
        const access = await authorizeReaderMusic(request, false)
        if (!access.ok) {
            return unavailable(
                request,
                access.kind === "unauthenticated" ? 401 : 403,
            )
        }
        return withReaderMusicHeaders(
            request,
            NextResponse.json({
                readerMusicEnabled: access.readerMusicEnabled,
            }),
        )
    } catch {
        return unavailable(request, 503)
    }
}

export async function PATCH(request: Request): Promise<Response> {
    try {
        const originFailure = rejectDisallowedReaderOrigin(request)
        if (originFailure) return originFailure
        const access = await authorizeReaderMusic(request, false)
        if (!access.ok) {
            return unavailable(
                request,
                access.kind === "unauthenticated" ? 401 : 403,
            )
        }

        let body: unknown
        try {
            body = await request.json()
        } catch {
            return unavailable(request, 400)
        }
        if (
            !body ||
            typeof body !== "object" ||
            Object.keys(body).length !== 1 ||
            typeof (body as Record<string, unknown>).readerMusicEnabled !== "boolean"
        ) {
            return unavailable(request, 400)
        }
        const readerMusicEnabled = (body as { readerMusicEnabled: boolean })
            .readerMusicEnabled
        await setReaderMusicPreference(access.uid, readerMusicEnabled)
        return withReaderMusicHeaders(
            request,
            NextResponse.json({ readerMusicEnabled }),
        )
    } catch {
        return unavailable(request, 503)
    }
}
