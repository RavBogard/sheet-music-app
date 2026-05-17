import { describe, expect, it } from "vitest"
import {
    remapValidationError,
    remapValidationSseBody,
    wrapWithValidationRemap,
} from "../zod-envelope-remap"

/**
 * F-02 (2026-05-16 bugstomp) + REG-001 (cycle-2): pin the contract for
 * the JSON-RPC -32602 → rich-envelope remap. The function is a pure
 * transform on the parsed response body — no HTTP, no Zod, no MCP SDK
 * required.
 *
 * Wire envelope shape (cycle-2 REG-001 — `validation_error`):
 *   {
 *     ok: false,
 *     error: { machine_code: "validation_error" },
 *     message: "Invalid arguments — <tool>: <summary>",
 *     toolName: <string|null>,
 *     issues: [{path, message, code?}, ...],
 *     hint: "Re-call the tool with corrected arguments (see issues[])."
 *   }
 */
describe("remapValidationError", () => {
    it("rewrites -32602 single-response error into the rich validation_error envelope", () => {
        const body = {
            jsonrpc: "2.0",
            id: 42,
            error: {
                code: -32602,
                message:
                    'Input validation error: Invalid arguments for tool create_setlist: [{"path":["name"],"message":"Too small","code":"too_small"}]',
            },
        }
        const out = remapValidationError(body) as unknown as Record<string, unknown>
        expect(out).not.toBe(body)
        expect(out.jsonrpc).toBe("2.0")
        expect(out.id).toBe(42)
        expect(out.error).toBeUndefined()
        const result = out.result as {
            content: Array<{ type: string; text: string }>
            isError: boolean
        }
        expect(result.isError).toBe(true)
        expect(result.content[0].type).toBe("text")
        const parsed = JSON.parse(result.content[0].text) as Record<
            string,
            unknown
        >
        expect(parsed.ok).toBe(false)
        expect((parsed.error as { machine_code: string }).machine_code).toBe("validation_error")
        expect(parsed.toolName).toBe("create_setlist")
        expect((parsed.error as { message: string }).message).toContain("name: Too small")
        expect(parsed.hint).toContain("Re-call")
        const issues = parsed.issues as Array<Record<string, unknown>>
        expect(issues).toHaveLength(1)
        expect(issues[0].path).toBe("name")
        expect(issues[0].message).toBe("Too small")
        expect(issues[0].code).toBe("too_small")
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
            error: {
                code: -32602,
                message:
                    'Input validation error: Invalid arguments for tool create_setlist: [{"path":["name"],"message":"Required"}]',
            },
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
        const env = JSON.parse(text) as unknown as Record<string, unknown>
        expect((env.error as { machine_code: string }).machine_code).toBe("validation_error")
        expect(env.toolName).toBe("create_setlist")
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

    it("handles a missing error.message with a fallback envelope", () => {
        const body = {
            jsonrpc: "2.0",
            id: 1,
            error: { code: -32602 }, // no message
        }
        const out = remapValidationError(body) as unknown as Record<string, unknown>
        const text = (out.result as { content: Array<{ text: string }> })
            .content[0].text
        const env = JSON.parse(text) as unknown as Record<string, unknown>
        expect((env.error as { machine_code: string }).machine_code).toBe("validation_error")
        // Falls back to the default "Validation failed" prose carried as a
        // single synthetic issue when the SDK gave us nothing to parse.
        expect(env.toolName).toBeNull()
        expect((env.issues as unknown[]).length).toBeGreaterThan(0)
    })

    it("ignores malformed bodies (string, null, undefined)", () => {
        expect(remapValidationError("not json-rpc")).toBe("not json-rpc")
        expect(remapValidationError(null)).toBe(null)
        expect(remapValidationError(undefined)).toBe(undefined)
        expect(remapValidationError(42)).toBe(42)
    })
})

/**
 * F-02-regression-pt2 (v6 2026-05-16) + REG-001 (cycle-2): the SDK's
 * catch wrapper turns `McpError(InvalidParams)` into a normal
 * CallToolResult with `isError: true` and `content[0].text` literally
 * prefixed `"MCP error -32602: Input validation error:"`. The `-32602`
 * field never appears on the wire — only this prose string in the
 * content. Production probe captured the exact shape; these tests pin it
 * AND the rich envelope cycle-2 upgrade.
 */
describe("remapValidationError — isError: true content rewrite", () => {
    // Real shape captured from production via scripts/probe-f02-shape.mjs
    // 2026-05-16. The escaped \n inside text are literal newlines the
    // SDK includes when JSON.stringify-ing the Zod issues array.
    const productionShape = {
        result: {
            content: [
                {
                    type: "text",
                    text:
                        "MCP error -32602: Input validation error: Invalid arguments for tool create_setlist: [\n" +
                        '  {\n    "origin": "string",\n    "code": "too_small",\n    "minimum": 1,\n' +
                        '    "inclusive": true,\n    "path": [\n      "name"\n    ],\n' +
                        '    "message": "Too small: expected string to have >=1 characters"\n  }\n]',
                },
            ],
            isError: true,
        },
        jsonrpc: "2.0",
        id: 1,
    }

    it("rewrites isError:true SDK prose into the rich validation_error envelope", () => {
        const out = remapValidationError(productionShape) as {
            result: {
                content: Array<{ type: string; text: string }>
                isError: boolean
            }
            id: number
        }
        expect(out).not.toBe(productionShape)
        expect(out.id).toBe(1)
        // isError stays so agents checking it structurally still see the failure.
        expect(out.result.isError).toBe(true)
        const env = JSON.parse(out.result.content[0].text) as Record<
            string,
            unknown
        >
        expect(env.ok).toBe(false)
        expect((env.error as { machine_code: string }).machine_code).toBe("validation_error")
        expect(env.toolName).toBe("create_setlist")
        expect((env.error as { message: string }).message).toContain("create_setlist")
        expect((env.error as { message: string }).message).toContain("name")
        const issues = env.issues as Array<Record<string, unknown>>
        expect(issues).toHaveLength(1)
        expect(issues[0].path).toBe("name")
        expect(issues[0].code).toBe("too_small")
        expect(env.hint).toContain("Re-call")
    })

    it("preserves additional content items beyond index 0", () => {
        const msg = {
            result: {
                content: [
                    {
                        type: "text",
                        text:
                            'MCP error -32602: Input validation error: Invalid arguments for tool x: [{"path":["y"],"message":"bad"}]',
                    },
                    { type: "text", text: "hint: pass a non-empty name" },
                ],
                isError: true,
            },
            jsonrpc: "2.0",
            id: 7,
        }
        const out = remapValidationError(msg) as {
            result: { content: Array<{ text: string }> }
        }
        expect(out.result.content).toHaveLength(2)
        expect(out.result.content[1].text).toBe("hint: pass a non-empty name")
    })

    it("passes through isError: true with handler-emitted envelope (already correct shape)", () => {
        // assertEditor / other handler-level errors already use jsonResult({error: ...})
        // so content[0].text JSON-parses to {error: "..."}. Don't double-wrap.
        const msg = {
            result: {
                content: [
                    { type: "text", text: '{"error":"Setlist not found"}' },
                ],
                isError: true,
            },
            jsonrpc: "2.0",
            id: 5,
        }
        expect(remapValidationError(msg)).toBe(msg)
    })

    it("passes through isError: true with a non-validation text body", () => {
        // e.g. tool-handler errors that don't start with the SDK validation
        // prefix — leave them alone.
        const msg = {
            result: {
                content: [{ type: "text", text: "Something else broke" }],
                isError: true,
            },
            jsonrpc: "2.0",
            id: 5,
        }
        expect(remapValidationError(msg)).toBe(msg)
    })

    it("passes through successful results with isError: false / absent", () => {
        const ok1 = {
            result: { content: [{ type: "text", text: "fine" }], isError: false },
            jsonrpc: "2.0",
            id: 1,
        }
        const ok2 = {
            result: { content: [{ type: "text", text: "fine" }] },
            jsonrpc: "2.0",
            id: 2,
        }
        expect(remapValidationError(ok1)).toBe(ok1)
        expect(remapValidationError(ok2)).toBe(ok2)
    })

    it("ignores isError: true with no content array", () => {
        const msg = { result: { isError: true }, jsonrpc: "2.0", id: 1 }
        expect(remapValidationError(msg)).toBe(msg)
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
                'Input validation error: Invalid arguments for tool create_setlist: [{"path":["name"],"message":"Required"}]',
        },
    })}\n\n`

    it("rewrites a -32602 SSE event into the rich envelope", () => {
        const out = remapValidationSseBody(sseError)
        expect(out).not.toBe(sseError)
        // Body still starts with the SSE event line.
        expect(out.startsWith("event: message\n")).toBe(true)
        // Extract the data: line and parse what we re-emitted.
        const dataLine = out.split("\n").find((l) => l.startsWith("data: "))!
        const parsed = JSON.parse(dataLine.slice("data: ".length)) as unknown as Record<string, unknown>
        expect(parsed.error).toBeUndefined()
        expect(parsed.id).toBe(42)
        const result = parsed.result as { content: Array<{ text: string }> }
        const env = JSON.parse(result.content[0].text) as Record<
            string,
            unknown
        >
        expect((env.error as { machine_code: string }).machine_code).toBe("validation_error")
        expect(env.toolName).toBe("create_setlist")
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
            error: {
                code: -32602,
                message:
                    'Input validation error: Invalid arguments for tool x: [{"path":["y"],"message":"bad"}]',
            },
        })}\n\n`
        const out = remapValidationSseBody(withId)
        expect(out).not.toBe(withId)
        expect(out).toContain("id: evt-7")
        const dataLine = out.split("\n").find((l) => l.startsWith("data: "))!
        const parsed = JSON.parse(dataLine.slice("data: ".length)) as unknown as Record<string, unknown>
        const result = parsed.result as { content: Array<{ text: string }> }
        const env = JSON.parse(result.content[0].text) as Record<
            string,
            unknown
        >
        expect(env.toolName).toBe("x")
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
            error: {
                code: -32602,
                message:
                    'Input validation error: Invalid arguments for tool y: [{"path":["z"],"message":"bad"}]',
            },
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
        const parsed = JSON.parse(dataLine.slice("data: ".length)) as unknown as Record<string, unknown>
        expect(parsed.error).toBeUndefined()
        const result = parsed.result as { content: Array<{ text: string }> }
        const env = JSON.parse(result.content[0].text) as Record<
            string,
            unknown
        >
        expect((env.error as { machine_code: string }).machine_code).toBe("validation_error")
        expect(env.toolName).toBe("y")
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
                    error: {
                        code: -32602,
                        message:
                            'Input validation error: Invalid arguments for tool create_setlist: [{"path":["name"],"message":"bad input"}]',
                    },
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
        const parsed = JSON.parse(dataLine.slice("data: ".length)) as unknown as Record<string, unknown>
        expect(parsed.error).toBeUndefined()
        const result = parsed.result as { content: Array<{ text: string }> }
        const env = JSON.parse(result.content[0].text) as Record<
            string,
            unknown
        >
        expect((env.error as { machine_code: string }).machine_code).toBe("validation_error")
        expect(env.toolName).toBe("create_setlist")
    })

    it("rewrites a -32602 inside a JSON-body response", async () => {
        const handler = async () =>
            new Response(
                JSON.stringify({
                    jsonrpc: "2.0",
                    id: 5,
                    error: {
                        code: -32602,
                        message:
                            'Input validation error: Invalid arguments for tool x: [{"path":["y"],"message":"json bad"}]',
                    },
                }),
                { status: 200, headers: { "content-type": "application/json" } },
            )
        const wrapped = wrapWithValidationRemap(handler)
        const res = await wrapped(new Request("http://x/api/mcp", { method: "POST" }))
        const body = (await res.json()) as {
            result: { content: [{ text: string }] }
        }
        const env = JSON.parse(body.result.content[0].text) as Record<
            string,
            unknown
        >
        expect((env.error as { machine_code: string }).machine_code).toBe("validation_error")
        expect(env.toolName).toBe("x")
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
                    error: {
                        code: -32602,
                        message:
                            'Input validation error: Invalid arguments for tool x: [{"path":["y"],"message":"x"}]',
                    },
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

    /**
     * Regression pin: this is the EXACT SSE body production returns for
     * `create_setlist({name: ""})` (captured via
     * scripts/probe-f02-shape.mjs 2026-05-16). The earlier two F-02
     * attempts shipped without this test, so they could pass unit tests
     * while silently no-op'ing in prod. If this test fails, the wrapper
     * is wrong-target again. Cycle-2 REG-001 upgraded the wire envelope
     * to the canonical rich shape (`validation_error` machine code +
     * issues[]); assertions track that shape.
     */
    it("rewrites the EXACT production SSE shape into the rich envelope", async () => {
        const productionSseBody =
            'event: message\ndata: {"result":{"content":[{"type":"text",' +
            '"text":"MCP error -32602: Input validation error: Invalid ' +
            'arguments for tool create_setlist: [\\n  {\\n    \\"origin\\": ' +
            '\\"string\\",\\n    \\"code\\": \\"too_small\\",\\n    ' +
            '\\"minimum\\": 1,\\n    \\"inclusive\\": true,\\n    ' +
            '\\"path\\": [\\n      \\"name\\"\\n    ],\\n    ' +
            '\\"message\\": \\"Too small: expected string to have >=1 ' +
            'characters\\"\\n  }\\n]"}],"isError":true},"jsonrpc":"2.0",' +
            '"id":1}\n\n'
        const handler = async () =>
            new Response(productionSseBody, {
                status: 200,
                headers: { "content-type": "text/event-stream" },
            })
        const wrapped = wrapWithValidationRemap(handler)
        const res = await wrapped(new Request("http://x/api/mcp", { method: "POST" }))
        const text = await res.text()
        // Extract the data: line and parse what we re-emitted.
        const dataLine = text.split("\n").find((l) => l.startsWith("data: "))!
        const parsed = JSON.parse(dataLine.slice("data: ".length)) as unknown as Record<string, unknown>
        // isError flag survives (structural failure signal still works).
        const result = parsed.result as {
            content: Array<{ text: string }>
            isError: boolean
        }
        expect(result.isError).toBe(true)
        // content[0].text now JSON-parses to the rich envelope.
        const env = JSON.parse(result.content[0].text) as Record<
            string,
            unknown
        >
        expect(env.ok).toBe(false)
        expect((env.error as { machine_code: string }).machine_code).toBe("validation_error")
        expect(env.toolName).toBe("create_setlist")
        expect((env.error as { message: string }).message).toContain("name")
        const issues = env.issues as Array<Record<string, unknown>>
        expect(issues).toHaveLength(1)
        expect(issues[0].path).toBe("name")
        expect(issues[0].code).toBe("too_small")
        expect(env.hint).toContain("Re-call")
        // Trailing SSE delimiter preserved.
        expect(text.endsWith("\n\n")).toBe(true)
    })
})
