import { zodFormatterFromSdkProse } from "./error-envelopes"

/**
 * F-02 (2026-05-16 bugstomp + v6 regression) — rewrite inputSchema
 * validation failures into the canonical rich-error envelope so agents
 * that do `JSON.parse(content[0].text)` see the same
 * `{ok:false, error:'validation_error', message, issues, hint}` shape
 * every other tool path emits.
 *
 * What the SDK actually does (verified via production probe
 * `scripts/probe-f02-shape.mjs` 2026-05-16, with two earlier
 * misdiagnoses behind it):
 *
 * `@modelcontextprotocol/sdk/server/mcp.js` registers a CallToolRequest
 * handler that calls `validateToolInput(tool, args, name)`. On a Zod
 * failure, validateToolInput throws `McpError(InvalidParams, "Input
 * validation error: Invalid arguments for tool <name>: <ZodError>")`.
 * Two lines later the request handler catches the throw and calls
 * `createToolError(error.message)`, returning a NORMAL CallToolResult
 * shaped `{content: [{type: "text", text: "<the error.message>"}],
 * isError: true}`. The `-32602` code never makes it onto the JSON-RPC
 * envelope — only into the text content as prose ("MCP error -32602:
 * Input validation error: ...").
 *
 * Two prior fix attempts were wrong-target because of this:
 *
 *   - v5 (`51f529f3f`) wrapped JSON-body responses looking for
 *     `error.code === -32602`. The field never exists on the wire, so
 *     the wrapper short-circuited on every real tool call. Unit tests
 *     passed against a hand-rolled JSON-RPC shape that doesn't occur in
 *     practice.
 *   - v6-first-attempt (`d9d51d718`) extended the same hunt to
 *     SSE-framed bodies. Same problem — no `error.code` field to find.
 *     The SSE plumbing it added is correct and reused below.
 *
 * Real fix: scan each JSON-RPC message for `result.isError === true`
 * AND `content[0].text` starting with the SDK's `"MCP error -32602:"`
 * prefix. Rewrite the content text to JSON.stringify({error: <stripped
 * prose>}), preserve `isError: true` so agents checking the structural
 * flag still know the call failed.
 *
 * Why this lives outside route.ts: Next.js App Router only allows
 * route.ts to export HTTP handlers + route-segment config. The helper
 * needs to be exported for unit testing, so it ships in its own module.
 *
 * Other JSON-RPC errors (-32603 internal, -32601 method-not-found,
 * etc.) pass through unchanged — those represent transport/protocol
 * failures the agent should still see as such. The legacy `-32602`
 * error-layer remap (`remapJsonRpcErrorMessage` below) is kept as
 * defense-in-depth in case a future SDK version surfaces InvalidParams
 * at the JSON-RPC layer instead of swallowing it into isError.
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

type CallToolResult = {
    content?: Array<{ type?: unknown; text?: unknown }>
    isError?: unknown
}

/**
 * Exact prefix the MCP SDK emits when inputSchema validation fails.
 * Comes from `@modelcontextprotocol/sdk/server/mcp.js` line ~178:
 *   throw new McpError(ErrorCode.InvalidParams,
 *     `Input validation error: Invalid arguments for tool ${toolName}: ${errorMessage}`)
 * which becomes `"MCP error -32602: Input validation error: ..."` when
 * the catch wrapper passes `error.message` to createToolError.
 */
const SDK_VALIDATION_PREFIX = "MCP error -32602: Input validation error:"
/** Strip the redundant `"MCP error -32602: "` noise from the rewrite. */
const SDK_MCPERROR_NOISE = "MCP error -32602: "

/**
 * Defense-in-depth: if a future SDK or transport surfaces InvalidParams
 * at the JSON-RPC layer (`{error: {code: -32602, message}}`), translate
 * it. Today the SDK always wraps via createToolError so this never
 * fires in practice, but keeping it is cheap and the existing unit
 * tests pin the contract.
 */
/**
 * Strip the SDK validation-error prefix from a raw prose string. The
 * SDK's McpError messages look like `"Input validation error: Invalid
 * arguments for tool <name>: <issues JSON>"` so the prefix-strip leaves
 * `zodFormatterFromSdkProse` the substring it can structurally parse.
 * When the prose doesn't carry the prefix (defense-in-depth path), we
 * pass it through unchanged — `zodFormatterFromSdkProse` falls back to
 * a single-issue envelope carrying the raw text.
 */
function stripSdkValidationPrefix(raw: string): string {
    return raw.startsWith("Input validation error:")
        ? raw
        : raw.startsWith(SDK_MCPERROR_NOISE)
          ? raw.slice(SDK_MCPERROR_NOISE.length)
          : raw
}

function remapJsonRpcErrorMessage(msg: JsonRpcMessage): unknown {
    if (!msg.error || typeof msg.error !== "object") return msg
    if (msg.error.code !== -32602) return msg
    const raw =
        typeof msg.error.message === "string"
            ? msg.error.message
            : "Validation failed"
    const envelope = zodFormatterFromSdkProse(stripSdkValidationPrefix(raw))
    return {
        jsonrpc: msg.jsonrpc,
        id: msg.id,
        result: {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(envelope, null, 2),
                },
            ],
            isError: true,
        },
    }
}

/**
 * The path the SDK actually takes today: validation failure becomes
 * `result.isError === true` with `content[0].text` starting with the
 * SDK validation prefix. Rewrite the text into the `{error: ...}`
 * envelope; keep `isError: true` so agents checking that flag still
 * see the structural failure signal.
 */
function remapValidationResult(msg: JsonRpcMessage): unknown {
    if (!msg.result || typeof msg.result !== "object") return msg
    const result = msg.result as CallToolResult
    if (result.isError !== true) return msg
    const content = result.content
    if (!Array.isArray(content) || content.length === 0) return msg
    const first = content[0]
    if (!first || typeof first !== "object") return msg
    const text = first.text
    if (typeof text !== "string") return msg
    if (!text.startsWith(SDK_VALIDATION_PREFIX)) return msg
    const stripped = text.slice(SDK_MCPERROR_NOISE.length)
    const envelope = zodFormatterFromSdkProse(stripped)
    return {
        jsonrpc: msg.jsonrpc,
        id: msg.id,
        result: {
            ...result,
            content: [
                {
                    type: "text",
                    text: JSON.stringify(envelope, null, 2),
                },
                ...content.slice(1),
            ],
            isError: true,
        },
    }
}

function remapValidationMessage(msg: unknown): unknown {
    if (!msg || typeof msg !== "object") return msg
    const m = msg as JsonRpcMessage
    const errorRemapped = remapJsonRpcErrorMessage(m)
    if (errorRemapped !== m) return errorRemapped
    return remapValidationResult(m)
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
