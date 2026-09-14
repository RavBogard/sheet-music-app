import momentsJson from "@/data/books/moments.json"

/**
 * Liturgical MOMENTS — the layer above unit ids.
 *
 * A unit id is book-local: `shma.mi-chamocha@shabbat-maariv` names Mi Chamocha
 * *in the Friday-night volume*. A MOMENT is the prayer itself, gathering every
 * book that prints it, keyed on the unit-id stem. That is the join that lets a
 * setlist survive a change of book — the same row that read p.28 in
 * `shabbat-maariv` can be re-resolved to its page in `shirei-tshuvah` without
 * anyone re-typing a folio.
 *
 * The data is produced in shireishabbat (`build/tools/emit_moments.py`), trimmed
 * and pin-checked into `src/data/books/moments.json` by `npm run sync:books`.
 * NO LITURGICAL TEXT: ids, display names, kinds and printed pages only.
 *
 * The committed file starts EMPTY, on purpose. The artifact is gitignored in
 * the producing repo and only exists after a build there, so every accessor
 * below answers `null`/`[]` until the real data lands — callers must already
 * handle "this unit has no moment", because most legacy rows never will.
 */

export interface MomentOccurrence {
    /** Registry slug of a book this moment is printed in. */
    book: string
    /** The book-local AR-3 unit id. */
    unitId: string
    /** Printed pages this moment spans in that book, ascending. */
    folios: number[]
}

export interface Moment {
    /** Stable stem, e.g. 'mi-chamocha'. */
    id: string
    display: { en: string }
    /** 'prayer', 'reading', … or null when the producer did not classify it. */
    kind: string | null
    aliases: string[]
    occurrences: MomentOccurrence[]
}

export interface MomentsFile {
    schemaVersion: number
    builtAt: string | null
    sources: Array<{ book: string; gitSha: string | null; pinValue: string | null }>
    moments: Moment[]
}

const FILE = momentsJson as MomentsFile

/**
 * Indexes are built once at module load from a static import — the same posture
 * as `registry.ts`, and for the same reason: this has to cost nothing per call
 * on a serverless invocation, and must not depend on another repo at runtime.
 */
const byId = new Map<string, Moment>()
const byUnitId = new Map<string, Moment>()
for (const m of FILE.moments ?? []) {
    byId.set(m.id, m)
    for (const o of m.occurrences ?? []) byUnitId.set(o.unitId, m)
}

/** Every moment this repo knows about. */
export function listMoments(): Moment[] {
    return FILE.moments ?? []
}

/** True once a real artifact has been synced in. */
export function momentsLoaded(): boolean {
    return byId.size > 0
}

/** The moment a feed-tier unit belongs to, or null when it has none. */
export function momentForUnit(unitId: string | undefined | null): Moment | null {
    if (!unitId) return null
    return byUnitId.get(unitId) ?? null
}

/** Just the id — the common case, and what a `liturgyRef` would carry. */
export function momentIdForUnit(unitId: string | undefined | null): string | null {
    return momentForUnit(unitId)?.id ?? null
}

export function getMoment(momentId: string | undefined | null): Moment | null {
    if (!momentId) return null
    return byId.get(momentId) ?? null
}

/**
 * Where a moment is printed, optionally narrowed to one book.
 *
 * This is the re-resolve primitive: given the moment a row is about and the
 * book the service has just switched to, it answers "and what page is that in
 * the new book?" — or an empty array, which the caller must treat as "leave the
 * row alone and report it", never as "clear the page".
 */
export function occurrencesForMoment(
    momentId: string | undefined | null,
    book?: string,
): MomentOccurrence[] {
    const moment = getMoment(momentId)
    if (!moment) return []
    if (!book) return moment.occurrences
    return moment.occurrences.filter((o) => o.book === book)
}
