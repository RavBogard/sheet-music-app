import { google } from "googleapis"

export class DriveClient {
    private drive

    constructor(accessToken: string) {
        const auth = new google.auth.OAuth2()
        auth.setCredentials({ access_token: accessToken })

        this.drive = google.drive({ version: 'v3', auth })
    }

    async listFiles(folderId?: string) {
        try {
            // Query for PDF, XML, Folder, AND Excel files.
            // If folderId is provided, restrict search to parents = 'folderId'
            const mimeTypes = [
                "application/pdf",
                "application/xml",
                "text/xml",
                "application/vnd.google-apps.folder",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "application/vnd.google-apps.spreadsheet"
            ]

            const typeQuery = mimeTypes.map(t => `mimeType = '${t}'`).join(' or ')
            let q = `(${typeQuery}) and trashed = false`

            if (folderId) {
                q += ` and '${folderId}' in parents`
            }

            const res = await this.drive.files.list({
                pageSize: 100, // Increased page size
                fields: 'nextPageToken, files(id, name, mimeType, webContentLink, thumbnailLink)',
                q,
                orderBy: 'folder, name'
            })

            return res.data.files || []
        } catch (error) {
            console.error("Error listing files:", error)
            throw error
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
