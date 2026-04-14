import { describe, it, expect } from "vitest"
import { canEditSetlist } from "@/lib/setlist-permissions"

const regular = { uid: "u1", isBandLeader: false, isAdmin: false }
const leader = { uid: "u1", isBandLeader: true, isAdmin: false }
const admin = { uid: "u1", isBandLeader: false, isAdmin: true }

describe("canEditSetlist", () => {
    it("returns true when the user owns the setlist", () => {
        expect(canEditSetlist({ ownerId: "u1" }, regular)).toBe(true)
    })

    it("returns true for band leaders regardless of ownership", () => {
        expect(canEditSetlist({ ownerId: "other" }, leader)).toBe(true)
    })

    it("returns true for admins regardless of ownership", () => {
        expect(canEditSetlist({ ownerId: "other" }, admin)).toBe(true)
    })

    it("returns false for unprivileged non-owner", () => {
        expect(canEditSetlist({ ownerId: "other" }, regular)).toBe(false)
    })

    it("treats legacy docs without ownerId as accessible (v2.5 P8.1)", () => {
        expect(canEditSetlist({ ownerId: undefined as unknown as string }, regular)).toBe(true)
        expect(canEditSetlist({ ownerId: "" }, regular)).toBe(true)
    })

    it("returns false when setlist is null/undefined", () => {
        expect(canEditSetlist(null, regular)).toBe(false)
        expect(canEditSetlist(undefined, regular)).toBe(false)
    })

    it("returns false when uid is missing and caller is unprivileged", () => {
        expect(canEditSetlist({ ownerId: "u1" }, { uid: null, isBandLeader: false, isAdmin: false })).toBe(false)
        expect(canEditSetlist({ ownerId: "u1" }, { uid: undefined, isBandLeader: false, isAdmin: false })).toBe(false)
    })
})
