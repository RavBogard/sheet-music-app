import { CODE_BRANDING, CODE_EMAIL_BRANDING } from "@/lib/org/branding"
import { OrgConfigSchema, type OrgConfig, type OrgConfigInput } from "@/lib/org/config-schema"
import { STRING_BASE, interpolate, tokensFor, type StringKey } from "@/lib/org/strings-base"
import type { OrgId } from "@/lib/org/types"

/**
 * Multi-tenant phase 1 — the code tables, as tenant configs.
 *
 * These are today's hardcoded values for crc and brotherslazaroff, assembled
 * from the existing constants (CODE_BRANDING, CODE_EMAIL_BRANDING, the
 * vocabulary overrides, the congregation defaults and the literals that used to
 * sit in the email, SMS, calendar-feed, print and chart code). They are:
 *   - what getOrgConfig returns with ORG_CONFIG_SOURCE=code,
 *   - the fallback when `orgs/{id}` is missing or invalid,
 *   - what scripts/ops/multitenant/seed-org-configs.mjs writes to Firestore.
 * The seed imports this module, so the documents cannot drift from the code.
 */

/** CRC's library conventions block for the Gemini prompt (was ai-enrichment.ts LIBRARY_CONVENTIONS). */
const CRC_LIBRARY_CONVENTIONS = `Library naming conventions (CRC music library):

- Reform Jewish liturgical music + supplemental.
- Common naming: "Title (Composer)" or "Title (Arrangement)" — e.g.
  "Shalom Rav (Frankel)", "Mi Chamocha (Klepper)".
- Hebrew-Latin transliteration is the canonical form (NOT Hebrew script
  on chart titles, even if the chart itself is in Hebrew).
- Collections:
    - core: high-frequency liturgical music (Shabbat liturgy, Hatzi
      Kaddish, etc.) — used every week.
    - supplemental: niggunim, holiday-specific, occasional repertoire.
    - uploads: provisional landing zone; everything starts here unless
      David routed it explicitly via Drive subfolder.
- Tags are short, kebab-case, optional. Examples:
  "friday-evening", "shabbat-morning", "high-holy-days", "frankel",
  "klepper", "shireinu", "kavanah".

If you're not sure of a field, return null / [] — do NOT guess.`

/** The congregation-store / MCP DEFAULT_CONFIG values (both tenants saw CRC's). */
const CRC_CONGREGATION_DEFAULTS = {
    name: "Central Reform Congregation",
    shortName: "CRC Music",
    location: "St. Louis, MO",
    logoUrl: "/logo.jpg",
    description: "Digital Sheet Music Library for CRC Musicians",
    themeColor: "#7c3aed",
}

/** BL's band voice for the setlist vocabulary (was vocab.ts OVERRIDES.brotherslazaroff). */
const BL_VOCAB: Partial<Record<StringKey, string>> = {
    setlist: "set",
    editSetlistDetails: "Edit set details",
    namePlaceholder: "e.g., Friday night set",
    publicListingTitle: "Upcoming Shows & Sets",
    publicListingSubtitle: "Public sets",
    newSetlist: "New Set",
    blankSetlist: "Blank set",
    cloneSetlistAction: "Clone Set",
    createSetlistAction: "Create Set",
    wizardNamePlaceholder: "e.g., Friday night set",
    pastSection: "Past shows",
    planPlaceholder: "Plan Show",
    upcomingSection: "Upcoming Shows",
    createNewSetlistHeading: "Create New Set",
    matrixTitle: "Set Matrix",
}

/**
 * Surfaces that were never tenant-aware and show BL the CRC text today. BL
 * keeps exactly that text (frozen); changing it is a BL-visible change and is
 * listed for Daniel in the phase 1 return.
 */
export const BL_FROZEN_CRC_KEYS: StringKey[] = [
    "email.notificationFromName",
    "email.notificationFooter",
    "email.venueName",
    "sms.venueShort",
    "sms.publishPrefix",
    "feed.productName",
    "feed.calendarNamePrefix",
    "feed.location",
    "feed.uidPrefix",
    "feed.uidDomain",
    "feed.filePrefix",
    "print.footer",
    "print.packetSubject",
    "chart.footerLeft",
    "chart.footerRight",
    "og.alt",
    "og.monogram",
    "og.title",
    "page.unauthorizedTitle",
    "page.v2TitleTemplate",
    "page.v2TitleDefault",
    "page.skeletonBrand",
    "profile.scheduleName",
    "library.ownBadge",
    "ai.systemInstructionLead",
    "ai.libraryConventions",
]

