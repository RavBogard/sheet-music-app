import { describe, it, expect } from "vitest"
import { orgFrom, type AuthExtra } from "../org-context"

/**
 * v11-02-01 AC-3: orgFrom is the single tested seam v11-02-02/03 consume.
 * It reads the bearer's resolved orgId off AuthInfo.extra, defaults crc, and
 * mirrors uidFrom's unauthenticated-throws contract.
 */

function extraWith(props: Record<string, unknown>): AuthExtra {
    return { authInfo: { extra: props } }
}

describe("orgFrom", () => {
    it("returns the stamped orgId when present", () => {
        expect(orgFrom(extraWith({ uid: "david", orgId: "brotherslazaroff" }))).toBe(
            "brotherslazaroff",
        )
    })

    it("defaults to crc when orgId is absent (uid present)", () => {
        expect(orgFrom(extraWith({ uid: "daniel" }))).toBe("crc")
    })

    it("defaults to crc when orgId is an empty string", () => {
        expect(orgFrom(extraWith({ uid: "daniel", orgId: "" }))).toBe("crc")
    })

    it("throws on an unauthenticated context (no uid)", () => {
        expect(() => orgFrom(extraWith({ orgId: "brotherslazaroff" }))).toThrow(
            "Unauthenticated MCP request",
        )
        expect(() => orgFrom({})).toThrow("Unauthenticated MCP request")
        expect(() => orgFrom({ authInfo: { extra: {} } })).toThrow(
            "Unauthenticated MCP request",
        )
    })
})
