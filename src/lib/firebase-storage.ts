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

const BUCKET_NAME = process.env.FIREBASE_STORAGE_BUCKET || `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebasestorage.app`

/**
 * Get the Firebase Storage bucket instance.
 */
function getBucket() {
    initAdmin()
    return getStorage().bucket(BUCKET_NAME)
}

/**
 * Path convention for library files in Storage.
 * Mirrors a flat structure keyed by Drive file ID for easy lookup.
 */
function getStoragePath(fileId: string, mimeType?: string): string {
    const ext = mimeType?.includes('pdf') ? '.pdf'
        : mimeType?.includes('xml') ? '.xml'
            : mimeType?.includes('audio') ? '.mp3'
                : ''
    return `library/${fileId}${ext}`
}

/**
 * Check if a file exists in Firebase Storage.
 */
export async function fileExistsInStorage(fileId: string, mimeType?: string): Promise<boolean> {
    try {
        const bucket = getBucket()
        const altFileId = fileId.replace(/_/g, '-')
        const fileIdsToTry = fileId === altFileId ? [fileId] : [fileId, altFileId]

        const paths: string[] = []
        for (const id of fileIdsToTry) {
            if (mimeType) {
                paths.push(getStoragePath(id, mimeType))
            } else {
                paths.push(getStoragePath(id))
                paths.push(getStoragePath(id, 'pdf'))
                paths.push(getStoragePath(id, 'xml'))
                paths.push(getStoragePath(id, 'audio'))
            }
        }

        for (const path of paths) {
            const [exists] = await bucket.file(path).exists()
            if (exists) return true
        }
        return false
    } catch {
        return false
    }
}

/**
 * Upload a file buffer to Firebase Storage.
 * Returns the public/signed URL for serving.
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


    return `gs://${BUCKET_NAME}/${path}`
}

/**
 * Get the public URL for a file in Storage.
 * Returns null if the file doesn't exist.
 */
export async function getStorageUrl(fileId: string, mimeType?: string): Promise<string | null> {
    try {
        const bucket = getBucket()
        const altFileId = fileId.replace(/_/g, '-')
        const fileIdsToTry = fileId === altFileId ? [fileId] : [fileId, altFileId]

        const paths: string[] = []
        for (const id of fileIdsToTry) {
            paths.push(getStoragePath(id, mimeType))
            if (!mimeType) {
                paths.push(getStoragePath(id, 'pdf'))
                paths.push(getStoragePath(id, 'xml'))
                paths.push(getStoragePath(id, 'audio'))
            }
        }

        for (const path of paths) {
            const file = bucket.file(path)
            const [exists] = await file.exists()
            if (exists) return `gs://${BUCKET_NAME}/${path}`
        }

        return null
    } catch {
        return null
    }
}

/**
 * Download a file from Storage as a Buffer.
 * Returns null if the file doesn't exist.
 * When mimeType is unknown, tries common extensions.
 */
export async function downloadFromStorage(fileId: string, mimeType?: string): Promise<{ buffer: Buffer; contentType: string } | null> {
    try {
        const bucket = getBucket()

        // Some external migration scripts incorrectly saved UUIDs with underscores instead of hyphens.
        // As a resilient fallback, we test both variants of the fileId.
        const altFileId = fileId.replace(/_/g, '-')
        const fileIdsToTry = fileId === altFileId ? [fileId] : [fileId, altFileId]

        const paths: string[] = []
        for (const id of fileIdsToTry) {
            if (mimeType) {
                paths.push(getStoragePath(id, mimeType))
            } else {
                paths.push(getStoragePath(id))
                paths.push(getStoragePath(id, 'pdf'))
                paths.push(getStoragePath(id, 'xml'))
                paths.push(getStoragePath(id, 'audio'))
            }
        }

        for (const path of paths) {
            const file = bucket.file(path)
            const [exists] = await file.exists()
            if (exists) {
                const [buffer] = await file.download()
                const [metadata] = await file.getMetadata()
                return {
                    buffer: Buffer.from(buffer),
                    contentType: metadata.contentType || 'application/pdf'
                }
            }
        }

        return null
    } catch {
        return null
    }
}
