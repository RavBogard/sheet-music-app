import { NextRequest, NextResponse } from "next/server"
import { geminiFlash } from "@/lib/gemini"
import { withAuth } from "@/lib/api-auth"
import { checkRateLimit } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"

export const maxDuration = 60

const SYSTEM_PROMPT = `You are a musical chord symbol detector for lead sheet PDFs. You receive a full-page image of a lead sheet plus a list of chords already detected by a text scanner.

Your job:
1. Identify ALL chord symbols visible on this page
2. Return the COMPLETE list — every chord, with its position

## Chord Recognition
A valid chord: root note (A-G) + optional accidental (#/b) + optional quality (m, maj, dim, aug, sus, add) + optional extension (2,4,5,6,7,9,11,13) + optional bass (/X)
VALID: C, Am, F#, Bb, Dm7, G/B, Cmaj7, F#m7, Bbsus4, Ebmaj9
INVALID: I, V, rit., Fine, D.C., Chorus, verse, lyrics, syllables

## Position
x = horizontal position as percentage (0=left edge, 100=right edge), measured from center of chord text
y = vertical position as percentage (0=top edge, 100=bottom edge), measured from center of chord text

## Output
Return ONLY valid JSON, no markdown fences:
[{ "text": "Am", "x": 15.5, "y": 12.3 }, ...]

If no chords found, return: []
`

export async function POST(req: NextRequest) {
    try {
        const limited = await checkRateLimit(req, 'ai')
        if (limited) return limited

        const auth = await withAuth(req)
        if (auth instanceof NextResponse) return auth

        const { image, existingChords } = await req.json() as {
            image: string // base64 JPEG
            existingChords: { text: string; x: number; y: number }[]
        }

        if (!image) {
            return NextResponse.json({ error: "No image provided" }, { status: 400 })
        }

        // Build context about what we already found
        const existingList = existingChords?.length > 0
            ? `\n\nI already detected these chords from the text layer:\n${existingChords.map(c => `- "${c.text}" at x≈${Math.round(c.x)}%, y≈${Math.round(c.y)}%`).join('\n')}\n\nPlease verify these and add any I missed. Include ALL chords on the page.`
            : '\n\nNo chords were detected from the text layer. Please identify all chord symbols on this page.'

        const parts: (string | { inlineData: { mimeType: string; data: string } })[] = [
            SYSTEM_PROMPT + existingList,
            {
                inlineData: {
                    data: image,
                    mimeType: "image/jpeg"
                }
            },
            "Return the complete list of chords as JSON:"
        ]

        logger.info(`[AI Chord Validate] Sending full-page image with ${existingChords?.length || 0} existing chords`)

        const result = await geminiFlash().generateContent(parts)
        const responseText = result.response.text()

        logger.info("[AI Chord Validate] Response:", responseText.substring(0, 200) + "...")

        // Parse JSON
        let cleanJson = responseText.replace(/```json/g, "").replace(/```/g, "").trim()
        const start = cleanJson.indexOf('[')
        const end = cleanJson.lastIndexOf(']')
        if (start !== -1 && end !== -1) {
            cleanJson = cleanJson.substring(start, end + 1)
        }

        const chords = JSON.parse(cleanJson) as { text: string; x: number; y: number }[]

        // Validate structure
        const validChords = chords.filter(c =>
            c && typeof c.text === 'string' && c.text.length > 0 &&
            typeof c.x === 'number' && typeof c.y === 'number' &&
            c.x >= 0 && c.x <= 100 && c.y >= 0 && c.y <= 100
        )

        return NextResponse.json({ chords: validChords })
    } catch (error: unknown) {
        logger.error("[AI Chord Validate] Error:", error)
        return NextResponse.json(
            { error: "Failed to validate chords" },
            { status: 500 }
        )
    }
}
