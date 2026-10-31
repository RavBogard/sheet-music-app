import { describe, it, expect, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { isProfileDoc } from "../tools/templates"

describe("isProfileDoc (MCP-17)", () => {
    it("recognises profile docs by kind, by profile block or by id", () => {
        expect(isProfileDoc("x", { kind: "profile" })).toBe(true)
        expect(isProfileDoc("x", { profile: { key: "a" } })).toBe(true)
        expect(isProfileDoc("profile__crc__shir_shabbat", {})).toBe(true)
    })

    it("leaves ordinary templates alone", () => {
        expect(isProfileDoc("t1", { name: "Randy Shabbat morning", tracks: [] })).toBe(false)
    })
})
