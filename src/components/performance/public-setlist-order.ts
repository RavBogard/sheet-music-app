import { toDate } from "@/lib/firestore-helpers"
import { isTestUid } from "@/lib/test-isolation"
import type { Setlist } from "@/lib/setlist-firebase"

/**
 * Cap the public landing to at most this many service rows (upcoming first).
 * Single source of truth — consumed by SSR (`src/app/perform/page.tsx`) and
 * client useMemo (`PublicSetlistListing.tsx`). Defined here (alongside the
 * shared filter) so the wire-layer cap can't drift from the DOM-layer cap.
 * Cycle-12 F-C12-001 fix: the cap MUST run at the SSR boundary before the
 * prop crosses RSC, not only inside the client useMemo.
 */
export const MAX_PUBLIC_SERVICES = 5

/**
 * The single non-test visibility predicate: a setlist is shown to humans only
 * when it is NOT a test fixture. Drops explicit `isTest:true` rows AND
 * test-uid-owned rows (covers legacy `isTest:undefined` docs that a `test-*`
 * owner still marks as test). Shared by the public /perform listing
 * (`splitPublicSetlists` below) and the authed `(main)` dashboard
 * (`DashboardClient.tsx`) so the two surfaces can never drift — v11.2-04-02
 * (BUG-5). Structural param keeps it decoupled from each caller's Setlist type.
 */
export function isNonTestSetlist(s: {
    isTest?: boolean
    ownerId?: string | null
}): boolean {
    return s.isTest !== true && !isTestUid(s.ownerId)
}

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

    const visible = setlists.filter(isNonTestSetlist)

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

/**
 * Cycle-12 F-C12-001: SSR-boundary helper that produces the exact flat slice
 * that should cross the RSC wire to `<PublicSetlistListing>`. Combines
 * `splitPublicSetlists` (drops `isTest:true` + test-uid + date-window split)
 * with the `MAX_PUBLIC_SERVICES` cap (upcoming first, past fills the
 * remainder) — the same shape `PublicSetlistListing`'s useMemo derives
 * client-side for the rendered cards. Calling this in the RSC keeps the
 * wire bytes byte-identical to what the DOM is allowed to expose, closing
 * the prior leak where the unfiltered 50-row fetch shipped to the browser
 * (with isTest fixtures, full track trees, ownerName/ownerId, and band
 * member emails) and the client useMemo culled it only at render time.
 *
 * Order: [...cappedUpcoming, ...cappedPast]. `now` is injectable for
 * deterministic tests; defaults to current time.
 */
export function selectVisiblePublicSetlists(
    setlists: Setlist[],
    now: Date = new Date(),
): Setlist[] {
    const { upcoming, past } = splitPublicSetlists(setlists, now)
    const cappedUpcoming = upcoming.slice(0, MAX_PUBLIC_SERVICES)
    const remaining = Math.max(0, MAX_PUBLIC_SERVICES - cappedUpcoming.length)
    return [...cappedUpcoming, ...past.slice(0, remaining)]
}
