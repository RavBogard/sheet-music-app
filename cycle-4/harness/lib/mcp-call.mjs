/**
 * Cycle-4 cowork harness — MCP JSON-RPC + SSE call helper (mjs-flavored).
 *
 * The probe-batch / `--surface=mcp` path needs to call `/api/mcp` tools from
 * plain ESM probe modules (no Playwright `request` context). Mirrors the SSE
 * parsing path the TS `e2e/helpers/mcp.ts` uses (`f023-live-rename`-era
 * convention): POST with `Accept: application/json, text/event-stream`,
 * pluck the first `data: <json>` frame, unwrap `result.content[0].text` into
 * the tool's JSON payload.
 *
 * Validation/refusal envelopes surface as `result.isError: true` with a
 * `{ error, message, context?, hint? }` shape inside the text payload
 * (NOT as JSON-RPC `error.code` — see [[feedback_mcp_validation_shape]]).
 * `mcpCall` returns `{ payload, isError }` unchanged so probes can assert
 * EITHER path explicitly (refusal probes need isError:true; success probes
 * need isError:false + the payload shape they expect).
 *
 * Lives under `cycle-4/harness/lib/` — cowork instrumentation, NOT shipped
 * production code (Tier-1 test-infra; zero `src/` runtime surface).
 */

/**
 * @typedef {Object} McpEnvelope
 * @property {unknown} payload  — tool-returned JSON payload (success body OR
 *                                refusal `{error, message}` envelope).
 * @property {boolean} isError  — SDK isError flag (true ⇔ refusal/validation).
 */

/**
 * Issue a `tools/call` JSON-RPC request to `/api/mcp` and unwrap the SSE
 * envelope. Throws on transport-level / protocol-shape failures; refusal
 * envelopes are returned as `{ payload, isError:true }` so probes can
 * distinguish "the MCP server broke" from "the tool legitimately refused".
 *
 * @param {object} args
 * @param {string} args.baseUrl
 * @param {string} args.bearer
 * @param {string} args.tool
 * @param {Record<string,unknown>} [args.args]
 * @returns {Promise<McpEnvelope>}
 */
export async function mcpCall({ baseUrl, bearer, tool, args = {} }) {
    if (!baseUrl) throw new Error("mcpCall: baseUrl required")
    if (!bearer) throw new Error("mcpCall: bearer required")
    if (!tool) throw new Error("mcpCall: tool name required")

    const res = await fetch(`${baseUrl}/api/mcp`, {
        method: "POST",
        headers: {
            authorization: `Bearer ${bearer}`,
            "content-type": "application/json; charset=utf-8",
            accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
            jsonrpc: "2.0",
            id: Date.now(),
            method: "tools/call",
            params: { name: tool, arguments: args },
        }),
    })

    const raw = await res.text()
    if (!res.ok && !raw.includes("data:")) {
        throw new Error(
            `mcpCall(${tool}): HTTP ${res.status} ${res.statusText} (no SSE frame)\n${raw.slice(0, 400)}`,
        )
    }
    const dataLine = raw.split("\n").find((l) => l.startsWith("data: "))
    if (!dataLine) {
        throw new Error(
            `mcpCall(${tool}): no SSE data frame in response (status ${res.status})\n${raw.slice(0, 400)}`,
        )
    }
    const envelope = JSON.parse(dataLine.slice("data: ".length))
    const text = envelope?.result?.content?.[0]?.text
    if (typeof text !== "string") {
        throw new Error(
            `mcpCall(${tool}): missing text payload in result.content[0]\n${JSON.stringify(envelope).slice(0, 400)}`,
        )
    }
    return {
        payload: JSON.parse(text),
        isError: envelope.result?.isError === true,
    }
}

/**
 * `mcpCall` convenience: throw on isError or legacy `{ok:false}` envelopes.
 * Use for success probes; refusal probes should call `mcpCall` directly and
 * assert `isError === true`.
 *
 * @template T
 * @param {object} args
 * @param {string} args.baseUrl
 * @param {string} args.bearer
 * @param {string} args.tool
 * @param {Record<string,unknown>} [args.args]
 * @returns {Promise<T>}
 */
export async function mcpCallOrThrow(args) {
    const { payload, isError } = await mcpCall(args)
    if (isError) {
        const env = payload ?? {}
        // `env.error` is sometimes a structured object (e.g. zod validation
        // refusal: `{ code, issues: [...] }`); JSON-stringify so it doesn't
        // serialize as `[object Object]` and lose the issues[] detail.
        const errStr =
            typeof env.error === "string"
                ? env.error
                : env.error == null
                  ? "unknown_error"
                  : JSON.stringify(env.error)
        throw new Error(
            `mcpCall(${args.tool}) returned error envelope: ${errStr} — ${env.message ?? "(no message)"}${env.hint ? ` (hint: ${env.hint})` : ""}`,
        )
    }
    // Older tools sometimes return {ok:false, error} without the SDK isError
    // flag — surface that too so success probes don't silently see ok:false.
    if (payload && payload.ok === false && typeof payload.error === "string") {
        throw new Error(
            `mcpCall(${args.tool}) returned legacy error envelope: ${payload.error} — ${payload.message ?? "(no message)"}`,
        )
    }
    return payload
}

/**
 * `tools/list` against `/api/mcp`. Returns the raw `result.tools[]` array
 * (each row has `name`, `description`, `inputSchema`).
 *
 * @param {object} args
 * @param {string} args.baseUrl
 * @param {string} args.bearer
 * @returns {Promise<Array<{name:string,description?:string,inputSchema?:object}>>}
 */
export async function mcpToolsList({ baseUrl, bearer }) {
    if (!baseUrl) throw new Error("mcpToolsList: baseUrl required")
    if (!bearer) throw new Error("mcpToolsList: bearer required")

    const res = await fetch(`${baseUrl}/api/mcp`, {
        method: "POST",
        headers: {
            authorization: `Bearer ${bearer}`,
            "content-type": "application/json; charset=utf-8",
            accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
            jsonrpc: "2.0",
            id: Date.now(),
            method: "tools/list",
            params: {},
        }),
    })

    const raw = await res.text()
    if (!res.ok && !raw.includes("data:")) {
        throw new Error(
            `mcpToolsList: HTTP ${res.status} ${res.statusText}\n${raw.slice(0, 400)}`,
        )
    }
    const dataLine = raw.split("\n").find((l) => l.startsWith("data: "))
    if (!dataLine) {
        throw new Error(
            `mcpToolsList: no SSE data frame in response (status ${res.status})\n${raw.slice(0, 400)}`,
        )
    }
    const envelope = JSON.parse(dataLine.slice("data: ".length))
    const tools = envelope?.result?.tools
    if (!Array.isArray(tools)) {
        throw new Error(
            `mcpToolsList: result.tools is not an array\n${JSON.stringify(envelope).slice(0, 400)}`,
        )
    }
    return tools
}
