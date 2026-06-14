import { NextResponse } from "next/server"

import { createApiHandler } from "@/lib/api-wrapper"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { downloadFromStoragePath } from "@/lib/firebase-storage"
import { checkRateLimit } from "@/lib/rate-limit"
import { verifySessionCookieRequest } from "@/lib/drive-file-auth"
import { byteRangeResponse } from "@/lib/http/byte-range"
import { logger } from "@/lib/logger"

export const dynamic = 'force-dynamic'

/**
 * GET /api/recordings/file/[id]
 *
 * Streams a recording's audio bytes from Firebase Storage. The admin SDK
 * bypasses Storage rules, so playback needs no client Storage SDK and no
 * `storage.rules` change — this serving route IS the access control.
 *
 * Auth: accept a Bearer token OR a verified Firebase `__session` cookie. An
 * <audio> element cannot attach a Bearer header, but it sends the HttpOnly
 * session cookie automatically — so this is a real auth boundary, not the
 * forgeable Sec-Fetch-* heuristic it previously relied on (v70-08-02).
 */
export const GET = createApiHandler(async (ctx) => {
    const limited = await checkRateLimit(ctx.req, 'api')
    if (limited) return limited

    if (!ctx.auth && !(await verifySessionCookieRequest(ctx.req))) {
        return NextResponse.json(
            { error: "Authentication required" },
            { status: 401 },
        )
    }

    const id = ctx.params?.id
    if (!id) {
        return NextResponse.json({ error: "Invalid recording ID" }, { status: 400 })
    }

    if (!initAdmin()) {
        return NextResponse.json(
            { error: "Server not ready", code: "FIREBASE_NOT_INITIALIZED" },
            { status: 500 },
        )
    }
    const db = getFirestore()

    const docSnap = await db.collection('recordings').doc(id).get()
    if (!docSnap.exists) {
        return NextResponse.json({ error: "Recording not found" }, { status: 404 })
    }

    const data = docSnap.data()!
    const storagePath = data.storagePath as string | undefined
    if (!storagePath) {
        return NextResponse.json(
            { error: "Recording has no stored file" },
            { status: 404 },
        )
    }

    const result = await downloadFromStoragePath(storagePath)
    if (!result.success) {
        if (result.reason === 'not_found') {
            return NextResponse.json(
                { error: "Recording file not found" },
                { status: 404 },
            )
        }
        logger.error(`[RecordingFile] download failed for ${id}: ${result.message}`)
        return NextResponse.json(
            { error: "Recording file unavailable" },
            { status: 502 },
        )
    }

    // H3 (v11.5-02-01): serve through the Range helper so the native <audio>
    // scrubber can seek a streamed recording. No-Range GETs are byte-identical
    // (plus Accept-Ranges); the auth/404/502 gates above are untouched.
    return byteRangeResponse(new Uint8Array(result.data.buffer), {
        contentType: (data.mimeType as string) || result.data.contentType,
        rangeHeader: ctx.req.headers.get('range'),
        headers: {
            'Content-Disposition': 'inline',
            'Cache-Control': 'public, max-age=86400, s-maxage=604800',
        },
    })
}, { requireAuth: false })
