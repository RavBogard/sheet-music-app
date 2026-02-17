import { NextRequest, NextResponse } from "next/server"
import { syncLibraryIndex } from "@/lib/sync-engine"
import { logger } from "@/lib/logger"
import { captureException } from "@/lib/error-reporting"

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * GET /api/cron/sync
 * 
 * Automated hourly library sync via Vercel Cron.
 * Syncs Google Drive → Firestore library_index.
 * Also auto-invalidates chord caches for files whose modifiedTime changed.
 * 
 * Authenticated via CRON_SECRET header (set in Vercel env vars).
 */
export async function GET(req: NextRequest) {
    try {
        // Verify cron secret to prevent unauthorized triggers
        const authHeader = req.headers.get('authorization')
        const cronSecret = process.env.CRON_SECRET

        if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        logger.info("[Cron] Starting scheduled library sync...")
        const stats = await syncLibraryIndex()
        logger.info("[Cron] Sync complete:", stats)

        return NextResponse.json({
            success: true,
            timestamp: new Date().toISOString(),
            stats
        })
    } catch (error: unknown) {
        logger.error("[Cron] Sync failed:", error)
        captureException(error, { source: 'cron', location: 'sync' })
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Sync failed" },
            { status: 500 }
        )
    }
}
