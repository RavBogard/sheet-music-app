import { NextResponse } from "next/server"
import { DriveClient } from "@/lib/google-drive"

export async function GET(request: Request) {
    // NO SESSION CHECK NEEDED (Public Kiosk Mode)
    // The Service Account has access, and we trust the Env Vars.

    try {
        const { searchParams } = new URL(request.url)
        const folderId = searchParams.get('folderId')

        if (!folderId) {
            return new NextResponse("Missing folderId", { status: 400 })
        }

        const drive = new DriveClient()
        // Use listAllFiles for recursive search
        const files = await drive.listAllFiles(folderId)

        return NextResponse.json(files)
    } catch (error) {
        console.error("Drive API Error:", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
