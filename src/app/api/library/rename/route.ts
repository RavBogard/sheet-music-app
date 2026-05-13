import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { createApiHandler } from "@/lib/api-wrapper"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { checkRateLimit } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"
import { z } from "zod"

const schema = z.object({
    fileId: z.string().min(1),
    displayName: z.string().min(1, "displayName cannot be empty"),
})

/**
 * PATCH /api/library/rename
 *
 * Renames a library item by setting a displayName field.
 * Requires 'band_leader' role or above.
 *
 * Body: { fileId: string, displayName: string }
 */
export const PATCH = createApiHandler(
    async (ctx) => {
        const limited = await checkRateLimit(ctx.req, 'api')
        if (limited) return limited

        const { fileId, displayName } = ctx.body!
        const trimmed = displayName.trim()

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

        // v60-09-01: mirror rename to songs/{fileId} so the ChartBindPopover
        // picker (driven by Dexie via subscribeSongsLibrary) reflects the new
        // title across devices without a manual reload.
        const songRef = db.collection('songs').doc(fileId)
        const [, songWriteResult] = await Promise.allSettled([
            docRef.update({
                displayName: trimmed,
                modifiedTime: new Date().toISOString(),
            }),
            songRef.set(
                {
                    title: trimmed,
                    normalizedTitle: trimmed.toLowerCase(),
                    updatedAt: Date.now(),
                },
                { merge: true },
            ),
        ])
        if (songWriteResult.status === 'rejected') {
            logger.warn(`[Rename] songs/{${fileId}} mirror failed`, songWriteResult.reason)
        }

        logger.info(`[Rename] ${fileId} → "${trimmed}"`)

        revalidatePath('/api/library/list')
        revalidatePath('/(main)/library', 'page')

        return NextResponse.json({ success: true, displayName: trimmed })
    },
    { role: 'band_leader', schema }
)
