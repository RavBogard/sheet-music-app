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
import { logger } from "@/lib/logger"

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
        const file = bucket.file(getStoragePath(fileId, mimeType))
        const [exists] = await file.exists()
        return exists
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
        const path = getStoragePath(fileId, mimeType)
        const file = bucket.file(path)
        const [exists] = await file.exists()
        if (!exists) return null
        return `gs://${BUCKET_NAME}/${path}`
    } catch {
        return null
    }
}

/**
 * Download a file from Storage as a Buffer.
 * Returns null if the file doesn't exist.
 */
export async function downloadFromStorage(fileId: string, mimeType?: string): Promise<{ buffer: Buffer; contentType: string } | null> {
    try {
        const bucket = getBucket()
        const path = getStoragePath(fileId, mimeType)
        const file = bucket.file(path)
        
        const [exists] = await file.exists()
        if (!exists) return null

        const [buffer] = await file.download()
        const [metadata] = await file.getMetadata()
        
        return {
            buffer: Buffer.from(buffer),
            contentType: metadata.contentType || 'application/pdf'
        }
    } catch {
        return null
    }
}

/**
 * Copy a file from Google Drive to Firebase Storage.
 * Used during the sync process.
 * Returns the public URL of the uploaded file.
 */
export async function copyDriveFileToStorage(
    driveClient: any,
    fileId: string,
    mimeType: string
): Promise<string | null> {
    try {
        let fileData: ArrayBuffer | Buffer
        let contentType = mimeType

        if (mimeType?.startsWith('application/vnd.google-apps.')) {
            // Google Doc → export as PDF
            fileData = await driveClient.exportDoc(fileId, 'application/pdf')
            contentType = 'application/pdf'
        } else {
            // Regular file → download directly
            fileData = await driveClient.getFile(fileId)
        }

        const buffer = Buffer.from(fileData as any)
        const url = await uploadToStorage(fileId, buffer, contentType)
        return url
    } catch (error) {
        logger.error(`[Storage] Failed to copy file ${fileId}:`, error)
        return null
    }
}
