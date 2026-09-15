import registryJson from "@/data/books/registry.json"
import crcFriday from "@/data/books/crc-friday.json"
import crcSaturday from "@/data/books/crc-saturday.json"
import crcMachzor2008 from "@/data/books/crc-machzor-2008.json"
import shabbatMaariv from "@/data/books/shabbat-maariv.json"
import shabbatShacharit from "@/data/books/shabbat-shacharit.json"
import shireiTshuvah from "@/data/books/shirei-tshuvah.json"
import { bookServiceFor, SERVICE_SCOPED_BOOKS } from "./machzor-services"
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
    "crc-machzor-2008": crcMachzor2008 as BookFile,
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
const folioRangeCache = new Map<string, { floor: number; ceiling: number | null }>()

/**
 * The printed pages a book — or one service inside a book — actually reaches.
 *
 * `service` narrows it. `crc-machzor-2008` prints six services back to back,
 * and Kol Nidre's pages are 93–127; accepting 38 there is accepting a Rosh
 * Hashanah morning page on a Kol Nidre sheet. The whole-book range stays the
 * answer when no service is named, because that is what an unscoped caller
 * has always meant.
 */
function folioRange(slug: string, service?: string | null): { floor: number; ceiling: number | null } {
    const key = service ? `${slug}|${service}` : slug
    const cached = folioRangeCache.get(key)
    if (cached !== undefined) return cached
    const book = getBook(slug)
    let min = Infinity
    let max = 0
    if (book?.entries) {
        for (const e of book.entries) {
            if (service && e.service !== service) continue
            if (!Number.isInteger(e.page)) continue
            min = Math.min(min, e.page)
            max = Math.max(max, e.page)
        }
    }
    if (book?.units) {
        for (const u of book.units) {
            for (const f of u.folios) {
                if (!Number.isInteger(f)) continue
                min = Math.min(min, f)
                max = Math.max(max, f)
            }
        }
    }
    const range = {
        floor: Number.isFinite(min) && min >= 1 ? min : 1,
        // A service's LAST page is a real ceiling; a book's is not — a printed
        // book continues past its last prayer, and the registry's `pages` is
        // the authority there.
        ceiling: service && max > 0 ? max : null,
    }
    folioRangeCache.set(key, range)
    return range
}

export function bookFolioFloor(slug: string): number {
    return folioRange(slug).floor
}

/**
 * Validate a liturgyRef against the registry before it is written to a track.
 * A wrong page number reaching the rabbi's sheet is the one failure mode this
 * feature cannot afford, so every write goes through here.
 *
 * `service` narrows a book that prints several (`crc-machzor-2008`). Every
 * binding path knows the setlist's service and passes it, which makes the
 * accepted range TIGHTER than it has ever been — a Kol Nidre row may carry
 * 93–127 and nothing else. An unscoped call still gets the whole volume,
 * because that is what it has always meant and there is no caller left to
 * surprise; note that the whole volume now begins at page 1 rather than 38,
 * which is simply true of the book and was only ever an artifact of five
 * services being unmapped.
 */
export function validateLiturgyRef(
    ref: LiturgyRef,
    opts?: { service?: string | null },
): LiturgyRefValidation {
    const entry = getRegistryEntry(ref.book)
    if (!entry) {
        return {
            ok: false,
            machineCode: "unknown_book",
            message: `Unknown book '${ref.book}'. Known books: ${REGISTRY.map((b) => b.slug).join(", ")}.`,
        }
    }
    const service = SERVICE_SCOPED_BOOKS.has(entry.slug) ? (opts?.service ?? null) : null
    const range = folioRange(entry.slug, service)
    const ceiling = range.ceiling ?? entry.pages
    if (
        !Number.isInteger(ref.folio) ||
        ref.folio < range.floor ||
        ref.folio > ceiling
    ) {
        return {
            ok: false,
            machineCode: "folio_out_of_range",
            // The range in this message is the range that will be ACCEPTED. It
            // used to read "(1–102)" for crc-saturday regardless of the book's
            // real first page, which coached the caller toward re-submitting a
            // Friday page number under the Saturday book.
            message: service
                ? `Page ${ref.folio} is outside '${entry.slug}' service '${service}' (${range.floor}–${ceiling}).`
                : `Page ${ref.folio} is outside '${entry.slug}' (${range.floor}–${ceiling}).`,
        }
    }
    if (ref.unitId) {
        const book = getBook(ref.book)
        // A pagemap has no `units`, but a service-scoped one captured the unit
        // id each printed page came from, and that id is the row's only route
        // to a `momentId`. Refusing it would have refused the identity while
        // keeping the page — exactly backwards.
        const known =
            book?.units?.some((u) => u.id === ref.unitId) ||
            book?.entries?.some(
                (e) =>
                    e.unitId === ref.unitId && (!service || e.service === service),
            )
        if (!known) {
            return {
                ok: false,
                machineCode: "unknown_unit_id",
                message: service
                    ? `Unit '${ref.unitId}' is not in book '${ref.book}' service '${service}'.`
                    : `Unit '${ref.unitId}' is not in book '${ref.book}'.`,
            }
        }
    }
    return { ok: true }
}

/** The service a book's pagemap would scope to for this setlist type. */
export function serviceScopeFor(
    book: string | null | undefined,
    templateType: string | null | undefined,
): string | null {
    if (!book || !SERVICE_SCOPED_BOOKS.has(book)) return null
    return bookServiceFor(book, templateType)
}
