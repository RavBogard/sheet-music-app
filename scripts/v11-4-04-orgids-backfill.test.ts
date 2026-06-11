// v11.4-04-02 — unit tests for the backfill's PURE decision helpers.
// No Firestore/Auth dependency: the script imports firebase-admin dynamically
// (inside its I/O functions only), so importing it here pulls only the pure set.

import { describe, it, expect } from "vitest"
import {
    TARGET_ORG_IDS,
    targetOrgIds,
    alreadyBoth,
    snapshotEntry,
    rollbackTargets,
    DELETE_SENTINEL,
} from "./v11-4-04-orgids-backfill.mjs"

describe("targetOrgIds", () => {
    it("is the two-tenant set", () => {
        expect(targetOrgIds()).toEqual(["crc", "brotherslazaroff"])
    })
    it("returns a fresh copy (not the shared constant)", () => {
        const a = targetOrgIds()
        a.push("mutated")
        expect(targetOrgIds()).toEqual(["crc", "brotherslazaroff"])
        expect(TARGET_ORG_IDS).toEqual(["crc", "brotherslazaroff"])
    })
})

describe("alreadyBoth", () => {
    it("is true only when BOTH doc and claim equal the target (order-insensitive)", () => {
        expect(alreadyBoth(["crc", "brotherslazaroff"], ["crc", "brotherslazaroff"])).toBe(true)
        expect(alreadyBoth(["brotherslazaroff", "crc"], ["crc", "brotherslazaroff"])).toBe(true)
    })
    it("is false for crc-only / bl-only / absent on either side", () => {
        expect(alreadyBoth(["crc"], ["crc", "brotherslazaroff"])).toBe(false)
        expect(alreadyBoth(["crc", "brotherslazaroff"], ["crc"])).toBe(false)
        expect(alreadyBoth(["brotherslazaroff"], ["brotherslazaroff"])).toBe(false)
        expect(alreadyBoth(undefined, ["crc", "brotherslazaroff"])).toBe(false)
        expect(alreadyBoth(["crc", "brotherslazaroff"], undefined)).toBe(false)
        expect(alreadyBoth(undefined, undefined)).toBe(false)
    })
    it("is false when doc is both but claim is crc-only (lockstep still needs the claim write)", () => {
        expect(alreadyBoth(["crc", "brotherslazaroff"], ["crc"])).toBe(false)
    })
})

describe("snapshotEntry", () => {
    it("records prev arrays as-is", () => {
        expect(snapshotEntry("u1", ["crc"], ["crc", "brotherslazaroff"])).toEqual({
            uid: "u1",
            prevDocOrgIds: ["crc"],
            prevClaimOrgIds: ["crc", "brotherslazaroff"],
        })
    })
    it("records an ABSENT field (non-array) as null", () => {
        expect(snapshotEntry("u2", undefined, undefined)).toEqual({
            uid: "u2",
            prevDocOrgIds: null,
            prevClaimOrgIds: null,
        })
        expect(snapshotEntry("u3", ["crc"], undefined)).toEqual({
            uid: "u3",
            prevDocOrgIds: ["crc"],
            prevClaimOrgIds: null,
        })
    })
})

describe("rollbackTargets", () => {
    it("array prev → that array for both doc and claim", () => {
        const t = rollbackTargets({ uid: "u1", prevDocOrgIds: ["crc"], prevClaimOrgIds: ["brotherslazaroff"] })
        expect(t.doc).toEqual(["crc"])
        expect(t.claim).toEqual(["brotherslazaroff"])
    })
    it("null prev → the DELETE sentinel (absent→delete the field)", () => {
        const t = rollbackTargets({ uid: "u2", prevDocOrgIds: null, prevClaimOrgIds: null })
        expect(t.doc).toBe(DELETE_SENTINEL)
        expect(t.claim).toBe(DELETE_SENTINEL)
    })
    it("mixed: array doc, absent claim", () => {
        const t = rollbackTargets({ uid: "u3", prevDocOrgIds: ["crc", "brotherslazaroff"], prevClaimOrgIds: null })
        expect(t.doc).toEqual(["crc", "brotherslazaroff"])
        expect(t.claim).toBe(DELETE_SENTINEL)
    })
})
