import { replayDeviations, type Deviation } from "@/lib/performance/tonight"
import type { HistorySetlist } from "./song-history"

/**
 * Bet 1 (MCP-23) — history "as performed". When the band swapped a row's
 * chart in Perform for the service (`performedDeviations`), memory counts the
 * chart that was played, not the one planned. Pure. The plan is never
 * written; this only changes what a history read sees.
 *
 * The swap records carry no key, so a swapped row's key is not on record.
 */
export function overlayPerformed(setlist: HistorySetlist, deviations: Deviation[], eventDay: string | null): HistorySetlist {
    if (!eventDay || deviations.length === 0) return setlist
    const rows = replayDeviations(deviations, eventDay)
    if (rows.size === 0) return setlist
    let changed = false
    const tracks = setlist.tracks.map((t) => {
        const h = rows.get(t.id)
        if (!h || !h.swapped || !h.finalFileId || h.finalFileId === t.fileId) return t
        changed = true
        return { ...t, fileId: h.finalFileId, fileName: h.finalTitle || null, key: null, performed: true }
    })
    return changed ? { ...setlist, tracks } : setlist
}

/**
 * Deviation docs grouped by the setlist they belong to, keeping only the
 * setlists asked for. A collection-group read sees every tenant's records;
 * only ids from an org-scoped setlist load are ever kept, so another tenant's
 * swaps can never reach this tenant's history.
 */
export function deviationsBySetlist(
    docs: Array<{ setlistId: string | null; deviation: Deviation | null }>,
    setlistIds: ReadonlySet<string>,
): Map<string, Deviation[]> {
    const out = new Map<string, Deviation[]>()
    for (const d of docs) {
        if (!d.setlistId || !d.deviation || !setlistIds.has(d.setlistId)) continue
        const list = out.get(d.setlistId)
        if (list) list.push(d.deviation)
        else out.set(d.setlistId, [d.deviation])
    }
    return out
}
