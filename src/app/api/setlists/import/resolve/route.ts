import { NextResponse } from "next/server"

import { createApiHandler } from "@/lib/api-wrapper"
import { checkRateLimit } from "@/lib/rate-limit"
import {
    SetlistStructureSchema,
    type SetlistStructure,
} from "@/lib/setlist-import/extract-structure"
import { resolveSetlistStructure } from "@/lib/setlist-import/resolve"

// The library fetch can be slow on a large library — parity with the sibling
// import routes (extract-structure / extract-document / parse).
export const maxDuration = 60

/**
 * POST /api/setlists/import/resolve
 *
 * Resolves a v70-05-extracted setlist structure against the library: annotates
 * each track with a fuzzy chart match (`libraryMatch`), a `missingChart` flag,
 * and audio-typed `recordingCandidates`. A pure compute pass — NO Firestore
 * writes; v70-07's commit step does all persistence. Sibling of
 * import/extract-structure + import/extract-document + import/parse.
 *
 * Accepts JSON `{ sections, tracks }` (the extract-structure output shape,
 * validated by SetlistStructureSchema). Any authenticated user may call it
 * (no role gate — matches the sibling import routes).
 */
export const POST = createApiHandler(
    async (ctx) => {
        const limited = await checkRateLimit(ctx.req, 'upload')
        if (limited) return limited

        // ctx.body is schema-validated { sections, tracks }. The Zod-inferred
        // optional fields are `.nullish()` (defensive) where SetlistStructure
        // uses `string | undefined`; resolveSetlistStructure only reads
        // `track.title` and spreads the rest, so the cast is safe.
        const structure = ctx.body as SetlistStructure

        // resolveSetlistStructure never throws — a library-fetch failure is a
        // typed { ok: false } result, so no try/catch is needed here.
        const result = await resolveSetlistStructure(structure)

        if (!result.ok) {
            // library_unavailable — the library index could not be fetched.
            return NextResponse.json({ error: result.message }, { status: 502 })
        }

        return NextResponse.json({
            success: true,
            sections: result.sections,
            tracks: result.tracks,
        })
    },
    { schema: SetlistStructureSchema },
)
