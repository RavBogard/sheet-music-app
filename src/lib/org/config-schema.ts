import { z } from "zod"
import { ORG_ID_MAX, ORG_ID_MIN, ORG_ID_PATTERN } from "@/lib/org/org-id"

/**
 * Multi-tenant phase 1 — the ONE schema for a tenant's `orgs/{orgId}` document.
 *
 * The seed script (scripts/ops/multitenant/seed-org-configs.mjs), getOrgConfig,
 * the platform console form and the platform MCP tools all validate against
 * this, so they cannot disagree. Pure: no Firestore, no React.
 *
 * Operational settings (services, stream, scheduling, default musicians) stay
 * in `config/congregation[__id]`; this document is identity and presentation.
 */

/** Lowercase letters, digits and hyphens; never changes; the default subdomain. */
export const OrgIdSchema = z
    .string()
    .min(ORG_ID_MIN)
    .max(ORG_ID_MAX)
    .regex(ORG_ID_PATTERN, "lowercase letters, digits and hyphens")

/**
 * Fonts are a fixed menu because next/font resolves at build time. The key is
 * what a tenant stores; src/app/layout.tsx maps it to a loaded font.
 */
export const FONT_KEYS = ["poppins", "righteous", "zillaSlab", "rubik", "heebo", "frankRuhlLibre"] as const
export const FontKeySchema = z.enum(FONT_KEYS)
export type FontKey = z.infer<typeof FontKeySchema>

