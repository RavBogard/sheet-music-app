import { getAllSongs, getSongById, type SongRecord } from "@/lib/mcp/server-songs"

/**
 * MCP read tools for the song library. Plain async functions wrapping the
 * Admin-SDK songs reader. `uid` is threaded for a consistent contract with the
 * write tools to come; library reads are not user-scoped today.
 */

export interface SearchLibraryArgs {
    query: string
    key?: string
    bpmMin?: number
    bpmMax?: number
    limit?: number
}

export async function searchLibrary(
    _uid: string,
    args: SearchLibraryArgs,
): Promise<SongRecord[]> {
    const all = await getAllSongs()
    const q = args.query.trim().toLowerCase()
    const key = args.key?.trim().toLowerCase()
    const limit = args.limit && args.limit > 0 ? Math.min(args.limit, 50) : 20

    return all
        .filter((s) => {
            if (s.status === "archived") return false
            if (q && !s.title.toLowerCase().includes(q)) return false
            if (key && s.key?.toLowerCase() !== key) return false
            if (args.bpmMin !== undefined && (s.bpm === undefined || s.bpm < args.bpmMin)) {
                return false
            }
            if (args.bpmMax !== undefined && (s.bpm === undefined || s.bpm > args.bpmMax)) {
                return false
            }
            return true
        })
        .slice(0, limit)
}

export interface GetSongArgs {
    id: string
}

export async function getSong(
    _uid: string,
    args: GetSongArgs,
): Promise<SongRecord | null> {
    return getSongById(args.id)
}
