import { google } from "googleapis"

export class DriveClient {
    private drive

    constructor() {
        // Use Service Account from Env Vars
        const auth = new google.auth.GoogleAuth({
            credentials: {
                client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
                private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
            },
            scopes: ['https://www.googleapis.com/auth/drive.readonly'],
        })

        this.drive = google.drive({ version: 'v3', auth })
    }

    // Recursive function to get ALL files in specific folder
    async listAllFiles(folderId: string) {
        let allFiles: any[] = []

        try {
            // 1. Get files in CURRENT folder
            const q = `'${folderId}' in parents and trashed = false`

            let nextPageToken: string | undefined = undefined;

            do {
                const res = await this.drive.files.list({
                    pageSize: 100,
                    fields: 'nextPageToken, files(id, name, mimeType, webContentLink, parents)',
                    q,
                    pageToken: nextPageToken
                }) as any

                if (res.data.files) {
                    allFiles.push(...res.data.files)
                }
                nextPageToken = res.data.nextPageToken
            } while (nextPageToken)

            // 2. Separate Folders and Files
            const folders = allFiles.filter(f => f.mimeType === 'application/vnd.google-apps.folder')
            const files = allFiles.filter(f => f.mimeType !== 'application/vnd.google-apps.folder')

            // 3. Recursively fetch subfolders
            if (folders.length > 0) {
                console.log(`Found ${folders.length} subfolders in ${folderId}, digging deeper...`)
                const subFolderResults = await Promise.all(
                    folders.map(folder => this.listAllFiles(folder.id))
                )

                subFolderResults.forEach(subFiles => {
                    files.push(...subFiles)
                })
            }

            return files
        } catch (error) {
            console.error(`Error listing folder ${folderId}:`, error)
            // Return whatever we found so far, don't crash everything
            return allFiles.filter(f => f.mimeType !== 'application/vnd.google-apps.folder')
        }
    }

    async getFile(fileId: string) {
        try {
            const res = await this.drive.files.get({
                fileId,
                alt: 'media',
            }, { responseType: 'arraybuffer' })

            return res.data
        } catch (error) {
            console.error("Error getting file:", error)
            throw error
        }
    }
}
