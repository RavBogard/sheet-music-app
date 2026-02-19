/**
 * POST /api/admin/migrate-storage
 * 
 * Migrates files from Google Drive to Firebase Storage in batches.
 * 
 * Query params:
 *   ?retryFailed=true  — also retry previously failed files
 *   ?verify=true       — verify each upload by downloading and checking size
 *   ?batchSize=20      — override batch size (default 20, max 50)
 * 
 * Call repeatedly until remaining === 0.
 */

import { NextRequest, NextResponse } from "next/server"
import { getFirestore } from "@/lib/firebase-admin"
import { DriveClient } from "@/lib/google-drive"
import { uploadToStorage, downloadFromStorage } from "@/lib/firebase-storage"
import { withAuth } from "@/lib/api-auth"
import { logger } from "@/lib/logger"

export const maxDuration = 300

const DEFAULT_BATCH_SIZE = 20
const MAX_BATCH_SIZE = 50

// Google types that can be exported as PDF — excludes folders, forms, etc.
const EXPORTABLE_GOOGLE_TYPES = [
    'application/vnd.google-apps.document',
    'application/vnd.google-apps.spreadsheet',
    'application/vnd.google-apps.presentation',
]

export async function POST(req: NextRequest) {
    try {
        const auth = await withAuth(req, 'admin')
        if (auth instanceof NextResponse) return auth

        const retryFailed = req.nextUrl.searchParams.get('retryFailed') === 'true'
        const verify = req.nextUrl.searchParams.get('verify') !== 'false' // default true
        const batchSize = Math.min(
            MAX_BATCH_SIZE,
            Math.max(1, parseInt(req.nextUrl.searchParams.get('batchSize') || '') || DEFAULT_BATCH_SIZE)
        )

        const db = getFirestore()
        const drive = new DriveClient()

        // Get all library files
        const snapshot = await db.collection('library_index').get()
        const allFiles = snapshot.docs.map(doc => doc.data())

        // Filter to migratable types (PDFs, audio, XML, exportable Google Docs)
        // IMPORTANT: Exclude folders and other non-exportable Google types
        const migratable = allFiles.filter(f =>
            f.mimeType === 'application/pdf' ||
            f.mimeType?.includes('audio') ||
            f.mimeType?.includes('xml') ||
            EXPORTABLE_GOOGLE_TYPES.includes(f.mimeType)
        )

        // Categorize by status
        const done = migratable.filter(f => f.storageCopiedAt && !f.storageFailed)
        const failed = migratable.filter(f => f.storageFailed)
        const neverTried = migratable.filter(f => !f.storageCopiedAt && !f.storageFailed)

        // Build the work queue
        let pending: typeof migratable
        if (retryFailed) {
            // Reset failed flags first, then include them
            pending = [...neverTried, ...failed]
        } else {
            pending = neverTried
        }

        const batch = pending.slice(0, batchSize)

        const results = {
            batchSize,
            processed: 0,
            succeeded: 0,
            failed: 0,
            verified: 0,
            skipped: 0,
            alreadyDone: done.length,
            previouslyFailed: failed.length,
            remaining: Math.max(0, pending.length - batch.length),
            total: migratable.length,
            retryFailed,
            details: [] as { name: string; id: string; status: string; error?: string; size?: number }[],
        }

        for (const file of batch) {
            results.processed++
            const detail: typeof results.details[0] = {
                name: file.name,
                id: file.id,
                status: 'pending',
            }

            try {
                // 1. Download from Drive
                let fileData: ArrayBuffer
                let contentType = file.mimeType || 'application/pdf'

                if (EXPORTABLE_GOOGLE_TYPES.includes(file.mimeType)) {
                    fileData = await drive.exportDoc(file.id, 'application/pdf') as unknown as ArrayBuffer
                    contentType = 'application/pdf'
                } else {
                    fileData = await drive.getFile(file.id) as unknown as ArrayBuffer
                }

                const buffer = Buffer.from(fileData)

                // Sanity check: file should have content
                if (buffer.byteLength < 50) {
                    throw new Error(`File too small (${buffer.byteLength} bytes) — likely empty or corrupted`)
                }

                detail.size = buffer.byteLength

                // 2. Upload to Firebase Storage
                const storageUrl = await uploadToStorage(file.id, buffer, contentType)

                if (!storageUrl) {
                    throw new Error('uploadToStorage returned null')
                }

                // 3. Verify the upload (download back and check size matches)
                if (verify) {
                    const downloaded = await downloadFromStorage(file.id, contentType)
                    if (!downloaded) {
                        throw new Error('Verification failed: file not found in Storage after upload')
                    }
                    if (Math.abs(downloaded.buffer.byteLength - buffer.byteLength) > 10) {
                        throw new Error(
                            `Verification failed: size mismatch (uploaded ${buffer.byteLength}, got back ${downloaded.buffer.byteLength})`
                        )
                    }
                    results.verified++
                }

                // 4. Mark success in Firestore
                await db.collection('library_index').doc(file.id).update({
                    storageUrl,
                    storageCopiedAt: new Date().toISOString(),
                    storageFailed: null,
                    storageFailedAt: null,
                    storageError: null,
                })

                detail.status = verify ? 'verified' : 'uploaded'
                results.succeeded++
                logger.info(`[Migration] ✓ ${file.name} (${(buffer.byteLength / 1024).toFixed(0)} KB)`)

            } catch (err) {
                const msg = err instanceof Error ? err.message : 'Unknown error'

                // Mark failure in Firestore
                await db.collection('library_index').doc(file.id).update({
                    storageFailed: true,
                    storageFailedAt: new Date().toISOString(),
                    storageError: msg,
                }).catch(() => { /* ignore Firestore update errors */ })

                detail.status = 'failed'
                detail.error = msg
                results.failed++
                logger.error(`[Migration] ✗ ${file.name}: ${msg}`)
            }

            results.details.push(detail)
        }

        // Recalculate remaining
        results.remaining = Math.max(0, pending.length - batch.length)

        const phase = results.remaining > 0
            ? 'in_progress'
            : batch.length === 0
                ? 'complete'
                : 'batch_done'

        return NextResponse.json({
            success: true,
            phase,
            message: phase === 'complete'
                ? `Migration complete! ${results.alreadyDone + results.succeeded} files in Storage.`
                    + (results.previouslyFailed > 0 && !retryFailed
                        ? ` ${results.previouslyFailed} previously failed (use ?retryFailed=true to retry).`
                        : '')
                : `Batch done: ${results.succeeded} succeeded, ${results.failed} failed. ${results.remaining} remaining.`,
            ...results,
        })

    } catch (error: unknown) {
        logger.error("[Migration] Fatal error:", error)
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Internal server error" },
            { status: 500 }
        )
    }
}

