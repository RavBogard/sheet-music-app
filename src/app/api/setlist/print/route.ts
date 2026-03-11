import { NextResponse } from "next/server"
import { PrintRequest } from "@/lib/print-pipeline"
import { createApiHandler } from "@/lib/api-wrapper"
import { checkRateLimit } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"
import { inngest } from "@/inngest/client"
import { randomUUID } from "crypto"
import { z } from "zod"

export const maxDuration = 120

const schema = z.object({
    title: z.string().min(1),
    tracks: z.array(z.any()).min(1),
}).passthrough()

export const POST = createApiHandler(
    async (ctx) => {
        // Rate limit (API tier — PDF generation is CPU-intensive)
        const limited = await checkRateLimit(ctx.req, 'api')
        if (limited) return limited

        const body = ctx.body! as unknown as PrintRequest

        const jobId = randomUUID()
        const uid = ctx.auth.uid

        await inngest.send({
            name: "pdf/generate",
            data: {
                jobId,
                uid,
                printReq: body
            }
        })

        logger.info(`[Print] Dispatched background generation job: ${jobId}`)

        return NextResponse.json({ jobId })
    },
    { schema }
)
