import registryJson from "@/data/books/registry.json"
import crcFriday from "@/data/books/crc-friday.json"
import crcSaturday from "@/data/books/crc-saturday.json"
import shabbatMaariv from "@/data/books/shabbat-maariv.json"
import shabbatShacharit from "@/data/books/shabbat-shacharit.json"
import shireiTshuvah from "@/data/books/shirei-tshuvah.json"
import type {
    BookFile,
    BookRegistryEntry,
    LiturgyRef,
    LiturgyRefValidation,
} from "./types"

/**
 * Book files are imported statically (not read from disk at runtime) so they
 * bundle correctly on Vercel serverless and cost nothing per call. Add each
 * new book file to BOOK_FILES as it lands.
 */
const BOOK_FILES: Record<string, BookFile> = {
    "crc-friday": crcFriday as BookFile,
    "crc-saturday": crcSaturday as BookFile,
    "shabbat-maariv": shabbatMaariv as BookFile,
    "shabbat-shacharit": shabbatShacharit as BookFile,
    "shirei-tshuvah": shireiTshuvah as BookFile,
}

const REGISTRY = registryJson as BookRegistryEntry[]

export function listBooks(): BookRegistryEntry[] {
    return REGISTRY
}

export function getBook(slug: string): BookFile | undefined {
    return BOOK_FILES[slug]
}

export function getRegistryEntry(slug: string): BookRegistryEntry | undefined {
    return REGISTRY.find((b) => b.slug === slug)
}

/**
 * Lowest printed page number this book's own data actually reaches.
 *
 * The floor used to be a hardcoded `1` for every book, which made the accepted
 * range of `crc-friday` (its pages run 3–47) a strict SUBSET of `crc-saturday`'s
 * (1–102 under the old floor). The two books share 132 normalized name/alias
 * keys at different pages — hareini is Friday 3 / Saturday 50, barchu is
 * Friday 10 / Saturday 59 — so a Friday page number written under
 * `book: 'crc-saturday'` validated silently and printed on the lectern sheet.
 * The Saturday siddur's own entries start at page 50; deriving the floor from
 * the data rejects the whole Friday range under the Saturday book.
 *
 * Computed once per book and memoized — the book files are static imports, so
 * this is a one-time pass over already-resident data. Falls back to 1 when a
 * book file is absent or carries no page data at all (never tighten a range on
 * missing data — that would block real authoring).
 */
const folioFloorCache = new Map<string, number>()

export function bookFolioFloor(slug: string): number {
    const cached = folioFloorCache.get(slug)
    if (cached !== undefined) return cached
    const book = getBook(slug)
    let min = Infinity
    if (book?.entries) {
        for (const e of book.entries) {
            if (Number.isInteger(e.page)) min = Math.min(min, e.page)
        }
    }
    if (book?.units) {
        for (const u of book.units) {
            for (const f of u.folios) {
                if (Number.isInteger(f)) min = Math.min(min, f)
            }
        }
    }
    const floor = Number.isFinite(min) && min >= 1 ? min : 1
    folioFloorCache.set(slug, floor)
    return floor
}

/**
 * Validate a liturgyRef against the registry before it is written to a track.
 * A wrong page number reaching the rabbi's sheet is the one failure mode this
 * feature cannot afford, so every write goes through here.
 */
export function validateLiturgyRef(ref: LiturgyRef): LiturgyRefValidation {
    const entry = getRegistryEntry(ref.book)
    if (!entry) {
        return {
            ok: false,
            machineCode: "unknown_book",
            message: `Unknown book '${ref.book}'. Known books: ${REGISTRY.map((b) => b.slug).join(", ")}.`,
        }
    }
    const floor = bookFolioFloor(entry.slug)
    if (
        !Number.isInteger(ref.folio) ||
        ref.folio < floor ||
        ref.folio > entry.pages
    ) {
        return {
            ok: false,
            machineCode: "folio_out_of_range",
            // The range in this message is the range that will be ACCEPTED. It
            // used to read "(1–102)" for crc-saturday regardless of the book's
            // real first page, which coached the caller toward re-submitting a
            // Friday page number under the Saturday book.
            message: `Page ${ref.folio} is outside '${entry.slug}' (${floor}–${entry.pages}).`,
        }
    }
    if (ref.unitId) {
        const book = getBook(ref.book)
        const known = book?.units?.some((u) => u.id === ref.unitId)
        if (!known) {
            return {
                ok: false,
                machineCode: "unknown_unit_id",
                message: `Unit '${ref.unitId}' is not in book '${ref.book}'.`,
            }
        }
    }
    return { ok: true }
}
