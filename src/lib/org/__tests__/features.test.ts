import { beforeEach, describe, expect, it, vi } from "vitest"
import { FeaturesSchema, OrgConfigSchema, type OrgConfig } from "@/lib/org/config-schema"
import { codeOrgConfig } from "@/lib/org/config-code"

vi.mock("server-only", () => ({}))

const getOrgConfig = vi.fn()
const cronTenantIds = vi.fn()
vi.mock("@/lib/org/get-org-config", () => ({ getOrgConfig: (id: string) => getOrgConfig(id) }))
vi.mock("@/lib/org/cron-tenants", () => ({ cronTenantIds: () => cronTenantIds() }))

import { hasFeature, requireFeature, tenantFeatures, tenantsWithFeature } from "@/lib/org/features"
import { featureOn, featuresOf } from "@/lib/org/features-client"

const ALL_ON = { mixer: true, driveInbox: true, schedulingEmails: true, todayFeed: true, notifyBand: true, perform: true }

function tenant(id: string, features: Partial<typeof ALL_ON>): OrgConfig {
    const base = codeOrgConfig("crc")!
    return OrgConfigSchema.parse({ ...base, id, domains: { primary: `${id}.vercel.app`, aliases: [] }, features: { ...ALL_ON, ...features } })
}

beforeEach(() => {
    getOrgConfig.mockReset()
    cronTenantIds.mockReset()
})

describe("tenantFeatures", () => {
    it("reads the tenant config", async () => {
        getOrgConfig.mockResolvedValue(tenant("crc", { todayFeed: false }))
        expect((await tenantFeatures("crc")).todayFeed).toBe(false)
    })

    it("falls back to the compiled config when the read throws", async () => {
        getOrgConfig.mockRejectedValue(new Error("boom"))
        expect(await tenantFeatures("crc")).toEqual(codeOrgConfig("crc")!.features)
    })

    it("falls back to the schema defaults for an unknown tenant with no config", async () => {
        getOrgConfig.mockResolvedValue(null)
        expect(await tenantFeatures("nobody")).toEqual(FeaturesSchema.parse({}))
    })

    it("mixer is off for every tenant but crc, even with its flag on", async () => {
        getOrgConfig.mockResolvedValue(tenant("throwaway", { mixer: true }))
        expect(await hasFeature("throwaway", "mixer")).toBe(false)
        getOrgConfig.mockResolvedValue(tenant("crc", { mixer: true }))
        expect(await hasFeature("crc", "mixer")).toBe(true)
    })
})

describe("requireFeature", () => {
    it("null when on", async () => {
        getOrgConfig.mockResolvedValue(tenant("crc", {}))
        expect(await requireFeature("crc", "notifyBand")).toBeNull()
    })

    it("404 feature_off when off", async () => {
        getOrgConfig.mockResolvedValue(tenant("throwaway", { notifyBand: false }))
        const res = await requireFeature("throwaway", "notifyBand")
        expect(res?.status).toBe(404)
        expect(await res!.json()).toEqual({ error: "feature_off", feature: "notifyBand" })
    })
})

describe("tenantsWithFeature", () => {
    it("keeps cron order and drops tenants with the flag off", async () => {
        cronTenantIds.mockResolvedValue(["crc", "brotherslazaroff", "throwaway"])
        getOrgConfig.mockImplementation(async (id: string) => (id === "throwaway" ? tenant(id, { todayFeed: false }) : tenant(id, {})))
        expect(await tenantsWithFeature("todayFeed")).toEqual(["crc", "brotherslazaroff"])
        expect(await tenantsWithFeature("mixer")).toEqual(["crc"])
    })
})

describe("featureOn (client)", () => {
    it("uses the config in hand", () => {
        expect(featureOn(tenant("throwaway", { perform: false }), "perform")).toBe(false)
    })
    it("falls back to the compiled config by orgId when config is null", () => {
        expect(featureOn(null, "mixer", "crc")).toBe(true)
        expect(featuresOf(undefined, "brotherslazaroff")).toEqual({ ...codeOrgConfig("brotherslazaroff")!.features, mixer: false })
    })
    it("schema defaults with neither", () => {
        expect(featureOn(null, "perform")).toBe(true)
        expect(featureOn(null, "todayFeed")).toBe(false)
    })
})
