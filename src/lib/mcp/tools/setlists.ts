import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { getAllSetlists, MAX_SETLIST_FETCH } from "@/lib/server-setlists"
import { getTracksForSetlist } from "@/lib/server-tracks"
import { serializeSetlist } from "@/lib/server-auth"
import { richError, type RichErrorEnvelope } from "@/lib/mcp/error-envelopes"
import { rowOrg } from "@/lib/mcp/org-context"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"
import { logger } from "@/lib/logger"

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
    // v11-02-02: org defaults to crc so existing CRC-data tests + internal
    // callers stay correct; the MCP route always passes the explicit caller org.
    org: OrgId = DEFAULT_ORG_ID,
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
        // v11-02-02: tenant isolation — only the caller's org's setlists.
        // Filtered BEFORE the date window + page slice so paging counts only
        // in-tenant rows.
        .filter((s) => rowOrg((s as Record<string, unknown>).orgId) === org)
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

export async function getSetlist(
    _uid: string,
    args: GetSetlistArgs,
    org: OrgId = DEFAULT_ORG_ID,
) {
    initAdmin()
    const db = getFirestore()
    const doc = await db.collection("setlists").doc(args.id).get()
    if (!doc.exists) return null

    const data = doc.data() as Record<string, unknown>
    // v11-02-02: cross-tenant hard wall — a caller may not read another org's
    // setlist by id. Return null (→ setlist_not_found) rather than 403 so we
    // never leak the doc's existence across tenants.
    if (rowOrg(data.orgId) !== org) return null

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

// ────────────────────────────────────────────────────────────────────────────
// find_setlists_referencing_chart (v11.7-03 — reverse-index read partner)
// ────────────────────────────────────────────────────────────────────────────

export interface FindSetlistsReferencingChartArgs {
    fileId?: string
    songId?: string
}

export interface SetlistReference {
    setlistId: string
    name: string
    date: string | null
    eventDate: string | null
    trackId: string
    trackTitle: string | null
    order: number | null
}

export interface FindSetlistsReferencingChartResult {
    ok: true
    fileId: string | null
    songId: string | null
    setlists: SetlistReference[]
    count: number
    danglingTracksIgnored: number
    truncated?: boolean
}

/**
 * v11.7-03: the read partner to delete_chart's chart_in_use refusal. Surfaces
 * which LIVE setlists bond a given chart (by fileId or songId) — the same walk
 * delete_chart does internally (library-upload.ts:787–846), but returning ALL
 * live matches instead of capping at existence. Dangling tracks (parent setlist
 * deleted/absent) are excluded. Tenant-scoped via rowOrg (cross-tenant wall);
 * ungated authenticated read, consistent with list_setlists/get_setlist
 * (setlist data is public-by-design).
 */
const REVERSE_LOOKUP_CAP = 200

export async function findSetlistsReferencingChart(
    _uid: string,
    args: FindSetlistsReferencingChartArgs,
    org: OrgId = DEFAULT_ORG_ID,
): Promise<FindSetlistsReferencingChartResult | RichErrorEnvelope> {
    const fileId = args.fileId?.trim() || undefined
    const songId = args.songId?.trim() || undefined
    if (!fileId && !songId) {
        return richError(
            "invalid_argument",
            "Pass `fileId` or `songId` to find the setlists that reference a chart.",
            { fields: ["fileId", "songId"] },
            "Discover a fileId via list_library/search_library; a songId is the track's bonded song.",
        )
    }

    initAdmin()
    const db = getFirestore()

    try {
        // Query the tracks collection on the primary key (single-field auto-index;
        // no composite index needed). delete_chart uses the same where('fileId').
        const field = fileId ? "fileId" : "songId"
        const value = fileId ?? (songId as string)
        const tracksSnap = await db
            .collection("tracks")
            .where(field, "==", value)
            .limit(REVERSE_LOOKUP_CAP)
            .get()

        if (tracksSnap.empty) {
            return {
                ok: true,
                fileId: fileId ?? null,
                songId: songId ?? null,
                setlists: [],
                count: 0,
                danglingTracksIgnored: 0,
            }
        }

        const truncated = tracksSnap.size === REVERSE_LOOKUP_CAP
        if (truncated) {
            logger.warn(
                `[find_setlists_referencing_chart] hit ${REVERSE_LOOKUP_CAP}-track cap for ${field}=${value}; result truncated.`,
            )
        }

        // When both keys are passed, additionally require the secondary match.
        const matched = tracksSnap.docs
            .map((d) => {
                const data = d.data() as Record<string, unknown>
                return {
                    trackId: d.id,
                    setlistId:
                        typeof data.setlistId === "string"
                            ? data.setlistId
                            : null,
                    title: typeof data.title === "string" ? data.title : null,
                    order: typeof data.order === "number" ? data.order : null,
                    fileId:
                        typeof data.fileId === "string" ? data.fileId : null,
                    songId:
                        typeof data.songId === "string" ? data.songId : null,
                }
            })
            .filter((t) => {
                if (fileId && songId) return t.songId === songId
                return true
            })

        const distinctSetlistIds = [
            ...new Set(
                matched
                    .map((t) => t.setlistId)
                    .filter((s): s is string => !!s),
            ),
        ]

        // getAll the parent setlists; keep only LIVE (exists) AND in-tenant.
        const inTenantLiveSetlists = new Map<
            string,
            ReturnType<typeof serializeSetlist>
        >()
        if (distinctSetlistIds.length > 0) {
            const parentSnaps = await db.getAll(
                ...distinctSetlistIds.map((id) =>
                    db.collection("setlists").doc(id),
                ),
            )
            for (const snap of parentSnaps) {
                if (!snap.exists) continue
                const data = snap.data() as Record<string, unknown>
                if (rowOrg(data.orgId) !== org) continue
                inTenantLiveSetlists.set(
                    snap.id,
                    serializeSetlist(snap.id, data),
                )
            }
        }

        const liveTracks = matched.filter(
            (t) => t.setlistId !== null && inTenantLiveSetlists.has(t.setlistId),
        )
        const danglingTracksIgnored = matched.length - liveTracks.length

        const setlists: SetlistReference[] = liveTracks.map((t) => {
            const parent = inTenantLiveSetlists.get(t.setlistId as string) as
                | Record<string, unknown>
                | undefined
            return {
                setlistId: t.setlistId as string,
                name:
                    parent && typeof parent.name === "string"
                        ? parent.name
                        : "(untitled)",
                date: parent ? isoOf(parent.date) : null,
                eventDate: parent ? isoOf(parent.eventDate) : null,
                trackId: t.trackId,
                trackTitle: t.title,
                order: t.order,
            }
        })

        setlists.sort((a, b) => {
            const at = Date.parse(a.eventDate ?? a.date ?? "")
            const bt = Date.parse(b.eventDate ?? b.date ?? "")
            if (Number.isNaN(at) && Number.isNaN(bt)) return 0
            if (Number.isNaN(at)) return 1
            if (Number.isNaN(bt)) return -1
            return bt - at
        })

        return {
            ok: true,
            fileId: fileId ?? null,
            songId: songId ?? null,
            setlists,
            count: setlists.length,
            danglingTracksIgnored,
            ...(truncated ? { truncated: true } : {}),
        }
    } catch (err) {
        return richError(
            "find_setlists_referencing_chart_failed",
            `Failed to find referencing setlists: ${
                err instanceof Error ? err.message : String(err)
            }`,
            { fileId: fileId ?? null, songId: songId ?? null },
            "Check Firestore connectivity; the tracks collection is the source.",
        )
    }
}

// ────────────────────────────────────────────────────────────────────────────
// search_setlists (v11.7-03 — app-side content search)
// ────────────────────────────────────────────────────────────────────────────

export interface SearchSetlistsArgs {
    trackTitle?: string
    leadMusician?: string
    templateType?: string
}

export interface SetlistContentMatch {
    id: string
    name: string
    date: string | null
    eventDate: string | null
    templateType: string | null
    matchedTracks: {
        trackId: string
        title: string | null
        leadMusician: string | null
    }[]
}

export interface SearchSetlistsResult {
    ok: true
    setlists: SetlistContentMatch[]
    count: number
}

/**
 * v11.7-03: find the caller-org's setlists by track content (trackTitle /
 * leadMusician) or service type (templateType). App-side filtering at the
 * current catalog scale (≤~50 setlists) per the v11.7-01 audit — no track-content
 * index. templateType filters at the setlist level (no track read). Tenant-scoped
 * via getAllSetlists({org}); ungated authenticated read like its siblings.
 */
export async function searchSetlists(
    _uid: string,
    args: SearchSetlistsArgs,
    org: OrgId = DEFAULT_ORG_ID,
): Promise<SearchSetlistsResult | RichErrorEnvelope> {
    const trackTitle = args.trackTitle?.trim().toLowerCase() || undefined
    const leadMusician = args.leadMusician?.trim().toLowerCase() || undefined
    const templateType = args.templateType?.trim() || undefined
    if (!trackTitle && !leadMusician && !templateType) {
        return richError(
            "invalid_argument",
            "Pass at least one of `trackTitle`, `leadMusician`, or `templateType`.",
            { fields: ["trackTitle", "leadMusician", "templateType"] },
            "trackTitle/leadMusician match track content; templateType matches the service type.",
        )
    }

    initAdmin()
    const db = getFirestore()

    try {
        // Tenant-scoped at the query (existing (orgId,date) composite index).
        const all = await getAllSetlists({ org, limit: MAX_SETLIST_FETCH })

        // templateType narrows at the setlist level first (cheap, no track read).
        const candidates = all.filter((s) => {
            if (!templateType) return true
            const tt = (s as Record<string, unknown>).templateType
            return typeof tt === "string" && tt === templateType
        })

        const needsTrackScan = !!trackTitle || !!leadMusician

        const out: SetlistContentMatch[] = []
        for (const s of candidates) {
            const row = s as Record<string, unknown>
            const id = String(row.id)
            const base: SetlistContentMatch = {
                id,
                name: typeof row.name === "string" ? row.name : "(untitled)",
                date: isoOf(row.date),
                eventDate: isoOf(row.eventDate),
                templateType:
                    typeof row.templateType === "string"
                        ? row.templateType
                        : null,
                matchedTracks: [],
            }

            if (!needsTrackScan) {
                out.push(base)
                continue
            }

            const tracks = await getTracksForSetlist(db, id, {})
            const matchedTracks = tracks
                .filter((t) => {
                    const tr = t as unknown as Record<string, unknown>
                    const title =
                        typeof tr.title === "string"
                            ? tr.title.toLowerCase()
                            : ""
                    const lead =
                        typeof tr.leadMusician === "string"
                            ? tr.leadMusician.toLowerCase()
                            : ""
                    if (trackTitle && !title.includes(trackTitle)) return false
                    if (leadMusician && !lead.includes(leadMusician))
                        return false
                    return true
                })
                .map((t) => {
                    const tr = t as unknown as Record<string, unknown>
                    return {
                        trackId: t.id,
                        title: typeof tr.title === "string" ? tr.title : null,
                        leadMusician:
                            typeof tr.leadMusician === "string"
                                ? tr.leadMusician
                                : null,
                    }
                })

            if (matchedTracks.length > 0) {
                out.push({ ...base, matchedTracks })
            }
        }

        out.sort((a, b) => {
            const at = Date.parse(a.eventDate ?? a.date ?? "")
            const bt = Date.parse(b.eventDate ?? b.date ?? "")
            if (Number.isNaN(at) && Number.isNaN(bt)) return 0
            if (Number.isNaN(at)) return 1
            if (Number.isNaN(bt)) return -1
            return bt - at
        })

        return { ok: true, setlists: out, count: out.length }
    } catch (err) {
        return richError(
            "search_setlists_failed",
            `Failed to search setlists: ${
                err instanceof Error ? err.message : String(err)
            }`,
            {},
            "Check Firestore connectivity; setlists + tracks are the source.",
        )
    }
}
