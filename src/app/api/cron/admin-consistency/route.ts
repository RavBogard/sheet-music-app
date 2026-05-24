import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "crypto"
import { getStorage } from "firebase-admin/storage"
import { initAdmin, getAuth, getFirestore } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"
import { env } from "@/env.mjs"
import { captureException, captureMessage } from "@/lib/error-reporting"
import {
    type StorageBackupHealth,
    checkStorageBackupHealth,
} from "@/lib/storage-backup/health"
import {
    DEFAULT_LIBRARY_BYTES_SAMPLE_SIZE,
    checkLibraryBytesHealth,
    type LibraryBytesBucket,
    type LibraryBytesHealthResult,
    type LibraryBytesRow,
} from "@/lib/library/bytes-health"

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
 *
 * PGR-04 (added 2026-05-24) folds a `libraryBytesHealth` check into
 * the same response — the inverse of PGR-03's BACKUP-health. The
 * primary `library/{fileId}` Storage bytes can silently vanish while
 * the `library_index` row keeps claiming they exist (the failure
 * mode of the 2026-05-23T14:04Z cron-blast disarmed at `e9442cae1`
 * and hard-removed at `a41f9aef8`). We sample the N
 * most-recently-`lastSyncedAt` active rows, probe their Storage bytes
 * via a single prefix listing per row, and capture a Sentry message
 * if any are missing. The two PGR-04 alarm levels (warning at <5% of
 * sample, error at ≥5%) are independent from PGR-03; all three
 * Sentry messages may co-fire on a really bad day.
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

        // PGR-04 — primary library bytes-present invariant alarm.
        const libraryBytesHealth = await readAndAlertLibraryBytesHealth(db)

        return NextResponse.json({
            checked: uids.length,
            drift,
            storageBackupHealth,
            libraryBytesHealth,
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

/**
 * Output shape we hand back to the cron caller for the PGR-04 section.
 * `'unavailable'` covers the read-throws path so a Firestore/Storage outage
 * doesn't crash the surrounding admin-consistency check (fail-open mirrors
 * the PGR-03 shape — silence the alarm rather than amplify the outage).
 */
type LibraryBytesHealthResponse =
    | { status: "unavailable" }
    | (LibraryBytesHealthResult & { status: "ok" })

/**
 * PGR-04 — sample the N most-recently-`lastSyncedAt` active library rows,
 * probe their Storage bytes, and emit Sentry alarms on the dual threshold:
 *   - 'warning' when any byte is missing (single-digit anomaly — could be
 *     a legitimate orphan-mark-then-delete-bytes op the alarm is correctly
 *     drawing attention to);
 *   - 'error'   when the missing fraction crosses 5% of the sample
 *     (high-confidence blast signal — mirror of the 2026-05-23 incident).
 *
 * Fail-open. A Firestore read failure or a Storage SDK init failure surfaces
 * as `unavailable`; per-row probe failures are absorbed inside the helper.
 */
async function readAndAlertLibraryBytesHealth(
    db: ReturnType<typeof getFirestore>,
): Promise<LibraryBytesHealthResponse> {
    let rows: LibraryBytesRow[]
    let bucket: LibraryBytesBucket
    try {
        const snap = await db
            .collection("library_index")
            .where("status", "==", "active")
            .orderBy("lastSyncedAt", "desc")
            .limit(DEFAULT_LIBRARY_BYTES_SAMPLE_SIZE)
            .get()
        rows = snap.docs.map((doc) => {
            const data = doc.data() as Record<string, unknown>
            return {
                fileId: doc.id,
                lastSyncedAt: data.lastSyncedAt,
                updatedAt: data.updatedAt,
            }
        })
    } catch (e) {
        logger.warn(
            `[admin-consistency] library_index read failed: ${e instanceof Error ? e.message : String(e)}`,
        )
        return { status: "unavailable" }
    }

    try {
        const bucketName =
            process.env.FIREBASE_STORAGE_BUCKET ||
            process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
            `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebasestorage.app`
        bucket = getStorage().bucket(bucketName) as unknown as LibraryBytesBucket
    } catch (e) {
        logger.warn(
            `[admin-consistency] storage bucket init failed: ${e instanceof Error ? e.message : String(e)}`,
        )
        return { status: "unavailable" }
    }

    const health = await checkLibraryBytesHealth(rows, bucket, Date.now())

    if (health.verdict === "warning") {
        captureMessage(
            `library_index bytes missing: ${health.missingCount} of ${health.scanned} sampled rows`,
            {
                source: "cron",
                location: "admin-consistency",
                extra: {
                    subsystem: "library-bytes-health",
                    missingCount: health.missingCount,
                    scanned: health.scanned,
                    sampleSize: health.sampleSize,
                    oldestMissing: health.oldestMissing,
                    oldestMissingAgeHours: health.oldestMissingAgeHours,
                    missing: health.missing,
                },
            },
            "warning",
        )
    } else if (health.verdict === "error") {
        captureMessage(
            `library_index bytes blast: ${health.missingCount} of ${health.scanned} sampled rows missing (≥5% threshold)`,
            {
                source: "cron",
                location: "admin-consistency",
                extra: {
                    subsystem: "library-bytes-health",
                    missingCount: health.missingCount,
                    scanned: health.scanned,
                    sampleSize: health.sampleSize,
                    oldestMissing: health.oldestMissing,
                    oldestMissingAgeHours: health.oldestMissingAgeHours,
                    missing: health.missing,
                },
            },
            "error",
        )
    }

    return { status: "ok", ...health }
}
