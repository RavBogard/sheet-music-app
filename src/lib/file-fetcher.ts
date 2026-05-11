/**
 * Server-side file fetcher.
 *
 * Primary path: Firebase Storage (fast, CDN-backed).
 * Fallback: Google Drive direct download when Storage misses (transient sync failure).
 *
 * Used by: file proxy API, print pipeline, enrichment engine.
 */

import { downloadFromStorage } from "@/lib/firebase-storage"
import { DriveClient } from "@/lib/google-drive"
import { logger } from "@/lib/logger"

export interface FetchedFile {
    buffer: Buffer
    contentType: string
    source: 'firebase-storage' | 'google-drive-fallback'
}

/**
 * Fetch a file by ID from Firebase Storage.
 *
 * @param fileId - File ID (originally from Google Drive)
 * @param mimeType - Optional MIME type hint for Storage lookup
 * @returns FetchedFile or null if not in Storage
 */
export async function fetchFileById(fileId: string, mimeType?: string): Promise<FetchedFile | null> {
    // If the frontend passed a raw storageUrl with an extension, strip it so the candidate logic works correctly 
    const cleanId = fileId.replace(/\.(pdf|xml|musicxml|mp3)$/i, '')
    
    const storageResult = await downloadFromStorage(cleanId, mimeType)
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
        logger.warn(`[FileFetcher] File not in Storage: ${fileId} — attempting Drive fallback`)
    }

    // Drive fallback: handles transient sync copy failures so files remain accessible
    // Only runs when Storage misses; Drive IDs starting with 'upload-' are local-only and won't be in Drive
    if (!cleanId.startsWith('upload-')) {
        try {
            const drive = new DriveClient()
            const data = await drive.getFile(cleanId)
            const buffer = Buffer.from(data as ArrayBuffer)
            logger.info(`[FileFetcher] Served ${fileId} from Drive fallback (Storage miss)`)
            return {
                buffer,
                contentType: mimeType || 'application/pdf',
                source: 'google-drive-fallback',
            }
        } catch (driveErr) {
            logger.warn(`[FileFetcher] Drive fallback failed for ${fileId}:`, driveErr instanceof Error ? driveErr.message : driveErr)
        }
    }

    return null
}
