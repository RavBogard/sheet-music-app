
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { DriveClient } from "@/lib/google-drive"

export interface SyncStats {
    totalScanned: number
    added: number
    updated: number
    deleted: number
    errors: number
}

export async function syncLibraryIndex(): Promise<SyncStats> {
    const stats: SyncStats = {
        totalScanned: 0,
        added: 0,
        updated: 0,
        deleted: 0, // Detection of deleted files is Phase 1.5 (requires comparing lists)
        errors: 0
    }

    try {
        console.log("[Sync] Starting Library Sync...")

        // 1. Initialize Services
        initAdmin()
        const db = getFirestore()
        const drive = new DriveClient()

        // 2. Fetch ALL files from Drive
        // Use configured root folder or undefined for "Everything"
        const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID
        const allFiles = await drive.listAllFiles(rootFolderId)

        console.log(`[Sync] Found ${allFiles.length} files in Drive.`)
        stats.totalScanned = allFiles.length

        // 3. Batch Write to Firestore
        // Firestore batches are limited to 500 ops. We must chunk it.
        const BATCH_SIZE = 450
        const chunks = []
        for (let i = 0; i < allFiles.length; i += BATCH_SIZE) {
            chunks.push(allFiles.slice(i, i + BATCH_SIZE))
        }

        for (const chunk of chunks) {
            const batch = db.batch()

            for (const file of chunk) {
                // Determine intended path/collection
                // For now, we index EVERYTHING into 'library_index'
                // We assume ID is the key.
                const docRef = db.collection('library_index').doc(file.id)

                const now = new Date().toISOString()

                batch.set(docRef, {
                    id: file.id,
                    name: file.name,
                    mimeType: file.mimeType,
                    webViewLink: file.webViewLink || null,
                    parents: file.parents || [],
                    // Sync Metadata
                    lastSyncedAt: now,
                    source: 'google_drive'
                }, { merge: true })
            }

            await batch.commit()
            stats.updated += chunk.length // Technically could be adds or updates
        }

        console.log("[Sync] Sync Complete.", stats)
        return stats

    } catch (error) {
        console.error("[Sync] Fatal Error:", error)
        stats.errors++
        throw error
    }
}
