import { NextResponse } from "next/server"
import { generatePrintPdf, PrintRequest } from "@/lib/print-pipeline"
import { createApiHandler } from "@/lib/api-wrapper"
import { checkRateLimit } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"
import { z } from "zod"

export const maxDuration = 120

const schema = z.object({
    title: z.string().min(1),
    tracks: z.array(z.any()).min(1),
}).passthrough()

export const POST = createApiHandler(
    async (ctx) => {
        const limited = await checkRateLimit(ctx.req, 'api')
        if (limited) return limited

        const body = ctx.body! as unknown as PrintRequest

        const result = await generatePrintPdf(body)
        const filename = `${(body.title || 'Gig_Packet').replace(/[^a-z0-9]/gi, '_')}.pdf`

        logger.info(`[Print] Generated: ${result.stats.appendedTracks} tracks, ${result.stats.transposedTracks} transposed`)

        return new NextResponse(Buffer.from(result.pdf), {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${filename}"`,
            },
        })
    },
    { schema }
)
