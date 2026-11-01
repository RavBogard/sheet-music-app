/**
 * The Listen page's rows, in the author's order. Pure: the server page feeds
 * it the setlist's tracks and each song's featured take.
 *
 * Section headings stay headings. A song row (type song or absent, or any row
 * bound to a song) gets its one take, or null. Readings, prayers and notes
 * with no song have nothing to hear and are left out.
 */
export interface ListenTrackInput {
    id: string
    title?: unknown
    type?: unknown
    songId?: unknown
}

export interface ListenTake {
    id: string
    title: string
}

export type ListenRow =
    | { kind: "section"; id: string; title: string }
    | { kind: "song"; id: string; title: string; take: ListenTake | null }

export function buildListenRows(
    tracks: ListenTrackInput[],
    featured: Record<string, ListenTake>,
): ListenRow[] {
    const rows: ListenRow[] = []
    for (const t of tracks) {
        const title = typeof t.title === "string" ? t.title.trim() : ""
        const songId = typeof t.songId === "string" && t.songId ? t.songId : null
        if (t.type === "header" || t.type === "section") {
            if (title) rows.push({ kind: "section", id: t.id, title })
            continue
        }
        const isSong = t.type === undefined || t.type === null || t.type === "song"
        if (!isSong && !songId) continue
        if (!title) continue
        const take = songId ? featured[songId] ?? null : null
        rows.push({ kind: "song", id: t.id, title, take: take ? { id: take.id, title: take.title } : null })
    }
    return rows
}
