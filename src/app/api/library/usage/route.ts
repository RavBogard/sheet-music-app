import { NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/lib/api-auth"
import { checkRateLimit } from "@/lib/rate-limit"
import { getUsageSummaries } from "@/lib/song-usage"
import { logger } from "@/lib/logger"

/**
 * GET /api/library/usage?fileIds=abc,def,ghi
 *
 * Returns song usage summaries keyed by fileId.
 * Used by the library page to show "Last: Jan 31 · 4×" badges.
 */
export async function GET(request: NextRequest) {
    try {
        const auth = await withAuth(request)
        if (auth instanceof NextResponse) return auth

        const limited = await checkRateLimit(request, 'api')
        if (limited) return limited

        const fileIdsParam = request.nextUrl.searchParams.get('fileIds')
        if (!fileIdsParam) {
            return NextResponse.json({ error: 'fileIds parameter required' }, { status: 400 })
        }

        const fileIds = fileIdsParam.split(',').filter(id => id.trim().length > 0)
        if (fileIds.length === 0) {
            return NextResponse.json({})
        }

        // Cap at 100 to prevent abuse
        if (fileIds.length > 100) {
            return NextResponse.json({ error: 'Maximum 100 file IDs per request' }, { status: 400 })
        }

        const summaries = await getUsageSummaries(fileIds)

        // Convert Map to plain object for JSON response
        const result: Record<string, { lastUsedDate: string; totalUses: number; lastUsedSetlistName: string } | null> = {}
        for (const id of fileIds) {
            const summary = summaries.get(id)
            if (summary) {
                result[id] = {
                    lastUsedDate: summary.lastUsedDate instanceof Date
                        ? summary.lastUsedDate.toISOString()
                        : String(summary.lastUsedDate),
                    totalUses: summary.totalUses,
                    lastUsedSetlistName: summary.lastUsedSetlistName,
                }
            } else {
                result[id] = null
            }
        }

        return NextResponse.json(result)
    } catch (err) {
        logger.error('[API] Library usage error:', err)
        return NextResponse.json({ error: 'Failed to fetch usage data' }, { status: 500 })
    }
}
