import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "crypto"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import {
    runStorageBackupProd,
    writeStorageBackupError,
} from "@/lib/storage-backup/mirror"
import { logger } from "@/lib/logger"
import { captureException } from "@/lib/error-reporting"
import { env } from "@/env.mjs"
import { httpError } from "@/lib/http/error-envelope"

function safeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) return false
    return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

/**
 * Route-level fail-loud breadcrumb (defense in depth). If the mirror's own
 * catch in `runStorageBackup` couldn't write — because the crash happened
 * BEFORE the inner try (e.g. `new DriveClient()` threw, or `getFirestore()`
 * returned a broken handle) — this still puts the real exception text into
 * `storageBackups/{date}.error` + `config/storageBackup.lastError`.
 *
 * Idempotent with the mirror's own catch (`merge: true` overlays same-shape).
 * Best-effort: any failure here is swallowed (only logged); the original
 * route error is still returned as 500 to the caller.
 */
async function tryRouteFailLoudBreadcrumb(err: unknown): Promise<void> {
    try {
        if (!initAdmin()) return
        await writeStorageBackupError(getFirestore(), err, new Date())
    } catch (writeErr) {
        logger.warn(
            `[storage-backup] route-level fail-loud breadcrumb failed: ${
                writeErr instanceof Error ? writeErr.message : String(writeErr)
            }`,
        )
    }
}

export const dynamic = "force-dynamic"
export const maxDuration = 300

/**
 * GET /api/cron/storage-backup
 *
 * storage-phase2 — Storage→Drive chart-byte mirror (Layer 2 of
 * STORAGE-BACKUP-SYNTHESIS.md). Nightly, mirrors every `library_index`
 * `status=='active'` chart's bytes from Firebase Storage into the dedicated
 * backup Shared Drive (`CRC_BACKUP_DRIVE_FOLDER_ID`): md5-skip incremental
 * (absent→create / match→skip / differ→update), collection subfolders,
 * `<stem>__<fileId>.<ext>` naming, `backupDriveId` pointer-on-row,
 * loop-avoidance (dedicated folder + `appProperties.crcBackup`). Idempotent +
 * self-healing — a re-run is a near-no-op and a half-failed run heals next tick.
 *
 * Dormant by default: if `CRC_BACKUP_DRIVE_FOLDER_ID` is unset, returns
 * `{ ran: false }` and no-ops. Set the env var in Vercel to activate.
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}` (same shape as the sibling
 * crons; Vercel cron sets it automatically when `crons` is in vercel.json).
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
            return httpError(
                401,
                "unauthenticated",
                "Cron route requires Vercel CRON_SECRET bearer auth.",
                {},
                "This endpoint is invoked by Vercel cron; manual probes will always 401 unless you pass the CRON_SECRET bearer.",
            )
        }
        return await runAndRespond(req)
    } catch (err) {
        logger.error("[storage-backup] cron failed:", err)
        captureException(err, { source: "cron", location: "storage-backup" })
        await tryRouteFailLoudBreadcrumb(err)
        return httpError(
            500,
            "server_error",
            "Storage backup cron failed.",
            { debug: err instanceof Error ? err.message : String(err) },
            "Check `storageBackups/{date}.error` in Firestore (written by the fail-loud catch) for the real exception; logs are a fallback.",
        )
    }
}

/**
 * POST /api/cron/storage-backup
 *
 * Manual backup triggered by an admin (e.g. Daniel's deployed-verify run).
 * Requires an admin Firebase ID token. Accepts `?max=<n>` to raise the
 * per-run mirror cap for a one-shot full pass.
 */
export async function POST(req: NextRequest) {
    try {
        const authHeader = req.headers.get("authorization")
        if (!authHeader?.startsWith("Bearer ")) {
            return httpError(401, "unauthenticated", "Admin bearer token required.", {})
        }
        if (!initAdmin()) {
            return httpError(503, "server_not_ready", "Firebase Admin SDK not initialized.", {})
        }
        const token = authHeader.slice(7)
        const { getAuth } = await import("firebase-admin/auth")
        const decoded = await getAuth().verifyIdToken(token)
        if (decoded.role !== "admin") {
            return httpError(403, "forbidden_role", "Admin access required.", {})
        }
        return await runAndRespond(req)
    } catch (err) {
        logger.error("[storage-backup] manual backup failed:", err)
        captureException(err, { source: "api", location: "storage-backup-manual" })
        await tryRouteFailLoudBreadcrumb(err)
        return httpError(
            500,
            "server_error",
            "Storage backup failed.",
            { debug: err instanceof Error ? err.message : String(err) },
            "Check `storageBackups/{date}.error` in Firestore (written by the fail-loud catch) for the real exception; logs are a fallback.",
        )
    }
}

async function runAndRespond(req: NextRequest): Promise<NextResponse> {
    const backupFolderId = env.CRC_BACKUP_DRIVE_FOLDER_ID
    if (!backupFolderId) {
        logger.info(
            "[storage-backup] CRC_BACKUP_DRIVE_FOLDER_ID unset — cron is dormant",
        )
        return NextResponse.json({
            success: true,
            ran: false,
            reason:
                "CRC_BACKUP_DRIVE_FOLDER_ID env var not configured — set it in Vercel (a dedicated Shared Drive) to enable.",
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

    const maxParam = req.nextUrl.searchParams.get("max")
    const maxMirrorsPerRun =
        maxParam && Number.isFinite(Number(maxParam)) && Number(maxParam) > 0
            ? Math.floor(Number(maxParam))
            : undefined

    const result = await runStorageBackupProd(db, backupFolderId, {
        maxMirrorsPerRun,
    })
    logger.info("[storage-backup] run complete", {
        scanned: result.scanned,
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
        deferred: result.deferred,
        failed: result.failed,
        bytesMirrored: result.bytesMirrored,
    })
    return NextResponse.json({ success: true, ...result })
}
