/**
 * Server-side file fetcher with Storage-first, Drive-fallback pattern.
 * 
 * Used by: file proxy API, print pipeline, enrichment engine.
 * Centralizes the "check Storage → fall back to Drive → cache-through" logic
 * so we don't have multiple implementations with different bugs.
 */

import { DriveClient } from "@/lib/google-drive"
import { downloadFromStorage, uploadToStorage } from "@/lib/firebase-storage"
import { logger } from "@/lib/logger"

const EXPORTABLE_GOOGLE_TYPES = [
    'application/vnd.google-apps.document',
    'application/vnd.google-apps.spreadsheet',
    'application/vnd.google-apps.presentation',
]

export interface FetchedFile {
    buffer: Buffer
    contentType: string
    source: 'firebase-storage' | 'google-drive'
}

/**
 * Fetch a file by ID, checking Firebase Storage first, then Google Drive.
 * Automatically caches Drive results to Storage for next time.
 * 
 * @param fileId - Google Drive file ID
 * @param mimeType - Optional MIME type hint for Storage lookup
 * @returns FetchedFile or null if not found anywhere
 */
export async function fetchFileById(fileId: string, mimeType?: string): Promise<FetchedFile | null> {
    // 1. Try Firebase Storage first (fast, CDN-cached)
    const storageResult = await downloadFromStorage(fileId, mimeType)
    if (storageResult.success) {
        return {
            buffer: storageResult.data.buffer,
            contentType: storageResult.data.contentType,
            source: 'firebase-storage',
        }
    }
    if (storageResult.reason === 'network') {
        logger.warn(`[FileFetcher] Storage lookup failed for ${fileId}: ${storageResult.message}`)
    }

    // 2. Fall back to Google Drive
    try {
        const drive = new DriveClient()
        const metadata = await drive.getFileMetadata(fileId)

        let fileData: ArrayBuffer
        let contentType: string

        if (EXPORTABLE_GOOGLE_TYPES.includes(metadata.mimeType || '')) {
            fileData = await drive.exportDoc(fileId, 'application/pdf') as ArrayBuffer
            contentType = 'application/pdf'
        } else if (metadata.mimeType === 'application/vnd.google-apps.folder') {
            // Folders can't be downloaded
            logger.warn(`[FileFetcher] Skipping folder: ${fileId}`)
            return null
        } else {
            fileData = await drive.getFile(fileId) as ArrayBuffer
            contentType = metadata.mimeType || 'application/octet-stream'
        }

        const buffer = Buffer.from(fileData)

        if (buffer.byteLength < 50) {
            logger.warn(`[FileFetcher] File too small (${buffer.byteLength}B): ${fileId}`)
            return null
        }

        // 3. Cache-through: store in Firebase Storage for next time (fire-and-forget)
        uploadToStorage(fileId, buffer, contentType).catch(e => {
            logger.warn(`[FileFetcher] Cache-through failed for ${fileId}:`, e instanceof Error ? e.message : e)
        })

        return { buffer, contentType, source: 'google-drive' }
    } catch (e) {
        logger.error(`[FileFetcher] Drive fetch failed for ${fileId}:`, e instanceof Error ? e.message : e)
        return null
    }
}
