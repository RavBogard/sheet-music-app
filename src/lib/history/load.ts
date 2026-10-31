import "server-only"

import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { getAllSetlists, MAX_SETLIST_FETCH } from "@/lib/server-setlists"
import { getTracksForSetlist } from "@/lib/server-tracks"
import { rowOrg } from "@/lib/mcp/org-context"
import { isTestSetlist } from "@/types/models"
import { visibleTo } from "@/lib/library/visibility"
import type { OrgId } from "@/lib/org/types"
import { dayInZone, orgTimeZone } from "@/lib/org/locale"
import { momentIdForUnit } from "@/lib/books/moments"
import { classifyService } from "./classify"
import type { HistorySetlist, HistoryTrack, LibraryLite } from "./song-history"

/**
 * Setlist memory, release 1 — the one Firestore loader behind
 * `get_song_history` and `export_setlists`. Setlists are tenant-scoped twice:
 * the query filters on `orgId` and each row is re-checked with `rowOrg`.
 * Library rows resolve when visible to the caller's org (owned, or shared to
 * it via `visibleToOrgs`). A Firestore failure throws, so the tools report
 * an error rather than an empty history.
 */

const TRACK_READ_CONCURRENCY = 8
/** Firestore `getAll` accepts many refs; keep each call modest. */
const LIBRARY_GETALL_CHUNK = 100

function str(v: unknown): string | null {
    return typeof v === "string" && v.trim() ? v : null
}

/** ISO date of `eventDate` (serializeSetlist already turned Timestamps into ISO strings). */
function eventIso(v: unknown): string | null {
    if (typeof v !== "string") return null
    const t = Date.parse(v)
    return Number.isNaN(t) ? null : new Date(t).toISOString()
}

function toTrack(raw: Record<string, unknown>): HistoryTrack {
    return {
        id: String(raw.id),
        order: typeof raw.order === "number" ? raw.order : 0,
        type: str(raw.type) ?? "song",
        title: typeof raw.title === "string" ? raw.title : "",
        fileId: str(raw.fileId),
        fileName: str(raw.fileName),
        key: str(raw.key),
        leadMusician: str(raw.leadMusician),
        notes: str(raw.notes),
        momentId: str(raw.momentId) ?? momentIdForUnit(unitIdOf(raw.liturgyRef)),
        liturgyRef: liturgyRefOf(raw.liturgyRef),
    }
}

function liturgyRefOf(ref: unknown): HistoryTrack["liturgyRef"] {
    if (!ref || typeof ref !== "object") return null
    const r = ref as Record<string, unknown>
    const book = str(r.book)
    if (!book || typeof r.folio !== "number") return null
    const out: NonNullable<HistoryTrack["liturgyRef"]> = { book, folio: r.folio }
    const unitId = str(r.unitId)
    if (unitId) out.unitId = unitId
    if (r.stale === true) out.stale = true
    return out
}

function unitIdOf(ref: unknown): string | null {
    if (!ref || typeof ref !== "object") return null
    return str((ref as Record<string, unknown>).unitId)
}

async function mapLimited<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
    const out: R[] = new Array(items.length)
    let next = 0
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length) {
            const i = next++
            out[i] = await fn(items[i])
        }
    })
    await Promise.all(workers)
    return out
}

/**
 * `from` / `to` are inclusive `YYYY-MM-DD` (or ISO) bounds on the event day.
 * With `timeZone`, the event day is the calendar day the instant falls on in
 * that zone (a Friday-evening service stays on Friday); without it, the UTC day.
 */
export function inDateWindow(
    eventDate: string | null,
    from?: string,
    to?: string,
    timeZone?: string,
): boolean {
    if (!from && !to) return true
    if (!eventDate) return false
    const ms = Date.parse(eventDate)
    const day = timeZone && !Number.isNaN(ms) ? dayInZone(ms, timeZone) : eventDate.slice(0, 10)
    if (from && day < from.slice(0, 10)) return false
    if (to && day > to.slice(0, 10)) return false
    return true
}

export async function loadHistorySetlists(
    org: OrgId,
    opts: { from?: string; to?: string; includeUndated?: boolean } = {},
): Promise<{ setlists: HistorySetlist[]; truncated: boolean }> {
    initAdmin()
    const db = getFirestore()
    const rows = (await getAllSetlists({
        org,
        limit: MAX_SETLIST_FETCH,
        orderBy: "eventDate",
        throwOnError: true,
    })) as Array<Record<string, unknown>>
    const truncated = rows.length >= MAX_SETLIST_FETCH

    const zone = orgTimeZone(org)
    const wanted = rows.filter((r) => {
        if (rowOrg(r.orgId) !== org) return false
        const ev = eventIso(r.eventDate)
        if (!ev) return opts.includeUndated === true && !opts.from && !opts.to
        return inDateWindow(ev, opts.from, opts.to, zone)
    })

    const setlists = await mapLimited(wanted, TRACK_READ_CONCURRENCY, async (r) => {
        const id = String(r.id)
        const tracks = (await getTracksForSetlist(db, id, {})) as unknown as Array<Record<string, unknown>>
        const name = typeof r.name === "string" ? r.name : "(untitled)"
        const cls = classifyService({
            name,
            templateType: str(r.templateType),
            rabbi: str(r.rabbi),
            serviceType: str(r.serviceType),
            rabbiSlot: str(r.rabbiSlot),
            special: typeof r.special === "boolean" ? r.special : null,
        })
        const hs: HistorySetlist = {
            id,
            name,
            eventDate: eventIso(r.eventDate),
            templateType: str(r.templateType),
            rabbi: str(r.rabbi),
            serviceType: cls.serviceType,
            rabbiSlot: cls.rabbiSlot,
            special: cls.special,
            book: str(r.book),
            ownerName: str(r.ownerName),
            updatedAt: eventIso(r.updatedAt) ?? eventIso(r.createdAt),
            isTest:
                r.isTest === true ||
                isTestSetlist({ name, ownerId: str(r.ownerId) }),
            tracks: tracks
                // A track stamped with another tenant is never shown; legacy
                // unstamped tracks belong to their (already scoped) setlist.
                .filter((t) => typeof t.orgId !== "string" || !t.orgId || t.orgId === org)
                .map(toTrack)
                .sort((a, b) => a.order - b.order),
        }
        return hs
    })

    return { setlists, truncated }
}

export async function loadLibraryLite(
    org: OrgId,
    fileIds: string[],
): Promise<Map<string, LibraryLite>> {
    const out = new Map<string, LibraryLite>()
    const unique = [...new Set(fileIds.filter((f) => typeof f === "string" && f))]
    if (unique.length === 0) return out
    initAdmin()
    const db = getFirestore()
    const col = db.collection("library_index")
    for (let i = 0; i < unique.length; i += LIBRARY_GETALL_CHUNK) {
        const refs = unique.slice(i, i + LIBRARY_GETALL_CHUNK).map((id) => col.doc(id))
        const snaps = await db.getAll(...refs)
        for (const s of snaps) {
            if (!s.exists) continue
            const d = (s.data() ?? {}) as Record<string, unknown>
            // Owned by the caller's org, or shared to it: a shared chart a
            // setlist is bound to must still resolve to its name and key.
            if (!visibleTo(d, org)) continue
            out.set(s.id, {
                fileId: s.id,
                name: str(d.name) ?? str(d.title) ?? s.id,
                key: str(d.key),
                setting: str(d.setting),
                partGroup: str(d.partGroup),
                status: str(d.status),
                canonicalFileId: str(d.canonicalFileId),
                mimeType: str(d.mimeType),
            })
        }
    }
    return out
}
