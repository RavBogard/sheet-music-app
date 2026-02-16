import { NextRequest, NextResponse } from "next/server"
import { syncLibraryIndex } from "@/lib/sync-engine"
import { withAuth } from "@/lib/api-auth"
import { logger } from "@/lib/logger"

export const maxDuration = 300

export async function POST(req: NextRequest) {
    try {
        const auth = await withAuth(req, 'admin')
        if (auth instanceof NextResponse) return auth

        const stats = await syncLibraryIndex()

        return NextResponse.json({ success: true, stats })
    } catch (error: unknown) {
        logger.error("Sync API Error:", error)
        return NextResponse.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 })
    }
}
