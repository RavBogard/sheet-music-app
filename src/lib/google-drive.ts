import { google } from "googleapis"

export class DriveClient {
    private drive

    constructor() {
        const auth = new google.auth.GoogleAuth({
            credentials: {
                client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
                private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
            },
            scopes: ['https://www.googleapis.com/auth/drive.readonly'],
        })

        this.drive = google.drive({ version: 'v3', auth })
    }

    async listAllFiles(folderId: string) {
        let allFiles: any[] = []

        try {
            console.log(`[Drive] Listing folder: ${folderId}`)

            // 1. Get files in CURRENT folder
            const q = `'${folderId}' in parents and trashed = false`

            let nextPageToken: string | undefined = undefined;

            do {
                const res = await this.drive.files.list({
                    pageSize: 100,
                    fields: 'nextPageToken, files(id, name, mimeType, webContentLink, parents)',
                    q,
                    pageToken: nextPageToken,
                    // CRITICAL FOR WORKSPACE / SHARED DRIVES
                    supportsAllDrives: true,
                    includeItemsFromAllDrives: true
                }) as any

                if (res.data.files) {
                    console.log(`[Drive] Found ${res.data.files.length} items in ${folderId}`)
                    allFiles.push(...res.data.files)
                }
                nextPageToken = res.data.nextPageToken
            } while (nextPageToken)

            // 2. Separate Folders and Files
            const folders = allFiles.filter(f => f.mimeType === 'application/vnd.google-apps.folder')
            const shortcuts = allFiles.filter(f => f.mimeType === 'application/vnd.google-apps.shortcut')

            // 3. Recursively fetch subfolders
            if (folders.length > 0) {
                console.log(`[Drive] Digging into ${folders.length} subfolders...`)
                const subFolderResults = await Promise.all(
                    folders.map(folder => this.listAllFiles(folder.id))
                )
                subFolderResults.forEach(subFiles => allFiles.push(...subFiles))
            }

            // 4. Resolve Shortcuts (If the user organized via shortcuts)
            // This is complex because we need the target ID.
            // For now, simpler to just log them.

            return allFiles
        } catch (error) {
            console.error(`[Drive] Error listing folder ${folderId}:`, error)
            return allFiles // Return partial results
        }
    }

    async getFile(fileId: string) {
        try {
            const res = await this.drive.files.get({
                fileId,
                alt: 'media',
            }, {
                responseType: 'arraybuffer',
                // Explicitly support shared drives for fetching too
                supportsAllDrives: true
            } as any)

            return res.data
        } catch (error: any) {
            // If it's a 404, it might be a Shared Drive issue or truly missing
            console.error(`[Drive] Error getting file ${fileId}:`, error.message)
            throw error
        }
    }
}
