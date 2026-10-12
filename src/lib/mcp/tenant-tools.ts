import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { codeOrgConfig } from "@/lib/org/config-code"
import type { OrgConfig, OrgFeatures } from "@/lib/org/config-schema"
import type { OrgId } from "@/lib/org/types"

/**
 * Multi-tenant phase 4: which authoring tools belong to which tenant feature.
 * A tenant with the feature switched off does not get these tools in its list.
 *
 * Phase 6 settles the flags and adds a check inside each handler; this is only
 * the list mechanism. Tools not named here are always listed (charts, setlists,
 * templates, roster and the rest are always on).
 *
 *   mixer            — the 19 monitor and bridge tools on the authoring surface
 *   driveInbox       — the shared-Drive chart inbox
 *   notifyBand       — the "setlist updated" message to the band
 *   schedulingEmails — none: no authoring tool exists only to send scheduling
 *                      email. assign_musician / unassign_musician notify as a
 *                      side effect of scheduling; phase 6 gates that inside the
 *                      handler rather than removing scheduling.
 *   todayFeed        — none: the feed is a cron and a public file, not a tool.
 *   perform          — none: Perform mode is the browser surface.
 */
export const FEATURE_TOOLS: Readonly<Record<keyof OrgFeatures, readonly string[]>> = {
    mixer: [
        "list_monitor_buses",
        "get_mix",
        "get_matrix",
        "set_send_level",
        "set_send_mute",
        "set_bus_fader",
        "set_matrix_fader",
        "set_matrix_mute",
        "get_command_status",
        "assign_monitor_bus",
        "unassign_monitor_bus",
        "get_bridge_health",
        "bridge_resync",
        "bridge_reconnect",
        "bridge_selftest",
        "bridge_restart",
        "bridge_clear_acks",
        "bridge_clear_pending_commands",
        "bridge_get_log",
    ],
    driveInbox: ["get_chart_inbox", "sync_chart_inbox"],
    notifyBand: ["notify_band", "preview_notify_band"],
    schedulingEmails: [],
    todayFeed: [],
    perform: [],
}

/** Tools the tenant's switched-off features remove from its list. */
export function toolsForDisabledFeatures(features: OrgFeatures): Set<string> {
    const out = new Set<string>()
    for (const key of Object.keys(FEATURE_TOOLS) as Array<keyof OrgFeatures>) {
        if (features[key] === false) for (const t of FEATURE_TOOLS[key]) out.add(t)
    }
    return out
}

/**
 * Whether the feature filter applies to this tenant's list yet.
 *
 * crc and Brothers Lazaroff keep exactly today's tool list in phase 4: BL's
 * config has every flag but `perform` off, and phase 6 is where BL's flags are
 * set to what BL actually uses. So the filter applies to tenants created
 * through config (no compiled config — every tenant after crc and BL), or to
 * every tenant when MCP_FEATURE_FILTER=1.
 */
export function featureFilterApplies(orgId: OrgId, config: OrgConfig | null): boolean {
    if (!config) return false
    if (process.env.MCP_FEATURE_FILTER === "1") return true
    return codeOrgConfig(orgId) === null
}

/**
 * Wrap an `McpServer` so the named tools never register (same technique as
 * forSurface). Registration is the only thing filtered.
 */
export function withoutTools(server: McpServer, drop: ReadonlySet<string>): McpServer {
    if (drop.size === 0) return server
    return new Proxy(server, {
        get(target, prop, receiver) {
            if (prop !== "registerTool") return Reflect.get(target, prop, receiver)
            const original = Reflect.get(target, prop, receiver) as (...args: unknown[]) => unknown
            return function registerToolUnlessDropped(this: unknown, ...args: unknown[]) {
                const name = args[0]
                if (typeof name === "string" && drop.has(name)) return undefined
                return original.apply(target, args)
            }
        },
    }) as McpServer
}
