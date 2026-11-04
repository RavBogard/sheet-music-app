// Every client list query over a tenant-owned collection is built here.
//
// WHY ONE MODULE (setlist sync redesign PR 2, 2026-11-03). The list rules on
// tenant collections read `resource.data.orgId` (`atLeast(listOrg(), …)` in
// firestore.rules). A rule cannot see any other filter, so a query that does
// not pin orgId is refused for everyone but the platform owner. From
// 2026-10-13 to 2026-11-03 the live tracks listener sent `setlistId ==` alone
// and no band device got live rows (#75). `tenantQuery` makes the orgId filter
// impossible to forget: it is the first constraint and the tenant is a
// required argument, never defaulted.
//
// The few queries that are legal without an orgId filter (rows shared with a
// tenant, a musician's own assignments) are named builders here too, so that
// `tenant-query-scan.test.ts` can refuse any tenant-collection query built
// anywhere else, and `client-queries-tenancy.emulator.test.ts` runs every
// builder in `CLIENT_QUERIES` against the rules as each persona.
//
// This module imports `firebase/firestore` statically. Callers that keep the
// SDK out of their eager graph import this module dynamically, as they did
// the SDK.

import {
    Timestamp,
    collection,
    limit,
    orderBy,
    query,
    where,
    type Firestore,
    type Query,
    type QueryConstraint,
} from "firebase/firestore"

/** Top-level collections whose list rule is tenant-scoped (`listOrg()`, or
 *  `ownerOrgId` for chart collections). `tenant-query-scan.test.ts` checks
 *  this list against firestore.rules. */
export const TENANT_COLLECTIONS = [
    "auditLogs",
    "bond_flags",
    "collections",
    "contacts",
    "library_index",
    "live_sessions",
    "musician_availability",
    "part_presets",
    "proposal_stages",
    "recordings",
    "scheduling_assignments",
    "scheduling_history",
    "setlistTemplates",
    "setlists",
    "songUsage",
    "songs",
    "standing_choices",
    "sync_runs",
    "tasks",
    "templates",
    "tracks",
] as const
export type TenantCollection = (typeof TENANT_COLLECTIONS)[number]

/** A list query over one tenant's rows: `where('orgId','==',orgId)` first,
 *  then the caller's constraints. */
export function tenantQuery(
    db: Firestore,
    coll: TenantCollection,
    orgId: string,
    ...constraints: QueryConstraint[]
): Query {
    return query(collection(db, coll), where("orgId", "==", orgId), ...constraints)
}

// ── Builders: one per real client query ────────────────────────────────────

/** A setlist's rows: the live listener, the one-shot reader and the
 *  track-count reconcile. */
export function setlistTracksQuery(db: Firestore, orgId: string, setlistId: string): Query {
    return tenantQuery(db, "tracks", orgId, where("setlistId", "==", setlistId))
}

/** Past rows for a liturgical moment (tonight's history lookup). */
export function tracksByMomentQuery(db: Firestore, orgId: string, momentId: string): Query {
    return tenantQuery(db, "tracks", orgId, where("momentId", "==", momentId), limit(500))
}

/** Past rows for a set of liturgy units (at most 30, Firestore's `in` cap). */
export function tracksByUnitsQuery(db: Firestore, orgId: string, unitIds: string[]): Query {
    return tenantQuery(db, "tracks", orgId, where("liturgyRef.unitId", "in", unitIds), limit(500))
}

/** The tenant's most recent setlists by `date`. */
export function recentSetlistsQuery(db: Firestore, orgId: string, max: number): Query {
    return tenantQuery(db, "setlists", orgId, orderBy("date", "desc"), limit(max))
}

/** The tenant's setlists with an `eventDate` from `from` (and up to `to`),
 *  soonest first. */
export function upcomingSetlistsQuery(
    db: Firestore,
    orgId: string,
    from: Date,
    opts: { to?: Date; max?: number } = {},
): Query {
    const constraints: QueryConstraint[] = [where("eventDate", ">=", Timestamp.fromDate(from))]
    if (opts.to) constraints.push(where("eventDate", "<=", Timestamp.fromDate(opts.to)))
    constraints.push(orderBy("eventDate", "asc"))
    if (opts.max !== undefined) constraints.push(limit(opts.max))
    return tenantQuery(db, "setlists", orgId, ...constraints)
}

