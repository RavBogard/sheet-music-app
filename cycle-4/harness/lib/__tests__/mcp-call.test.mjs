import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

import { mcpCall, mcpCallOrThrow, mcpToolsList } from "../mcp-call.mjs"

/**
 * mcp-call unit tests — SSE-frame parsing + isError detection.
 *
 * Pure-fetch logic; we stub `global.fetch` so no network is touched. Mirrors
 * the shape `e2e/helpers/mcp.ts` validates on the TS side but stays mjs so
 * the harness `probes/` consumers can rely on it without a TS toolchain.
 */

const BASE = "https://example.test"
const BEARER = "crl_test_bearer"

function sseResponse({ result, status = 200, statusText = "OK" }) {
    const body = `data: ${JSON.stringify({ jsonrpc: "2.0", id: 1, result })}\n\n`
    return {
        ok: status >= 200 && status < 300,
        status,
        statusText,
        text: async () => body,
    }
}

function plainResponse({ status, body, statusText = "Error" }) {
    return {
        ok: false,
        status,
        statusText,
        text: async () => body,
    }
}

let fetchSpy
beforeEach(() => {
    fetchSpy = vi.fn()
    globalThis.fetch = fetchSpy
})
afterEach(() => {
    delete globalThis.fetch
})

describe("mcpCall — tools/call envelope", () => {
    it("returns payload + isError:false for a success envelope", async () => {
        fetchSpy.mockResolvedValueOnce(
            sseResponse({
                result: {
                    content: [{ text: JSON.stringify({ ok: true, count: 7 }) }],
                    isError: false,
                },
            }),
        )
        const { payload, isError } = await mcpCall({
            baseUrl: BASE,
            bearer: BEARER,
            tool: "list_setlists",
            args: {},
        })
        expect(isError).toBe(false)
        expect(payload).toEqual({ ok: true, count: 7 })
    })

    it("returns payload + isError:true for a refusal envelope (NOT JSON-RPC error.code)", async () => {
        fetchSpy.mockResolvedValueOnce(
            sseResponse({
                result: {
                    content: [
                        { text: JSON.stringify({ error: "role_required", message: "admin only" }) },
                    ],
                    isError: true,
                },
            }),
        )
        const { payload, isError } = await mcpCall({
            baseUrl: BASE,
            bearer: BEARER,
            tool: "archive_nonchart_artifacts",
            args: { dryRun: true },
        })
        expect(isError).toBe(true)
        expect(payload).toMatchObject({ error: "role_required", message: "admin only" })
    })

    it("throws if no SSE data frame is present", async () => {
        fetchSpy.mockResolvedValueOnce({
            ok: true,
            status: 200,
            statusText: "OK",
            text: async () => "no data frame here",
        })
        await expect(
            mcpCall({ baseUrl: BASE, bearer: BEARER, tool: "list_setlists" }),
        ).rejects.toThrow(/no SSE data frame/)
    })

    it("throws if result.content[0].text is missing", async () => {
        fetchSpy.mockResolvedValueOnce(
            sseResponse({ result: { content: [], isError: false } }),
        )
        await expect(
            mcpCall({ baseUrl: BASE, bearer: BEARER, tool: "list_setlists" }),
        ).rejects.toThrow(/missing text payload/)
    })

    it("throws on HTTP failure with no SSE frame at all", async () => {
        fetchSpy.mockResolvedValueOnce(
            plainResponse({ status: 502, statusText: "Bad Gateway", body: "upstream timeout" }),
        )
        await expect(
            mcpCall({ baseUrl: BASE, bearer: BEARER, tool: "list_setlists" }),
        ).rejects.toThrow(/HTTP 502/)
    })

    it("validates required args", async () => {
        await expect(
            mcpCall({ bearer: BEARER, tool: "x" }),
        ).rejects.toThrow(/baseUrl required/)
        await expect(
            mcpCall({ baseUrl: BASE, tool: "x" }),
        ).rejects.toThrow(/bearer required/)
        await expect(
            mcpCall({ baseUrl: BASE, bearer: BEARER }),
        ).rejects.toThrow(/tool name required/)
    })

    it("posts to /api/mcp with the correct envelope shape", async () => {
        fetchSpy.mockResolvedValueOnce(
            sseResponse({
                result: { content: [{ text: JSON.stringify({ ok: true }) }], isError: false },
            }),
        )
        await mcpCall({
            baseUrl: BASE,
            bearer: BEARER,
            tool: "get_song",
            args: { id: "song-1" },
        })
        const [url, init] = fetchSpy.mock.calls[0]
        expect(url).toBe(`${BASE}/api/mcp`)
        expect(init.method).toBe("POST")
        expect(init.headers.authorization).toBe(`Bearer ${BEARER}`)
        expect(init.headers.accept).toMatch(/text\/event-stream/)
        const body = JSON.parse(init.body)
        expect(body).toMatchObject({
            jsonrpc: "2.0",
            method: "tools/call",
            params: { name: "get_song", arguments: { id: "song-1" } },
        })
        expect(typeof body.id).toBe("number")
    })
})

