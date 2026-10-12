import { describe, expect, it } from "vitest"

import {
    claimsHaveM,
    joinSessionKey,
    membershipClaimDrifted,
    resolveClientRole,
} from "@/lib/org/client-role"

/**
 * Multi-tenant phase 2 — the browser's transition rule (P2 design §3.6):
 * `m` present → membership role; `m` absent → legacy profile role; po → admin.
 */

describe("resolveClientRole", () => {
    it("m absent (unmigrated token): the legacy profile role, unchanged", () => {
        const r = resolveClientRole({
            claims: { role: "band_leader", orgIds: ["crc"] },
            membership: undefined,
            profileRole: "band_leader",
            profileSoundEngineer: true,
        })
        expect(r).toEqual({ role: "band_leader", isSoundEngineer: true, isPlatformOwner: false, source: "legacy" })
    })

    it("m absent: the membership doc is ignored even when present", () => {
        const r = resolveClientRole({
            claims: { role: "musician" },
            membership: { role: "admin", soundEngineer: true },
            profileRole: "musician",
            profileSoundEngineer: false,
        })
        expect(r.role).toBe("musician")
        expect(r.isSoundEngineer).toBe(false)
    })

    it("m present: the membership role in this tenant, not the legacy one", () => {
        const r = resolveClientRole({
            claims: { role: "admin", m: { crc: "ad", brotherslazaroff: "me" } },
            membership: { role: "member", soundEngineer: false },
            profileRole: "admin",
            profileSoundEngineer: true,
        })
        expect(r).toEqual({ role: "member", isSoundEngineer: false, isPlatformOwner: false, source: "membership" })
    })

    it("m present but no membership here: null (treated as pending)", () => {
        const r = resolveClientRole({
            claims: { m: { crc: "mu" } },
            membership: null,
            profileRole: "musician",
            profileSoundEngineer: true,
        })
        expect(r.role).toBeNull()
        expect(r.isSoundEngineer).toBe(false)
    })

    it("m present: sound engineer comes from the membership", () => {
        const r = resolveClientRole({
            claims: { m: { crc: "mu" }, se: ["crc"] },
            membership: { role: "musician", soundEngineer: true },
            profileRole: "musician",
            profileSoundEngineer: false,
        })
        expect(r.isSoundEngineer).toBe(true)
    })

    it("po: admin everywhere, with or without a membership", () => {
        for (const membership of [null, { role: "member" as const }]) {
            const r = resolveClientRole({
                claims: { po: true, m: {} },
                membership,
                profileRole: "admin",
                profileSoundEngineer: false,
            })
            expect(r.role).toBe("admin")
            expect(r.isPlatformOwner).toBe(true)
            expect(r.source).toBe("platform-owner")
        }
    })

    it("no claims yet / no profile: no role", () => {
        expect(resolveClientRole({ claims: null, membership: undefined, profileRole: undefined, profileSoundEngineer: undefined }).role).toBeNull()
    })
})

describe("claimsHaveM", () => {
    it("only a map counts", () => {
        expect(claimsHaveM({ m: {} })).toBe(true)
        expect(claimsHaveM({ m: { crc: "ad" } })).toBe(true)
        expect(claimsHaveM({ m: null })).toBe(false)
        expect(claimsHaveM({ m: ["crc"] })).toBe(false)
        expect(claimsHaveM({ role: "admin" })).toBe(false)
        expect(claimsHaveM(null)).toBe(false)
    })
})

describe("membershipClaimDrifted", () => {
    it("compares m[org] with the membership role code", () => {
        expect(membershipClaimDrifted({ m: { crc: "bl" } }, "crc", { role: "band_leader" })).toBe(false)
        expect(membershipClaimDrifted({ m: { crc: "mu" } }, "crc", { role: "band_leader" })).toBe(true)
        expect(membershipClaimDrifted({ m: { crc: "mu" } }, "crc", null)).toBe(true)
        expect(membershipClaimDrifted({ m: {} }, "crc", { role: "member" })).toBe(true)
    })
    it("denied carries no claim code; no membership and no code is in sync", () => {
        expect(membershipClaimDrifted({ m: {} }, "crc", { role: "denied" })).toBe(false)
        expect(membershipClaimDrifted({ m: { crc: "pe" } }, "crc", { role: "denied" })).toBe(true)
        expect(membershipClaimDrifted({ m: {} }, "brotherslazaroff", null)).toBe(false)
    })
    it("never drifts for a legacy token (the legacy check handles it)", () => {
        expect(membershipClaimDrifted({ role: "admin" }, "crc", null)).toBe(false)
    })
})

describe("joinSessionKey", () => {
    it("is per host and per uid", () => {
        expect(joinSessionKey("crc", "u1")).not.toBe(joinSessionKey("brotherslazaroff", "u1"))
        expect(joinSessionKey("crc", "u1")).not.toBe(joinSessionKey("crc", "u2"))
    })
})
