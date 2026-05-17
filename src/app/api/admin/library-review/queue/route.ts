/**
 * Cycle-3 NEW-4 (A4) — GET /api/admin/library-review/queue
 *
 * Returns the three review queues (AI review_pending, AI failed,
 * chartImportQueue) plus the aiConfig calibration banner state.
 * Admin-gated; reads are exclusively via Admin SDK because
 * `firestore.rules` blocks browser access to `library_index`,
 * `aiEnrichmentRetryQueue`, and `chartImportQueue`.
 */

import { NextRequest, NextResponse } from "next/server"

import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { httpError } from "@/lib/http/error-envelope"
import { requireAdmin } from "@/lib/http/admin-gate"
import { readReviewQueue } from "@/lib/library/review-queue"
import { logger } from "@/lib/logger"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(req: NextRequest) {
    const gate = await requireAdmin(req)
    if (!gate.ok) return gate.response

    if (!initAdmin()) {
        return httpError(
            500,
            "server_error",
            "Firebase Admin not initialized.",
        )
    }

    try {
        const result = await readReviewQueue(getFirestore())
        return NextResponse.json({ ok: true, ...result })
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        logger.error(`[library-review/queue] read failed: ${message}`)
        return httpError(
            500,
            "server_error",
            "Failed to load review queue.",
            { detail: message },
            "Retry shortly. If the failure persists, check the AI enrichment subscriber + drive-sync poller logs.",
        )
    }
}
