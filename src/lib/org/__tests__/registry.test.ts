import { describe, it, expect } from "vitest"
import {
    resolveOrgIdByDomain,
    getOrg,
    isKnownOrg,
    DEFAULT_ORG_ID,
} from "@/lib/org/registry"

describe("resolveOrgIdByDomain", () => {
    it("resolves centralreform.live → crc", () => {
        expect(resolveOrgIdByDomain("centralreform.live")).toBe("crc")
    })

    it("resolves www. / port / case variants of centralreform.live → crc", () => {
        expect(resolveOrgIdByDomain("www.centralreform.live")).toBe("crc")
        expect(resolveOrgIdByDomain("centralreform.live:3000")).toBe("crc")
        expect(resolveOrgIdByDomain("CentralReform.Live")).toBe("crc")
    })

    it("resolves brotherslazaroff.live (+ www, port) → brotherslazaroff", () => {
        expect(resolveOrgIdByDomain("brotherslazaroff.live")).toBe("brotherslazaroff")
        expect(resolveOrgIdByDomain("www.brotherslazaroff.live")).toBe("brotherslazaroff")
        expect(resolveOrgIdByDomain("brotherslazaroff.live:443")).toBe("brotherslazaroff")
    })

    it("defaults unknown / empty / undefined / localhost / vercel host → crc", () => {
        expect(resolveOrgIdByDomain("example.com")).toBe(DEFAULT_ORG_ID)
        expect(resolveOrgIdByDomain("")).toBe(DEFAULT_ORG_ID)
        expect(resolveOrgIdByDomain(null)).toBe(DEFAULT_ORG_ID)
        expect(resolveOrgIdByDomain(undefined)).toBe(DEFAULT_ORG_ID)
        expect(resolveOrgIdByDomain("localhost:3000")).toBe(DEFAULT_ORG_ID)
        expect(resolveOrgIdByDomain("sheet-music-app.vercel.app")).toBe(DEFAULT_ORG_ID)
    })
})

describe("getOrg / isKnownOrg", () => {
    it("returns metadata for seeded orgs", () => {
        expect(getOrg("crc")?.domain).toBe("centralreform.live")
        expect(getOrg("brotherslazaroff")?.name).toBe("Brothers Lazaroff")
        expect(isKnownOrg("crc")).toBe(true)
        expect(isKnownOrg("brotherslazaroff")).toBe(true)
    })

    it("rejects unknown org ids", () => {
        expect(getOrg("nope")).toBeUndefined()
        expect(isKnownOrg("nope")).toBe(false)
    })
})
