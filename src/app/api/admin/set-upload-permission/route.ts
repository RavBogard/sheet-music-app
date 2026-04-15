import { NextResponse } from "next/server"
import { z } from "zod"
import { createApiHandler } from "@/lib/api-wrapper"
import { checkRateLimit } from "@/lib/rate-limit"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"

// v4.4 SEC-001: narrow validated body so attackers can't smuggle extra
// fields (e.g., `role: 'admin'`) onto the update.
const setUploadPermissionSchema = z.union([
    z.object({ migrate: z.literal(true) }),
    z.object({ uid: z.string().min(1), canUpload: z.boolean() }),
])

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

        if (!initAdmin()) {
            return NextResponse.json(
                { error: "Server not ready", code: "FIREBASE_NOT_INITIALIZED" },
                { status: 500 },
            )
        }
        const db = getFirestore()

        const body = ctx.body!

        if ('migrate' in body) {
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

        // Single user toggle (zod-validated)
        await db.collection('users').doc(body.uid).update({ canUpload: body.canUpload })
        return NextResponse.json({ success: true, uid: body.uid, canUpload: body.canUpload })
    },
    { role: 'admin', schema: setUploadPermissionSchema }
)
