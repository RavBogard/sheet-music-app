import { NextResponse } from "next/server"
import { getT } from "@/i18n/server"
import { createApiHandler } from "@/lib/api-wrapper"
import { checkRateLimit } from "@/lib/rate-limit"
import { getUsageSummaries } from "@/lib/song-usage"

/**
 * GET /api/library/usage?fileIds=abc,def,ghi
 *
 * Returns song usage summaries keyed by fileId.
 * Used by the library page to show "Last: Jan 31 · 4×" badges.
 */
export const GET = createApiHandler(
    async (ctx) => {
        const limited = await checkRateLimit(ctx.req, 'api')
        if (limited) return limited

        const fileIdsParam = ctx.req.nextUrl.searchParams.get('fileIds')
        if (!fileIdsParam) {
            const t = await getT()
            return NextResponse.json({ error: t("api-library.fileIdsRequired") }, { status: 400 })
        }

        const fileIds = fileIdsParam.split(',').filter(id => id.trim().length > 0)
        if (fileIds.length === 0) {
            return NextResponse.json({})
        }

        // Cap at 100 to prevent abuse
        if (fileIds.length > 100) {
            const t = await getT()
            return NextResponse.json({ error: t("api-library.tooManyFileIds", { max: 100 }) }, { status: 400 })
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
    }
)
