import confirmedFile from "@/data/liturgy/confirmed-bindings-2026-09-15.json"
import { foldLiturgyName } from "./fold"

/**
 * Daniel's CONFIRMED BINDINGS — one ruling per spelling, 2026-09-15.
 *
 * He read the whole proposal on the interactive "Liturgy Bindings" page and
 * ruled: everything unmarked is approved at its default. Cowork compiled the
 * result into `work/liturgy-bindings-confirmed-2026-09-15.json`, copied here
 * byte-for-byte as `src/data/liturgy/confirmed-bindings-2026-09-15.json` so
 * the running code reads the artifact rather than a retyping of it.
 *
 * WHAT A CONFIRMATION IS. Not a row and not a write — a fact about a NAME.
 * The rule Daniel confirmed, in the file's own words: "A binding writes
 * {book, folio} to rows carrying that spelling." So a confirmation belongs in
 * the lookup table, beside the aliases the booklet and the draft feed supply,
 * and every consumer of the table gets it at once: the binding run, the
 * template refresh, and the matcher that fires when he types a new row.
 *
 * EXCLUSIVE. A spelling he ruled means exactly one moment. The lookup strips
 * it from every other entry in that book — see `applyConfirmed` in
 * `./lookup`. "Closing Blessing" is why: it was an alias of BOTH Saturday
 * Birkat Kohanim entries, the page-less one inside the Amidah and the
 * concluding one at p.100, and a spelling that matches two entries on two
 * pages binds to neither.
 *
 * `leaveUnbound` is a ruling too, and the stronger one: Daniel looked at the
 * candidate and said no. The matcher refuses those spellings outright rather
 * than re-deriving a match the next time someone asks.
 */

interface ConfirmedBindJson {
    title: string
    also?: string[]
    bindsTo: string
    folio: number | null
    source?: string
}

interface ConfirmedBookJson {
    bind: ConfirmedBindJson[]
    leaveUnbound?: Array<{ title: string; reason?: string; note?: string | null }>
}

interface ConfirmedFileJson {
    confirmedBy: string
    confirmedAt: string
    rule: string
    books: Record<string, ConfirmedBookJson>
}

const FILE = confirmedFile as unknown as ConfirmedFileJson

/**
 * Pages the compiled artifact left null that Daniel ruled out loud.
 *
 * The RULINGS addendum and the round-3 handoff both say it twice: "'Closing
 * Blessing' binds to the concluding Birkat Kohanim p.100", "not the page-less
 * Amidah entry". The compiler resolved the name to the Amidah's Birkat
 * Kohanim, which the booklet does not print, and so carried `folio: null` —
 * the exact confusion the ruling was issued to settle. The artifact is left
 * untouched; the correction lives here, named and cited, because a hand-edit
 * of a file labelled "confirmedBy: Daniel" would make the record a lie.
 */
const FOLIO_CORRECTIONS: Record<string, Record<string, number>> = {
    "crc-saturday": { "closing blessing": 100 },
}

export interface ConfirmedBinding {
    /** Every spelling that resolves here — `title` plus its `also` list. */
    spellings: string[]
    /** The moment Daniel named. May carry a parenthetical gloss. */
    bindsTo: string
    /** Printed page in this book. */
    folio: number | null
    /** `clear (default)`, `needs-you (explicit)`, … — his page's own wording. */
    source?: string
}

/** `Adonai S'fatai (Amidah opening; booklet entry 'Sanctuary')` -> `Adonai S'fatai`. */
export function bindsToName(bindsTo: string): string {
    const cut = bindsTo.indexOf("(")
    return (cut > 0 ? bindsTo.slice(0, cut) : bindsTo).trim()
}

function bookOf(book: string): ConfirmedBookJson | undefined {
    return FILE.books?.[book]
}

/** Daniel's confirmed bindings for one book, in his page's order. */
export function confirmedBindings(book: string): ConfirmedBinding[] {
    const entry = bookOf(book)
    if (!entry) return []
    const corrections = FOLIO_CORRECTIONS[book] ?? {}
    return entry.bind.map((b) => {
        const corrected = corrections[foldLiturgyName(b.title)]
        return {
            spellings: [b.title, ...(b.also ?? [])].filter(
                (s): s is string => typeof s === "string" && !!s.trim(),
            ),
            bindsTo: b.bindsTo,
            folio: typeof b.folio === "number" ? b.folio : (corrected ?? null),
            source: b.source,
        }
    })
}

const UNBOUND = new Map<string, Set<string>>()

/** Folded spellings Daniel ruled stay unbound in this book. */
export function confirmedUnbound(book: string): Set<string> {
    const cached = UNBOUND.get(book)
    if (cached) return cached
    const out = new Set<string>()
    for (const row of bookOf(book)?.leaveUnbound ?? []) {
        const folded = foldLiturgyName(row?.title ?? "")
        if (folded) out.add(folded)
    }
    UNBOUND.set(book, out)
    return out
}

/** Books Daniel ruled on. */
export function confirmedBindingBooks(): string[] {
    return Object.keys(FILE.books ?? {})
}

/** Provenance, for anything that reports what it applied. */
export const CONFIRMED_BINDINGS_PROVENANCE = {
    confirmedBy: FILE.confirmedBy,
    confirmedAt: FILE.confirmedAt,
    rule: FILE.rule,
} as const
