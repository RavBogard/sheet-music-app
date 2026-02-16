/**
 * POST /api/admin/migrate-storage
 * 
 * Migrates files from Google Drive to Firebase Storage in batches.
 * Uses Firestore's storageCopiedAt field to track progress —
 * only processes files that haven't been migrated yet.
 * Call repeatedly until remaining === 0.
 */

import { NextRequest, NextResponse } from "next/server"
import { initAdmin, getFirestore, verifyIdToken } from "@/lib/firebase-admin"
import { DriveClient } from "@/lib/google-drive"
import { copyDriveFileToStorage } from "@/lib/firebase-storage"

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

        // Count totals for progress display
        const allDocs = await db.collection('library_index').get()
        const allFiles = allDocs.docs.map(d => d.data())
        const migratable = allFiles.filter(f =>
            f.mimeType === 'application/pdf' ||
            f.mimeType?.includes('audio') ||
            f.mimeType?.includes('xml') ||
            f.mimeType?.startsWith('application/vnd.google-apps.')
        )
        const alreadyDone = migratable.filter(f => f.storageCopiedAt).length

        // Only fetch files that HAVEN'T been migrated (no storageCopiedAt)
        const needsMigration = migratable.filter(f => !f.storageCopiedAt)
        const batch = needsMigration.slice(0, BATCH_SIZE)

        const results = {
            processed: 0,
            succeeded: 0,
            failed: 0,
            alreadyInStorage: alreadyDone,
            remaining: needsMigration.length - batch.length,
            total: migratable.length,
            errors: [] as string[],
        }

        for (const file of batch) {
            results.processed++
            try {
                console.log(`[Migration] Copying ${file.name} (${file.mimeType})...`)
                const storageUrl = await copyDriveFileToStorage(drive, file.id, file.mimeType)
                if (storageUrl) {
                    await db.collection('library_index').doc(file.id).update({
                        storageUrl,
                        storageCopiedAt: new Date().toISOString(),
                    })
                    results.succeeded++
                    console.log(`[Migration] ✓ ${file.name}`)
                } else {
                    // Mark as attempted so we don't retry endlessly
                    await db.collection('library_index').doc(file.id).update({
                        storageCopiedAt: `failed:${new Date().toISOString()}`,
                    })
                    results.failed++
                    results.errors.push(file.name)
                    console.log(`[Migration] ✗ ${file.name}: null result`)
                }
            } catch (err) {
                // Mark as attempted
                await db.collection('library_index').doc(file.id).update({
                    storageCopiedAt: `failed:${new Date().toISOString()}`,
                }).catch(() => {})
                results.failed++
                const msg = err instanceof Error ? err.message : 'Unknown'
                results.errors.push(`${file.name}: ${msg}`)
                console.error(`[Migration] ✗ ${file.name}:`, msg)
            }
        }

        // Recalculate remaining after this batch
        results.remaining = needsMigration.length - batch.length

        return NextResponse.json({
            success: true,
            message: results.remaining > 0
                ? `Migrated ${results.succeeded}. ${results.remaining} remaining.`
                : results.succeeded > 0
                    ? `Done! All files processed.`
                    : `All ${results.alreadyInStorage} files already migrated.`,
            ...results,
        })

    } catch (error: unknown) {
        console.error("Storage Migration Error:", error)
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Internal server error" },
            { status: 500 }
        )
    }
}
