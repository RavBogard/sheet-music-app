import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { withAuth } from "@/lib/api-auth"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { checkRateLimit } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"

/**
 * PATCH /api/library/archive
 * 
 * Soft-deletes a library item by setting its status to 'archived'.
 * Requires 'band_leader' role or above.
 * 
 * Body: { fileId: string, archive: boolean }
 */
export async function PATCH(req: NextRequest) {
    try {
        // Rate limit
        const limited = await checkRateLimit(req, 'api')
        if (limited) return limited

        // Auth check: leaders and admins can archive
        const auth = await withAuth(req, 'band_leader')
        if (auth instanceof NextResponse) return auth

        const { fileId, archive = true } = await req.json()

        if (!fileId) {
            return NextResponse.json({ error: "Missing fileId" }, { status: 400 })
        }

        initAdmin()
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
            archivedBy: archive ? auth.uid : null,
            archivedAt: archive ? new Date().toISOString() : null,
        })

        logger.info(`[Archive] ${archive ? 'Archived' : 'Restored'} ${fileId}`)

        // Invalidate caches
        revalidatePath('/api/library/list')
        revalidatePath('/(main)/library', 'page')

        return NextResponse.json({ success: true, archived: archive })

    } catch (error: unknown) {
        logger.error("[Archive] Error:", error)
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Archive failed" },
            { status: 500 }
        )
    }
}
