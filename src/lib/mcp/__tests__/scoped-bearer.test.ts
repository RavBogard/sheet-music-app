import { describe, it, expect } from "vitest"

import {
    SETLIST_READER_KIND,
    SETLIST_READER_TOOLS,
    isSetlistReaderToken,
    evaluateScopedJsonRpc,
    filterToolsList,
    filterToolsListSseBody,
} from "../scoped-bearer"

/**
 * Pure-logic coverage for the `setlist_reader` scope policy. No emulator, no
 * Firestore — this module is deliberately transport-free so the allow-list
 * decision is pinned independently of the route wiring.
 */

const ALLOWED = [...SETLIST_READER_TOOLS]

function call(name: string, id: unknown = 1) {
    return {
        jsonrpc: "2.0",
        id,
        method: "tools/call",
        params: { name, arguments: {} },
    }
}

function refusalEnvelope(response: unknown): Record<string, unknown> {
    const r = response as { result?: { content?: Array<{ text?: string }> } }
    const text = r.result?.content?.[0]?.text
    expect(typeof text).toBe("string")
    return JSON.parse(text as string)
}

describe("scoped-bearer constants", () => {
    it("kind + allow-list are exactly the three read tools", () => {
        expect(SETLIST_READER_KIND).toBe("setlist_reader")
        expect(ALLOWED).toEqual([
            "list_setlists",
            "get_setlist",
            "get_congregation_context",
        ])
    })
})

describe("isSetlistReaderToken", () => {
    it("matches only the crl_read_ prefix", () => {
        expect(isSetlistReaderToken("crl_read_abc123")).toBe(true)
        expect(isSetlistReaderToken("crl_live_abc123")).toBe(false)
        expect(isSetlistReaderToken("")).toBe(false)
        expect(isSetlistReaderToken(null)).toBe(false)
        expect(isSetlistReaderToken(undefined)).toBe(false)
        expect(isSetlistReaderToken(42)).toBe(false)
    })
})

