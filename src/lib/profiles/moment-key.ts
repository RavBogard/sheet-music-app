import { bookServiceFor } from "@/lib/books/machzor-services"
import { momentIdForUnit } from "@/lib/books/moments"
import { BINDABLE_ROW_TYPES } from "@/lib/liturgy/bind-on-type"
import { liturgyLookup } from "@/lib/liturgy/lookup"
import { matchLiturgyTitle } from "@/lib/liturgy/match"

/**
 * Bet 1 (MCP-02) — the moment a row is about, for MEMORY only.
 *
 * Setlist memory keys a song slot by its moment, so Mi Chamocha played as
 * Moshav one week and as "Mi Chamocha 6-8" the next is one slot, not two.
 * Rows often carry no stored `momentId` (typed titles, file names), so the
 * moment is looked up from the title with the same matcher bind-on-type uses.
 *
 * This never writes a page or a moment onto a row: it only groups rows that
 * name the same prayer. The answer depends on the title alone (a fixed set of
 * books, in a fixed order), so one title always lands in one slot whatever
 * book a week used. A title that names no moment, or names two, is null and
 * the row keeps a song slot.
 */

/** The weekly Shabbat tables; their names cover every weekly moment. */
const TITLE_BOOKS = ["crc-friday", "crc-saturday"] as const

const byTitle = new Map<string, string | null>()

function momentsOf(unitIds: Array<string | null | undefined>): Set<string> {
    const out = new Set<string>()
    for (const u of unitIds) {
        const m = momentIdForUnit(u ?? null)
        if (m) out.add(m)
    }
    return out
}

/**
 * The moment a row's title names, or null. A clear match in either weekly
 * table wins; failing that, one moment that is the only plausible reading in
 * both tables ("Mi Chamocha Ana B'Koach" → mi-chamocha). Two different
 * moments are null, never a guess.
 */
export function momentForTitle(title: string | null | undefined, type: string | null | undefined = "song"): string | null {
    if (typeof title !== "string" || !title.trim()) return null
    if (!BINDABLE_ROW_TYPES.has(type ?? "song")) return null
    const cacheKey = title.trim().toLowerCase()
    const cached = byTitle.get(cacheKey)
    if (cached !== undefined) return cached
    const clear = new Set<string>()
    const plausible = new Set<string>()
    for (const book of TITLE_BOOKS) {
        if (!liturgyLookup(book, bookServiceFor(book, null)).length) continue
        const m = matchLiturgyTitle(book, title, bookServiceFor(book, null))
        for (const id of momentsOf([m.clear?.entry.unitId])) clear.add(id)
        for (const id of momentsOf(m.plausible.map((p) => p.entry.unitId))) plausible.add(id)
    }
    const pick = clear.size === 1 ? [...clear][0] : clear.size === 0 && plausible.size === 1 ? [...plausible][0] : null
    byTitle.set(cacheKey, pick)
    return pick
}

/** The one moment printed on a page of a book's table, or null (none, or several). */
export function momentForPage(ref: { book?: string | null; folio?: number | null } | null | undefined): string | null {
    if (!ref || typeof ref.book !== "string" || typeof ref.folio !== "number") return null
    let entries
    try {
        entries = liturgyLookup(ref.book, bookServiceFor(ref.book, null))
    } catch {
        return null
    }
    const ids = momentsOf(entries.filter((e) => e.folio === ref.folio).map((e) => e.unitId))
    return ids.size === 1 ? [...ids][0] : null
}
