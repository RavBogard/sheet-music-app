
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { DriveClient } from "@/lib/google-drive"
import { fileExistsInStorage, copyDriveFileToStorage } from "@/lib/firebase-storage"

export interface SyncStats {
    totalScanned: number
    added: number
    updated: number
    deleted: number
    errors: number
    storageCopied: number
    storageSkipped: number
}

export async function syncLibraryIndex(): Promise<SyncStats> {
    const stats: SyncStats = {
        totalScanned: 0,
        added: 0,
        updated: 0,
        deleted: 0,
        errors: 0,
        storageCopied: 0,
        storageSkipped: 0,
    }

    try {
        console.log("[Sync] Starting Library Sync...")

        // 1. Initialize Services
        initAdmin()
        const db = getFirestore()
        const drive = new DriveClient()

        // 2. Fetch ALL files from Drive
        const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID
        const allFiles = await drive.listAllFiles(rootFolderId)

        console.log(`[Sync] Found ${allFiles.length} files in Drive.`)
        stats.totalScanned = allFiles.length

        // 3. Batch Write to Firestore (index metadata)
        const BATCH_SIZE = 450
        const chunks = []
        for (let i = 0; i < allFiles.length; i += BATCH_SIZE) {
            chunks.push(allFiles.slice(i, i + BATCH_SIZE))
        }

        for (const chunk of chunks) {
            const batch = db.batch()

            for (const file of chunk) {
                const docRef = db.collection('library_index').doc(file.id)
                const now = new Date().toISOString()

                batch.set(docRef, {
                    id: file.id,
                    name: file.name,
                    mimeType: file.mimeType,
                    webViewLink: file.webViewLink || null,
                    parents: file.parents || [],
                    lastSyncedAt: now,
                    source: 'google_drive'
                }, { merge: true })
            }

            await batch.commit()
            stats.updated += chunk.length
        }

        // 4. Copy files to Firebase Storage (for CDN serving)
        // Only copy PDFs and audio files that aren't already in Storage
        const filesToCopy = allFiles.filter(f =>
            f.mimeType === 'application/pdf' ||
            f.mimeType?.includes('audio') ||
            f.mimeType?.includes('xml') ||
            f.mimeType?.startsWith('application/vnd.google-apps.')
        )

        console.log(`[Sync] Checking ${filesToCopy.length} files for Storage migration...`)

        // Process in small batches to avoid timeout
        const STORAGE_BATCH = 10
        for (let i = 0; i < filesToCopy.length; i += STORAGE_BATCH) {
            const batch = filesToCopy.slice(i, i + STORAGE_BATCH)

            const results = await Promise.allSettled(
                batch.map(async (file) => {
                    // Skip if already in Storage
                    const exists = await fileExistsInStorage(file.id, file.mimeType)
                    if (exists) {
                        stats.storageSkipped++
                        return
                    }

                    // Copy from Drive to Storage
                    const storageUrl = await copyDriveFileToStorage(drive, file.id, file.mimeType)
                    if (storageUrl) {
                        // Update Firestore with Storage URL
                        await db.collection('library_index').doc(file.id).update({
                            storageUrl,
                            storageCopiedAt: new Date().toISOString(),
                        })
                        stats.storageCopied++
                    } else {
                        stats.errors++
                    }
                })
            )

            // Log progress
            const completed = Math.min(i + STORAGE_BATCH, filesToCopy.length)
            console.log(`[Sync] Storage progress: ${completed}/${filesToCopy.length} (copied: ${stats.storageCopied}, skipped: ${stats.storageSkipped})`)
        }

        console.log("[Sync] Sync Complete.", stats)
        return stats

    } catch (error) {
        console.error("[Sync] Fatal Error:", error)
        stats.errors++
        throw error
    }
}
