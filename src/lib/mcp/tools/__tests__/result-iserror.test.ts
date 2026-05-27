import { describe, it, expect } from "vitest"
import { isErrorEnvelope } from "../result-iserror"

// F-001 — runtime rejections must surface as result.isError:true. This guards
// the predicate jsonResult() uses to set that flag.
describe("isErrorEnvelope", () => {
    it("flags canonical rich error envelopes (ok:false)", () => {
        expect(
            isErrorEnvelope({
                ok: false,
                error: { code: 409, machine_code: "stale_version", message: "x" },
            }),
        ).toBe(true)
    })

    it("flags a bare lifted legacy envelope (ok:false, string error)", () => {
        expect(isErrorEnvelope({ ok: false, error: "force_required" })).toBe(true)
    })

    it("does NOT flag success envelopes (ok:true)", () => {
        expect(isErrorEnvelope({ ok: true, committed: 3 })).toBe(false)
    })

    it("does NOT flag plain data payloads with no ok field", () => {
        expect(isErrorEnvelope({ setlists: [], total: 0 })).toBe(false)
        expect(isErrorEnvelope([{ id: "s1" }])).toBe(false)
    })

    it("does NOT flag non-object values", () => {
        expect(isErrorEnvelope(null)).toBe(false)
        expect(isErrorEnvelope(undefined)).toBe(false)
        expect(isErrorEnvelope("ok")).toBe(false)
        expect(isErrorEnvelope(0)).toBe(false)
    })

    it("treats truthy/falsey ok strictly — only `ok === false` is an error", () => {
        // a payload that happens to carry ok:0 or ok:'false' is NOT a rich
        // error envelope; only the boolean false sentinel counts.
        expect(isErrorEnvelope({ ok: 0 })).toBe(false)
        expect(isErrorEnvelope({ ok: "false" })).toBe(false)
    })
})
