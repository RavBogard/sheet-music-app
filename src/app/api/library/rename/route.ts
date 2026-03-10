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

        initAdmin()
        const db = getFirestore()

        const docRef = db.collection('library_index').doc(fileId)
        const docSnap = await docRef.get()

        if (!docSnap.exists) {
            return NextResponse.json({ error: "File not found" }, { status: 404 })
        }

        await docRef.update({
            displayName: trimmed,
            modifiedTime: new Date().toISOString(),
        })

        logger.info(`[Rename] ${fileId} → "${trimmed}"`)

        revalidatePath('/api/library/list')
        revalidatePath('/(main)/library', 'page')

        return NextResponse.json({ success: true, displayName: trimmed })
    },
    { role: 'band_leader', schema }
)
