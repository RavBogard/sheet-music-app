/**
 * F-02 (2026-05-16 bugstomp) — translate JSON-RPC `-32602` validation
 * errors into a normal tool result whose content carries the standard
 * `{error: "..."}` envelope.
 *
 * Why this lives outside route.ts: Next.js App Router only allows
 * route.ts to export HTTP handlers + route-segment config. The helper
 * needs to be exported for unit testing, so it ships in its own
 * module.
 *
 * Why a Response-layer fix: mcp-handler / MCP SDK validates `inputSchema`
 * Zod shapes BEFORE the tool handler runs, so a try/catch inside the
 * handler can't translate the ZodError. The error is already serialized
 * to `{jsonrpc, error: {code: -32602, message: ...}}` by the time the
 * Response is built. Intercepting on the way out is the single-point
 * fix.
 *
 * Other JSON-RPC errors (-32603 internal, -32601 method-not-found, etc.)
 * pass through unchanged — those represent transport/protocol failures
 * the agent should still see as such.
 */

type JsonRpcMessage = {
    jsonrpc?: unknown
    id?: unknown
    result?: unknown
    error?: {
        code?: unknown
        message?: unknown
        data?: unknown
    }
}

function remapValidationMessage(msg: unknown): unknown {
    if (!msg || typeof msg !== "object") return msg
    const m = msg as JsonRpcMessage
    if (!m.error || typeof m.error !== "object") return msg
    if (m.error.code !== -32602) return msg
    const raw =
        typeof m.error.message === "string"
            ? m.error.message
            : "Validation failed"
    return {
        jsonrpc: m.jsonrpc,
        id: m.id,
        result: {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({ error: raw }, null, 2),
                },
            ],
        },
    }
}

/** JSON-RPC supports batches (request arrays); remap each member. */
export function remapValidationError(body: unknown): unknown {
    if (Array.isArray(body)) {
        const mapped = body.map(remapValidationMessage)
        return mapped.some((r, i) => r !== body[i]) ? mapped : body
    }
    return remapValidationMessage(body)
}
