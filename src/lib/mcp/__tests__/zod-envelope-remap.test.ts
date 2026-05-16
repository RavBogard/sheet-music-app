import { describe, expect, it } from "vitest"
import {
    remapValidationError,
    remapValidationSseBody,
    wrapWithValidationRemap,
} from "../zod-envelope-remap"

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

/**
 * F-02-regression (v6 2026-05-16): mcp-handler emits tool responses as
 * `text/event-stream`, not `application/json`. These tests pin the SSE
 * body transform — the absence of these tests is exactly why the v5
 * fix could ship while silently no-op'ing in production.
 *
 * SSE event format the SDK writes (from
 * @modelcontextprotocol/sdk/server/webStandardStreamableHttp.js
 * writeSSEEvent):
 *
 *   event: message
 *   [id: <eventId>\n]?
 *   data: <JSON.stringify(message)>
 *   <blank line — events separated by \n\n>
 */
describe("remapValidationSseBody", () => {
    const sseError = `event: message\ndata: ${JSON.stringify({
        jsonrpc: "2.0",
        id: 42,
        error: {
            code: -32602,
            message:
                'Input validation error: Invalid arguments for tool create_setlist: [{"path":["name"]}]',
        },
    })}\n\n`

    it("rewrites a -32602 SSE event into the {error} envelope", () => {
        const out = remapValidationSseBody(sseError)
        expect(out).not.toBe(sseError)
        // Body still starts with the SSE event line.
        expect(out.startsWith("event: message\n")).toBe(true)
        // Extract the data: line and parse what we re-emitted.
        const dataLine = out.split("\n").find((l) => l.startsWith("data: "))!
        const parsed = JSON.parse(dataLine.slice("data: ".length))
        expect(parsed.error).toBeUndefined()
        expect(parsed.id).toBe(42)
        const text = parsed.result.content[0].text
        expect(JSON.parse(text).error).toContain("Input validation error")
        // Preserve the trailing blank line that delimits SSE events.
        expect(out.endsWith("\n\n")).toBe(true)
    })

    it("passes through an SSE body with no -32602 unchanged (identity)", () => {
        const ok = `event: message\ndata: ${JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            result: { content: [{ type: "text", text: '{"ok":true}' }] },
        })}\n\n`
        const out = remapValidationSseBody(ok)
        // Identity preserved when nothing needs rewriting — lets the
        // wrapper skip the Response rebuild on the hot path.
        expect(out).toBe(ok)
    })

    it("preserves SSE id: line when present (resumable streams)", () => {
        const withId = `event: message\nid: evt-7\ndata: ${JSON.stringify({
            jsonrpc: "2.0",
            id: 99,
            error: { code: -32602, message: "bad" },
        })}\n\n`
        const out = remapValidationSseBody(withId)
        expect(out).not.toBe(withId)
        expect(out).toContain("id: evt-7")
        const dataLine = out.split("\n").find((l) => l.startsWith("data: "))!
        const parsed = JSON.parse(dataLine.slice("data: ".length))
        expect(parsed.result.content[0].text).toContain("bad")
    })

    it("rewrites the bad event in a multi-event body, leaves others", () => {
        const ok = `event: message\ndata: ${JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            result: { content: [] },
        })}`
        const bad = `event: message\ndata: ${JSON.stringify({
            jsonrpc: "2.0",
            id: 2,
            error: { code: -32602, message: "bad" },
        })}`
        const body = `${ok}\n\n${bad}\n\n`
        const out = remapValidationSseBody(body)
        expect(out).not.toBe(body)
        // First event unchanged.
        expect(out.startsWith(ok)).toBe(true)
        // Second event rewritten.
        const secondEvent = out.split("\n\n")[1]
        const dataLine = secondEvent.split("\n").find((l) =>
            l.startsWith("data: "),
        )!
        const parsed = JSON.parse(dataLine.slice("data: ".length))
        expect(parsed.error).toBeUndefined()
        expect(JSON.parse(parsed.result.content[0].text).error).toBe("bad")
    })

    it("skips events with no data: line (priming events, comments)", () => {
        // SDK writes priming events as `id: <id>\ndata: \n\n` — empty
        // data, never carries a JSON-RPC body.
        const priming = `id: prime-1\ndata: \n\n`
        expect(remapValidationSseBody(priming)).toBe(priming)
    })

    it("skips events whose data: line isn't valid JSON", () => {
        const garbled = `event: message\ndata: not-json\n\n`
        expect(remapValidationSseBody(garbled)).toBe(garbled)
    })

    it("returns identity for empty string body", () => {
        expect(remapValidationSseBody("")).toBe("")
    })
})

