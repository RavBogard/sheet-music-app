import { drive } from "@googleapis/drive"
import { GoogleAuth } from "google-auth-library"
import { logger } from "@/lib/logger"

const DRIVE_REQUEST_TIMEOUT_MS = 30_000
const MAX_CONCURRENT_SUBFOLDER_REQUESTS = 5

/**
 * Escape a string for use in Google Drive API query `name contains '...'`.
 * Drive query language requires escaping backslashes and single quotes.
 */
function sanitizeDriveQuery(input: string): string {
    return input.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

/**
 * Run async operations with bounded concurrency.
 * Prevents flooding the Drive API with parallel requests.
 */
async function mapWithConcurrency<T, R>(
    items: T[],
    fn: (item: T) => Promise<R>,
    limit: number
): Promise<R[]> {
    const results: R[] = new Array(items.length)
    let index = 0
    async function worker() {
        while (index < items.length) {
            const i = index++
            results[i] = await fn(items[i])
        }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()))
    return results
}

/**
 * Exponential backoff wrapper for Google Drive API calls.
 * Retries on 429 (Rate Limit) and 50x (Transient Server Errors).
 * Includes a 30-second timeout per attempt to prevent hanging requests.
 */
async function withRetry<T>(operation: () => Promise<T>, maxRetries = 3, baseDelayMs = 1500): Promise<T> {
    let attempt = 0;
    while (true) {
        try {
            // Race between the operation and a timeout
            const result = await Promise.race([
                operation(),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error(`Drive API timeout after ${DRIVE_REQUEST_TIMEOUT_MS}ms`)), DRIVE_REQUEST_TIMEOUT_MS)
                ),
            ]);
            return result;
        } catch (error: any) {
            attempt++;
            if (attempt > maxRetries) throw error;

            const status = error?.status || error?.code;
            const isTimeout = error?.message?.includes('timeout')
            if (!isTimeout && status !== 429 && status !== 500 && status !== 502 && status !== 503 && status !== 504) {
                throw error; // Let other errors bubble up
            }

            const delay = baseDelayMs * Math.pow(2, attempt - 1);
            logger.warn(`[Drive API Retry] Attempt ${attempt} failed with ${isTimeout ? 'timeout' : status}. Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

interface DriveFileResult {
    id: string
    name: string
    mimeType: string
    modifiedTime?: string
    webContentLink?: string
    webViewLink?: string
    parents?: string[]
    shortcutDetails?: { targetId: string; targetMimeType?: string }
}

export class DriveClient {
    private drive

    constructor() {
        let credentials

        // Option 1: Full JSON (Easier for user to copy-paste)
        if (process.env.GOOGLE_CREDENTIALS_JSON) {
            try {
                // Handle cases where the env var might be double-escaped or just a string
                let jsonString = process.env.GOOGLE_CREDENTIALS_JSON
                if (jsonString.startsWith('"') && jsonString.endsWith('"')) {
                    jsonString = JSON.parse(jsonString) // Unwrap if it was pasted as a string literal
                }

                const json = typeof jsonString === 'object' ? jsonString : JSON.parse(jsonString as string)

                credentials = {
                    client_email: json.client_email,
                    private_key: json.private_key,
                }
            } catch (e) {
                logger.error("[Auth] Failed to parse GOOGLE_CREDENTIALS_JSON", e)
            }
        }

        // Option 2: Individual Vars (Fallback)
        if (!credentials) {
            if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
                credentials = {
                    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
                    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
                }
            }
        }

        if (!credentials) {
            logger.error("[Auth] Missing Google Drive Credentials (JSON or EMAIL/KEY)")
        }

        const auth = new GoogleAuth({
            credentials,
            // Explicitly pass Project ID to prevent "Unable to detect Project Id" error in Vercel
            projectId: process.env.GOOGLE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
            scopes: ['https://www.googleapis.com/auth/drive'],
        })

        this.drive = drive({ version: 'v3', auth })
    }

    async listAllFiles(folderId?: string) {
        const allFiles: DriveFileResult[] = []

        try {
            logger.info(folderId ? `[Drive] Listing folder: ${folderId}` : `[Drive] Global Search (Shared with me)`)

            // If folderId is provided, search inside it. If not, search EVERYTHING (except folders)
            const q = folderId
                ? `'${folderId}' in parents and trashed = false`
                : `trashed = false` // Fetch EVERYTHING (files + folders) so we can build the tree

            let nextPageToken: string | undefined = undefined;

            do {
                const res = await withRetry(() => this.drive.files.list({
                    pageSize: 100,
                    fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, webContentLink, parents, shortcutDetails)',
                    q,
                    pageToken: nextPageToken,
                    supportsAllDrives: true,
                    includeItemsFromAllDrives: true
                })) as { data: { files?: DriveFileResult[]; nextPageToken?: string } }

                if (res.data.files) {
                    allFiles.push(...res.data.files)
                }
                nextPageToken = res.data.nextPageToken
            } while (nextPageToken)

            // Recursion ONLY if we are in folder-mode — bounded to 5 concurrent
            if (folderId) {
                const folders = allFiles.filter(f => f.mimeType === 'application/vnd.google-apps.folder')
                if (folders.length > 0) {
                    logger.info(`[Drive] Digging into ${folders.length} subfolders (max ${MAX_CONCURRENT_SUBFOLDER_REQUESTS} concurrent)...`)
                    const subFolderResults = await mapWithConcurrency(
                        folders,
                        folder => this.listAllFiles(folder.id),
                        MAX_CONCURRENT_SUBFOLDER_REQUESTS
                    )
                    subFolderResults.forEach(subFiles => allFiles.push(...subFiles))
                }
            }

            return allFiles
        } catch (error) {
            logger.error(`[Drive] List Error:`, error)
            return allFiles
        }
    }

    async listFiles(params: {
        folderId?: string
        pageToken?: string
        pageSize?: number
        query?: string
    }) {
        try {
            const { folderId, pageToken, pageSize = 50, query } = params

            // Construct Query
            let q = "trashed = false"

            // 1. Folder Context or Global
            if (folderId) {
                q += ` and '${folderId}' in parents`
            }

            // 2. Text Search (if provided)
            if (query) {
                const safeQuery = sanitizeDriveQuery(query)
                q += ` and name contains '${safeQuery}'`
            }

            logger.info(`[Drive] Fetching page. Token: ${!!pageToken}, Limit: ${pageSize}, Q: ${q}`)

            const res = await withRetry(() => this.drive.files.list({
                pageSize,
                fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, webContentLink, parents)',
                q,
                pageToken,
                supportsAllDrives: true,
                includeItemsFromAllDrives: true,
                orderBy: 'folder,name' // Folders first, then name
            })) as { data: { files?: DriveFileResult[]; nextPageToken?: string } }

            return {
                files: res.data.files || [],
                nextPageToken: res.data.nextPageToken || null
            }

        } catch (error: unknown) {
            logger.error("[Drive] Pagination Error:", error)
            throw error
        }
    }

    async getFile(fileId: string) {
        try {
            // Shortcuts can't be downloaded directly — resolve to target ID first.
            // Drive returns 403 if you try alt=media on a shortcut.
            let downloadId = fileId
            const meta = await withRetry(() => this.drive.files.get({
                fileId,
                fields: 'mimeType, shortcutDetails',
                supportsAllDrives: true,
            }))
            const metaData = meta.data as { mimeType?: string; shortcutDetails?: { targetId?: string } }
            if (metaData.mimeType === 'application/vnd.google-apps.shortcut') {
                const targetId = metaData.shortcutDetails?.targetId
                if (!targetId) throw new Error(`Drive shortcut ${fileId} has no targetId`)
                logger.info(`[Drive] Resolving shortcut ${fileId} → ${targetId}`)
                downloadId = targetId
            }

            const res = await withRetry(() => this.drive.files.get({
                fileId: downloadId,
                alt: 'media',
                supportsAllDrives: true,
                acknowledgeAbuse: true
            }, {
                responseType: 'arraybuffer'
            } as { responseType: 'arraybuffer' }))

            return res.data
        } catch (error: unknown) {
            logger.error(`[Drive] Error getting file ${fileId}:`, error instanceof Error ? error.message : "Unknown error")
            throw error
        }
    }

    async getFileMetadata(fileId: string) {
        try {
            const res = await withRetry(() => this.drive.files.get({
                fileId,
                fields: 'id, name, mimeType, parents',
                supportsAllDrives: true
            }))
            return res.data
        } catch (error: unknown) {
            logger.error(`[Drive] Error getting file metadata ${fileId}:`, error instanceof Error ? error.message : "Unknown error")
            throw error
        }
    }

    async exportDoc(fileId: string, mimeType = 'application/pdf') {
        try {
            const res = await withRetry(() => this.drive.files.export({
                fileId,
                mimeType,
            }, {
                responseType: 'arraybuffer',
            } as { responseType: 'arraybuffer' }))

            return res.data
        } catch (error: unknown) {
            logger.error(`[Drive] Error exporting doc ${fileId}:`, error instanceof Error ? error.message : "Unknown error")
            throw error
        }
    }

    async createFile(params: { name: string; mimeType: string; content: string; parents?: string[] }) {
        try {
            const { name, mimeType, content, parents } = params

            const media = {
                mimeType,
                body: content
            }

            const fileMetadata: { name: string; mimeType: string; parents?: string[] } = {
                name,
                mimeType
            }

            if (parents && parents.length > 0) {
                fileMetadata.parents = parents
            }

            const res = await withRetry(() => this.drive.files.create({
                requestBody: fileMetadata,
                media: media,
                fields: 'id, name, webContentLink',
                supportsAllDrives: true
            }))

            logger.info(`[Drive] Created file: ${res.data.id}`)
            return res.data

        } catch (error: unknown) {
            logger.error(`[Drive] Create Error:`, error)
            throw error
        }
    }
}
