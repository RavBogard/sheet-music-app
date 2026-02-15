import { NextResponse } from "next/server"

export const dynamic = 'force-dynamic'

import { DriveClient } from "@/lib/google-drive"
import { downloadFromStorage } from "@/lib/firebase-storage"

export async function GET(
    request: Request,
    { params }: { params: Promise<{ fileId: string }> }
) {
    // Public Access: We allow anyone with the file ID to proxy the file.
    // This supports the "Public Setlist" feature where users can listen/view without login.
    // Security is based on the obscurity of the fileId.

    try {
        const { fileId } = await params

        // 1. Try Firebase Storage first (fast, CDN-cached)
        const storageResult = await downloadFromStorage(fileId)
        if (storageResult) {
            return new NextResponse(storageResult.buffer, {
                status: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Cache-Control': 'public, max-age=86400, s-maxage=604800',
                    'Content-Type': storageResult.contentType,
                    'X-Served-From': 'firebase-storage',
                }
            })
        }

        // 2. Fall back to Google Drive (for un-migrated files)
        const drive = new DriveClient()
        const metadata = await drive.getFileMetadata(fileId)

        let fileData;
        let contentType = 'application/pdf';

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
                'Content-Type': contentType,
                'X-Served-From': 'google-drive',
            }
        })
    } catch (error) {
        console.error("File Proxy Error:", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
