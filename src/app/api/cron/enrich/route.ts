import { NextRequest, NextResponse } from "next/server"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { enrichFile } from "@/lib/enrichment-engine"
import { logger } from "@/lib/logger"

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * GET /api/cron/enrich
 * 
 * Automated nightly enrichment via Vercel Cron (2:00 AM UTC).
 * Scans library_index for unenriched files and processes them in batches.
 * 
 * Authenticated via CRON_SECRET header (set in Vercel env vars).
 */
export async function GET(req: NextRequest) {
    try {
        // Verify cron secret
        const authHeader = req.headers.get('authorization')
        const cronSecret = process.env.CRON_SECRET

        if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        logger.info("[Cron] Starting scheduled enrichment...")
        initAdmin()
        const db = getFirestore()

        // Find unenriched files (batch of 20 per run to stay within timeout)
        const snapshot = await db.collection('library_index')
            .where('metadata.enrichedAt', '==', null)
            .limit(20)
            .get()

        if (snapshot.empty) {
            logger.info("[Cron] No files need enrichment")
            return NextResponse.json({
                success: true,
                timestamp: new Date().toISOString(),
                stats: { total: 0, success: 0, failed: 0, skipped: 0 }
            })
        }

        const stats = { total: snapshot.size, success: 0, failed: 0, skipped: 0 }

        for (const doc of snapshot.docs) {
            const data = doc.data()
            // Skip folders and audio files
            if (data.mimeType?.includes('folder') || data.mimeType?.startsWith('audio/')) {
                stats.skipped++
                continue
            }

            try {
                await enrichFile(doc.id)
                stats.success++
            } catch (e) {
                logger.error(`[Cron] Failed to enrich ${data.name || doc.id}:`, e)
                stats.failed++
            }
        }

        logger.info("[Cron] Enrichment complete:", stats)
        return NextResponse.json({
            success: true,
            timestamp: new Date().toISOString(),
            stats
        })
    } catch (error: unknown) {
        logger.error("[Cron] Enrichment failed:", error)
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Enrichment failed" },
            { status: 500 }
        )
    }
}
