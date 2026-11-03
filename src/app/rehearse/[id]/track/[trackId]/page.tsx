/**
 * /rehearse/[id]/track/[trackId]: one song's chart full screen, with its
 * recording and previous/next song in a docked bar. Public like /rehearse/[id];
 * a track that isn't a song of this setlist is a 404.
 */
import { notFound } from "next/navigation"
import type { Metadata } from "next"

import { hasFeature } from "@/lib/org/features"
import { requestOrg } from "@/lib/org/request-org"

import { ID_RE, loadRehearse } from "../../load"
import { songNeighbors } from "../../rows"
import { RehearseTrackClient } from "./RehearseTrackClient"

export const dynamic = "force-dynamic"

export const metadata: Metadata = { robots: { index: false, follow: false } }

export default async function RehearseTrackPage({
    params,
}: {
    params: Promise<{ id: string; trackId: string }>
}) {
    const { id, trackId } = await params
    if (!ID_RE.test(id) || !ID_RE.test(trackId)) notFound()
    // The chart view is Perform's viewer, so it follows the tenant's `perform` flag.
    if (!(await hasFeature((await requestOrg()).orgId, "perform"))) notFound()
    const data = await loadRehearse(id)
    if (!data) notFound()
    const { song, prev, next } = songNeighbors(data.rows, trackId)
    if (!song) notFound()
    return (
        <RehearseTrackClient
            setlistId={id}
            song={song}
            kind={song.fileId ? data.kinds[song.fileId] ?? "pdf" : null}
            prevId={prev?.id ?? null}
            nextId={next?.id ?? null}
        />
    )
}
