import { describe, it, expect, vi, beforeEach } from "vitest"
import {
    getOrgIdsFromClaims,
    userInOrg,
    getPrimaryOrgForMinting,
} from "@/lib/org/membership"

// v11-02b: getPrimaryOrgForMinting → getUserOrgIds lazy-imports firebase-admin.
// Mock it so the unit test drives the resolver deterministically without the
// emulator (the full claim→mint→doc chain is proven in
// src/lib/mcp/__tests__/mint-org-aware.emulator.test.ts).
let mockClaims: Record<string, unknown> | undefined
let mockGetUserThrows = false
vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: () => true,
    getAuth: () => ({
        getUser: async (_uid: string) => {
            if (mockGetUserThrows) throw new Error("user not found")
            return { customClaims: mockClaims }
        },
    }),
}))

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

describe("getPrimaryOrgForMinting (v11-02b)", () => {
    beforeEach(() => {
        mockClaims = undefined
        mockGetUserThrows = false
    })

    it("returns the member's org from their orgIds claim", async () => {
        mockClaims = { role: "band_leader", orgIds: ["brotherslazaroff"] }
        expect(await getPrimaryOrgForMinting("david")).toBe("brotherslazaroff")
    })

    it("defaults crc for a claimless / empty / malformed user", async () => {
        mockClaims = undefined
        expect(await getPrimaryOrgForMinting("crc-user")).toBe("crc")
        mockClaims = { orgIds: [] }
        expect(await getPrimaryOrgForMinting("crc-user")).toBe("crc")
        mockClaims = { role: "band_leader" }
        expect(await getPrimaryOrgForMinting("crc-user")).toBe("crc")
    })

    it("never throws on a missing user (defaults crc)", async () => {
        mockGetUserThrows = true
        expect(await getPrimaryOrgForMinting("ghost")).toBe("crc")
    })

    it("uses the FIRST org when the claim lists multiple (documented caveat)", async () => {
        mockClaims = { orgIds: ["brotherslazaroff", "crc"] }
        expect(await getPrimaryOrgForMinting("multi")).toBe("brotherslazaroff")
    })
})