/**
 * GET /api/admin/migrate-storage
 * 
 * Returns current migration status without modifying anything.
 */
export async function GET(req: NextRequest) {
    try {
        const auth = await withAuth(req, 'admin')
        if (auth instanceof NextResponse) return auth

        const db = getFirestore()
        const snapshot = await db.collection('library_index').get()
        const allFiles = snapshot.docs.map(doc => doc.data())

        const migratable = allFiles.filter(f =>
            f.mimeType === 'application/pdf' ||
            f.mimeType?.includes('audio') ||
            f.mimeType?.includes('xml') ||
            EXPORTABLE_GOOGLE_TYPES.includes(f.mimeType)
        )

        const inStorage = migratable.filter(f => f.storageCopiedAt && !f.storageFailed)
        const failed = migratable.filter(f => f.storageFailed)
        const pending = migratable.filter(f => !f.storageCopiedAt && !f.storageFailed)

        return NextResponse.json({
            total: migratable.length,
            inStorage: inStorage.length,
            failed: failed.length,
            pending: pending.length,
            percentComplete: migratable.length > 0
                ? Math.round((inStorage.length / migratable.length) * 100)
                : 100,
            failedFiles: failed.map(f => ({
                name: f.name,
                id: f.id,
                error: f.storageError,
                failedAt: f.storageFailedAt,
            })),
        })
    } catch (error: unknown) {
        logger.error("[Migration] Status check error:", error)
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Internal server error" },
            { status: 500 }
        )
    }
}
