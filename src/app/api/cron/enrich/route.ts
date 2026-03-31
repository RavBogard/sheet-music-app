import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "crypto"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { enrichFile } from "@/lib/enrichment-engine"
import { logger } from "@/lib/logger"
import { captureException } from "@/lib/error-reporting"
import { env } from "@/env.mjs"

function safeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) return false
    return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

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
        // Verify cron secret (constant-time comparison to prevent timing attacks)
        const authHeader = req.headers.get('authorization')
        const cronSecret = env.CRON_SECRET

        if (!cronSecret || !authHeader || !safeCompare(authHeader, `Bearer ${cronSecret}`)) {
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

            // Skip chronic failures (3+ attempts)
            const failCount = data.metadata?.failCount || 0
            if (failCount >= 3) {
                stats.skipped++
                continue
            }

            try {
                await enrichFile(doc.id)
                stats.success++
                // Clear any previous failure tracking on success
                if (failCount > 0) {
                    await db.collection('library_index').doc(doc.id).set({
                        metadata: { failCount: 0, lastFailure: null }
                    }, { merge: true })
                }
            } catch (e) {
                logger.error(`[Cron] Failed to enrich ${data.name || doc.id}:`, e)
                stats.failed++
                // Track failure
                await db.collection('library_index').doc(doc.id).set({
                    metadata: {
                        failCount: failCount + 1,
                        lastFailure: new Date().toISOString(),
                        lastError: e instanceof Error ? e.message : 'Unknown error'
                    }
                }, { merge: true }).catch(err => logger.warn(`[Cron] Failed to track enrichment failure for ${doc.id}:`, err))
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
        captureException(error, { source: 'cron', location: 'enrich' })
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Enrichment failed" },
            { status: 500 }
        )
    }
}
