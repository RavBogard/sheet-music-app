import { NextResponse } from "next/server"
import { createApiHandler, apiError } from "@/lib/api-wrapper"
import { checkRateLimit } from "@/lib/rate-limit"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"

/**
 * POST /api/admin/set-upload-permission
 *
 * Admin-only endpoint for managing upload permissions.
 *
 * Single user toggle:
 *   Body: { uid: string, canUpload: boolean }
 *
 * Batch migration (set canUpload=true for all existing band_leaders and admins):
 *   Body: { migrate: true }
 */
export const POST = createApiHandler(
    async (ctx) => {
        const limited = await checkRateLimit(ctx.req, 'api')
        if (limited) return limited

        initAdmin()
        const db = getFirestore()

        const body = ctx.body!

        if (body.migrate) {
            // Migration: set canUpload=true for existing band_leaders and admins
            const snapshot = await db.collection('users')
                .where('role', 'in', ['admin', 'band_leader'])
                .get()
            const batch = db.batch()
            for (const doc of snapshot.docs) {
                batch.update(doc.ref, { canUpload: true })
            }
            await batch.commit()
            return NextResponse.json({ migrated: snapshot.size })
        }

        // Single user toggle
        if (!body.uid || typeof body.canUpload !== 'boolean') {
            return apiError("uid and canUpload required", 400, "MISSING_FIELDS")
        }

        await db.collection('users').doc(body.uid).update({ canUpload: body.canUpload })
        return NextResponse.json({ success: true, uid: body.uid, canUpload: body.canUpload })
    },
    { role: 'admin' }
)
