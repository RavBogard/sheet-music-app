import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "crypto"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"
import { captureException } from "@/lib/error-reporting"
import { env } from "@/env.mjs"

function safeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) return false
    return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * GET /api/cron/backup
 *
 * Automated daily Firestore backup via Vercel Cron.
 * Exports all Firestore collections to a GCS bucket.
 *
 * Setup:
 * 1. Create a GCS bucket (e.g., `centralreform-backups`)
 * 2. Set BACKUP_BUCKET env var in Vercel
 * 3. Grant the Firebase service account `roles/datastore.importExportAdmin`
 *    and `roles/storage.admin` on the bucket
 * 4. Add cron schedule to vercel.json:
 *    { "path": "/api/cron/backup", "schedule": "0 3 * * *" }
 *
 * Also callable manually from the admin dashboard via POST.
 */
export async function GET(req: NextRequest) {
    try {
        const authHeader = req.headers.get('authorization')
        const cronSecret = env.CRON_SECRET

        if (!cronSecret || !authHeader || !safeCompare(authHeader, `Bearer ${cronSecret}`)) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        return await runBackup()
    } catch (err) {
        logger.error("[Backup] Cron backup failed:", err)
        // PGR-01: surface backup failures to Sentry (live in prod) so a
        // silently-failing backup is observable, not just buried in logs.
        captureException(err, { source: "cron", location: "backup" })
        // M9: Don't leak internal error details to client
        return NextResponse.json(
            { error: "Backup failed" },
            { status: 500 }
        )
    }
}

/**
 * POST /api/cron/backup
 *
 * Manual backup triggered from admin dashboard.
 * Requires admin auth.
 */
export async function POST(req: NextRequest) {
    try {
        // Verify admin auth via token
        const authHeader = req.headers.get('authorization')
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const token = authHeader.slice(7)
        if (!initAdmin()) {
            return NextResponse.json(
                { error: "Server not ready", code: "FIREBASE_NOT_INITIALIZED" },
                { status: 500 },
            )
        }
        const { getAuth } = await import("firebase-admin/auth")
        const decoded = await getAuth().verifyIdToken(token)

        if (!decoded.role || decoded.role !== 'admin') {
            return NextResponse.json({ error: "Admin access required" }, { status: 403 })
        }

        return await runBackup()
    } catch (err) {
        logger.error("[Backup] Manual backup failed:", err)
        captureException(err, { source: "api", location: "backup-manual" })
        return NextResponse.json(
            { error: "Backup failed" },
            { status: 500 }
        )
    }
}

