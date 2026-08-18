/**
 * POST /api/admin/library-review/edit
 *   body: { rowId: string, edits: { title?, collection?, key?, bpm?, leadMusician?, tags? } }
 *
 * Applies operator edits + sets `enrichmentStatus: 'human_curated'`.
 * `collection` IS settable here (operator override of David's subfolder
 * routing is permitted from the review UI even though AI cannot).
 */

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { httpError } from "@/lib/http/error-envelope"
import { requireAdmin } from "@/lib/http/admin-gate"
import { zodFormatter } from "@/lib/mcp/error-envelopes"
import { editEnrichment } from "@/lib/library/review-queue"
import { logger } from "@/lib/logger"

export const dynamic = "force-dynamic"
export const maxDuration = 30

const EditsSchema = z
    .object({
        title: z.string().min(1).optional(),
        collection: z.enum(["core", "supplemental", "uploads", "nava"]).optional(),
        key: z.string().optional(),
        bpm: z.number().positive().nullable().optional(),
        leadMusician: z.string().optional(),
        tags: z.array(z.string()).optional(),
    })
    .refine(
        (e) =>
            e.title !== undefined ||
            e.collection !== undefined ||
            e.key !== undefined ||
            e.bpm !== undefined ||
            e.leadMusician !== undefined ||
            e.tags !== undefined,
        { message: "edits must include at least one field." },
    )

const BodySchema = z.object({
    rowId: z.string().min(1, "rowId is required."),
    edits: EditsSchema,
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
                zodFormatter(result.error, "library-review/edit"),
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
        const result = await editEnrichment(
            getFirestore(),
            parsed.rowId,
            parsed.edits,
            gate.auth.uid,
        )
        if (!result.ok) {
            const status =
                result.code === "row_not_found"
                    ? 404
                    : result.code === "invalid_field"
                      ? 400
                      : 400
            return httpError(status, result.code, result.message, {
                rowId: parsed.rowId,
            })
        }
        return NextResponse.json(result)
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        logger.error(`[library-review/edit] failed: ${message}`)
        return httpError(500, "server_error", "Failed to edit row.", {
            rowId: parsed.rowId,
            detail: message,
        })
    }
}
