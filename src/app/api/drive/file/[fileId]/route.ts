import { NextResponse } from "next/server"
import { DriveClient } from "@/lib/google-drive"

export async function GET(
    request: Request,
    { params }: { params: Promise<{ fileId: string }> }
) {
    try {
        const { fileId } = await params
        const drive = new DriveClient()

        // getFile in DriveClient handles supportsAllDrives and Auth
        const fileData = await drive.getFile(fileId)

        return new NextResponse(Buffer.from(fileData as any), {
            status: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=3600',
                'Content-Type': 'application/octet-stream'
            }
        })
    } catch (error) {
        console.error("Drive File Proxy Error:", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
