import crypto from "crypto"
import { NextResponse } from "next/server"

import { getT } from "@/i18n/server"
import { apiError, createApiHandler } from "@/lib/api-wrapper"
import { getFirestore, initAdmin } from "@/lib/firebase-admin"
import { getRecordingStoragePath } from "@/lib/firebase-storage"
import { logger } from "@/lib/logger"
import { checkRateLimit } from "@/lib/rate-limit"
import {
    PENDING_COLLECTION,
    SIGNED_PUT_TTL_MS,
    signRecordingPut,
    songBelongsToOrg,
    type PendingRecordingUpload,
} from "@/lib/recordings/direct-upload-server"
import { MAX_RECORDING_BYTES, MAX_RECORDING_MB, resolveAudioUpload } from "@/lib/recordings/upload-policy"

export const dynamic = "force-dynamic"

/**
 * POST /api/recordings/upload-url  {songId, fileName, mimeType, size, title?, notes?}
 *
 * Step 1 of a recording upload: a signed PUT straight to Storage at
 * `recordings/{recordingId}.{ext}`, bound to this exact Content-Type and byte
 * count, plus a pending record for step 2 (/api/recordings/upload/complete).
 * No audio bytes pass through here (Vercel caps request bodies at 4.5 MB).
 *
 * Band leader or admin of the host congregation, for a song of that
 * congregation.
 */
export const POST = createApiHandler(async (ctx) => {
    const limited = await checkRateLimit(ctx.req, "upload")
    if (limited) return limited
    const t = await getT()

    if (!ctx.auth.isBandLeader && !ctx.auth.isAdmin) {
        return apiError(t("api-recordings.leadersOnly"), 403, "forbidden_role")
    }

    const body = (await ctx.req.json().catch(() => null)) as Record<string, unknown> | null
    const songId = typeof body?.songId === "string" ? body.songId.trim() : ""
    const fileName = typeof body?.fileName === "string" ? body.fileName.trim().slice(0, 300) : ""
    const mimeType = typeof body?.mimeType === "string" ? body.mimeType : ""
    const size = typeof body?.size === "number" ? body.size : NaN
    if (!songId) return apiError(t("api-recordings.songIdRequired"), 400, "invalid_argument")
    if (!fileName || !Number.isInteger(size) || size <= 0) {
        return apiError(t("api-recordings.noFileProvided"), 400, "invalid_argument")
    }

    const audio = resolveAudioUpload(mimeType, fileName)
    if (!audio) return apiError(t("api-recordings.audioOnly"), 400, "unsupported_type")
    if (size > MAX_RECORDING_BYTES) {
        return apiError(t("api-recordings.fileTooLarge", { maxMb: MAX_RECORDING_MB }), 413, "file_too_large")
    }

    if (!initAdmin()) return apiError(t("api-recordings.serverNotReady"), 500, "FIREBASE_NOT_INITIALIZED")
    const db = getFirestore()
    const orgId = ctx.auth.orgId

    if (!(await songBelongsToOrg(db, songId, orgId))) {
        return apiError(t("api-recordings.songNotFound"), 404, "song_not_found")
    }

    const recordingId = `rec-${crypto.randomUUID()}`
    const storagePath = getRecordingStoragePath(recordingId, audio.ext)
    const expiresAtMs = Date.now() + SIGNED_PUT_TTL_MS
    const rawTitle = typeof body?.title === "string" ? body.title.trim().slice(0, 200) : ""
    const notes = typeof body?.notes === "string" ? body.notes.trim().slice(0, 2000) : ""

    const pending: PendingRecordingUpload = {
        recordingId,
        orgId,
        uid: ctx.auth.uid,
        songId,
        storagePath,
        contentType: audio.contentType,
        size,
        fileName,
        title: rawTitle || fileName.replace(/\.[^/.]+$/, ""),
        ...(notes && { notes }),
        createdAt: new Date().toISOString(),
        expiresAt: new Date(expiresAtMs).toISOString(),
    }

    const signed = await signRecordingPut(storagePath, audio.contentType, size, expiresAtMs)
    await db.collection(PENDING_COLLECTION).doc(recordingId).set(pending)

    logger.info(`[RecordingUpload] signed ${recordingId} (${size} bytes) for song ${songId} in ${orgId}`)

    return NextResponse.json({
        recordingId,
        uploadUrl: signed.url,
        method: "PUT",
        headers: signed.headers,
        expiresAt: pending.expiresAt,
    })
})
