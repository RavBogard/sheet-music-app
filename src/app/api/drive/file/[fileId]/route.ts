import { NextRequest, NextResponse } from "next/server"
import { checkRateLimit } from "@/lib/rate-limit"

export const dynamic = 'force-dynamic'

import { DriveClient } from "@/lib/google-drive"
import { downloadFromStorage } from "@/lib/firebase-storage"
import { logger } from "@/lib/logger"

function getAllowedOrigin(request: NextRequest): string {
    const origin = request.headers.get('origin') || ''
    // Allow app domain and local dev
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
    // Rate limit to prevent enumeration attacks
    const limited = await checkRateLimit(request, 'api')
    if (limited) return limited

    const { fileId } = await params

    try {
        // 1. Try Firebase Storage first (fast, CDN-cached)
        let storageError: string | null = null
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
            storageError = e instanceof Error ? e.message : String(e)
            logger.warn(`[FileProxy] Storage error for ${fileId}:`, storageError)
        }

        // 2. Fall back to Google Drive
        let driveError: string | null = null
        try {
            const drive = new DriveClient()
            const metadata = await drive.getFileMetadata(fileId)

            let fileData;
            let contentType = 'application/pdf';

            if (metadata.mimeType?.startsWith('application/vnd.google-apps.')) {
                fileData = await drive.exportDoc(fileId, 'application/pdf')
            } else {
                fileData = await drive.getFile(fileId)
                contentType = metadata.mimeType || 'application/octet-stream'
            }

            return new NextResponse(new Uint8Array(fileData as ArrayBuffer), {
                status: 200,
                headers: {
                    'Access-Control-Allow-Origin': getAllowedOrigin(request),
                    'Cache-Control': 'public, max-age=3600',
                    'Content-Type': contentType,
                    'X-Served-From': 'google-drive',
                }
            })
        } catch (e) {
            driveError = e instanceof Error ? e.message : String(e)
            logger.error(`[FileProxy] Drive error for ${fileId}:`, driveError)
        }

        // Both sources failed — return diagnostic error
        const reason = driveError || storageError || 'Unknown error'
        logger.error(`[FileProxy] All sources failed for ${fileId}: storage=${storageError}, drive=${driveError}`)

        return NextResponse.json(
            {
                error: 'File unavailable',
                fileId,
                reason,
                sources: {
                    storage: storageError || 'not found',
                    drive: driveError || 'not attempted',
                }
            },
            {
                status: 502,
                headers: {
                    'Access-Control-Allow-Origin': getAllowedOrigin(request),
                    'Cache-Control': 'no-store',
                }
            }
        )
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        logger.error(`[FileProxy] Unexpected error for ${fileId}:`, message)
        return NextResponse.json(
            { error: 'Internal error', fileId, reason: message },
            { status: 500 }
        )
    }
}
