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
 * F-02-regression (v6 2026-05-16): the v5 fix only handled JSON-body
 * responses. mcp-handler's WebStandardStreamableHTTPServerTransport
 * actually returns tool responses as `text/event-stream` with the
 * JSON-RPC body inside `data: {...}` SSE event lines. The JSON-only
 * wrapper short-circuited on every real tool call. The unit tests only
 * exercised the pure transform on a hand-rolled JSON-RPC object, so the
 * regression was structural and invisible from day one. The wrapper
 * now branches on Content-Type and handles both shapes.
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

/**
 * Remap a `text/event-stream` body. mcp-handler writes each JSON-RPC
 * message as a single SSE event with the shape:
 *
 *   event: message
 *   [id: <eventId>\n]?
 *   data: <JSON.stringify(message)>
 *   <blank line>
 *
 * Events are separated by `\n\n`. The `data:` value is a single line
 * because the SDK uses `JSON.stringify` without pretty-printing. We
 * scan each event for its `data:` line, parse the JSON, run the same
 * remap as the JSON-body path, and re-serialize. Events with no
 * `data:` line (e.g. priming events with empty data, comments) pass
 * through unchanged. Identity equality is preserved when no event
 * needed rewriting so the wrapper can skip the Response rebuild.
 */
export function remapValidationSseBody(body: string): string {
    if (typeof body !== "string" || body.length === 0) return body
    const events = body.split("\n\n")
    let mutated = false
    const out = events.map((event) => {
        const lines = event.split("\n")
        const dataIdx = lines.findIndex((l) => l.startsWith("data: "))
        if (dataIdx === -1) return event
        const dataStr = lines[dataIdx].slice("data: ".length)
        if (dataStr.length === 0) return event
        let parsed: unknown
        try {
            parsed = JSON.parse(dataStr)
        } catch {
            return event
        }
        const remapped = remapValidationMessage(parsed)
        if (remapped === parsed) return event
        lines[dataIdx] = `data: ${JSON.stringify(remapped)}`
        mutated = true
        return lines.join("\n")
    })
    return mutated ? out.join("\n\n") : body
}

/**
 * Higher-order wrapper that intercepts a handler's Response and remaps
 * any `-32602` validation errors regardless of whether the body is
 * JSON or SSE-framed. Lives here (not route.ts) so it's unit-testable.
 *
 * Header propagation: original headers carry through unchanged on
 * rewrite. The content length will shift because the new body differs;
 * we set the rewritten body via Response and let fetch infrastructure
 * recompute Content-Length. We DO preserve Content-Type — both branches
 * keep the same media type.
 */
export function wrapWithValidationRemap(
    handler: (req: Request) => Promise<Response>,
): (req: Request) => Promise<Response> {
    return async (req: Request) => {
        const res = await handler(req)
        const contentType = res.headers.get("content-type") ?? ""
        if (contentType.includes("application/json")) {
            const text = await res.clone().text()
            let body: unknown
            try {
                body = JSON.parse(text)
            } catch {
                return res
            }
            const fixed = remapValidationError(body)
            if (fixed === body) return res
            return new Response(JSON.stringify(fixed), {
                status: res.status,
                headers: res.headers,
            })
        }
        if (contentType.includes("text/event-stream")) {
            const text = await res.clone().text()
            const fixed = remapValidationSseBody(text)
            if (fixed === text) return res
            return new Response(fixed, {
                status: res.status,
                headers: res.headers,
            })
        }
        return res
    }
}
