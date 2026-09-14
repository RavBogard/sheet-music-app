import { richError } from "@/lib/mcp/error-envelopes"
import { SETLIST_READER_PREFIX } from "@/lib/mcp/tokens"

/**
 * Scoped-bearer policy — the pure, transport-free half of the
 * `setlist_reader` credential.
 *
 * A `setlist_reader` bearer is a LONG-LIVED, READ-ONLY service credential
 * minted host-side for another product (the CRC Overlays setlist import). It
 * deliberately does NOT look like a minted admin bearer:
 *
 *   - prefix `crl_read_` (not `crl_live_`) so the request layer can tell the
 *     two apart before touching Firestore;
 *   - no `ttlExpiresAt` — it is not a 30-day credential that silently dies
 *     mid-service. Revocation is explicit (`revoke_setlist_reader_bearer`);
 *   - an ALLOW-LIST of exactly three read tools. Everything else — every write
 *     tool, every admin tool, every mint/revoke tool — is refused at the
 *     request layer, before the MCP server ever dispatches.
 *
 * This module holds only the decision logic (no Firestore, no Request/Response)
 * so it is unit-testable without an emulator. The request-layer wiring lives in
 * `./scoped-bearer-gate`.
 */

export const SETLIST_READER_KIND = "setlist_reader"

/** The complete set of tools a `setlist_reader` credential may call. */
export const SETLIST_READER_TOOLS = [
    "list_setlists",
    "get_setlist",
    "get_congregation_context",
] as const

export type SetlistReaderTool = (typeof SETLIST_READER_TOOLS)[number]

/**
 * JSON-RPC methods a scoped bearer may call regardless of the tool allow-list.
 * These are protocol plumbing (handshake, keepalive, capability discovery) —
 * refusing them would make the credential unusable by a conformant MCP client.
 * `tools/list` is allowed but its RESULT is filtered (see `filterToolsList`) so
 * the credential never even sees the tools it cannot call.
 */
const PROTOCOL_METHODS = new Set(["initialize", "ping", "tools/list"])

/** Cheap prefix test — does this raw bearer claim to be a scoped reader? */
export function isSetlistReaderToken(raw: unknown): boolean {
    return typeof raw === "string" && raw.startsWith(SETLIST_READER_PREFIX)
}

type JsonRpcMessage = {
    jsonrpc?: unknown
    id?: unknown
    method?: unknown
    params?: unknown
    result?: unknown
}

export type ScopeDecision =
    | { allow: true }
    | { allow: false; response: unknown }

/**
 * Serialise a rich error envelope the same way every tool result is serialised
 * (a `content: [{type:"text", text:<pretty JSON>}]` payload with
 * `isError: true`), so an agent doing `JSON.parse(content[0].text)` sees the
 * canonical `{ok:false, error:{...}, hint}` shape it already handles.
 */
function forbiddenScopeResult(tool: string, allowedTools: readonly string[]) {
    const envelope = richError(
        "forbidden_scope",
        "This credential can only call list_setlists, get_setlist and get_congregation_context.",
        { tool, allowedTools: [...allowedTools] },
        "Use the read tools listed in allowedTools; anything else needs a full bearer.",
    )
    return {
        content: [{ type: "text", text: JSON.stringify(envelope, null, 2) }],
        isError: true,
    }
}

function invalidRequest() {
    return {
        jsonrpc: "2.0",
        id: null,
        error: {
            code: -32600,
            message: "Invalid Request",
            data: { allowedTools: [...SETLIST_READER_TOOLS] },
        },
    }
}

function methodNotAvailable(id: unknown, method: string) {
    return {
        jsonrpc: "2.0",
        id: id ?? null,
        error: {
            code: -32601,
            message: "Method not available to this credential",
            data: { method, allowedTools: [...SETLIST_READER_TOOLS] },
        },
    }
}

/**
 * Evaluate ONE JSON-RPC message. Returns `null` when the message is allowed,
 * or the refusal message to send in its place.
 *
 * FAILS CLOSED: anything we cannot positively recognise as an in-scope request
 * — a non-object, a nested array, a message with no string `method` — is
 * refused with `-32600 Invalid Request` rather than forwarded. A scoped
 * credential must never reach the server through a shape this gate does not
 * understand.
 */
