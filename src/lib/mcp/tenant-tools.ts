import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { OrgConfig, OrgFeatures } from "@/lib/org/config-schema"
import { featuresOf, type FeatureKey } from "@/lib/org/features-client"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"

/**
 * Multi-tenant phase 4: which tools belong to which tenant feature. A tenant
 * with the feature switched off does not get these tools in its list (phase 6:
 * every tenant, crc and BL included), and the handler refuses them too
 * (withFeatureGates), so a cached or stale tool list still cannot reach one.
 * Tools not named here are always listed (charts, setlists, templates, roster
 * and the rest are always on).
 *
 *   mixer            — the 23 monitor and bridge tools (16 authoring, 7 ops);
 *                      CRC-only whatever the flag says (effectiveFeatures)
 *   driveInbox       — the shared-Drive chart inbox
 *   notifyBand       — the "setlist updated" message to the band
 *   schedulingEmails — none: no authoring tool exists only to send scheduling
 *                      email. assign_musician / unassign_musician notify as a
 *                      side effect of scheduling; phase 6 suppresses that email
 *                      and SMS in assignment-service.ts rather than removing
 *                      scheduling.
 *   todayFeed        — none: the feed is a cron and a public file, not a tool.
 *   perform          — none: Perform mode is the browser surface.
 *
 * open_chart_dropzone is not the Drive inbox (it is the batch upload pipeline)
 * and import_drive_folder takes the author's own folder link: both always on.
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
        "get_monitor_limits",
        "set_monitor_limits",
        "list_saved_mixes",
        "recall_mix",
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
 * Tools dropped from `orgId`'s list. Phase 6: the filter applies to every
 * tenant. With no config in hand the compiled config (crc, BL) or the schema
 * defaults decide (features-client featuresOf).
 */
export function droppedToolsFor(orgId: OrgId, config: OrgConfig | null): Set<string> {
    return toolsForDisabledFeatures(featuresOf(config, orgId))
}

const TOOL_FEATURE: ReadonlyMap<string, FeatureKey> = new Map(
    (Object.keys(FEATURE_TOOLS) as FeatureKey[]).flatMap((k) => FEATURE_TOOLS[k].map((t) => [t, k] as const)),
)

/** The feature a tool belongs to, or null for always-on tools. */
export function featureOfTool(name: string): FeatureKey | null {
    return TOOL_FEATURE.get(name) ?? null
}

const FEATURE_OFF_TEXT: Record<FeatureKey, string> = {
    mixer: "The monitor mixer is not available for this organization. It runs only for Central Reform Congregation's sound desk.",
    driveInbox: "The Chart Inbox is switched off for this organization. For a Google Drive folder you already have, use import_drive_folder with its link.",
    notifyBand: "Band notifications are switched off for this organization. Share the setlist link instead.",
    schedulingEmails: "Scheduling emails are switched off for this organization.",
    todayFeed: "The today feed is switched off for this organization.",
    perform: "Perform mode is switched off for this organization.",
}

/** The refusal a gated handler returns: isError with plain text, never a JSON-RPC error. */
export function featureOffResult(key: FeatureKey, orgId: OrgId) {
    const envelope = { ok: false, error: "feature_off", feature: key, org: orgId, message: FEATURE_OFF_TEXT[key] }
    return {
        content: [{ type: "text" as const, text: JSON.stringify(envelope) }],
        isError: true as const,
    }
}

type ExtraLike = { authInfo?: { extra?: Record<string, unknown> } } | undefined

/** The caller's tenant without throwing (the tool's own uid check still runs). */
function callerOrg(extra: ExtraLike): OrgId {
    const orgId = extra?.authInfo?.extra?.orgId
    return typeof orgId === "string" && orgId ? orgId : DEFAULT_ORG_ID
}

export type FeatureCheck = (orgId: OrgId, key: FeatureKey) => Promise<boolean>

/**
 * Wrap an `McpServer` so every feature tool's handler first checks the
 * caller's tenant has the feature (`isOn`, the server's hasFeature). A tenant
 * with it off gets featureOffResult. This is the second gate behind the list
 * filter: it holds for a client with a cached tool list, and on the ops
 * surface, which is not filtered per tenant.
 */
export function withFeatureGates(server: McpServer, isOn: FeatureCheck): McpServer {
    return new Proxy(server, {
        get(target, prop, receiver) {
            if (prop !== "registerTool") return Reflect.get(target, prop, receiver)
            const original = Reflect.get(target, prop, receiver) as (...args: unknown[]) => unknown
            return function registerToolWithGate(this: unknown, ...args: unknown[]) {
                const name = args[0]
                const key = typeof name === "string" ? featureOfTool(name) : null
                const last = args.length - 1
                if (key && typeof args[last] === "function") {
                    const handler = args[last] as (...a: unknown[]) => unknown
                    args[last] = async (...callArgs: unknown[]) => {
                        const orgId = callerOrg(callArgs[callArgs.length - 1] as ExtraLike)
                        if (!(await isOn(orgId, key))) return featureOffResult(key, orgId)
                        return handler(...callArgs)
                    }
                }
                return original.apply(target, args)
            }
        },
    }) as McpServer
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
