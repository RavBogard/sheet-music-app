import { NextResponse } from "next/server"
import { getT } from "@/i18n/server"

import { createApiHandler } from "@/lib/api-wrapper"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { downloadFromStoragePath } from "@/lib/firebase-storage"
import { checkRateLimit } from "@/lib/rate-limit"
import { byteRangeResponse } from "@/lib/http/byte-range"
import { logger } from "@/lib/logger"

export const dynamic = 'force-dynamic'

const RECORDING_PATH_RE = /^recordings\/[A-Za-z0-9._-]+$/

/** Audio types only; anything else is served as an opaque download type. */
function audioContentType(type: unknown): string {
    return typeof type === 'string' && type.toLowerCase().startsWith('audio/') ? type : 'application/octet-stream'
}

/**
 * GET /api/recordings/file/[id]
 *
 * Streams a recording's audio bytes from Firebase Storage. The admin SDK
 * bypasses Storage rules, so playback needs no client Storage SDK and no
 * `storage.rules` change.
 *
 * PUBLIC (Daniel, 2026-11-01: "anyone can listen. we don't care."): no
 * sign-in, so an <audio> element on the public Listen page plays it. The rate
 * limit and byte ranges stay; public caching is fine. Each tenant still LISTS
 * only its own recordings; that is enforced where recordings are listed.
 */
export const GET = createApiHandler(async (ctx) => {
    const limited = await checkRateLimit(ctx.req, 'api')
    if (limited) return limited

    const id = ctx.params?.id
    if (!id) {
        const t = await getT()
        return NextResponse.json({ error: t("api-recordings.invalidRecordingId") }, { status: 400 })
    }

    if (!initAdmin()) {
        const t = await getT()
        return NextResponse.json(
            { error: t("api-recordings.serverNotReady"), code: "FIREBASE_NOT_INITIALIZED" },
            { status: 500 },
        )
    }
    const db = getFirestore()

    const docSnap = await db.collection('recordings').doc(id).get()
    if (!docSnap.exists) {
        const t = await getT()
        return NextResponse.json({ error: t("api-recordings.recordingNotFound") }, { status: 404 })
    }

    const data = docSnap.data()!
    const storagePath = data.storagePath as string | undefined
    // The route is public and CDN-cached: it serves only objects under
    // recordings/, never another path a doc might name (another tenant's chart).
    if (!storagePath || !RECORDING_PATH_RE.test(storagePath)) {
        const t = await getT()
        return NextResponse.json(
            { error: t("api-recordings.noStoredFile") },
            { status: 404 },
        )
    }

    const result = await downloadFromStoragePath(storagePath)
    if (!result.success) {
        const t = await getT()
        if (result.reason === 'not_found') {
            return NextResponse.json(
                { error: t("api-recordings.fileNotFound") },
                { status: 404 },
            )
        }
        logger.error(`[RecordingFile] download failed for ${id}: ${result.message}`)
        return NextResponse.json(
            { error: t("api-recordings.fileUnavailable") },
            { status: 502 },
        )
    }

    // H3 (v11.5-02-01): serve through the Range helper so the native <audio>
    // scrubber can seek a streamed recording. No-Range GETs are byte-identical
    // (plus Accept-Ranges); the 404/502 gates above are untouched.
    return byteRangeResponse(new Uint8Array(result.data.buffer), {
        contentType: audioContentType(data.mimeType || result.data.contentType),
        rangeHeader: ctx.req.headers.get('range'),
        headers: {
            'Content-Disposition': 'inline',
            'X-Content-Type-Options': 'nosniff',
            'Cache-Control': 'public, max-age=86400, s-maxage=604800',
        },
    })
}, { requireAuth: false })
