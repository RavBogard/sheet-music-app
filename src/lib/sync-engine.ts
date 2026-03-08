
import crypto from 'crypto'
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { DriveClient } from "@/lib/google-drive"
import { uploadToStorage } from "@/lib/firebase-storage"
import { getStorage } from 'firebase-admin/storage'
import { logger } from "@/lib/logger"

const MAX_COPIES_PER_RUN = 20

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

    const syncErrors: SyncRunRecord['errors'] = []

    // Phase D: Create sync run document
    initAdmin()
    const db = getFirestore()
    const syncRunId = crypto.randomUUID()
    const syncRunRef = db.collection('sync_runs').doc(syncRunId)
    await syncRunRef.set({
        startedAt: new Date().toISOString(),
        status: 'running',
        completedAt: null,
        stats: null,
        errors: [],
    })
    stats.syncRunId = syncRunId

    try {
        logger.info("[Sync] Starting Library Sync...")

        // 1. Initialize Services
        const drive = new DriveClient()

        // 2. Fetch ALL files from Drive
        const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID
        const allFiles = await drive.listAllFiles(rootFolderId)

        logger.info(`[Sync] Found ${allFiles.length} files in Drive.`)
        stats.totalScanned = allFiles.length

        // 3. Get existing docs with modifiedTime, storageCopiedAt, storageFailed for change detection
        const existingSnapshot = await db.collection('library_index')
            .select('modifiedTime', 'storageCopiedAt', 'storageFailed').get()
        const existingDocs = new Map<string, {
            modifiedTime: string | null
            storageCopiedAt: string | null
            storageFailed: boolean | null
        }>()
        for (const doc of existingSnapshot.docs) {
            const data = doc.data()
            existingDocs.set(doc.id, {
                modifiedTime: data?.modifiedTime || null,
                storageCopiedAt: data?.storageCopiedAt || null,
                storageFailed: data?.storageFailed || null,
            })
        }
        const driveIds = new Set(allFiles.map(f => f.id))

        // Phase A: Identify files needing Storage copy
        const isFolder = (mimeType: string) => mimeType === 'application/vnd.google-apps.folder'

        // 1. New files (not in existingDocs, not folders)
        const newFilesCopy = allFiles.filter(f =>
            !existingDocs.has(f.id) && !isFolder(f.mimeType)
        )

        // 2. Failed retries (in existingDocs with storageFailed=true)
        const failedRetryCopy = allFiles.filter(f => {
            const existing = existingDocs.get(f.id)
            return existing?.storageFailed === true && !isFolder(f.mimeType)
        })

        // 3. Modified files (modifiedTime changed AND storageCopiedAt exists)
        const modifiedCopy = allFiles.filter(f => {
            const existing = existingDocs.get(f.id)
            return existing &&
                existing.storageCopiedAt &&
                f.modifiedTime &&
                existing.modifiedTime !== f.modifiedTime &&
                !isFolder(f.mimeType)
        })

        // Combine and limit to MAX_COPIES_PER_RUN
        // Track which are retries for stats
        const retryIds = new Set(failedRetryCopy.map(f => f.id))
        const allCopyCandidates = [
            ...failedRetryCopy,
            ...newFilesCopy.filter(f => !retryIds.has(f.id)),
            ...modifiedCopy.filter(f => !retryIds.has(f.id)),
        ]
        // Deduplicate by id
        const seen = new Set<string>()
        const copyList = allCopyCandidates.filter(f => {
            if (seen.has(f.id)) return false
            seen.add(f.id)
            return true
        }).slice(0, MAX_COPIES_PER_RUN)

        // 4. Pre-detect which files need chord cache purging (modified since last sync)
        const filesToPurge: string[] = []
        for (const file of allFiles) {
            const existing = existingDocs.get(file.id)
            if (existing && file.modifiedTime) {
                if (existing.modifiedTime && existing.modifiedTime !== file.modifiedTime) {
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
                 
                chordDocs.forEach((d: any) => purgeBatch.delete(d.ref))
                await purgeBatch.commit()
                const fileName = allFiles.find(f => f.id === fileId)?.name || fileId
                logger.info(`[Sync] Purged chord cache for ${fileName} (file modified)`)
            }
        }

        // 5. Batch Write to Firestore (index metadata) -- no reads inside loop
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

        // Phase B: Copy files to Storage (after metadata batch write)
        for (const file of copyList) {
            try {
                const fileData = await drive.getFile(file.id)
                const buffer = Buffer.from(fileData as ArrayBuffer)

                if (buffer.byteLength < 50) {
                    logger.info(`[Sync] Skipping small file (${buffer.byteLength}B): ${file.name}`)
                    continue
                }

                await uploadToStorage(file.id, buffer, file.mimeType || 'application/pdf')

                // Mark as copied in Firestore
                await db.collection('library_index').doc(file.id).update({
                    storageCopiedAt: new Date().toISOString(),
                    storageFailed: null,
                    storageError: null,
                })

                stats.copiedToStorage++
                if (retryIds.has(file.id)) {
                    stats.retriedCopies++
                }

                logger.info(`[Sync] Copied to Storage: ${file.name}`)
            } catch (err) {
                const errorMsg = err instanceof Error ? err.message : 'Unknown error'

                // Mark as failed in Firestore
                await db.collection('library_index').doc(file.id).update({
                    storageFailed: true,
                    storageError: errorMsg,
                }).catch(() => {})

                stats.copyErrors++
                syncErrors.push({
                    fileId: file.id,
                    fileName: file.name,
                    phase: 'copy',
                    error: errorMsg,
                    retryable: true,
                })

                logger.warn(`[Sync] Copy failed for ${file.name}: ${errorMsg}`)
            }
        }

        // 6. Detect deleted files (in DB but not in Drive) and clean up Storage
        for (const doc of existingSnapshot.docs) {
            if (!driveIds.has(doc.id)) {
                stats.deleted++
                stats.deletedFiles!.push(doc.id)

                // Phase C: Delete from Storage
                try {
                    const bucket = getStorage().bucket(
                        process.env.FIREBASE_STORAGE_BUCKET ||
                        `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebasestorage.app`
                    )
                    const extensions = ['.pdf', '.xml', '']
                    for (const ext of extensions) {
                        await bucket.file(`library/${doc.id}${ext}`).delete().catch(() => {})
                    }
                    stats.deletedFromStorage++
                    logger.info(`[Sync] Deleted from Storage: ${doc.id}`)
                } catch (err) {
                    logger.warn(`[Sync] Storage cleanup failed for ${doc.id}:`, err)
                }
            }
        }

        logger.info("[Sync] Sync Complete.", stats)

        // Phase D: Update sync run record
        await syncRunRef.update({
            completedAt: new Date().toISOString(),
            status: 'completed',
            stats,
            errors: syncErrors,
        })

        return stats

    } catch (error) {
        logger.error("[Sync] Fatal Error:", error)
        stats.errors++

        // Update sync run record on failure
        await syncRunRef.update({
            completedAt: new Date().toISOString(),
            status: 'failed',
            stats,
            errors: syncErrors,
        }).catch(() => {})

        throw error
    }
}
