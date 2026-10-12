import { codeOrgConfig } from "@/lib/org/config-code"
import { primeOrgConfig } from "@/lib/org/config-cache"
import { OrgConfigSchema, type OrgConfig, type OrgConfigInput } from "@/lib/org/config-schema"

/**
 * Multi-tenant phase 1 test fixture: a fictional third tenant ("testshul",
 * Hebrew, Asia/Jerusalem, Israel calendar, shul mode) built on the CRC code
 * config with its identity swapped. Golden tests prime it to prove a surface
 * reads tenant config rather than a hardcoded CRC value.
 */
export function makeTestOrgConfig(overrides: Partial<OrgConfigInput> = {}): OrgConfig {
    const crc = codeOrgConfig("crc")!
    return OrgConfigSchema.parse({
        ...crc,
        id: "testshul",
        name: "Test Shul Tehila",
        domains: { primary: "testshul.vercel.app", aliases: [] },
        branding: {
            ...crc.branding,
            shortName: "Test Shul Music",
            abbreviation: "TST",
            appName: "Test Shul Tehila Music",
            metaTitleDefault: "Test Shul Music",
            metaTitleTemplate: "%s | Test Shul Music",
            metaDescription: "Charts and setlists for Test Shul Tehila",
            ogTitle: "Test Shul Tehila — Music",
            themeColor: "#123456",
            logoUrl: "",
            location: "Jerusalem",
            manifestPath: "/manifest-testshul.json",
            baseUrl: "https://testshul.vercel.app",
        },
        vocabulary: { mode: "shul", overrides: {} },
        locale: {
            language: "he",
            direction: "rtl",
            timeZone: "Asia/Jerusalem",
            calendar: "israel",
            reminderLocalHour: 5,
            reminderUtcHour: null,
        },
        email: { ...crc.email, fromName: "Test Shul Music", footerText: "Test Shul Tehila" },
        legal: { operatorName: "Test Shul Tehila", contactEmail: "music@testshul.example", useCrcText: false },
        library: { collections: [{ id: "core", label: "Our Charts" }, { id: "uploads", label: "Uploads" }], defaultCollection: "core" },
        congregationDefaults: {
            name: "Test Shul Tehila",
            shortName: "Test Shul Music",
            location: "Jerusalem",
            logoUrl: "",
            description: "Charts for Test Shul Tehila",
            themeColor: "#123456",
        },
        ...overrides,
    })
}

/** Build, prime and return the fixture tenant. */
export function primeTestOrg(overrides: Partial<OrgConfigInput> = {}): OrgConfig {
    const cfg = makeTestOrgConfig(overrides)
    primeOrgConfig(cfg)
    return cfg
}
