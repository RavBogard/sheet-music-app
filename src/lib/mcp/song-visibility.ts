/**
 * Multi-tenant phase 5: the visibility fields (orgId, collection, collectionId,
 * visibleToOrgs, libraryOrgs) of the `songs/{id}` doc a SongRecord was built
 * from, kept OFF the SongRecord wire shape. server-songs.ts records them as it
 * builds each record; readers ask songVisibilityOf(record). Keyed by the record
 * object, so a spread copy (`{ ...rec }`) does not carry it, and a record this
 * module never saw (e.g. a test double) falls back to its `orgId` — exactly the
 * owner-only meaning every row had before phase 5.
 */
import type { VisibilityRow } from "@/lib/library/visibility"

interface HasOrg {
    orgId?: string
}

const SONG_VISIBILITY = new WeakMap<object, VisibilityRow>()

/** Pick the visibility fields off a raw songs / library_index doc. */
export function visibilityFieldsOf(data: Record<string, unknown>): VisibilityRow {
    return {
        orgId: data.orgId,
        collection: data.collection,
        collectionId: data.collectionId,
        visibleToOrgs: data.visibleToOrgs,
        libraryOrgs: data.libraryOrgs,
    }
}

/** Record the songs doc's visibility fields for a freshly built record. */
export function rememberSongVisibility(rec: object, data: Record<string, unknown>): void {
    SONG_VISIBILITY.set(rec, visibilityFieldsOf(data))
}

/** The songs doc's visibility fields for a record (owner-only fallback). */
export function songVisibilityOf(rec: HasOrg): VisibilityRow {
    return SONG_VISIBILITY.get(rec) ?? { orgId: rec.orgId }
}
