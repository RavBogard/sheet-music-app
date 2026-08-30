import { getBook, getRegistryEntry } from "./registry"

export interface BookMatch {
    name: string
    folio: number
    unitId?: string
    confidence: "high" | "medium" | "low"
}

export type LookupResult =
    | { ok: false; machineCode: string; message: string }
    | { ok: true; matches: BookMatch[] }

/** Fold case, strip punctuation/diacritics-ish noise, collapse whitespace. */
function norm(s: string): string {
    return s
        .toLowerCase()
        .replace(/['’`"]/g, "")
        .replace(/[^a-z0-9֐-׿]+/g, " ")
        .trim()
        .replace(/\s+/g, " ")
}

const MAX_MATCHES = 8

/**
 * Resolve a prayer name to printed page number(s) in one book.
 *
 * Exact normalized match on a name or alias → 'high' when it is the only exact
 * hit, 'medium' when several entries match exactly (a book with two settings of
 * the same prayer). Substring matches are 'medium' alone, 'low' when there are
 * several — which is the signal for the caller to stop and ask Daniel rather
 * than guess a page.
 */
export function lookupBookPage(book: string, query: string): LookupResult {
    const entry = getRegistryEntry(book)
    if (!entry) {
        return {
            ok: false,
            machineCode: "unknown_book",
            message: `Unknown book '${book}'. Call list_books for valid slugs.`,
        }
    }
    const file = getBook(book)
    if (!file) {
        return {
            ok: false,
            machineCode: "book_data_missing",
            message: `Book '${book}' is registered but its data file is not loaded.`,
        }
    }

    const q = norm(query)
    if (!q) return { ok: true, matches: [] }

    const exact: BookMatch[] = []
    const partial: BookMatch[] = []

    const consider = (
        name: string,
        candidates: string[],
        folio: number,
        unitId?: string,
    ) => {
        const normed = candidates.map(norm)
        if (normed.some((c) => c === q)) {
            exact.push({ name, folio, unitId, confidence: "high" })
        } else if (normed.some((c) => c.includes(q) || q.includes(c))) {
            partial.push({ name, folio, unitId, confidence: "medium" })
        }
    }

    if (file.tier === "feed") {
        for (const u of file.units ?? []) {
            consider(u.name, [u.name, u.id], u.folios[0], u.id)
        }
    } else {
        for (const e of file.entries ?? []) {
            consider(e.name, [e.name, ...e.aliases], e.page)
        }
    }

    if (exact.length > 1) for (const m of exact) m.confidence = "medium"
    if (exact.length === 0 && partial.length > 1) for (const m of partial) m.confidence = "low"

    return { ok: true, matches: [...exact, ...partial].slice(0, MAX_MATCHES) }
}
