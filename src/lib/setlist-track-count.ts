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
 * C10I1-002 — the helper now ALSO reconciles `songCount` (the song-type
 * subset displayed on the public `/perform` landing card). songCount was
 * previously only maintained by the client-side SetlistGridHydrator
 * reconciler, which never runs for MCP-authored track adds — so flagship
 * services authored via Claude Desktop showed "0 songs" on the landing.
 * Healing it here means both the `verify-chart-bond-health` cron and the
 * `recompute_setlist_track_count` admin backfill correct the landing.
 *
 * Returns the repair record (or null when the counters were already
 * correct). Does not throw on write failures — logs + returns the failure
 * shape so callers can surface it to the operator without breaking the
 * wider job.
 */

interface SetlistData extends Record<string, unknown> {
    trackCount?: unknown
    songCount?: unknown
}

/**
 * Single source of truth for "does this track count toward songCount". A
 * track is a song unless it carries an explicit non-"song" type (header /
 * reading / prayer / transition / note). Mirrors the same predicate inlined
 * in SetlistPerformClient, SetlistGridHydrator, and print-pipeline.
 */
export function isSongType(type: unknown): boolean {
    return !type || type === 'song'
}

export interface TrackCountRepairResult {
    setlistId: string
    declared: number
    actual: number
    /** Declared `songCount` (song-type subset) before repair. */
    declaredSongs: number
    /** Actual song-type track count recomputed from the subcollection. */
    actualSongs: number
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
    const declaredSongs =
        typeof setlistData.songCount === 'number' ? setlistData.songCount : 0
    const tracks = await getTracksForSetlist(db, setlistId, setlistData)
    const actual = tracks.length
    const actualSongs = tracks.filter((t) =>
        isSongType((t as { type?: unknown }).type),
    ).length
    if (declared === actual && declaredSongs === actualSongs) {
        return {
            setlistId,
            declared,
            actual,
            declaredSongs,
            actualSongs,
            drifted: false,
            written: false,
        }
    }
    try {
        await db.collection('setlists').doc(setlistId).update({
            trackCount: actual,
            songCount: actualSongs,
            updatedAt: new Date(),
        })
        logger.info(
            `[setlist-track-count] repaired ${setlistId} (tracks ${declared} → ${actual}, songs ${declaredSongs} → ${actualSongs})`,
        )
        return {
            setlistId,
            declared,
            actual,
            declaredSongs,
            actualSongs,
            drifted: true,
            written: true,
        }
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        logger.warn(
            `[setlist-track-count] repair failed for ${setlistId}: ${msg}`,
        )
        return {
            setlistId,
            declared,
            actual,
            declaredSongs,
            actualSongs,
            drifted: true,
            written: false,
            error: msg,
        }
    }
}
