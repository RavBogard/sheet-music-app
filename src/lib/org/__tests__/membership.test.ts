import { describe, it, expect } from "vitest"
import { getOrgIdsFromClaims, userInOrg } from "@/lib/org/membership"

describe("getOrgIdsFromClaims", () => {
    it("defaults missing claims to [crc] (backward-compat contract)", () => {
        expect(getOrgIdsFromClaims(undefined)).toEqual(["crc"])
        expect(getOrgIdsFromClaims(null)).toEqual(["crc"])
        expect(getOrgIdsFromClaims({})).toEqual(["crc"])
        expect(getOrgIdsFromClaims({ role: "band_leader" })).toEqual(["crc"])
    })

    it("defaults empty / malformed orgIds to [crc]", () => {
        expect(getOrgIdsFromClaims({ orgIds: [] })).toEqual(["crc"])
        expect(getOrgIdsFromClaims({ orgIds: [123, null] })).toEqual(["crc"])
        expect(getOrgIdsFromClaims({ orgIds: "crc" })).toEqual(["crc"])
    })

    it("returns the explicit org list when present", () => {
        expect(getOrgIdsFromClaims({ orgIds: ["brotherslazaroff"] })).toEqual([
            "brotherslazaroff",
        ])
        expect(getOrgIdsFromClaims({ orgIds: ["crc", "brotherslazaroff"] })).toEqual([
            "crc",
            "brotherslazaroff",
        ])
    })
})

describe("userInOrg", () => {
    it("gates by membership", () => {
        const claims = { orgIds: ["brotherslazaroff"] }
        expect(userInOrg(claims, "brotherslazaroff")).toBe(true)
        expect(userInOrg(claims, "crc")).toBe(false)
    })

    it("missing claims grant crc only", () => {
        expect(userInOrg(undefined, "crc")).toBe(true)
        expect(userInOrg(undefined, "brotherslazaroff")).toBe(false)
    })
})
