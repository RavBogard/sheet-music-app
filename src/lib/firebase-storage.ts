/**
 * Firebase Storage admin helpers.
 *
 * Used server-side to:
 * 1. Copy files from Google Drive to Firebase Storage during sync
 * 2. Serve files from Storage with CDN caching
 * 3. Check if a file already exists in Storage
 *
 * Architecture: Google Drive (intake) → Sync → Firebase Storage (serving) → CDN → Client
 */

import { initAdmin } from './firebase-admin'
import { getStorage } from 'firebase-admin/storage'

// ─── Discriminated Result Types ───

export type StorageError = { success: false; reason: 'not_found' | 'network' | 'invalid_input'; message: string }
type StorageSuccess<T> = { success: true; data: T }
export type StorageResult<T> = StorageSuccess<T> | StorageError

/**
 * Get the Firebase Storage bucket instance.
 */
function getBucket() {
    initAdmin()
    const bucketName = process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebasestorage.app`
    return getStorage().bucket(bucketName)
}

/**
 * Path convention for library files in Storage.
 * Mirrors a flat structure keyed by Drive file ID for easy lookup.
 */
function getStoragePath(fileId: string, mimeType?: string): string {
    let ext = mimeType?.includes('pdf') ? '.pdf'
        : mimeType?.includes('xml') ? '.xml'
            : mimeType?.includes('audio') ? '.mp3'
                : ''
    
    // Prevent double extensions if the ID somehow already includes it
    if (ext && fileId.toLowerCase().endsWith(ext)) {
        ext = ''
    }
    
    return `library/${fileId}${ext}`
}

/**
 * Build the list of candidate paths for a file ID,
 * trying both the original and hyphenated variant.
 */
function getCandidatePaths(fileId: string, mimeType?: string): string[] {
    const altFileId = fileId.replace(/_/g, '-')
    const fileIdsToTry = fileId === altFileId ? [fileId] : [fileId, altFileId]

    // Some systems prefix manual uploads with 'upload-' while others don't.
    // Try both variants to be absolutely sure we find the file.
    const expandedIds = new Set<string>()
    for (const id of fileIdsToTry) {
        expandedIds.add(id)
        if (!id.startsWith('upload-')) expandedIds.add(`upload-${id}`)
        if (id.startsWith('upload-')) expandedIds.add(id.replace('upload-', ''))
    }

    const paths: string[] = []
    for (const id of Array.from(expandedIds)) {
        if (mimeType) {
            paths.push(getStoragePath(id, mimeType))
        } else {
            paths.push(getStoragePath(id))
            paths.push(getStoragePath(id, 'pdf'))
            paths.push(getStoragePath(id, 'xml'))
            paths.push(getStoragePath(id, 'audio'))
        }
    }
    return paths
}

/**
 * Check if a file exists in Firebase Storage.
 */
export async function fileExistsInStorage(fileId: string, mimeType?: string): Promise<StorageResult<boolean>> {
    try {
        const bucket = getBucket()
        const paths = getCandidatePaths(fileId, mimeType)

        for (const path of paths) {
            const [exists] = await bucket.file(path).exists()
            if (exists) return { success: true, data: true }
        }
        return { success: true, data: false }
    } catch (err) {
        return { success: false, reason: 'network', message: (err as Error).message || 'Storage check failed' }
    }
}

/**
 * Upload a file buffer to Firebase Storage.
 * Returns the public/signed URL for serving.
 * Throws on error (callers already handle throws).
 */
export async function uploadToStorage(
    fileId: string,
    buffer: Buffer,
    mimeType: string = 'application/pdf'
): Promise<string> {
    const bucket = getBucket()
    const path = getStoragePath(fileId, mimeType)
    const file = bucket.file(path)

    await file.save(buffer, {
        metadata: {
            contentType: mimeType,
            cacheControl: 'public, max-age=86400, s-maxage=604800', // 1 day browser, 7 days CDN
            metadata: {
                driveFileId: fileId,
                uploadedAt: new Date().toISOString(),
            }
        }
    })

    const bucketName = process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebasestorage.app`
    return `gs://${bucketName}/${path}`
}

/**
 * Get the public URL for a file in Storage.
 * Returns discriminated result distinguishing not_found from network errors.
 */
export async function getStorageUrl(fileId: string, mimeType?: string): Promise<StorageResult<string>> {
    try {
        const bucket = getBucket()
        const paths = getCandidatePaths(fileId, mimeType)

        for (const path of paths) {
            const file = bucket.file(path)
            const [exists] = await file.exists()
            if (exists) {
                const bucketName = process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebasestorage.app`
                return { success: true, data: `gs://${bucketName}/${path}` }
            }
        }

        return { success: false, reason: 'not_found', message: `File ${fileId} not found in storage` }
    } catch (err) {
        return { success: false, reason: 'network', message: (err as Error).message || 'Storage URL lookup failed' }
    }
}

/**
 * Download a file from Storage as a Buffer.
 * Returns discriminated result distinguishing not_found from network errors.
 * When mimeType is unknown, tries common extensions.
 */
export async function downloadFromStorage(fileId: string, mimeType?: string): Promise<StorageResult<{ buffer: Buffer; contentType: string }>> {
    try {
        const bucket = getBucket()
        const paths = getCandidatePaths(fileId, mimeType)

        for (const path of paths) {
            const file = bucket.file(path)
            const [exists] = await file.exists()
            if (exists) {
                const [buffer] = await file.download()
                const [metadata] = await file.getMetadata()
                return {
                    success: true,
                    data: {
                        buffer: Buffer.from(buffer),
                        contentType: metadata.contentType || 'application/pdf'
                    }
                }
            }
        }

        return { success: false, reason: 'not_found', message: `File ${fileId} not found in storage` }
    } catch (err) {
        return { success: false, reason: 'network', message: (err as Error).message || 'Storage download failed' }
    }
}
