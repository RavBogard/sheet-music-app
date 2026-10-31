import { describe, it, expect } from "vitest"
import { isTestAccount } from "../people-test-accounts"

describe("isTestAccount", () => {
    it("flags the test uid prefix and the [TEST] name", () => {
        expect(isTestAccount({ uid: "test-admin-aee7821e", displayName: "Someone" })).toBe(true)
        expect(isTestAccount({ uid: "u1", displayName: "[TEST] admin" })).toBe(true)
    })
    it("leaves real people alone", () => {
        expect(isTestAccount({ uid: "abc123", displayName: "Drew Brodsky" })).toBe(false)
        expect(isTestAccount({ uid: "contest-1", displayName: "Tess" })).toBe(false)
    })
})
