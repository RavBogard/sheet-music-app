/**
 * MCP probe — `tools/list` smoke.
 *
 * Smallest meaningful MCP-surface probe: the server responds to `tools/list`
 * and advertises a tools array. A regression here means the entire `/api/mcp`
 * endpoint is down or the registration shape broke — every other probe
 * downstream would cascade-fail with confusing transport errors. Detecting
 * it here returns one clean, scoped finding.
 *
 * The current deployed surface is 108 tools (per `_parity.json` 2026-05-26).
 * We don't pin to that number — registries grow — but we do refuse to call
 * the run "clean" if fewer than 50 tools register, which would be a hard
 * regression versus the canonical baseline.
 */

import { mcpToolsList } from "../lib/mcp-call.mjs"

/** Below this count we treat the registry as broken. The 108 deployed
 *  surface vs a 50 floor leaves comfortable headroom for legitimate churn. */
const MIN_TOOL_FLOOR = 50

/**
 * @param {{ baseUrl: string, bearer?: string }} args
 */
export default async function probe({ baseUrl, bearer }) {
    if (!bearer) {
        throw new Error(
            "server-tools-list: bearer required (pass --bearer=$MCP_BEARER to probe-batch / npm run stress)",
        )
    }
    const tools = await mcpToolsList({ baseUrl, bearer })
    if (tools.length < MIN_TOOL_FLOOR) {
        throw new Error(
            `server-tools-list: only ${tools.length} tools registered (floor ${MIN_TOOL_FLOOR}); deployed baseline was 108 (2026-05-26 _parity.json). MCP registry regression?`,
        )
    }
    return {
        toolCount: tools.length,
        sampleNames: tools.slice(0, 5).map((t) => t.name),
    }
}
