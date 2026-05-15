import { NextResponse } from "next/server"
import { scrapeChart } from "@/lib/chart-scrape"

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

export async function POST(request: Request) {
    let body: { url?: string; rawText?: string }
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const result = await scrapeChart(body)
    if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json({
        title: result.title,
        artist: result.artist,
        content: result.content,
    })
}
