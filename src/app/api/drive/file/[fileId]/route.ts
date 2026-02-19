import { NextRequest, NextResponse } from "next/server"
import { checkRateLimit } from "@/lib/rate-limit"

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // Allow up to 60s for large files from Drive

import { DriveClient } from "@/lib/google-drive"
import { downloadFromStorage, uploadToStorage } from "@/lib/firebase-storage"
import { logger } from "@/lib/logger"

function getAllowedOrigin(request: NextRequest): string {
    const origin = request.headers.get('origin') || ''
    if (
        origin.includes('centralreform.live') ||
        origin.includes('localhost') ||
        origin.includes('127.0.0.1') ||
        origin.endsWith('.vercel.app')
    ) {
        return origin
    }
    return 'https://centralreform.live'
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ fileId: string }> }
) {
    const limited = await checkRateLimit(request, 'api')
    if (limited) return limited

    const { fileId } = await params

    try {
        // 1. Try Firebase Storage first (fast, CDN-cached)
        try {
            const storageResult = await downloadFromStorage(fileId)
            if (storageResult) {
                return new NextResponse(new Uint8Array(storageResult.buffer), {
                    status: 200,
                    headers: {
                        'Access-Control-Allow-Origin': getAllowedOrigin(request),
                        'Cache-Control': 'public, max-age=86400, s-maxage=604800',
                        'Content-Type': storageResult.contentType,
                        'X-Served-From': 'firebase-storage',
                    }
                })
            }
        } catch (e) {
            logger.warn(`[FileProxy] Storage lookup failed for ${fileId}:`, e instanceof Error ? e.message : e)
        }

        // 2. Not in Storage — fetch from Google Drive
        const drive = new DriveClient()
        const metadata = await drive.getFileMetadata(fileId)

        let fileData: ArrayBuffer;
        let contentType = 'application/pdf';

        if (metadata.mimeType?.startsWith('application/vnd.google-apps.')) {
            // Google Doc/Sheet/Slide → Export as PDF
            fileData = await drive.exportDoc(fileId, 'application/pdf') as ArrayBuffer
        } else {
            // Native file (PDF, mp3, image) → download directly
            fileData = await drive.getFile(fileId) as ArrayBuffer
            contentType = metadata.mimeType || 'application/octet-stream'
        }

        const data = new Uint8Array(fileData)

        // 3. Cache-through: copy to Firebase Storage for next time
        //    Fire-and-forget — don't block the response
        uploadToStorage(fileId, Buffer.from(fileData), contentType).catch(e => {
            logger.warn(`[FileProxy] Cache-through upload failed for ${fileId}:`, e instanceof Error ? e.message : e)
        })

        return new NextResponse(data, {
            status: 200,
            headers: {
                'Access-Control-Allow-Origin': getAllowedOrigin(request),
                'Cache-Control': 'public, max-age=3600, s-maxage=86400',
                'Content-Type': contentType,
                'X-Served-From': 'google-drive',
            }
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        logger.error(`[FileProxy] Failed for ${fileId}:`, message)

        return NextResponse.json(
            { error: 'File unavailable', fileId, reason: message },
            {
                status: 502,
                headers: {
                    'Access-Control-Allow-Origin': getAllowedOrigin(request),
                    'Cache-Control': 'no-store',
                }
            }
        )
    }
}
