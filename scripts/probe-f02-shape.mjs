/**
 * Diagnostic for the F-02 regression — hits production /api/mcp directly
 * via raw fetch (bypassing the MCP SDK client) so we see the actual wire
 * shape. Answers: does the server return JSON-RPC `-32602` over the wire,
 * or `{result: {content: [...], isError: true}}` that the client SDK
 * later re-throws?
 *
 * Run:
 *   $env:CRL_MCP_TOKEN = "crl_live_..."   # PowerShell
 *   node scripts/probe-f02-shape.mjs
 *
 * Or bash:
 *   CRL_MCP_TOKEN=crl_live_... node scripts/probe-f02-shape.mjs
 *
 * Token: grab from Claude Desktop's MCP config or %APPDATA%\Claude\.
 *
 * Exits with the raw response headers + body printed.
 */
const token = process.env.CRL_MCP_TOKEN
if (!token) {
    console.error("Missing CRL_MCP_TOKEN env var. Set it to your crl_live_ bearer.")
    process.exit(1)
}

const ENDPOINT = "https://www.centralreform.live/api/mcp"

async function probe(label, body) {
    console.log(`\n=== ${label} ===`)
    console.log("REQUEST BODY:", JSON.stringify(body, null, 2))
    const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json, text/event-stream",
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    })
    console.log("RESPONSE STATUS:", res.status)
    console.log("RESPONSE HEADERS:")
    for (const [k, v] of res.headers.entries()) {
        console.log(`  ${k}: ${v}`)
    }
    const text = await res.text()
    console.log("RESPONSE BODY:")
    console.log(text)
    console.log(`(${text.length} bytes)`)
}

// Stateless probe — the MCP streamable HTTP transport in mcp-handler
// creates a fresh server per request, so initialize may not be strictly
// required. If the first probe errors with "Server not initialized" or
// similar, we'll need to batch [initialize, tools/call].
await probe("create_setlist with empty name", {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: "create_setlist", arguments: { name: "" } },
})

await probe("list_setlists with negative limit", {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name: "list_setlists", arguments: { limit: -5 } },
})

// Also probe the batched form with initialize first, in case stateless
// single-request is rejected.
await probe("batched initialize + create_setlist", [
    {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
            protocolVersion: "2025-06-18",
            capabilities: {},
            clientInfo: { name: "f02-probe", version: "1.0.0" },
        },
    },
    {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "create_setlist", arguments: { name: "" } },
    },
])