describe("mcpCallOrThrow", () => {
    it("returns payload on success", async () => {
        fetchSpy.mockResolvedValueOnce(
            sseResponse({
                result: { content: [{ text: JSON.stringify({ tools: [{ name: "x" }] }) }], isError: false },
            }),
        )
        const r = await mcpCallOrThrow({ baseUrl: BASE, bearer: BEARER, tool: "list" })
        expect(r).toEqual({ tools: [{ name: "x" }] })
    })

    it("throws on isError envelope with a string error", async () => {
        fetchSpy.mockResolvedValueOnce(
            sseResponse({
                result: {
                    content: [{ text: JSON.stringify({ error: "bad_arg", message: "id required" }) }],
                    isError: true,
                },
            }),
        )
        await expect(
            mcpCallOrThrow({ baseUrl: BASE, bearer: BEARER, tool: "x" }),
        ).rejects.toThrow(/bad_arg.*id required/)
    })

    it("JSON-stringifies structured error objects (regression: [object Object])", async () => {
        // Real shape from validation refusals: `error` is an object with
        // `issues[]`. The naive concatenation in the early Lane-C draft printed
        // `[object Object]` and dropped the issues detail. Pin the fix here.
        fetchSpy.mockResolvedValueOnce(
            sseResponse({
                result: {
                    content: [
                        {
                            text: JSON.stringify({
                                error: { code: "validation_failed", issues: [{ path: "uidPrefix" }] },
                                message: "validation failed",
                                hint: "see issues[]",
                            }),
                        },
                    ],
                    isError: true,
                },
            }),
        )
        await expect(
            mcpCallOrThrow({ baseUrl: BASE, bearer: BEARER, tool: "create_test_account" }),
        ).rejects.toThrow(/validation_failed.*uidPrefix/)
    })

    it("throws on legacy {ok:false} envelope without SDK isError", async () => {
        fetchSpy.mockResolvedValueOnce(
            sseResponse({
                result: {
                    content: [{ text: JSON.stringify({ ok: false, error: "legacy_err", message: "old shape" }) }],
                    isError: false,
                },
            }),
        )
        await expect(
            mcpCallOrThrow({ baseUrl: BASE, bearer: BEARER, tool: "x" }),
        ).rejects.toThrow(/legacy error envelope.*legacy_err/)
    })
})

describe("mcpToolsList", () => {
    it("returns the result.tools array on success", async () => {
        fetchSpy.mockResolvedValueOnce(
            sseResponse({
                result: { tools: [{ name: "a" }, { name: "b" }, { name: "c" }] },
            }),
        )
        const tools = await mcpToolsList({ baseUrl: BASE, bearer: BEARER })
        expect(tools).toHaveLength(3)
        expect(tools[0].name).toBe("a")
    })

    it("uses tools/list method (not tools/call)", async () => {
        fetchSpy.mockResolvedValueOnce(
            sseResponse({ result: { tools: [] } }),
        )
        // The above would throw "not array"-style; pre-empt by returning empty.
        // For this we just need to see what was posted.
        try {
            await mcpToolsList({ baseUrl: BASE, bearer: BEARER })
        } catch {
            // empty tools array still returns successfully (it's an array)
        }
        const [, init] = fetchSpy.mock.calls[0]
        const body = JSON.parse(init.body)
        expect(body.method).toBe("tools/list")
    })

    it("throws if result.tools is not an array", async () => {
        fetchSpy.mockResolvedValueOnce(
            sseResponse({ result: { tools: "not-an-array" } }),
        )
        await expect(
            mcpToolsList({ baseUrl: BASE, bearer: BEARER }),
        ).rejects.toThrow(/result\.tools is not an array/)
    })

    it("validates required args", async () => {
        await expect(mcpToolsList({ bearer: BEARER })).rejects.toThrow(/baseUrl required/)
        await expect(mcpToolsList({ baseUrl: BASE })).rejects.toThrow(/bearer required/)
    })
})
