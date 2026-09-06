import { describe, expect, it } from "vitest"
import { isTestUid, TEST_UID_PREFIXES } from "@/lib/test-isolation"

describe("isTestUid", () => {
    it("returns true for canonical test- prefix uids", () => {
        expect(isTestUid("test-band_leader-abcd1234")).toBe(true)
        expect(isTestUid("test-musician-deadbeef")).toBe(true)
        expect(isTestUid("test-c7i1-band_leader-db04aebb")).toBe(true)
    })

    it("returns true for cycle-instance probe uids (cNiN-…)", () => {
        expect(isTestUid("c7i1-band_leader-db04aebb")).toBe(true)
        expect(isTestUid("c5i2-musician-cafe1234")).toBe(true)
        expect(isTestUid("c12i9-band_leader-x")).toBe(true)
    })

    it("returns true for cycle-instance probe uids with letter sub-tag (cNiN[a]-…)", () => {
        expect(isTestUid("c7i3a-band_leader-deadbeef")).toBe(true)
        expect(isTestUid("c7i3b-musician-feedface")).toBe(true)
    })

    it("returns true for cycle-followup probe uids (cfN-…)", () => {
        expect(isTestUid("cf2-band_leader-12345678")).toBe(true)
        expect(isTestUid("cf12-member-aabbccdd")).toBe(true)
    })

    it("returns false for real prod uid shapes (Firebase Auth defaults)", () => {
        expect(isTestUid("firebase-auth-rJ8K3lXq2vYZf0mNpA")).toBe(false)
        expect(isTestUid("uW0pQ4xR9nLcVtA2hKsBy7fH")).toBe(false)
        expect(isTestUid("daniel-uid-not-prefixed")).toBe(false)
    })

    it("returns false for uids that CONTAIN but don't START with a test prefix", () => {
        expect(isTestUid("user-test-band_leader-abc")).toBe(false)
        expect(isTestUid("real-c7i1-suffix")).toBe(false)
        expect(isTestUid("prefix-cf2-thing")).toBe(false)
    })

    it("returns false for null / undefined / empty / non-string", () => {
        expect(isTestUid(null)).toBe(false)
        expect(isTestUid(undefined)).toBe(false)
        expect(isTestUid("")).toBe(false)
        // @ts-expect-error — deliberate runtime hostile input
        expect(isTestUid(42)).toBe(false)
        // @ts-expect-error — deliberate runtime hostile input
        expect(isTestUid({})).toBe(false)
    })

    it("does not match similar-looking but non-test shapes", () => {
        // single-letter c<N>i<N> requires both digits — `ci-x` should NOT match
        expect(isTestUid("ci-band_leader-x")).toBe(false)
        // `c-` alone is not a test prefix
        expect(isTestUid("c-something")).toBe(false)
        // cf without digit is not a followup prefix
        expect(isTestUid("cf-something")).toBe(false)
        // `test` without trailing hyphen is not the canonical mint shape
        expect(isTestUid("testuser")).toBe(false)
    })

    it("exports the prefix regex for direct consumers (e.g. cleanup sweeps)", () => {
        expect(TEST_UID_PREFIXES).toBeInstanceOf(RegExp)
        expect(TEST_UID_PREFIXES.test("test-foo")).toBe(true)
        expect(TEST_UID_PREFIXES.test("c7i1-foo")).toBe(true)
        // Regex is shared — calling .test() repeatedly should not be sticky.
        expect(TEST_UID_PREFIXES.test("test-foo")).toBe(true)
    })
})
