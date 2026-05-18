
import crypto from 'crypto'
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { DriveClient } from "@/lib/google-drive"
import { uploadToStorage } from "@/lib/firebase-storage"
import { getStorage } from 'firebase-admin/storage'
import { logger } from "@/lib/logger"

const COPY_DELAY_MS = 200 // Gentle pacing between Storage uploads

/**
 * v60-11-01 Task 2 — derive songs/{fileId} mirror payload from library_index batch input.
 *
 * Closes the gap between library_index (498 docs) and songs/* (364 docs) for the
 * chart-binder picker. v54-01-01 bootstrap intentionally MIME-filtered (PDF + MusicXML
 * only), excluding ~134 Drive shortcuts + folders + audio + docs from songs/*. v60-11
 * drops that filter at the mirror site so every library_index write also writes
 * songs/{id}. The picker's v60-09 `status !== 'archived'` Dexie filter is now the
 * single gate.
 *
 * Critical invariants:
 * - Title is library_index.name VERBATIM (no .pdf stripping). Matches bootstrap-songs.ts:142
 *   so the 364 existing docs and the new mirrored docs share shape — picker results stay consistent.
 * - NO `status` field on this payload. Status is owned by /api/library/archive.
 *   Cron writing status would clobber user-driven archives on next hourly tick.
 *   .set({ merge: true }) preserves any existing status field on the songs doc.
 * - createdAt only when the file is NEW to library_index. .set({ merge: true })
 *   preserves prior createdAt on subsequent ticks.
 */
