import { NextResponse } from "next/server"
import { DriveClient } from "@/lib/google-drive"
import { createApiHandler } from "@/lib/api-wrapper"
import { checkRateLimit } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"
import { z } from "zod"

export const maxDuration = 30

const schema = z.object({
    fileIds: z.array(z.string()),
})

export const POST = createApiHandler(
    async (ctx) => {
        const limited = await checkRateLimit(ctx.req, 'api')
        if (limited) return limited

        const { fileIds } = ctx.body!

        if (fileIds.length === 0) {
            return NextResponse.json({ files: [] })
        }

        const drive = new DriveClient()

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
    },
    { schema }
)
