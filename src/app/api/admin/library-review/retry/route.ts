/**
 * POST /api/admin/library-review/retry  body: { rowId: string, kind: 'enrichment' | 'import' }
 *
 * `enrichment`: rewinds the retry queue doc to attempts=0 / nextRetryAt=now.
 *               Next 30-min cron tick re-enqueues the AI call.
 * `import`:     deletes the chartImportQueue doc. Next 5-min drive-sync tick
 *               re-attempts the import fresh (attemptCount resets to 1).
 */

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { httpError } from "@/lib/http/error-envelope"
import { requireAdmin } from "@/lib/http/admin-gate"
import { zodFormatter } from "@/lib/mcp/error-envelopes"
import { retryFailed } from "@/lib/library/review-queue"
import { logger } from "@/lib/logger"

export const dynamic = "force-dynamic"
export const maxDuration = 30

const BodySchema = z.object({
    rowId: z.string().min(1, "rowId is required."),
    kind: z.enum(["enrichment", "import"]),
})

export async function POST(req: NextRequest) {
    const gate = await requireAdmin(req)
    if (!gate.ok) return gate.response

    let parsed: z.infer<typeof BodySchema>
    try {
        const body = await req.json()
        const result = BodySchema.safeParse(body)
        if (!result.success) {
            return NextResponse.json(
                zodFormatter(result.error, "library-review/retry"),
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
        const result = await retryFailed(
            getFirestore(),
            parsed.rowId,
            parsed.kind,
            gate.auth.uid,
        )
        if (!result.ok) {
            return httpError(
                result.code === "queue_doc_missing" ? 404 : 400,
                result.code,
                result.message,
                { rowId: parsed.rowId, kind: parsed.kind },
            )
        }
        return NextResponse.json(result)
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        logger.error(`[library-review/retry] failed: ${message}`)
        return httpError(500, "server_error", "Failed to retry.", {
            rowId: parsed.rowId,
            kind: parsed.kind,
            detail: message,
        })
    }
}
