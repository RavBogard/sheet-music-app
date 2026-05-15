import { NextResponse } from "next/server"
import { z } from "zod"

import { createApiHandler } from "@/lib/api-wrapper"
import { checkRateLimit } from "@/lib/rate-limit"
import { extractSetlistStructure } from "@/lib/setlist-import/extract-structure"

// Gemini structured extraction can be slow — matches import/parse +
// import/extract-document.
export const maxDuration = 60

const schema = z.object({ text: z.string() })

/**
 * POST /api/setlists/import/extract-structure
 *
 * Takes the raw text produced by /api/setlists/import/extract-document and asks
 * Gemini to return a Zod-validated structured setlist shape
 * { sections[], tracks[] }. The AI structure pass of v7.0 doc-driven setlist
 * creation — it does NOT resolve tracks against the library/recordings (v70-06)
 * and does NOT persist anything (v70-07). Sibling of import/extract-document +
 * import/parse + import/execute.
 *
 * Accepts JSON { text: string }. band_leader only — the whole doc-import
 * pipeline is a band-leader feature (consistent with commit-document + execute);
 * it drives billed Gemini calls. Malformed/empty extractions return 422 with the
 * raw Gemini output so a human can review what the model produced.
 */
export const POST = createApiHandler(
    async (ctx) => {
        const limited = await checkRateLimit(ctx.req, 'upload')
        if (limited) return limited

        const { text } = ctx.body!

        // Defensive — the schema permits an empty string.
        if (!text || !text.trim()) {
            return NextResponse.json({ error: "No text provided" }, { status: 400 })
        }

        // extractSetlistStructure never throws — every failure mode is a typed
        // { ok: false } result, so no try/catch is needed here.
        const result = await extractSetlistStructure(text)

        if (!result.ok) {
            if (result.reason === 'gemini_error') {
                // Upstream AI service failure — 502 Bad Gateway.
                return NextResponse.json({ error: result.message }, { status: 502 })
            }
            // malformed / empty — the document was extracted but the model
            // output could not be structured. 422 + raw output for human review.
            return NextResponse.json(
                { error: result.message, raw: result.raw },
                { status: 422 },
            )
        }

        return NextResponse.json({
            success: true,
            sections: result.sections,
            tracks: result.tracks,
        })
    },
    { role: 'band_leader', schema },
)
