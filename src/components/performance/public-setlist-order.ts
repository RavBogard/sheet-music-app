import { toDate } from "@/lib/firestore-helpers"
import { isTestUid } from "@/lib/test-isolation"
import type { Setlist } from "@/lib/setlist-firebase"

export interface SplitSetlists {
    /** eventDate >= today (00:00 local), soonest first — today counts as upcoming. */
    upcoming: Setlist[]
    /** eventDate < today, most-recent first; undated rows trail in original order. */
    past: Setlist[]
}

/**
 * Split public setlists into upcoming + past groups for the public /perform
 * listing. Mirrors the authed dashboard grouping (use-setlist-dashboard.ts):
 * the day boundary is today-at-00:00 so a service happening TODAY sits at the
 * top of "upcoming" (e.g. tonight's Kabbalat Shabbat above tomorrow's Yizkor),
 * not buried by a plain descending-date sort.
 *
 * Drops `isTest:true` rows AND test-uid-owned rows (Cycle-2 SEC-004 +
 * Cycle-7 belt-and-braces) — the exact filter the prior flat listing applied,
 * so legacy rows with `isTest:undefined` still can't leak onto the public
 * surface. `now` is injectable for deterministic tests.
 */
export function splitPublicSetlists(setlists: Setlist[], now: Date = new Date()): SplitSetlists {
    const today = new Date(now)
    today.setHours(0, 0, 0, 0)

    const getDate = (s: Setlist) => (s.eventDate ? toDate(s.eventDate) : null)

    const visible = setlists.filter((s) => s.isTest !== true && !isTestUid(s.ownerId))

    const upcoming = visible
        .filter((s) => {
            const d = getDate(s)
            return d != null && d >= today
        })
        .sort((a, b) => getDate(a)!.getTime() - getDate(b)!.getTime())

    const dated: Setlist[] = []
    const undated: Setlist[] = []
    for (const s of visible) {
        const d = getDate(s)
        if (!d) undated.push(s)
        else if (d < today) dated.push(s)
    }
    dated.sort((a, b) => getDate(b)!.getTime() - getDate(a)!.getTime())

    return { upcoming, past: [...dated, ...undated] }
}
