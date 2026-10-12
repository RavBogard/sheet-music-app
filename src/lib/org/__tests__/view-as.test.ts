import { describe, expect, it } from "vitest"
import { hasViewAsCookie, isWriteMethod } from "@/lib/org/view-as"

describe("view-as helpers (multi-tenant phase 4)", () => {
    it("reads the cookie exactly", () => {
        expect(hasViewAsCookie("a=1; __view_as=1")).toBe(true)
        expect(hasViewAsCookie("__view_as=0")).toBe(false)
        expect(hasViewAsCookie("x__view_as=1")).toBe(false)
        expect(hasViewAsCookie(null)).toBe(false)
    })
    it("only GET/HEAD/OPTIONS are reads", () => {
        for (const m of ["GET", "head", "OPTIONS"]) expect(isWriteMethod(m)).toBe(false)
        for (const m of ["POST", "PUT", "PATCH", "DELETE"]) expect(isWriteMethod(m)).toBe(true)
    })
})
