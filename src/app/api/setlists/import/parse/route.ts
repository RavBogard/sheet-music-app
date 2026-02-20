import { NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/lib/api-auth"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { checkRateLimit } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"
import { levenshteinDistance } from "@/lib/string-utils"
import { geminiFlash } from "@/lib/gemini"
import Papa from "papaparse"

interface ParsedItem {
    type: string
    title?: string
    key?: string
    chartUrl?: string
    performer?: string
    referenceLink?: string
    chartError?: string
    libraryMatchId?: string
    libraryMatchName?: string
    similarityScore?: number
}

export async function POST(req: NextRequest) {
    try {
        const limited = await checkRateLimit(req, 'upload')
        if (limited) return limited

        // Strict access control: only band leaders and admins should import whole setlists
        const auth = await withAuth(req, 'band_leader')
        if (auth instanceof NextResponse) return auth

        const body = await req.json()
        const { url, csvText } = body

        if (!url && !csvText) {
            return NextResponse.json({ error: "Missing 'url' or 'csvText' in request body." }, { status: 400 })
        }

        let rawCsv = csvText

        // 1. Fetch CSV if URL provided
        if (url) {
            let fetchUrl = url
            // Convert Google Sheets URL to CSV export if applicable
            if (url.includes("docs.google.com/spreadsheets")) {
                const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/)
                if (match) {
                    fetchUrl = `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv`
                }
            }

            try {
                const res = await fetch(fetchUrl)
                if (!res.ok) {
                    throw new Error(`Failed to fetch URL: ${res.statusText}`)
                }
                rawCsv = await res.text()
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : "Unknown error fetching sheet."
                return NextResponse.json({ error: `Could not retrieve spreadsheet data. Make sure the Google Sheet is set to "Anyone with the link can view". (${msg})` }, { status: 400 })
            }
        }

        // 2. Parse CSV to ensure it's not astronomically large
        const parsed = Papa.parse(rawCsv, { header: true, skipEmptyLines: true })
        if (parsed.data.length === 0) {
            return NextResponse.json({ error: "Spreadsheet appears to be empty." }, { status: 400 })
        }
        if (parsed.data.length > 200) {
            return NextResponse.json({ error: "Spreadsheet is too large (max 200 rows)." }, { status: 400 })
        }

        // Convert the parsed data back to a clean JSON string context for OpenAI
        const contextStr = JSON.stringify(parsed.data, null, 2)

        // 3. Prompt Gemini for strictly typed extraction
        const prompt = `You are an expert musical setlist parser. Your job is to take a raw JSON array representing rows from a spreadsheet and extract a clean list of setlist items.
                    
Return a JSON object with a single root key 'items' containing an array of objects.
Each item must have a 'type' of either "header" or "song".

Rules for "header" items:
- Represents a structural section (e.g. "Pre service", "Awakening", "Torah Service").
- Set 'title' to the header name. All other fields should be null.

Rules for "song" items:
- Identify if a row is a song/tune/prayer.
- Set 'title' to the primary name of the song.
- Set 'key' to the musical key if listed (e.g. Dm, E minor, F). Normalize capitalization if you can (e.g., "D minor" -> "Dm").
- Set 'chartUrl' to any Google Drive link or PDF URL found in the row.
- Set 'performer' to the lead vocalist/musician if indicated.
- Set 'referenceLink' to any YouTube/Spotify links found in the row.
- Ignore blank/empty rows.

Make educated guesses on column mapping based on standard terms.

Here is the JSON array:
${contextStr}`

        const resultObj = await geminiFlash.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
                responseMimeType: "application/json",
                temperature: 0.1,
            }
        })

        const content = resultObj.response.text()
        if (!content) throw new Error("No content from Gemini")

        const result = JSON.parse(content)
        const items = result.items || []

        // 4. Run extracted items against the library using Levenshtein distance
        initAdmin()
        const db = getFirestore()

        let existingLibrary: { id: string, name: string, normalizedName: string }[] = []
        try {
            const librarySnapshot = await db.collection('library_index')
                .where('status', '==', 'active')
                .select('name')
                .get()

            existingLibrary = librarySnapshot.docs.map((doc: FirebaseFirestore.DocumentData) => ({
                id: doc.id,
                name: doc.data().name,
                normalizedName: doc.data().name.toLowerCase().replace(/[^a-z0-9]/g, '')
            }))
        } catch (err) {
            logger.warn("Could not fetch library_index for importer matching", err)
        }

        const processedItems = await Promise.all(items.map(async (item: ParsedItem) => {
            if (item.type !== 'song') return item

            // Default response structure
            const out = { ...item }

            // Check Chart Drive Link Permissions
            if (out.chartUrl && out.chartUrl.includes('drive.google.com')) {
                try {
                    // Fast HEAD request to check permissions
                    const driveRes = await fetch(out.chartUrl, { method: 'HEAD' })
                    // If it redirects to an accounts.google.com signin, it's private
                    if (driveRes.url.includes('accounts.google.com') || driveRes.status === 403 || driveRes.status === 401) {
                        out.chartError = "Private Link"
                    }
                } catch {
                    out.chartError = "Invalid Link"
                }
            }

            // Fuzzy Match to Library
            if (out.title) {
                const normalizedNewTitle = out.title.toLowerCase().replace(/[^a-z0-9]/g, '')

                let bestMatch = null
                let bestSimilarity = 0

                for (const existing of existingLibrary) {
                    if (normalizedNewTitle.length < 3 || existing.normalizedName.length < 3) {
                        if (normalizedNewTitle === existing.normalizedName) {
                            bestMatch = existing
                            bestSimilarity = 1.0
                            break
                        }
                        continue
                    }

                    const distance = levenshteinDistance(normalizedNewTitle, existing.normalizedName)
                    const maxLength = Math.max(normalizedNewTitle.length, existing.normalizedName.length)
                    const similarity = 1 - (distance / maxLength)

                    if (similarity > 0.82 && similarity > bestSimilarity) {
                        bestSimilarity = similarity
                        bestMatch = existing
                    }
                }

                if (bestMatch) {
                    out.libraryMatchId = bestMatch.id
                    out.libraryMatchName = bestMatch.name
                    out.similarityScore = bestSimilarity
                }
            }

            return out
        }))

        return NextResponse.json({
            success: true,
            items: processedItems
        })

    } catch (error: unknown) {
        logger.error("[Setlist Importer] Parse Error:", error)
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to parse setlist." },
            { status: 500 }
        )
    }
}
