import { NextResponse } from "next/server"
import { google } from "googleapis"

export async function GET() {
    const results: any = {}

    // 1. Check Env Vars
    results.env = {
        hasEmail: !!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        hasKey: !!process.env.GOOGLE_PRIVATE_KEY,
        keyLength: process.env.GOOGLE_PRIVATE_KEY?.length || 0,
        keyHasHeader: process.env.GOOGLE_PRIVATE_KEY?.includes('BEGIN PRIVATE KEY'),
        keyHasNewlines: process.env.GOOGLE_PRIVATE_KEY?.includes('\n')
    }

    // 2. Auth Test
    try {
        const auth = new google.auth.GoogleAuth({
            credentials: {
                client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
                private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
            },
            scopes: ['https://www.googleapis.com/auth/drive.readonly'],
        })
        const client = await auth.getClient()
        results.auth = "Success: Client created"

        // 3. API Capability Test
        const drive = google.drive({ version: 'v3', auth })

        // Test A: List *Anything* (Root query)
        const rootList = await drive.files.list({
            pageSize: 5,
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
            q: "trashed = false" // Just get first 5 files it can see anywhere
        })
        results.rootListCount = rootList.data.files?.length || 0
        results.visibleFiles = rootList.data.files?.map(f => ({ id: f.id, name: f.name }))

        // Test B: Specific Folder ID
        const FOLDER_ID = "1p-iGMt8OCpCJtk0eOn0mJL3aoNPcGUaK"
        try {
            const folderCheck = await drive.files.get({
                fileId: FOLDER_ID,
                supportsAllDrives: true
            })
            results.masterFolderAccess = "Success"
            results.masterFolder = folderCheck.data.name
        } catch (e: any) {
            results.masterFolderAccess = `Failed: ${e.message}`
        }

    } catch (e: any) {
        results.auth = `Failed: ${e.message}`
    }

    return NextResponse.json(results, { status: 200 })
}
