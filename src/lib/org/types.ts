import type { FirestoreDate } from "@/types/models"

/**
 * v11-01: tenant ("org"/band) identifier.
 *
 * String alias — the registry (src/lib/org/registry.ts) constrains valid values
 * at runtime, keeping the type open for a 3rd band without a type edit.
 */
export type OrgId = string

/**
 * v11-01: a tenant. One app + one Firebase project (crcmusiccharts) serve
 * multiple bands; each band's data is scoped by orgId. Seeded in the registry;
 * persisted to orgs/{orgId} by the v11-01-03 backfill.
 */
export interface Org {
    id: OrgId
    name: string
    /** Production host this org is served on — no scheme, no leading www., no port. */
    domain: string
    createdAt?: FirestoreDate
}
