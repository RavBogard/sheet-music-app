import { google } from "googleapis"

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
                console.error("[Auth] Failed to parse GOOGLE_CREDENTIALS_JSON", e)
            }
        }

        // Option 2: Individual Vars (Fallback)
        if (!credentials) {
            credentials = {
                client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
                private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
            }
        }

        const auth = new google.auth.GoogleAuth({
            credentials,
            scopes: ['https://www.googleapis.com/auth/drive.readonly'],
        })

        this.drive = google.drive({ version: 'v3', auth })
    }

    async listAllFiles(folderId?: string) {
        let allFiles: any[] = []

        try {
            console.log(folderId ? `[Drive] Listing folder: ${folderId}` : `[Drive] Global Search (Shared with me)`)

            // If folderId is provided, search inside it. If not, search EVERYTHING (except folders)
            const q = folderId
                ? `'${folderId}' in parents and trashed = false`
                : `trashed = false and mimeType != 'application/vnd.google-apps.folder'`

            let nextPageToken: string | undefined = undefined;

            do {
                const res = await this.drive.files.list({
                    pageSize: 100,
                    fields: 'nextPageToken, files(id, name, mimeType, webContentLink, parents)',
                    q,
                    pageToken: nextPageToken,
                    supportsAllDrives: true,
                    includeItemsFromAllDrives: true
                }) as any

                if (res.data.files) {
                    allFiles.push(...res.data.files)
                }
                nextPageToken = res.data.nextPageToken
            } while (nextPageToken)

            // Recursion ONLY if we are in folder-mode
            if (folderId) {
                const folders = allFiles.filter(f => f.mimeType === 'application/vnd.google-apps.folder')
                if (folders.length > 0) {
                    console.log(`[Drive] Digging into ${folders.length} subfolders...`)
                    const subFolderResults = await Promise.all(
                        folders.map(folder => this.listAllFiles(folder.id))
                    )
                    subFolderResults.forEach(subFiles => allFiles.push(...subFiles))
                }
            }

            return allFiles
        } catch (error) {
            console.error(`[Drive] List Error:`, error)
            return allFiles
        }
    }

    async getFile(fileId: string) {
        try {
            const res = await this.drive.files.get({
                fileId,
                alt: 'media',
            }, {
                responseType: 'arraybuffer',
                supportsAllDrives: true
            } as any)

            return res.data
        } catch (error: any) {
            console.error(`[Drive] Error getting file ${fileId}:`, error.message)
            throw error
        }
    }

    async exportDoc(fileId: string) {
        try {
            const res = await this.drive.files.export({
                fileId,
                mimeType: 'text/plain',
            }, {
                responseType: 'arraybuffer', // Safest for binary/text mix
            } as any)

            // Convert buffer to string
            const buffer = Buffer.from(res.data as any)
            return buffer.toString('utf-8')
        } catch (error: any) {
            console.error(`[Drive] Error exporting doc ${fileId}:`, error.message)
            throw error
        }
    }
}