function evaluateOne(msg: unknown, allowedTools: readonly string[]): unknown | null {
    if (!msg || typeof msg !== "object" || Array.isArray(msg)) {
        return invalidRequest()
    }
    const m = msg as JsonRpcMessage
    const method = typeof m.method === "string" ? m.method : null
    if (!method) return invalidRequest()

    // Notifications are fire-and-forget protocol traffic (initialized,
    // cancelled, progress). They carry no capability, so they pass.
    if (method.startsWith("notifications/")) return null
    if (PROTOCOL_METHODS.has(method)) return null

    if (method === "tools/call") {
        const params = (m.params ?? {}) as Record<string, unknown>
        const name = typeof params.name === "string" ? params.name : ""
        if (allowedTools.includes(name)) return null
        return {
            jsonrpc: "2.0",
            id: m.id ?? null,
            result: forbiddenScopeResult(name, allowedTools),
        }
    }

    return methodNotAvailable(m.id, method)
}

/**
 * Decide whether a whole request body (single JSON-RPC message or a batch
 * array) may reach the MCP server. A batch is refused as a unit as soon as ONE
 * member is out of scope — but the refusal array answers EVERY member, the
 * refused ones with their refusal and the allowed ones with a `forbidden_scope`
 * envelope too, because we never dispatch a partially-executed batch.
 */
export function evaluateScopedJsonRpc(
    body: unknown,
    allowedTools: readonly string[],
): ScopeDecision {
    if (Array.isArray(body)) {
        const decisions = body.map((m) => evaluateOne(m, allowedTools))
        if (decisions.every((d) => d === null)) return { allow: true }
        // Answer the whole batch: refused members get their own refusal;
        // members that would have been allowed get a forbidden_scope result so
        // the client never mistakes a silent drop for success.
        const response = body.map((m, i) => {
            const refusal = decisions[i]
            if (refusal !== null) return refusal
            const msg = (m ?? {}) as JsonRpcMessage
            const params = (msg.params ?? {}) as Record<string, unknown>
            const name = typeof params.name === "string" ? params.name : ""
            return {
                jsonrpc: "2.0",
                id: msg.id ?? null,
                result: forbiddenScopeResult(name, allowedTools),
            }
        })
        return { allow: false, response }
    }

    const refusal = evaluateOne(body, allowedTools)
    return refusal === null ? { allow: true } : { allow: false, response: refusal }
}

type ToolsListResult = { tools?: unknown }

function filterOneToolsList(msg: unknown, allowedTools: readonly string[]): unknown {
    if (!msg || typeof msg !== "object" || Array.isArray(msg)) return msg
    const m = msg as JsonRpcMessage
    if (!m.result || typeof m.result !== "object") return msg
    const result = m.result as ToolsListResult
    if (!Array.isArray(result.tools)) return msg
    const kept = result.tools.filter((t) => {
        const name = (t as { name?: unknown } | null)?.name
        return typeof name === "string" && allowedTools.includes(name)
    })
    if (kept.length === result.tools.length) return msg
    return { ...m, result: { ...result, tools: kept } }
}

/**
 * Keep only allowed tools in a `tools/list` result. Accepts a single JSON-RPC
 * message or a batch array; anything that isn't a tools/list result passes
 * through by identity so callers can skip the Response rebuild.
 */
export function filterToolsList(
    responseBody: unknown,
    allowedTools: readonly string[],
): unknown {
    if (Array.isArray(responseBody)) {
        const mapped = responseBody.map((m) => filterOneToolsList(m, allowedTools))
        return mapped.some((r, i) => r !== responseBody[i]) ? mapped : responseBody
    }
    return filterOneToolsList(responseBody, allowedTools)
}

/**
 * SSE-framed variant of `filterToolsList`. mcp-handler writes each JSON-RPC
 * message as one `data: <json>` line inside an event separated by `\n\n` — the
 * same framing `zod-envelope-remap.remapValidationSseBody` handles. Identity is
 * preserved when nothing needed rewriting.
 */
export function filterToolsListSseBody(
    body: string,
    allowedTools: readonly string[],
): string {
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
        const filtered = filterToolsList(parsed, allowedTools)
        if (filtered === parsed) return event
        lines[dataIdx] = `data: ${JSON.stringify(filtered)}`
        mutated = true
        return lines.join("\n")
    })
    return mutated ? out.join("\n\n") : body
}
