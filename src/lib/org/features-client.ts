import { codeOrgConfig } from "@/lib/org/config-code"
import { FeaturesSchema, type FEATURE_KEYS, type OrgConfig, type OrgFeatures } from "@/lib/org/config-schema"
import type { OrgId } from "@/lib/org/types"

/**
 * Multi-tenant phase 6 — feature flags, the client-safe half (no server-only).
 *
 * Six flags live on `orgs/{id}.features` (config-schema.ts FEATURE_KEYS).
 * Charts, setlists and MCP are always on and have no flag.
 *
 * The mixer is CRC-only whatever its flag says: the bare `config/monitor` and
 * `monitor-live/*` documents and the one bridge are CRC's (single-tenant data),
 * so `mixer` reads as off for every other tenant. Every reader of a flag (UI,
 * API, MCP, cron) goes through `effectiveFeatures`, so that rule lives in one
 * place.
 */

export type FeatureKey = (typeof FEATURE_KEYS)[number]

/** The only tenant whose mixer data exists. */
export const MIXER_ORG_ID: OrgId = "crc"

const SCHEMA_DEFAULTS: OrgFeatures = FeaturesSchema.parse({})

/** A tenant's flags as stored, plus the CRC-only mixer rule. */
export function effectiveFeatures(raw: OrgFeatures, orgId: OrgId | undefined): OrgFeatures {
    return { ...raw, mixer: raw.mixer === true && orgId === MIXER_ORG_ID }
}

/**
 * The tenant's flags from a config in hand; with no config, the compiled config
 * for `orgId` (crc, brotherslazaroff), then the schema defaults.
 */
export function featuresOf(config: OrgConfig | null | undefined, orgId?: OrgId): OrgFeatures {
    const id = config?.id ?? orgId
    const raw = config?.features ?? (id ? codeOrgConfig(id)?.features : undefined) ?? SCHEMA_DEFAULTS
    return effectiveFeatures({ ...SCHEMA_DEFAULTS, ...raw }, id)
}

/** Whether `key` is on for the tenant. `orgId` is used only when `config` is null. */
export function featureOn(config: OrgConfig | null | undefined, key: FeatureKey, orgId?: OrgId): boolean {
    return featuresOf(config, orgId)[key] === true
}
