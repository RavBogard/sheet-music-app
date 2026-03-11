import { NextResponse } from "next/server"
import { preExtractChords } from "@/lib/print-pipeline"
import { createApiHandler } from "@/lib/api-wrapper"
import { checkRateLimit } from "@/lib/rate-limit"
import { z } from "zod"

export const maxDuration = 120

const schema = z.object({
    fileIds: z.array(z.string()).min(1),
})

/**
 * POST /api/setlist/print/prepare
 * Pre-extract chords for all files in a setlist to warm the cache.
 * Called when a setlist is opened so print is fast later.
 * Body: { fileIds: string[] }
 */
export const POST = createApiHandler(
    async (ctx) => {
        const limited = await checkRateLimit(ctx.req, 'api')
        if (limited) return limited

        const { fileIds } = ctx.body!

        // Limit to 30 files per request to stay within timeout
        const capped = fileIds.filter(Boolean).slice(0, 30)

        const result = await preExtractChords(capped)

        return NextResponse.json({
            success: true,
            ...result,
        })
    },
    { schema }
)
