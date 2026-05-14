import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"

/**
 * Admin-SDK read helpers for the `songs/{id}` catalog — the MCP read tools'
 * view of the song library. The client-side `songs` helpers (src/lib/songs/*)
 * use the Firebase *client* SDK and can't run in a server route, so MCP reads
 * the catalog directly here. Read-only; no writes.
 */

export interface SongRecord {
    id: string
    title: string
    key?: string
    bpm?: number
    lead?: string
    status?: string
}

function toSongRecord(id: string, data: Record<string, unknown>): SongRecord {
    const defaults = (data.defaults ?? {}) as {
        key?: unknown
        bpm?: unknown
        lead?: unknown
    }
    const rec: SongRecord = {
        id,
        title: typeof data.title === "string" ? data.title : "",
    }
    if (typeof defaults.key === "string") rec.key = defaults.key
    if (typeof defaults.bpm === "number") rec.bpm = defaults.bpm
    if (typeof defaults.lead === "string") rec.lead = defaults.lead
    if (typeof data.status === "string") rec.status = data.status
    return rec
}

/** Every song in the catalog. Returns [] on error (fail-soft, like server-library). */
export async function getAllSongs(): Promise<SongRecord[]> {
    try {
        initAdmin()
        const db = getFirestore()
        const snap = await db.collection("songs").get()
        return snap.docs.map((d) => toSongRecord(d.id, d.data()))
    } catch (error) {
        logger.warn("[mcp] songs fetch failed:", error)
        return []
    }
}

/** One song by id, or null if missing / on error. */
export async function getSongById(id: string): Promise<SongRecord | null> {
    try {
        initAdmin()
        const db = getFirestore()
        const doc = await db.collection("songs").doc(id).get()
        if (!doc.exists) return null
        return toSongRecord(doc.id, doc.data() ?? {})
    } catch (error) {
        logger.warn("[mcp] song fetch failed:", error)
        return null
    }
}
