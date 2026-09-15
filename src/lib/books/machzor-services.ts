/**
 * The printed 2008 machzor, split into the services it prints.
 *
 * ONE PRINTED VOLUME, SIX SERVICES. `.live` registers `crc-machzor-2008` as a
 * single book, because a book is a physical object you hold. The volume prints
 * six services back to back — Erev Rosh Hashanah pp.1–37, Rosh Hashanah
 * morning 38–92, Kol Nidre 93–127, Yom Kippur morning 128–178, Yizkor 179–185,
 * Neilah 187–215 — and 49 prayer names repeat across them. Bar'chu alone
 * prints at 9, 45, 100 and 136.
 *
 * That repetition is why the book was registered for Rosh Hashanah morning
 * only in September: a pagemap keyed on bare names would have resolved one
 * name to four pages, which is the silent-wrong-page failure the whole book
 * layer exists to prevent. The answer is not fewer pages, it is SCOPE. A
 * setlist always knows which service it is, and within one service every name
 * resolves to exactly one page.
 *
 * THE KEY IS THE SETLIST'S `templateType`. The same table already serves
 * `readerBookFor` (R2-e), where Daniel gave the design fact behind it: the
 * reader deliberately shelves this one printed volume as per-service volumes,
 * because a davener is davening from exactly one service. The service slugs
 * below ARE those reader volumes — one table, one vocabulary, so a service can
 * never be scoped one way for pages and another way for the reader.
 */

const BY_TEMPLATE_TYPE: Readonly<Record<string, string>> = Object.freeze({
    "erev-rosh-hashanah": "crc-erev-rh",
    "rosh-hashanah-evening": "crc-erev-rh",
    rosh_hashanah_evening: "crc-erev-rh",
    "rosh-hashanah-morning": "crc-rh-morning",
    "rosh-hashanah-day": "crc-rh-morning",
    rosh_hashanah_morning: "crc-rh-morning",
    "kol-nidre": "crc-kol-nidre",
    "kol-nidre-alt": "crc-kol-nidre",
    yom_kippur_kol_nidre: "crc-kol-nidre",
    "yom-kippur-morning": "crc-yk-morning",
    yom_kippur_morning: "crc-yk-morning",
    yizkor: "crc-yizkor",
    neilah: "crc-neilah",
    yom_kippur_afternoon: "crc-neilah",
})

/** Books whose pagemap entries are scoped to a service. */
export const SERVICE_SCOPED_BOOKS: ReadonlySet<string> = new Set(["crc-machzor-2008"])

/**
 * What a name means when nobody said which service.
 *
 * Rosh Hashanah morning, which is what this book meant for its whole life
 * before the other five services were mapped. Keeping that as the default is
 * the difference between adding 152 pages and changing the answer to a
 * question something already asked.
 */
export const DEFAULT_SERVICE: Readonly<Record<string, string>> = Object.freeze({
    "crc-machzor-2008": "crc-rh-morning",
})

/** The service a setlist's `templateType` names, or null when it names none. */
export function machzorServiceFor(
    templateType: string | null | undefined,
): string | null {
    if (!templateType) return null
    return BY_TEMPLATE_TYPE[templateType] ?? null
}

/**
 * The service to scope a lookup in `book` to, for a setlist of this type.
 *
 * Null means "do not scope" — either the book is not service-scoped, or it is
 * and the service is unknown, in which case the caller falls back to
 * `DEFAULT_SERVICE` rather than searching the whole volume. Searching the
 * whole volume is the one answer never given here.
 */
export function bookServiceFor(
    book: string | null | undefined,
    templateType: string | null | undefined,
): string | null {
    if (!book || !SERVICE_SCOPED_BOOKS.has(book)) return null
    return machzorServiceFor(templateType) ?? DEFAULT_SERVICE[book] ?? null
}

/** Every service slug this table can name. For tests and for error messages. */
export function machzorServices(): string[] {
    return [...new Set(Object.values(BY_TEMPLATE_TYPE))].sort()
}

/** Every `templateType` spelling that reaches a service. */
export function machzorTemplateTypes(): string[] {
    return Object.keys(BY_TEMPLATE_TYPE)
}
