import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { isReadOnlyToken, type AuthExtra } from "@/lib/mcp/org-context"
import { isReadTool } from "@/lib/mcp/tool-access"

/**
 * Which MCP server a tool appears on — audit item (p).
 *
 * THE PROBLEM THIS SOLVES IS CHOICE, NOT ACCESS. All 144 tools were registered
 * on one server, so every Claude Desktop connect handed the agent a 144-item
 * menu to pick from for "add Kol Nidre to Friday". Every ops tool here is
 * already admin-gated and most are `dryRun`-default; nothing below grants or
 * removes a permission. It changes what an agent has to read past to find the
 * tool Daniel meant.
 *
 * THE SPLIT IS BY WHAT THE WEEK LOOKS LIKE. Authoring is what Daniel does most
 * weeks: build a service, move rows, bind charts, upload a chart, set a monitor
 * mix, ask who is playing. Ops is what someone does once and then not again for
 * months: a backfill, a dedupe run, a salvage, a bridge restart, minting or
 * revoking a credential, a collection-size dump.
 *
 * THE PLAN'S NUMBER DOES NOT FOLLOW FROM THE PLAN'S CATEGORIES. The handoff
 * asks for "a default authoring server of roughly 40 (setlists, tracks,
 * templates, books, roster, library search, monitor)". Those named categories
 * come to about 96 tools once counted — roster alone is 11, chart upload 14,
 * monitor 19, and the setlist/template/track core 36. Forty is reachable only
 * by moving things Daniel uses weekly onto a second connector, which is a worse
 * surface than the one being fixed. So this file implements the CATEGORIES and
 * reports the count: 48 ops, the rest authoring. See the Wave 2 return.
 */

/**
 * Tools that belong on the ops server.
 *
 * An explicit ops list (rather than an explicit authoring list) is deliberate:
 * a newly added tool lands on the AUTHORING surface by default, which is where
 * almost every new tool belongs and where a mistake is visible immediately
 * instead of silently missing.
 */
export const OPS_TOOLS: ReadonlySet<string> = new Set([
    // Backfills and hygiene sweeps. The handoff wanted all six RETIRED as
    // completed one-shots. Confirmed 2026-09-22 with an admin bearer, and the
    // premise only held for one of them:
    //
    //   - `seed_legacy_dedupe_run` WAS a true one-shot — it imported the
    //     09-01 undo artifact into `dedupeRuns/legacy-2026-09-01`. That record
    //     exists and carries its 83 prior-status rows, and the source JSON is
    //     no longer in the repo. RETIRED; the helper and its tests stay.
    //   - The other four are NOT finished migrations, they are RECURRING
    //     hygiene sweeps. Run that same day they found live drift:
    //     track_mimetype healed 253 tracks, setlist_test_flag 21 setlists,
    //     library_index 4 rows. Deleting them would leave the next 278 rows of
    //     drift with no remedy, so they stay.
    //   - `backfill_heal_metadata` was mis-classified by the handoff: it takes
    //     a required `fileId` and repairs one file. It is not a sweep and has
    //     no "completed" state to confirm.
    //
    // Tenant note: content_hash and library_index are org-scoped via
    // `orgFrom(extra)`, and the confirmation above covers the crc tenant only
    // (927 of 990 library_index rows). The 63 Brothers Lazaroff rows need a
    // BL-org bearer, which is not mintable from a crc one.
    "backfill_content_hash",
    "backfill_heal_metadata",
    "backfill_track_mimetype",
    "backfill_library_setting_parts",
    "backfill_library_keys",
    "backfill_library_index",
    "backfill_setlist_test_flag",
    "backfill_setlist_service_class",
    "seed_service_profiles",
    "archive_nonchart_artifacts",
    "reconcile_library",

    // Dedupe and salvage — destructive-adjacent library surgery.
    "dedupe_library",
    "undo_dedupe_group",
    "salvage_chart_bytes",

    // Bond review. A correction pass over how charts were matched to rows,
    // not something done while building a service.
    "flag_bond",
    "review_flagged_bonds",
    "review_chart_bonds",
    "get_correction_stats",

    // AI enrichment calibration + review queue. Admin-only triage of what the
    // provider suggested; `/manage/library-review` is its real surface.
    // `edit_library_entry` is NOT here — editing a library row is authoring.
    "get_ai_config",
    "set_ai_auto_apply",
    "set_ai_threshold",
    "list_review_queue",
    "get_enrichment_suggestion",
    "accept_enrichment",
    "reject_enrichment",
    "edit_enrichment",
    "retry_enrichment",
    "dismiss_failure",

    // Bridge housekeeping. `list_monitor_buses`, `get_mix`, `set_send_level`
    // and the rest of the mixing surface stay on authoring — a sound engineer
    // uses those during a service. Restarting the bridge is not that.
    "bridge_resync",
    "bridge_reconnect",
    "bridge_selftest",
    "bridge_restart",
    "bridge_clear_acks",
    "bridge_clear_pending_commands",
    "bridge_get_log",

    // Observability.
    "dump_collection_size",
    "get_web_vitals_summary",
    "get_ai_spend_summary",

    // Test accounts and fixture cleanup.
    "create_test_account",
    "list_test_accounts",
    "revoke_test_account",
    "sweep_orphan_test_data",
    "cleanup_all_test_data",
    "__test_delete_storage_object",

    // Credential minting and revocation. Sharing a setlist with a reader is
    // arguably authoring, but issuing and revoking credentials is one job and
    // splitting it across two connectors would be worse than either placement.
    "mint_admin_bearer",
    "list_minted_bearers",
    "revoke_minted_bearer",
    "mint_setlist_reader_bearer",
    "list_setlist_reader_bearers",
    "revoke_setlist_reader_bearer",
])

