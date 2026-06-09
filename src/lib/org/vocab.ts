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
    // v11-05-05: CreationWizard / public listing / display-card vocab.
    | "newSetlist"
    | "blankSetlist"
    | "cloneSetlistAction"
    | "createSetlistAction"
    | "wizardNamePlaceholder"
    | "pastSection"
    | "planPlaceholder"
    // v11.1-04: dashboard section headers + matrix title (were hardcoded, bypassing this layer).
    | "upcomingSection"
    | "createNewSetlistHeading"
    | "matrixTitle"

const BASE: Record<VocabKey, string> = {
    setlist: "setlist",
    editSetlistDetails: "Edit setlist details",
    namePlaceholder: "e.g., Shabbat Morning",
    // v11-04-02: the public /perform <title>. CRC keeps the prior
    // synagogue-flavored wording byte-identical.
    publicListingTitle: "Upcoming Services & Setlists",
    // v11-05-05: CRC base = the CURRENT hardcoded strings (byte-identical).
    newSetlist: "New Setlist",
    blankSetlist: "Blank setlist",
    cloneSetlistAction: "Clone Setlist",
    createSetlistAction: "Create Setlist",
    // CRC base = the wizard's CURRENT placeholder verbatim (NOT the edit-sheet's
    // shorter namePlaceholder) — keeps the wizard CRC render byte-identical.
    wizardNamePlaceholder: "e.g., Shabbat Morning, Friday Night...",
    pastSection: "Past services",
    planPlaceholder: "Plan Service",
    // v11.1-04: CRC base = the current hardcoded header strings (byte-identical).
    upcomingSection: "Upcoming Services",
    createNewSetlistHeading: "Create New Setlist",
    matrixTitle: "Liturgical Matrix",
}

const OVERRIDES: Partial<Record<OrgId, Partial<Record<VocabKey, string>>>> = {
    brotherslazaroff: {
        setlist: "set",
        editSetlistDetails: "Edit set details",
        namePlaceholder: "e.g., Friday night set",
        publicListingTitle: "Upcoming Shows & Sets",
        // v11-05-05: band voice, consistent with the v11-03-03 "set"/"Shows" voice.
        newSetlist: "New Set",
        blankSetlist: "Blank set",
        cloneSetlistAction: "Clone Set",
        createSetlistAction: "Create Set",
        wizardNamePlaceholder: "e.g., Friday night set",
        pastSection: "Past shows",
        planPlaceholder: "Plan Show",
        // v11.1-04: band voice for the dashboard headers + matrix title.
        upcomingSection: "Upcoming Shows",
        createNewSetlistHeading: "Create New Set",
        matrixTitle: "Set Matrix",
    },
}

export function label(orgId: OrgId, key: VocabKey): string {
    return OVERRIDES[orgId]?.[key] ?? BASE[key]
}