describe("wrapWithValidationRemap", () => {
    it("rewrites a -32602 inside an SSE response", async () => {
        const handler = async () =>
            new Response(
                `event: message\ndata: ${JSON.stringify({
                    jsonrpc: "2.0",
                    id: 1,
                    error: { code: -32602, message: "bad input" },
                })}\n\n`,
                {
                    status: 200,
                    headers: { "content-type": "text/event-stream" },
                },
            )
        const wrapped = wrapWithValidationRemap(handler)
        const res = await wrapped(new Request("http://x/api/mcp", { method: "POST" }))
        expect(res.status).toBe(200)
        expect(res.headers.get("content-type")).toBe("text/event-stream")
        const text = await res.text()
        const dataLine = text.split("\n").find((l) => l.startsWith("data: "))!
        const parsed = JSON.parse(dataLine.slice("data: ".length))
        expect(parsed.error).toBeUndefined()
        expect(JSON.parse(parsed.result.content[0].text).error).toBe("bad input")
    })

    it("rewrites a -32602 inside a JSON-body response", async () => {
        const handler = async () =>
            new Response(
                JSON.stringify({
                    jsonrpc: "2.0",
                    id: 5,
                    error: { code: -32602, message: "json bad" },
                }),
                { status: 200, headers: { "content-type": "application/json" } },
            )
        const wrapped = wrapWithValidationRemap(handler)
        const res = await wrapped(new Request("http://x/api/mcp", { method: "POST" }))
        const body = (await res.json()) as { result: { content: [{ text: string }] } }
        expect(JSON.parse(body.result.content[0].text).error).toBe("json bad")
    })

    it("passes through non--32602 responses with identity (no rebuild)", async () => {
        const original = new Response(
            `event: message\ndata: ${JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                result: { content: [{ type: "text", text: '{"ok":true}' }] },
            })}\n\n`,
            { status: 200, headers: { "content-type": "text/event-stream" } },
        )
        const handler = async () => original
        const wrapped = wrapWithValidationRemap(handler)
        const res = await wrapped(new Request("http://x/api/mcp", { method: "POST" }))
        // Same Response object — wrapper short-circuits on identity.
        expect(res).toBe(original)
    })

    it("passes through unknown content-types (HTML, plain text)", async () => {
        const original = new Response("<html>oauth redirect</html>", {
            status: 200,
            headers: { "content-type": "text/html" },
        })
        const handler = async () => original
        const wrapped = wrapWithValidationRemap(handler)
        const res = await wrapped(new Request("http://x/api/mcp", { method: "GET" }))
        expect(res).toBe(original)
    })

    it("preserves status code on rewrite", async () => {
        const handler = async () =>
            new Response(
                `event: message\ndata: ${JSON.stringify({
                    jsonrpc: "2.0",
                    id: 1,
                    error: { code: -32602, message: "x" },
                })}\n\n`,
                { status: 200, headers: { "content-type": "text/event-stream" } },
            )
        const wrapped = wrapWithValidationRemap(handler)
        const res = await wrapped(new Request("http://x/api/mcp", { method: "POST" }))
        expect(res.status).toBe(200)
    })

    it("survives a malformed JSON body — returns original", async () => {
        const original = new Response("not-valid-json", {
            status: 200,
            headers: { "content-type": "application/json" },
        })
        const handler = async () => original
        const wrapped = wrapWithValidationRemap(handler)
        const res = await wrapped(new Request("http://x/api/mcp", { method: "POST" }))
        expect(res).toBe(original)
    })
})
