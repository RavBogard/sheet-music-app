import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "crypto"
import { initAdmin, getAuth, getFirestore } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"
import { env } from "@/env.mjs"
import { captureException, captureMessage } from "@/lib/error-reporting"
import {
    type StorageBackupHealth,
    checkStorageBackupHealth,
} from "@/lib/storage-backup/health"

/**
 * v4.3 C02 — Admin-role consistency check + PGR-03 storage-backup staleness alarm.
 *
 * firestore.rules grants admin access via EITHER a custom claim
 * (`token.role == 'admin'`) OR membership in `config/admins.uids`.
 * The two paths can drift: if setCustomUserClaims fails silently
 * during an admin promotion, the user keeps `config/admins` access
 * but not the claim — and vice versa. Both paths work in isolation,
 * so the drift can go unnoticed until a role check in the claim-only
 * path breaks.
 *
 * This cron runs daily and logs a warning if any uid in
 * config/admins.uids doesn't have the 'admin' custom claim. Read-
 * only; does NOT auto-repair (a drift is a signal something in the
 * promotion flow failed and should be investigated, not silently
 * papered over).
 *
 * PGR-03 (added 2026-05-23) folds a `storageBackupHealth` check into
 * the same response.  The storage-phase2 daily backup cron writes its
 * outcome to `config/storageBackup`; if `lastBackupAt` falls more
 * than 36h behind (≈ two missed daily runs) or `lastError` was set
 * within the last 36h, we capture a Sentry message so the silent-
 * cron-death failure mode reaches Daniel.  The two signals are
 * independent — both can fire.
 */

function safeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) return false
    return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
    try {
        const authHeader = req.headers.get("authorization")
        const cronSecret = env.CRON_SECRET
        if (!cronSecret || !authHeader || !safeCompare(authHeader, `Bearer ${cronSecret}`)) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        if (!initAdmin()) {
            return NextResponse.json(
                { error: "Server not ready", code: "FIREBASE_NOT_INITIALIZED" },
                { status: 500 },
            )
        }
        const db = getFirestore()
        const auth = getAuth()

        const adminsDoc = await db.collection("config").doc("admins").get()
        const uids = (adminsDoc.data()?.uids ?? []) as string[]

        const drift: Array<{ uid: string; reason: string }> = []
        if (Array.isArray(uids) && uids.length > 0) {
            for (const uid of uids) {
                try {
                    const user = await auth.getUser(uid)
                    const claimRole = (user.customClaims as { role?: string } | undefined)?.role
                    if (claimRole !== "admin") {
                        drift.push({ uid, reason: `claim.role=${claimRole ?? "missing"}` })
                    }
                } catch (e) {
                    drift.push({
                        uid,
                        reason: `getUser failed: ${e instanceof Error ? e.message : String(e)}`,
                    })
                }
            }
        }

        if (drift.length > 0) {
            logger.warn(
                `[admin-consistency] drift detected across ${drift.length}/${uids.length} bootstrap-admin uids: ${JSON.stringify(drift)}`,
            )
            // PGR-03: admin-claim drift is an un-surfaced alert signal — a
            // failed promotion otherwise lives only in logs. Route it to
            // Sentry so it reaches Daniel.
            captureMessage(
                `[admin-consistency] claim drift across ${drift.length}/${uids.length} bootstrap-admin uids`,
                {
                    source: "cron",
                    location: "admin-consistency",
                    extra: { drift },
                },
            )
        } else if (uids.length > 0) {
            logger.info(`[admin-consistency] clean (${uids.length} uids)`)
        }

        // PGR-03 — storage-backup staleness + recent-error alarm.
        const storageBackupHealth = await readAndAlertStorageBackupHealth(db)

        return NextResponse.json({
            checked: uids.length,
            drift,
            storageBackupHealth,
        })
    } catch (err) {
        logger.error("[admin-consistency] check failed:", err)
        captureException(err, { source: "cron", location: "admin-consistency" })
        return NextResponse.json({ error: "Check failed" }, { status: 500 })
    }
}

/**
 * Read `config/storageBackup`, derive freshness + last-error state, and emit
 * Sentry messages on the two independent alarm conditions.  Returns the
 * derived health shape so callers can roll it into their response (the cron
 * endpoint's `storageBackupHealth` key).
 *
 * Fail-open: a Firestore read failure surfaces as `unavailable` in the
 * health doc, never crashes the surrounding admin-consistency check.
 */
async function readAndAlertStorageBackupHealth(
    db: ReturnType<typeof getFirestore>,
): Promise<StorageBackupHealth> {
    let snapshot: Record<string, unknown> | undefined
    try {
        const doc = await db.collection("config").doc("storageBackup").get()
        snapshot = doc.exists ? (doc.data() as Record<string, unknown>) : undefined
    } catch (e) {
        logger.warn(
            `[admin-consistency] storageBackup read failed: ${e instanceof Error ? e.message : String(e)}`,
        )
        return { status: "unavailable" }
    }

    const health = checkStorageBackupHealth(snapshot, Date.now())

    if (health.status === "missing" || health.status === "unavailable") {
        return health
    }
    if (health.stale) {
        captureMessage(
            `storage backup stale: ${health.stalenessHours.toFixed(1)}h since last successful run`,
            {
                source: "cron",
                location: "admin-consistency",
                extra: {
                    lastBackupAt: health.lastBackupAt,
                    stalenessHours: health.stalenessHours,
                    lastError: health.lastError ?? null,
                    lastErrorAt: health.lastErrorAt ?? null,
                },
            },
            "warning",
        )
    }
    if (health.recentError && health.lastError) {
        captureMessage(
            `storage backup last run failed: ${health.lastError}`,
            {
                source: "cron",
                location: "admin-consistency",
                extra: {
                    lastError: health.lastError,
                    lastErrorAt: health.lastErrorAt,
                    lastBackupAt: health.lastBackupAt ?? null,
                },
            },
            "error",
        )
    }
    return health
}
