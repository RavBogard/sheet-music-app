import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/logger", () => ({
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

vi.mock("@/lib/mcp/auth", () => ({
    verifyBearer: vi.fn(),
}))

import { withScopedBearer } from "../scoped-bearer-gate"
import { verifyBearer } from "@/lib/mcp/auth"
import { SETLIST_READER_TOOLS } from "../scoped-bearer"

/**
 * Request-layer coverage for `withScopedBearer`: the prefix fast path, the
 * kind gate, the allow-list intersection, refusal framing, and tools/list
 * filtering. `verifyBearer` is mocked so this needs no emulator.
 */

const ALLOWED = [...SETLIST_READER_TOOLS]

function verified(overrides: Record<string, unknown> = {}) {
    return {
        uid: "admin-daniel",
        tokenId: "tok-reader",
        parentTokenId: null,
        orgId: "crc",
        kind: "setlist_reader",
        allowedTools: [...SETLIST_READER_TOOLS],
        ...overrides,
    }
}

function post(token: string, body: unknown): Request {
    return new Request("http://localhost/api/mcp", {
        method: "POST",
        headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
        },
        body: JSON.stringify(body),
    })
}

function call(name: string, id: unknown = 5) {
    return { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: {} } }
}

function jsonResponse(body: unknown) {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
    })
}

function refusalEnvelope(message: unknown): Record<string, unknown> {
    const m = message as { result?: { content?: Array<{ text?: string }> } }
    return JSON.parse(m.result?.content?.[0]?.text as string)
}

describe("withScopedBearer", () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    // (a) fast path — an ordinary bearer never pays for the gate.
    it("passes a non-crl_read_ bearer straight through without verifying", async () => {
        const inner = vi.fn(async () => jsonResponse({ ok: true }))
        const handler = withScopedBearer(inner)

        const res = await handler(post("crl_live_abc", call("create_setlist")))

        expect(inner).toHaveBeenCalledTimes(1)
        expect(verifyBearer).not.toHaveBeenCalled()
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ ok: true })
    })

    // (b) a crl_read_ string on a doc of another kind is not a scoped bearer.
    it("401s a crl_read_ bearer whose token kind is not setlist_reader", async () => {
        vi.mocked(verifyBearer).mockResolvedValue(verified({ kind: "minted_admin" }))
        const inner = vi.fn(async () => jsonResponse({ ok: true }))
        const handler = withScopedBearer(inner)

        const res = await handler(post("crl_read_abc", call("list_setlists")))

        expect(res.status).toBe(401)
        expect(inner).not.toHaveBeenCalled()
    })

    // (c) verifyBearer's own rejection is surfaced as a flat 401.
    it("401s when verifyBearer rejects the credential", async () => {
        vi.mocked(verifyBearer).mockResolvedValue(
            new Response("Unauthorized", { status: 401 }),
        )
        const inner = vi.fn(async () => jsonResponse({ ok: true }))
        const handler = withScopedBearer(inner)

        const res = await handler(post("crl_read_abc", call("list_setlists")))

        expect(res.status).toBe(401)
        expect(inner).not.toHaveBeenCalled()
    })

    // (d) a doc cannot widen its own scope — intersection with the constant.
    it("refuses a tool the token doc claims but the constant does not allow", async () => {
        vi.mocked(verifyBearer).mockResolvedValue(
            verified({ allowedTools: ["delete_setlist"] }),
        )
        const inner = vi.fn(async () => jsonResponse({ ok: true }))
        const handler = withScopedBearer(inner)

        const res = await handler(post("crl_read_abc", call("delete_setlist")))

        expect(res.status).toBe(200)
        expect(inner).not.toHaveBeenCalled()
        const body = await res.json()
        const envelope = refusalEnvelope(body) as {
            error: { machine_code: string }
            allowedTools: string[]
        }
        expect(envelope.error.machine_code).toBe("forbidden_scope")
        // The intersection was empty, so the credential fell back to the
        // constant — never to the doc's list.
        expect(envelope.allowedTools).toEqual(ALLOWED)
    })

    // (e) in-scope calls reach the inner handler untouched.
    it("forwards an allowed tools/call and returns the inner response unchanged", async () => {
        vi.mocked(verifyBearer).mockResolvedValue(verified())
        const innerBody = { jsonrpc: "2.0", id: 5, result: { content: [], isError: false } }
        const inner = vi.fn(async () => jsonResponse(innerBody))
        const handler = withScopedBearer(inner)

        const res = await handler(post("crl_read_abc", call("get_setlist")))

        expect(inner).toHaveBeenCalledTimes(1)
        expect(await res.json()).toEqual(innerBody)
    })

    // (f) refusal framing — application/json, 200, same id, inner untouched.
    it("answers a refused tools/call as application/json with the same id", async () => {
        vi.mocked(verifyBearer).mockResolvedValue(verified())
        const inner = vi.fn(async () => jsonResponse({ ok: true }))
        const handler = withScopedBearer(inner)

        const res = await handler(post("crl_read_abc", call("mint_admin_bearer", 42)))

        expect(inner).not.toHaveBeenCalled()
        expect(res.status).toBe(200)
        expect(res.headers.get("content-type")).toContain("application/json")
        const body = (await res.json()) as { id: unknown; result: { isError: boolean } }
        expect(body.id).toBe(42)
        expect(body.result.isError).toBe(true)
        expect(refusalEnvelope(body)).toMatchObject({
            ok: false,
            tool: "mint_admin_bearer",
        })
    })

    // (g) tools/list is filtered on the way out.
    it("filters a tools/list JSON response down to the allow-list", async () => {
        vi.mocked(verifyBearer).mockResolvedValue(verified())
        const inner = vi.fn(async () =>
            jsonResponse({
                jsonrpc: "2.0",
                id: 7,
                result: {
                    tools: [
                        { name: "list_setlists" },
                        { name: "create_setlist" },
                        { name: "get_setlist" },
                        { name: "delete_setlist" },
                        { name: "get_congregation_context" },
                    ],
                },
            }),
        )
        const handler = withScopedBearer(inner)

        const res = await handler(
            post("crl_read_abc", { jsonrpc: "2.0", id: 7, method: "tools/list" }),
        )

        expect(inner).toHaveBeenCalledTimes(1)
        const body = (await res.json()) as {
            result: { tools: Array<{ name: string }> }
        }
        expect(body.result.tools.map((t) => t.name)).toEqual(ALLOWED)
    })

    // (h) transport plumbing without a body still reaches the handler.
    it("passes a GET through to the inner handler", async () => {
        vi.mocked(verifyBearer).mockResolvedValue(verified())
        const inner = vi.fn(async () => new Response("ok", { status: 200 }))
        const handler = withScopedBearer(inner)

        const res = await handler(
            new Request("http://localhost/api/mcp", {
                method: "GET",
                headers: { authorization: "Bearer crl_read_abc" },
            }),
        )

        expect(inner).toHaveBeenCalledTimes(1)
        expect(res.status).toBe(200)
    })
})
