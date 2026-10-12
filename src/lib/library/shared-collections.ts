/**
 * Multi-tenant phase 5 — shared collections on the browser surfaces (pure:
 * no Firestore, no React).
 *
 * A tenant's own charts come first, exactly as before. Every collection
 * another tenant shares with it is an opt-in chip, off until the user turns
 * it on, remembered per user and tenant. Shared rows can be picked into a
 * setlist (bound by fileId as usual) but never changed.
 *
 * The one exception (ruling R-1012-mt-6): a tenant section that has always
 * been fed by a collection id now owned elsewhere — CRC's "Nava Tehilah"
 * tab, after the 140 `nava` rows move to Nava Tehila — loads those rows by
 * visibility, with no chip, so the tab is identical before and after.
 */
import { normalizeCollection, type KnownCollection } from '@/lib/library/collections'
import { isOwnedBy, visibleTo, collectionIdOf } from '@/lib/library/visibility'
import { isJunkLibraryRow } from '@/lib/library/junk-filter'
import { peekOrgConfig } from '@/lib/org/config-cache'
import { codeOrgConfig } from '@/lib/org/config-code'
import { librarySections, isHiddenStatus } from '@/lib/songs/picker-scope'
import type { OrgId } from '@/lib/org/types'
import type { DriveFile } from '@/types/models'

/**
 * The only collection that keeps feeding a tenant section by visibility.
 * Listed explicitly so a collection shared under a generic name (core,
 * uploads) can never slip into another tenant's own tabs without a chip.
 */
export const VISIBILITY_SECTION_COLLECTIONS: readonly KnownCollection[] = ['nava']

/** New copy, in one place so phase 7 can route it through t(). English only. */
export const SHARED_COPY = {
    chipGroupLabel: 'Shared collections',
    sharedHeading: 'Shared',
    fromOwner: (owner: string) => `From ${owner}`,
    readOnly: (owner: string) => `Shared from ${owner}. You can use it but not change it.`,
    chipAria: (label: string, owner: string) => `Show ${label} from ${owner}`,
    loadFailed: 'Could not load shared charts.',
} as const

/** A `collections/{id}` record as the browser reads it. */
export interface SharedCollection {
    id: string
    ownerOrgId: string
    name: string
    label: string
}

/** A library_index row shared with this tenant (another tenant owns it). */
export type SharedFile = DriveFile & {
    orgId: string
    collectionId: string
    visibleToOrgs: string[]
    status?: string
}

/** A shared row's title the way own song rows carry it: display name, else file name without extension. */
export function sharedTitle(f: { name: string; displayName?: string }): string {
    return (f.displayName || f.name.replace(/\.(pdf|musicxml|xml|mxl|chordpro|txt)$/i, '')).trim()
}

/** Collection ids (legacy `collection` values) the tenant's own sections load by visibility. */
export function visibilitySectionsFor(org: OrgId): KnownCollection[] {
    const listed = new Set(librarySections(org).map((s) => s.id))
    return VISIBILITY_SECTION_COLLECTIONS.filter((c) => listed.has(c))
}

/** Shared (not owned) but shown in one of the tenant's own sections, no chip. */
export function isVisibilitySectionRow(
    row: { orgId?: unknown; visibleToOrgs?: unknown; collection?: unknown },
    org: OrgId,
): boolean {
    if (isOwnedBy(row, org) || !visibleTo(row, org)) return false
    if (typeof row.collection !== 'string') return false
    return visibilitySectionsFor(org).includes(normalizeCollection(row.collection))
}

/** A shared row a picker may offer: visible, not owned, not hidden, not junk. */
export function isSharedPickable(
    row: { orgId?: unknown; visibleToOrgs?: unknown; status?: unknown; title?: unknown; name?: unknown; mimeType?: unknown },
    org: OrgId,
): boolean {
    if (isOwnedBy(row, org) || !visibleTo(row, org)) return false
    if (isHiddenStatus(row.status)) return false
    const name = typeof row.title === 'string' ? row.title : typeof row.name === 'string' ? row.name : ''
    return !isJunkLibraryRow({ name, status: row.status as string | undefined, mimeType: row.mimeType as string | undefined })
}

/**
 * The chips to offer: records owned by another tenant, minus any whose rows
 * already show in one of this tenant's own sections. Sorted by label.
 */
export function chipCollections(records: SharedCollection[], org: OrgId): SharedCollection[] {
    const sectionNames = new Set<string>(visibilitySectionsFor(org))
    const seen = new Set<string>()
    const out: SharedCollection[] = []
    for (const r of records) {
        if (!r.id || r.ownerOrgId === org || seen.has(r.id)) continue
        if (sectionNames.has(r.name)) continue
        seen.add(r.id)
        out.push(r)
    }
    return out.sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id))
}

/** Shared rows of the switched-on chips, alphabetical. */
export function rowsForChips(rows: SharedFile[], onIds: ReadonlySet<string>, org: OrgId): SharedFile[] {
    if (onIds.size === 0) return []
    return rows
        .filter((r) => onIds.has(collectionIdOf(r)) && isSharedPickable(r, org))
        .sort((a, b) => sharedTitle(a).localeCompare(sharedTitle(b)) || a.id.localeCompare(b.id))
}

/** Rows that feed the tenant's own sections by visibility (CRC's nava tab). */
export function sectionRows(rows: SharedFile[], org: OrgId): SharedFile[] {
    return rows.filter((r) => isVisibilitySectionRow(r, org) && r.status !== 'archived')
}

/** The owner's short name for "From …" labels; the id when nothing better is known. */
export function ownerShortName(orgId: string, fetched?: ReadonlyMap<string, string>): string {
    const cfg = peekOrgConfig(orgId) ?? codeOrgConfig(orgId)
    return cfg?.branding.shortName || fetched?.get(orgId) || orgId
}

// ── Chip memory (per user and tenant) ──

export function chipPrefsKey(uid: string | null | undefined, org: OrgId): string {
    return `sharedChips.v1:${uid ?? 'anon'}:${org}`
}

export function readChipPrefs(uid: string | null | undefined, org: OrgId): Set<string> {
    try {
        const raw = globalThis.localStorage?.getItem(chipPrefsKey(uid, org))
        const parsed: unknown = raw ? JSON.parse(raw) : []
        return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [])
    } catch {
        return new Set()
    }
}

export function writeChipPrefs(uid: string | null | undefined, org: OrgId, on: ReadonlySet<string>): void {
    try {
        globalThis.localStorage?.setItem(chipPrefsKey(uid, org), JSON.stringify([...on].sort()))
    } catch {
        /* private mode / blocked storage: the chip still works for this visit */
    }
}
