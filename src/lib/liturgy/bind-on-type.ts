import { bookServiceFor } from "@/lib/books/machzor-services"
import { validateLiturgyRef } from "@/lib/books/registry"
import { momentIdForUnit } from "@/lib/books/moments"
import type { LiturgyRef } from "@/lib/books/types"
import { liturgyLookup } from "./lookup"
import { matchLiturgyTitle } from "./match"

/**
 * BIND ON TYPE — a row gains its page the moment it gains its name.
 *
 * Round 3, item 5. `propose_liturgy_bindings` is the batch that catches up on
 * everything Daniel has already written; this is the same matcher on the
 * writing path, so the catching-up stops being necessary. He types "Mi
 * Chamocha" into a Friday setlist and the row knows it is p.18 before he has
 * moved to the next line.
 *
 * THE THREE OUTCOMES ARE THE MATCHER'S, NOT THIS MODULE'S. Clear binds
 * silently; plausible is REPORTED and never written, because a page number on
 * a lectern sheet is not a thing to guess at while someone is typing; nothing
 * at all is the honest answer for "Fiddley Tune". The confirmations Daniel
 * ruled on 2026-09-15 are already inside the lookup, so every spelling he has
 * settled lands in the first bucket and the second stays rare.
 *
 * NEVER OVERWRITES. A row that already carries a `liturgyRef` is left alone,
 * here as in the batch: whatever is on it, an author put it there.
 */

/** Row types that can name a liturgical moment. Headers and notes cannot. */
export const BINDABLE_ROW_TYPES = new Set([
    "song",
    "prayer",
    "reading",
    "transition",
])

export interface LiturgySuggestion {
    label: string
    folio: number | null
    unitId: string | null
    confidence: number
    /** The spelling in the table that matched — what to show a human. */
    via: string
}

export interface AutoBindResult {
    /** Safe to write. Absent unless the matcher was clear AND the page is real. */
    ref?: LiturgyRef
    /**
     * The moment the matched unit belongs to. Written beside `liturgyRef`, and
     * absent whenever the moments artifact does not know the unit — a row with
     * a page and no moment is a normal row, not a broken one.
     */
    momentId?: string
    /** Real candidates, none of them safe alone. Show, never write. */
    suggestions: LiturgySuggestion[]
}

const NOTHING: AutoBindResult = { suggestions: [] }

/**
 * The ref that may actually be written, or null.
 *
 * A unit id belongs to the book that defines it. The legacy booklets are
 * pagemaps with no units at all, so `crc-friday` cannot carry
 * `shma.barchu@shabbat-maariv` however true that identity is — the registry
 * refuses it, correctly, and the page is kept alone. When the Shirei volume
 * for a service is released and becomes the book, the same match carries its
 * unit id through unchanged.
 */
export function writableLiturgyRef(
    book: string,
    folio: number | null | undefined,
    unitId?: string | null,
    service?: string | null,
): LiturgyRef | null {
    if (typeof folio !== "number") return null
    if (unitId) {
        const withId: LiturgyRef = { book, unitId, folio }
        if (validateLiturgyRef(withId, { service }).ok) return withId
    }
    const pageOnly: LiturgyRef = { book, folio }
    return validateLiturgyRef(pageOnly, { service }).ok ? pageOnly : null
}

/**
 * What a freshly typed row should carry, if anything.
 *
 * Returns nothing — never throws, never guesses — for a row type that cannot
 * name a moment, a book with no lookup table (every book but the four), an
 * empty title, or a title the matcher will not touch.
 */
export function autoBindLiturgyRef(
    book: string | null | undefined,
    title: string | null | undefined,
    type: string | null | undefined,
    /**
     * The setlist's `templateType`. For a book that prints several services it
     * is what decides which service's pages a name may resolve to, and passing
     * it is not optional in spirit: without it a Kol Nidre row would bind
     * against Rosh Hashanah morning, which is a wrong page and not a missing
     * one.
     */
    templateType?: string | null,
): AutoBindResult {
    if (!book || typeof book !== "string") return NOTHING
    if (!BINDABLE_ROW_TYPES.has(type ?? "song")) return NOTHING
    if (typeof title !== "string" || !title.trim()) return NOTHING
    const service = bookServiceFor(book, templateType ?? null)
    if (!liturgyLookup(book, service).length) return NOTHING

    const m = matchLiturgyTitle(book, title, service)
    const suggestions = m.plausible.map((p) => ({
        label: p.entry.label,
        folio: p.entry.folio ?? null,
        unitId: p.entry.unitId ?? null,
        confidence: p.score,
        via: p.via,
    }))
    if (!m.clear) return { suggestions }

    const ref = writableLiturgyRef(
        book,
        m.clear.entry.folio,
        m.clear.entry.unitId,
        service,
    )
    const momentId = momentIdForUnit(m.clear.entry.unitId) ?? undefined
    // A clear match on a moment the book does not print is not a failure and
    // not a suggestion either — the row is correctly identified and correctly
    // page-less. Saying nothing is the truthful outcome.
    return ref ? { ref, momentId, suggestions } : { suggestions }
}
