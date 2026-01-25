import { NextResponse } from "next/server"
import { DriveClient } from "@/lib/google-drive"

export async function GET(
    request: Request,
    { params }: { params: Promise<{ fileId: string }> }
) {
    try {
        const { fileId } = await params
        const drive = new DriveClient()

        // Export Doc logic
        const textContent = await drive.exportDoc(fileId)

        return new NextResponse(String(textContent), {
            status: 200,
            headers: {
                'Content-Type': 'text/plain; charset=utf-8'
            }
        })
    } catch (error) {
        console.error("Drive Doc Export Error:", error)
        return new NextResponse("Failed to export doc", { status: 500 })
    }
}
