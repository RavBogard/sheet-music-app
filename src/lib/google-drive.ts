import { drive } from "@googleapis/drive"
import { GoogleAuth } from "google-auth-library"
import { Readable } from "node:stream"
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
    /** Drive returns size as a decimal string for binary files; folders/Workspace docs omit it. */
    size?: string
}

/**
 * v11.3-02-01 (BUG-cowork-chart-upload-2026-06-10) — classify a Drive source
 * mime by how `fetchAsPdf` should turn it into PDF bytes:
 *
 *  - `'export'` — a native Google Workspace doc that Drive can export directly
 *    to PDF via `files.export` (Docs / Sheets / Slides / Drawings).
 *  - `'copy'`   — an uploaded Office file (`.docx`/`.xlsx`/`.pptx` + legacy
 *    msword/ms-excel/ms-powerpoint). `files.export` does NOT work on these, so
 *    `fetchAsPdf` converts-on-copy (copy → matching Google doc → export PDF →
 *    delete the temp).
 *  - `null`     — not server-side-convertible (folders, Forms, ordinary
 *    binaries like PDF/PNG, etc). Caller handles those on its own path.
 *
 * Pure + exported so the MCP wrapper and tests can classify without a Drive
 * round-trip.
 */
const GOOGLE_EXPORTABLE_NATIVE = new Set([
    "application/vnd.google-apps.document",
    "application/vnd.google-apps.spreadsheet",
    "application/vnd.google-apps.presentation",
    "application/vnd.google-apps.drawing",
])

const OFFICE_CONVERTIBLE = new Set([
    // OOXML (modern)
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
    "application/vnd.openxmlformats-officedocument.presentationml.presentation", // .pptx
    // Legacy binary Office
    "application/msword", // .doc
    "application/vnd.ms-excel", // .xls
    "application/vnd.ms-powerpoint", // .ppt
])

export function driveSourceIsConvertible(
    mime: string | null | undefined,
): "export" | "copy" | null {
    const m = (mime ?? "").toLowerCase()
    if (GOOGLE_EXPORTABLE_NATIVE.has(m)) return "export"
    if (OFFICE_CONVERTIBLE.has(m)) return "copy"
    return null
}

/**
 * Pick the Google-native conversion target for an Office mime during
 * convert-on-copy. Word→Docs, Excel→Sheets, PowerPoint→Slides; default Docs.
 */
