/**
 * What a chart picker offers on this site (David's ask 2, 2026-09-22).
 *
 * Three rules, all pure so they can be tested without Dexie or React:
 *
 *   1. The HOST org decides. A picker on brotherslazaroff.live offers that
 *      tenant's charts, whatever the signed-in account may also be allowed to
 *      see — nearly every account belongs to both tenants, so membership
 *      never narrowed the list. Rows with no orgId are crc (rowOrg).
 *   2. Hidden rows stay hidden: archived, duplicate, orphaned, and the
 *      non-chart junk the library already filters.
 *   3. Collections come from the library listing (songs/* does not carry
 *      one). CRC opens on core; the chips use the library page's own labels,
 *      so "Shireinu" means `supplemental` on both surfaces. A row the listing
 *      does not know yet (a fresh upload) is shown under every chip rather
 *      than hidden.
 */
import { isJunkLibraryRow } from '@/lib/library/junk-filter'
import type { LocalSong } from '@/lib/local/types'
import { rowOrg } from '@/lib/org/membership'
import type { OrgId } from '@/lib/org/types'

export type PickerCollection = 'core' | 'supplemental' | 'nava' | 'uploads'

export const PICKER_COLLECTIONS: readonly PickerCollection[] = ['core', 'supplemental', 'nava', 'uploads']

const HIDDEN_STATUSES = new Set(['archived', 'duplicate', 'orphaned'])

/** Same labels as the library page (SongChartsLibrary / SearchOverlay). */
export function collectionLabel(org: OrgId, c: PickerCollection): string {
    switch (c) {
        case 'core':
            return org === 'crc' ? 'CRC Charts' : 'Charts'
        case 'supplemental':
            return 'Shireinu'
        case 'nava':
            return 'Nava Tehilah'
        case 'uploads':
            return 'Uploads'
    }
}

/** The collection a picker opens on. */
export function defaultPickerCollection(org: OrgId): PickerCollection | null {
    return org === 'crc' ? 'core' : null
}

/** library_index semantics: anything not supplemental/nava/uploads is core. */
export function normalizeCollection(raw: unknown): PickerCollection {
    return raw === 'supplemental' || raw === 'nava' || raw === 'uploads' ? raw : 'core'
}

export function isHiddenStatus(status: unknown): boolean {
    return typeof status === 'string' && HIDDEN_STATUSES.has(status)
}

export function isPickableFor(s: LocalSong, org: OrgId): boolean {
    if (rowOrg(s.orgId) !== org) return false
    if (isHiddenStatus(s.status)) return false
    return !isJunkLibraryRow({ name: s.title, status: s.status })
}

/**
 * Chips to show: the collections this site's pickable rows actually use,
 * in library order. Fewer than two is no choice at all, so none are shown.
 */
export function chipsFor(
    songs: LocalSong[],
    collectionById: Map<string, PickerCollection>,
): PickerCollection[] {
    if (collectionById.size === 0) return []
    const seen = new Set<PickerCollection>()
    for (const s of songs) {
        const c = collectionById.get(s.id)
        if (c) seen.add(c)
    }
    const present = PICKER_COLLECTIONS.filter((c) => seen.has(c))
    return present.length >= 2 ? present : []
}

export function inCollection(
    s: { id: string },
    active: PickerCollection | null,
    collectionById: Map<string, PickerCollection>,
): boolean {
    if (!active) return true
    const c = collectionById.get(s.id)
    return c === undefined || c === active
}
