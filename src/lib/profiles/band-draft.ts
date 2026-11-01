import { isSongType } from "@/lib/setlist-derived-counts"
import type { DraftProfileRow } from "./draft"
import { computeSlotTier, phrase, type SlotTier, type StandingChoice } from "./tiers"

/**
 * BET-5 (TF-05): a band's draft from a past gig. Pure.
 *
 * The running order is the past gig's own, row for row. A song row is filled
 * only when someone said "keep it" for that song (a standing choice in the
 * band's scope); every other song is drafted open with its title kept, and
 * the chart it had at that gig comes back as `recall` (reused only when the
 * author says so). Headers and other rows copy as they are. Nothing here
 * picks a chart nobody chose.
 */

export interface BandGigRow {
    /** The past gig's track, as stored. */
    track: Record<string, unknown>
    /** The row's memory slot; null for a non-song row. */
    slotKey: string | null
    /** The band's standing choice for this slot, if any. */
    standing: (StandingChoice & { leadMusician?: string | null }) | null
    /** The library name of the row's chart at that gig. */
    chartName: string | null
    /** The chart is orphaned or archived: never recalled. */
    dead?: boolean
}

export interface BandGigSource {
    /** The past gig's name, said as the recall's "service". */
    name: string
    /** The past gig's event date, ISO; the recall's date. */
    eventDate: string | null
}

function str(v: unknown): string | null {
    return typeof v === "string" && v.trim() ? v.trim() : null
}

export function bandDraftProfileRows(rows: readonly BandGigRow[], source: BandGigSource): DraftProfileRow[] {
    return rows.map((r, index) => {
        const type = str(r.track.type) ?? "song"
        const title = typeof r.track.title === "string" ? r.track.title : ""
        const base: DraftProfileRow = { index, type, title, slotKey: r.slotKey, track: r.track, service: source.name }
        if (!isSongType(type) || !r.slotKey) return base
        if (r.standing) {
            return {
                ...base,
                tier: computeSlotTier({ standing: r.standing, profileUses: [], otherUses: [] }),
                standing: { leadMusician: r.standing.leadMusician ?? null },
            }
        }
        const fileId = str(r.track.fileId)
        if (!fileId) return { ...base, tier: { tier: "new", keyOnRecord: false, phrase: phrase("new", null, null) } }
        const key = str(r.track.key)
        const chartName = r.chartName ?? str(r.track.fileName) ?? title
        const tier: SlotTier = {
            tier: "last_time",
            fileId,
            chartName,
            key,
            keyOnRecord: key !== null,
            phrase: phrase("last_time", chartName, key),
            ...(source.eventDate ? { lastDate: source.eventDate } : {}),
            ...(r.dead ? { dead: true } : {}),
        }
        return { ...base, tier }
    })
}
