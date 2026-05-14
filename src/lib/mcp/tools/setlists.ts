import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { getAllSetlists } from "@/lib/server-setlists"
import { getTracksForSetlist } from "@/lib/server-tracks"
import { serializeSetlist } from "@/lib/server-auth"

/**
 * MCP read tools for setlists. Plain async functions wrapping the existing
 * server-side data layer — the MCP route registers them, Phase 5 tests them.
 * The `uid` param is threaded for a consistent contract with the write tools
 * to come; setlist reads are public, so it is currently unused.
 */

export interface ListSetlistsArgs {
    from?: string
    to?: string
    limit?: number
}

interface SetlistSummary {
    id: string
    name: string
    date: string | null
    eventDate: string | null
    trackCount: number
    songCount?: number
}

/** serializeSetlist has already turned Firestore Timestamps into ISO strings. */
function isoOf(v: unknown): string | null {
    return typeof v === "string" ? v : null
}

export async function listSetlists(
    _uid: string,
    args: ListSetlistsArgs,
): Promise<SetlistSummary[]> {
    const all = await getAllSetlists() // serialized, date desc, capped at 50
    const from = args.from ? Date.parse(args.from) : NaN
    const to = args.to ? Date.parse(args.to) : NaN
    const limit = args.limit && args.limit > 0 ? Math.min(args.limit, 50) : 20

    return all
        .filter((s) => {
            const row = s as Record<string, unknown>
            const iso = isoOf(row.eventDate) ?? isoOf(row.date)
            if (!iso) return true // undated setlists always pass the date filter
            const t = Date.parse(iso)
            if (!Number.isNaN(from) && t < from) return false
            if (!Number.isNaN(to) && t > to) return false
            return true
        })
        .slice(0, limit)
        .map((s) => {
            const row = s as Record<string, unknown>
            const summary: SetlistSummary = {
                id: String(row.id),
                name: typeof row.name === "string" ? row.name : "(untitled)",
                date: isoOf(row.date),
                eventDate: isoOf(row.eventDate),
                trackCount: typeof row.trackCount === "number" ? row.trackCount : 0,
            }
            if (typeof row.songCount === "number") summary.songCount = row.songCount
            return summary
        })
}

export interface GetSetlistArgs {
    id: string
}

export async function getSetlist(_uid: string, args: GetSetlistArgs) {
    initAdmin()
    const db = getFirestore()
    const doc = await db.collection("setlists").doc(args.id).get()
    if (!doc.exists) return null

    const data = doc.data() as Record<string, unknown>
    const setlist = serializeSetlist(doc.id, data)
    const tracks = await getTracksForSetlist(db, args.id, data)

    return {
        ...setlist,
        tracks: tracks.map((t) => {
            const row = t as Record<string, unknown>
            return {
                id: t.id,
                order: t.order,
                title: t.title ?? "",
                type: typeof row.type === "string" ? row.type : "song",
                songId: t.songId ?? null,
                key: t.key ?? null,
                bpm: t.bpm ?? null,
                leadMusician: t.leadMusician ?? null,
                notes: typeof row.notes === "string" ? row.notes : null,
            }
        }),
    }
}
