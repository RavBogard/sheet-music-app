/**
 * POST /api/admin/migrate-storage
 * 
 * Migrates files from Google Drive to Firebase Storage in batches.
 * Call repeatedly until remaining === 0.
 */

import { NextRequest, NextResponse } from "next/server"
import { initAdmin, getFirestore, verifyIdToken } from "@/lib/firebase-admin"
import { DriveClient } from "@/lib/google-drive"
import { fileExistsInStorage, copyDriveFileToStorage } from "@/lib/firebase-storage"

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

        // Check actual Storage existence for a batch
        const needsMigration: typeof migratable = []
        let alreadyInStorage = 0

        for (const file of migratable) {
            const exists = await fileExistsInStorage(file.id, file.mimeType)
            if (exists) {
                alreadyInStorage++
            } else {
                needsMigration.push(file)
            }
        }

        const batch = needsMigration.slice(0, BATCH_SIZE)

        const results = {
            processed: 0,
            succeeded: 0,
            failed: 0,
            alreadyInStorage,
            remaining: needsMigration.length - batch.length,
            total: migratable.length,
            errors: [] as string[],
        }

        for (const file of batch) {
            results.processed++
            try {
                const storageUrl = await copyDriveFileToStorage(drive, file.id, file.mimeType)
                if (storageUrl) {
                    await db.collection('library_index').doc(file.id).update({
                        storageUrl,
                        storageCopiedAt: new Date().toISOString(),
                    })
                    results.succeeded++
                    console.log(`[Migration] ✓ ${file.name}`)
                } else {
                    results.failed++
                    results.errors.push(file.name)
                    console.log(`[Migration] ✗ ${file.name}: null result`)
                }
            } catch (err) {
                results.failed++
                const msg = err instanceof Error ? err.message : 'Unknown'
                results.errors.push(`${file.name}: ${msg}`)
                console.error(`[Migration] ✗ ${file.name}:`, msg)
            }
        }

        return NextResponse.json({
            success: true,
            message: results.remaining > 0
                ? `Migrated ${results.succeeded}. ${results.remaining} remaining.`
                : results.succeeded > 0
                    ? `Done! ${results.alreadyInStorage + results.succeeded} files in Firebase Storage.`
                    : `All ${results.alreadyInStorage} files already in Firebase Storage.`,
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
