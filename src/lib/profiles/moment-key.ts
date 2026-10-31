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

/** Every word (4+ letters) of a book table's spellings, by book: liturgical vocabulary. */
const vocab = new Map<string, Map<string, Set<string>>>()

function wordsOf(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/['‘’]/g, "")
        .split(/[^a-z]+/)
        .filter((w) => w.length >= 4)
}

/** word -> the moments whose spellings use it, for one book. */
function vocabularyOf(book: string): Map<string, Set<string>> {
    let v = vocab.get(book)
    if (v) return v
    v = new Map()
    for (const e of liturgyLookup(book, bookServiceFor(book, null))) {
        const m = momentIdForUnit(e.unitId ?? null) ?? `label:${e.label}`
        for (const alias of e.aliases ?? [e.label]) {
            for (const w of wordsOf(alias)) {
                const set = v.get(w) ?? new Set<string>()
                set.add(m)
                v.set(w, set)
            }
        }
    }
    vocab.set(book, v)
    return v
}

/** The clarifiers of a title: text in parentheses and after a spaced dash. */
function clarifiersOf(title: string): string[] {
    const out: string[] = []
    for (const m of title.matchAll(/\(([^)]*)\)/g)) out.push(m[1])
    const dash = title.replace(/\([^)]*\)/g, " ").split(/\s+[—–-]\s+/)
    if (dash.length > 1) out.push(...dash.slice(1))
    return out
}

/**
 * The moment a row's title names, or null. Strict (a wrong slot is worse than
 * a song slot): exactly one moment must be a CLEAR match in the weekly tables,
 * no table may read the title as any other moment, and a clarifier may not
 * name other liturgy ("Shema (Torah Service)" is not the Sh'ma). A plausible
 * reading alone is a guess and is never used.
 */
export function momentForTitle(title: string | null | undefined, type: string | null | undefined = "song"): string | null {
    if (typeof title !== "string" || !title.trim()) return null
    if (!BINDABLE_ROW_TYPES.has(type ?? "song")) return null
    const cacheKey = title.trim().toLowerCase()
    const cached = byTitle.get(cacheKey)
    if (cached !== undefined) return cached
    const clear = new Set<string>()
    const other = new Set<string>()
    for (const book of TITLE_BOOKS) {
        if (!liturgyLookup(book, bookServiceFor(book, null)).length) continue
        const m = matchLiturgyTitle(book, title, bookServiceFor(book, null))
        for (const id of momentsOf([m.clear?.entry.unitId])) clear.add(id)
        for (const id of momentsOf(m.plausible.map((p) => p.entry.unitId))) other.add(id)
    }
    let pick: string | null = clear.size === 1 ? [...clear][0] : null
    if (pick && [...other].some((id) => id !== pick)) pick = null
    if (pick) {
        const words = clarifiersOf(title).flatMap(wordsOf)
        const namesOther = words.some((w) =>
            TITLE_BOOKS.some((book) => [...(vocabularyOf(book).get(w) ?? [])].some((m) => m !== pick)),
        )
        if (namesOther) pick = null
    }
    byTitle.set(cacheKey, pick)
    return pick
}
