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
    if (!Number.isInteger(ref.folio) || ref.folio < 1 || ref.folio > entry.pages) {
        return {
            ok: false,
            machineCode: "folio_out_of_range",
            message: `Page ${ref.folio} is outside '${entry.slug}' (1–${entry.pages}).`,
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
