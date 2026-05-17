import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"
import type { EnrichmentStatus } from "@/lib/library/enrichment-projection"
import type { EnrichmentOutput } from "@/lib/library/ai-enrichment"

/**
 * Admin-SDK read helpers for the `songs/{id}` catalog — the MCP read tools'
 * view of the song library. The client-side `songs` helpers (src/lib/songs/*)
 * use the Firebase *client* SDK and can't run in a server route, so MCP reads
 * the catalog directly here. Read-only; no writes.
 */

export interface SongRecord {
    id: string
    title: string
    /** Raw catalog title — the chart filename incl. extension (e.g.
     *  "Oseh Shalom.pdf"). Cached onto setlist tracks as `fileName`. */
    fileName?: string
    key?: string
    bpm?: number
    lead?: string
    status?: string
    // ─── W-02 trust-calibration fields (joined from library_index) ────────
    /** Bare stem (no clarifier) — see bareStem() in title-specificity.ts. */
    stem?: string
    /** 0..1 confidence score — see src/lib/mcp/title-specificity.ts. */
    titleSpecificity?: number
    /** Count of non-orphaned library_index entries sharing this stem. */
    siblingsInCatalog?: number
    /** Free-text — populated via W-03 enrichment campaign. */
    composer?: string
    /** Free-text — populated via W-03 enrichment campaign. */
    arranger?: string
    /** Free-text — populated via W-03 enrichment campaign. */
    notationSource?: string
    /** Most-recent setlist this song was bonded to (denormalized). */
    lastUsedInSetlist?: { setlistId: string; eventDate: string }
    /** Learning-loop counters per [[feedback_learning_self_healing]]. */
    bondCorrectionHistory?: {
        correctedTo: number
        correctedAwayFrom: number
        lastCorrectionAt?: string
    }
    /** From chart-verify pipeline; not stored, set by callers that probe. */
    fileHealthy?: boolean
    // ─── AI-001 enrichment projection (joined from library_index +
    //     aiEnrichmentRetryQueue by callers in src/lib/mcp/tools/library.ts).
    //     `null` ⇒ row never reached the AI subscriber (pre-NEW-3 upload, or
    //     no matching library_index doc). Loaders are in
    //     src/lib/library/enrichment-projection.ts.
    /** library_index/{id}.enrichmentStatus, narrowed to known values. */
    enrichmentStatus?: EnrichmentStatus | null
    /** Denormalized from aiSuggestion.confidence (0..1). */
    enrichmentConfidence?: number | null
    /** Full EnrichmentOutput blob — ~200 tokens, inline per a5's hydration norm. */
    aiSuggestion?: EnrichmentOutput | null
    /** `aiEnrichmentRetryQueue/{id}` doc exists (replay in flight). */
    retryQueued?: boolean
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
    if (typeof data.title === "string" && data.title.trim()) {
        rec.fileName = data.title
    }
    const key = pickString(defaults.key, "key")
    const bpm = pickNumber(defaults.bpm, "bpm")
    const lead = pickString(defaults.lead, "lead")
    if (key !== undefined) rec.key = key
    if (bpm !== undefined) rec.bpm = bpm
    if (lead !== undefined) rec.lead = lead
    // G-15: default `status` to "active" when missing so every row in
    // search_library / get_song has a consistent shape. Curated rows that
    // don't carry an explicit status are active by convention.
    rec.status = typeof data.status === "string" ? data.status : "active"
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

/**
 * Caller-supplied overrides for a new song-bonded track row. Any field left
 * undefined falls back to the song catalog default in
 * `resolveTrackBondDefaults`. `add_track_to_setlist` and the
 * `commit_staged_changes` add-proposal handler share this shape so a bonded
 * row always carries `fileName` from the catalog (pre-fix, the propose/commit
 * path left `fileName: undefined`, forcing Perform mode's chart-binder picker
 * to re-resolve every load — MCP-008 parity gap).
 */
export interface TrackBondOverrides {
    songId?: string
    title?: string
    key?: string
    leadMusician?: string
}

export interface ResolvedTrackBond {
    /** Final title — caller override wins; otherwise catalog title. */
    title: string | undefined
    /** Final key — caller override wins; otherwise catalog default key. */
    key: string | undefined
    /** Final vocal lead — caller override wins; otherwise catalog default lead. */
    leadMusician: string | undefined
    /** Cached chart filename from the catalog (never overridable). */
    fileName: string | undefined
    /** True when a non-empty songId was supplied but didn't resolve to a song doc. */
    songMissing: boolean
}

/**
 * Resolve a song-bond into final track-row field values. Caller overrides
 * win when supplied; otherwise defaults come from the songs/{id} catalog.
 * `fileName` is always taken from the catalog (never user-overridable).
 *
 * Both `add_track_to_setlist` and the `commit_staged_changes` add-proposal
 * handler call this; they differ only in how they react to `songMissing`
 * (the single-row write tool rejects with an error; the multi-proposal
 * commit lets it slide because the propose-stage already surfaced a
 * `no_library_record` flag).
 */
export async function resolveTrackBondDefaults(
    overrides: TrackBondOverrides,
): Promise<ResolvedTrackBond> {
    let title = overrides.title
    let key = overrides.key
    let leadMusician = overrides.leadMusician
    let fileName: string | undefined
    let songMissing = false
    if (overrides.songId && overrides.songId.trim()) {
        const song = await getSongById(overrides.songId)
        if (!song) {
            songMissing = true
        } else {
            title = title ?? song.title
            key = key ?? song.key
            leadMusician = leadMusician ?? song.lead
            fileName = song.fileName
        }
    }
    return { title, key, leadMusician, fileName, songMissing }
}
