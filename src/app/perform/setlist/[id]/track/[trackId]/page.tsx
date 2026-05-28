/**
 * /perform/setlist/[id]/track/[trackId] — Server Component
 *
 * c11-fix-perform-track-position-in-url (cycle-11 M3-009 STICKINESS): the
 * active track is now URL-encoded so an iPad refresh / wifi-blip / PWA
 * background-resume lands on the same song the musician was viewing.
 *
 * SSR fetch is identical to the bare `[id]` route (shared via
 * `../../initial-frame.ts`); the only delta is that we thread the
 * trackId param to `SetlistPerformClient` so it seeds `activeSongIndex`
 * to that track's row on first render. If the trackId is unknown to
 * the live frame (deleted, mis-typed), the client falls back to the
 * bare-path behavior (no overlay) — no 404.
 *
 * Setlist contents remain public by design per
 * [[feedback_setlist_public_policy]]; no auth gate here either.
 */
import { SetlistPerformClient } from "../../SetlistPerformClient"
import { fetchInitialFrame } from "../../initial-frame"

export default async function SetlistPerformTrackPage({
    params,
}: {
    params: Promise<{ id: string; trackId: string }>
}) {
    const { id, trackId } = await params
    const { setlist, tracks } = await fetchInitialFrame(id)

    return (
        <SetlistPerformClient
            setlistId={id}
            initialSetlist={setlist}
            initialTracks={tracks}
            initialTrackId={trackId}
        />
    )
}
