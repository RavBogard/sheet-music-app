import { getMoment } from "@/lib/books/moments"
import type { HistorySetlist, LibraryLite } from "@/lib/history/song-history"
import { isSongType } from "@/lib/setlist-track-count"
import { slotKeyFor } from "./keys"
import { settingOf } from "./readback"
import { cleanLabel } from "./tiers"

/**
 * Bet 1 (MCP-05) — "what did last week have?" Per slot, the chart, key and
 * date of the profile's last regular service. A compact list, recall only:
 * it never fills or proposes anything. Pure.
 */

export interface VsLastRow {
    slotKey: string
    label: string
    fileId: string
    chartName: string
    /** The chart's setting, said instead of its file name. */
    setting: string
    key: string | null
}

export interface VsLast {
    setlistId: string
    name: string
    /** YYYY-MM-DD, the service day. */
    date: string
    rows: VsLastRow[]
}

export function vsLastOf(
    profileSetlists: HistorySetlist[],
    library: Map<string, LibraryLite>,
    opts: { before?: string | null; excludeId?: string | null; dayOf?: (iso: string) => string } = {},
): VsLast | null {
    const dayOf = opts.dayOf ?? ((iso: string) => iso.slice(0, 10))
    const last = profileSetlists.find(
        (s) =>
            !s.special &&
            !!s.eventDate &&
            s.id !== opts.excludeId &&
            (!opts.before || dayOf(s.eventDate) < opts.before),
    )
    if (!last) return null
    const partGroupOf = (fileId: string) => library.get(fileId)?.partGroup ?? null
    const seen = new Set<string>()
    const rows: VsLastRow[] = []
    for (const t of last.tracks) {
        if (!isSongType(t.type) || !t.fileId) continue
        const slotKey = slotKeyFor(t, partGroupOf)
        if (seen.has(slotKey)) continue
        seen.add(slotKey)
        const lib = library.get(t.fileId)
        const chartName = lib?.name ?? t.fileName ?? t.title
        const momentId = slotKey.startsWith("moment:") ? slotKey.slice("moment:".length) : null
        rows.push({
            slotKey,
            label: getMoment(momentId)?.display.en ?? (cleanLabel(t.title) || t.title),
            fileId: t.fileId,
            chartName,
            setting: settingOf(chartName, lib?.setting),
            key: t.key ?? null,
        })
    }
    return { setlistId: last.id, name: last.name, date: dayOf(last.eventDate!), rows }
}
