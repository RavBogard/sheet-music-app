/**
 * /perform/setlist/[id] — Server Component
 *
 * UNAUTH-009 (cycle-4 supplement, CRITICAL):
 * The gig-band-member journey on slow-3G was 44s to first chart — 7.4× over
 * the <6s target — because the page was a pure client component that loaded
 * Firebase + Dexie + react-pdf + the 1.05MB PDF worker chunk before showing
 * the band member a tappable track row.
 *
 * Fix: convert to an async server component that fetches setlist + tracks
 * via Admin SDK at request time, then hands the SSR'd frame to
 * `SetlistPerformClient` as initial state. The user sees the full track
 * list (song titles, transposed keys, vocal leads, section headers) on
 * FCP. Hydration still happens but no longer blocks visual content;
 * realtime updates resume transparently once Firestore subscribes. Pairs
 * with the layout's deferred PDF worker preload + the page's lazy
 * PDFOverlay import to move the react-pdf chunk out of the initial graph.
 *
 * If Admin SDK is unavailable (dev without service-account creds, or a
 * transient Admin failure), we fall through with `initialSetlist: null`
 * — the client takes over with its normal Firestore subscription path.
 * No regression from pre-fix behavior on that branch.
 *
 * Setlist contents on /perform/setlist/<id> are public by design — see
 * [[feedback_setlist_public_policy]]. Anyone with the URL can fetch the
 * track list. No auth gate at this layer.
 */

import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { serializeSetlist } from "@/lib/server-auth"
import { getTracksForSetlist } from "@/lib/server-tracks"
import { logger } from "@/lib/logger"
import type { Setlist, SetlistTrack } from "@/types/models"
import { SetlistPerformClient } from "./SetlistPerformClient"

async function fetchInitialFrame(setlistId: string): Promise<{
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
            // Not-found surfaces through the client's existing error path
            // once the Firestore subscription returns the same not-found
            // state — same UX as the legacy client-only behavior.
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

export default async function SetlistPerformPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = await params
    const { setlist, tracks } = await fetchInitialFrame(id)

    return (
        <SetlistPerformClient
            setlistId={id}
            initialSetlist={setlist}
            initialTracks={tracks}
        />
    )
}
