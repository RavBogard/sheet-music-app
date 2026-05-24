import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "crypto"
import { getStorage } from "firebase-admin/storage"
import { initAdmin, getAuth, getFirestore } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"
import { env } from "@/env.mjs"
import { captureException, captureMessage } from "@/lib/error-reporting"
import {
    STORAGE_BACKUP_STALENESS_HOURS,
    STORAGE_BACKUP_STALENESS_MS,
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

        // Bootstrap stamp — first time admin-consistency ever tick'd. Acts as a
        // deploy-age oracle for PGR-03's missing-doc alarm (storage-backup
        // missing for >36h post-deploy → real silent death; missing in the
        // first 36h post-deploy → pre-activation/no-yet-fired, do not alarm).
        // Idempotent: only writes on the very first tick.
        const deployAgeMs = await ensureAdminConsistencyBootstrap(db, new Date())

        // PGR-03 — storage-backup staleness + recent-error + tickStale +
        // missing-aged alarms (bundled per storage-backup-silent-death-probe).
        const storageBackupHealth = await readAndAlertStorageBackupHealth(
            db,
            deployAgeMs,
        )

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
 * Idempotently stamp `config/healthBootstrap.firstAdminTickAt` on the very
 * first admin-consistency cron tick after a fresh deploy. Acts as the
 * deploy-age oracle for PGR-03's missing-storage-backup-doc alarm: if
 * storage-backup hasn't ticked at all in the first 36h post-deploy, that's
 * "pre-activation, do not alarm"; if it hasn't ticked after 36h post-deploy,
 * that's "real silent death, alarm".
 *
 * Returns the ms-age since first bootstrap (or null on Firestore error /
 * brand-new deploy where this tick IS the first one — for the first tick
 * deploy-age is 0 so the missing-doc alarm cannot fire yet, exactly the
 * right behavior).
 */
async function ensureAdminConsistencyBootstrap(
    db: ReturnType<typeof getFirestore>,
    now: Date,
): Promise<number | null> {
    try {
        const ref = db.collection("config").doc("healthBootstrap")
        const doc = await ref.get()
        if (!doc.exists) {
            await ref.set({ firstAdminTickAt: now })
            return 0
        }
        const data = (doc.data() ?? {}) as Record<string, unknown>
        const raw = data.firstAdminTickAt
        let firstMs: number | null = null
        // `instanceof Date` must come BEFORE the generic object check —
        // Date is also typeof 'object'.
        if (raw instanceof Date) {
            firstMs = raw.getTime()
        } else if (typeof raw === "number") {
            firstMs = raw
        } else if (typeof raw === "string") {
            const parsed = Date.parse(raw)
            firstMs = Number.isFinite(parsed) ? parsed : null
        } else if (raw && typeof raw === "object") {
            const obj = raw as { toMillis?: unknown; seconds?: unknown }
            if (typeof obj.toMillis === "function") {
                try {
                    firstMs = (obj.toMillis as () => number).call(obj)
                } catch {
                    firstMs = null
                }
            } else if (typeof obj.seconds === "number") {
                firstMs = obj.seconds * 1000
            }
        }
        if (firstMs == null || !Number.isFinite(firstMs)) {
            // Doc exists but stamp unreadable — backfill on this tick.
            await ref.set({ firstAdminTickAt: now }, { merge: true })
            return 0
        }
        return now.getTime() - firstMs
    } catch (e) {
        logger.warn(
            `[admin-consistency] healthBootstrap stamp/read failed: ${e instanceof Error ? e.message : String(e)}`,
        )
        return null
    }
}

/**
 * Read `config/storageBackup`, derive freshness + last-error + tick state,
 * and emit Sentry messages on the four independent alarm conditions:
 *   - `stale`         — lastBackupAt > 36h ago (warning)
 *   - `recentError`   — lastError + lastErrorAt within 36h (error)
 *   - `tickStale`     — cron has not ticked at all in >36h (warning).
 *                       Independent of dormant vs active mode; catches the
 *                       "cron stopped firing entirely" failure class
 *                       (e.g. vercel.json miss, route 500'ing pre-handler).
 *   - missing-aged    — config/storageBackup doc absent AND deploy-age > 36h
 *                       (warning). Distinguishes "pre-activation, expect
 *                       fail-open" from "real silent death" — the failure
 *                       class that left storage-backup-silent-death-probe's
 *                       diagnosis pointing at a dormant-skip + no-heartbeat
 *                       observability gap.
 *
 * `deployAgeMs` is the ms-age of the admin-consistency bootstrap stamp; null
 * means the read/stamp failed (treat as 0 → don't alarm missing-aged).
 *
 * Fail-open: a Firestore read failure surfaces as `unavailable` in the
 * health doc, never crashes the surrounding admin-consistency check.
 */
async function readAndAlertStorageBackupHealth(
    db: ReturnType<typeof getFirestore>,
    deployAgeMs: number | null,
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

    if (health.status === "unavailable") {
        return health
    }

    // missing-aged alarm — storage-backup has never written ANY doc and
    // the cron has had time to fire by now. Pre-fix-deploy state had the
    // doc permanently missing because of the dormant-skip; this alarm
    // catches the re-occurrence path (real silent death, vercel.json
    // regression, or a route that 500s before reaching even the dormant
    // heartbeat write).
    if (health.status === "missing") {
        if (
            deployAgeMs != null &&
            deployAgeMs > STORAGE_BACKUP_STALENESS_MS
        ) {
            captureMessage(
                `storage backup cron has never written a heartbeat in the ${STORAGE_BACKUP_STALENESS_HOURS}h since deploy — check vercel.json + route handler + CRC_BACKUP_DRIVE_FOLDER_ID`,
                {
                    source: "cron",
                    location: "admin-consistency",
                    extra: {
                        subsystem: "storage-backup-health",
                        deployAgeHours: deployAgeMs / (60 * 60 * 1000),
                    },
                },
                "warning",
            )
        }
        return health
    }

    // tickStale alarm — cron has not ticked in >36h. Fires whether dormant
    // or active; a dormant cron that stops ticking is just as broken as an
    // active one (the failure mode this lane is structurally guarding
    // against). Independent of `stale` (lastBackupAt-stale).
    if (health.tickStale) {
        captureMessage(
            `storage backup cron has not ticked in ${health.tickStalenessHours.toFixed(1)}h — dormant=${health.dormant}`,
            {
                source: "cron",
                location: "admin-consistency",
                extra: {
                    subsystem: "storage-backup-health",
                    lastTickAt: health.lastTickAt,
                    tickStalenessHours: health.tickStalenessHours,
                    dormant: health.dormant,
                },
            },
            "warning",
        )
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
        // No .orderBy() — Firestore strict-excludes docs missing the
        // ordered field, and `lastSyncedAt` is stamped ONLY by
        // syncLibraryIndex (the legacy Drive-sync path). The modern
        // `upload-{uuid}` rows minted by processChartUpload — the
        // post-Drive-sync majority — never get `lastSyncedAt`, so an
        // orderBy on it would silently exclude them and a blast hitting
        // them wouldn't trip this alarm. See
        // .paul/research/ingest-mutator-matrix/FINDINGS.md §FINDING-2
        // + FINDINGS-AUDIT.md §FINDING-2 (auditor REVISED — locus is
        // here, not the helper). Default doc-id ordering gives an
        // effectively-random sample of the active set, which is what
        // PGR-04 wants.
        const snap = await db
            .collection("library_index")
            .where("status", "==", "active")
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
