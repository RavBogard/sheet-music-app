/**
 * POST /api/admin/migrate-storage
 * 
 * Migrates files from Google Drive to Firebase Storage in batches.
 * Uses Firestore fields to track progress — no expensive Storage checks on every call.
 * Call repeatedly until remaining === 0.
 */

import { NextRequest, NextResponse } from "next/server"
import { initAdmin, getFirestore, verifyIdToken } from "@/lib/firebase-admin"
import { DriveClient } from "@/lib/google-drive"
import { copyDriveFileToStorage } from "@/lib/firebase-storage"
import { logger } from "@/lib/logger"

export const maxDuration = 300

const BATCH_SIZE = 10

export async function POST(req: NextRequest) {
    try {
        const authHeader = req.headers.get("Authorization")
        if (!authHeader?.startsWith("Bearer ")) {
            return NextResponse.json({ error: "Missing token" }, { status: 401 })
        }
        const decoded = await verifyIdToken(authHeader.split(" ")[1])
        if (!decoded) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        initAdmin()
        const db = getFirestore()
        const drive = new DriveClient()

        // Get all library files
        const snapshot = await db.collection('library_index').get()
        const allFiles = snapshot.docs.map(doc => doc.data())

        // Filter to migratable types
        const migratable = allFiles.filter(f =>
            f.mimeType === 'application/pdf' ||
            f.mimeType?.includes('audio') ||
            f.mimeType?.includes('xml') ||
            f.mimeType?.startsWith('application/vnd.google-apps.')
        )

        // Use Firestore fields to determine status — NO Storage API calls
        const done = migratable.filter(f => f.storageCopiedAt && !f.storageFailed)
        const failed = migratable.filter(f => f.storageFailed)
        const pending = migratable.filter(f => !f.storageCopiedAt && !f.storageFailed)

        // Take a batch of pending files
        const batch = pending.slice(0, BATCH_SIZE)

        const results = {
            processed: batch.length,
            succeeded: 0,
            failed: 0,
            previouslyDone: done.length,
            previouslyFailed: failed.length,
            remaining: pending.length - batch.length,
            total: migratable.length,
            errors: [] as string[],
        }

        for (const file of batch) {
            try {
                const storageUrl = await copyDriveFileToStorage(drive, file.id, file.mimeType)
                if (storageUrl) {
                    await db.collection('library_index').doc(file.id).update({
                        storageUrl,
                        storageCopiedAt: new Date().toISOString(),
                    })
                    results.succeeded++
                    logger.info(`[Migration] ✓ ${file.name}`)
                } else {
                    // Mark as failed so we don't retry
                    await db.collection('library_index').doc(file.id).update({
                        storageFailed: true,
                        storageFailedAt: new Date().toISOString(),
                        storageError: 'Copy returned null',
                    })
                    results.failed++
                    results.errors.push(file.name)
                }
            } catch (err) {
                const msg = err instanceof Error ? err.message : 'Unknown'
                await db.collection('library_index').doc(file.id).update({
                    storageFailed: true,
                    storageFailedAt: new Date().toISOString(),
                    storageError: msg,
                })
                results.failed++
                results.errors.push(`${file.name}: ${msg}`)
                logger.error(`[Migration] ✗ ${file.name}:`, msg)
            }
        }

        results.remaining = pending.length - batch.length

        return NextResponse.json({
            success: true,
            message: results.remaining > 0
                ? `Migrated ${results.succeeded}. ${results.remaining} remaining.`
                : batch.length === 0
                    ? `Complete! ${results.previouslyDone} in Storage, ${results.previouslyFailed} could not be migrated.`
                    : `Batch done. ${results.succeeded} succeeded, ${results.failed} failed.`,
            ...results,
        })

    } catch (error: unknown) {
        logger.error("Storage Migration Error:", error)
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Internal server error" },
            { status: 500 }
        )
    }
}
