import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { DriveClient } from "@/lib/google-drive"

export async function GET(
    request: Request,
    { params }: { params: Promise<{ fileId: string }> }
) {
    const session = await getServerSession(authOptions)

    if (!session || !session.accessToken) {
        return new NextResponse("Unauthorized", { status: 401 })
    }

    try {
        const { fileId } = await params
        const drive = new DriveClient(session.accessToken as string)

        // Get file metadata to set content type
        // We need a new method in DriveClient or just fetch it here.
        // Ideally DriveClient should handle this. Let's assume getFile returns the buffer + type, 
        // or we just return the stream.
        // For now, let's just return the buffer.

        const fileData = await drive.getFile(fileId)

        // We'll treat it as a generic binary stream or try to guess type.
        // For specialized handling, we might want to pass headers.

        return new NextResponse(null, {
            status: 200,
            // @ts-ignore - node buffer compatible
            headers: {
                'Content-Type': 'application/octet-stream', // Client can sniff or we can fetch metadata first
            }
        })

        // Note: getFile in google-drive.ts currently returns `res.data` which is ArrayBuffer or similar.
        // We need to actually send that back.

        return new NextResponse(Buffer.from(fileData as any), {
            status: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=3600'
            }
        })

    } catch (error) {
        console.error("Drive File Proxy Error:", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
