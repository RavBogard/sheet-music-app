/**
 * MCP probe — `get_bridge_health`.
 *
 * Read-only smoke for the studio bridge heartbeat path. Asserts the tool
 * resolves with a typed envelope (`{ ok, version?, lastSeen?, x32Connected? }`)
 * — a regression here would mean either:
 *   - the tool was removed/renamed (registry drift), OR
 *   - the route's Firestore read of `config/monitor.bridge` failed shape-wise.
 *
 * Does NOT assert that the bridge is online (`x32Connected:true`) — the
 * studio PC is routinely off; treating an offline bridge as a finding would
 * flood every run. We record `x32Connected` + `version` + `lastSeen` in the
 * probe result for human triage, but only THROW if the envelope itself is
 * malformed (which IS a finding-worthy regression).
 */

import { mcpCallOrThrow } from "../lib/mcp-call.mjs"

/**
 * @param {{ baseUrl: string, bearer?: string }} args
 */
export default async function probe({ baseUrl, bearer }) {
    if (!bearer) {
        throw new Error(
            "get-bridge-health: bearer required (pass --bearer=$MCP_BEARER to probe-batch / npm run stress)",
        )
    }
    const result = await mcpCallOrThrow({
        baseUrl,
        bearer,
        tool: "get_bridge_health",
        args: {},
    })

    if (!result || typeof result !== "object") {
        throw new Error(
            `get-bridge-health: tool returned non-object payload (${typeof result}). Envelope shape regression?`,
        )
    }

    return {
        version: result.version ?? null,
        x32Connected: typeof result.x32Connected === "boolean" ? result.x32Connected : null,
        lastSeen: result.lastSeen ?? null,
        envelopeKeys: Object.keys(result),
    }
}
