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
 *
 * c11-fix-perform-track-position-in-url (M3-009): the active-track sub-route
 * `track/[trackId]/page.tsx` shares this page's fetch via `initial-frame.ts`
 * so a reload at `/perform/setlist/<id>/track/<trackId>` lands on the right
 * song instead of dropping the musician at song 1.
 */
import { SetlistPerformClient } from "./SetlistPerformClient"
import { fetchInitialFrame } from "./initial-frame"

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
