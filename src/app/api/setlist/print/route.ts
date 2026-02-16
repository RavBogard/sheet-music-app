import { NextResponse } from "next/server"
import { generatePrintPdf, PrintRequest } from "@/lib/print-pipeline"
import { logger } from "@/lib/logger"

export const maxDuration = 120

export async function POST(request: Request) {
    try {
        const body: PrintRequest = await request.json()
        const { title, tracks } = body

        if (!title || !tracks || tracks.length === 0) {
            return NextResponse.json({ error: "Missing title or tracks" }, { status: 400 })
        }

        const result = await generatePrintPdf(body)

        logger.info(`[Print] ${result.stats.fromResultCache ? 'FROM CACHE' : 'Generated'}: ${result.stats.appendedTracks} files, ${result.stats.transposedTracks} transposed, ${result.stats.cacheHits} chord cache hits`)

        return new NextResponse(Buffer.from(result.pdf), {
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `attachment; filename="${title.replace(/[^a-z0-9]/gi, "_")}.pdf"`,
                "X-Print-Stats": JSON.stringify(result.stats),
            },
        })
    } catch (error: unknown) {
        logger.error("[Print] Generation error:", error)
        return NextResponse.json({ error: "Failed to generate PDF" }, { status: 500 })
    }
}