export function songsQuery(db: Firestore, orgId: string): Query {
    return tenantQuery(db, "songs", orgId)
}

export function templatesQuery(db: Firestore, orgId: string): Query {
    return tenantQuery(db, "templates", orgId)
}

export function recordingsQuery(db: Firestore, orgId: string): Query {
    return tenantQuery(db, "recordings", orgId)
}

export function recordingsForSongQuery(db: Firestore, orgId: string, songId: string): Query {
    return tenantQuery(db, "recordings", orgId, where("songId", "==", songId), orderBy("createdAt", "desc"))
}

export function auditLogsQuery(db: Firestore, orgId: string, max: number): Query {
    return tenantQuery(db, "auditLogs", orgId, orderBy("timestamp", "desc"), limit(max))
}

export function partPresetsQuery(db: Firestore, orgId: string): Query {
    return tenantQuery(db, "part_presets", orgId)
}

/** The tenant's latest Drive sync run (admin Data tab). */
export function lastSyncRunQuery(db: Firestore, orgId: string): Query {
    return tenantQuery(db, "sync_runs", orgId, orderBy("startedAt", "desc"), limit(1))
}

/** Every pending or confirmed assignment in the tenant (band leader view). */
export function tenantAssignmentsQuery(db: Firestore, orgId: string): Query {
    return tenantQuery(
        db,
        "scheduling_assignments",
        orgId,
        where("status", "in", ["pending", "confirmed"]),
        orderBy("assignedAt", "desc"),
    )
}

// ── Named exceptions: legal without an orgId filter ────────────────────────

/** A musician's own assignments. The rule's `musicianUid == auth.uid` branch
 *  proves it; the tenant is not needed. */
export function myAssignmentsQuery(db: Firestore, uid: string): Query {
    return query(
        collection(db, "scheduling_assignments"),
        where("musicianUid", "==", uid),
        where("status", "in", ["pending", "confirmed"]),
        orderBy("assignedAt", "desc"),
    )
}

/** Chart collections another tenant shared with or assigned to `orgId`. */
export function sharedCollectionsQuery(
    db: Firestore,
    field: "sharedWith" | "assignedTo",
    orgId: string,
): Query {
    return query(collection(db, "collections"), where(field, "array-contains", orgId))
}

/** library_index rows other tenants made visible to `orgId`. */
export function sharedLibraryRowsQuery(db: Firestore, orgId: string): Query {
    return query(
        collection(db, "library_index"),
        where("visibleToOrgs", "array-contains", orgId),
        where("orgId", "!=", orgId),
    )
}

/** Builders that do NOT start with `where('orgId','==',…)`, each with why the
 *  rules still prove it. `tenant-query-scan.test.ts` fails on a builder that
 *  lacks the orgId filter and is not listed here. */
export const ORG_FILTER_EXCEPTIONS: Readonly<Record<string, string>> = {
    myAssignmentsQuery: "the list rule's `musicianUid == auth.uid` branch proves a caller's own rows in any tenant",
    sharedCollectionsQuery: "collections carry ownerOrgId, not orgId; the rule proves `sharedWith`/`assignedTo` array-contains a tenant the caller belongs to",
    sharedLibraryRowsQuery: "rows OTHER tenants shared: `visibleToOrgs` array-contains the caller's tenant (sharedSeesList), with orgId != it",
}

/** The registry the persona matrix runs. Adding a builder above without
 *  adding it here fails `tenant-query-scan.test.ts`. */
export const CLIENT_QUERIES = {
    setlistTracksQuery,
    tracksByMomentQuery,
    tracksByUnitsQuery,
    recentSetlistsQuery,
    upcomingSetlistsQuery,
    songsQuery,
    templatesQuery,
    recordingsQuery,
    recordingsForSongQuery,
    auditLogsQuery,
    partPresetsQuery,
    lastSyncRunQuery,
    tenantAssignmentsQuery,
    myAssignmentsQuery,
    sharedCollectionsQuery,
    sharedLibraryRowsQuery,
} as const
