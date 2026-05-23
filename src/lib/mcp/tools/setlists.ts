import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { getAllSetlists, MAX_SETLIST_FETCH } from "@/lib/server-setlists"
import { getTracksForSetlist } from "@/lib/server-tracks"
import { serializeSetlist } from "@/lib/server-auth"
import { richError, type RichErrorEnvelope } from "@/lib/mcp/error-envelopes"

/**
 * MCP read tools for setlists. Plain async functions wrapping the existing
 * server-side data layer — the MCP route registers them, Phase 5 tests them.
 * The `uid` param is threaded for a consistent contract with the write tools
 * to come; setlist reads are public, so it is currently unused.
 */

/**
 * Cycle-5 C5C-010 — `sort` discriminant on `list_setlists`. Backward-compat
 * default is `recent_write` (orderBy `date desc`), which is what every
 * pre-cycle-5 caller assumed. David's "next service to plan" workflow wants
 * `recent_event` (orderBy `eventDate desc`) so the most-recent service surfaces
 * first regardless of when the doc was written. The two names map 1:1 to
 * Firestore orderBy fields to keep the implementation transparent.
 */
export type ListSetlistsSort = "recent_write" | "recent_event"

export interface ListSetlistsArgs {
    from?: string
    to?: string
    limit?: number
    offset?: number
    sort?: ListSetlistsSort
}

interface SetlistSummary {
    id: string
    name: string
    date: string | null
    eventDate: string | null
    trackCount: number
    songCount?: number
    /** W-04: monotonically increasing per write. Pass back as
     *  lastSeenVersion on subsequent writes for optimistic concurrency
     *  (Plan 02 enforces; Plan 01 stamps only). */
    version?: number
    /**
     * Cycle-5 C5C-011 — ISO timestamp of the first publish, or `null` for
     * never-published setlists. Sourced from the `publishedAt` field that
     * `publish_setlist` first-writes via `FieldValue.serverTimestamp()` and
     * leaves untouched on subsequent re-publishes. Cheap to expose since
     * `serializeSetlist` already carries it on the row.
     */
    publishedAt: string | null
}

// Cycle-2 REG-001b: every error returns the canonical rich envelope.

/** serializeSetlist has already turned Firestore Timestamps into ISO strings. */
function isoOf(v: unknown): string | null {
    return typeof v === "string" ? v : null
}

export async function listSetlists(
    _uid: string,
    args: ListSetlistsArgs,
): Promise<SetlistSummary[] | RichErrorEnvelope> {
    // G-14: previously bad `from`/`to` silently produced NaN and skipped
    // filtering, which made `list_setlists({from: "not-a-date"})` look like a
    // full-list dump — agents had no way to notice they'd typoed an ISO date.
    if (args.from !== undefined && Number.isNaN(Date.parse(args.from))) {
        return richError(
            "invalid_argument",
            `from must be an ISO date string (got "${args.from}").`,
            { field: "from", value: args.from },
        )
    }
    if (args.to !== undefined && Number.isNaN(Date.parse(args.to))) {
        return richError(
            "invalid_argument",
            `to must be an ISO date string (got "${args.to}").`,
            { field: "to", value: args.to },
        )
    }

    const limit =
        args.limit && args.limit > 0
            ? Math.min(args.limit, MAX_SETLIST_FETCH)
            : 20
    const offset = args.offset && args.offset > 0 ? args.offset : 0

    // When a `from`/`to` date window is in play the filter must run BEFORE
    // the page slice, so the fetch has to cover the whole corpus: a target
    // inside the window but outside the first `offset+limit` rows by sort
    // order would otherwise be dropped at the fetch layer (VERIFY-1
    // 2026-05-23 #2 — limit-before-filter; combined with the mixed-type
    // `eventDate` sort this made `list_setlists` return `[]` for upcoming
    // services). Without a window, fetch only enough to cover the requested
    // page. Upstream cap is MAX_SETLIST_FETCH (200).
    // Cowork §7.7 regression: David has 41 setlists; default 20 limit
    // missed 21 of them. Paging closes that gap.
    const hasDateWindow = args.from !== undefined || args.to !== undefined
    const fetchSize = hasDateWindow
        ? MAX_SETLIST_FETCH
        : Math.min(offset + limit, MAX_SETLIST_FETCH)
    const orderBy = args.sort === "recent_event" ? "eventDate" : "date"
    const all = await getAllSetlists({ limit: fetchSize, orderBy })
    const from = args.from ? Date.parse(args.from) : NaN
    const to = args.to ? Date.parse(args.to) : NaN

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
        .slice(offset, offset + limit)
        .map((s) => {
            const row = s as Record<string, unknown>
            const summary: SetlistSummary = {
                id: String(row.id),
                name: typeof row.name === "string" ? row.name : "(untitled)",
                date: isoOf(row.date),
                eventDate: isoOf(row.eventDate),
                trackCount: typeof row.trackCount === "number" ? row.trackCount : 0,
                publishedAt: isoOf(row.publishedAt),
            }
            if (typeof row.songCount === "number") summary.songCount = row.songCount
            if (typeof row.version === "number") summary.version = row.version
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

    // W-04: surface setlist + per-track `version` so the agent can pass
    // back lastSeenVersion on subsequent writes. Plan 01 stamps only;
    // Plan 02 enforces.
    const setlistVersion =
        typeof data.version === "number" ? data.version : undefined
    const setlistLastModifiedAt =
        typeof data.lastModifiedAt === "string" ? data.lastModifiedAt : undefined

    return {
        ...setlist,
        version: setlistVersion,
        lastModifiedAt: setlistLastModifiedAt,
        tracks: tracks.map((t) => {
            const row = t as Record<string, unknown>
            return {
                id: t.id,
                order: t.order,
                title: t.title ?? "",
                type: typeof row.type === "string" ? row.type : "song",
                songId: t.songId ?? null,
                fileId: typeof row.fileId === "string" ? row.fileId : null,
                fileName: typeof row.fileName === "string" ? row.fileName : null,
                key: t.key ?? null,
                bpm: t.bpm ?? null,
                leadMusician: t.leadMusician ?? null,
                referenceLink:
                    typeof row.referenceLink === "string" ? row.referenceLink : null,
                notes: typeof row.notes === "string" ? row.notes : null,
                version: typeof row.version === "number" ? row.version : undefined,
                lastModifiedAt:
                    typeof row.lastModifiedAt === "string"
                        ? row.lastModifiedAt
                        : undefined,
            }
        }),
    }
}