const crcBranding = CODE_BRANDING.crc
const crcEmail = CODE_EMAIL_BRANDING.crc

const CRC: OrgConfigInput = {
    id: "crc",
    name: "Central Reform Congregation",
    status: "active",
    domains: { primary: "centralreform.live", aliases: ["www.centralreform.live"] },
    branding: {
        ...crcBranding,
        abbreviation: "CRC",
        location: "St. Louis, MO",
        fontDisplay: "righteous",
        fontBody: "poppins",
        colors: { light: {}, dark: {} },
        legacyCssTheme: null,
    },
    vocabulary: {
        mode: "shul",
        overrides: { "ai.libraryConventions": CRC_LIBRARY_CONVENTIONS },
    },
    locale: { language: "en", direction: "ltr", timeZone: "America/Chicago", calendar: "diaspora" },
    email: { ...crcEmail, fromAddress: "", replyTo: "" },
    legal: { operatorName: "Central Reform Congregation", contactEmail: "music@centralreform.live", useCrcText: true },
    features: { mixer: true, driveInbox: true, schedulingEmails: true, todayFeed: true, notifyBand: true, perform: true },
    library: {
        collections: [
            { id: "core", label: "CRC Charts" },
            { id: "supplemental", label: "Shireinu" },
            { id: "nava", label: "Nava Tehilah" },
            { id: "uploads", label: "Uploads" },
        ],
        defaultCollection: "core",
    },
    liturgy: { books: [], defaultBookByService: {}, serviceTypes: [] },
    congregationDefaults: CRC_CONGREGATION_DEFAULTS,
    agentGuide: "",
    configVersion: 1,
}

const crcParsed = OrgConfigSchema.parse(CRC)

/** BL overrides that freeze the CRC rendering of each never-tenant-aware key. */
function frozenCrcOverrides(): Record<string, string> {
    const crcTokens = tokensFor(crcParsed)
    const out: Record<string, string> = {}
    for (const k of BL_FROZEN_CRC_KEYS) {
        out[k] = interpolate(crcParsed.vocabulary.overrides[k] ?? STRING_BASE[k], crcTokens)
    }
    return out
}

const blBranding = CODE_BRANDING.brotherslazaroff
const blEmail = CODE_EMAIL_BRANDING.brotherslazaroff

const BL: OrgConfigInput = {
    id: "brotherslazaroff",
    name: "Brothers Lazaroff",
    status: "active",
    domains: { primary: "brotherslazaroff.live", aliases: ["www.brotherslazaroff.live"] },
    branding: {
        ...blBranding,
        abbreviation: "BL",
        // The BL login hero has always shown this location.
        location: "St. Louis, MO",
        fontDisplay: "zillaSlab",
        fontBody: "poppins",
        colors: { light: {}, dark: {} },
        legacyCssTheme: "brotherslazaroff",
    },
    vocabulary: {
        mode: "band",
        overrides: { ...BL_VOCAB, ...frozenCrcOverrides() } as Record<string, string>,
    },
    locale: { language: "en", direction: "ltr", timeZone: "America/Chicago", calendar: "diaspora" },
    email: { ...blEmail, fromAddress: "", replyTo: "" },
    // Frozen: BL has always been served CRC's legal pages.
    legal: { operatorName: "Central Reform Congregation", contactEmail: "music@centralreform.live", useCrcText: true },
    // Phase 6 sets these flag by flag to what BL does today; nothing reads them before then.
    features: { mixer: false, driveInbox: false, schedulingEmails: false, todayFeed: false, notifyBand: false, perform: true },
    library: {
        collections: [
            { id: "core", label: "Charts" },
            { id: "uploads", label: "Uploads" },
        ],
        defaultCollection: "",
    },
    liturgy: { books: [], defaultBookByService: {}, serviceTypes: [] },
    // Frozen: BL's signed-out pages fall back to CRC's congregation defaults today.
    congregationDefaults: CRC_CONGREGATION_DEFAULTS,
    agentGuide: "",
    configVersion: 1,
}

const CODE_CONFIGS: Record<OrgId, OrgConfig> = {
    crc: crcParsed,
    brotherslazaroff: OrgConfigSchema.parse(BL),
}

/** Today's config for crc / brotherslazaroff; null for any other org. */
export function codeOrgConfig(orgId: OrgId): OrgConfig | null {
    return Object.prototype.hasOwnProperty.call(CODE_CONFIGS, orgId) ? CODE_CONFIGS[orgId] : null
}

export const CODE_ORG_IDS = Object.keys(CODE_CONFIGS) as OrgId[]
