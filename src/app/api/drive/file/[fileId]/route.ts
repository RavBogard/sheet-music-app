import { NextResponse } from "next/server"
import { DriveClient } from "@/lib/google-drive"

export async function GET(
    request: Request,
    { params }: { params: Promise<{ fileId: string }> }
) {
    // NO SESSION CHECK NEEDED - Public Read Access via Service Account

    try {
        const { fileId } = await params
        const drive = new DriveClient()

        const fileData = await drive.getFile(fileId)

        return new NextResponse(Buffer.from(fileData as any), {
            status: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=3600',
                // Default to octet-stream, browser will sniff PDF/XML usually
                'Content-Type': 'application/octet-stream'
            }
        })

    } catch (error) {
        console.error("Drive File Proxy Error:", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
