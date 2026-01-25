import { NextResponse } from "next/server"
import { DriveClient } from "@/lib/google-drive"

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const folderId = searchParams.get('folderId')

        if (!folderId) {
            return new NextResponse(JSON.stringify({ error: "Missing folderId configuration" }), { status: 400 })
        }

        const drive = new DriveClient()

        // 1. Debug Access Check: Is the folder even visible?
        try {
            // Just try to get metadata of the folder
            // We can't use getFile('media') on a folder, so we use list or get metadata
            // Let's just try listing it. checking if we fail immediately.
        } catch (e) {
            console.error("Setup Check Failed", e)
        }

        // 2. Recursive Search
        console.log(`Starting recursive search for folder: ${folderId}`)
        const files = await drive.listAllFiles(folderId)
        console.log(`Found ${files.length} total files`)

        return NextResponse.json(files)
    } catch (error) {
        console.error("Drive API Error:", error)
        return new NextResponse(JSON.stringify({ error: "Internal Server Error", details: String(error) }), { status: 500 })
    }
}
