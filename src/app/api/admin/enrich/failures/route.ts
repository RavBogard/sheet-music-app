import { NextRequest, NextResponse } from "next/server"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { requireAuth } from "@/lib/api-auth"

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/enrich/failures — List files with enrichment failures
 * DELETE /api/admin/enrich/failures — Reset failure counts (allow retry)
 */
export async function GET(req: NextRequest) {
    try {
        const auth = await requireAuth(req, 'admin')
    } catch (response) {
        return response as NextResponse
    }

    initAdmin()
    const db = getFirestore()

    const snap = await db.collection('library_index')
        .where('metadata.failCount', '>=', 1)
        .get()

    const failures = snap.docs.map(d => ({
        id: d.id,
        name: d.data().name || d.id,
        failCount: d.data().metadata?.failCount || 0,
        lastError: d.data().metadata?.lastError || '',
        lastFailure: d.data().metadata?.lastFailure || '',
    }))

    return NextResponse.json({ count: failures.length, failures })
}

export async function DELETE(req: NextRequest) {
    try {
        await requireAuth(req, 'admin')
    } catch (response) {
        return response as NextResponse
    }

    initAdmin()
    const db = getFirestore()

    const snap = await db.collection('library_index')
        .where('metadata.failCount', '>=', 1)
        .get()

    let reset = 0
    for (const doc of snap.docs) {
        await doc.ref.update({
            'metadata.failCount': 0,
            'metadata.lastFailure': null,
            'metadata.lastError': null,
        })
        reset++
    }

    return NextResponse.json({ reset, message: `Reset ${reset} file(s). They will be retried on next enrichment run.` })
}