describe("evaluateScopedJsonRpc — protocol methods", () => {
    it("allows initialize", () => {
        expect(
            evaluateScopedJsonRpc(
                { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
                ALLOWED,
            ),
        ).toEqual({ allow: true })
    })

    it("allows ping", () => {
        expect(
            evaluateScopedJsonRpc({ jsonrpc: "2.0", id: 2, method: "ping" }, ALLOWED),
        ).toEqual({ allow: true })
    })

    it("allows notifications/*", () => {
        expect(
            evaluateScopedJsonRpc(
                { jsonrpc: "2.0", method: "notifications/initialized" },
                ALLOWED,
            ),
        ).toEqual({ allow: true })
        expect(
            evaluateScopedJsonRpc(
                { jsonrpc: "2.0", method: "notifications/cancelled" },
                ALLOWED,
            ),
        ).toEqual({ allow: true })
    })

    it("allows tools/list", () => {
        expect(
            evaluateScopedJsonRpc(
                { jsonrpc: "2.0", id: 3, method: "tools/list" },
                ALLOWED,
            ),
        ).toEqual({ allow: true })
    })

    it("refuses any other method with JSON-RPC -32601", () => {
        const decision = evaluateScopedJsonRpc(
            { jsonrpc: "2.0", id: 9, method: "resources/list" },
            ALLOWED,
        )
        expect(decision.allow).toBe(false)
        if (decision.allow) throw new Error("expected refusal")
        const res = decision.response as {
            id: unknown
            error: { code: number; message: string }
        }
        expect(res.id).toBe(9)
        expect(res.error.code).toBe(-32601)
        expect(res.error.message).toBe("Method not available to this credential")
    })
})

describe("evaluateScopedJsonRpc — tools/call", () => {
    it.each(ALLOWED)("allows %s", (name) => {
        expect(evaluateScopedJsonRpc(call(name), ALLOWED)).toEqual({ allow: true })
    })

    it.each(["create_setlist", "delete_setlist", "mint_admin_bearer", "upload_chart"])(
        "refuses %s with a forbidden_scope envelope",
        (name) => {
            const decision = evaluateScopedJsonRpc(call(name), ALLOWED)
            expect(decision.allow).toBe(false)
            if (decision.allow) throw new Error("expected refusal")

            const res = decision.response as {
                id: unknown
                result: { isError: boolean }
            }
            // A refused tool call is a JSON-RPC *result* with isError, not a
            // JSON-RPC error — same shape every tool failure uses.
            expect(res.id).toBe(1)
            expect(res.result.isError).toBe(true)

            const envelope = refusalEnvelope(decision.response) as {
                ok: boolean
                error: { machine_code: string; message: string }
                tool: string
                allowedTools: string[]
                hint: string
            }
            expect(envelope.ok).toBe(false)
            expect(envelope.error.machine_code).toBe("forbidden_scope")
            expect(envelope.tool).toBe(name)
            expect(envelope.allowedTools).toEqual(ALLOWED)
            expect(envelope.hint).toContain("allowedTools")
        },
    )

    it("refuses a tools/call with a missing name", () => {
        const decision = evaluateScopedJsonRpc(
            { jsonrpc: "2.0", id: 1, method: "tools/call", params: {} },
            ALLOWED,
        )
        expect(decision.allow).toBe(false)
    })
})

describe("evaluateScopedJsonRpc — batches", () => {
    it("allows a batch where every member is in scope", () => {
        expect(
            evaluateScopedJsonRpc(
                [call("list_setlists", 1), call("get_setlist", 2)],
                ALLOWED,
            ),
        ).toEqual({ allow: true })
    })

    it("refuses the whole batch when one entry is out of scope, answering every id", () => {
        const decision = evaluateScopedJsonRpc(
            [call("list_setlists", 1), call("delete_setlist", 2)],
            ALLOWED,
        )
        expect(decision.allow).toBe(false)
        if (decision.allow) throw new Error("expected refusal")

        const arr = decision.response as Array<{ id: unknown; result: unknown }>
        expect(Array.isArray(arr)).toBe(true)
        expect(arr).toHaveLength(2)
        expect(arr.map((m) => m.id)).toEqual([1, 2])
        // The out-of-scope member names the tool it refused.
        const refused = refusalEnvelope(arr[1]) as { tool: string }
        expect(refused.tool).toBe("delete_setlist")
        // The in-scope member is refused too — we never dispatch a partial batch.
        const sibling = refusalEnvelope(arr[0]) as {
            error: { machine_code: string }
        }
        expect(sibling.error.machine_code).toBe("forbidden_scope")
    })
})

describe("filterToolsList", () => {
    const listResult = (names: string[]) => ({
        jsonrpc: "2.0",
        id: 7,
        result: {
            tools: names.map((name) => ({ name, description: `${name} tool` })),
        },
    })

    it("keeps only allowed tools in a plain JSON body", () => {
        const body = listResult([
            "list_setlists",
            "create_setlist",
            "get_setlist",
            "mint_admin_bearer",
            "get_congregation_context",
        ])
        const filtered = filterToolsList(body, ALLOWED) as {
            result: { tools: Array<{ name: string }> }
        }
        expect(filtered.result.tools.map((t) => t.name)).toEqual(ALLOWED)
    })

    it("returns the body by identity when nothing needed removing", () => {
        const body = listResult(ALLOWED)
        expect(filterToolsList(body, ALLOWED)).toBe(body)
    })

    it("passes through non-tools/list results untouched", () => {
        const body = { jsonrpc: "2.0", id: 1, result: { content: [] } }
        expect(filterToolsList(body, ALLOWED)).toBe(body)
    })

    it("filters each member of a batch", () => {
        const body = [listResult(["list_setlists", "delete_setlist"])]
        const filtered = filterToolsList(body, ALLOWED) as Array<{
            result: { tools: Array<{ name: string }> }
        }>
        expect(filtered[0].result.tools.map((t) => t.name)).toEqual(["list_setlists"])
    })

    it("filters an SSE-framed body", () => {
        const body =
            "event: message\n" +
            `data: ${JSON.stringify(
                listResult(["list_setlists", "create_setlist", "get_setlist"]),
            )}\n\n`
        const filtered = filterToolsListSseBody(body, ALLOWED)
        expect(filtered).not.toBe(body)
        const dataLine = filtered
            .split("\n")
            .find((l) => l.startsWith("data: ")) as string
        const parsed = JSON.parse(dataLine.slice("data: ".length)) as {
            result: { tools: Array<{ name: string }> }
        }
        expect(parsed.result.tools.map((t) => t.name)).toEqual([
            "list_setlists",
            "get_setlist",
        ])
        // Event framing survives the rewrite.
        expect(filtered.startsWith("event: message\n")).toBe(true)
    })

    it("returns an SSE body by identity when nothing needed removing", () => {
        const body = `event: message\ndata: ${JSON.stringify(listResult(ALLOWED))}\n\n`
        expect(filterToolsListSseBody(body, ALLOWED)).toBe(body)
    })
})
