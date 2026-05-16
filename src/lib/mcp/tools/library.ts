import { getAllSongs, getSongById, type SongRecord } from "@/lib/mcp/server-songs"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"

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

/* ─────────────────────────────────────────────────────────────────────────
 * list_library — browse the chart-file index (CF2-D)
 *
 * search_library covers targeted lookup ("find me Oseh Shalom"); browsing the
 * full catalog ("show me every core chart") was awkward without this. Reads
 * directly from `library_index`, which is the authoritative file-side store
 * (mimeType, collection, fileSize, uploadedAt) — `songs/{id}` only carries
 * the catalog-side metadata and doesn't know about the file shape.
 *
 * Default sort: alphabetical by name. A future `sort: 'newest'` extension is
 * straightforward, but Daniel's browse use case is "look at my catalog" —
 * alphabetical is the natural reading order.
 *
 * No role gate — same posture as `search_library`. Chart metadata is not
 * sensitive per [[feedback_chart_access_policy]].
 * ───────────────────────────────────────────────────────────────────────── */

export const LIST_LIBRARY_MAX_LIMIT = 200
export const LIST_LIBRARY_DEFAULT_LIMIT = 50

export interface ListLibraryArgs {
    collection?: "core" | "supplemental" | "uploads"
    limit?: number
    offset?: number
}

export interface LibraryIndexEntry {
    fileId: string
    name: string
    collection: string | null
    mimeType: string | null
    fileSize: number | null
    uploadedAt: string | null
    uploadedBy: string | null
    key: string | null
    bpm: number | null
    tags: string[]
    status: string
}

export interface ListLibraryResult {
    rows: LibraryIndexEntry[]
    total: number
    offset: number
    limit: number
}

function toLibraryEntry(
    id: string,
    data: Record<string, unknown>,
): LibraryIndexEntry {
    const name =
        (typeof data.name === "string" && data.name) ||
        (typeof data.title === "string" && data.title) ||
        id
    const uploadedAt =
        typeof data.uploadedAt === "string"
            ? data.uploadedAt
            : typeof data.modifiedTime === "string"
              ? data.modifiedTime
              : null
    return {
        fileId: id,
        name,
        collection: typeof data.collection === "string" ? data.collection : null,
        mimeType: typeof data.mimeType === "string" ? data.mimeType : null,
        fileSize: typeof data.fileSize === "number" ? data.fileSize : null,
        uploadedAt,
        uploadedBy: typeof data.uploadedBy === "string" ? data.uploadedBy : null,
        key: typeof data.key === "string" ? data.key : null,
        bpm: typeof data.bpm === "number" ? data.bpm : null,
        tags: Array.isArray(data.tags)
            ? data.tags.filter((t): t is string => typeof t === "string")
            : [],
        status: typeof data.status === "string" ? data.status : "active",
    }
}

export async function listLibrary(
    _uid: string,
    args: ListLibraryArgs,
): Promise<ListLibraryResult | { error: string }> {
    const limit =
        args.limit && args.limit > 0
            ? Math.min(args.limit, LIST_LIBRARY_MAX_LIMIT)
            : LIST_LIBRARY_DEFAULT_LIMIT
    const offset = args.offset && args.offset > 0 ? args.offset : 0

    try {
        initAdmin()
        const db = getFirestore()
        const snap = await db.collection("library_index").get()
        const all = snap.docs.map((d) => toLibraryEntry(d.id, d.data()))

        // "core" matches the UI semantics in SongChartsLibrary: the CRC
        // Charts tab is the negative-set complement of supplemental + uploads,
        // so any row with collection: null / unset / "core" surfaces there.
        // Historical library_index rows (the 101 CRC charts) carry
        // collection: null rather than "core", so strict-equality would hide
        // them from MCP under {collection: "core"} (CF2-D-1).
        const filtered = args.collection
            ? args.collection === "core"
                ? all.filter(
                      (e) =>
                          e.collection !== "supplemental" &&
                          e.collection !== "uploads",
                  )
                : all.filter((e) => e.collection === args.collection)
            : all

        filtered.sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
        )

        return {
            rows: filtered.slice(offset, offset + limit),
            total: filtered.length,
            offset,
            limit,
        }
    } catch (err) {
        logger.warn("[mcp] list_library failed:", err)
        return { error: "Failed to read library index" }
    }
}
