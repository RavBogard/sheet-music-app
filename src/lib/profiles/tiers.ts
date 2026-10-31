/**
 * Setlist memory, release 2 — how sure the server is about one slot of a
 * profile. Pure: computed on read from a standing choice and from history,
 * never cached, never touches Firestore.
 *
 * Only `standard` and `usual` may fill a slot in a draft; the other tiers
 * describe history and leave the slot open. Special weeks never make a chart
 * usual and never trigger a promotion offer.
 */

export type Tier = "standard" | "usual" | "last_time" | "other_service" | "new"

/** usual = the same chart (partGroup) on ≥ USUAL_MIN of the last USUAL_WINDOW non-special services. */
export const USUAL_MIN = 3
export const USUAL_WINDOW = 5
/** A standing choice is offered for promotion after this many consecutive differing regular uses. */
export const PROMOTION_WEEKS = 3

/** The part of a stored standing choice the tiers read. */
export interface StandingChoice {
    fileId: string
    chartName: string | null
    key: string | null
    /** When absent, it is looked up among the uses by fileId, else the fileId stands in. */
    partGroup?: string | null
}

/** One past use of a slot. Every list of uses is newest first. */
export interface SlotUse {
    eventDate: string
    fileId: string
    partGroup: string
    chartName: string
    /** The chart's setting ("Moshav"), from the library row; said instead of a file name. */
    setting?: string | null
    key: string | null
    special: boolean
    serviceLabel: string
    /** The chart is orphaned or archived with no live twin: it fills its service's place but is never filled. */
    dead?: boolean
    /**
     * False when this use's service is older than the profile's last
     * USUAL_WINDOW regular services. Absent: not known, so the use counts.
     */
    recent?: boolean
}

export interface SlotTierInput {
    standing?: StandingChoice | null
    profileUses: SlotUse[]
    otherUses: SlotUse[]
}

export interface Promotion {
    fileId: string
    chartName: string
    key: string | null
    weeks: typeof PROMOTION_WEEKS
}

export interface SlotTier {
    tier: Tier
    fileId?: string
    chartName?: string
    key?: string | null
    keyOnRecord: boolean
    phrase: string
    promotion?: Promotion
    /** Usual only: the slot's latest regular use was a different chart (data only). */
    differsFromLast?: { chartName: string; date: string; setting?: string | null }
    /** The setting of the tier's chart, when the library names one. */
    setting?: string | null
    /** The date of the use behind the tier (usual: its latest use; last_time / other_service: that use). */
    lastDate?: string
    /** Regular services in the window that had this slot at all (any chart). */
    windowUses?: number
    /** The chart behind a last_time / other_service tier is orphaned or archived. */
    dead?: boolean
}

const FILE_EXT_RE = /\.(pdf|musicxml|mxl|xml|docx?|txt|png|jpe?g)$/i

/** A chart or row name said aloud: no file extension, underscores as spaces. */
export function cleanLabel(name: string | null | undefined): string {
    return (name ?? "").trim().replace(FILE_EXT_RE, "").replace(/_/g, " ").replace(/\s{2,}/g, " ").trim()
}

/** The row phrase for a tier, in the exact wording drafts show. */
export function phrase(
    tier: Tier,
    rawChart: string | null | undefined,
    key: string | null | undefined,
    serviceLabel?: string | null,
): string {
    const chart = rawChart == null ? rawChart : cleanLabel(rawChart)
    const inKey = key ? ` in ${key}` : ", key not on record"
    switch (tier) {
        case "standard":
            return `your standard ${chart ?? ""}${inKey}`
        case "usual":
            return `the usual ${chart ?? ""}${inKey}`
        case "last_time":
            return `last time it was ${chart ?? ""}${inKey}`
        case "other_service":
            return `done before at ${serviceLabel ?? ""}, not here`
        case "new":
            return "new — which chart?"
    }
}

/** Most frequent non-null key; a tie goes to the most recent. Uses are newest first. */
function mostFrequentKey(uses: SlotUse[]): string | null {
    const counts = new Map<string, number>()
    for (const u of uses) if (u.key) counts.set(u.key, (counts.get(u.key) ?? 0) + 1)
    let best: string | null = null
    let bestCount = 0
    for (const u of uses) {
        if (!u.key) continue
        const c = counts.get(u.key)!
        if (c > bestCount) {
            best = u.key
            bestCount = c
        }
    }
    return best
}

