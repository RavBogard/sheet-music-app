import { google } from "googleapis"

export class DriveClient {
    private drive

    constructor(accessToken: string) {
        const auth = new google.auth.OAuth2()
        auth.setCredentials({ access_token: accessToken })

        this.drive = google.drive({ version: 'v3', auth })
    }

    async listFiles(query?: string) {
        try {
            // Basic query to find PDF and XML files, excluding trash
            const q = query || "(mimeType = 'application/pdf' or mimeType = 'application/xml' or mimeType = 'text/xml' or mimeType = 'application/vnd.google-apps.folder') and trashed = false"

            const res = await this.drive.files.list({
                pageSize: 50,
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