function buildSongsMirrorPayload(
    fileId: string,
    rawName: string,
    existsInLibrary: boolean,
): Record<string, unknown> {
    const title = rawName.trim() // caller has already guarded against empty
    const payload: Record<string, unknown> = {
        id: fileId,
        title,
        normalizedTitle: title.toLowerCase(),
        fileId,
    }
    if (!existsInLibrary) {
        payload.createdAt = Date.now()
    }
    return payload
}

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
    copyFailedFiles?: string[]
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
        copyFailedFiles: [],
        retriedCopies: 0,
        deletedFromStorage: 0,
    }

    const syncErrors: SyncRunRecord['errors'] = []

    // Phase D: Create sync run document
    initAdmin()
    const db = getFirestore()

    // Concurrency guard: abort if another sync started within the last 10 minutes.
    // Prevents Vercel cron retries or rapid admin re-clicks from running two syncs
    // simultaneously, which would double-count stats and create duplicate sync_run docs.
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    const runningSnap = await db.collection('sync_runs')
        .where('status', '==', 'running')
        .where('startedAt', '>=', tenMinutesAgo)
        .limit(1)
        .get()
    if (!runningSnap.empty) {
        const running = runningSnap.docs[0].data()
        throw new Error(`[Sync] Another sync is already running (started ${running.startedAt}). Aborting to prevent concurrent runs.`)
    }

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

        // Safety: if Drive returns 0 files it almost certainly means an API error or
        // misconfigured folder, not a genuinely empty library. Proceeding would delete
        // everything in library_index. Abort instead.
        if (allFiles.length === 0) {
            throw new Error('[Sync] Drive returned 0 files — aborting to prevent accidental library wipe. Check GOOGLE_DRIVE_ROOT_FOLDER_ID and Drive API access.')
        }

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
        })

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
            // v60-11-01: parallel songs/* mirror batch. No MIME filter — every named
            // library_index entry mirrors. Status field intentionally absent (owned
            // by /api/library/archive). See buildSongsMirrorPayload header for invariants.
            const songsBatch = db.batch()
            const now = new Date().toISOString()

            for (const file of chunk) {
                const docRef = db.collection('library_index').doc(file.id)

                // Cycle-2 DATA-001: strip leading/trailing whitespace at write
                // time so " Ana B_Koach.pdf" stops indexing as a separate row
                // from "Ana B_Koach.pdf"; persist `fileSize` (Drive returns
                // `size` as a decimal string for binary files; folders +
                // Workspace types omit it, hence the parseInt + isFinite
                // guard so we never write NaN).
                const cleanName = typeof file.name === 'string' ? file.name.trim() : file.name
                const sizeNum =
                    typeof file.size === 'string' && file.size.length > 0
                        ? Number.parseInt(file.size, 10)
                        : NaN
                const fileSize = Number.isFinite(sizeNum) ? sizeNum : null

                batch.set(docRef, {
                    id: file.id,
                    name: cleanName,
                    nameLower: cleanName.toLowerCase(),
                    mimeType: file.mimeType,
                    modifiedTime: file.modifiedTime || null,
                    webViewLink: file.webViewLink || null,
                    parents: file.parents || [],
                    fileSize,
                    // Store shortcut target so file-fetcher can resolve without an extra Drive API call
                    ...(file.shortcutDetails?.targetId
                        ? { shortcutTargetId: file.shortcutDetails.targetId }
                        : {}),
                    lastSyncedAt: now,
                    source: 'google_drive'
                }, { merge: true })

                // v60-11-01: songs/* mirror. Skip empty/missing name (matches subscribe.ts:85 guard).
                const rawName = typeof file.name === 'string' ? file.name.trim() : ''
                if (rawName.length > 0) {
                    const songsRef = db.collection('songs').doc(file.id)
                    songsBatch.set(
                        songsRef,
                        buildSongsMirrorPayload(file.id, rawName, existingDocs.has(file.id)),
                        { merge: true },
                    )
                }

                if (existingDocs.has(file.id)) {
                    stats.updated++
                    stats.updatedFiles!.push(file.name)
                } else {
                    stats.added++
                    stats.addedFiles!.push(file.name)
                }
            }

            // Commit both batches in parallel. allSettled → a songs/* failure is non-fatal
            // (logged, library_index commit independent). Self-heals on the next snapshot tick
            // via v60-09's continuous listener.
            const [libResult, songsResult] = await Promise.allSettled([
                batch.commit(),
                songsBatch.commit(),
            ])
            if (libResult.status === 'rejected') {
                throw libResult.reason
            }
            if (songsResult.status === 'rejected') {
                logger.warn('[Sync] songs/* mirror batch failed (non-fatal)', songsResult.reason)
            }
        }

        // Phase B: Copy files to Storage (after metadata batch write)
        if (copyList.length > 0) {
            logger.info(`[Sync] Copying ${copyList.length} files to Storage...`)
        }
        for (let ci = 0; ci < copyList.length; ci++) {
            const file = copyList[ci]
            if (ci > 0) await new Promise(r => setTimeout(r, COPY_DELAY_MS))
            try {
                const fileData = await drive.getFile(file.id)
                const buffer = Buffer.from(fileData as ArrayBuffer)

                if (buffer.byteLength < 50) {
                    logger.info(`[Sync] Skipping small file (${buffer.byteLength}B): ${file.name}`)
                    continue
                }

                // Cycle-6 C6C-008 / C5C-006 follow-up: for shortcut-bonded
                // rows, `drive.getFile` transparently resolves the shortcut
                // and returns the TARGET's bytes — but `file.mimeType` here
                // is the SHORTCUT's own mime, not the target's. Writing the
                // target bytes with the shortcut mime broke `fetchFileById`'s
                // Storage path (gig-packet then routed real PDFs to the
                // "Unsupported content type" appendix). Use Drive's
                // `shortcutDetails.targetMimeType` (populated by listAllFiles)
                // so Storage carries the right contentType going forward.
                const storageMimeRaw =
                    file.mimeType === 'application/vnd.google-apps.shortcut'
                        ? file.shortcutDetails?.targetMimeType
                        : file.mimeType
                const storageMime =
                    storageMimeRaw && storageMimeRaw !== 'application/vnd.google-apps.shortcut'
                        ? storageMimeRaw
                        : 'application/pdf'
                await uploadToStorage(file.id, buffer, storageMime)

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

                // Mark as failed in Firestore so the next sync retries this file.
                // Log but don't swallow — if this update also fails, the file has neither
                // storageCopiedAt nor storageFailed=true and would be silently skipped forever.
                await db.collection('library_index').doc(file.id).update({
                    storageFailed: true,
                    storageError: errorMsg,
                }).catch((markErr) => {
                    logger.warn(`[Sync] Could not mark storageFailed for ${file.name}:`, markErr)
                })

                stats.copyErrors++
                stats.copyFailedFiles!.push(file.name)
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
