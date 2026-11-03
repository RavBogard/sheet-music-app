/**
 * The Rehearse page's rows, in the author's order. Pure: the server page feeds
 * it the setlist's tracks and each song's featured take.
 *
 * Section headings stay headings. A song row (type song or absent, or any row
 * bound to a song) carries its setlist key, BPM and notes, its one take (or
 * null) and its bonded chart (or null). Readings, prayers and notes with no
 * song are left out.
 */
import { displayChartTitle } from "@/lib/format/chart-title"

export interface RehearseTrackInput {
    id: string
    title?: unknown
    type?: unknown
    songId?: unknown
    key?: unknown
    bpm?: unknown
    notes?: unknown
    fileId?: unknown
}

export interface RehearseTake {
    id: string
    title: string
}

export type RehearseRow =
    | { kind: "section"; id: string; title: string }
    | {
          kind: "song"
          id: string
          title: string
          key: string | null
          bpm: number | null
          notes: string | null
          /** The bonded chart's file id, or null when the row has none. */
          fileId: string | null
          take: RehearseTake | null
      }

export type RehearseSongRow = Extract<RehearseRow, { kind: "song" }>

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null)

export function buildRehearseRows(
    tracks: RehearseTrackInput[],
    featured: Record<string, RehearseTake>,
): RehearseRow[] {
    const rows: RehearseRow[] = []
    for (const t of tracks) {
        // The editor strips a stray file extension for display; so does this page.
        const title = displayChartTitle(t.title)
        const songId = typeof t.songId === "string" && t.songId ? t.songId : null
        if (t.type === "header" || t.type === "section") {
            if (title) rows.push({ kind: "section", id: t.id, title })
            continue
        }
        const isSong = t.type === undefined || t.type === null || t.type === "song"
        if (!isSong && !songId) continue
        if (!title) continue
        const take = songId ? featured[songId] ?? null : null
        rows.push({
            kind: "song",
            id: t.id,
            title,
            key: text(t.key),
            bpm: typeof t.bpm === "number" && Number.isFinite(t.bpm) && t.bpm > 0 ? t.bpm : null,
            notes: text(t.notes),
            fileId: text(t.fileId),
            take: take ? { id: take.id, title: take.title } : null,
        })
    }
    return rows
}

/** The song before and after `trackId`, stepping over section headings. */
export function songNeighbors(
    rows: RehearseRow[],
    trackId: string,
): { song: RehearseSongRow | null; prev: RehearseSongRow | null; next: RehearseSongRow | null } {
    const songs = rows.filter((r): r is RehearseSongRow => r.kind === "song")
    const i = songs.findIndex((s) => s.id === trackId)
    if (i < 0) return { song: null, prev: null, next: null }
    return { song: songs[i], prev: songs[i - 1] ?? null, next: songs[i + 1] ?? null }
}
