import { afterEach, describe, expect, it } from "vitest"
import { httpError, redactInProduction } from "../error-envelope"
import { MACHINE_CODE_RE } from "@/lib/mcp/error-envelopes"

/**
 * SEC-002 (cycle-2) — pin the contract for the HTTP rich-error
 * envelope helper. Mirrors the MCP rich envelope shape so an agent
 * sees one wire contract across both surfaces.
 */

describe("httpError", () => {
    it("emits the canonical rich envelope shape on the body", async () => {
        const res = httpError(
            404,
            "file_not_found",
            "No chart found for the given fileId.",
            { fileId: "abc" },
            "Verify via list_library.",
        )
        expect(res.status).toBe(404)
        const body = (await res.json()) as Record<string, unknown>
        expect(body).toEqual({
            ok: false,
            error: "file_not_found",
            message: "No chart found for the given fileId.",
            fileId: "abc",
            hint: "Verify via list_library.",
        })
    })

    it("emits a snake_case machine code that passes MACHINE_CODE_RE", async () => {
        const res = httpError(
            401,
            "unauthenticated",
            "Bearer token required.",
        )
        const body = (await res.json()) as Record<string, unknown>
        expect(MACHINE_CODE_RE.test(body.error as string)).toBe(true)
    })

    it("omits the hint field when not supplied", async () => {
        const res = httpError(500, "internal_error", "Whoops.")
        const body = (await res.json()) as Record<string, unknown>
        expect("hint" in body).toBe(false)
    })

    it("preserves passed-in headers (CORS, cache-control)", () => {
        const res = httpError(404, "file_not_found", "Missing.", undefined, undefined, {
            "Access-Control-Allow-Origin": "https://centralreform.live",
            "Cache-Control": "no-store",
        })
        expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
            "https://centralreform.live",
        )
        expect(res.headers.get("Cache-Control")).toBe("no-store")
    })

    it("spreads context fields alongside the envelope", async () => {
        const res = httpError(409, "chart_in_use", "Bound to setlists.", {
            fileId: "abc",
            boundTracks: 3,
        })
        const body = (await res.json()) as Record<string, unknown>
        expect(body.fileId).toBe("abc")
        expect(body.boundTracks).toBe(3)
    })

    it("sets HTTP status from the first arg", () => {
        expect(httpError(401, "x", "msg").status).toBe(401)
        expect(httpError(404, "x", "msg").status).toBe(404)
        expect(httpError(502, "x", "msg").status).toBe(502)
    })
})

describe("redactInProduction", () => {
    // Node's process.env can be reassigned directly; defineProperty
    // throws in Node 22+ because the descriptor is non-configurable.
    const originalEnv = process.env.NODE_ENV

    afterEach(() => {
        process.env.NODE_ENV = originalEnv
    })

    it("keeps all fields in development / test mode", () => {
        process.env.NODE_ENV = "development"
        const ctx = { fileId: "abc", debug: { receivedId: "abc" } }
        const out = redactInProduction(ctx, ["debug"])
        expect(out.fileId).toBe("abc")
        expect(out.debug).toEqual({ receivedId: "abc" })
    })

    it("strips the named keys when NODE_ENV === 'production'", () => {
        process.env.NODE_ENV = "production"
        const ctx = { fileId: "abc", debug: { receivedId: "abc" } }
        const out = redactInProduction(ctx, ["debug"])
        expect(out.fileId).toBe("abc")
        expect("debug" in out).toBe(false)
    })

    it("does not mutate the input object", () => {
        process.env.NODE_ENV = "production"
        const ctx = { fileId: "abc", debug: { receivedId: "abc" } }
        const out = redactInProduction(ctx, ["debug"])
        expect(ctx.debug).toEqual({ receivedId: "abc" }) // input untouched
        expect(out).not.toBe(ctx)
    })

    it("handles missing keys gracefully (no-op for absent fields)", () => {
        process.env.NODE_ENV = "production"
        const ctx: { fileId: string; other?: string } = { fileId: "abc" }
        const out = redactInProduction(ctx, ["fileId", "other"])
        expect("fileId" in out).toBe(false)
        expect("other" in out).toBe(false)
    })
})
