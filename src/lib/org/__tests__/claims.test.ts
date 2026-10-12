import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/firebase-admin", () => ({ initAdmin: vi.fn(), getAuth: vi.fn(), getFirestore: vi.fn() }))

import { buildClaims, canonicalClaims, CLAIMS_BYTE_LIMIT } from "@/lib/org/claims"
import type { Membership, TenantRole } from "@/lib/org/membership-types"
import { tenantRoleFromClaims } from "@/lib/org/membership-types"

function mem(tenantId: string, role: TenantRole, soundEngineer = false): Membership {
    return { uid: "u", tenantId, role, soundEngineer, addedBy: "x", addedAt: new Date(0) }
}

describe("buildClaims (design §3.2)", () => {
    it("writes m, se and the legacy mirrors from memberships", () => {
        const c = buildClaims({}, [mem("brotherslazaroff", "admin"), mem("crc", "band_leader", true)], false)
        expect(c).toEqual({
            m: { crc: "bl", brotherslazaroff: "ad" },
            se: ["crc"],
            role: "admin",
            orgIds: ["crc", "brotherslazaroff"],
            soundEngineer: true,
        })
        expect(Object.keys(c.m as object)).toEqual(["crc", "brotherslazaroff"])
    })

    it("po adds po:true; denied is omitted everywhere; pending is in m but not orgIds", () => {
        const c = buildClaims({}, [mem("crc", "admin"), mem("brotherslazaroff", "denied")], true)
        expect(c).toEqual({ po: true, m: { crc: "ad" }, role: "admin", orgIds: ["crc"] })
        const p = buildClaims({}, [mem("brotherslazaroff", "pending", true)], false)
        expect(p).toEqual({ m: { brotherslazaroff: "pe" }, role: "pending" })
    })

    it("no memberships → empty m (the token is read through m, never legacy) and no role", () => {
        expect(buildClaims({ role: "admin", orgIds: ["crc"], soundEngineer: true, po: true }, [], false)).toEqual({ m: {} })
    })

    it("preserves every key it does not own (admin_test etc.) and replaces the ones it does", () => {
        const c = buildClaims(
            { admin_test: true, role: "musician", orgIds: ["brotherslazaroff"], foo: 1 },
            [mem("crc", "member")],
            false,
        )
        expect(c).toEqual({ admin_test: true, foo: 1, m: { crc: "me" }, role: "member", orgIds: ["crc"] })
    })

    it("throws when the claim set would exceed the byte limit", () => {
        const many = Array.from({ length: 60 }, (_, i) => mem(`tenant-number-${i}`, "musician", true))
        expect(() => buildClaims({}, many, false)).toThrow(/limit 900/)
        expect(CLAIMS_BYTE_LIMIT).toBe(900)
    })

    it("canonicalClaims ignores key order but not array order", () => {
        expect(canonicalClaims({ a: 1, b: { y: 1, x: [1, 2] } })).toBe(canonicalClaims({ b: { x: [1, 2], y: 1 }, a: 1 }))
        expect(canonicalClaims({ a: [1, 2] })).not.toBe(canonicalClaims({ a: [2, 1] }))
    })
})

describe("tenantRoleFromClaims (§3.5 transition)", () => {
    it("po → admin; m decides when present; legacy role otherwise", () => {
        expect(tenantRoleFromClaims({ po: true, m: {} }, "brotherslazaroff")).toBe("admin")
        expect(tenantRoleFromClaims({ m: { crc: "bl" }, role: "admin" }, "crc")).toBe("band_leader")
        expect(tenantRoleFromClaims({ m: { crc: "bl" }, role: "admin" }, "brotherslazaroff")).toBeUndefined()
        expect(tenantRoleFromClaims({ role: "musician" }, "brotherslazaroff")).toBe("musician")
        expect(tenantRoleFromClaims({}, "crc")).toBeUndefined()
        expect(tenantRoleFromClaims(null, "crc")).toBeUndefined()
    })
})
