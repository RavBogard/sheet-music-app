import { isSongType } from "@/lib/setlist-derived-counts"
import type { Gig } from "./model"

/**
 * BET-5: the running length of each set. Pure.
 *
 * Sets are the rows between header rows, in the author's order. Rows before
 * the first header form a set of their own (`header: null`), listed only when
 * there are any. A set's `seconds` is the sum of its rows' `durationSec`; a
 * song row with no duration is counted in `untimed`, never guessed.
 *
 * A target names its set by `headerRowId`. A target with no `headerRowId`
 * applies by position: the n-th such target to the n-th set that has no
 * target by id.
 */

export interface SetTotalsRow {
    id?: string
    type?: string | null
    title?: string | null
    durationSec?: unknown
}

export interface SetTotal {
    header: { id: string | null; title: string } | null
    seconds: number
    /** Song rows in this set with no duration. */
    untimed: number
    targetMinutes?: number
    /** seconds minus the target; positive is over. */
    overUnderSec?: number
}

function duration(v: unknown): number | null {
    return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null
}

export function setTotals(tracks: readonly SetTotalsRow[], gig?: Pick<Gig, "setTargets"> | null): SetTotal[] {
    const sets: Array<SetTotal & { rows: number }> = []
    let current: (SetTotal & { rows: number }) | null = null
    for (const t of tracks) {
        if (t.type === "header") {
            current = {
                header: { id: typeof t.id === "string" ? t.id : null, title: typeof t.title === "string" ? t.title : "" },
                seconds: 0,
                untimed: 0,
                rows: 0,
            }
            sets.push(current)
            continue
        }
        if (!current) {
            current = { header: null, seconds: 0, untimed: 0, rows: 0 }
            sets.push(current)
        }
        current.rows++
        const d = duration(t.durationSec)
        if (d !== null) current.seconds += d
        else if (isSongType(t.type ?? undefined)) current.untimed++
    }

    const targets = Array.isArray(gig?.setTargets) ? gig!.setTargets : []
    const byId = new Map<string, number>()
    const positional: number[] = []
    for (const t of targets) {
        if (t.headerRowId) {
            if (!byId.has(t.headerRowId)) byId.set(t.headerRowId, t.minutes)
        } else positional.push(t.minutes)
    }
    let next = 0
    return sets.map(({ rows: _rows, ...s }) => {
        const id = s.header?.id ?? null
        let minutes: number | undefined
        if (id && byId.has(id)) minutes = byId.get(id)
        else if (next < positional.length) minutes = positional[next++]
        if (minutes === undefined) return s
        return { ...s, targetMinutes: minutes, overUnderSec: s.seconds - minutes * 60 }
    })
}

/** True when any row carries a duration: CRC shows totals only then. */
export function anyDuration(tracks: readonly SetTotalsRow[]): boolean {
    return tracks.some((t) => duration(t.durationSec) !== null)
}