function copyTargetMimeFor(sourceMime: string): string {
    const m = sourceMime.toLowerCase()
    if (m.includes("spreadsheet") || m === "application/vnd.ms-excel")
        return "application/vnd.google-apps.spreadsheet"
    if (m.includes("presentation") || m === "application/vnd.ms-powerpoint")
        return "application/vnd.google-apps.presentation"
    return "application/vnd.google-apps.document"
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
                    // `size` added 2026-05-17 (cycle-2 DATA-001) so library_index
                    // can persist fileSize at sync time instead of leaving it
                    // null on 80% of Drive-synced rows.
                    fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, webContentLink, parents, shortcutDetails, size)',
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

    /**
     * Cycle-3 NEW-1 (drive-sync importer). Run a Drive `files.list` with a
     * caller-supplied query and field set. Used by `/api/cron/drive-sync`
     * to fetch files modified since `lastPollAt` across David's drop folder
     * + subfolders. Kept generic — query construction is the caller's job.
     */
    async listFilesByQuery(params: {
        q: string
        fields?: string
        pageSize?: number
        pageToken?: string
        orderBy?: string
    }): Promise<{
        files: Array<{
            id?: string
            name?: string
            mimeType?: string
            modifiedTime?: string
            parents?: string[]
            md5Checksum?: string
            size?: string | number
            appProperties?: Record<string, string>
        }>
        nextPageToken: string | null
    }> {
        try {
            const res = (await withRetry(() =>
                this.drive.files.list({
                    pageSize: params.pageSize ?? 100,
                    fields:
                        params.fields ??
                        "nextPageToken, files(id, name, mimeType, modifiedTime, parents, md5Checksum, size)",
                    q: params.q,
                    pageToken: params.pageToken,
                    supportsAllDrives: true,
                    includeItemsFromAllDrives: true,
                    orderBy: params.orderBy ?? "modifiedTime",
                }),
            )) as { data: { files?: unknown[]; nextPageToken?: string } }

            return {
                files: (res.data.files ?? []) as Array<{
                    id?: string
                    name?: string
                    mimeType?: string
                    modifiedTime?: string
                    parents?: string[]
                    md5Checksum?: string
                    size?: string | number
                    appProperties?: Record<string, string>
                }>,
                nextPageToken: res.data.nextPageToken ?? null,
            }
        } catch (error: unknown) {
            logger.error("[Drive] listFilesByQuery error:", error)
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

    /**
     * Cycle-5 C5C-006 — download a Drive file AND report the resolved target
     * mime alongside the bytes. Sibling to `getFile`; same Drive round-trips
     * (metadata + alt=media) but the caller learns what they actually got.
     *
     * Closes the "Lechu Goldman.pdf silently missing from every Friday gig
     * packet" bug: `library_index` stores `mimeType:
     * application/vnd.google-apps.shortcut` for shortcut-bonded rows, so
     * `fetchFileById`'s Drive fallback was reporting `contentType: shortcut`
     * even though `getFile` had transparently resolved the target's PDF
     * bytes. Gig-packet then routed the (real) PDF into the "Unsupported
     * content type" appendix branch instead of merging it.
     *
     * For non-shortcut files this returns the file's own `mimeType`. For
     * shortcuts it returns the TARGET's `mimeType` (from
     * `shortcutDetails.targetMimeType`, which Drive populates whenever
     * `shortcutDetails` is requested).
     */
    async getFileWithMime(fileId: string): Promise<{
        data: ArrayBuffer
        mimeType: string | null
        resolvedFileId: string
    }> {
        try {
            const meta = await withRetry(() => this.drive.files.get({
                fileId,
                // Explicit sub-field projection so shortcut callers always
                // get targetMimeType + targetId (Drive returns the full
                // shortcutDetails object when the parent field is asked for,
                // but be explicit so future field-pruning doesn't regress).
                fields: 'mimeType, shortcutDetails(targetId, targetMimeType)',
                supportsAllDrives: true,
            }))
            const metaData = meta.data as {
                mimeType?: string
                shortcutDetails?: { targetId?: string; targetMimeType?: string }
            }

            let downloadId = fileId
            let resolvedMime: string | null = metaData.mimeType ?? null
            if (metaData.mimeType === 'application/vnd.google-apps.shortcut') {
                const targetId = metaData.shortcutDetails?.targetId
                if (!targetId) throw new Error(`Drive shortcut ${fileId} has no targetId`)
                const targetMime = metaData.shortcutDetails?.targetMimeType ?? null
                // Cycle-6 C6C-008 defensive: Drive supports shortcut chains. We
                // follow exactly one hop. If the target is itself a shortcut
                // (targetMimeType reports shortcut), refuse rather than recurse
                // — callers (gig-packet, file proxy) surface this as a clear
                // missingCharts entry instead of silently dropping bytes or
                // crashing on a 403 from alt=media against a shortcut.
                if (targetMime === 'application/vnd.google-apps.shortcut') {
                    throw new Error(
                        `Drive shortcut chain exceeded max-depth-1 (${fileId} → ${targetId} → shortcut). ` +
                        `Re-bond the library row directly to the underlying chart fileId.`
                    )
                }
                logger.info(`[Drive] Resolving shortcut ${fileId} → ${targetId}`)
                downloadId = targetId
                resolvedMime = targetMime
            }

            const res = await withRetry(() => this.drive.files.get({
                fileId: downloadId,
                alt: 'media',
                supportsAllDrives: true,
                acknowledgeAbuse: true,
            }, {
                responseType: 'arraybuffer',
            } as { responseType: 'arraybuffer' }))

            return {
                data: res.data as ArrayBuffer,
                mimeType: resolvedMime,
                resolvedFileId: downloadId,
            }
        } catch (error: unknown) {
            logger.error(`[Drive] Error getting file ${fileId} with mime:`, error instanceof Error ? error.message : "Unknown error")
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

    /**
     * v11.3-02-01 — return PDF bytes for a server-side-convertible Drive
     * source so `import_chart_from_drive` can accept Google Docs and uploaded
     * Office files (David's BUG-cowork-chart-upload-2026-06-10 dead-end). Two
     * branches keyed off `driveSourceIsConvertible(sourceMime)`:
     *
     *   - `'export'` (native Google Workspace doc): delegate to `exportDoc`
     *     (files.export → PDF). No temp file created.
     *   - `'copy'` (uploaded .docx/.xlsx/.pptx + legacy): convert-on-copy —
     *     copy the source into a temporary Google doc (Drive performs the
     *     format conversion on copy), export THAT to PDF, then delete the temp
     *     in a `finally` (best-effort: a failed temp-delete logs but never
     *     throws, because the import already has its bytes).
     *
     * Throws if called with a mime the classifier returns null for — the
     * caller is expected to gate on `driveSourceIsConvertible` first.
     */
    async fetchAsPdf(fileId: string, sourceMime: string): Promise<ArrayBuffer> {
        const kind = driveSourceIsConvertible(sourceMime)
        if (kind === null) {
            throw new Error(
                `[Drive] fetchAsPdf called with non-convertible mime '${sourceMime}' for ${fileId}`,
            )
        }

        if (kind === "export") {
            return (await this.exportDoc(fileId, "application/pdf")) as ArrayBuffer
        }

        // kind === "copy": convert-on-copy through a temporary Google doc.
        let tempId: string | undefined
        try {
            const copied = await withRetry(() =>
                this.drive.files.copy({
                    fileId,
                    requestBody: {
                        name: `crc-tmp-convert-${fileId}`,
                        mimeType: copyTargetMimeFor(sourceMime),
                    },
                    fields: "id",
                    supportsAllDrives: true,
                }),
            ) as { data: { id?: string } }
            tempId = copied.data.id
            if (!tempId) {
                throw new Error(
                    `[Drive] convert-on-copy returned no temp id for ${fileId}`,
                )
            }
            return (await this.exportDoc(tempId, "application/pdf")) as ArrayBuffer
        } finally {
            if (tempId) {
                try {
                    await this.drive.files.delete({
                        fileId: tempId,
                        supportsAllDrives: true,
                    })
                } catch (delErr: unknown) {
                    logger.warn(
                        `[Drive] convert-on-copy temp cleanup failed for ${tempId} (non-fatal): ${
                            delErr instanceof Error ? delErr.message : delErr
                        }`,
                    )
                }
            }
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

    /**
     * storage-phase2 (Storage→Drive byte-mirror). Upload a **binary** file
     * (PDF / MusicXML / mp3) to Drive. `createFile` above passes a string
     * `body`, which corrupts binary content — this method streams the buffer
     * via `Readable.from(buffer)` so the bytes land intact.
     *
     * Returns `id` + `md5Checksum` + `size` so the backup cron can record the
     * pointer (`library_index.backupDriveId`) and verify the round-trip.
     *
     * `appProperties` lets the caller stamp `{ crcBackup: "1" }` so the
     * drive-sync importer can skip backup files (loop-avoidance defence in
     * depth; the dedicated backup folder is the primary guard).
     */
    async uploadBinaryFile(params: {
        name: string
        mimeType: string
        buffer: Buffer
        parents?: string[]
        appProperties?: Record<string, string>
    }): Promise<{ id?: string; name?: string; md5Checksum?: string; size?: string }> {
        try {
            const { name, mimeType, buffer, parents, appProperties } = params

            const fileMetadata: {
                name: string
                mimeType: string
                parents?: string[]
                appProperties?: Record<string, string>
            } = { name, mimeType }
            if (parents && parents.length > 0) fileMetadata.parents = parents
            if (appProperties) fileMetadata.appProperties = appProperties

            const res = await withRetry(() => this.drive.files.create({
                requestBody: fileMetadata,
                // Fresh stream per attempt: withRetry re-invokes this thunk, and
                // a Readable can only be consumed once — so build it here.
                media: { mimeType, body: Readable.from(buffer) },
                fields: 'id, name, md5Checksum, size',
                supportsAllDrives: true,
            })) as { data: { id?: string; name?: string; md5Checksum?: string; size?: string } }

            logger.info(`[Drive] Uploaded binary file: ${res.data.id} (${name})`)
            return res.data
        } catch (error: unknown) {
            logger.error(`[Drive] Binary upload error:`, error)
            throw error
        }
    }

    /**
     * storage-phase2. Replace the **media** of an existing Drive file
     * (`files.update`) — used when a chart was re-uploaded (Storage md5
     * advanced). Drive keeps the prior revision automatically, giving a free
     * versioning layer in the human-visible backup. Does NOT touch parents or
     * name (media-only update).
     */
    async updateFileMedia(
        fileId: string,
        buffer: Buffer,
        mimeType: string,
    ): Promise<{ id?: string; md5Checksum?: string; size?: string }> {
        try {
            const res = await withRetry(() => this.drive.files.update({
                fileId,
                media: { mimeType, body: Readable.from(buffer) },
                fields: 'id, md5Checksum, size',
                supportsAllDrives: true,
            })) as { data: { id?: string; md5Checksum?: string; size?: string } }

            logger.info(`[Drive] Updated media for file: ${fileId}`)
            return res.data
        } catch (error: unknown) {
            logger.error(`[Drive] Update media error for ${fileId}:`, error)
            throw error
        }
    }

    /**
     * storage-phase2. Find-or-create a subfolder by exact name under
     * `parentId`. Idempotent: returns the existing folder id if one already
     * exists (first match), else creates it. Used by the backup cron to build
     * the `charts/<collection>/` tree. Names are escaped for the Drive query.
     */
    async ensureFolder(params: { name: string; parentId: string }): Promise<string> {
        const { name, parentId } = params
        const safeName = sanitizeDriveQuery(name)
        try {
            const existing = await withRetry(() => this.drive.files.list({
                q: `'${parentId}' in parents and name = '${safeName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
                fields: 'files(id, name)',
                pageSize: 1,
                supportsAllDrives: true,
                includeItemsFromAllDrives: true,
            })) as { data: { files?: Array<{ id?: string }> } }

            const found = existing.data.files?.[0]?.id
            if (found) return found

            const created = await withRetry(() => this.drive.files.create({
                requestBody: {
                    name,
                    mimeType: 'application/vnd.google-apps.folder',
                    parents: [parentId],
                },
                fields: 'id',
                supportsAllDrives: true,
            })) as { data: { id?: string } }

            const newId = created.data.id
            if (!newId) throw new Error(`Drive folder create returned no id for "${name}"`)
            logger.info(`[Drive] Created backup subfolder "${name}" → ${newId}`)
            return newId
        } catch (error: unknown) {
            logger.error(`[Drive] ensureFolder error for "${name}" under ${parentId}:`, error)
            throw error
        }
    }
}
