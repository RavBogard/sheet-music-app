/**
 * "As performed" — what actually happened, beside what was planned.
 *
 * Overlays keeps a bounded per-service history of accepted cue commands and
 * exposes it read-only; `.live` reconciles it against the published setlist.
 * **The plan is never overwritten.** An "as performed" version sits BESIDE it
 * and is promoted, once, on purpose.
 *
 * "Bounded operational history, not permanent personal surveillance"
 * (RULINGS-INTEGRATION-2026-09-14 #7). Nothing here fires anything, nothing
 * touches the live relay, and no cue text is stored in `.live` beyond what the
 * setlist already has.
 */

/** One accepted cue, as Overlays' `GET /api/history` returns it. */
export interface HistoryRow {
    /** Monotonic sequence within the service. */
    seq: number
    /**
     * When the cue was accepted: EPOCH MILLISECONDS on the wire, and an ISO
     * instant is accepted too.
     *
     * Overlays sends a number — `lib/service-history.ts` types the row as
     * `at:number` and validates it with a safe-integer check, and the captured
     * `history-rehearsal.json` shows `"at": 1789420709619`. This side required
     * a string, so `isHistoryRow` rejected EVERY row silently and
     * `reconcile_service` answered "no cues were logged" for a service that had
     * logged them all. Both shapes are accepted here and normalised once, at
     * the boundary, by `historyInstant`.
     */
    at: string | number
    action: string
    cueId?: string | null
    /** Book-local AR-3 unit id, when the cue carried one. */
    unitId?: string | null
    /** Shared moment id, when the cue carried one. */
    momentId?: string | null
    book?: string | null
    folio?: number | null
    source?: string | null
    serviceRef?: string | null
    /**
     * A human label for the cue, IF Overlays supplies one. `(unverified)`
     * against the deployed `/api/history` shape — the cue log ships from
     * `PLAN-CODE-OVERLAYS-CUE-LOG-2026-09-14.md`, and the row shape that plan
     * states carries no title. The reconcile treats it as the weakest and last
     * basis and works correctly without it; if it never arrives, the title fold
     * is simply never reached.
     */
    title?: string | null
}

/**
 * How a planned row and the cue log line up.
 *
 * `untracked` is the one that matters at CRC and the reason this is not a
 * red/green diff: most of what the band plays produces no graphic at all.
 * Band-only songs and headers are `untracked`, and they INHERIT `performed`
 * when bracketed by performed neighbours — the service plainly went through
 * them. Showing those as "skipped" would paint a normal Shabbat morning red.
 */
export type RowStatus =
    | "performed"
    | "skipped"
    | "added"
    | "reordered"
    | "untracked"

/** How a planned row was matched to the cue log (or why it was not). */
export type MatchBasis = "momentId" | "liturgyRef" | "title" | "bracketed" | "chartSwap" | "none"

/**
 * The band's chart choice for a row, rebuilt from
 * `setlists/{id}/performedDeviations` (David's ask 4). This is a DIFFERENT
 * kind of evidence from the cue log: a musician deliberately choosing a chart
 * for tonight, not a graphic firing. Both are kept, side by side; neither
 * overwrites the other. A cue that fired for the row's prayer says nothing
 * about which tune was sung, so it can never cancel a swap.
 */
export interface ChartChoice {
    source: "band-swap"
    plannedFileId: string | null
    plannedTitle: string
    performedFileId: string | null
    performedTitle: string
    /** True when the row ended the service on a chart other than the plan's. */
    swapped: boolean
    /** Every chart the row showed, in order, starting from the plan. */
    sequence: Array<{ fileId: string | null; title: string }>
    /** Swap / undo / reset events recorded for the row. */
    events: number
}

export interface DiffRow {
    status: RowStatus
    /** 0-based position in the PLANNED setlist. Absent for an added row. */
    plannedPosition?: number
    /** Track id in the planned setlist. Absent for an added row. */
    trackId?: string
    title: string
    type?: string
    liturgyRef?: { book: string; unitId?: string; folio: number } | null
    /** ISO instant the matching cue fired. Absent when nothing fired. */
    performedAt?: string
    /** `seq` of the matching cue, for ordering checks. */
    seq?: number
    basis: MatchBasis
    /** Human sentence for the staged view. */
    note?: string
    /** The band's chart choice, when any swap was recorded for this row. */
    chart?: ChartChoice
}

export interface Diff {
    setlistId: string
    /** Rows in SERVICE order: the plan's order, with added rows spliced in. */
    rows: DiffRow[]
    counts: Record<RowStatus, number>
    /** History rows ignored because they carried no identity at all. */
    ignoredRows: number
    /** Total history rows considered. */
    historyRows: number
    /** Rows that ended the service on a swapped chart. */
    chartSwaps: number
}

/**
 * The instant a history row carries, as an ISO string, or null.
 *
 * One place converts, so nothing downstream has to know which shape arrived
 * and no second `Date.parse` of a number can silently produce 1970.
 */
export function historyInstant(at: string | number | null | undefined): string | null {
    if (typeof at === "number") {
        return Number.isFinite(at) ? new Date(at).toISOString() : null
    }
    if (typeof at !== "string") return null
    const ms = Date.parse(at)
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null
}

/** A chapter line for a recording description: `mm:ss  Title`. */
export interface Chapter {
    /** Seconds from the chapter origin. */
    offsetSeconds: number
    label: string
    /** `mm:ss  Title` (or `h:mm:ss  Title` past an hour). */
    line: string
}
