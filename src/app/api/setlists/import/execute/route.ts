import { NextResponse } from "next/server"
import { z } from "zod"
import { createApiHandler } from "@/lib/api-wrapper"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { checkRateLimit } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"
import {
    ParsedItemSchema,
    executeSetlistImport,
    type ParsedItem,
} from "@/lib/setlist-import-execute"

export const maxDuration = 60 // Allow up to 60s for Vercel downloads

// Body schema lives alongside the route since `createApiHandler` consumes it.
// The per-row processing + setlist write are in @/lib/setlist-import-execute
// — Next.js App Router forbids non-handler exports from a route.ts file (see
// [[feedback_nextjs_route_exports]]), so the testable helper is in a
// dedicated lib module.
const schema = z.object({
    items: z.array(ParsedItemSchema).min(1),
    name: z.string().optional(),
})

export const POST = createApiHandler(
    async (ctx) => {
        const limited = await checkRateLimit(ctx.req, 'upload')
        if (limited) return limited

        const items: ParsedItem[] = ctx.body!.items || []
        const setName = ctx.body!.name || "Imported Setlist"

        if (!initAdmin()) {
            return NextResponse.json(
                { error: "Server not ready", code: "FIREBASE_NOT_INITIALIZED" },
                { status: 500 },
            )
        }
        const db = getFirestore()

        // F-3 (setlist-import-via-pcu-with-defaults-mirror lane): the per-row
        // resolution loop and `library_index`/`songs` writes are now owned by
        // `executeSetlistImport`, which routes Drive-downloaded bytes through
        // `processChartUpload` instead of writing a divergent 11-field
        // `library_index` literal directly. This inherits the canonical
        // upload contracts (atomic-guard, sibling-recount, library_signals
        // broadcast, library.row.created emit) and the F-5 `songs/{id}.defaults`
        // mirror added inside PCU on this lane. Per-row PCU outcomes
        // (`imported` / `duplicate` / `drive-failed` / `process-failed` /
        // `matched-library`) are surfaced in `importOutcomes` so a single
        // duplicate doesn't fail-stop a multi-chart import.
        const { setlistId, importOutcomes } = await executeSetlistImport({
            db,
            items,
            setName,
            uploaderUid: ctx.auth.uid,
            uploaderEmail: ctx.auth.email,
        })

        logger.info(
            `[Setlist Importer] Importer generated setlist ${setlistId} (` +
                `imported=${importOutcomes.filter((o) => o.status === 'imported').length}, ` +
                `duplicate=${importOutcomes.filter((o) => o.status === 'duplicate').length}, ` +
                `matched=${importOutcomes.filter((o) => o.status === 'matched-library').length}, ` +
                `drive-failed=${importOutcomes.filter((o) => o.status === 'drive-failed').length}, ` +
                `process-failed=${importOutcomes.filter((o) => o.status === 'process-failed').length})`,
        )

        return NextResponse.json(
            {
                success: true,
                setlistId,
                message: "Import executed successfully.",
                importOutcomes,
            },
            { status: 201 },
        )
    },
    { role: 'band_leader', schema },
)
