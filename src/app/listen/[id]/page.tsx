/**
 * /listen/[id]: the quiet band-preparation page. Every song of a setlist in
 * the author's order, each with its one recording and a play button. No
 * chart viewer, no edit controls, and nothing under /perform links here.
 *
 * Public like /perform (recordings are public by Daniel's ruling), so it reads
 * on the server with the admin SDK: a signed-out visitor can't list recordings
 * through the client SDK. Each tenant lists only its own recordings, and a
 * setlist answers 404 on another tenant's host.
 */
import { notFound } from "next/navigation"
import type { Metadata } from "next"

import { getFeaturedForSongs } from "@/lib/recordings/featured-server"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"
import { rowOrg } from "@/lib/org/membership"
import { requestOrg } from "@/lib/org/request-org"
import { serializeSetlist } from "@/lib/server-auth"
import { getTracksForSetlist } from "@/lib/server-tracks"

import { ListenClient } from "./ListenClient"
import { buildListenRows } from "./rows"

export const dynamic = "force-dynamic"

export const metadata: Metadata = { robots: { index: false, follow: false } }

export default async function ListenPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    if (!initAdmin()) notFound()
    const db = getFirestore()
    const snap = await db.collection("setlists").doc(id).get()
    if (!snap.exists) notFound()
    const data = snap.data() as Record<string, unknown>
    const hostOrg = (await requestOrg()).orgId
    const orgId = rowOrg(data.orgId)
    if (orgId !== hostOrg || data.deletedAt) notFound()

    const setlist = serializeSetlist(snap.id, data) as unknown as { name?: string; eventDate?: unknown }
    const tracks = await getTracksForSetlist(db, id, data)

    let featured: Record<string, { id: string; title: string }> = {}
    try {
        const songIds = tracks.map((t) => (typeof t.songId === "string" ? t.songId : "")).filter(Boolean)
        featured = await getFeaturedForSongs(db, orgId, songIds)
    } catch (err) {
        // The page still lists the songs; a recordings failure reads as "No recording yet".
        logger.warn(`[/listen/${id}] featured lookup failed:`, err)
    }

    const rows = buildListenRows(tracks, featured)
    const eventDate = typeof setlist.eventDate === "string" ? setlist.eventDate : null
    return <ListenClient name={setlist.name ?? ""} eventDate={eventDate} rows={rows} />
}
