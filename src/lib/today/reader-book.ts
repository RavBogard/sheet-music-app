/**
 * R2-e — the book-slug crosswalk, `.live` book + serviceType -> reader volume.
 *
 * Daniel, 2026-09-15, giving the design fact behind the vocabulary gap: the
 * reader deliberately splits the ONE printed 2008 machzor into per-service
 * volumes, because a davener on the app is davening from exactly one service;
 * `.live` registers the whole printed volume as one book, because a book is a
 * physical object you hold. Neither is wrong. They are two true descriptions
 * of the same paper, and the mapping between them is the missing sentence.
 *
 * So this is not a workaround for a mismatch. It is the correct mapping —
 * (book, serviceType) -> reader volume — and it belongs eventually in
 * `moments.json` as book-level identity. Until then it lives here, small and
 * explicit, next to the emitter that needs it.
 *
 * WHAT IT MAY NEVER DO. Name a draft. `shabbat-maariv` and `shabbat-shacharit`
 * are alpha drafts (Ruling 8) and the only two slugs both sides already share,
 * which makes them the easy wrong answer to the vocabulary gap. They are
 * absent from this table on purpose, and the reader guards for them again on
 * its own side.
 *
 * ADDITIVE ONLY. `readerBook` sits beside `book`, never replacing it. The
 * reader's `calFrom()` parses the old shape unchanged and consults
 * `readerBook` only when `book` is off its shelf. Nothing about folio
 * semantics changes: the page still comes from the legacy booklet.
 */

import {
    machzorServiceFor,
    machzorServices,
} from "@/lib/books/machzor-services"

/** Books that map to one reader volume whatever the service is. */
const BY_BOOK: Readonly<Record<string, string>> = Object.freeze({
    "crc-friday": "legacy-shabbat-evening",
    "crc-saturday": "legacy-shabbat-morning",
})

/**
 * The reader's volume for a service, or null when there is nothing honest to
 * say. Null is a normal answer: the reader then falls back exactly as it does
 * for a service with no `readerBook` at all.
 */
export function readerBookFor(
    book: string | null | undefined,
    serviceType: string | null | undefined,
): string | null {
    if (!book) return null
    const direct = BY_BOOK[book]
    if (direct) return direct
    if (book !== "crc-machzor-2008") return null
    // One table, shared with the page scoping (`@/lib/books/machzor-services`):
    // the reader's per-service volumes and the pagemap's services are the same
    // six divisions of the same printed book, so they cannot be allowed to
    // drift apart.
    return machzorServiceFor(serviceType)
}

/** Every reader volume this table can name. Exported for the tests' benefit. */
export function readerBookTargets(): string[] {
    return [
        ...new Set([...Object.values(BY_BOOK), ...machzorServices()]),
    ].sort()
}
