import { NextRequest, NextResponse } from "next/server"
import { PrintRequest } from "@/lib/print-pipeline"
import { withAuth } from "@/lib/api-auth"
import { checkRateLimit } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"
import { inngest } from "@/inngest/client"
import { randomUUID } from "crypto"

export const maxDuration = 120

export async function POST(request: NextRequest) {
    try {
        // Auth
        const auth = await withAuth(request)
        if (auth instanceof NextResponse) return auth

        // Rate limit (API tier — PDF generation is CPU-intensive)
        const limited = await checkRateLimit(request, 'api')
        if (limited) return limited

        const body: PrintRequest = await request.json()
        const { title, tracks } = body

        if (!title || !tracks || tracks.length === 0) {
            return NextResponse.json({ error: "Missing title or tracks" }, { status: 400 })
        }

        const jobId = randomUUID()
        const uid = auth.uid // Extract the user ID from the successful auth context

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
    } catch (error: unknown) {
        logger.error("[Print] Generation dispatch error:", error)
        return NextResponse.json({ error: "Failed to start PDF generation" }, { status: 500 })
    }
}
