import { getBook, getRegistryEntry } from "./registry"
import { momentIdForUnit } from "./moments"

export interface BookMatch {
    name: string
    folio: number
    unitId?: string
    /**
     * The liturgical MOMENT this unit belongs to, when the moments artifact
     * knows it (feed-tier books only). Pass it through to a caller that may
     * later re-resolve the row into a different book: the unit id is
     * book-local, the moment id is not. Absent when the artifact has not been
     * synced or does not cover this unit — never a reason to refuse a page.
     */
    momentId?: string
    confidence: "high" | "medium" | "low"
}

export type LookupResult =
    | { ok: false; machineCode: string; message: string }
    | { ok: true; matches: BookMatch[]; totalMatches: number; truncated: boolean }

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
 * hit. Several exact hits are only safe to commit when they all land on the
 * same folio (two settings of the same prayer printed at the same spot); if
 * they disagree on folio, every one of them drops to 'low' — that's genuine
 * ambiguity a silent commit could turn into a wrong page on a lectern sheet.
 * Substring matches are 'medium' alone, 'low' when there are several — which
 * is the signal for the caller to stop and ask Daniel rather than guess a page.
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
    if (!q) return { ok: true, matches: [], totalMatches: 0, truncated: false }

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
        for (const m of [...exact, ...partial]) {
            const momentId = momentIdForUnit(m.unitId)
            if (momentId) m.momentId = momentId
        }
    } else {
        for (const e of file.entries ?? []) {
            consider(e.name, [e.name, ...e.aliases], e.page)
        }
    }

    if (exact.length > 1) {
        const distinctFolios = new Set(exact.map((m) => m.folio)).size
        const resolved = distinctFolios > 1 ? "low" : "high"
        for (const m of exact) m.confidence = resolved
    }
    if (exact.length === 0 && partial.length > 1) for (const m of partial) m.confidence = "low"

    exact.sort((a, b) => a.folio - b.folio)
    partial.sort((a, b) => a.folio - b.folio)

    const all = [...exact, ...partial]
    const totalMatches = all.length
    return {
        ok: true,
        matches: all.slice(0, MAX_MATCHES),
        totalMatches,
        truncated: totalMatches > MAX_MATCHES,
    }
}
