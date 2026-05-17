import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "crypto"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { runDriveSyncProd } from "@/lib/drive-sync/poller"
import { logger } from "@/lib/logger"
import { captureException } from "@/lib/error-reporting"
import { env } from "@/env.mjs"
import { httpError } from "@/lib/http/error-envelope"

function safeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) return false
    return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

export const dynamic = "force-dynamic"
export const maxDuration = 300

/**
 * GET /api/cron/drive-sync
 *
 * Cycle-3 NEW-1 — Storage-canonical pipeline cron.
 *
 * Watches `DAVID_DRIVE_DROP_FOLDER_ID` (David Lazaroff's chart drop folder)
 * + its direct subfolders every 5 minutes. New / renamed / replaced files
 * flow through `processChartUpload` so Storage stays canonical. Drive
 * deletes do NOT propagate. Per-file failures land in `chartImportQueue`
 * (the NEW-4 review queue's source).
 *
 * Coexists with the legacy hourly `/api/cron/sync` (`syncLibraryIndex`,
 * keyed on `GOOGLE_DRIVE_ROOT_FOLDER_ID`) — different folders, different
 * concerns. See `.coord/shared/decisions.md` 2026-05-17T23:40Z.
 *
 * Dormant by default: if `DAVID_DRIVE_DROP_FOLDER_ID` is unset, returns
 * `{watching: false}` and no-ops. Set the env var in Vercel to activate.
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}` (same shape as the existing
 * crons). Vercel cron sets this automatically when `crons` is configured
 * in `vercel.json`.
 */
export async function GET(req: NextRequest) {
    try {
        const authHeader = req.headers.get("authorization")
        const cronSecret = env.CRON_SECRET
        if (
            !cronSecret ||
            !authHeader ||
            !safeCompare(authHeader, `Bearer ${cronSecret}`)
        ) {
            // Cycle-3 REG-002: rich envelope on the wire. Vercel cron's
            // bearer auth is distinct from MCP bearers — any non-Vercel
            // caller gets refused here regardless of MCP role.
            return httpError(
                401,
                "unauthenticated",
                "Cron route requires Vercel CRON_SECRET bearer auth.",
                {},
                "This endpoint is invoked by Vercel cron; manual probes will always 401.",
            )
        }

        const parentFolderId = env.DAVID_DRIVE_DROP_FOLDER_ID
        if (!parentFolderId) {
            logger.info(
                "[drive-sync] DAVID_DRIVE_DROP_FOLDER_ID unset — cron is dormant",
            )
            return NextResponse.json({
                success: true,
                watching: false,
                reason:
                    "DAVID_DRIVE_DROP_FOLDER_ID env var not configured — set in Vercel to enable.",
            })
        }

        if (!initAdmin()) {
            return httpError(
                503,
                "server_not_ready",
                "Firebase Admin SDK not initialized.",
                {},
                "Server is missing FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY.",
            )
        }
        const db = getFirestore()

        const result = await runDriveSyncProd(db, parentFolderId)
        logger.info("[drive-sync] tick complete", {
            parentFolderId,
            filesScanned: result.filesScanned,
            imported: result.imported,
            renamed: result.renamed,
            replaced: result.replaced,
            moved: result.moved,
            skipped: result.skipped,
            queued: result.queued,
        })
        return NextResponse.json({ success: true, ...result })
    } catch (err) {
        logger.error("[drive-sync] cron failed:", err)
        captureException(err, { source: "cron", location: "drive-sync" })
        return httpError(
            500,
            "server_error",
            "Drive sync cron failed.",
            { debug: err instanceof Error ? err.message : String(err) },
            "Check `[drive-sync]` logs in Vercel for the underlying error.",
        )
    }
}
