import { peekOrgConfig } from "@/lib/org/config-cache"
import { codeOrgConfig } from "@/lib/org/config-code"
import type { OrgConfig } from "@/lib/org/config-schema"
import type { OrgId } from "@/lib/org/types"
import { CRC_RABBI_SLOTS, SERVICE_TYPE_CATALOG, type RabbiSlot } from "@/lib/templates/service-types"

/**
 * Multi-tenant phase 1 — the tenant's liturgy lists (service types, rabbi
 * slots, books), read synchronously like orgString: the primed config, then
 * the code tables, then CRC. An empty list means "what every tenant had before
 * phase 1", so an unconfigured tenant behaves exactly as it did.
 */
function cfgFor(orgId: OrgId): OrgConfig {
    return peekOrgConfig(orgId) ?? codeOrgConfig(orgId) ?? codeOrgConfig("crc")!
}

/** The tenant's config, resolved the same way orgString resolves it. */
export function orgConfigSync(orgId: OrgId): OrgConfig {
    return cfgFor(orgId)
}

const CATALOG_LABEL = new Map(SERVICE_TYPE_CATALOG.map((e) => [e.key, e.label]))

/** Service-type keys the tenant's pickers offer, in the tenant's order. */
export function serviceTypeKeysFor(orgId: OrgId): string[] {
    const own = cfgFor(orgId).liturgy.serviceTypes
    return own.length > 0 ? own.map((s) => s.key) : SERVICE_TYPE_CATALOG.map((e) => e.key)
}

/** The tenant's label for a service type; the catalogue label, else the key. */
export function serviceTypeLabel(orgId: OrgId, key: string): string {
    return cfgFor(orgId).liturgy.serviceTypes.find((s) => s.key === key)?.label ?? CATALOG_LABEL.get(key) ?? key
}

/** Rabbi slots `onlyFor` may name; CRC's when the tenant lists none. */
export function rabbiSlotsFor(orgId: OrgId): readonly RabbiSlot[] {
    const own = cfgFor(orgId).liturgy.rabbiSlots
    return own.length > 0 ? own : CRC_RABBI_SLOTS
}

/**
 * Book slugs the tenant sees, or null for "every registered book" (the
 * tenant lists none — what every tenant saw before phase 1).
 */
export function bookSlugsFor(orgId: OrgId): string[] | null {
    const own = cfgFor(orgId).liturgy.books
    return own.length > 0 ? own : null
}
