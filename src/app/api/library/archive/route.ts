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

        // Soft delete (or restore)
        await docRef.update({
            status: archive ? 'archived' : 'active',
            modifiedTime: new Date().toISOString(),
            archivedBy: archive ? ctx.auth.uid : null,
            archivedAt: archive ? new Date().toISOString() : null,
        })

        logger.info(`[Archive] ${archive ? 'Archived' : 'Restored'} ${fileId}`)

        // Invalidate caches
        revalidatePath('/api/library/list')
        revalidatePath('/(main)/library', 'page')

        return NextResponse.json({ success: true, archived: archive })
    },
    { role: 'band_leader', schema }
)