/**
 * Multi-tenant phase 4: the platform owner's server, `/api/platform/mcp`.
 * These 17 tools exist ONLY there (registered by src/lib/mcp/platform/), and
 * that server registers nothing else. It accepts only platform bearers.
 */
export const PLATFORM_TOOLS: ReadonlySet<string> = new Set([
    "list_tenants",
    "get_tenant",
    "create_tenant",
    "update_tenant",
    "set_tenant_features",
    "add_tenant_domain",
    "check_tenant_domain",
    "remove_tenant_domain",
    "list_tenant_members",
    "set_tenant_member_role",
    "remove_tenant_member",
    "invite_tenant_admin",
    "list_collections",
    "set_collection_sharing",
    "assign_collection",
    "mint_tenant_view_bearer",
    "list_platform_activity",
])

export type Surface = "authoring" | "ops" | "platform"

/**
 * Multi-tenant phase 5: a platform tool NAME that also has a tenant-admin
 * variant on the authoring surface (set_collection_sharing in
 * src/lib/mcp/tools/collections-admin.ts: own collections only, never
 * assignedTo). Only a registration whose config carries this marker passes the
 * authoring filter under a platform name, so the platform tool itself still
 * never registers on the authoring server.
 */
export const AUTHORING_VARIANT: unique symbol = Symbol.for("crl.mcp.authoringVariant")

export function surfaceFor(toolName: string): Surface {
    if (PLATFORM_TOOLS.has(toolName)) return "platform"
    return OPS_TOOLS.has(toolName) ? "ops" : "authoring"
}

/**
 * Multi-tenant phase 4: what a read-only ("View as this tenant") caller gets
 * from a write tool. Same rich-error shape as every other refusal.
 */
export function readOnlyRefusal(toolName: string) {
    const body = {
        ok: false,
        error: {
            code: "FORBIDDEN",
            machine_code: "read_only_token",
            message: `${toolName} changes data, and this connection is "View as this tenant", which is read-only. Use your own connector to make changes.`,
        },
    }
    return { content: [{ type: "text" as const, text: JSON.stringify(body, null, 2) }], isError: true as const }
}

/**
 * Wrap an `McpServer` so only one surface's tools actually register.
 *
 * WHY A PROXY AND NOT A REFACTOR. The registrations live in a ~4,000-line
 * `tools/index.ts`, and cutting `registerWriteTools` in half would mean moving
 * dozens of handlers across files — a large mechanical diff over the authoring
 * surface, to express something that is really one table. This keeps the
 * registration code untouched and puts the whole decision in the list above,
 * where it can be read and argued with in one screen.
 *
 * Registration is the ONLY thing filtered. Every tool keeps its own auth gate;
 * a tool missing from a surface is missing from that menu, not from the
 * caller's permissions.
 */
export function forSurface(server: McpServer, surface: Surface): McpServer {
    return new Proxy(server, {
        get(target, prop, receiver) {
            if (prop !== "registerTool") return Reflect.get(target, prop, receiver)
            const original = Reflect.get(target, prop, receiver) as (
                ...args: unknown[]
            ) => unknown
            return function registerToolFiltered(this: unknown, ...args: unknown[]) {
                const name = args[0]
                if (
                    typeof name === "string" &&
                    surfaceFor(name) !== surface &&
                    !(surface === "authoring" && (args[1] as Record<symbol, unknown> | undefined)?.[AUTHORING_VARIANT] === true)
                )
                    return undefined
                // Multi-tenant phase 4: read-only bearers reach read tools only.
                // The handler is the last argument; its last argument is the
                // request extra carrying the verified token's kind.
                const last = args.length - 1
                if (typeof name === "string" && typeof args[last] === "function" && !isReadTool(name)) {
                    const handler = args[last] as (...a: unknown[]) => unknown
                    args = [...args]
                    args[last] = function readOnlyGated(this: unknown, ...cbArgs: unknown[]) {
                        if (isReadOnlyToken(cbArgs[cbArgs.length - 1] as AuthExtra)) return readOnlyRefusal(name)
                        return handler.apply(this, cbArgs)
                    }
                }
                return original.apply(target, args)
            }
        },
    }) as McpServer
}
