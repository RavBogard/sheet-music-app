import { codeOrgConfig } from "@/lib/org/config-code"
import { OrgConfigSchema, type OrgConfig } from "@/lib/org/config-schema"

/**
 * A third tenant as phase 4 tests see it: a shul created through config (no
 * compiled config), mixer and band notifications off, chart inbox on.
 */
export function testshulConfig(): OrgConfig {
    const crc = codeOrgConfig("crc")!
    return OrgConfigSchema.parse({
        ...crc,
        id: "testshul",
        name: "Test Shul",
        domains: { primary: "testshul.vercel.app", aliases: [] },
        branding: { ...crc.branding, shortName: "Test Shul", abbreviation: "TS", appName: "Test Shul", baseUrl: "https://testshul.vercel.app" },
        vocabulary: { mode: "shul", overrides: {} },
        locale: { ...crc.locale, timeZone: "America/New_York" },
        features: { mixer: false, driveInbox: true, schedulingEmails: false, todayFeed: false, notifyBand: false, perform: true },
        liturgy: {
            ...crc.liturgy,
            serviceTypes: [
                { key: "kabbalat_test", label: "Kabbalat Shabbat Test", defaultStart: "" },
                { key: "morning_test", label: "Morning Test", defaultStart: "" },
            ],
        },
        agentGuide: "",
        agentGuideMode: undefined,
    })
}
