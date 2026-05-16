import { describe, expect, it } from "vitest"
import { remapValidationError } from "../zod-envelope-remap"

/**
 * F-02 (2026-05-16 bugstomp): pin the contract for the JSON-RPC -32602
 * → {error: "..."} envelope remap. The function is a pure transform on
 * the parsed response body — no HTTP, no Zod, no MCP SDK required.
 */
describe("remapValidationError", () => {
    it("rewrites -32602 single-response error as a result with the {error} envelope", () => {
        const body = {
            jsonrpc: "2.0",
            id: 42,
            error: {
                code: -32602,
                message:
                    'Input validation error: Invalid arguments for tool create_setlist: [{"path":["name"],"message":"Too small"}]',
            },
        }
        const out = remapValidationError(body) as Record<string, unknown>
        expect(out).not.toBe(body)
        expect(out.jsonrpc).toBe("2.0")
        expect(out.id).toBe(42)
        expect(out.error).toBeUndefined()
        const result = out.result as { content: Array<{ type: string; text: string }> }
        expect(result.content[0].type).toBe("text")
        const parsed = JSON.parse(result.content[0].text)
        expect(parsed.error).toBe(body.error.message)
    })

    it("passes through a successful response unchanged (identity)", () => {
        const body = {
            jsonrpc: "2.0",
            id: 1,
            result: {
                content: [{ type: "text", text: '{"ok":true}' }],
            },
        }
        const out = remapValidationError(body)
        // Identity preserved when nothing needs rewriting — avoids a needless
        // Response rebuild on the hot path.
        expect(out).toBe(body)
    })

    it("passes through non--32602 errors unchanged", () => {
        // -32603 internal, -32601 method-not-found, etc. are transport/
        // protocol failures the agent should still see as errors.
        const body = {
            jsonrpc: "2.0",
            id: 1,
            error: { code: -32603, message: "Internal error" },
        }
        const out = remapValidationError(body)
        expect(out).toBe(body)
    })

    it("rewrites only the -32602 members of a JSON-RPC batch", () => {
        const ok = {
            jsonrpc: "2.0",
            id: 1,
            result: { content: [{ type: "text", text: '{"ok":true}' }] },
        }
        const bad = {
            jsonrpc: "2.0",
            id: 2,
            error: { code: -32602, message: "validation failed" },
        }
        const internal = {
            jsonrpc: "2.0",
            id: 3,
            error: { code: -32603, message: "internal" },
        }
        const batch = [ok, bad, internal]
        const out = remapValidationError(batch) as unknown[]
        expect(Array.isArray(out)).toBe(true)
        expect(out[0]).toBe(ok)
        expect(out[1]).not.toBe(bad)
        const rewritten = out[1] as Record<string, unknown>
        expect(rewritten.error).toBeUndefined()
        const text = (rewritten.result as { content: Array<{ text: string }> })
            .content[0].text
        expect(JSON.parse(text).error).toBe(bad.error.message)
        expect(out[2]).toBe(internal)
    })

    it("returns identity when a batch has no validation errors", () => {
        // Cheap identity-equality lets the route handler skip the Response
        // rebuild for the common case.
        const batch = [
            { jsonrpc: "2.0", id: 1, result: { content: [] } },
            { jsonrpc: "2.0", id: 2, result: { content: [] } },
        ]
        const out = remapValidationError(batch)
        expect(out).toBe(batch)
    })

    it("handles a missing error.message with a default string", () => {
        const body = {
            jsonrpc: "2.0",
            id: 1,
            error: { code: -32602 }, // no message
        }
        const out = remapValidationError(body) as Record<string, unknown>
        const text = (out.result as { content: Array<{ text: string }> })
            .content[0].text
        expect(JSON.parse(text).error).toBe("Validation failed")
    })

    it("ignores malformed bodies (string, null, undefined)", () => {
        expect(remapValidationError("not json-rpc")).toBe("not json-rpc")
        expect(remapValidationError(null)).toBe(null)
        expect(remapValidationError(undefined)).toBe(undefined)
        expect(remapValidationError(42)).toBe(42)
    })
})
