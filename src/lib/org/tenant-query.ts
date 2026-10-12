import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"

/**
 * Multi-tenant phase 1 — narrowing a cross-tenant read to one tenant.
 *
 * Rows without an `orgId` (or users without `orgIds`) belong to crc, and they
 * are not stamped until phase 2. A Firestore `orgId == "crc"` filter cannot
 * see a missing field, so for crc these helpers leave the query exactly as it
 * was and the caller keeps its in-memory `rowOrg` / `rowOrgIds` filter. Every
 * other tenant's rows always carry their tenant, so the query itself is
 * narrowed (and the in-memory filter becomes a no-op).
 *
 * Generic over the Admin SDK query shape so it carries no firebase import.
 */

/** True while crc's untagged rows must be read with the legacy query. */
export function readsUntaggedRows(org: OrgId): boolean {
    return org === DEFAULT_ORG_ID
}

interface Whereable<Q> {
    where(field: string, op: "==" | "array-contains", value: unknown): Q
}

/** `where('orgId', '==', org)` for every tenant but crc. */
export function scopeRowsToTenant<Q extends Whereable<Q>>(q: Q, org: OrgId): Q {
    return readsUntaggedRows(org) ? q : q.where("orgId", "==", org)
}

/** `where('orgIds', 'array-contains', org)` on `users` for every tenant but crc. */
export function scopeUsersToTenant<Q extends Whereable<Q>>(q: Q, org: OrgId): Q {
    return readsUntaggedRows(org) ? q : q.where("orgIds", "array-contains", org)
}
