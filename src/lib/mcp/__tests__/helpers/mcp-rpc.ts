/**
 * Test helper: drive a built MCP route handler with JSON-RPC over the
 * streamable-HTTP transport and read the result, whether the transport answers
 * with JSON or an SSE frame.
 */
type Handler = (req: Request) => Promise<Response>

export interface RpcOpts {
    host?: string
    orgHeader?: string
    token?: string
    path?: string
}

function req(body: unknown, opts: RpcOpts): Request {
    const host = opts.host ?? "www.centralreform.live"
    return new Request(`https://internal.vercel${opts.path ?? "/api/mcp"}`, {
        method: "POST",
        headers: {
            host,
            "x-forwarded-host": host,
            "x-forwarded-proto": "https",
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
            authorization: `Bearer ${opts.token ?? "crl_live_test"}`,
            ...(opts.orgHeader ? { "x-org-id": opts.orgHeader } : {}),
        },
        body: JSON.stringify(body),
    })
}

async function readResult(res: Response): Promise<Record<string, unknown>> {
    const text = await res.text()
    const ct = res.headers.get("content-type") ?? ""
    let json: unknown
    if (ct.includes("text/event-stream")) {
        const line = text.split("\n").find((l) => l.startsWith("data: "))
        if (!line) throw new Error(`no SSE data frame (status ${res.status}): ${text.slice(0, 300)}`)
        json = JSON.parse(line.slice(6))
    } else {
        json = JSON.parse(text)
    }
    const j = json as { result?: Record<string, unknown>; error?: unknown }
    if (!j.result) throw new Error(`no result (status ${res.status}): ${text.slice(0, 300)}`)
    return j.result
}

export async function readInitialize(handler: Handler, opts: RpcOpts = {}): Promise<Record<string, unknown>> {
    const res = await handler(
        req(
            {
                jsonrpc: "2.0",
                id: 1,
                method: "initialize",
                params: {
                    protocolVersion: "2025-03-26",
                    capabilities: {},
                    clientInfo: { name: "golden-test", version: "1.0.0" },
                },
            },
            opts,
        ),
    )
    return readResult(res)
}

export async function listToolNames(handler: Handler, opts: RpcOpts = {}): Promise<string[]> {
    const res = await handler(req({ jsonrpc: "2.0", id: 2, method: "tools/list" }, opts))
    const result = await readResult(res)
    return (result.tools as Array<{ name: string }>).map((t) => t.name)
}

/** tools/call; returns the tool result (content / isError). */
export async function callTool(
    handler: Handler,
    name: string,
    args: Record<string, unknown>,
    opts: RpcOpts = {},
): Promise<Record<string, unknown>> {
    const res = await handler(req({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name, arguments: args } }, opts))
    return readResult(res)
}
