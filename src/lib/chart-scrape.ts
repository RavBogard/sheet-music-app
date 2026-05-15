import { geminiFlash, geminiFlashWithSearch } from "@/lib/gemini"
import { logger } from "@/lib/logger"

/**
 * Shared chord-chart scraper. Wraps the body of POST /api/charts/scrape so the
 * HTTP route and the MCP scrape_chart_from_url tool share one codepath.
 *
 * Two modes:
 *   1. URL — fetch the page; if it's Cloudflare-blocked or short, fall back to
 *      Gemini-with-search to extract the chart from the URL semantically.
 *   2. rawText — Gemini parses the supplied HTML/text directly.
 *
 * Returns the extracted {title, artist, content} verbatim from Gemini.
 */

export interface ScrapeChartInput {
    url?: string
    rawText?: string
}

export interface ScrapeChartOk {
    ok: true
    title: string
    artist: string
    content: string
}

export interface ScrapeChartError {
    ok: false
    status: number
    error: string
}

export type ScrapeChartResult = ScrapeChartOk | ScrapeChartError

const USER_AGENT =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

export async function scrapeChart(
    input: ScrapeChartInput,
): Promise<ScrapeChartResult> {
    let contentToParse: string | undefined = input.rawText
    let useGeminiFallback = false

    if (input.url) {
        try {
            const response = await fetch(input.url, {
                headers: {
                    "User-Agent": USER_AGENT,
                    Accept:
                        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
                    "Accept-Language": "en-US,en;q=0.9",
                },
            })
            if (!response.ok) {
                if (response.status === 403 || response.status === 401) {
                    logger.info(
                        "[ChartScrape] Cloudflare block detected, falling back to Gemini search",
                    )
                    useGeminiFallback = true
                } else {
                    return {
                        ok: false,
                        status: 502,
                        error: `Failed to fetch URL: ${response.statusText}`,
                    }
                }
            } else {
                const html = await response.text()
                if (
                    html.length < 5000 &&
                    html.toLowerCase().includes("cloudflare")
                ) {
                    logger.info(
                        "[ChartScrape] Cloudflare JS block detected, falling back to Gemini search",
                    )
                    useGeminiFallback = true
                } else {
                    contentToParse = html
                }
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : "Unknown error"
            return { ok: false, status: 502, error: `Fetch failed: ${message}` }
        }
    }

    if (!contentToParse && !useGeminiFallback) {
        return {
            ok: false,
            status: 400,
            error: "url or rawText is required",
        }
    }

    let prompt: string
    let model: ReturnType<typeof geminiFlash>

    if (useGeminiFallback && input.url) {
        model = geminiFlashWithSearch()
        prompt = `Use your Google Search tool to extract the chords from this exact URL: ${input.url}.
Your task is to:
1. Identify the Song Title.
2. Identify the Artist.
3. Extract the actual lyrics and chords in plain text.
   - You MUST preserve the exact monospaced spacing and relative alignment of the chords above the lyrics.
   - Do NOT include any ads, sidebars, comments, or unnecessary metadata.

Respond ONLY with a JSON object in the following format. Do not include markdown code blocks (like \`\`\`json), just the raw JSON object:
{
  "title": "Song Title",
  "artist": "Artist Name",
  "content": "Line 1\\nLine 2\\n..."
}`
    } else {
        model = geminiFlash()
        prompt = `You are a music chord extraction tool. I will provide you with the raw HTML or raw text of a webpage that contains a chord chart.

Your task is to:
1. Identify the Song Title.
2. Identify the Artist.
3. Extract the actual lyrics and chords.
   - You MUST preserve the exact monospaced spacing and relative alignment of the chords above the lyrics.
   - Do NOT include any ads, sidebars, comments, or unnecessary metadata. Just the song structure (verses, choruses, intro) with chords.
   - Output the raw text of the chart exactly as it should look in a monospaced font.

Respond ONLY with a JSON object in the following format. Do not include markdown code blocks (like \`\`\`json), just the raw JSON object:
{
  "title": "Song Title",
  "artist": "Artist Name",
  "content": "Line 1\\nLine 2\\n..."
}

Here is the content (truncated if necessary):
${(contentToParse ?? "").slice(0, 100000)}`
    }

    try {
        const result = await model.generateContent(prompt)
        const text = result.response.text()
        let jsonString = text.trim()
        if (jsonString.startsWith("```")) {
            const match = jsonString.match(/```(?:json)?\n([\s\S]*?)\n```/)
            if (match) {
                jsonString = match[1]
            } else {
                jsonString = jsonString
                    .replace(/^```json\n?/, "")
                    .replace(/\n?```$/, "")
            }
        }
        const parsed = JSON.parse(jsonString) as Record<string, unknown>
        const title = typeof parsed.title === "string" ? parsed.title : ""
        const artist = typeof parsed.artist === "string" ? parsed.artist : ""
        const content = typeof parsed.content === "string" ? parsed.content : ""
        return { ok: true, title, artist, content }
    } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error"
        logger.error("[ChartScrape] Gemini extraction failed:", message)
        return {
            ok: false,
            status: 500,
            error: `Failed to scrape chart: ${message}`,
        }
    }
}
