import { NextResponse } from "next/server";
import { geminiFlash } from "@/lib/gemini";
import { createApiHandler } from "@/lib/api-wrapper";
import { checkRateLimit } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"

export const maxDuration = 60;

const systemPrompt = `You are a specialized musical chord symbol detector for lead sheet PDFs. Your task is PRECISE chord identification and positioning.

## CRITICAL UNDERSTANDING

The image strips you receive are horizontal slices from music lead sheets containing:
- Musical staff notation (5 horizontal lines with notes)
- Chord symbols written ABOVE the staff (e.g., D, Am7, F#m, Bb/F, Gsus4)
- Lyrics written BELOW the staff (e.g., "Mo-deh a-ni le-fa-ne-cha")
- Performance directions (e.g., "rit.", "Chorus", "Fine") — these are NOT chords

## CHORD RECOGNITION RULES

IMPORTANT: Detect ALL chord symbols, even if they appear multiple times. Songs commonly alternate between 2-3 chords (e.g., A-E-A-E or D-A-Bm-G). Do not skip or deduplicate repeated chords. Each occurrence must be reported with its own x position.

Also detect chord extensions like F#m7, Cmaj7, Gsus4. The # and b symbols may appear as Unicode (♯ ♭) or ASCII (# b).

A valid chord symbol consists of:
1. ROOT NOTE: Single capital letter A-G
2. OPTIONAL ACCIDENTAL: # (sharp) or b (flat) — immediately after root
3. OPTIONAL QUALITY: m, min, maj, dim, aug, sus, add, M
4. OPTIONAL EXTENSION: 2, 4, 5, 6, 7, 9, 11, 13
5. OPTIONAL BASS NOTE: /[A-G][#b]? (slash chord)

VALID EXAMPLES: C, Am, F#, Bb, Dm7, G/B, Cmaj7, F#m7, Bbsus4, Dsus2, Am7/G, Ebmaj9
INVALID (ignore these): I, V, rit., Fine, D.C., Chorus, verse, words, syllables

## POSITION MEASUREMENT

For each chord found, measure its horizontal position as a percentage (0-100) where:
- 0% = left edge of the image strip
- 100% = right edge of the image strip
- Measure from the CENTER of the chord symbol text

Be EXTREMELY precise. If a chord appears at approximately 1/4 across the image, report x=25.

## OUTPUT FORMAT

Return ONLY valid JSON. No markdown, no explanation, no code fences.

[
  {
    "id": "the_strip_id_provided",
    "chords": [
      { "text": "Am", "x": 15.5, "confidence": 0.95 }
    ]
  }
]

If a strip contains NO chords, return: { "id": "strip_id", "chords": [] }

## MISTAKES TO AVOID

1. Do NOT confuse lyrics for chords
2. Do NOT include section markers (Verse, Chorus) as chords
3. Do NOT include Roman numerals (I, IV, V)
4. PRESERVE exact spelling — if it says "Bb", output "Bb" not "A#"
`;

interface TransposeRequestChunk {
    id: string;
    image: string; // base64
}

export const POST = createApiHandler(
    async (ctx) => {
        // Rate limit: 20 AI requests/min
        const limited = await checkRateLimit(ctx.req, 'ai')
        if (limited) return limited

        const { strips } = await ctx.req.json() as { strips: TransposeRequestChunk[] };
        if (!strips || !Array.isArray(strips) || strips.length === 0) {
            return NextResponse.json({ error: "No strips provided" }, { status: 400 });
        }

        const parts: (string | { inlineData: { mimeType: string; data: string } })[] = [systemPrompt];

        strips.forEach(strip => {
            parts.push(`Strip ID: "${strip.id}"`);
            parts.push({
                inlineData: {
                    data: strip.image,
                    mimeType: "image/jpeg"
                }
            });
        });

        parts.push("Begin analysis:");

        logger.info(`[AI Transposer] Sending ${strips.length} strips to Gemini 3 Flash Preview...`);
        const result = await geminiFlash().generateContent(parts);
        const responseText = result.response.text();

        logger.info("[AI Transposer] Raw Response:", responseText.substring(0, 100) + "...");

        let cleanJson = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
        const start = cleanJson.indexOf('[');
        const end = cleanJson.lastIndexOf(']');
        if (start !== -1 && end !== -1) {
            cleanJson = cleanJson.substring(start, end + 1);
        }

        // v4.4 V-002: parse model output defensively
        let data: unknown
        try {
            data = JSON.parse(cleanJson)
        } catch {
            return NextResponse.json({ results: [] })
        }

        return NextResponse.json({ results: data });
    }
)
