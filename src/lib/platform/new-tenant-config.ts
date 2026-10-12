import { OrgConfigSchema, type OrgConfig, type OrgConfigInput } from "@/lib/org/config-schema"
import { VERCEL_APP_SUFFIX } from "@/lib/platform/tenant-address"
import { deepMerge } from "@/lib/platform/diff"
import type { OrgId } from "@/lib/org/types"

/**
 * Multi-tenant phase 4: a new tenant's config from the few things the platform
 * owner types (name, and optionally short name, kind, time zone, language,
 * features). Every other required field gets a plain default derived from the
 * name and the default address, then the schema fills its own defaults. Pure.
 *
 * Nothing here is CRC's or BL's text: a new tenant starts neutral.
 */

type DeepPartial<T> = T extends Array<infer _U> ? T : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T

/** What createTenant accepts as `config`: the name is required, everything else optional. */
export type NewTenantConfigInput = DeepPartial<Omit<OrgConfigInput, "id">> & { name: string }

export const NEW_TENANT_THEME = "#4f46e5"

function initials(name: string): string {
    const words = name
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter(Boolean)
    const s = words
        .slice(0, 3)
        .map((w) => w[0]!.toUpperCase())
        .join("")
    return s || name.slice(0, 2).toUpperCase() || "T"
}

export function newTenantDefaults(orgId: OrgId, name: string, subdomain: string): OrgConfigInput {
    const host = `${subdomain}${VERCEL_APP_SUFFIX}`
    return {
        id: orgId,
        name,
        status: "active",
        domains: { primary: host, aliases: [] },
        branding: {
            shortName: name,
            abbreviation: initials(name),
            appName: name,
            metaTitleDefault: name,
            metaTitleTemplate: `%s | ${name}`,
            metaDescription: `Charts and setlists for ${name}.`,
            ogTitle: name,
            themeColor: NEW_TENANT_THEME,
            manifestPath: "/manifest.json",
            baseUrl: `https://${host}`,
        },
        vocabulary: { mode: "shul" },
        locale: { language: "en", direction: "ltr", timeZone: "America/Chicago" },
        email: { fromName: name, headerBg: NEW_TENANT_THEME, footerText: name },
        legal: { operatorName: "Rabbi Daniel Bogard" },
        features: { mixer: false, driveInbox: false, schedulingEmails: false, todayFeed: false, notifyBand: false, perform: true },
        library: {
            collections: [
                { id: "core", label: "Charts" },
                { id: "uploads", label: "Uploads" },
            ],
            defaultCollection: "core",
        },
        liturgy: {},
        congregationDefaults: { name, shortName: name, themeColor: NEW_TENANT_THEME },
        agentGuide: "",
        configVersion: 1,
    }
}

/**
 * Build and validate. `liturgyFrom` copies service types, rabbi slots and books
 * (the "copy liturgy frames and books" option). Hebrew locale implies rtl
 * unless the caller says otherwise.
 */
export function buildNewTenantConfig(
    orgId: OrgId,
    input: NewTenantConfigInput,
    subdomain: string,
    liturgyFrom?: OrgConfig | null,
): { ok: true; config: OrgConfig } | { ok: false; error: string } {
    let merged = deepMerge(newTenantDefaults(orgId, input.name, subdomain), input) as OrgConfigInput
    merged = { ...merged, id: orgId, status: "active" }
    if (input.locale?.language === "he" && !input.locale.direction) merged = deepMerge(merged, { locale: { direction: "rtl" } })
    if (liturgyFrom) {
        merged = deepMerge(merged, {
            liturgy: {
                serviceTypes: structuredClone(liturgyFrom.liturgy.serviceTypes),
                rabbiSlots: structuredClone(liturgyFrom.liturgy.rabbiSlots),
                books: [...liturgyFrom.liturgy.books],
            },
        })
    }
    const r = OrgConfigSchema.safeParse(merged)
    if (r.success) return { ok: true, config: r.data }
    return { ok: false, error: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }
}
