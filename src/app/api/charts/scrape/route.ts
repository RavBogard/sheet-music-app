import { NextResponse } from "next/server"
import { scrapeChart, type ScrapeChartErrorCode } from "@/lib/chart-scrape"
import { getT } from "@/i18n/server"

/**
 * POST /api/charts/scrape
 *
 * Accepts `{ url?, rawText? }` and returns `{ title, artist, content }` —
 * Gemini-extracted chord chart with monospace-preserved spacing.
 *
 * Implementation lives in @/lib/chart-scrape so the MCP scrape_chart_from_url
 * tool can call the same logic without an internal HTTP hop.
 */
export const maxDuration = 60

// Phase 7: the lib's error codes, worded in the request's language (English identical).
const SCRAPE_ERROR_KEY: Record<ScrapeChartErrorCode, string> = {
    fetch_status: "api-charts.scrapeFetchStatus",
    fetch_failed: "api-charts.scrapeFetchFailed",
    input_required: "api-charts.scrapeInputRequired",
    no_chart: "api-charts.scrapeNoChart",
    scrape_failed: "api-charts.scrapeFailed",
}

export async function POST(request: Request) {
    let body: { url?: string; rawText?: string }
    try {
        body = await request.json()
    } catch {
        const t = await getT()
        return NextResponse.json({ error: t("api-charts.invalidJsonBody") }, { status: 400 })
    }

    const result = await scrapeChart(body)
    if (!result.ok) {
        const t = await getT()
        return NextResponse.json({ error: t(SCRAPE_ERROR_KEY[result.code], { detail: result.detail ?? "" }) }, { status: result.status })
    }
    return NextResponse.json({
        title: result.title,
        artist: result.artist,
        content: result.content,
    })
}
