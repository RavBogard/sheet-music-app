/**
 * Server-side file fetcher — Firebase Storage only.
 *
 * Used by: file proxy API, print pipeline, enrichment engine.
 * Files must be synced from Google Drive to Storage via the sync engine.
 * There is no Drive fallback — if a file isn't in Storage, it returns null.
 */

import { downloadFromStorage } from "@/lib/firebase-storage"
import { logger } from "@/lib/logger"

export interface FetchedFile {
    buffer: Buffer
    contentType: string
    source: 'firebase-storage'
}

/**
 * Fetch a file by ID from Firebase Storage.
 *
 * @param fileId - File ID (originally from Google Drive)
 * @param mimeType - Optional MIME type hint for Storage lookup
 * @returns FetchedFile or null if not in Storage
 */
export async function fetchFileById(fileId: string, mimeType?: string): Promise<FetchedFile | null> {
    const storageResult = await downloadFromStorage(fileId, mimeType)
    if (storageResult.success) {
        return {
            buffer: storageResult.data.buffer,
            contentType: storageResult.data.contentType,
            source: 'firebase-storage',
        }
    }

    if (storageResult.reason === 'network') {
        logger.warn(`[FileFetcher] Storage error for ${fileId}: ${storageResult.message}`)
    } else {
        logger.warn(`[FileFetcher] File not in Storage: ${fileId} — run a sync to copy from Drive`)
    }
    return null
}
