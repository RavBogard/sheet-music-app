import { NextRequest, NextResponse } from "next/server"
import { DriveClient } from "@/lib/google-drive"
import { withAuth } from "@/lib/api-auth"
import { checkRateLimit } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"

export async function POST(request: NextRequest) {
    try {
        // Auth
        const auth = await withAuth(request)
        if (auth instanceof NextResponse) return auth

        // Rate limit
        const limited = await checkRateLimit(request, 'api')
        if (limited) return limited

        const { fileIds } = await request.json()

        if (!Array.isArray(fileIds) || fileIds.length === 0) {
            return NextResponse.json({ files: [] })
        }

        const drive = new DriveClient()

        // Fetch metadata for each file
        const metadataPromises = fileIds.map(async (id) => {
            try {
                const file = await drive.getFileMetadata(id)
                return {
                    id: file.id,
                    name: file.name,
                    mimeType: file.mimeType
                }
            } catch (e) {
                logger.warn(`Failed to fetch metadata for ${id}`, e)
                return null
            }
        })

        const results = await Promise.all(metadataPromises)
        const files = results.filter(f => f !== null)

        return NextResponse.json({ files })
    } catch (error) {
        logger.error("Metadata fetch error:", error)
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
    }
}
