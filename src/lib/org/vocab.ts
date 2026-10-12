import { peekOrgConfig } from "@/lib/org/config-cache"
import { codeOrgConfig } from "@/lib/org/config-code"
import { orgString, type StringKey } from "@/lib/org/strings"
import type { OrgId } from "@/lib/org/types"

/**
 * v11-03-03: per-tenant vocabulary + synagogue-field trim for the browser
 * surface. Pure (no React/Firestore).
 *
 * Multi-tenant phase 1: the strings live in the tenant string catalogue
 * (strings-base.ts STRING_BASE, CRC's values) with per-tenant overrides in the
 * tenant config (`vocabulary.overrides`; BL's band voice is in config-code.ts),
 * and "hide liturgical fields" is the config's `vocabulary.mode === "band"`.
 */

/**
 * True for tenants that are NOT synagogues — hides the Service-type selector
 * and the Rabbi field.
 */
export function hidesLiturgicalFields(orgId: OrgId): boolean {
    const cfg = peekOrgConfig(orgId) ?? codeOrgConfig(orgId)
    return cfg?.vocabulary.mode === "band"
}

export type VocabKey = Extract<
    StringKey,
    | "setlist"
    | "editSetlistDetails"
    | "namePlaceholder"
    | "publicListingTitle"
    | "publicListingSubtitle"
    | "newSetlist"
    | "blankSetlist"
    | "cloneSetlistAction"
    | "createSetlistAction"
    | "wizardNamePlaceholder"
    | "pastSection"
    | "planPlaceholder"
    | "upcomingSection"
    | "createNewSetlistHeading"
    | "matrixTitle"
>

export function label(orgId: OrgId, key: VocabKey): string {
    return orgString(orgId, key)
}
