/**
 * Liturgy book registry types.
 *
 * Two tiers of book:
 *  - 'feed'    — generated from the shireishabbat Typst pipeline's JSON feed.
 *                Units carry stable AR-3 ids (`section.unit@occasion-service`)
 *                and printed folio numbers.
 *  - 'pagemap' — legacy books with no structured source. A hand-verified list
 *                of {name, aliases, page} entries, checked once against the
 *                printed book by Daniel.
 *
 * Both tiers answer the same question: "what printed page is this prayer on?"
 */

export interface BookRegistryEntry {
    /** Stable slug used by Setlist.book and SetlistTrack.liturgyRef.book. */
    slug: string
    /** Human-readable name shown on the rabbi sheet and in list_books. */
    title: string
    tier: "feed" | "pagemap"
    /** Highest printed page number in the book; upper bound for folio validation. */
    pages: number
    /** Where this data came from (feed filename, or the source PDF url). */
    source: string
}

/** A prayer/liturgical moment in a feed-tier book. */
export interface BookUnit {
    /** AR-3 stable id, e.g. 'shma.mi-chamocha@rh-shacharit'. */
    id: string
    /** Display name, e.g. 'Mi Chamocha'. */
    name: string
    /** Printed page numbers this unit spans, ascending. */
    folios: number[]
}

/** A prayer entry in a pagemap-tier book. */
export interface PageMapEntry {
    /** Display name as printed in the book, e.g. 'Mi Chamocha'. */
    name: string
    /** Alternate spellings/transliterations that should match this entry. */
    aliases: string[]
    /** Printed page number. */
    page: number
}

export interface BookFile {
    slug: string
    title: string
    tier: "feed" | "pagemap"
    pages: number
    /** Feed tier only. */
    units?: BookUnit[]
    /** Pagemap tier only. */
    entries?: PageMapEntry[]
}

/** A track's reference into a liturgy book. Mirrors SetlistTrack.liturgyRef. */
export interface LiturgyRef {
    book: string
    unitId?: string
    folio: number
}

export type LiturgyRefValidation =
    | { ok: true }
    | { ok: false; machineCode: string; message: string }
