import { describe, expect, it } from "vitest"
import { unwrap } from "@/lib/platform/platform-http"

describe("platform route bodies accept the console's wrapper and the bare object", () => {
    it("unwraps only a single matching key", () => {
        expect(unwrap({ patch: { a: 1 } }, "patch")).toEqual({ a: 1 })
        expect(unwrap({ a: 1 }, "patch")).toEqual({ a: 1 })
        expect(unwrap({ patch: 1, other: 2 }, "patch")).toEqual({ patch: 1, other: 2 })
        expect(unwrap({ features: { mixer: true } }, "features")).toEqual({ mixer: true })
    })
})
