/**
 * Multi-tenant phase 1 — the ONE list of library collections the code knows.
 *
 * A row's `library_index.collection` is one of these. Upload validation, the
 * admin edit route, the MCP schemas, the AI prompt schema and the picker all
 * read this list, so they cannot disagree. Which of them a tenant shows, in
 * what order and under what name, is tenant config (`library.collections`);
 * phase 5 adds per-tenant collections on top of this list.
 *
 * The order is the storage/validation order every allow-list and error
 * message has always used. The library page's display order is
 * LIBRARY_DISPLAY_ORDER. Pure: no Firestore, no React.
 */
export const KNOWN_COLLECTIONS = ["core", "supplemental", "uploads", "nava"] as const

export type KnownCollection = (typeof KNOWN_COLLECTIONS)[number]

export function isKnownCollection(value: unknown): value is KnownCollection {
    return typeof value === "string" && (KNOWN_COLLECTIONS as readonly string[]).includes(value)
}

/** Library page / picker order: core, supplemental, nava, uploads. */
export const LIBRARY_DISPLAY_ORDER = ["core", "supplemental", "nava", "uploads"] as const satisfies readonly KnownCollection[]

/** library_index semantics: anything not supplemental/nava/uploads is core. */
export function normalizeCollection(raw: unknown): KnownCollection {
    return isKnownCollection(raw) ? raw : "core"
}
