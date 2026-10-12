/**
 * Multi-tenant phase 5 — who can see a chart row. PURE and client-safe: no
 * Firestore, no React, no firebase-admin. The browser (pickers, library page),
 * the server routes, MCP and the rules tests all decide with these functions.
 *
 * A chart row is a `library_index/{fileId}` or `songs/{fileId}` document. Phase 5
 * gives both:
 *   - `collectionId`  the collection record it belongs to (`collections/{id}`);
 *                     absent on rows not yet stamped → collectionIdOf() derives it.
 *   - `visibleToOrgs` every tenant that may READ it: the owner (`orgId`) plus
 *                     every tenant its collection is shared with or assigned to.
 *   - `libraryOrgs`   the tenants whose OWN library shows it by default: the owner
 *                     plus every tenant the platform owner ASSIGNED the collection
 *                     to. Rows a tenant can merely see (shared, not assigned) are
 *                     opt-in (a picker chip, MCP `includeShared: true`).
 * Absent fields mean "owner only" — exactly what every row meant before phase 5.
 *
 * Reads use VISIBLE (visibleTo / inLibraryOf); writes use OWNS (isOwnedBy).
 *
 * Query contract for the browser (lane 2), with today's own-tenant queries
 * unchanged:
 *   own rows     songs / library_index where orgId == <org>              (as today)
 *   shared rows  songs / library_index where visibleToOrgs array-contains <org>,
 *                then keep rows with orgId != <org> (isOwnedBy false).
 *   classify     inLibraryOf(row, org) → part of the tenant's library (show by
 *                default, under its legacy `collection` tab, e.g. CRC's "Nava
 *                Tehilah" tab after the nava move); otherwise a shared row,
 *                behind the opt-in chip for collectionIdOf(row).
 * firestore.rules allows the array-contains query for a member (not pending) of
 * <org>; unfiltered queries stay refused.
 */
import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"
import { normalizeCollection } from "@/lib/library/collections"

/** The fields this module reads. Every one is optional (pre-phase-5 rows). */
export interface VisibilityRow {
    orgId?: unknown
    collection?: unknown
    collectionId?: unknown
    visibleToOrgs?: unknown
    libraryOrgs?: unknown
}

/** Row's owning tenant; missing/empty is crc (the pre-multi-tenant meaning). */
export function ownerOf(row: VisibilityRow | null | undefined): OrgId {
    const o = row?.orgId
    return typeof o === "string" && o ? o : DEFAULT_ORG_ID
}

const orgList = (v: unknown): OrgId[] | null =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0) : null

/** OWNS: the tenant may change this row (writes, deletes, byte replacements). */
export function isOwnedBy(row: VisibilityRow | null | undefined, orgId: OrgId): boolean {
    return ownerOf(row) === orgId
}

/** VISIBLE: the tenant may read and use this row (search, bind, download). */
export function visibleTo(row: VisibilityRow | null | undefined, orgId: OrgId): boolean {
    if (isOwnedBy(row, orgId)) return true
    const v = orgList(row?.visibleToOrgs)
    return v !== null && v.includes(orgId)
}

/**
 * IN LIBRARY: the tenant's default views (library tabs, pickers, MCP without
 * includeShared) show this row. Owner, or a tenant the collection is assigned
 * to. Always a subset of visibleTo.
 */
export function inLibraryOf(row: VisibilityRow | null | undefined, orgId: OrgId): boolean {
    if (isOwnedBy(row, orgId)) return true
    const l = orgList(row?.libraryOrgs)
    return l !== null && l.includes(orgId) && visibleTo(row, orgId)
}

/** Shared with the tenant but not owned by it (the opt-in set includes these). */
export function isSharedWith(row: VisibilityRow | null | undefined, orgId: OrgId): boolean {
    return !isOwnedBy(row, orgId) && visibleTo(row, orgId)
}

/** Collection doc id: `<owner>__<key>` (same shape as platform/tenants.ts collectionDocId). */
export function collectionKeyId(ownerOrgId: OrgId, key: string): string {
    return `${ownerOrgId}__${key}`
}

/**
 * The row's collection record id: its stamped `collectionId`, else derived from
 * the owner and the legacy `collection` string (missing or unknown = core, as
 * library_index has always read it).
 */
export function collectionIdOf(row: VisibilityRow | null | undefined): string {
    const c = row?.collectionId
    if (typeof c === "string" && c) return c
    return collectionKeyId(ownerOf(row), normalizeCollection(row?.collection))
}

/** Which rows a read returns: the tenant's library (default) or everything it can see. */
export function includedFor(row: VisibilityRow | null | undefined, orgId: OrgId, includeShared: boolean): boolean {
    return includeShared ? visibleTo(row, orgId) : inLibraryOf(row, orgId)
}

// ── computing the stamp from a collection record ────────────────────────────

export type CollectionVisibility = "private" | "listed" | "all"

export interface CollectionSharing {
    ownerOrgId: OrgId
    visibility: CollectionVisibility
    sharedWith: OrgId[]
    assignedTo: OrgId[]
}

export interface VisibilityStamp {
    collectionId: string
    visibleToOrgs: OrgId[]
    libraryOrgs: OrgId[]
}

const uniqSorted = (xs: OrgId[]) => [...new Set(xs.filter((x) => typeof x === "string" && x))].sort()

/**
 * visibleToOrgs for a collection: owner first, then (sorted, de-duplicated)
 *   all     → every active tenant
 *   listed  → sharedWith ∪ assignedTo
 *   private → assignedTo
 * libraryOrgs: owner first, then assignedTo (assignment puts it in the library).
 */
export function stampForCollection(
    collectionId: string,
    c: CollectionSharing,
    activeTenants: OrgId[],
): VisibilityStamp {
    const owner = c.ownerOrgId
    const others =
        c.visibility === "all"
            ? [...activeTenants, ...c.assignedTo]
            : c.visibility === "listed"
              ? [...c.sharedWith, ...c.assignedTo]
              : [...c.assignedTo]
    const rest = uniqSorted(others).filter((o) => o !== owner)
    const assigned = uniqSorted(c.assignedTo).filter((o) => o !== owner)
    return { collectionId, visibleToOrgs: [owner, ...rest], libraryOrgs: [owner, ...assigned] }
}

/** The stamp a row gets when its collection is private and unassigned (the phase-5 starting state). */
export function ownerOnlyStamp(row: VisibilityRow): VisibilityStamp {
    const owner = ownerOf(row)
    return { collectionId: collectionIdOf(row), visibleToOrgs: [owner], libraryOrgs: [owner] }
}

/** Storage custom metadata `visibleTo` (storage.rules reads it): a comma list. */
export function storageVisibleTo(visibleToOrgs: OrgId[]): string {
    return visibleToOrgs.join(",")
}

/** The refusal a tenant gets when it tries to change a row it can only see. */
export function notOwnerMessage(title: string, ownerName: string): string {
    return `${title} belongs to ${ownerName}; you can use it but not change it.`
}

/** True when two stamps hold the same values (idempotence check). */
export function sameStamp(row: VisibilityRow, s: VisibilityStamp): boolean {
    const eq = (a: unknown, b: OrgId[]) => Array.isArray(a) && a.length === b.length && a.every((x, i) => x === b[i])
    return row.collectionId === s.collectionId && eq(row.visibleToOrgs, s.visibleToOrgs) && eq(row.libraryOrgs, s.libraryOrgs)
}
