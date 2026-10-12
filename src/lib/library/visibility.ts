/**
 * LANE 1 OWNS THIS FILE (multi-tenant phase 5). Lane 2 created it only
 * because lane 1's copy had not merged yet; at merge, keep lane 1's
 * implementation. These are the contract's signatures:
 *
 *   visibleTo(row, orgId)  — owner, or orgId is in row.visibleToOrgs
 *   isOwnedBy(row, orgId)  — rowOrg(row.orgId) === orgId (no orgId = crc)
 *   collectionIdOf(row)    — row.collectionId, else `${owner}__${collection}`
 *
 * Reads use visibleTo; writes stay on isOwnedBy. Pure and client-safe.
 */
import { normalizeCollection } from '@/lib/library/collections'
import { rowOrg } from '@/lib/org/membership'

export interface VisibilityRow {
    orgId?: unknown
    visibleToOrgs?: unknown
    collection?: unknown
    collectionId?: unknown
}

export function isOwnedBy(row: VisibilityRow, orgId: string): boolean {
    return rowOrg(row.orgId) === orgId
}

export function visibleTo(row: VisibilityRow, orgId: string): boolean {
    if (isOwnedBy(row, orgId)) return true
    return Array.isArray(row.visibleToOrgs) && row.visibleToOrgs.includes(orgId)
}

export function collectionIdOf(row: VisibilityRow): string {
    if (typeof row.collectionId === 'string' && row.collectionId.length > 0) return row.collectionId
    return `${rowOrg(row.orgId)}__${normalizeCollection(row.collection)}`
}
