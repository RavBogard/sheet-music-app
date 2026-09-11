import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"

import { env } from "@/env.mjs"
import { getFirestore, initAdmin } from "@/lib/firebase-admin"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import { orgFrom, type AuthExtra } from "@/lib/mcp/org-context"
import { richError } from "@/lib/mcp/error-envelopes"
import { checkUserRateLimit } from "@/lib/rate-limit"
import {
    buildProdDriveSyncDeps,
    readChartInboxStatus,
    resolveChartInboxFolderId,
    syncChartInboxNow,
    INBOX_POLL_INTERVAL_MINUTES,
    MCP_SYNC_FILE_CAP,
} from "@/lib/drive-sync/inbox"
import { isErrorEnvelope } from "./result-iserror"
import {
    isTrustedLeader,
    isUploadAllowed,
    loadUploader,
    rateLimitEnvelope,
    uploadForbidden,
} from "./uploader-roles"

/**
 * Chart Inbox — MCP registration.
 *
 * Two tools that make "add these charts to the library" work from ANY Claude
 * client for ANY music director or admin, with no file bytes ever passing
 * through the conversation:
 *
 *   get_chart_inbox   → where the shared Drive folder is, whether the watcher is
 *                       healthy, and what it imported recently.
 *   sync_chart_inbox  → import whatever is new in the folder right now instead
 *                       of waiting for the 5-minute cron.
 *
 * The interaction the descriptions teach: the user says they have chart files;
 * Claude hands them the inbox link; they drop the files in from whatever
 * device they are on; Claude calls sync_chart_inbox; the charts are in the
 * library and Claude bonds them to setlist rows.
 */

function jsonResult(result: unknown) {
    return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
        structuredContent: result as Record<string, unknown>,
        isError: isErrorEnvelope(result),
    }
}

function uidFrom(extra: AuthExtra): string {
    const uid = extra.authInfo?.extra?.uid
    if (typeof uid !== "string" || !uid) {
        throw new Error("Unauthenticated MCP request")
    }
    return uid
}

function db(): FirebaseFirestore.Firestore {
    initAdmin()
    return getFirestore()
}

/**
 * The inbox is a single shared folder today and it belongs to the primary
 * tenant. A second tenant gets a clear "not configured for your organization"
 * instead of silently importing into someone else's library.
 */
function inboxFolderFor(org: string): string | null {
    if (org !== DEFAULT_ORG_ID) return null
    return resolveChartInboxFolderId(env)
}

function notConfigured(org: string) {
    return richError(
        "chart_inbox_not_configured",
        org === DEFAULT_ORG_ID
            ? "The Chart Inbox folder is not configured on this deployment (CHART_INBOX_DRIVE_FOLDER_ID is unset)."
            : `The Chart Inbox is not set up for the ${org} organization yet.`,
        { org, errorCode: 404 },
        "For a Google Drive folder the user already has, use import_drive_folder with its link instead.",
    )
}

const HOW_IT_WORKS =
    ` HOW CHART FILES GET INTO THE LIBRARY: you never handle file bytes and there is no upload panel. The user puts the file in the shared "CRC Chart Inbox" Google Drive folder (link in folderUrl) from whatever device they are on — phone share sheet, Drive app, or the browser — and the server imports it. Every ${INBOX_POLL_INTERVAL_MINUTES} minutes this happens automatically; call sync_chart_inbox to do it immediately. Files land in the 'supplemental' collection (or the collection mapped to the subfolder they were dropped in), run through the normal duplicate check, and can then be bonded to setlist rows like any other chart.`

export function registerChartInboxTools(server: McpServer): void {
    // ─── get_chart_inbox ─────────────────────────────────────────────────
    server.registerTool(
        "get_chart_inbox",
        {
            title: "Chart Inbox — where to drop chart files, and what came in",
            description:
                "Get the shared Google Drive folder where users drop chart files for the library, plus the importer's health (last run, last error) and its most recent imports. Call this FIRST whenever a user wants to add chart files they have on a device, or asks 'did my chart come in?'. Give them folderUrl and tell them to drop the files there; then call sync_chart_inbox." +
                HOW_IT_WORKS,
            inputSchema: {
                recentLimit: z
                    .number()
                    .int()
                    .min(1)
                    .max(50)
                    .optional()
                    .describe("How many recent imports to list (default 15)."),
            },
        },
        async (args, extra) => {
            uidFrom(extra as AuthExtra)
            const org = orgFrom(extra as AuthExtra)
            const folderId = inboxFolderFor(org)
            if (!folderId) return jsonResult(notConfigured(org))
            const status = await readChartInboxStatus(db(), folderId, {
                recentLimit: (args as { recentLimit?: number }).recentLimit,
            })
            return jsonResult({ ok: true, ...status })
        },
    )

    // ─── sync_chart_inbox ────────────────────────────────────────────────
    server.registerTool(
        "sync_chart_inbox",
        {
            title: "Import new files from the Chart Inbox now",
            description:
                `Import whatever is new in the Chart Inbox Drive folder right now, instead of waiting up to ${INBOX_POLL_INTERVAL_MINUTES} minutes for the scheduled run. Call it right after the user says they have dropped files in the folder. Returns counts (imported / renamed / replaced / skipped / queued) and per-file error notes. Imports up to ${MCP_SYNC_FILE_CAP} files per call; when capReached is true call it again for the rest. Idempotent — running it twice never double-imports. Requires upload permission (admin, band leader, musician, or an account with canUpload).` +
                HOW_IT_WORKS,
            inputSchema: {
                maxFiles: z
                    .number()
                    .int()
                    .min(1)
                    .max(25)
                    .optional()
                    .describe(
                        `Files to import in this call (default ${MCP_SYNC_FILE_CAP}; keep it small — each file costs a few seconds and the call must finish inside the MCP time limit).`,
                    ),
            },
        },
        async (args, extra) => {
            const uid = uidFrom(extra as AuthExtra)
            const org = orgFrom(extra as AuthExtra)
            const folderId = inboxFolderFor(org)
            if (!folderId) return jsonResult(notConfigured(org))

            const store = db()
            const roles = await loadUploader(store, uid)
            if (!isUploadAllowed(roles)) return jsonResult(uploadForbidden(roles))
            const limited = await checkUserRateLimit(uid, "upload", {
                bypass: isTrustedLeader(roles),
            })
            if (limited) return jsonResult(rateLimitEnvelope(limited.error))

            const deps = await buildProdDriveSyncDeps(store)
            const result = await syncChartInboxNow(folderId, deps, {
                fileCap: (args as { maxFiles?: number }).maxFiles,
            })
            return jsonResult({ ok: true, ...result })
        },
    )
}
