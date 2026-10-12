import type { OrgConfig } from "@/lib/org/config-schema"
import type { OrgId } from "@/lib/org/types"

/**
 * Multi-tenant phase 4: what scripts/ops/multitenant/seed-collections.ts
 * writes. Pure, so the dry run is testable without Firestore.
 *
 * One `collections/{owner}__{key}` record per entry in each tenant's
 * `library.collections` (CRC: core, supplemental, nava, uploads; BL: core,
 * uploads). All private, shared with nobody, assigned to nobody: phase 5
 * computes row visibility from these, and until someone changes sharing every
 * row stays visible only to its own tenant.
 *
 * Running it again changes nothing: an existing record keeps its sharing
 * (visibility, sharedWith, assignedTo — the platform owner's decisions) and
 * only its label and chart count are brought up to date.
 */

export interface SeedRecord {
    id: string
    ownerOrgId: OrgId
    name: string
    label: string
    visibility: "private"
    sharedWith: OrgId[]
    assignedTo: OrgId[]
    chartCount: number
}

export interface SeedPlan {
    creates: SeedRecord[]
    updates: Array<{ id: string; set: Partial<Pick<SeedRecord, "label" | "chartCount">>; before: Record<string, unknown> }>
    unchanged: string[]
}

export const seedCollectionId = (ownerOrgId: OrgId, key: string) => `${ownerOrgId}__${key}`

export function desiredCollections(configs: OrgConfig[], counts: (orgId: OrgId, key: string) => number): SeedRecord[] {
    const out: SeedRecord[] = []
    for (const c of configs) {
        for (const col of c.library.collections) {
            out.push({
                id: seedCollectionId(c.id, col.id),
                ownerOrgId: c.id,
                name: col.id,
                label: col.label,
                visibility: "private",
                sharedWith: [],
                assignedTo: [],
                chartCount: counts(c.id, col.id),
            })
        }
    }
    return out
}

export function planCollectionSeed(desired: SeedRecord[], existing: Map<string, Record<string, unknown>>): SeedPlan {
    const plan: SeedPlan = { creates: [], updates: [], unchanged: [] }
    for (const d of desired) {
        const cur = existing.get(d.id)
        if (!cur) {
            plan.creates.push(d)
            continue
        }
        const set: Partial<Pick<SeedRecord, "label" | "chartCount">> = {}
        if (cur.label !== d.label) set.label = d.label
        if (cur.chartCount !== d.chartCount) set.chartCount = d.chartCount
        if (Object.keys(set).length) plan.updates.push({ id: d.id, set, before: cur })
        else plan.unchanged.push(d.id)
    }
    return plan
}
