
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { DriveClient } from "@/lib/google-drive"
import { logger } from "@/lib/logger"

export interface SyncStats {
    totalScanned: number
    added: number
    updated: number
    deleted: number
    errors: number
    addedFiles?: string[]
    updatedFiles?: string[]
    deletedFiles?: string[]
}

export async function syncLibraryIndex(): Promise<SyncStats> {
    const stats: SyncStats = {
        totalScanned: 0,
        added: 0,
        updated: 0,
        deleted: 0,
        errors: 0,
        addedFiles: [],
        updatedFiles: [],
        deletedFiles: [],
    }

    try {
        logger.info("[Sync] Starting Library Sync...")

        // 1. Initialize Services
        initAdmin()
        const db = getFirestore()
        const drive = new DriveClient()

        // 2. Fetch ALL files from Drive
        const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID
        const allFiles = await drive.listAllFiles(rootFolderId)

        logger.info(`[Sync] Found ${allFiles.length} files in Drive.`)
        stats.totalScanned = allFiles.length

        // 3. Get existing doc IDs for add/update detection
        const existingSnapshot = await db.collection('library_index').select().get()
        const existingIds = new Set(existingSnapshot.docs.map(d => d.id))
        const driveIds = new Set(allFiles.map(f => f.id))

        // 4. Batch Write to Firestore (index metadata)
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

                if (existingIds.has(file.id)) {
                    stats.updated++
                    stats.updatedFiles!.push(file.name)
                } else {
                    stats.added++
                    stats.addedFiles!.push(file.name)
                }
            }

            await batch.commit()
        }

        // 5. Detect deleted files (in DB but not in Drive)
        for (const doc of existingSnapshot.docs) {
            if (!driveIds.has(doc.id)) {
                stats.deleted++
                stats.deletedFiles!.push(doc.id)
            }
        }

        logger.info("[Sync] Sync Complete.", stats)
        return stats

    } catch (error) {
        logger.error("[Sync] Fatal Error:", error)
        stats.errors++
        throw error
    }
}
