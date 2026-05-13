import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { createApiHandler } from "@/lib/api-wrapper"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { checkRateLimit } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"
import { z } from "zod"

const schema = z.object({
    fileId: z.string().min(1),
    archive: z.boolean().default(true),
})

/**
 * PATCH /api/library/archive
 *
 * Soft-deletes a library item by setting its status to 'archived'.
 * Requires 'band_leader' role or above.
 *
 * Body: { fileId: string, archive: boolean }
 */
export const PATCH = createApiHandler(
    async (ctx) => {
        const limited = await checkRateLimit(ctx.req, 'api')
        if (limited) return limited

        const { fileId, archive } = ctx.body!

        if (!initAdmin()) {
            return NextResponse.json(
                { error: "Server not ready", code: "FIREBASE_NOT_INITIALIZED" },
                { status: 500 },
            )
        }
        const db = getFirestore()

        const docRef = db.collection('library_index').doc(fileId)
        const docSnap = await docRef.get()

        if (!docSnap.exists) {
            return NextResponse.json({ error: "File not found" }, { status: 404 })
        }

        // v60-09-01: mirror status to songs/{fileId} so the picker can filter.
        // sticky memory (recent[] + defaults from v50-04) is preserved — we
        // only flip the status flag, never delete the songs doc.
        const songRef = db.collection('songs').doc(fileId)
        const [, songWriteResult] = await Promise.allSettled([
            docRef.update({
                status: archive ? 'archived' : 'active',
                modifiedTime: new Date().toISOString(),
                archivedBy: archive ? ctx.auth.uid : null,
                archivedAt: archive ? new Date().toISOString() : null,
            }),
            songRef.set(
                {
                    status: archive ? 'archived' : 'active',
                    updatedAt: Date.now(),
                },
                { merge: true },
            ),
        ])
        if (songWriteResult.status === 'rejected') {
            logger.warn(`[Archive] songs/{${fileId}} mirror failed`, songWriteResult.reason)
        }

        logger.info(`[Archive] ${archive ? 'Archived' : 'Restored'} ${fileId}`)

        // Invalidate caches
        revalidatePath('/api/library/list')
        revalidatePath('/(main)/library', 'page')

        return NextResponse.json({ success: true, archived: archive })
    },
    { role: 'band_leader', schema }
)
