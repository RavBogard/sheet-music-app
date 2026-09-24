import legacyShabbatEvening from "@/data/books/legacy-shabbat-evening.json"
import legacyShabbatMorning from "@/data/books/legacy-shabbat-morning.json"
import { momentForUnit } from "./moments"
import type { BookFile } from "./types"

/**
 * Audit item 5 (n), second half — the unit ids for the two ordinary-Shabbat
 * booklets.
 *
 * `crc-friday` and `crc-saturday` are pagemaps: they carry the printed page
 * and no unit ids, so a row bound against them never had an identity Overlays
 * could join on. Wave 3 registered the two legacy feeds beside them, and those
 * feeds number their units by the SAME printed booklet pages (`printedFolio`,
 * 80 of 80 agreeing on the pages the two share, W2B/W3). So a feed unit is a
 * true identity for a booklet row whenever both are on the same page and are
 * the same moment.
 *
 * The row keeps `book: 'crc-saturday'` — that is the book in the room, and the
 * page is still the booklet's. Only the `unitId` comes from the companion,
 * and it names its own book in its suffix (`…@legacy-shabbat-morning`).
 *
 * NOTHING IS MATCHED BY NAME HERE. The crosswalk is the moments artifact: a
 * lookup entry's draft-feed unit gives a moment, the moment says which
 * companion unit prints it, and that unit is used only if it prints on the
 * row's own page. Anything else answers null and the row stays page-only,
 * exactly as before.
 */
export const UNIT_COMPANION: Readonly<Record<string, string>> = Object.freeze({
    "crc-friday": "legacy-shabbat-evening",
    "crc-saturday": "legacy-shabbat-morning",
})

const COMPANION_FILES: Record<string, BookFile> = {
    "legacy-shabbat-evening": legacyShabbatEvening as BookFile,
    "legacy-shabbat-morning": legacyShabbatMorning as BookFile,
}

/** The unit-carrying feed that shares this pagemap's printed numbering, or null. */
export function companionOf(book: string | null | undefined): string | null {
    if (!book) return null
    return UNIT_COMPANION[book] ?? null
}

/** True when `unitId` is a companion unit of `book` printed on `folio`. */
export function isCompanionUnit(
    book: string,
    unitId: string | null | undefined,
    folio: number,
): boolean {
    const companion = companionOf(book)
    if (!companion || !unitId) return false
    const unit = COMPANION_FILES[companion]?.units?.find((u) => u.id === unitId)
    return !!unit && unit.folios.includes(folio)
}

/**
 * The companion unit for a row on `folio` of `book` that the caller has
 * identified by `unitId` (usually a draft-feed id from the lookup table), or
 * null when there is no single one.
 */
export function companionUnitFor(
    book: string,
    folio: number | null | undefined,
    unitId: string | null | undefined,
): string | null {
    const companion = companionOf(book)
    if (!companion || typeof folio !== "number" || !unitId) return null
    if (isCompanionUnit(book, unitId, folio)) return unitId
    const moment = momentForUnit(unitId)
    if (!moment) return null
    const onPage = moment.occurrences.filter(
        (o) => o.book === companion && o.folios.includes(folio),
    )
    if (onPage.length !== 1) return null
    return isCompanionUnit(book, onPage[0].unitId, folio) ? onPage[0].unitId : null
}
