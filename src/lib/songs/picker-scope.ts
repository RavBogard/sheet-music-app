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
import {
    LIBRARY_DISPLAY_ORDER,
    isKnownCollection,
    normalizeCollection,
    type KnownCollection,
} from '@/lib/library/collections'
import type { LocalSong } from '@/lib/local/types'
import { rowOrg } from '@/lib/org/membership'
import { orgString } from '@/lib/org/strings'
import { orgConfigSync } from '@/lib/org/tenant-lists'
import type { OrgId } from '@/lib/org/types'

export type PickerCollection = KnownCollection

/** Library order (multi-tenant phase 1: from the one collection list, collections.ts). */
export const PICKER_COLLECTIONS: readonly PickerCollection[] = LIBRARY_DISPLAY_ORDER

export { normalizeCollection }

const HIDDEN_STATUSES = new Set(['archived', 'duplicate', 'orphaned'])

/** What collectionLabel returned before phase 1; still the answer for a collection the tenant does not list. */
function unlistedCollectionLabel(org: OrgId, c: PickerCollection): string {
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

/**
 * Same labels as the library page (SongChartsLibrary / SearchOverlay): the
 * tenant's `library.collections` label, else the pre-phase-1 label.
 */
export function collectionLabel(org: OrgId, c: PickerCollection): string {
    return orgConfigSync(org).library.collections.find((x) => x.id === c)?.label ?? unlistedCollectionLabel(org, c)
}

/**
 * The library page's section tabs, in the tenant's order: its configured
 * collections that the code knows (phase 5 adds per-tenant collections).
 */
export function librarySections(org: OrgId): Array<{ id: PickerCollection; label: string }> {
    const out: Array<{ id: PickerCollection; label: string }> = []
    for (const c of orgConfigSync(org).library.collections) {
        if (isKnownCollection(c.id) && !out.some((x) => x.id === c.id)) out.push({ id: c.id, label: c.label })
    }
    return out
}

/** The collection a picker opens on (`library.defaultCollection`; "" = everything). */
export function defaultPickerCollection(org: OrgId): PickerCollection | null {
    const d = orgConfigSync(org).library.defaultCollection
    return isKnownCollection(d) ? d : null
}

/**
 * The core section's name on the surfaces that were never tenant-aware
 * (search overlay toggle, upload and scraper section pickers). A tenant that
 * overrides `library.coreSectionLabel` (BL: frozen "CRC Charts") gets that;
 * every other tenant gets its configured core label, so CRC stays "CRC Charts".
 */
export function coreSectionLabel(org: OrgId): string {
    return orgConfigSync(org).vocabulary.overrides['library.coreSectionLabel'] !== undefined
        ? orgString(org, 'library.coreSectionLabel')
        : collectionLabel(org, 'core')
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
