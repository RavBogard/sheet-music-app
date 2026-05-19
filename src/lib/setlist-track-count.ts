import 'server-only'
import { getTracksForSetlist } from '@/lib/server-tracks'
import { logger } from '@/lib/logger'

/**
 * Cycle-7-fixes Lane 3 — shared trackCount-reconcile helper.
 *
 * Recompute a setlist's denormalized `trackCount` from the actual
 * `tracks/{*}` top-level subcollection. Used by:
 *
 *   - the `verify-chart-bond-health` cron (per-tick auto-heal for upcoming
 *     published setlists), and
 *   - the `recompute_setlist_track_count` MCP tool (admin one-shot for
 *     setlists outside the cron's window — past services, drafts).
 *
 * C7I4-002 (Eitan Shabbat Morning 2/21 reports trackCount=43; actual
 * subcollection empty) — root cause was the `/api/setlist/delete` HTTP
 * cascade not deleting top-level tracks/{id} rows post v60-07-02. That
 * structural gap is closed in the route itself; this helper repairs the
 * dangling counters left over by older drift.
 *
 * Returns the repair record (or null when the counter was already correct).
 * Does not throw on write failures — logs + returns the failure shape so
 * callers can surface it to the operator without breaking the wider job.
 */

interface SetlistData extends Record<string, unknown> {
    trackCount?: unknown
}

export interface TrackCountRepairResult {
    setlistId: string
    declared: number
    actual: number
    drifted: boolean
    written: boolean
    error?: string
}

export async function recomputeTrackCount(
    db: FirebaseFirestore.Firestore,
    setlistId: string,
    setlistData: SetlistData,
): Promise<TrackCountRepairResult> {
    const declared =
        typeof setlistData.trackCount === 'number' ? setlistData.trackCount : 0
    const tracks = await getTracksForSetlist(db, setlistId, setlistData)
    const actual = tracks.length
    if (declared === actual) {
        return { setlistId, declared, actual, drifted: false, written: false }
    }
    try {
        await db.collection('setlists').doc(setlistId).update({
            trackCount: actual,
            updatedAt: new Date(),
        })
        logger.info(
            `[setlist-track-count] repaired ${setlistId} (${declared} → ${actual})`,
        )
        return { setlistId, declared, actual, drifted: true, written: true }
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        logger.warn(
            `[setlist-track-count] repair failed for ${setlistId}: ${msg}`,
        )
        return { setlistId, declared, actual, drifted: true, written: false, error: msg }
    }
}
