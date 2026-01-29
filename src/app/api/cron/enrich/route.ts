import { NextResponse } from 'next/server'
import { getFirestore } from 'firebase-admin/firestore'
import { initAdmin } from '@/lib/firebase-admin'
import { enrichFile } from '@/lib/enrichment-engine'

// Initialize Admin
initAdmin()
const db = getFirestore()

export const dynamic = 'force-dynamic'
// Allow longer timeout for enrichment batch
export const maxDuration = 60

export async function GET(request: Request) {
    try {
        const authHeader = request.headers.get('authorization')
        if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
            return new NextResponse('Unauthorized', { status: 401 })
        }

        console.log("[Cron] Starting Enrichment Scan...")

        // 1. Find unenriched files (limit 5 to avoid timeouts in one cron run)
        const snapshot = await db.collection('library_index')
            .where('metadata.enrichedAt', '==', null)
            .limit(5)
            .get()

        if (snapshot.empty) {
            console.log("[Cron] No unenriched files found.")
            return NextResponse.json({ success: true, message: "No files needed enrichment" })
        }

        const stats = {
            total: snapshot.size,
            success: 0,
            failed: 0,
            skipped: 0
        }

        // 2. Process them
        for (const doc of snapshot.docs) {
            const data = doc.data()
            // Skip folders or audio (for now, unless we do audio analysis later)
            if (data.mimeType.includes('folder') || data.mimeType.startsWith('audio/')) {
                stats.skipped++
                continue
            }

            try {
                // We don't have a user token for "Cron", so `enrichFile` needs to handle "System" mode
                // But `enrichFile` uses `DriveClient` which uses Service Account, so we are good!
                // We just need to ensure `enrichFile` logic doesn't require something user-specific.
                // Checking `src/lib/enrichment-engine.ts`...
                // It calls `adminDb.collection...doc(fileId).update(...)`. 
                // It looks standalone.

                await enrichFile(doc.id)
                stats.success++
                console.log(`[Cron] Enriched ${data.name}`)
            } catch (e) {
                console.error(`[Cron] Failed to enrich ${data.name}`, e)
                stats.failed++
            }
        }

        return NextResponse.json({
            success: true,
            message: "Enrichment batch complete",
            stats
        })

    } catch (error: any) {
        console.error("[Cron] Enrichment Failed:", error)
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
}
