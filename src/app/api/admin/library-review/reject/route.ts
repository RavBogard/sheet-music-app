/**
 * POST /api/admin/library-review/reject  body: { rowId: string }
 *
 * Leaves library_index row at its raw metadata + sets
 * `enrichmentStatus: 'human_rejected'`. Idempotent.
 */

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { httpError } from "@/lib/http/error-envelope"
import { requireAdmin } from "@/lib/http/admin-gate"
import { zodFormatter } from "@/lib/mcp/error-envelopes"
import { rejectEnrichment } from "@/lib/library/review-queue"
import { logger } from "@/lib/logger"

export const dynamic = "force-dynamic"
export const maxDuration = 30

const BodySchema = z.object({
    rowId: z.string().min(1, "rowId is required."),
})

export async function POST(req: NextRequest) {
    const gate = await requireAdmin(req)
    if (!gate.ok) return gate.response

    let parsed: { rowId: string }
    try {
        const body = await req.json()
        const result = BodySchema.safeParse(body)
        if (!result.success) {
            return NextResponse.json(
                zodFormatter(result.error, "library-review/reject"),
                { status: 400 },
            )
        }
        parsed = result.data
    } catch {
        return httpError(400, "invalid_argument", "Request body must be JSON.")
    }

    if (!initAdmin()) {
        return httpError(500, "server_error", "Firebase Admin not initialized.")
    }

    try {
        const result = await rejectEnrichment(
            getFirestore(),
            parsed.rowId,
            gate.auth.uid,
        )
        if (!result.ok) {
            return httpError(
                result.code === "row_not_found" ? 404 : 400,
                result.code,
                result.message,
                { rowId: parsed.rowId },
            )
        }
        return NextResponse.json(result)
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        logger.error(`[library-review/reject] failed: ${message}`)
        return httpError(
            500,
            "server_error",
            "Failed to reject enrichment.",
            { rowId: parsed.rowId, detail: message },
        )
    }
}
