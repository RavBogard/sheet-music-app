import "server-only"

import { richError, type RichErrorEnvelope } from "@/lib/mcp/error-envelopes"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"
import { logger } from "@/lib/logger"
import type { RabbiSlotKey } from "@/lib/history/classify"
import {
    buildSongHistory,
    classifyHistorySetlist,
    type HistorySetlist,
    type SongHistoryQuery,
    type SongHistoryResult,
} from "@/lib/history/song-history"
import { loadHistorySetlists, loadLibraryLite } from "@/lib/history/load"

/**
 * Setlist memory, release 1 — read tools over the setlist archive.
 *
 * `get_song_history`: how a song has been done before (charts, keys, leads),
 * for use while building a setlist. `export_setlists`: every setlist with its
 * tracks in one call, for review and analysis. Both report what was done;
 * neither ranks nor recommends a setting. Tenant-scoped to the caller's org.
 */

export async function getSongHistoryTool(
    _uid: string,
    args: SongHistoryQuery,
    org: OrgId = DEFAULT_ORG_ID,
): Promise<({ ok: true; truncated: boolean } & SongHistoryResult) | RichErrorEnvelope> {
    const title = args?.title?.trim()
    const fileId = args?.fileId?.trim()
    if (!title && !fileId) {
        return richError(
            "invalid_argument",
            "Pass `title` or `fileId`.",
            { fields: ["title", "fileId"] },
            "title matches spelling variants of the song; fileId matches one chart and its instrument parts.",
        )
    }
    try {
        const { setlists, truncated } = await loadHistorySetlists(org)
        const fileIds = setlists.flatMap((s) =>
            s.tracks.map((t) => t.fileId).filter((f): f is string => !!f),
        )
        if (fileId) fileIds.push(fileId)
        const library = await loadLibraryLite(org, fileIds)
        const result = buildSongHistory(setlists, library, { ...args, title, fileId })
        return { ok: true, truncated, ...result }
    } catch (error) {
        logger.warn("get_song_history failed:", error)
        return richError(
            "internal_error",
            "Could not read setlist history.",
            { errorCode: 500 },
            "Retry; if it keeps failing, list_setlists still works.",
        )
    }
}

export interface ExportSetlistsArgs {
    from?: string
    to?: string
    /** default false */
    includeParts?: boolean
    /** default false */
    includeUndated?: boolean
}

export interface ExportedSetlist {
    id: string
    name: string
    eventDate: string | null
    serviceType: string | null
    rabbiSlot: RabbiSlotKey | null
    special: boolean
    part: string | null
    book: string | null
    ownerName: string | null
    tracks: {
        order: number
        type: string
        title: string
        fileId: string | null
        chartName: string | null
        key: string | null
        leadMusician: string | null
        notes: string | null
    }[]
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}/

export async function exportSetlistsTool(
    _uid: string,
    args: ExportSetlistsArgs,
    org: OrgId = DEFAULT_ORG_ID,
): Promise<{ ok: true; count: number; truncated: boolean; setlists: ExportedSetlist[] } | RichErrorEnvelope> {
    const from = args?.from?.trim() || undefined
    const to = args?.to?.trim() || undefined
    for (const [field, v] of [["from", from], ["to", to]] as const) {
        if (v && !DATE_RE.test(v)) {
            return richError(
                "invalid_argument",
                `\`${field}\` must be a date like 2026-09-01.`,
                { fields: [field] },
                "Dates are inclusive YYYY-MM-DD bounds on the service day.",
            )
        }
    }
    try {
        const { setlists, truncated } = await loadHistorySetlists(org, {
            from,
            to,
            includeUndated: args?.includeUndated === true,
        })
        const library = await loadLibraryLite(
            org,
            setlists.flatMap((s) =>
                s.tracks.map((t) => t.fileId).filter((f): f is string => !!f),
            ),
        )
        const out: ExportedSetlist[] = []
        for (const s of setlists as HistorySetlist[]) {
            if (s.isTest) continue
            if (!s.eventDate && args?.includeUndated !== true) continue
            const cls = classifyHistorySetlist(s)
            if (cls.part && args?.includeParts !== true) continue
            out.push({
                id: s.id,
                name: s.name,
                eventDate: s.eventDate,
                serviceType: cls.serviceType,
                rabbiSlot: cls.rabbiSlot,
                special: cls.special,
                part: cls.part,
                book: s.book,
                ownerName: s.ownerName,
                tracks: s.tracks.map((t) => {
                    const row = t.fileId ? library.get(t.fileId) : undefined
                    return {
                        order: t.order,
                        type: t.type,
                        title: t.title,
                        fileId: t.fileId,
                        chartName: row ? row.name : t.fileId ? t.fileName : null,
                        key: t.key,
                        leadMusician: t.leadMusician,
                        notes: t.notes,
                    }
                }),
            })
        }
        out.sort((a, b) => {
            if (a.eventDate === b.eventDate) return 0
            if (!a.eventDate) return 1
            if (!b.eventDate) return -1
            return a.eventDate < b.eventDate ? 1 : -1
        })
        return { ok: true, count: out.length, truncated, setlists: out }
    } catch (error) {
        logger.warn("export_setlists failed:", error)
        return richError(
            "internal_error",
            "Could not export setlists.",
            { errorCode: 500 },
            "Retry; if it keeps failing, list_setlists still works.",
        )
    }
}
