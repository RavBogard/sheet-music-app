import type { OrgConfig } from "@/lib/org/config-schema"
import type { OrgId } from "@/lib/org/types"

/**
 * Multi-tenant phase 1 — the synchronous, isomorphic view of tenant config.
 *
 * About forty call sites read tenant values synchronously (getOrgBranding,
 * label, getEmailBranding, …). Rather than make each of them async, the server
 * primes this map from getOrgConfig before a render (the root layout awaits it)
 * and OrgProvider primes it in the browser from the config the layout hands
 * down. The pure getters read this first and fall back to their code tables,
 * so a missing entry renders exactly what it did before.
 *
 * The map is keyed by org, not by user, so sharing it across requests on a
 * server instance is safe; entries are replaced on every prime.
 */
const primed = new Map<OrgId, OrgConfig>()

export function primeOrgConfig(config: OrgConfig): void {
    primed.set(config.id, config)
}

export function peekOrgConfig(orgId: OrgId): OrgConfig | undefined {
    return primed.get(orgId)
}

/** Test seam. */
export function clearPrimedOrgConfigs(): void {
    primed.clear()
}
