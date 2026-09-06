import { NextRequest, NextResponse } from "next/server"

import {
    publicReaderMusicPreflight,
    rejectDisallowedPublicReaderOrigin,
    withPublicReaderMusicHeaders,
} from "@/lib/reader-music-http"
import { publicReaderChartDefinition } from "@/lib/reader-music-public"
import { resolvePublicReaderMusic } from "@/lib/reader-music-server"
import { checkRateLimit } from "@/lib/rate-limit"

export const dynamic = "force-dynamic"
export const OPTIONS = publicReaderMusicPreflight

const MAX_SELECTION_BODY_BYTES = 512

async function readBoundedBody(request: Request): Promise<string | null> {
    if (!request.body) return ""
    const reader = request.body.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    try {
        while (true) {
            const { done, value } = await reader.read()
            if (done) break
            total += value.byteLength
            if (total > MAX_SELECTION_BODY_BYTES) {
                await reader.cancel()
                return null
            }
            chunks.push(value)
        }
    } finally {
        reader.releaseLock()
    }
    const bytes = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
        bytes.set(chunk, offset)
        offset += chunk.byteLength
    }
    try {
        return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
    } catch {
        return null
    }
}

function calmUnavailable(
    request: Request,
    status: number,
    unitId?: string,
): Response {
    return withPublicReaderMusicHeaders(
        request,
        NextResponse.json(
            unitId ? { status: "unavailable", unitId } : { status: "unavailable" },
            { status },
        ),
    )
}

function rateLimited(request: Request, limited: Response): Response {
    const response = calmUnavailable(request, 429)
    const retryAfter = limited.headers.get("Retry-After")
    if (retryAfter && /^\d+$/.test(retryAfter)) {
        response.headers.set("Retry-After", retryAfter)
    }
    return response
}

export async function POST(request: NextRequest): Promise<Response> {
    try {
        const originFailure = rejectDisallowedPublicReaderOrigin(request)
        if (originFailure) return originFailure

        const declaredLength = Number(request.headers.get("content-length") ?? "0")
        if (Number.isFinite(declaredLength) && declaredLength > MAX_SELECTION_BODY_BYTES) {
            return calmUnavailable(request, 400)
        }
        const limited = await checkRateLimit(request, "api")
        if (limited) return rateLimited(request, limited)

        let body: unknown
        try {
            const raw = await readBoundedBody(request)
            if (raw === null) return calmUnavailable(request, 400)
            body = JSON.parse(raw)
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
        const definition = publicReaderChartDefinition(unitId)
        if (!definition) return calmUnavailable(request, 200, unitId)
        const resolved = await resolvePublicReaderMusic(unitId)
        if (resolved.status !== "available") {
            return calmUnavailable(request, 200, unitId)
        }

        return withPublicReaderMusicHeaders(
            request,
            NextResponse.json({
                status: "available",
                unitId,
                kind: definition.kind,
                contentType: definition.contentType,
                chartUrl: `/api/reader/music/chart?unitId=${encodeURIComponent(unitId)}`,
            }),
        )
    } catch {
        return calmUnavailable(request, 503)
    }
}