function promotionFor(standing: StandingChoice, profileUses: SlotUse[]): Promotion | undefined {
    const recent = profileUses.slice(0, PROMOTION_WEEKS)
    if (recent.length < PROMOTION_WEEKS) return undefined
    // Consecutive regular weeks only: a special week among them breaks the run.
    if (recent.some((u) => u.special)) return undefined
    const [first] = recent
    const shared = recent.every(
        (u) => u.partGroup === first.partGroup && (u.key ?? null) === (first.key ?? null),
    )
    if (!shared) return undefined
    const standingGroup =
        standing.partGroup ??
        profileUses.find((u) => u.fileId === standing.fileId)?.partGroup ??
        standing.fileId
    const differs =
        first.partGroup !== standingGroup || (first.key ?? null) !== (standing.key ?? null)
    if (!differs) return undefined
    return {
        fileId: first.fileId,
        chartName: first.chartName,
        key: first.key ?? null,
        weeks: PROMOTION_WEEKS,
    }
}

export function computeSlotTier(input: SlotTierInput): SlotTier {
    const { standing, profileUses, otherUses } = input
    // The window is the profile's last USUAL_WINDOW regular services (`recent`), not the last uses of
    // a chart: a chart played three times long ago and since replaced is not the usual.
    const window = profileUses.filter((u) => !u.special && u.recent !== false).slice(0, USUAL_WINDOW)

    if (standing) {
        const key = standing.key ?? null
        const out: SlotTier = {
            tier: "standard",
            fileId: standing.fileId,
            chartName: standing.chartName ?? undefined,
            key,
            keyOnRecord: key !== null,
            phrase: phrase("standard", standing.chartName, key),
            windowUses: window.length,
        }
        const promotion = promotionFor(standing, profileUses)
        if (promotion) out.promotion = promotion
        return out
    }

    const groupCounts = new Map<string, number>()
    for (const u of window) groupCounts.set(u.partGroup, (groupCounts.get(u.partGroup) ?? 0) + 1)
    // The most recent live chart in at least USUAL_MIN of the window. When the latest regular
    // service used something else, the slot is still usual and filled, and says so.
    const usualGroup = window.find((u) => !u.dead && (groupCounts.get(u.partGroup) ?? 0) >= USUAL_MIN)?.partGroup
    if (usualGroup !== undefined) {
        const uses = window.filter((u) => u.partGroup === usualGroup)
        const latest = uses[0]
        const key = mostFrequentKey(uses)
        const out: SlotTier = {
            tier: "usual",
            fileId: latest.fileId,
            chartName: latest.chartName,
            key,
            keyOnRecord: key !== null,
            phrase: phrase("usual", latest.chartName, key),
            lastDate: latest.eventDate,
            windowUses: window.length,
        }
        if (latest.setting) out.setting = latest.setting
        if (window[0].partGroup !== usualGroup) {
            out.differsFromLast = { chartName: window[0].chartName, date: window[0].eventDate, setting: window[0].setting ?? null }
        }
        return out
    }

    if (profileUses.length > 0) {
        const last = profileUses[0]
        const key = last.key ?? null
        return {
            tier: "last_time",
            fileId: last.fileId,
            chartName: last.chartName,
            key,
            keyOnRecord: key !== null,
            phrase: phrase("last_time", last.chartName, key),
            lastDate: last.eventDate,
            windowUses: window.length,
            ...(last.setting ? { setting: last.setting } : {}),
            ...(last.dead ? { dead: true } : {}),
        }
    }

    if (otherUses.length > 0) {
        const other = otherUses[0]
        const key = other.key ?? null
        return {
            tier: "other_service",
            fileId: other.fileId,
            chartName: other.chartName,
            key,
            keyOnRecord: key !== null,
            phrase: phrase("other_service", other.chartName, key, other.serviceLabel),
            lastDate: other.eventDate,
            ...(other.setting ? { setting: other.setting } : {}),
            ...(other.dead ? { dead: true } : {}),
        }
    }

    return { tier: "new", keyOnRecord: false, phrase: phrase("new", null, null) }
}
