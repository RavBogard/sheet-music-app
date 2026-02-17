import { NextResponse, NextRequest } from "next/server"
import { withAuth } from "@/lib/api-auth"
import { checkRateLimit } from "@/lib/rate-limit"
import { getFirestore } from "@/lib/firebase-admin"
import { recordSongUsage } from "@/lib/song-usage"
import { logger } from "@/lib/logger"

/**
 * POST /api/admin/backfill-usage
 *
 * One-time backfill: scan all public setlists with eventDate,
 * record song usage for each. Idempotent — running twice increments
 * totalUses but won't break anything.
 *
 * Admin only. Run once after deploying v5, then delete this route.
 */
export async function POST(request: NextRequest) {
    try {
        const auth = await withAuth(request, 'admin')
        if (auth instanceof NextResponse) return auth

        const limited = await checkRateLimit(request, 'api')
        if (limited) return limited

        const db = getFirestore()

        // Get all public setlists
        const snapshot = await db.collection('setlists')
            .where('isPublic', '==', true)
            .get()

        let setlistsProcessed = 0
        let songsRecorded = 0
        let errors = 0

        for (const doc of snapshot.docs) {
            const data = doc.data()
            if (!data.tracks || !Array.isArray(data.tracks)) continue

            const eventDate = data.eventDate?.toDate?.()
                || (data.date ? new Date(data.date) : null)
            if (!eventDate || isNaN(eventDate.getTime())) continue

            try {
                const result = await recordSongUsage(
                    doc.id,
                    data.name || 'Untitled',
                    eventDate,
                    data.tracks
                )
                songsRecorded += result.recorded
                errors += result.skipped
                setlistsProcessed++
            } catch (err) {
                logger.warn(`[Backfill] Failed for setlist ${doc.id}:`, err)
                errors++
            }
        }

        logger.info(`[Backfill] Complete: ${setlistsProcessed} setlists, ${songsRecorded} songs, ${errors} errors`)

        return NextResponse.json({
            success: true,
            setlistsProcessed,
            songsRecorded,
            errors,
            totalSetlists: snapshot.size,
        })
    } catch (err) {
        logger.error('[Backfill] Fatal error:', err)
        return NextResponse.json({ error: 'Backfill failed' }, { status: 500 })
    }
}
