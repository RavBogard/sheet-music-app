/**
 * Server loading shared by /rehearse/[id] and /rehearse/[id]/track/[trackId].
 *
 * Public like /perform (recordings are public by Daniel's ruling), so it reads
 * with the admin SDK. A setlist answers null on another tenant's host.
 */
import { resolveViewerKind, type ViewerKind } from "@/components/performance/resolveViewerKind"
import { getFeaturedForSongs } from "@/lib/recordings/featured-server"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"
import { rowOrg } from "@/lib/org/membership"
import { requestOrg } from "@/lib/org/request-org"
import { serializeSetlist } from "@/lib/server-auth"
import { getTracksForSetlist } from "@/lib/server-tracks"

import { buildRehearseRows, type RehearseRow } from "./rows"

export const ID_RE = /^[A-Za-z0-9_-]{1,128}$/

type Loaded = {
    orgId: string
    name: string
    eventDate: string | null
    tracks: Awaited<ReturnType<typeof getTracksForSetlist>>
}

/** The setlist and its tracks, or null for any reason it can't be shown (never throws). */
async function loadSetlist(id: string): Promise<Loaded | null> {
    try {
        if (!initAdmin()) return null
        const db = getFirestore()
        const snap = await db.collection("setlists").doc(id).get()
        if (!snap.exists) return null
        const data = snap.data() as Record<string, unknown>
        const hostOrg = (await requestOrg()).orgId
        const orgId = rowOrg(data.orgId)
        if (orgId !== hostOrg || data.deletedAt) return null
        const setlist = serializeSetlist(snap.id, data) as unknown as { name?: string; eventDate?: unknown }
        const tracks = await getTracksForSetlist(db, id, data)
        return {
            orgId,
            name: setlist.name ?? "",
            eventDate: typeof setlist.eventDate === "string" ? setlist.eventDate : null,
            tracks,
        }
    } catch (err) {
        logger.warn(`[/rehearse/${id}] setlist load failed:`, err)
        return null
    }
}

/** Which viewer each bonded chart needs, from its library row (tenant-scoped). Never throws. */
async function loadChartKinds(
    tracks: Loaded["tracks"],
    orgId: string,
): Promise<Record<string, ViewerKind>> {
    const out: Record<string, ViewerKind> = {}
    const ids = [...new Set(tracks.map((t) => (typeof t.fileId === "string" ? t.fileId : "")).filter(Boolean))]
    if (ids.length === 0) return out
    let rows: Record<string, { name: string; mimeType: string }> = {}
    try {
        const db = getFirestore()
        const docs = await db.getAll(...ids.slice(0, 100).map((f) => db.collection("library_index").doc(f)))
        rows = {}
        for (const d of docs) {
            if (!d.exists) continue
            const data = d.data() as Record<string, unknown>
            if (rowOrg(data.orgId) !== orgId) continue
            rows[d.id] = {
                name: typeof data.name === "string" ? data.name : "",
                mimeType: typeof data.mimeType === "string" ? data.mimeType : "",
            }
        }
    } catch (err) {
        logger.warn("[rehearse] library lookup failed; guessing viewers from the track:", err)
    }
    for (const t of tracks) {
        const fileId = typeof t.fileId === "string" ? t.fileId : ""
        if (!fileId) continue
        out[fileId] = resolveViewerKind(
            { fileId, fileName: t.fileName as string | undefined, mimeType: t.mimeType as string | undefined },
            rows[fileId],
        )
    }
    return out
}

export type RehearseData = {
    name: string
    eventDate: string | null
    rows: RehearseRow[]
    kinds: Record<string, ViewerKind>
}

/** Everything both Rehearse pages need, or null for a 404. */
export async function loadRehearse(id: string): Promise<RehearseData | null> {
    const loaded = await loadSetlist(id)
    if (!loaded) return null

    let featured: Record<string, { id: string; title: string }> = {}
    try {
        const songIds = loaded.tracks.map((t) => (typeof t.songId === "string" ? t.songId : "")).filter(Boolean)
        featured = await getFeaturedForSongs(getFirestore(), loaded.orgId, songIds)
    } catch (err) {
        // The page still lists the songs; a recordings failure reads as "No recording yet".
        logger.warn(`[/rehearse/${id}] featured lookup failed:`, err)
    }
    const rows = buildRehearseRows(loaded.tracks, featured)
    const kinds = await loadChartKinds(loaded.tracks, loaded.orgId)
    return { name: loaded.name, eventDate: loaded.eventDate, rows, kinds }
}
