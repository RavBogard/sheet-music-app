/**
 * POST /api/admin/migrate-storage
 * 
 * Migrates files from Google Drive to Firebase Storage in batches.
 * Call repeatedly until remaining === 0.
 * 
 * Each call processes up to 20 files that aren't already in Storage.
 * Safe to call multiple times — skips files already migrated.
 */

import { NextRequest, NextResponse } from "next/server"
import { initAdmin, getFirestore, verifyIdToken } from "@/lib/firebase-admin"
import { DriveClient } from "@/lib/google-drive"
import { fileExistsInStorage, copyDriveFileToStorage } from "@/lib/firebase-storage"

export const maxDuration = 300 // 5 minutes

const BATCH_SIZE = 15 // files per request

export async function POST(req: NextRequest) {
    try {
        // Auth
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

        // Get all library files from Firestore
        const snapshot = await db.collection('library_index').get()
        const allFiles = snapshot.docs.map(doc => doc.data())

        // Filter to migratable files (PDFs, audio, Google Docs, XML)
        const migratable = allFiles.filter(f =>
            f.mimeType === 'application/pdf' ||
            f.mimeType?.includes('audio') ||
            f.mimeType?.includes('xml') ||
            f.mimeType?.startsWith('application/vnd.google-apps.')
        )

        // Check which ones still need migration
        const needsMigration: typeof migratable = []
        const alreadyDone: string[] = []

        for (const file of migratable) {
            // Quick check: if Firestore doc already has storageUrl, skip
            if (file.storageUrl) {
                alreadyDone.push(file.id)
                continue
            }
            needsMigration.push(file)
        }

        // Double-check a batch against actual Storage (in case storageUrl wasn't recorded)
        const batch = needsMigration.slice(0, BATCH_SIZE)
        const toProcess: typeof migratable = []

        for (const file of batch) {
            const exists = await fileExistsInStorage(file.id, file.mimeType)
            if (exists) {
                // Mark in Firestore so we skip next time
                await db.collection('library_index').doc(file.id).update({
                    storageUrl: `already-migrated`,
                    storageCopiedAt: new Date().toISOString(),
                })
                alreadyDone.push(file.id)
            } else {
                toProcess.push(file)
            }
        }

        // Process the batch
        const results = {
            processed: 0,
            succeeded: 0,
            failed: 0,
            skipped: alreadyDone.length,
            remaining: needsMigration.length - toProcess.length,
            total: migratable.length,
            errors: [] as string[],
        }

        for (const file of toProcess) {
            results.processed++
            try {
                const storageUrl = await copyDriveFileToStorage(drive, file.id, file.mimeType)
                if (storageUrl) {
                    await db.collection('library_index').doc(file.id).update({
                        storageUrl,
                        storageCopiedAt: new Date().toISOString(),
                    })
                    results.succeeded++
                } else {
                    results.failed++
                    results.errors.push(`${file.name}: copy returned null`)
                }
            } catch (err) {
                results.failed++
                results.errors.push(`${file.name}: ${err instanceof Error ? err.message : 'Unknown error'}`)
            }
        }

        results.remaining = needsMigration.length - toProcess.length

        return NextResponse.json({
            success: true,
            message: results.remaining > 0
                ? `Migrated ${results.succeeded} files. ${results.remaining} remaining — run again to continue.`
                : `Migration complete! All ${results.total} files are in Firebase Storage.`,
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
