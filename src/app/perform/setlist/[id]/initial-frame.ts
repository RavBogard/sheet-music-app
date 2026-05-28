/**
 * SSR fetch for /perform/setlist/[id] (and its track sub-route).
 *
 * Extracted from `page.tsx` so both the bare-path and the
 * `track/[trackId]` sub-route can hand the same SSR'd frame to
 * `SetlistPerformClient`. See `page.tsx` header for the UNAUTH-009
 * slow-3G rationale.
 */
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { serializeSetlist } from "@/lib/server-auth"
import { getTracksForSetlist } from "@/lib/server-tracks"
import { logger } from "@/lib/logger"
import type { Setlist, SetlistTrack } from "@/types/models"

export async function fetchInitialFrame(setlistId: string): Promise<{
    setlist: Setlist | null
    tracks: SetlistTrack[]
}> {
    try {
        const adminAvailable = initAdmin()
        if (!adminAvailable) {
            return { setlist: null, tracks: [] }
        }
        const db = getFirestore()
        const snap = await db.collection("setlists").doc(setlistId).get()
        if (!snap.exists) {
            return { setlist: null, tracks: [] }
        }
        const data = snap.data() as Record<string, unknown>
        const serialized = serializeSetlist(snap.id, data) as unknown as Setlist
        const tracksRaw = await getTracksForSetlist(db, setlistId, serialized as unknown as Record<string, unknown>)
        const tracks = tracksRaw as unknown as SetlistTrack[]
        return { setlist: serialized, tracks }
    } catch (err) {
        logger.warn(`[/perform/setlist/${setlistId}] SSR fetch failed; falling back to client-only:`, err)
        return { setlist: null, tracks: [] }
    }
}
