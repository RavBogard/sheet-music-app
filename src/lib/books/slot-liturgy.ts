import { validateLiturgyRef } from "./registry"
import type { LiturgyRef } from "./types"

/**
 * A template slot's per-book liturgy references.
 *
 * A fixed-liturgy row ("Bar'chu", "Hashkiveinu") sits at a different printed
 * page in every book the congregation uses — p.10 in `crc-friday`, p.14 in
 * `shabbat-maariv`. The template therefore cannot carry one `liturgyRef`; it
 * carries one PER BOOK, keyed by book slug, and the clone resolves the entry
 * for whichever book the new setlist is being built against.
 *
 * Keys are book slugs from the registry (`list_books`). Values omit `book`
 * because the key already says it.
 */
export type SlotLiturgyRefs = Record<
    string,
    { unitId?: string; folio: number }
>

export type SlotLiturgyResolution =
    | { status: "resolved"; ref: LiturgyRef }
    /** The slot carries refs, but none for this book — the caller writes no ref. */
    | { status: "unresolved" }
    /** The slot's ref for this book is not valid against the registry. */
    | { status: "invalid"; machineCode: string; message: string }

/**
 * Resolve a slot's per-book refs into the single `liturgyRef` a track carries.
 *
 * Every resolved ref goes through `validateLiturgyRef` before it is returned:
 * a fixed-liturgy page number prints on the rabbi's lectern sheet, and a
 * template is exactly the place a wrong one would live for years unnoticed.
 */
export function resolveSlotLiturgyRef(
    refs: SlotLiturgyRefs | undefined | null,
    book: string | undefined | null,
): SlotLiturgyResolution {
    if (!refs || typeof refs !== "object") return { status: "unresolved" }
    if (!book || typeof book !== "string") return { status: "unresolved" }
    const entry = refs[book]
    if (!entry || typeof entry !== "object") return { status: "unresolved" }

    const ref: LiturgyRef = { book, folio: entry.folio }
    if (entry.unitId) ref.unitId = entry.unitId

    const check = validateLiturgyRef(ref)
    if (!check.ok) {
        return {
            status: "invalid",
            machineCode: check.machineCode,
            message: check.message,
        }
    }
    return { status: "resolved", ref }
}
