import { describe, expect, it } from "vitest"
import { planLegacyMemberships } from "@/lib/org/legacy-membership-map"

const DANIEL = "93Xn3DbS0bSNb8zmfzLyfOMX1A13"
const DAVID = "HTks9a8YRiVCQ5lVipUJcBsWjnB3"
const owners = [DANIEL]
const overrides = { [DAVID]: { brotherslazaroff: "admin" } }
const BOTH = ["crc", "brotherslazaroff"]

function plan(
    uid: string,
    claims: Record<string, unknown> | null,
    doc: Record<string, unknown> | null,
    includePending = false,
) {
    return planLegacyMemberships({ uid, claims, doc, overrides, owners, includePending })
}

describe("planLegacyMemberships — ruling 5", () => {
    it("David: claim admin both → admin of crc and (override) brotherslazaroff", () => {
        const p = plan(DAVID, { role: "admin", orgIds: BOTH }, { role: "admin", orgIds: BOTH })
        expect(p.memberships).toEqual([
            { orgId: "crc", role: "admin", soundEngineer: false },
            { orgId: "brotherslazaroff", role: "admin", soundEngineer: false },
        ])
        expect(p.po).toBe(false)
        expect(p.flags).toEqual(expect.arrayContaining(["ruling5_admin_crc_only", "override_applied"]))
    })

    it.each(["karen", "drew-1", "drew-2", "crcmusic"])("other admin %s: claim admin both → crc admin only", (uid) => {
        const p = plan(uid, { role: "admin", orgIds: BOTH }, { role: "admin", orgIds: BOTH })
        expect(p.memberships).toEqual([{ orgId: "crc", role: "admin", soundEngineer: false }])
        expect(p.po).toBe(false)
        expect(p.flags).toContain("ruling5_admin_crc_only")
    })

    it("Daniel: crc admin + po; soundEngineer carried", () => {
        const p = plan(
            DANIEL,
            { role: "admin", orgIds: BOTH, soundEngineer: true },
            { role: "admin", orgIds: BOTH, soundEngineer: true },
        )
        expect(p.memberships).toEqual([{ orgId: "crc", role: "admin", soundEngineer: true }])
        expect(p.po).toBe(true)
    })

    it("band leader with both orgIds → band leader in both", () => {
        expect(plan("bl", { role: "band_leader", orgIds: BOTH }, { role: "band_leader" }).memberships).toEqual([
            { orgId: "crc", role: "band_leader", soundEngineer: false },
            { orgId: "brotherslazaroff", role: "band_leader", soundEngineer: false },
        ])
    })

    it("missing orgIds claim → crc only; the doc's orgIds is ignored for approved people", () => {
        const p = plan("mu", { role: "musician" }, { role: "musician", orgIds: BOTH })
        expect(p.memberships).toEqual([{ orgId: "crc", role: "musician", soundEngineer: false }])
        expect(p.flags).toContain("doc_orgIds≠claim")
        expect(plan("me", { role: "member" }, { role: "member" }).memberships).toEqual([
            { orgId: "crc", role: "member", soundEngineer: false },
        ])
    })

    it("soundEngineer only on memberships at member or above", () => {
        const p = plan("se", { role: "musician", soundEngineer: true }, { role: "musician" })
        expect(p.memberships[0].soundEngineer).toBe(true)
        expect(p.flags).toContain("se_doc≠claim")
    })

    it("never-approved: none on touch; pending in doc ∪ claim orgIds in the one-time run", () => {
        expect(plan("p", {}, { role: "pending", orgIds: BOTH }).memberships).toEqual([])
        const once = plan("p", {}, { role: "pending", orgIds: BOTH }, true)
        expect(once.memberships).toEqual([
            { orgId: "crc", role: "pending", soundEngineer: false },
            { orgId: "brotherslazaroff", role: "pending", soundEngineer: false },
        ])
        expect(once.flags).toContain("pending_default_both")
        expect(plan("p2", null, { orgIds: ["brotherslazaroff"] }, true).memberships.map((m) => m.orgId)).toEqual([
            "crc",
            "brotherslazaroff",
        ])
    })

    it("doc role denied → denied in the one-time run", () => {
        expect(plan("d", {}, { role: "denied", orgIds: ["crc"] }, true).memberships).toEqual([
            { orgId: "crc", role: "denied", soundEngineer: false },
        ])
    })

    it("flags doc role drift", () => {
        expect(plan("x", { role: "member" }, { role: "admin" }).flags).toContain("doc_role≠claim")
        expect(plan("y", {}, { role: "pending" }).flags).not.toContain("doc_role≠claim")
    })
})