async function runBackup(): Promise<NextResponse> {
    if (!initAdmin()) {
        return NextResponse.json(
            { error: "Server not ready", code: "FIREBASE_NOT_INITIALIZED" },
            { status: 500 },
        )
    }

    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
    const bucketName = process.env.BACKUP_BUCKET

    if (!projectId) {
        return NextResponse.json({ error: "FIREBASE_PROJECT_ID not set" }, { status: 500 })
    }

    if (!bucketName) {
        // If no bucket configured, do a logical backup to Firestore meta doc
        return await logicalBackup(projectId)
    }

    // Use Firestore Admin export if available
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const outputUri = `gs://${bucketName}/backups/${timestamp}`

        // Firestore export via REST API (Admin SDK doesn't expose exportDocuments directly)
        const { GoogleAuth } = await import('google-auth-library')
        const auth = new GoogleAuth({
            credentials: {
                client_email: process.env.FIREBASE_CLIENT_EMAIL,
                private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
            },
            scopes: ['https://www.googleapis.com/auth/datastore'],
        })

        const client = await auth.getClient()
        const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default):exportDocuments`

        const res = await client.request({
            url,
            method: 'POST',
            data: {
                outputUriPrefix: outputUri,
                collectionIds: [], // Empty = all collections
            },
        })

        // exportDocuments returns a long-running Operation; its name lets an
        // operator (or PGR-03 later) check export completion via the API.
        const exportOpName = (res?.data as { name?: string } | undefined)?.name

        // Log the backup in Firestore for admin dashboard
        await recordBackup(timestamp, 'gcs', outputUri)
        // PGR-01: dated audit trail so staleness is observable.
        await recordBackupAudit({
            timestamp,
            status: 'export_initiated',
            type: 'gcs',
            bucketPath: outputUri,
            exportOpName,
            collections: ['(all)'],
        })

        logger.info(`[Backup] Export started: ${outputUri}`)
        return NextResponse.json({
            success: true,
            timestamp,
            outputUri,
            exportOpName,
            message: "Firestore export initiated",
        })
    } catch (err) {
        logger.warn("[Backup] GCS export failed, falling back to logical backup:", err)
        // PGR-01: the GCS export failing is a real (recovered) failure — the
        // bytes were NOT exported. Surface to Sentry even though we fall back.
        captureException(err, { source: "cron", location: "backup-gcs-export" })
        return await logicalBackup(projectId)
    }
}

/**
 * Fallback: logical backup that records collection counts and a status doc.
 * Useful when GCS bucket isn't configured yet.
 */
async function logicalBackup(projectId: string): Promise<NextResponse> {
    const db = getFirestore()
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')

    // Count documents in key collections
    const collections = ['setlists', 'users', 'tasks', 'songUsage']
    const counts: Record<string, number> = {}

    for (const name of collections) {
        try {
            const snap = await db.collection(name).count().get()
            counts[name] = snap.data().count
        } catch {
            counts[name] = -1
        }
    }

    await recordBackup(timestamp, 'logical', undefined, counts)
    // PGR-01: dated audit trail (dormant-mode runs leave a record too, so a
    // gap in dates means the cron itself stopped — not just the export).
    await recordBackupAudit({
        timestamp,
        status: 'logical',
        type: 'logical',
        collections,
        counts,
    })

    return NextResponse.json({
        success: true,
        timestamp,
        type: 'logical',
        counts,
        message: "Logical backup recorded. Set BACKUP_BUCKET env var for full GCS exports.",
    })
}

/**
 * PGR-01: per-run dated audit doc at `backups/{YYYY-MM-DD}`. Unlike the
 * single `config/backup` pointer (which only ever shows the latest run),
 * this leaves a dated trail so staleness is observable — a missing recent
 * date means backups stopped. Admin-read + server-only-write (firestore.rules).
 * Feeds PGR-03 (alert surfacing) later. Same-day reruns overwrite (latest wins).
 */
async function recordBackupAudit(opts: {
    timestamp: string
    status: 'export_initiated' | 'logical' | 'error'
    type: 'gcs' | 'logical'
    bucketPath?: string
    exportOpName?: string
    collections?: string[]
    counts?: Record<string, number>
    error?: string
}): Promise<void> {
    try {
        const db = getFirestore()
        // timestamp is an ISO string with `:`/`.` replaced by `-`; the date
        // portion (first 10 chars) has neither, so it stays `YYYY-MM-DD`.
        const dateKey = opts.timestamp.slice(0, 10)
        await db.collection('backups').doc(dateKey).set({
            ts: new Date(),
            timestamp: opts.timestamp,
            status: opts.status,
            type: opts.type,
            ...(opts.bucketPath && { bucketPath: opts.bucketPath }),
            ...(opts.exportOpName && { exportOpName: opts.exportOpName }),
            ...(opts.collections && { collections: opts.collections }),
            ...(opts.counts && { counts: opts.counts }),
            ...(opts.error && { error: opts.error }),
        })
    } catch (err) {
        logger.warn("[Backup] Failed to record backup audit doc:", err)
    }
}

async function recordBackup(
    timestamp: string,
    type: 'gcs' | 'logical',
    outputUri?: string,
    counts?: Record<string, number>
): Promise<void> {
    try {
        const db = getFirestore()
        await db.collection('config').doc('backup').set({
            lastBackupAt: new Date(),
            lastBackupTimestamp: timestamp,
            lastBackupType: type,
            ...(outputUri && { lastBackupUri: outputUri }),
            ...(counts && { lastBackupCounts: counts }),
        }, { merge: true })
    } catch (err) {
        logger.warn("[Backup] Failed to record backup metadata:", err)
    }
}
