import { NextRequest, NextResponse } from "next/server"
import { preExtractChords } from "@/lib/print-pipeline"
import { withAuth } from "@/lib/api-auth"
import { logger } from "@/lib/logger"

export const maxDuration = 120

/**
 * POST /api/setlist/print/prepare
 * Pre-extract chords for all files in a setlist to warm the cache.
 * Called when a setlist is opened so print is fast later.
 * Body: { fileIds: string[] }
 */
export async function POST(req: NextRequest) {
    try {
        const auth = await withAuth(req)
        if (auth instanceof NextResponse) return auth

        const { fileIds } = await req.json()

        if (!Array.isArray(fileIds) || fileIds.length === 0) {
            return NextResponse.json({ error: "Missing fileIds" }, { status: 400 })
        }

        // Limit to 30 files per request to stay within timeout
        const limited = fileIds.filter(Boolean).slice(0, 30)

        const result = await preExtractChords(limited)

        return NextResponse.json({
            success: true,
            ...result,
        })
    } catch (error: unknown) {
        logger.error("[Prepare] Error:", error)
        return NextResponse.json({ error: "Pre-extraction failed" }, { status: 500 })
    }
}
