import { NextResponse } from "next/server"

export const dynamic = 'force-dynamic'

import { DriveClient } from "@/lib/google-drive"

import { verifyIdToken } from "@/lib/firebase-admin"

export async function GET(
    request: Request,
    { params }: { params: Promise<{ fileId: string }> }
) {
    // Public Access: We allow anyone with the file ID to proxy the file.
    // This supports the "Public Setlist" feature where users can listen/view without login.
    // Security is based on the obscurity of the fileId.

    try {
        const { fileId } = await params
        const drive = new DriveClient()
        // Check metadata first to see if we need to export (Google Doc) or download (Binary)
        const metadata = await drive.getFileMetadata(fileId)

        let fileData;
        let contentType = 'application/pdf'; // Default for our use case (rendering sheet music)

        if (metadata.mimeType?.startsWith('application/vnd.google-apps.')) {
            // It's a Google Doc/Sheet/Slide -> Export as PDF
            fileData = await drive.exportDoc(fileId, 'application/pdf')
        } else {
            // It's a regular file (PDF, Image, mp3) -> Download directly
            fileData = await drive.getFile(fileId)
            contentType = metadata.mimeType || 'application/octet-stream'
        }

        return new NextResponse(Buffer.from(fileData as any), {
            status: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=3600',
                'Content-Type': contentType
            }
        })
    } catch (error) {
        console.error("Drive File Proxy Error:", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
