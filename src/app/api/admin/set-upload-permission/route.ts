import { NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/lib/api-auth"
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
export async function POST(req: NextRequest) {
    const auth = await withAuth(req, 'admin')
    if (auth instanceof NextResponse) return auth

    initAdmin()
    const db = getFirestore()

    try {
        const body = await req.json()

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
            return NextResponse.json(
                { error: "uid and canUpload required" },
                { status: 400 }
            )
        }

        await db.collection('users').doc(body.uid).update({ canUpload: body.canUpload })
        return NextResponse.json({ success: true, uid: body.uid, canUpload: body.canUpload })

    } catch (error: unknown) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to update upload permission" },
            { status: 500 }
        )
    }
}
