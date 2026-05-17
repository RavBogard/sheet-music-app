/**
 * Server-side file fetcher.
 *
 * Primary path: Firebase Storage (fast, CDN-backed).
 * Fallback: Google Drive direct download when Storage misses (transient sync failure).
 *
 * Used by: file proxy API, print pipeline, enrichment engine.
 */

import { downloadFromStorage, fileExistsInStorage } from "@/lib/firebase-storage"
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

/**
 * Metadata-only health probe for a library chart fileId. Unlike fetchFileById,
 * this does NOT download bytes — just probes Storage existence and Drive
 * metadata. Used by `verify_setlist_charts` and the publish pre-flight check
 * to catch orphaned library_index rows BEFORE the band ever sees a 404.
 *
 * Resolution mirrors fetchFileById: Storage primary → Drive fallback. An
 * `upload-` prefixed id that's missing from Storage is `status: 'missing'`
 * (the prefix indicates a local-only upload, no Drive backing).
 *
 * Returns:
 *  - { status: 'ok', source: 'firebase-storage' | 'google-drive', mimeType?: string }
 *  - { status: 'missing', reason }    — file not in Storage and (if applicable) not in Drive
 *  - { status: 'unreachable', error } — network/transient failure; caller may retry
 */
export type ChartHealth =
    | { status: "ok"; source: "firebase-storage" | "google-drive"; mimeType?: string }
    | { status: "missing"; reason: string }
    | { status: "unreachable"; error: string }

export async function getChartHealth(
    fileId: string,
    mimeType?: string,
): Promise<ChartHealth> {
    if (!fileId) return { status: "missing", reason: "empty fileId" }
    const cleanId = fileId.replace(/\.(pdf|xml|musicxml|mp3)$/i, "")
    try {
        const storage = await fileExistsInStorage(cleanId, mimeType)
        if (storage.success && storage.data) {
            return { status: "ok", source: "firebase-storage", mimeType }
        }
        if (storage.success === false && storage.reason === "network") {
            return { status: "unreachable", error: storage.message }
        }
        // Storage miss → only Drive can help for non-upload-prefixed ids.
        if (cleanId.startsWith("upload-")) {
            return {
                status: "missing",
                reason: "Not in Storage; upload- prefix has no Drive fallback",
            }
        }
        try {
            const drive = new DriveClient()
            const meta = (await drive.getFileMetadata(cleanId)) as {
                mimeType?: string | null
            }
            return {
                status: "ok",
                source: "google-drive",
                mimeType: meta?.mimeType ?? mimeType,
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            if (/not found|404/i.test(msg)) {
                // Cycle-1 F-004: mention BOTH stores in the reason so the
                // caller (and the agent reading the response) can tell that
                // Storage was probed first and also missed. Cowork-era
                // "Drive: File not found" was misleading enough that agents
                // assumed only Drive was checked.
                return {
                    status: "missing",
                    reason: `Not in Storage; Drive 404: ${msg}`,
                }
            }
            return { status: "unreachable", error: msg }
        }
    } catch (err) {
        return {
            status: "unreachable",
            error: err instanceof Error ? err.message : String(err),
        }
    }
}