const hex = z.string().regex(/^#[0-9a-fA-F]{3,8}$/, "hex colour")

export const BrandingSchema = z.object({
    /** Short brand, e.g. "CRC Music". Also the PWA short_name and twitter title. */
    shortName: z.string().min(1),
    /** Initials / short code, e.g. "CRC": SMS, badges, the social-image monogram. */
    abbreviation: z.string().min(1),
    tagline: z.string().default(""),
    /** Force the dark theme (BL's photographic identity). */
    forceDark: z.boolean().default(false),
    appName: z.string().min(1),
    metaTitleDefault: z.string().min(1),
    metaTitleTemplate: z.string().includes("%s"),
    metaDescription: z.string(),
    ogTitle: z.string(),
    /** Web-manifest theme/background colour. */
    themeColor: hex,
    /** Non-empty → <img>; "" → initials monogram. */
    logoUrl: z.string().default(""),
    /** Horizontal lockup; "" → monogram + text. */
    wordmarkUrl: z.string().default(""),
    heroImageUrl: z.string().default(""),
    location: z.string().default(""),
    manifestPath: z.string().startsWith("/"),
    /** Canonical origin for absolute URLs (metadataBase, email links). */
    baseUrl: z.string().url(),
    fontDisplay: FontKeySchema.default("righteous"),
    fontBody: FontKeySchema.default("poppins"),
    /** CSS custom-property overrides for generated tenant themes. Empty = app defaults. */
    colors: z
        .object({
            light: z.record(z.string(), z.string()).default({}),
            dark: z.record(z.string(), z.string()).default({}),
        })
        .default({ light: {}, dark: {} }),
    /**
     * A tenant whose theme is a hand-written block in globals.css keyed off
     * `[data-org="…"]` (Brothers Lazaroff). Generated colours are for new
     * tenants only, so existing CSS stays byte-identical.
     */
    legacyCssTheme: z.string().nullable().default(null),
})
export type OrgBrandingConfig = z.infer<typeof BrandingSchema>

export const VocabularySchema = z.object({
    /** shul: service types, liturgy, rabbi fields. band: hides them (was hidesLiturgicalFields). */
    mode: z.enum(["shul", "band"]),
    overrides: z.record(z.string(), z.string()).default({}),
})

export const LocaleSchema = z.object({
    language: z.enum(["en", "he"]).default("en"),
    direction: z.enum(["ltr", "rtl"]).default("ltr"),
    /** IANA zone, e.g. America/Chicago, Asia/Jerusalem. */
    timeZone: z.string().min(1),
    /** Hebcal parasha schedule. */
    calendar: z.enum(["diaspora", "israel"]).default("diaspora"),
    /** Local hour (0-23) the daily scheduling reminder goes out. */
    reminderLocalHour: z.number().int().min(0).max(23).default(5),
    /**
     * Pin the reminder to a UTC hour instead (CRC: 10, today's cron time, kept
     * as-is rather than "fixed" to local 05:00 — CRC unchanged wins).
     */
    reminderUtcHour: z.number().int().min(0).max(23).nullable().default(null),
})

export const EmailSchema = z.object({
    fromName: z.string().min(1),
    /** "" → the shared platform sender (ruling R-1012-mt-3). */
    fromAddress: z.string().default(""),
    replyTo: z.string().default(""),
    headerBg: hex,
    footerText: z.string(),
    headerImagePath: z.string().default(""),
    headerImageHeightPx: z.number().int().min(0).default(0),
})

export const LegalSchema = z.object({
    operatorName: z.string(),
    contactEmail: z.string().default(""),
    /** CRC's legal pages keep their exact text. */
    useCrcText: z.boolean().default(false),
})

export const FEATURE_KEYS = ["mixer", "driveInbox", "schedulingEmails", "todayFeed", "notifyBand", "perform"] as const
export const FeaturesSchema = z.object({
    mixer: z.boolean().default(false),
    driveInbox: z.boolean().default(false),
    schedulingEmails: z.boolean().default(false),
    todayFeed: z.boolean().default(false),
    notifyBand: z.boolean().default(false),
    perform: z.boolean().default(true),
})
export type OrgFeatures = z.infer<typeof FeaturesSchema>

/**
 * Multi-tenant phase 6: the tenant's Chart Inbox (a shared Google Drive folder
 * the drive-sync cron and get_chart_inbox / sync_chart_inbox read). "" means
 * none, except crc, whose fallback is the CHART_INBOX_DRIVE_FOLDER_ID env var
 * (src/lib/drive-sync/tenant-inbox.ts). Only read when features.driveInbox is on.
 */
export const DriveInboxSchema = z.object({
    folderId: z.string().default(""),
})

export const LibrarySchema = z.object({
    /** Library tabs in order. `id` is the row's `collection` value. */
    collections: z.array(z.object({ id: z.string().min(1), label: z.string().min(1) })).default([]),
    defaultCollection: z.string().default(""),
    /**
     * Phase 5: chart bytes at this address open for anyone holding the link
     * (true, what every tenant has always done). false: /api/library/file and
     * /api/drive/file serve a chart only to a signed-in member of this tenant,
     * and only a chart this tenant can see (src/lib/library/open-by-link.ts).
     */
    openByLink: z.boolean().default(true),
})

export const LiturgySchema = z.object({
    /**
     * Book slugs this tenant sees (list_books), in registry order. Empty = every
     * registered book, which is what every tenant saw before phase 1; which
     * books count as "shared" for a new tenant is not decided yet.
     */
    books: z.array(z.string()).default([]),
    /** No code reads this yet: the book is chosen per setlist, there is no per-service default. */
    defaultBookByService: z.record(z.string(), z.string()).default({}),
    /** Service types (template keys) the creation wizard and template list offer. Empty = the built-in catalogue. */
    serviceTypes: z
        .array(z.object({ key: z.string().min(1), label: z.string().min(1), defaultStart: z.string().default("") }))
        .default([]),
    /**
     * Rabbi slot keys a template slot's `onlyFor` may name, with the words in a
     * request that pick them (template-parser.ts). Empty = CRC's two slots,
     * which is what every tenant had before phase 1.
     */
    rabbiSlots: z
        .array(z.object({ key: z.string().min(1), label: z.string().min(1), match: z.array(z.string().min(1)).default([]) }))
        .default([]),
})

/**
 * Fallback values for the operational `config/congregation[__id]` document
 * (merged under it by the congregation store and the MCP congregation tools).
 */
export const CongregationDefaultsSchema = z.object({
    name: z.string(),
    shortName: z.string(),
    location: z.string().default(""),
    logoUrl: z.string().default(""),
    description: z.string().default(""),
    themeColor: hex,
})

export const OrgConfigSchema = z.object({
    id: OrgIdSchema,
    name: z.string().min(1),
    status: z.enum(["active", "suspended"]).default("active"),
    domains: z.object({
        /** Host with no scheme, no port; bare for CRC/BL, the vercel.app alias for new tenants. */
        primary: z.string().min(1),
        aliases: z.array(z.string()).default([]),
    }),
    branding: BrandingSchema,
    vocabulary: VocabularySchema,
    locale: LocaleSchema,
    email: EmailSchema,
    legal: LegalSchema,
    features: FeaturesSchema,
    driveInbox: DriveInboxSchema.default({ folderId: "" }),
    library: LibrarySchema,
    liturgy: LiturgySchema,
    congregationDefaults: CongregationDefaultsSchema,
    /** Tenant text appended to the shared core MCP agent guide. */
    agentGuide: z.string().default(""),
    /**
     * Phase 4. "generated": the MCP instructions are generated facts + agentGuide
     * + the shared core. "verbatim": agentGuide (or, when empty, the bundled
     * .paul/AGENT-GUIDE.md) is served unchanged — CRC. Absent: verbatim for crc,
     * generated otherwise (src/lib/mcp/agent-guide.ts agentGuideModeOf).
     */
    agentGuideMode: z.enum(["verbatim", "generated"]).optional(),
    /** Schema version of this document, bumped on breaking shape changes. */
    configVersion: z.literal(1).default(1),
})

export type OrgConfig = z.infer<typeof OrgConfigSchema>
export type OrgConfigInput = z.input<typeof OrgConfigSchema>

/** The config fields that live on `orgs/{id}` (timestamps etc. are ignored). */
export function parseOrgConfig(raw: unknown): { ok: true; config: OrgConfig } | { ok: false; error: string } {
    const r = OrgConfigSchema.safeParse(raw)
    if (r.success) return { ok: true, config: r.data }
    return { ok: false, error: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }
}
