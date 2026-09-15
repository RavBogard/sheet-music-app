import { foldLiturgyName } from "@/lib/liturgy/fold"

/**
 * R4-a — a census refresh never drops a header.
 *
 * The census reads what CRC actually did, setlist by setlist, and counts how
 * often each row appears. It is a census of REPERTOIRE, and it was built to
 * skip `header` rows deliberately: a header is not a thing anyone played, it
 * has no chart, and counting "Ma'ariv Service" in 4 of 6 setlists says nothing
 * about the service. That was right about the census and wrong about the
 * refresh — when the census became the template, Shir Shabbat lost
 * "Kabbalat Shabbat", "Ma'ariv Service" and "T'filah", and a twelve-row list
 * of songs is harder to read on a stand than a nine-row list under three
 * signs.
 *
 * Daniel's ruling: headers are STRUCTURE, not repertoire. The census keeps
 * ignoring them; the refresh keeps them. This module is that second half.
 *
 * IN PLACE, BY ANCHOR. A header means "everything after me, until the next
 * one". So it is restored immediately before the row it used to introduce —
 * found by name in the refreshed list, not by index, because the whole point
 * of a refresh is that the indices moved. A header whose section the census
 * dropped entirely has nothing left to introduce and is reported rather than
 * parked somewhere arbitrary.
 */

const HEADER_TYPES = new Set(["header", "section"])

export interface HeaderCarryAdapter<T> {
    labelOf(row: T): string
    typeOf(row: T): string | undefined
}

export interface CarriedHeader {
    label: string
    /** The refreshed row it was placed in front of, or null when appended. */
    before: string | null
    outcome: "restored" | "already-present" | "appended-no-anchor"
}

export interface HeaderCarryResult<T> {
    rows: T[]
    carried: CarriedHeader[]
}

/**
 * Put `previous`'s header rows back into `refreshed`.
 *
 * Nothing is removed and nothing is reordered: the only edit is an insertion.
 * A refreshed list that already carries a header under the same name is left
 * exactly as it is, so running this twice changes nothing the second time.
 */
export function carryHeadersThrough<T>(
    previous: readonly T[],
    refreshed: readonly T[],
    adapter: HeaderCarryAdapter<T>,
): HeaderCarryResult<T> {
    const isHeader = (row: T) => HEADER_TYPES.has(adapter.typeOf(row) ?? "song")
    const fold = (row: T) => foldLiturgyName(adapter.labelOf(row))

    const rows = [...refreshed]
    const carried: CarriedHeader[] = []

    for (let h = 0; h < previous.length; h++) {
        const header = previous[h]
        if (!isHeader(header)) continue
        const label = adapter.labelOf(header)
        const folded = fold(header)
        if (!folded) continue

        if (rows.some((r) => isHeader(r) && fold(r) === folded)) {
            carried.push({ label, before: null, outcome: "already-present" })
            continue
        }

        // The row this header introduces: the first thing after it that the
        // refreshed list still carries.
        let at = -1
        let before: string | null = null
        for (let i = h + 1; i < previous.length && at === -1; i++) {
            const candidate = previous[i]
            if (isHeader(candidate)) break // the next section began; stop looking
            const key = fold(candidate)
            if (!key) continue
            const found = rows.findIndex((r) => !isHeader(r) && fold(r) === key)
            if (found >= 0) {
                at = found
                before = adapter.labelOf(rows[found])
            }
        }

        if (at === -1) {
            // Nothing of its section survived. Appending it would put a sign
            // over nothing; saying so is the honest outcome.
            carried.push({ label, before: null, outcome: "appended-no-anchor" })
            continue
        }

        rows.splice(at, 0, header)
        carried.push({ label, before, outcome: "restored" })
    }

    return { rows, carried }
}
