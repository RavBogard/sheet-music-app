import type { OrgId } from "@/lib/org/types"

/**
 * v11-03-03: per-tenant vocabulary + synagogue-field trim for the browser
 * surface. Pure (no React/Firestore). CRC uses the BASE terms; non-synagogue
 * tenants (Brothers Lazaroff) get band overrides and hide liturgical fields.
 *
 * Scope: the live setlist-edit surface. The CreationWizard / perform view /
 * display cards are deferred to v11-04 (they depend on org-scoping the global
 * `congregation` collection + liturgical templates).
 */

/**
 * True for tenants that are NOT synagogues — hides the Service-type selector
 * and the Rabbi field. New non-synagogue tenants opt in here, not by
 * scattering org checks through the UI.
 */
export function hidesLiturgicalFields(orgId: OrgId): boolean {
    return orgId === "brotherslazaroff"
}

export type VocabKey =
    | "setlist"
    | "editSetlistDetails"
    | "namePlaceholder"
    | "publicListingTitle"

const BASE: Record<VocabKey, string> = {
    setlist: "setlist",
    editSetlistDetails: "Edit setlist details",
    namePlaceholder: "e.g., Shabbat Morning",
    // v11-04-02: the public /perform <title>. CRC keeps the prior
    // synagogue-flavored wording byte-identical.
    publicListingTitle: "Upcoming Services & Setlists",
}

const OVERRIDES: Partial<Record<OrgId, Partial<Record<VocabKey, string>>>> = {
    brotherslazaroff: {
        setlist: "set",
        editSetlistDetails: "Edit set details",
        namePlaceholder: "e.g., Friday night set",
        publicListingTitle: "Upcoming Shows & Sets",
    },
}

export function label(orgId: OrgId, key: VocabKey): string {
    return OVERRIDES[orgId]?.[key] ?? BASE[key]
}
