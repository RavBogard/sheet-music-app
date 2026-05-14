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

// Catalog titles are stored verbatim with the source file extension
// (e.g. "Od Yavo Shalom Aleinu.pdf") — strip it for display.
const MUSIC_FILE_EXT = /\.(pdf|png|jpe?g|heic|musicxml|mxl|xml|txt)$/i

function cleanTitle(raw: unknown): string {
    return (typeof raw === "string" ? raw : "").replace(MUSIC_FILE_EXT, "").trim()
}

function toSongRecord(id: string, data: Record<string, unknown>): SongRecord {
    const defaults = (data.defaults ?? {}) as {
        key?: unknown
        bpm?: unknown
        lead?: unknown
    }
    // `defaults` is the authoritative sticky memory, but it's sparsely
    // populated in production — most songs have no key/bpm there. When a
    // field is unset, fall back to the most recent setlist appearance that
    // carried it (recent[] is newest-first, capped at 5).
    const recent = Array.isArray(data.recent)
        ? (data.recent as Array<Record<string, unknown>>)
        : []

    const pickString = (preferred: unknown, field: string): string | undefined => {
        if (typeof preferred === "string") return preferred
        for (const r of recent) {
            if (typeof r[field] === "string") return r[field] as string
        }
        return undefined
    }
    const pickNumber = (preferred: unknown, field: string): number | undefined => {
        if (typeof preferred === "number") return preferred
        for (const r of recent) {
            if (typeof r[field] === "number") return r[field] as number
        }
        return undefined
    }

    const rec: SongRecord = { id, title: cleanTitle(data.title) }
    const key = pickString(defaults.key, "key")
    const bpm = pickNumber(defaults.bpm, "bpm")
    const lead = pickString(defaults.lead, "lead")
    if (key !== undefined) rec.key = key
    if (bpm !== undefined) rec.bpm = bpm
    if (lead !== undefined) rec.lead = lead
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
