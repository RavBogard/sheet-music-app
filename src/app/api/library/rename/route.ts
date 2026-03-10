import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { withAuth } from "@/lib/api-auth"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { checkRateLimit } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"

/**
 * PATCH /api/library/rename
 *
 * Renames a library item by setting a displayName field.
 * Requires 'band_leader' role or above.
 *
 * Body: { fileId: string, displayName: string }
 */
export async function PATCH(req: NextRequest) {
    try {
        const limited = await checkRateLimit(req, 'api')
        if (limited) return limited

        const auth = await withAuth(req, 'band_leader')
        if (auth instanceof NextResponse) return auth

        const { fileId, displayName } = await req.json()

        if (!fileId) {
            return NextResponse.json({ error: "Missing fileId" }, { status: 400 })
        }

        if (typeof displayName !== 'string') {
            return NextResponse.json({ error: "Missing displayName" }, { status: 400 })
        }

        const trimmed = displayName.trim()
        if (!trimmed) {
            return NextResponse.json({ error: "displayName cannot be empty" }, { status: 400 })
        }

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

    } catch (error: unknown) {
        logger.error("[Rename] Error:", error)
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Rename failed" },
            { status: 500 }
        )
    }
}
