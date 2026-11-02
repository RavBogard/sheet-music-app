import { NextResponse } from "next/server"

import { getT } from "@/i18n/server"
import { apiError, createApiHandler } from "@/lib/api-wrapper"
import { getFirestore, initAdmin } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"
import { checkRateLimit } from "@/lib/rate-limit"
import {
    deleteRecordingObject,
    PENDING_COLLECTION,
    RECORDING_ID_RE,
    statRecordingObject,
    type PendingRecordingUpload,
} from "@/lib/recordings/direct-upload-server"

export const dynamic = "force-dynamic"

/**
 * POST /api/recordings/upload/complete  {recordingId}
 *
 * Step 2 of a recording upload. Checks the bytes the browser PUT to Storage
 * match what step 1 signed (size and Content-Type), then writes the
 * `recordings/{id}` doc with the same fields the old multipart route wrote.
 * Like that route it sets no `featured` flag: the song's featured take is
 * chosen by pickFeatured or by a band leader.
 *
 * Only the person who asked for the upload, in the same congregation, and
 * still a band leader or admin there, can complete it; anyone else gets 404.
 * A retry after success answers the same result and writes nothing.
 */
export const POST = createApiHandler(async (ctx) => {
    const limited = await checkRateLimit(ctx.req, "api")
    if (limited) return limited
    const t = await getT()

    if (!ctx.auth.isBandLeader && !ctx.auth.isAdmin) {
        return apiError(t("api-recordings.leadersOnly"), 403, "forbidden_role")
    }

    const body = (await ctx.req.json().catch(() => null)) as Record<string, unknown> | null
    const recordingId = typeof body?.recordingId === "string" ? body.recordingId : ""
    if (!RECORDING_ID_RE.test(recordingId)) {
        return apiError(t("api-recordings.invalidRecordingId"), 400, "invalid_argument")
    }

    if (!initAdmin()) return apiError(t("api-recordings.serverNotReady"), 500, "FIREBASE_NOT_INITIALIZED")
    const db = getFirestore()
    const pendingRef = db.collection(PENDING_COLLECTION).doc(recordingId)
    const pendingSnap = await pendingRef.get()
    const pending = pendingSnap.exists ? (pendingSnap.data() as PendingRecordingUpload) : null
    if (!pending || pending.uid !== ctx.auth.uid || pending.orgId !== ctx.auth.orgId) {
        return apiError(t("api-recordings.uploadNotFound"), 404, "not_found")
    }

    if (pending.completedAt) {
        return NextResponse.json({ success: true, recordingId, title: pending.title }, { status: 200 })
    }

    const stored = await statRecordingObject(pending.storagePath)
    if (!stored) {
        return apiError(t("api-recordings.uploadMissing"), 409, "upload_missing")
    }
    if (stored.size !== pending.size || stored.contentType !== pending.contentType) {
        logger.warn(`[RecordingUpload] ${recordingId} mismatch`, {
            want: { size: pending.size, contentType: pending.contentType },
            got: stored,
        })
        await deleteRecordingObject(pending.storagePath)
        return apiError(t("api-recordings.uploadMismatch"), 400, "upload_mismatch")
    }

    const recordingRef = db.collection("recordings").doc(recordingId)
    const completedAt = new Date().toISOString()
    const created = await db.runTransaction(async (tx) => {
        const fresh = await tx.get(pendingRef)
        if ((fresh.data() as PendingRecordingUpload | undefined)?.completedAt) return false
        tx.create(recordingRef, {
            id: recordingId,
            orgId: pending.orgId,
            songId: pending.songId,
            title: pending.title,
            fileName: pending.fileName,
            mimeType: pending.contentType,
            storagePath: pending.storagePath,
            ...(pending.notes && { notes: pending.notes }),
            createdAt: completedAt,
            createdBy: pending.uid,
        })
        tx.update(pendingRef, { completedAt })
        return true
    })

    if (created) {
        logger.info(`[RecordingUpload] "${pending.title}" stored as ${recordingId} for song ${pending.songId}`)
    }
    return NextResponse.json(
        { success: true, recordingId, title: pending.title },
        { status: created ? 201 : 200 },
    )
})
