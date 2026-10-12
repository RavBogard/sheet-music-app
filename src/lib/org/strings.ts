import { peekOrgConfig } from "@/lib/org/config-cache"
import { codeOrgConfig } from "@/lib/org/config-code"
import { STRING_BASE, interpolate, tokensFor, type StringKey } from "@/lib/org/strings-base"
import type { OrgId } from "@/lib/org/types"

export { STRING_BASE, interpolate, tokensFor, type StringKey, type StringTokens } from "@/lib/org/strings-base"

/**
 * A tenant string: the tenant's override if it has one, else the base
 * template, interpolated with the tenant's identity. Reads the primed config
 * (see config-cache.ts) and falls back to the code tables, then to CRC.
 */
export function orgString(orgId: OrgId, key: StringKey): string {
    const cfg = peekOrgConfig(orgId) ?? codeOrgConfig(orgId) ?? codeOrgConfig("crc")!
    return interpolate(cfg.vocabulary.overrides[key] ?? STRING_BASE[key], tokensFor(cfg))
}
