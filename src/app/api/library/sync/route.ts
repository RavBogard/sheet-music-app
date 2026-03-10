import { NextResponse } from "next/server"
import { syncLibraryIndex } from "@/lib/sync-engine"
import { createApiHandler } from "@/lib/api-wrapper"
import { checkRateLimit } from "@/lib/rate-limit"

export const maxDuration = 300

export const POST = createApiHandler(
    async (ctx) => {
        // Rate limit: 3 syncs/min
        const limited = await checkRateLimit(ctx.req, 'sync')
        if (limited) return limited

        const stats = await syncLibraryIndex()

        return NextResponse.json({ success: true, stats })
    },
    { role: 'admin' }
)
