
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
    copiedToStorage: number
    copyErrors: number
    retriedCopies: number
    deletedFromStorage: number
    syncRunId?: string
}

export interface SyncRunRecord {
    startedAt: string
    completedAt: string | null
    status: 'running' | 'completed' | 'failed'
    stats: SyncStats | null
    errors: Array<{ fileId: string; fileName: string; phase: string; error: string; retryable: boolean }>
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
        copiedToStorage: 0,
        copyErrors: 0,
        retriedCopies: 0,
        deletedFromStorage: 0,
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

        // 3. Get existing docs with modifiedTime for change detection (single query)
        const existingSnapshot = await db.collection('library_index').select('modifiedTime').get()
        const existingDocs = new Map<string, string | null>()
        for (const doc of existingSnapshot.docs) {
            existingDocs.set(doc.id, doc.data()?.modifiedTime || null)
        }
        const driveIds = new Set(allFiles.map(f => f.id))

        // 4. Pre-detect which files need chord cache purging (modified since last sync)
        const filesToPurge: string[] = []
        for (const file of allFiles) {
            if (existingDocs.has(file.id) && file.modifiedTime) {
                const existingModified = existingDocs.get(file.id)
                if (existingModified && existingModified !== file.modifiedTime) {
                    filesToPurge.push(file.id)
                }
            }
        }

        // Purge stale chord caches before batch writes (avoids reads inside batch loop)
        for (const fileId of filesToPurge) {
            const docRef = db.collection('library_index').doc(fileId)
            const chordDocs = await docRef.collection('chordData').get()
            if (!chordDocs.empty) {
                const purgeBatch = db.batch()
                chordDocs.forEach(d => purgeBatch.delete(d.ref))
                await purgeBatch.commit()
                const fileName = allFiles.find(f => f.id === fileId)?.name || fileId
                logger.info(`[Sync] Purged chord cache for ${fileName} (file modified)`)
            }
        }

        // 5. Batch Write to Firestore (index metadata) — no reads inside loop
        const BATCH_SIZE = 450
        const chunks = []
        for (let i = 0; i < allFiles.length; i += BATCH_SIZE) {
            chunks.push(allFiles.slice(i, i + BATCH_SIZE))
        }

        for (const chunk of chunks) {
            const batch = db.batch()
            const now = new Date().toISOString()

            for (const file of chunk) {
                const docRef = db.collection('library_index').doc(file.id)

                batch.set(docRef, {
                    id: file.id,
                    name: file.name,
                    nameLower: file.name.toLowerCase(),
                    mimeType: file.mimeType,
                    modifiedTime: file.modifiedTime || null,
                    webViewLink: file.webViewLink || null,
                    parents: file.parents || [],
                    lastSyncedAt: now,
                    source: 'google_drive'
                }, { merge: true })

                if (existingDocs.has(file.id)) {
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
