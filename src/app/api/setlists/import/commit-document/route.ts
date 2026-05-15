import { NextResponse } from "next/server"
import { z } from "zod"

import { createApiHandler } from "@/lib/api-wrapper"
import { checkRateLimit } from "@/lib/rate-limit"
import { commitDocumentSetlist } from "@/lib/setlist-import/commit"
import {
    SectionSchema,
    type SetlistSection,
} from "@/lib/setlist-import/extract-structure"
import {
    ResolvedTrackSchema,
    type ResolvedTrack,
} from "@/lib/setlist-import/resolve"
import { logger } from "@/lib/logger"
import type { Setlist } from "@/types/models"

// Explicit duration ceiling — parity with the sibling import routes (v70-08-04).
export const maxDuration = 30

// Inbound payload is the resolve route's output shape + interview metadata.
// sections / tracks are validated against the real resolve-output schemas
// (v70-08-02) — no z.array(z.any()) escape hatch.
const schema = z.object({
    name: z.string().min(1),
    eventDate: z
        .string()
        .refine((s) => !Number.isNaN(Date.parse(s)), 'invalid date'),
    serviceType: z.string().optional(),
    rabbi: z.string().optional(),
    sections: z.array(SectionSchema),
    tracks: z.array(ResolvedTrackSchema),
})

/**
 * POST /api/setlists/import/commit-document
 *
 * Commits a v70-06-resolved { sections, tracks } structure + interview metadata
 * as a real setlist. Delegates to commitDocumentSetlist (flatten the structure
 * — interleaved section headers, matched charts bound — then persist via
 * createSetlistServerSide). The final step of v7.0 doc-driven setlist creation;
 * sibling of import/extract-document + extract-structure + resolve + execute.
 *
 * Accepts JSON { name, eventDate, serviceType?, rabbi?, sections, tracks }.
 * band_leader only — creating a setlist, consistent with import/execute.
 * maxDuration = 30 (parity with the sibling import routes); the actual work is
 * a single atomic Firestore batch (createSetlistServerSide).
 */
export const POST = createApiHandler(
    async (ctx) => {
        const limited = await checkRateLimit(ctx.req, 'upload')
        if (limited) return limited

        const body = ctx.body!
        const { setlistId, trackCount } = await commitDocumentSetlist({
            name: body.name,
            ownerId: ctx.auth.uid,
            ownerName: ctx.auth.email || "Unknown",
            eventDate: body.eventDate,
            serviceType: body.serviceType as Setlist['templateType'] | undefined,
            rabbi: body.rabbi,
            sections: body.sections as SetlistSection[],
            tracks: body.tracks as ResolvedTrack[],
        })

        logger.info(
            `[Doc Import] Committed setlist ${setlistId} with ${trackCount} tracks.`,
        )

        return NextResponse.json(
            { success: true, setlistId },
            { status: 201 },
        )
    },
    { role: 'band_leader', schema },
)
